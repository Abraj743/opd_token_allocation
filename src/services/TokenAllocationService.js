const BaseService = require('./BaseService');
const { globalAuditLogger, AUDIT_EVENT_TYPES, AUDIT_SEVERITY } = require('../utils/auditLogger');
const { TokenConcurrencyManager } = require('../utils/concurrencyControl');


class TokenAllocationService extends BaseService {
  constructor({ tokenRepository, slotRepository, priorityCalculationService, slotManagementService, doctorRepository, slotGenerationService, logger }) {
    super({ logger });
    this.tokenRepository = tokenRepository;
    this.slotRepository = slotRepository;
    this.priorityCalculationService = priorityCalculationService;
    this.slotManagementService = slotManagementService;
    this.doctorRepository = doctorRepository;
    this.slotGenerationService = slotGenerationService;
    
    // Initialize concurrency manager
    this.concurrencyManager = new TokenConcurrencyManager(
      tokenRepository,
      slotRepository,
      {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffFactor: 2,
        jitter: true
      }
    );
    
    // Cleanup stale operations every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.concurrencyManager.cleanupStaleOperations();
    }, 300000);
  }

  
  async allocateToken(request) {
    try {
      this.validateRequired(request, ['patientId', 'source']);
      
      const { 
        patientId, 
        department, 
        doctorId, 
        slotId, 
        preferredDate,
        source, 
        patientInfo = {}, 
        waitingTime = 0, 
        bypassConcurrencyControl = false 
      } = request;

      // Validate that either department or both doctorId and slotId are provided
      if (!department && (!doctorId || !slotId)) {
        return this.createErrorResponse(
          'INVALID_ALLOCATION_REQUEST',
          'Either department (for smart allocation) or both doctorId and slotId must be provided',
          { patientId, department, doctorId, slotId },
          ['Provide department for smart allocation', 'Provide both doctorId and slotId for specific allocation']
        );
      }

      // Step 0: Check for duplicate token allocation
      const duplicateCheck = await this.checkForDuplicateAllocation(patientId, doctorId, slotId, preferredDate);
      if (!duplicateCheck.success) {
        return duplicateCheck;
      }

      // Handle follow-up patient doctor continuity
      if (source === 'followup' && patientInfo.lastVisitedDoctor && patientInfo.lastVisitedDoctor !== doctorId) {
        this.logger.info(`Follow-up patient ${patientId} requesting different doctor. Last visited: ${patientInfo.lastVisitedDoctor}, Requested: ${doctorId}`);
        
        // Check if the last visited doctor has available slots
        const continuityResult = await this.checkDoctorContinuityOptions(patientId, patientInfo.lastVisitedDoctor, slotId);
        if (continuityResult.success && continuityResult.data.hasAlternatives) {
          return this.createErrorResponse(
            'DOCTOR_CONTINUITY_RECOMMENDED',
            'For follow-up visits, we recommend seeing the same doctor for better continuity of care',
            {
              lastVisitedDoctor: patientInfo.lastVisitedDoctor,
              requestedDoctor: doctorId,
              alternativeSlots: continuityResult.data.alternativeSlots
            },
            [
              'Choose a slot with your previous doctor for better care continuity',
              'Continue with current doctor selection if preferred'
            ]
          );
        }
      }

      // Calculate priority for the new token
      const priorityResult = await this.priorityCalculationService.calculatePriority(
        source, patientInfo, waitingTime
      );

      if (!priorityResult.success) {
        return priorityResult;
      }

      const newTokenPriority = priorityResult.data.finalPriority;

      // Choose allocation strategy
      if (department) {
        
        return await this.allocateTokenByDepartment(request, newTokenPriority);
      } else {
        return await this.allocateWithComplexLogic(request, newTokenPriority);
      }

    } catch (error) {
      this.logger.error('Error in allocateToken:', error.message);
      
      if (error.code === 'VALIDATION_ERROR') {
        return this.createErrorResponse(
          'VALIDATION_ERROR',
          error.message,
          { error: error.message },
          ['Check required parameters', 'Ensure all fields are provided']
        );
      }
      
      return this.createErrorResponse(
        'ALLOCATION_ERROR',
        'Failed to allocate token',
        { error: error.message },
        ['Try again later', 'Contact support']
      );
    }
  }

  
  async allocateTokenByDepartment(request, priority) {
    const { 
      patientId, 
      department, 
      doctorId, 
      slotId, 
      preferredDate,
      source, 
      patientInfo = {}, 
      waitingTime = 0 
    } = request;

    try {
      this.logger.info(`Starting allocateTokenByDepartment for patient ${patientId} in ${department} department`);
      
      // Find the best slot using department-based logic
      this.logger.info(`Calling selectSlotByDepartment with params:`, { department, doctorId, slotId, preferredDate });
      const slotSelectionResult = await this.selectSlotByDepartment(
        department, 
        doctorId, 
        slotId, 
        preferredDate
      );
      
      this.logger.info(`selectSlotByDepartment result:`, { 
        success: slotSelectionResult.success, 
        message: slotSelectionResult.message,
        hasData: !!slotSelectionResult.data 
      });
      
      if (!slotSelectionResult.success) {
        this.logger.error(`Slot selection failed:`, slotSelectionResult);
        return slotSelectionResult;
      }

      const selectedSlot = slotSelectionResult.data.selectedSlot;
      const selectedDoctorId = slotSelectionResult.data.selectedDoctorId;
      const allocationMethod = slotSelectionResult.data.method;

      this.logger.info(`Selected slot: ${selectedSlot.slotId} for doctor: ${selectedDoctorId} using method: ${allocationMethod}`);

      // Perform the allocation
      this.logger.info(`Calling allocateDirectlyInternal with params:`, { 
        patientId, 
        selectedDoctorId, 
        slotId: selectedSlot.slotId, 
        source, 
        priority 
      });
      
      const allocationResult = await this.allocateDirectlyInternal(
        patientId, 
        selectedDoctorId, 
        selectedSlot.slotId, 
        source, 
        priority, 
        patientInfo, 
        waitingTime
      );

      this.logger.info(`allocateDirectlyInternal result:`, { 
        success: allocationResult.success, 
        message: allocationResult.message 
      });

      //  Add department allocation info to response
      if (allocationResult.success) {
        allocationResult.data.departmentAllocation = {
          department,
          selectedDoctorId,
          allocationMethod,
          reason: slotSelectionResult.message
        };
        this.logger.info(`Department-based allocation successful for patient ${patientId}`);
      } else {
        this.logger.error(`allocateDirectlyInternal failed:`, allocationResult);
      }

      return allocationResult;

    } catch (error) {
      this.logger.error('Error in allocateTokenByDepartment:', error);
      this.logger.error('Error stack:', error.stack);
      return this.createErrorResponse(
        'DEPARTMENT_ALLOCATION_FAILED',
        'Failed to allocate token using department-based allocation',
        { department, error: error.message, stack: error.stack },
        ['Try specific doctor allocation', 'Contact support']
      );
    }
  }

  
  async selectSlotByDepartment(department, preferredDoctorId = null, preferredSlotId = null, preferredDate = null) {
    try {
      const searchDate = preferredDate ? new Date(preferredDate) : new Date();
      searchDate.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(searchDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      this.logger.info(`Department-based allocation for ${department}, searchDate: ${searchDate.toISOString()}`);

      //  If specific slot is preferred, try it first
      if (preferredSlotId) {
        this.logger.info(`Checking preferred slot: ${preferredSlotId}`);
        const preferredSlot = await this.slotRepository.findBySlotId(preferredSlotId);
        
        if (preferredSlot && preferredSlot.status === 'active') {
          // Check if slot belongs to the department and has capacity
          const slotDepartment = preferredSlot.specialty || 'general';
          if (slotDepartment === department || department === 'general') {
            const hasCapacity = await this.checkSlotCapacity(preferredSlot);
            if (hasCapacity) {
              return this.createSuccessResponse({
                selectedSlot: preferredSlot,
                selectedDoctorId: preferredSlot.doctorId,
                method: 'preferred_slot',
                reason: 'preferred_slot_available'
              }, 'Using preferred slot');
            }
          }
        }
      }

      // If specific doctor is preferred, try their slots first
      if (preferredDoctorId) {
        this.logger.info(`Checking preferred doctor: ${preferredDoctorId}`);
        const doctorSlotsResult = await this.findAvailableSlotsForDoctor(preferredDoctorId, searchDate, endOfDay);
        if (doctorSlotsResult.success && doctorSlotsResult.data.slots.length > 0) {
          return this.createSuccessResponse({
            selectedSlot: doctorSlotsResult.data.slots[0],
            selectedDoctorId: preferredDoctorId,
            method: 'preferred_doctor',
            reason: 'preferred_doctor_available'
          }, 'Using preferred doctor slot');
        }
      }

      // Find all doctors in the department
      this.logger.info(`Finding doctors in department: ${department}`);
      const departmentDoctors = await this.getDoctorsByDepartment(department);
      this.logger.info(`Found ${departmentDoctors.length} doctors in ${department} department`);
      
      if (departmentDoctors.length === 0) {
        return this.createErrorResponse(
          'NO_DOCTORS_IN_DEPARTMENT',
          `No doctors found in ${department} department`,
          { department },
          ['Check department name', 'Contact hospital administration', 'Try different department']
        );
      }

      // Find available slots for the preferred date
      this.logger.info(`Finding slots for date range: ${searchDate.toISOString()} to ${endOfDay.toISOString()}`);
      const todaySlots = await this.findDepartmentSlotsForDate(departmentDoctors, searchDate, endOfDay);
      this.logger.info(`Found ${todaySlots.length} slots for today`);
      
      if (todaySlots.length > 0) {
        // Sort by doctor workload (least loaded first)
        this.logger.info(`Adding workload info to ${todaySlots.length} slots`);
        const slotsWithWorkload = await this.addWorkloadInfoToSlots(todaySlots);
        this.logger.info(`Received ${slotsWithWorkload.length} slots with workload`);
        
        if (slotsWithWorkload.length === 0) {
          this.logger.error(`No slots returned from addWorkloadInfoToSlots!`);
          return this.createErrorResponse('NO_SLOTS_WITH_WORKLOAD', 'Failed to calculate workload for slots');
        }
        
        this.logger.info(`Sorting slots by workload`);
        const validSlots = slotsWithWorkload.filter(slot => {
          const isValid = slot && slot.slotId && slot.doctorId;
          if (!isValid) {
            this.logger.error(`Invalid slot found:`, { slot, hasSlotId: !!slot?.slotId, hasDoctorId: !!slot?.doctorId });
          }
          return isValid;
        });
        
        if (validSlots.length === 0) {
          this.logger.error(`No valid slots after filtering!`);
          return this.createErrorResponse('NO_VALID_SLOTS', 'No valid slots found after workload calculation');
        }
        
        validSlots.sort((a, b) => {
          const aPatients = a.doctorWorkload?.currentPatients ?? 999;
          const bPatients = b.doctorWorkload?.currentPatients ?? 999;
          this.logger.info(`Comparing slots: ${a.slotId} (${aPatients} patients) vs ${b.slotId} (${bPatients} patients)`);
          return aPatients - bPatients;
        });
        
        const selectedSlot = validSlots[0];
        this.logger.info(`Selected slot after sorting:`, { 
          slotId: selectedSlot?.slotId, 
          doctorId: selectedSlot?.doctorId,
          workload: selectedSlot?.doctorWorkload,
          isSlotObject: typeof selectedSlot === 'object',
          slotKeys: selectedSlot ? Object.keys(selectedSlot) : 'no keys'
        });
        
        if (!selectedSlot) {
          this.logger.error(`Selected slot is undefined after sorting!`);
          return this.createErrorResponse('SLOT_SELECTION_ERROR', 'Failed to select slot after sorting');
        }
        
        return this.createSuccessResponse({
          selectedSlot: selectedSlot,
          selectedDoctorId: selectedSlot.doctorId,
          method: 'least_loaded_doctor',
          reason: 'selected_least_loaded_doctor_for_date',
          doctorWorkload: selectedSlot.doctorWorkload
        }, `Selected least loaded doctor in ${department} department for ${searchDate.toDateString()}`);
      }

      // No slots available for preferred date - auto-generate and find next available
      this.logger.info(`No slots found for ${searchDate.toDateString()}, looking for future dates with auto-generation`);
      
      // Try to find or generate slots for the next available dates
      const nextAvailableResult = await this.findOrGenerateNextAvailableSlot(
        departmentDoctors, 
        searchDate, 
        department,
        30 // Look up to 30 days ahead
      );
      
      this.logger.info(`findOrGenerateNextAvailableSlot result:`, { 
        success: nextAvailableResult.success, 
        message: nextAvailableResult.message,
        hasData: !!nextAvailableResult.data 
      });
      
      if (nextAvailableResult.success) {
        const selectedSlot = nextAvailableResult.data.selectedSlot;
        const selectedDoctorId = nextAvailableResult.data.selectedDoctorId;
        const allocatedDate = nextAvailableResult.data.allocatedDate;
        const wasGenerated = nextAvailableResult.data.wasGenerated;
        
        return this.createSuccessResponse({
          selectedSlot: selectedSlot,
          selectedDoctorId: selectedDoctorId,
          method: 'auto_generated_next_available',
          reason: 'auto_generated_and_allocated_next_available_date',
          originalRequestedDate: searchDate.toDateString(),
          allocatedDate: allocatedDate,
          wasGenerated: wasGenerated
        }, `Auto-generated and allocated slot for ${allocatedDate} in ${department} department`);
      }

      // No availability in near future
      return this.createErrorResponse(
        'NO_AVAILABILITY_IN_DEPARTMENT',
        `No slots available in ${department} department for the next 14 days`,
        {
          department,
          searchPeriod: '14 days',
          totalDoctorsInDepartment: departmentDoctors.length
        },
        [
          'Try a different department',
          'Contact hospital administration',
          'Consider teleconsultation if available'
        ]
      );

    } catch (error) {
      this.logger.error('Error in selectSlotByDepartment:', error);
      return this.createErrorResponse(
        'SLOT_SELECTION_ERROR',
        'Error occurred while selecting slot by department',
        { department, error: error.message },
        ['Try again', 'Contact system administrator']
      );
    }
  }

  
  async findOrGenerateNextAvailableSlot(doctors, startDate, department, maxDaysAhead = 30) {
    this.logger.info(`findOrGenerateNextAvailableSlot: Searching for ${doctors.length} doctors in ${department} department, starting from ${startDate.toDateString()}, up to ${maxDaysAhead} days ahead`);
    
    for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++) {
      const checkDate = new Date(startDate);
      checkDate.setUTCDate(checkDate.getUTCDate() + dayOffset);
      checkDate.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(checkDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      const dateString = checkDate.toDateString();
      this.logger.info(`Checking date: ${dateString} (day offset: ${dayOffset})`);
      
      // Check if slots already exist for this date
      const existingSlots = await this.findDepartmentSlotsForDate(doctors, checkDate, endOfDay);
      
      if (existingSlots.length > 0) {
        this.logger.info(`Found ${existingSlots.length} existing slots for ${dateString}`);
        
        // Sort by doctor workload and return the best slot
        const slotsWithWorkload = await this.addWorkloadInfoToSlots(existingSlots);
        slotsWithWorkload.sort((a, b) => {
          const aPatients = a.doctorWorkload?.currentPatients ?? 999;
          const bPatients = b.doctorWorkload?.currentPatients ?? 999;
          return aPatients - bPatients;
        });
        
        const selectedSlot = slotsWithWorkload[0];
        if (selectedSlot) {
          return this.createSuccessResponse({
            selectedSlot: selectedSlot,
            selectedDoctorId: selectedSlot.doctorId,
            allocatedDate: dateString,
            wasGenerated: false
          }, `Found existing slot for ${dateString}`);
        }
      }
      
      // No existing slots, try to generate slots for this date
      this.logger.info(`No existing slots for ${dateString}, attempting to generate slots`);
      
      try {
        // Generate slots for this specific date
        const generationResult = await this.slotGenerationService.generateSlotsForDate(checkDate);
        
        if (generationResult.success && generationResult.data.generatedSlots > 0) {
          this.logger.info(`Successfully generated ${generationResult.data.generatedSlots} slots for ${dateString}`);
          
          // Now check for available slots again
          const newSlots = await this.findDepartmentSlotsForDate(doctors, checkDate, endOfDay);
          
          if (newSlots.length > 0) {
            this.logger.info(`Found ${newSlots.length} newly generated slots for ${dateString}`);
            
            // Sort by doctor workload and return the best slot
            const slotsWithWorkload = await this.addWorkloadInfoToSlots(newSlots);
            slotsWithWorkload.sort((a, b) => {
              const aPatients = a.doctorWorkload?.currentPatients ?? 999;
              const bPatients = b.doctorWorkload?.currentPatients ?? 999;
              return aPatients - bPatients;
            });
            
            const selectedSlot = slotsWithWorkload[0];
            if (selectedSlot) {
              return this.createSuccessResponse({
                selectedSlot: selectedSlot,
                selectedDoctorId: selectedSlot.doctorId,
                allocatedDate: dateString,
                wasGenerated: true
              }, `Generated and selected slot for ${dateString}`);
            }
          }
        } else {
          this.logger.info(`No slots could be generated for ${dateString} - doctors may not have schedules for this day`);
        }
      } catch (error) {
        this.logger.error(`Error generating slots for ${dateString}:`, error);
        // Continue to next day
      }
    }
    
    // No slots found or generated within the search period
    return this.createErrorResponse(
      'NO_AVAILABILITY_IN_DEPARTMENT',
      `No slots available in ${department} department for the next ${maxDaysAhead} days`,
      { department, searchPeriod: `${maxDaysAhead} days`, startDate: startDate.toDateString() },
      ['Try a different department', 'Contact hospital administration', 'Try again later']
    );
  }

  
  async checkForDuplicateAllocation(patientId, doctorId = null, slotId = null, preferredDate = null) {
    try {
      this.logger.info(`Checking for duplicate allocation for patient: ${patientId}`);
      
      // Get today's date for comparison
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      // If preferred date is provided, use that instead of today
      let searchStartDate = today;
      let searchEndDate = endOfDay;
      
      if (preferredDate) {
        searchStartDate = new Date(preferredDate);
        searchStartDate.setUTCHours(0, 0, 0, 0);
        searchEndDate = new Date(preferredDate);
        searchEndDate.setUTCHours(23, 59, 59, 999);
      }

      // If specific slot is provided, check for existing token in that slot
      if (slotId) {
        this.logger.info(`Checking for existing token in slot: ${slotId}`);
        const existingTokenInSlot = await this.tokenRepository.find({
          patientId,
          slotId,
          status: { $in: ['allocated', 'confirmed'] }
        });

        if (existingTokenInSlot.length > 0) {
          const existingToken = existingTokenInSlot[0];
          return this.createErrorResponse(
            'DUPLICATE_TOKEN_IN_SLOT',
            `Patient already has a token in this slot`,
            {
              patientId,
              slotId,
              existingTokenId: existingToken.tokenId,
              existingTokenNumber: existingToken.tokenNumber,
              tokenStatus: existingToken.status
            },
            [
              'Use existing token',
              'Cancel existing token first if you want to reschedule',
              'Choose a different slot'
            ]
          );
        }
      }

      // If specific doctor is provided, check for existing token with same doctor on same day
      if (doctorId) {
        this.logger.info(`Checking for existing token with doctor: ${doctorId} on date: ${searchStartDate.toDateString()}`);
        const existingTokenWithDoctor = await this.tokenRepository.find({
          patientId,
          doctorId,
          createdAt: { $gte: searchStartDate, $lte: searchEndDate },
          status: { $in: ['allocated', 'confirmed'] }
        });

        if (existingTokenWithDoctor.length > 0) {
          const existingToken = existingTokenWithDoctor[0];
          return this.createErrorResponse(
            'DUPLICATE_TOKEN_WITH_DOCTOR',
            `Patient already has a token with this doctor on the same day`,
            {
              patientId,
              doctorId,
              date: searchStartDate.toDateString(),
              existingTokenId: existingToken.tokenId,
              existingSlotId: existingToken.slotId,
              existingTokenNumber: existingToken.tokenNumber,
              tokenStatus: existingToken.status
            },
            [
              'Use existing token',
              'Cancel existing token first if you want to reschedule',
              'Choose a different doctor or date'
            ]
          );
        }
      }

      // General check - prevent multiple tokens for same patient on same day (regardless of doctor)
      this.logger.info(`Checking for any existing token on date: ${searchStartDate.toDateString()}`);
      const existingTokensOnDate = await this.tokenRepository.find({
        patientId,
        createdAt: { $gte: searchStartDate, $lte: searchEndDate },
        status: { $in: ['allocated', 'confirmed'] }
      });

      if (existingTokensOnDate.length > 0) {
        const existingToken = existingTokensOnDate[0];
        
        // Allow multiple tokens only for emergency cases or if explicitly allowed
        const isEmergency = existingToken.source === 'emergency' || existingToken.priority > 8;
        
        if (!isEmergency) {
          return this.createErrorResponse(
            'DUPLICATE_TOKEN_ON_DATE',
            `Patient already has a token on this date`,
            {
              patientId,
              date: searchStartDate.toDateString(),
              existingTokenId: existingToken.tokenId,
              existingDoctorId: existingToken.doctorId,
              existingSlotId: existingToken.slotId,
              existingTokenNumber: existingToken.tokenNumber,
              tokenStatus: existingToken.status,
              totalTokensOnDate: existingTokensOnDate.length
            },
            [
              'Use existing token',
              'Cancel existing token first if you want to reschedule',
              'Choose a different date',
              'Contact hospital for emergency cases'
            ]
          );
        } else {
          this.logger.info(`Allowing multiple tokens for emergency case: ${existingToken.tokenId}`);
        }
      }

      this.logger.info(`No duplicate tokens found for patient: ${patientId}`);
      return this.createSuccessResponse({}, 'No duplicate allocation found');

    } catch (error) {
      this.logger.error('Error checking for duplicate allocation:', error);
      return this.createErrorResponse(
        'DUPLICATE_CHECK_ERROR',
        'Error occurred while checking for duplicate allocation',
        { patientId, error: error.message },
        ['Try again', 'Contact system administrator']
      );
    }
  }

  
  async checkSlotCapacity(slot) {
    try {
      const currentTokens = await this.tokenRepository.findBySlot(slot.slotId);
      const activeTokens = currentTokens.filter(t => 
        ['allocated', 'confirmed'].includes(t.status)
      );
      return activeTokens.length < slot.maxCapacity;
    } catch (error) {
      this.logger.error('Error checking slot capacity:', error);
      return false;
    }
  }

 
  async findAvailableSlotsForDoctor(doctorId, startDate, endDate) {
    try {
      this.logger.info(`findAvailableSlotsForDoctor: Searching for doctor ${doctorId} between ${startDate.toISOString()} and ${endDate.toISOString()}`);
      
      const doctorSlots = await this.slotRepository.find({
        doctorId,
        date: { $gte: startDate, $lte: endDate },
        status: 'active'
      }, { sort: { startTime: 1 } });

      this.logger.info(`findAvailableSlotsForDoctor: Found ${doctorSlots.length} total slots for doctor ${doctorId}`);

      const availableSlots = [];
      for (const slot of doctorSlots) {
        const hasCapacity = await this.checkSlotCapacity(slot);
        this.logger.info(`Slot ${slot.slotId}: hasCapacity=${hasCapacity}, currentAllocation=${slot.currentAllocation}, maxCapacity=${slot.maxCapacity}`);
        if (hasCapacity) {
          availableSlots.push(slot);
        }
      }

      this.logger.info(`findAvailableSlotsForDoctor: Returning ${availableSlots.length} available slots for doctor ${doctorId}`);
      return this.createSuccessResponse({
        slots: availableSlots
      }, `Found ${availableSlots.length} available slots for doctor`);
    } catch (error) {
      this.logger.error('Error finding available slots for doctor:', error);
      return this.createErrorResponse(
        'DOCTOR_SLOTS_SEARCH_ERROR',
        'Error searching doctor slots',
        { doctorId, error: error.message }
      );
    }
  }

  
  async findDepartmentSlotsForDate(doctors, startDate, endDate) {
    this.logger.info(`findDepartmentSlotsForDate called with ${doctors.length} doctors, date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const allAvailableSlots = [];
    
    for (const doctor of doctors) {
      try {
        this.logger.info(`Finding slots for doctor: ${doctor.doctorId}`);
        const doctorSlotsResult = await this.findAvailableSlotsForDoctor(doctor.doctorId, startDate, endDate);
        this.logger.info(`Doctor ${doctor.doctorId} slots result:`, { 
          success: doctorSlotsResult.success, 
          slotsCount: doctorSlotsResult.success ? doctorSlotsResult.data.slots.length : 0 
        });
        
        if (doctorSlotsResult.success) {
          allAvailableSlots.push(...doctorSlotsResult.data.slots);
        }
      } catch (error) {
        this.logger.error(`Error finding slots for doctor ${doctor.doctorId}:`, error);
      }
    }

    this.logger.info(`findDepartmentSlotsForDate returning ${allAvailableSlots.length} total slots`);
    return allAvailableSlots;
  }

  
  async addWorkloadInfoToSlots(slots) {
    this.logger.info(`addWorkloadInfoToSlots: Processing ${slots.length} slots`);
    const slotsWithWorkload = [];
    
    for (const slot of slots) {
      try {
        this.logger.info(`Processing slot: ${slot.slotId} for doctor: ${slot.doctorId}`);
        const workload = await this.calculateDoctorWorkloadForDate(slot.doctorId, new Date(slot.date));
        this.logger.info(`Workload calculated for doctor ${slot.doctorId}:`, workload);
        
        const plainSlot = slot.toObject ? slot.toObject() : slot;
        
        const slotWithWorkload = {
          ...plainSlot,
          doctorWorkload: workload
        };
        
        this.logger.info(`Slot with workload created:`, { 
          slotId: slotWithWorkload.slotId, 
          doctorId: slotWithWorkload.doctorId,
          hasWorkload: !!slotWithWorkload.doctorWorkload,
          workloadCurrentPatients: slotWithWorkload.doctorWorkload?.currentPatients,
          originalSlotId: slot.slotId,
          isMongooseDoc: !!slot.toObject
        });
        
        slotsWithWorkload.push(slotWithWorkload);
      } catch (error) {
        this.logger.error(`Error calculating workload for doctor ${slot.doctorId}:`, error);
        slotsWithWorkload.push({
          ...slot,
          doctorWorkload: { currentPatients: 999, availableSlots: 0 } // High number to put at end
        });
      }
    }

    this.logger.info(`addWorkloadInfoToSlots: Returning ${slotsWithWorkload.length} slots with workload`);
    return slotsWithWorkload;
  }

  async calculateDoctorWorkloadForDate(doctorId, date) {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    try {
      // Count current patients for the date
      const dayTokens = await this.tokenRepository.find({
        doctorId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['allocated', 'confirmed'] }
      });

      // Count available slots for the date
      const daySlots = await this.slotRepository.find({
        doctorId,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: 'active'
      });

      const availableCapacity = daySlots.reduce((total, slot) => {
        return total + Math.max(0, slot.maxCapacity - slot.currentAllocation);
      }, 0);

      return {
        currentPatients: dayTokens.length,
        totalSlots: daySlots.length,
        availableSlots: availableCapacity,
        utilizationRate: daySlots.length > 0 ? (dayTokens.length / daySlots.reduce((sum, s) => sum + s.maxCapacity, 0)) * 100 : 0
      };
    } catch (error) {
      this.logger.error(`Error calculating workload for doctor ${doctorId}:`, error);
      return {
        currentPatients: 999,
        totalSlots: 0,
        availableSlots: 0,
        utilizationRate: 100
      };
    }
  }

  
  async findFutureDatesWithAvailability(doctors, startDate, daysAhead = 14) {
    try {
      const availableDates = [];
      
      for (let i = 1; i <= daysAhead; i++) {
        const checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() + i);
        const endOfDay = new Date(checkDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        
        const daySlots = await this.findDepartmentSlotsForDate(doctors, checkDate, endOfDay);
        
        if (daySlots.length > 0) {
          const slotsWithWorkload = await this.addWorkloadInfoToSlots(daySlots);
          const leastLoadedSlot = slotsWithWorkload.sort((a, b) => 
            a.doctorWorkload.currentPatients - b.doctorWorkload.currentPatients
          )[0];
          
          availableDates.push({
            date: checkDate.toDateString(),
            availableSlots: daySlots.length,
            recommendedSlot: {
              slotId: leastLoadedSlot.slotId,
              doctorId: leastLoadedSlot.doctorId,
              startTime: leastLoadedSlot.startTime,
              endTime: leastLoadedSlot.endTime,
              doctorWorkload: leastLoadedSlot.doctorWorkload
            }
          });
        }
      }

      return this.createSuccessResponse({
        availableDates: availableDates.slice(0, 7) // Return max 7 future dates
      }, `Found ${availableDates.length} dates with availability`);
    } catch (error) {
      this.logger.error('Error finding future dates with availability:', error);
      return this.createErrorResponse(
        'FUTURE_DATES_SEARCH_ERROR',
        'Error searching for future availability',
        { error: error.message }
      );
    }
  }

  
  async getTokenById(tokenId) {
    return this.executeOperation('getTokenById', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);
      
      const token = await this.tokenRepository.findByTokenId(tokenId);
      
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`,
          { tokenId },
          ['Check the token ID', 'Verify the token exists']
        );
      }

      return this.createSuccessResponse(
        { token },
        'Token retrieved successfully'
      );
    }, { tokenId });
  }

  
  async checkDoctorContinuityOptions(patientId, lastVisitedDoctorId, requestedSlotId) {
    try {
      // Get the requested slot to understand the preferred time
      const requestedSlot = await this.slotRepository.findBySlotId(requestedSlotId);
      if (!requestedSlot) {
        return this.createSuccessResponse({ hasAlternatives: false }, 'Requested slot not found');
      }

      const requestedDate = new Date(requestedSlot.date);
      
      // Find alternative slots with the last visited doctor on the same day
      const alternativeSlotsResult = await this.findAlternativeSlots(
        lastVisitedDoctorId,
        requestedDate,
        8 // 8-hour window for same-day alternatives
      );

      if (!alternativeSlotsResult.success || alternativeSlotsResult.data.alternatives.length === 0) {
        // Try next day if same day has no alternatives
        const nextDay = new Date(requestedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const nextDayResult = await this.findAlternativeSlots(
          lastVisitedDoctorId,
          nextDay,
          12 // 12-hour window for next day
        );

        if (!nextDayResult.success || nextDayResult.data.alternatives.length === 0) {
          return this.createSuccessResponse({ hasAlternatives: false }, 'No alternatives with previous doctor');
        }

        return this.createSuccessResponse({
          hasAlternatives: true,
          alternativeSlots: nextDayResult.data.alternatives.slice(0, 3), // Limit to 3 suggestions
          continuityMessage: 'Available slots with your previous doctor (next day)'
        }, 'Found next-day alternatives with previous doctor');
      }

      return this.createSuccessResponse({
        hasAlternatives: true,
        alternativeSlots: alternativeSlotsResult.data.alternatives.slice(0, 3), // Limit to 3 suggestions
        continuityMessage: 'Available slots with your previous doctor (same day)'
      }, 'Found same-day alternatives with previous doctor');

    } catch (error) {
      this.logger.error('Error checking doctor continuity options:', error);
      return this.createSuccessResponse({ hasAlternatives: false }, 'Error checking continuity options');
    }
  }


  async allocateWithComplexLogic(request, newTokenPriority) {
    const { patientId, doctorId, slotId, source, patientInfo = {}, waitingTime = 0 } = request;

    //Check if slot exists and is active
    const slot = await this.slotRepository.findBySlotId(slotId);
    if (!slot) {
      return this.createErrorResponse(
        'SLOT_NOT_FOUND',
        `Slot with ID ${slotId} not found`,
        { slotId },
        ['Choose a different slot', 'Create the slot first']
      );
    }

    if (slot.status !== 'active') {
      return this.createErrorResponse(
        'SLOT_INACTIVE',
        'Cannot allocate to inactive slot',
        { slotId, status: slot.status },
        ['Choose an active slot', 'Activate the slot']
      );
    }

    //Check slot availability with proper concurrency control
    const currentTokens = await this.tokenRepository.findBySlot(slotId);
    const activeTokens = currentTokens.filter(token => 
      ['allocated', 'confirmed'].includes(token.status)
    );

    // If slot has capacity, allocate directly
    if (activeTokens.length < slot.maxCapacity) {
      try {
        return await this.allocateDirectlyInternal(
          patientId, doctorId, slotId, source, newTokenPriority, patientInfo, waitingTime
        );
      } catch (error) {
        this.logger.error(`Direct allocation failed for slot ${slotId}:`, error.message);
        this.logger.error('Full error details:', error);
        
        // If allocation failed due to capacity (race condition), try alternatives
        if (error.message.includes('capacity') || error.message.includes('Slot at capacity')) {
          return await this.findAlternativeSolutions(
            patientId, doctorId, slotId, source, newTokenPriority, patientInfo, waitingTime, slot
          );
        }
        
        return this.createErrorResponse(
          'ALLOCATION_FAILED',
          'Failed to allocate token to slot',
          { slotId, error: error.message },
          ['Try again later', 'Contact support']
        );
      }
    }

    // Slot is at capacity - handle based on urgency
    if (source === 'emergency') {
      // Only emergency cases can preempt existing tokens
      const preemptableTokens = await this.findPreemptableTokens(slotId, newTokenPriority);
      
      if (preemptableTokens.length > 0) {
        this.logger.info(`Emergency preemption for patient ${patientId} in slot ${slotId}`);
        return await this.allocateWithPreemption(
          patientId, doctorId, slotId, source, newTokenPriority, 
          patientInfo, waitingTime, preemptableTokens[0]
        );
      }
    }

    // Find alternative solutions instead of simple rejection
    return await this.findAlternativeSolutions(
      patientId, doctorId, slotId, source, newTokenPriority, patientInfo, waitingTime, slot
    );
  }

  
  async allocateDirectlyInternal(patientId, doctorId, slotId, source, priority, patientInfo, waitingTime) {
    const slot = await this.slotRepository.findOne({ slotId });
    if (!slot) {
      throw new Error('Slot not found');
    }

    // Use atomic findOneAndUpdate to increment allocation count only if under capacity
    const updatedSlot = await this.slotRepository.model.findOneAndUpdate(
      { 
        slotId: slotId,
        currentAllocation: { $lt: slot.maxCapacity }
      },
      { 
        $inc: { currentAllocation: 1 }
      },
      { 
        new: true,
        upsert: false
      }
    );

    if (!updatedSlot) {
      throw new Error('Slot at capacity');
    }

    // Get next token number atomically using findOneAndUpdate
    const tokenNumberDoc = await this.slotRepository.model.findOneAndUpdate(
      { slotId: slotId },
      { $inc: { lastTokenNumber: 1 } },
      { 
        new: true,
        upsert: false,
        select: 'lastTokenNumber'
      }
    );

    const tokenNumber = tokenNumberDoc ? tokenNumberDoc.lastTokenNumber : 1;
    
    const tokenData = {
      tokenId: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      patientId,
      doctorId,
      slotId,
      tokenNumber,
      source,
      priority,
      status: 'allocated',
      metadata: {
        waitingTime,
        estimatedServiceTime: patientInfo.estimatedServiceTime || 15
      }
    };

    try {
      const token = await this.tokenRepository.create(tokenData);
      
      // Audit log the token allocation
      globalAuditLogger.logTokenOperation('allocate', token, {
        userId: patientInfo.userId,
        correlationId: patientInfo.correlationId,
        severity: AUDIT_SEVERITY.MEDIUM
      });

      return this.createSuccessResponse(
        {
          token,
          allocationMethod: 'direct',
          preemptedTokens: []
        },
        'Token allocated successfully'
      );
    } catch (error) {
      // If token creation failed, rollback the slot allocation
      await this.slotRepository.model.findOneAndUpdate(
        { slotId: slotId },
        { $inc: { currentAllocation: -1 } }
      );
      throw error;
    }
  }

  async allocateDirectly(patientId, doctorId, slotId, source, priority, patientInfo, waitingTime) {
    return this.executeOperation('allocateDirectly', async () => {
      return await this.allocateDirectlyInternal(patientId, doctorId, slotId, source, priority, patientInfo, waitingTime);
    }, { patientId, doctorId, slotId, source });
  }

  async allocateWithPreemption(patientId, doctorId, slotId, source, priority, patientInfo, waitingTime, tokenToPreempt) {
    try {
      // Create the new token with the preempted token's number
      const tokenData = {
        tokenId: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        patientId,
        doctorId,
        slotId,
        tokenNumber: tokenToPreempt.tokenNumber,
        source,
        priority,
        status: 'allocated',
        metadata: {
          waitingTime,
          estimatedServiceTime: patientInfo.estimatedServiceTime || 15,
          preemptedTokens: [tokenToPreempt.tokenId]
        }
      };

      const newToken = await this.tokenRepository.create(tokenData);

      
      globalAuditLogger.logTokenOperation('allocate', newToken, {
        userId: patientInfo.userId,
        correlationId: patientInfo.correlationId,
        severity: AUDIT_SEVERITY.HIGH,
        metadata: {
          preemptedTokenId: tokenToPreempt.tokenId,
          preemptedPatientId: tokenToPreempt.patientId
        }
      });
      
     
      globalAuditLogger.logTokenOperation('preempt', tokenToPreempt, {
        userId: patientInfo.userId,
        correlationId: patientInfo.correlationId,
        severity: AUDIT_SEVERITY.HIGH,
        metadata: {
          preemptedBy: newToken.tokenId,
          preemptionReason: 'Higher priority token allocation'
        }
      });

      const reallocationResult = await this.reallocatePreemptedToken(tokenToPreempt);

      return this.createSuccessResponse(
        {
          token: newToken,
          allocationMethod: 'preemption',
          preemptedTokens: [{
            tokenId: tokenToPreempt.tokenId,
            patientId: tokenToPreempt.patientId,
            originalSlotId: slotId,
            reallocationResult
          }]
        },
        'Token allocated successfully with preemption'
      );
    } catch (error) {
      this.logger.error('Error in allocateWithPreemption:', error);
      
      return this.createErrorResponse(
        'PREEMPTION_FAILED',
        'Failed to allocate token with preemption',
        { 
          patientId, 
          slotId, 
          tokenToPreemptId: tokenToPreempt.tokenId,
          error: error.message 
        },
        ['Try a different slot', 'Retry the allocation']
      );
    }
  }

  
  async findAlternativeSolutions(patientId, doctorId, slotId, source, priority, patientInfo, waitingTime, requestedSlot) {
    try {
      const alternatives = {
        sameDoctorFutureSlots: [],
        sameDepartmentOtherDoctors: [],
        nextAvailableSlots: []
      };

      const requestedDate = new Date(requestedSlot.date);
      const patientDepartment = patientInfo.preferredDepartment || 'general_medicine';

      // Find future slots with the same doctor (next 7 days)
      const sameDoctorFuture = await this.findFutureSlotsWithDoctor(doctorId, requestedDate, 7);
      if (sameDoctorFuture.success && sameDoctorFuture.data && sameDoctorFuture.data.alternatives && sameDoctorFuture.data.alternatives.length > 0) {
        alternatives.sameDoctorFutureSlots = sameDoctorFuture.data.alternatives.slice(0, 3);
      }

      // Find slots with other doctors in the same department (same day)
      const sameDepartmentToday = await this.findSameDepartmentAlternatives(patientDepartment, doctorId, requestedDate);
      if (sameDepartmentToday.success && sameDepartmentToday.data && sameDepartmentToday.data.alternatives && sameDepartmentToday.data.alternatives.length > 0) {
        alternatives.sameDepartmentOtherDoctors = sameDepartmentToday.data.alternatives.slice(0, 3);
      }

      // Find next available slots (any doctor, next 3 days)
      const nextAvailable = await this.findNextAvailableSlots(patientDepartment, requestedDate, 3);
      if (nextAvailable.success && nextAvailable.data && nextAvailable.data.alternatives && nextAvailable.data.alternatives.length > 0) {
        alternatives.nextAvailableSlots = nextAvailable.data.alternatives.slice(0, 5);
      }

      // Determine the best recommendation
      let recommendedAction = 'future_booking';
      let primaryAlternatives = alternatives.nextAvailableSlots;
      
      // Special handling for emergency cases
      if (source === 'emergency') {
        if (alternatives.sameDepartmentOtherDoctors.length > 0) {
          recommendedAction = 'emergency_same_department';
          primaryAlternatives = alternatives.sameDepartmentOtherDoctors;
        } else if (alternatives.sameDoctorFutureSlots.length > 0) {
          recommendedAction = 'emergency_same_doctor';
          primaryAlternatives = alternatives.sameDoctorFutureSlots;
        } else if (alternatives.nextAvailableSlots.length > 0) {
          recommendedAction = 'emergency_next_available';
          primaryAlternatives = alternatives.nextAvailableSlots;
        } else {
          recommendedAction = 'emergency_no_alternatives';
        }
      } else {
        if (alternatives.sameDepartmentOtherDoctors.length > 0) {
          recommendedAction = 'same_department_today';
          primaryAlternatives = alternatives.sameDepartmentOtherDoctors;
        } else if (alternatives.sameDoctorFutureSlots.length > 0) {
          recommendedAction = 'same_doctor_future';
          primaryAlternatives = alternatives.sameDoctorFutureSlots;
        }
      }

      // If no alternatives found at all
      if (primaryAlternatives.length === 0) {
        return this.createErrorResponse(
          'NO_ALTERNATIVES_AVAILABLE',
          'The requested slot is full and no alternative slots are currently available.',
          {
            requestedSlot: {
              slotId,
              doctorId,
              date: requestedSlot.date,
              time: `${requestedSlot.startTime} - ${requestedSlot.endTime}`,
              currentCapacity: `${requestedSlot.currentAllocation}/${requestedSlot.maxCapacity}`
            },
            alternatives: {
              sameDoctorFutureSlots: [],
              sameDepartmentOtherDoctors: [],
              nextAvailableSlots: []
            },
            recommendedAction: source === 'emergency' ? 'emergency_no_alternatives' : 'no_alternatives',
            suggestions: [
              'Try booking for a later date',
              'Contact the hospital for emergency cases',
              'Consider teleconsultation if available'
            ]
          },
          [
            'Try booking for tomorrow or later dates',
            'Contact hospital administration for urgent cases',
            'Check if teleconsultation is available'
          ]
        );
      }

      return this.createErrorResponse(
        'SLOT_FULL_ALTERNATIVES_AVAILABLE',
        'The requested slot is full, but alternative slots are available.',
        {
          requestedSlot: {
            slotId,
            doctorId,
            date: requestedSlot.date,
            time: `${requestedSlot.startTime} - ${requestedSlot.endTime}`,
            status: 'full',
            currentCapacity: `${requestedSlot.currentAllocation}/${requestedSlot.maxCapacity}`
          },
          recommendedAction,
          alternatives,
          primaryAlternatives,
          message: this.getAlternativeMessage(recommendedAction, primaryAlternatives.length)
        },
        [
          'Choose from the available alternative slots',
          'Book for a different time or doctor',
          'Contact hospital for urgent cases'
        ]
      );

    } catch (error) {
      this.logger.error('Error finding alternative solutions:', error);
      return this.createErrorResponse(
        'ALTERNATIVE_SEARCH_FAILED',
        'Unable to find alternative slots at this time',
        { error: error.message },
        ['Try again later', 'Contact hospital directly']
      );
    }
  }

  
  async findFutureSlotsWithDoctor(doctorId, fromDate, daysAhead = 7) {
    const startDate = new Date(fromDate);
    startDate.setDate(startDate.getDate() + 1); // Start from tomorrow
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysAhead);

    const criteria = {
      doctorId,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      onlyAvailable: true
    };

    return await this.slotManagementService.getAvailableSlots(criteria);
  }

  
  async findSameDepartmentAlternatives(department, excludeDoctorId, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      
      // Find all doctors in the same department
      const departmentDoctors = await this.getDoctorsByDepartment(department, excludeDoctorId);
      
      if (departmentDoctors.length === 0) {
        return this.createSuccessResponse({ alternatives: [] }, 'No other doctors in department');
      }

      const alternatives = [];
      
      // Check slots for each doctor in the department
      for (const doctor of departmentDoctors) {
        const criteria = {
          doctorId: doctor.doctorId,
          startDate: dateStr,
          endDate: dateStr,
          onlyAvailable: true
        };

        const doctorSlots = await this.slotManagementService.getAvailableSlots(criteria);
        
        if (doctorSlots.success && doctorSlots.data.slots.length > 0) {
          // Add doctor info to each slot
          const slotsWithDoctorInfo = doctorSlots.data.slots.map(slot => ({
            ...slot,
            doctorName: doctor.personalInfo?.name || 'Unknown Doctor',
            doctorSpecialization: doctor.personalInfo?.specialization || department
          }));
          
          alternatives.push(...slotsWithDoctorInfo);
        }
      }

      // Sort by time (earliest first)
      alternatives.sort((a, b) => a.startTime.localeCompare(b.startTime));

      return this.createSuccessResponse(
        { alternatives },
        `Found ${alternatives.length} alternatives in ${department} department`
      );

    } catch (error) {
      this.logger.error('Error finding same department alternatives:', error);
      return this.createSuccessResponse({ alternatives: [] }, 'Error searching department alternatives');
    }
  }

  async findNextAvailableSlots(preferredDepartment, fromDate, daysAhead = 3) {
    const alternatives = [];
    const currentDate = new Date(fromDate);

    for (let i = 0; i <= daysAhead; i++) {
      const searchDate = new Date(currentDate);
      searchDate.setDate(searchDate.getDate() + i);
      const dateStr = searchDate.toISOString().split('T')[0];

      const criteria = {
        startDate: dateStr,
        endDate: dateStr,
        onlyAvailable: true
      };

      const daySlots = await this.slotManagementService.getAvailableSlots(criteria);
      
      if (daySlots.success && daySlots.data.slots.length > 0) {
        // Prioritize preferred department
        const departmentSlots = daySlots.data.slots.filter(slot => 
          slot.specialty === preferredDepartment || slot.specialty === 'general'
        );
        
        const otherSlots = daySlots.data.slots.filter(slot => 
          slot.specialty !== preferredDepartment && slot.specialty !== 'general'
        );

        alternatives.push(...departmentSlots, ...otherSlots);
        
        // Stop if we found enough alternatives
        if (alternatives.length >= 5) break;
      }
    }

    return this.createSuccessResponse(
      { alternatives: alternatives.slice(0, 5) },
      `Found ${alternatives.length} next available slots`
    );
  }

    async getDoctorsByDepartment(department, excludeDoctorId) {
    try {
      this.logger.info(`Looking for doctors in department: ${department}, excluding: ${excludeDoctorId}`);
      
      if (this.doctorRepository) {
        // Use specialty field instead of department, as that's what the Doctor model uses
        this.logger.info(`Using doctorRepository.findBySpecialty(${department})`);
        const doctors = await this.doctorRepository.findBySpecialty(department);
        this.logger.info(`Found ${doctors.length} doctors with specialty: ${department}`);
        if (doctors.length > 0) {
          this.logger.info(`Doctor IDs found:`, doctors.map(d => d.doctorId));
        }
        const filteredDoctors = doctors.filter(doc => doc.doctorId !== excludeDoctorId);
        this.logger.info(`After filtering, ${filteredDoctors.length} doctors remain`);
        return filteredDoctors;
      }

      this.logger.info(`Using fallback method with slotRepository`);
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 7);

      const slots = await this.slotRepository.find({
        date: { $gte: startDate, $lte: endDate },
        specialty: department,
        status: 'active',
        doctorId: { $ne: excludeDoctorId }
      });

      // Extract unique doctors from slots
      const doctorIds = [...new Set(slots.map(slot => slot.doctorId))];
      const doctors = doctorIds.map(doctorId => ({
        doctorId,
        personalInfo: { 
          name: `Dr. ${department} Specialist`, 
          specialization: department 
        }
      }));

      return doctors;
    } catch (error) {
      this.logger.error('Error getting doctors by department:', error);
      return [];
    }
  }

  getAlternativeMessage(action, count) {
    switch (action) {
      case 'same_department_today':
        return `The requested slot is full, but we found ${count} available slots with other doctors in the same department today.`;
      case 'same_doctor_future':
        return `The requested slot is full, but your preferred doctor has ${count} available slots in the coming days.`;
      case 'future_booking':
        return `The requested slot is full. We found ${count} alternative slots in the next few days.`;
      case 'emergency_same_department':
        return `EMERGENCY: The requested slot is full, but we found ${count} available emergency slots with other doctors in the same department today.`;
      case 'emergency_same_doctor':
        return `EMERGENCY: The requested slot is full, but your preferred doctor has ${count} available emergency slots in the coming days.`;
      case 'emergency_next_available':
        return `EMERGENCY: The requested slot is full. We found ${count} alternative emergency slots in the next few days.`;
      case 'emergency_no_alternatives':
        return `EMERGENCY: The requested slot is full and no alternative slots are currently available. Please contact hospital administration immediately.`;
      default:
        return `The requested slot is full, but we found ${count} alternative options for you.`;
    }
  }

  async findPreemptableTokens(slotId, newTokenPriority) {
    // Only allow preemption for emergency cases (priority >= 1000)
    if (newTokenPriority < 1000) {
      return []; // No preemption for non-emergency cases
    }

    const preemptableTokens = await this.tokenRepository.findPreemptableTokens(slotId, newTokenPriority);
    
    // Filter out emergency tokens (they cannot be preempted even by other emergencies)
    // Also ensure we only preempt much lower priority tokens (difference > 200)
    return preemptableTokens.filter(token => 
      token.source !== 'emergency' && 
      token.status === 'allocated' &&
      (newTokenPriority - token.priority) > 200 
    );
  }

  
  async reallocatePreemptedToken(preemptedToken) {
    try {
      // Find alternative slots for the same doctor within 2 hours
      const alternativeSlotsResult = await this.findAlternativeSlots(
        preemptedToken.doctorId, 
        new Date(), // Current date as reference
        2 // 2-hour window
      );

      if (!alternativeSlotsResult.success || alternativeSlotsResult.data.alternatives.length === 0) {
        // No alternatives found - cancel the token
        const updatedToken = await this.tokenRepository.updateStatus(preemptedToken.tokenId, 'cancelled', {
          cancellationReason: 'preempted_no_alternatives'
        });

        if (!updatedToken) {
          this.logger.warn(`Failed to cancel preempted token ${preemptedToken.tokenId} - token not found`);
        }

        return {
          success: false,
          action: 'cancelled',
          reason: 'No alternative slots available'
        };
      }

      // Try to allocate to the first available alternative
      const alternativeSlot = alternativeSlotsResult.data.alternatives[0];
      const newTokenNumber = await this.tokenRepository.getNextTokenNumber(alternativeSlot.slotId);

      // Move token to alternative slot
      const movedToken = await this.tokenRepository.moveToSlot(
        preemptedToken.tokenId, 
        alternativeSlot.slotId, 
        newTokenNumber
      );

      if (!movedToken) {
        // Token move failed, cancel it instead
        await this.tokenRepository.updateStatus(preemptedToken.tokenId, 'cancelled', {
          cancellationReason: 'reallocation_failed'
        });

        return {
          success: false,
          action: 'cancelled',
          reason: 'Token move failed'
        };
      }

      // Update slot allocations
      const newSlot = await this.slotRepository.findOne({ slotId: alternativeSlot.slotId });
      if (newSlot) {
        await this.slotRepository.incrementAllocation(newSlot._id);
      }

      return {
        success: true,
        action: 'reallocated',
        newSlotId: alternativeSlot.slotId,
        newTokenNumber,
        newSlotTime: `${alternativeSlot.startTime} - ${alternativeSlot.endTime}`,
        newSlotDate: alternativeSlot.date
      };

    } catch (error) {
      this.logger.error('Error reallocating preempted token:', error);
      
      // Fallback - cancel the token
      try {
        await this.tokenRepository.updateStatus(preemptedToken.tokenId, 'cancelled', {
          cancellationReason: 'reallocation_failed'
        });
      } catch (cancelError) {
        this.logger.error(`Failed to cancel token ${preemptedToken.tokenId} after reallocation error:`, cancelError);
      }

      return {
        success: false,
        action: 'cancelled',
        reason: 'Reallocation failed due to system error'
      };
    }
  }

 
  async findAlternativeSlots(doctorId, referenceDate, timeWindowHours = 2) {
    if (!this.slotManagementService) {
      // Fallback to direct repository query
      const alternatives = await this.slotRepository.findAlternativeSlots(
        null, doctorId, referenceDate, timeWindowHours
      );

      return this.createSuccessResponse(
        { alternatives },
        `Found ${alternatives.length} alternative slots`
      );
    }

    // Use SlotManagementService if available
    return await this.slotManagementService.findAlternativeSlots(
      { doctorId, date: referenceDate },
      timeWindowHours
    );
  }

  async findAlternativeSlotsAnyDoctor(date, timeWindowHours = 2) {
    return this.executeOperation('findAlternativeSlotsAnyDoctor', async () => {
      // Get all slots for the date
      const allSlots = await this.slotRepository.findByDate(date);
      const alternatives = [];

      // Check each slot's current capacity
      for (const slot of allSlots) {
        const tokensResult = await this.tokenRepository.findBySlot(slot.slotId);
        
        if (tokensResult.success) {
          const activeTokens = tokensResult.data.filter(token => token.status === 'active');
          const availableCapacity = slot.maxCapacity - activeTokens.length;
          
          if (availableCapacity > 0) {
            alternatives.push({
              ...slot,
              availableCapacity,
              currentAllocation: activeTokens.length,
              utilizationRate: (activeTokens.length / slot.maxCapacity) * 100
            });
          }
        }
      }

      // Sort alternatives by available capacity (most available first)
      alternatives.sort((a, b) => b.availableCapacity - a.availableCapacity);

      return this.createSuccessResponse(
        { alternatives },
        `Found ${alternatives.length} alternative slots across all doctors`
      );
    });
  }

  
  async cancelToken(tokenId, reason = 'user_requested') {
    return this.executeOperation('cancelToken', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);

      try {
        // Find the token first
        const token = await this.tokenRepository.findOne({ tokenId });
        if (!token) {
          return this.createErrorResponse(
            'TOKEN_NOT_FOUND',
            `Token with ID ${tokenId} not found`
          );
        }

        if (['completed', 'cancelled'].includes(token.status)) {
          return this.createErrorResponse(
            'TOKEN_ALREADY_PROCESSED',
            `Token is already ${token.status}`,
            { tokenId, currentStatus: token.status },
            ['Cannot cancel processed tokens']
          );
        }

        // Update token status
        const updatedToken = await this.tokenRepository.updateStatus(tokenId, 'cancelled', {
          cancellationReason: reason,
          cancelledAt: new Date()
        });

        // Find the slot by slotId to get its _id for updating allocation
        const slot = await this.slotRepository.findOne({ slotId: token.slotId });
        if (slot) {
          // Release the slot capacity using the slotId (not _id)
          await this.slotRepository.decrementAllocation(token.slotId);
        }

        globalAuditLogger.logTokenOperation('cancel', updatedToken, {
          severity: AUDIT_SEVERITY.MEDIUM,
          metadata: {
            cancellationReason: reason,
            originalStatus: token.status
          }
        });

        return this.createSuccessResponse(
          {
            token: updatedToken,
            freedSlot: {
              slotId: updatedToken.slotId,
              freedCapacity: 1
            }
          },
          'Token cancelled successfully'
        );

      } catch (error) {
        this.logger.error('Error in cancelToken:', error);
        return this.createErrorResponse(
          'CANCELLATION_FAILED',
          'Token cancellation failed',
          { tokenId, reason, error: error.message },
          ['Try again later', 'Contact support']
        );
      }
    }, { tokenId, reason });
  }

  async processNoShow(tokenId) {
    return this.executeOperation('processNoShow', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);

      const token = await this.tokenRepository.findOne({ tokenId });
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`
        );
      }

      if (token.status !== 'confirmed') {
        return this.createErrorResponse(
          'INVALID_TOKEN_STATUS',
          'Only confirmed tokens can be marked as no-show',
          { currentStatus: token.status },
          ['Token must be confirmed first']
        );
      }

      // Update token status to no-show
      const updatedToken = await this.tokenRepository.updateStatus(tokenId, 'noshow', {
        noShowAt: new Date()
      });

      // Find the slot by slotId to get its _id for updating allocation
      const slot = await this.slotRepository.findOne({ slotId: token.slotId });
      if (slot) {
        // Release the slot capacity using the slotId (not _id)
        await this.slotRepository.decrementAllocation(token.slotId);
      }

      return this.createSuccessResponse(
        {
          token: updatedToken,
          freedSlot: {
            slotId: token.slotId,
            freedCapacity: 1
          }
        },
        'Token marked as no-show and slot released'
      );
    }, { tokenId });
  }

 
  async rescheduleToken(tokenId, newSlotId, reason = 'user_requested') {
    return this.executeOperation('rescheduleToken', async () => {
      this.validateRequired({ tokenId, newSlotId }, ['tokenId', 'newSlotId']);

      try {
        // Use concurrency manager for safe token move
        const moveResult = await this.concurrencyManager.moveTokenConcurrently(
          tokenId, 
          newSlotId, 
          { reason }
        );

        const updatedToken = await this.tokenRepository.findOne({ tokenId });

        return this.createSuccessResponse(
          {
            token: updatedToken,
            rescheduleDetails: {
              oldSlotId: moveResult.oldSlotId,
              newSlotId: moveResult.newSlotId,
              newTokenNumber: moveResult.newTokenNumber,
              reason
            }
          },
          'Token rescheduled successfully'
        );

      } catch (error) {
        if (error.code === 'TOKEN_NOT_FOUND') {
          return this.createErrorResponse(
            'TOKEN_NOT_FOUND',
            `Token with ID ${tokenId} not found`
          );
        }

        if (error.code === 'SLOT_NOT_FOUND') {
          return this.createErrorResponse(
            'SLOT_NOT_FOUND',
            `New slot with ID ${newSlotId} not found`
          );
        }

        if (error.code === 'SLOT_CAPACITY_EXCEEDED') {
          return this.createErrorResponse(
            'SLOT_CAPACITY_EXCEEDED',
            'New slot is at maximum capacity',
            { newSlotId }
          );
        }

        throw error;
      }
    }, { tokenId, newSlotId, reason });
  }

  
  async getAllocationStatistics(startDate, endDate) {
    return this.executeOperation('getAllocationStatistics', async () => {
      const stats = await this.tokenRepository.getTokenStatistics(startDate, endDate);
      
      const summary = {
        totalTokens: 0,
        bySource: {},
        byStatus: {},
        averageWaitingTime: 0
      };

      stats.forEach(stat => {
        const key = `${stat._id.source}_${stat._id.status}`;
        summary.totalTokens += stat.count;
        
        if (!summary.bySource[stat._id.source]) {
          summary.bySource[stat._id.source] = 0;
        }
        summary.bySource[stat._id.source] += stat.count;
        
        if (!summary.byStatus[stat._id.status]) {
          summary.byStatus[stat._id.status] = 0;
        }
        summary.byStatus[stat._id.status] += stat.count;
        
        if (stat.avgWaitingTime) {
          summary.averageWaitingTime += stat.avgWaitingTime * stat.count;
        }
      });

      if (summary.totalTokens > 0) {
        summary.averageWaitingTime = Math.round(summary.averageWaitingTime / summary.totalTokens);
      }

      return this.createSuccessResponse(
        {
          dateRange: { startDate, endDate },
          statistics: summary,
          detailedStats: stats
        },
        'Allocation statistics retrieved successfully'
      );
    }, { startDate, endDate });
  }

  async reallocateTokensForScheduleChange(scheduleChange) {
    return this.executeOperation('reallocateTokensForScheduleChange', async () => {
      this.validateRequired(scheduleChange, ['doctorId', 'affectedSlotIds', 'changeType']);
      
      const { doctorId, affectedSlotIds, changeType, newSchedule } = scheduleChange;
      
      // Get all tokens affected by the schedule change
      const affectedTokens = await this.getTokensForSlots(affectedSlotIds);
      
      if (affectedTokens.length === 0) {
        return this.createSuccessResponse(
          {
            reallocatedCount: 0,
            affectedTokens: [],
            reallocationResults: []
          },
          'No tokens affected by schedule change'
        );
      }

      const reallocationResults = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each affected token
      for (const token of affectedTokens) {
        try {
          let result;
          
          switch (changeType) {
            case 'cancelled':
              result = await this.handleSlotCancellation(token);
              break;
            case 'rescheduled':
              result = await this.handleSlotReschedule(token, newSchedule);
              break;
            case 'capacity_reduced':
              result = await this.handleCapacityReduction(token);
              break;
            default:
              result = {
                success: false,
                action: 'unknown',
                reason: `Unknown change type: ${changeType}`
              };
          }

          reallocationResults.push({
            tokenId: token.tokenId,
            patientId: token.patientId,
            originalSlotId: token.slotId,
            ...result
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }

        } catch (error) {
          this.logger.error(`Error reallocating token ${token.tokenId}:`, error);
          reallocationResults.push({
            tokenId: token.tokenId,
            patientId: token.patientId,
            originalSlotId: token.slotId,
            success: false,
            action: 'error',
            reason: 'System error during reallocation'
          });
          failureCount++;
        }
      }

      return this.createSuccessResponse(
        {
          reallocatedCount: successCount,
          failedCount: failureCount,
          affectedTokens: affectedTokens.map(t => ({
            tokenId: t.tokenId,
            patientId: t.patientId,
            slotId: t.slotId
          })),
          reallocationResults
        },
        `Reallocation completed: ${successCount} successful, ${failureCount} failed`
      );

    }, scheduleChange);
  }

  
  async getTokensForSlots(slotIds) {
    const allTokens = [];
    
    for (const slotId of slotIds) {
      const slotTokens = await this.tokenRepository.findBySlot(slotId);
      const activeTokens = slotTokens.filter(token => 
        ['allocated', 'confirmed'].includes(token.status)
      );
      allTokens.push(...activeTokens);
    }
    
    return allTokens;
  }

  
  async handleSlotCancellation(token) {
    // Find alternative slots for the same doctor
    const alternativeSlotsResult = await this.findAlternativeSlots(
      token.doctorId, 
      new Date(), 
      24 // 24-hour window for cancellations
    );

    if (!alternativeSlotsResult.success || alternativeSlotsResult.data.alternatives.length === 0) {
      // No alternatives found - mark token for manual handling
      await this.tokenRepository.updateStatus(token.tokenId, 'pending_reallocation', {
        reallocationReason: 'slot_cancelled_no_alternatives',
        originalSlotId: token.slotId,
        requiresManualIntervention: true
      });

      return {
        success: false,
        action: 'pending_manual',
        reason: 'No alternative slots available - requires manual intervention'
      };
    }

    // Try to allocate to the best alternative
    const alternativeSlot = alternativeSlotsResult.data.alternatives[0];
    return await this.moveTokenToAlternativeSlot(token, alternativeSlot, 'slot_cancelled');
  }

  
  async handleSlotReschedule(token, newSchedule) {
    if (!newSchedule || !newSchedule.newSlotId) {
      return {
        success: false,
        action: 'error',
        reason: 'New schedule information missing'
      };
    }

    // Check if the new slot has capacity
    const newSlot = await this.slotRepository.findBySlotId(newSchedule.newSlotId);
    if (!newSlot) {
      return {
        success: false,
        action: 'error',
        reason: 'New slot not found'
      };
    }

    const currentTokens = await this.tokenRepository.findBySlot(newSlot.slotId);
    const activeTokens = currentTokens.filter(t => 
      ['allocated', 'confirmed'].includes(t.status)
    );

    if (activeTokens.length >= newSlot.maxCapacity) {
      // New slot is full - find alternative
      const alternativeSlotsResult = await this.findAlternativeSlots(
        token.doctorId, 
        newSlot.date, 
        4 // 4-hour window for rescheduled slots
      );

      if (!alternativeSlotsResult.success || alternativeSlotsResult.data.alternatives.length === 0) {
        await this.tokenRepository.updateStatus(token.tokenId, 'pending_reallocation', {
          reallocationReason: 'rescheduled_slot_full',
          originalSlotId: token.slotId,
          targetSlotId: newSchedule.newSlotId,
          requiresManualIntervention: true
        });

        return {
          success: false,
          action: 'pending_manual',
          reason: 'Rescheduled slot is full and no alternatives available'
        };
      }

      const alternativeSlot = alternativeSlotsResult.data.alternatives[0];
      return await this.moveTokenToAlternativeSlot(token, alternativeSlot, 'slot_rescheduled');
    }

    // Move to the rescheduled slot
    return await this.moveTokenToAlternativeSlot(token, newSlot, 'slot_rescheduled');
  }

  
  async handleCapacityReduction(token) {

    const slotTokens = await this.tokenRepository.findBySlot(token.slotId);
    const activeTokens = slotTokens.filter(t => 
      ['allocated', 'confirmed'].includes(t.status)
    );

    // Sort by priority (ascending) to move lowest priority tokens first
    activeTokens.sort((a, b) => a.priority - b.priority);

    const slot = await this.slotRepository.findOne({ slotId: token.slotId });
    if (!slot) {
      return {
        success: false,
        action: 'error',
        reason: 'Original slot not found'
      };
    }

    // Check if this token needs to be moved (is it among the excess tokens?)
    const excessCount = activeTokens.length - slot.maxCapacity;
    const tokenIndex = activeTokens.findIndex(t => t.tokenId === token.tokenId);

    if (tokenIndex >= slot.maxCapacity) {
      // This token needs to be moved
      const alternativeSlotsResult = await this.findAlternativeSlots(
        token.doctorId, 
        slot.date, 
        6 // 6-hour window for capacity reductions
      );

      if (!alternativeSlotsResult.success || alternativeSlotsResult.data.alternatives.length === 0) {
        await this.tokenRepository.updateStatus(token.tokenId, 'pending_reallocation', {
          reallocationReason: 'capacity_reduced',
          originalSlotId: token.slotId,
          requiresManualIntervention: true
        });

        return {
          success: false,
          action: 'pending_manual',
          reason: 'Capacity reduced and no alternative slots available'
        };
      }

      const alternativeSlot = alternativeSlotsResult.data.alternatives[0];
      return await this.moveTokenToAlternativeSlot(token, alternativeSlot, 'capacity_reduced');
    }

    // Token can stay in the original slot
    return {
      success: true,
      action: 'retained',
      reason: 'Token retained in original slot after capacity reduction'
    };
  }

  
  async handleEmergencyInsertion(emergencyRequest) {
    return this.executeOperation('handleEmergencyInsertion', async () => {
      this.validateRequired(emergencyRequest, ['patientId', 'urgencyLevel']);
      
      const { 
        patientId, 
        department, 
        doctorId, 
        slotId, 
        preferredSlotId, 
        patientInfo = {}, 
        urgencyLevel 
      } = emergencyRequest;

      // Require either department or doctorId
      if (!department && !doctorId) {
        return this.createErrorResponse(
          'MISSING_DEPARTMENT_OR_DOCTOR',
          'Either department or doctorId must be specified for emergency insertion',
          { patientId },
          ['Specify department for smart allocation', 'Specify specific doctorId if preferred']
        );
      }
      
      // Use slotId as preferredSlotId if provided
      const targetSlotId = slotId || preferredSlotId;

      // Calculate emergency priority (always highest)
      const priorityResult = await this.priorityCalculationService.calculatePriority(
        'emergency', 
        { ...patientInfo, urgencyLevel }, 
        0 // Emergency patients have no waiting time initially
      );

      if (!priorityResult.success) {
        return priorityResult;
      }

      const emergencyPriority = priorityResult.data.finalPriority;

      // Find the best slot for emergency insertion using department-based logic
      const slotSelectionResult = await this.selectEmergencySlotByDepartment(
        department, 
        doctorId, 
        targetSlotId
      );
      
      if (!slotSelectionResult.success) {
        return slotSelectionResult;
      }

      const targetSlot = slotSelectionResult.data.selectedSlot;
      const selectedDoctorId = slotSelectionResult.data.selectedDoctorId;
      const insertionMethod = slotSelectionResult.data.method;

      // Perform emergency insertion based on the method
      let insertionResult;
      
      switch (insertionMethod) {
        case 'direct':
          insertionResult = await this.insertEmergencyDirect(
            patientId, selectedDoctorId, targetSlot, emergencyPriority, patientInfo, urgencyLevel
          );
          break;
          
        case 'preemption':
          insertionResult = await this.insertEmergencyWithPreemption(
            patientId, selectedDoctorId, targetSlot, emergencyPriority, patientInfo, urgencyLevel
          );
          break;
          
        case 'capacity_override':
          insertionResult = await this.insertEmergencyWithCapacityOverride(
            patientId, selectedDoctorId, targetSlot, emergencyPriority, patientInfo, urgencyLevel
          );
          break;
          
        default:
          return this.createErrorResponse(
            'EMERGENCY_INSERTION_FAILED',
            'Unable to determine insertion method',
            { method: insertionMethod }
          );
      }

      if (insertionResult.success) {
        insertionResult.data.departmentInfo = {
          department: department || 'unknown',
          selectedDoctorId,
          allocationMethod: 'department_based_smart_allocation'
        };
      }

      return insertionResult;

    }, emergencyRequest);
  }

  async selectEmergencySlotByDepartment(department, preferredDoctorId = null, preferredSlotId = null) {
    try {
      this.logger.info(`selectEmergencySlotByDepartment: Looking for emergency slot in ${department} department`);
      
      //If specific slot is preferred, try it first
      if (preferredSlotId) {
        this.logger.info(`Checking preferred slot: ${preferredSlotId}`);
        const preferredSlot = await this.slotRepository.findBySlotId(preferredSlotId);
        
        if (preferredSlot && preferredSlot.status === 'active') {
          // Check if slot belongs to the department
          const slotDepartment = preferredSlot.specialty || 'general';
          if (slotDepartment === department || department === 'general') {
            const result = await this.evaluateSlotForEmergency(preferredSlot);
            if (result.success) {
              return this.createSuccessResponse({
                selectedSlot: preferredSlot,
                selectedDoctorId: preferredSlot.doctorId,
                method: result.data.method,
                reason: 'preferred_slot_available'
              }, 'Using preferred slot');
            }
          }
        }
      }

      // If specific doctor is preferred, try their slots first
      if (preferredDoctorId) {
        this.logger.info(`Checking preferred doctor: ${preferredDoctorId}`);
        const doctorSlotsResult = await this.findBestSlotForDoctor(preferredDoctorId);
        this.logger.info(`Preferred doctor slot result:`, { success: doctorSlotsResult.success });
        if (doctorSlotsResult.success) {
          return this.createSuccessResponse({
            selectedSlot: doctorSlotsResult.data.slot,
            selectedDoctorId: preferredDoctorId,
            method: doctorSlotsResult.data.method,
            reason: 'preferred_doctor_available'
          }, 'Using preferred doctor slot');
        }
      }

      // Find all doctors in the department
      this.logger.info(`Finding doctors in department: ${department}`);
      const departmentDoctors = await this.getDoctorsByDepartment(department);
      this.logger.info(`Found ${departmentDoctors.length} doctors in ${department} department`);
      
      if (departmentDoctors.length === 0) {
        return this.createErrorResponse(
          'NO_DOCTORS_IN_DEPARTMENT',
          `No doctors found in ${department} department`,
          { department },
          ['Check department name', 'Contact hospital administration', 'Try different department']
        );
      }

      // Find the best doctor with available slots (least loaded first)
      this.logger.info(`Calculating workloads for ${departmentDoctors.length} doctors`);
      const doctorWorkloads = await this.calculateDoctorWorkloads(departmentDoctors);
      this.logger.info(`Calculated workloads for ${doctorWorkloads.length} doctors`);
      
      // Sort by workload (ascending - least busy first)
      doctorWorkloads.sort((a, b) => a.currentPatients - b.currentPatients);

      // Try each doctor starting with least loaded
      this.logger.info(`Trying each doctor for emergency slot allocation`);
      for (const doctorWorkload of doctorWorkloads) {
        this.logger.info(`Trying doctor: ${doctorWorkload.doctorId} (${doctorWorkload.currentPatients} current patients)`);
        const doctorSlotsResult = await this.findBestSlotForDoctor(doctorWorkload.doctorId);
        this.logger.info(`Doctor ${doctorWorkload.doctorId} slot result:`, { success: doctorSlotsResult.success });
        
        if (doctorSlotsResult.success) {
          return this.createSuccessResponse({
            selectedSlot: doctorSlotsResult.data.slot,
            selectedDoctorId: doctorWorkload.doctorId,
            method: doctorSlotsResult.data.method,
            reason: 'least_loaded_doctor_selected',
            doctorWorkload: {
              currentPatients: doctorWorkload.currentPatients,
              availableSlots: doctorWorkload.availableSlots
            }
          }, `Selected least loaded doctor in ${department} department`);
        }
      }

      // No available slots found - try preemption across all department doctors
      for (const doctorWorkload of doctorWorkloads) {
        const preemptionResult = await this.findPreemptionSlotForDoctor(doctorWorkload.doctorId);
        
        if (preemptionResult.success) {
          return this.createSuccessResponse({
            selectedSlot: preemptionResult.data.slot,
            selectedDoctorId: doctorWorkload.doctorId,
            method: 'preemption',
            reason: 'no_available_slots_using_preemption'
          }, `Using preemption with doctor in ${department} department`);
        }
      }

      // Last resort - capacity override with least loaded doctor
      const leastLoadedDoctor = doctorWorkloads[0];
      const overrideResult = await this.findCapacityOverrideSlotForDoctor(leastLoadedDoctor.doctorId);
      
      if (overrideResult.success) {
        return this.createSuccessResponse({
          selectedSlot: overrideResult.data.slot,
          selectedDoctorId: leastLoadedDoctor.doctorId,
          method: 'capacity_override',
          reason: 'emergency_capacity_override'
        }, `Using capacity override with least loaded doctor in ${department} department`);
      }

      // No options available
      return this.createErrorResponse(
        'NO_EMERGENCY_SLOTS_AVAILABLE',
        `No suitable slots found in ${department} department for emergency insertion`,
        { 
          department,
          availableDoctors: departmentDoctors.length,
          searchedDoctors: doctorWorkloads.map(d => ({
            doctorId: d.doctorId,
            currentPatients: d.currentPatients
          }))
        },
        [
          'Contact hospital administration immediately',
          'Try a different department',
          'Consider manual override',
          'Transfer to another facility if critical'
        ]
      );

    } catch (error) {
      this.logger.error('Error in selectEmergencySlotByDepartment:', error);
      return this.createErrorResponse(
        'EMERGENCY_SLOT_SELECTION_ERROR',
        'Error occurred while selecting emergency slot',
        { department, error: error.message },
        ['Try again', 'Contact system administrator']
      );
    }
  }

 
  async calculateDoctorWorkloads(doctors) {
    const workloads = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    for (const doctor of doctors) {
      try {
        // Count current patients for today
        const todayTokens = await this.tokenRepository.find({
          doctorId: doctor.doctorId,
          createdAt: { $gte: today, $lte: endOfDay },
          status: { $in: ['allocated', 'confirmed'] }
        });

        // Count available slots for today
        const todaySlots = await this.slotRepository.find({
          doctorId: doctor.doctorId,
          date: { $gte: today, $lte: endOfDay },
          status: 'active'
        });

        const availableCapacity = todaySlots.reduce((total, slot) => {
          return total + Math.max(0, slot.maxCapacity - slot.currentAllocation);
        }, 0);

        workloads.push({
          doctorId: doctor.doctorId,
          doctorName: doctor.personalInfo?.name || 'Unknown',
          currentPatients: todayTokens.length,
          totalSlots: todaySlots.length,
          availableSlots: availableCapacity,
          utilizationRate: todaySlots.length > 0 ? (todayTokens.length / todaySlots.reduce((sum, s) => sum + s.maxCapacity, 0)) * 100 : 0
        });
      } catch (error) {
        this.logger.error(`Error calculating workload for doctor ${doctor.doctorId}:`, error);
        // Add doctor with unknown workload
        workloads.push({
          doctorId: doctor.doctorId,
          doctorName: doctor.personalInfo?.name || 'Unknown',
          currentPatients: 999, // High number to put at end of list
          totalSlots: 0,
          availableSlots: 0,
          utilizationRate: 100
        });
      }
    }

    return workloads;
  }

 
  async findBestSlotForDoctor(doctorId) {
    try {
      this.logger.info(`findBestSlotForDoctor: Looking for slots for doctor ${doctorId}`);
      
      const currentTime = new Date();
      const startOfDay = new Date(currentTime);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(currentTime);
      endOfDay.setUTCHours(23, 59, 59, 999);

      this.logger.info(`Searching for slots between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);

      // Find all active slots for the doctor today
      const doctorSlots = await this.slotRepository.find({
        doctorId,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: 'active'
      }, { sort: { startTime: 1 } }); // Sort by start time

      this.logger.info(`Found ${doctorSlots.length} slots for doctor ${doctorId}`);

      for (const slot of doctorSlots) {
        this.logger.info(`Evaluating slot: ${slot.slotId}`);
        const evaluation = await this.evaluateSlotForEmergency(slot);
        this.logger.info(`Slot ${slot.slotId} evaluation:`, { success: evaluation.success, method: evaluation.data?.method });
        
        if (evaluation.success) {
          return this.createSuccessResponse({
            slot,
            method: evaluation.data.method
          }, 'Found available slot for doctor');
        }
      }

      return this.createErrorResponse(
        'NO_SLOTS_FOR_DOCTOR',
        `No available slots found for doctor ${doctorId}`,
        { doctorId }
      );
    } catch (error) {
      this.logger.error(`Error finding slots for doctor ${doctorId}:`, error);
      return this.createErrorResponse(
        'DOCTOR_SLOT_SEARCH_ERROR',
        'Error searching doctor slots',
        { doctorId, error: error.message }
      );
    }
  }

 
  async evaluateSlotForEmergency(slot) {
    try {
      this.logger.info(`evaluateSlotForEmergency: Evaluating slot ${slot.slotId} (capacity: ${slot.maxCapacity})`);
      
      const currentTokens = await this.tokenRepository.findBySlot(slot.slotId);
      const activeTokens = currentTokens.filter(t => 
        ['allocated', 'confirmed'].includes(t.status)
      );

      this.logger.info(`Slot ${slot.slotId}: ${activeTokens.length}/${slot.maxCapacity} tokens allocated`);

      // Check if slot has capacity
      if (activeTokens.length < slot.maxCapacity) {
        this.logger.info(`Slot ${slot.slotId} has available capacity - using direct method`);
        return this.createSuccessResponse({
          method: 'direct'
        }, 'Slot has available capacity');
      }

      // Check if there are preemptable tokens
      this.logger.info(`Slot ${slot.slotId} is full, checking for preemptable tokens`);
      const preemptableTokens = await this.findPreemptableTokens(slot.slotId, 1000); // Emergency priority
      this.logger.info(`Found ${preemptableTokens.length} preemptable tokens in slot ${slot.slotId}`);
      
      if (preemptableTokens.length > 0) {
        this.logger.info(`Slot ${slot.slotId} has preemptable tokens - using preemption method`);
        return this.createSuccessResponse({
          method: 'preemption'
        }, 'Slot has preemptable tokens');
      }

      // Capacity override as last resort
      return this.createSuccessResponse({
        method: 'capacity_override'
      }, 'Slot available via capacity override');

    } catch (error) {
      this.logger.error('Error evaluating slot for emergency:', error);
      return this.createErrorResponse(
        'SLOT_EVALUATION_ERROR',
        'Error evaluating slot',
        { slotId: slot.slotId, error: error.message }
      );
    }
  }

  
  async findPreemptionSlotForDoctor(doctorId) {
    try {
      const currentTime = new Date();
      const endOfDay = new Date(currentTime);
      endOfDay.setHours(23, 59, 59, 999);

      const doctorSlots = await this.slotRepository.find({
        doctorId,
        date: { $gte: currentTime, $lte: endOfDay },
        status: 'active'
      });

      for (const slot of doctorSlots) {
        const preemptableTokens = await this.findPreemptableTokens(slot.slotId, 1000);
        if (preemptableTokens.length > 0) {
          return this.createSuccessResponse({
            slot,
            preemptableTokens
          }, 'Found slot with preemptable tokens');
        }
      }

      return this.createErrorResponse(
        'NO_PREEMPTION_SLOTS',
        `No preemptable slots found for doctor ${doctorId}`,
        { doctorId }
      );
    } catch (error) {
      return this.createErrorResponse(
        'PREEMPTION_SEARCH_ERROR',
        'Error searching for preemption slots',
        { doctorId, error: error.message }
      );
    }
  }

 
  async findCapacityOverrideSlotForDoctor(doctorId) {
    try {
      const currentTime = new Date();
      const endOfDay = new Date(currentTime);
      endOfDay.setHours(23, 59, 59, 999);

      const doctorSlots = await this.slotRepository.find({
        doctorId,
        date: { $gte: currentTime, $lte: endOfDay },
        status: 'active'
      }, { sort: { startTime: 1 } });

      if (doctorSlots.length > 0) {
        // Use the earliest slot for capacity override
        return this.createSuccessResponse({
          slot: doctorSlots[0]
        }, 'Found slot for capacity override');
      }

      return this.createErrorResponse(
        'NO_OVERRIDE_SLOTS',
        `No slots found for capacity override for doctor ${doctorId}`,
        { doctorId }
      );
    } catch (error) {
      return this.createErrorResponse(
        'OVERRIDE_SEARCH_ERROR',
        'Error searching for capacity override slots',
        { doctorId, error: error.message }
      );
    }
  }

  async selectEmergencySlot(doctorId, preferredSlotId = null) {
    // If preferred slot is specified, try it first
    if (preferredSlotId) {
      const preferredSlot = await this.slotRepository.findBySlotId(preferredSlotId);
      
      if (preferredSlot && preferredSlot.doctorId === doctorId && preferredSlot.status === 'active') {
        const currentTokens = await this.tokenRepository.findBySlot(preferredSlot.slotId);
        const activeTokens = currentTokens.filter(t => 
          ['allocated', 'confirmed'].includes(t.status)
        );

        // Check if slot has capacity
        if (activeTokens.length < preferredSlot.maxCapacity) {
          return this.createSuccessResponse(
            { selectedSlot: preferredSlot, method: 'direct' },
            'Preferred slot has available capacity'
          );
        }

        // Check if there are preemptable tokens
        const preemptableTokens = await this.findPreemptableTokens(preferredSlot.slotId, 1000); // Emergency priority
        if (preemptableTokens.length > 0) {
          return this.createSuccessResponse(
            { selectedSlot: preferredSlot, method: 'preemption' },
            'Preferred slot available via preemption'
          );
        }

        // Use capacity override as last resort for preferred slot
        return this.createSuccessResponse(
          { selectedSlot: preferredSlot, method: 'capacity_override' },
          'Using preferred slot with capacity override'
        );
      } else if (preferredSlot) {
        // Slot exists but doesn't match doctor or is inactive
        this.logger.warn(`Preferred slot ${preferredSlotId} exists but doctorId mismatch or inactive`, {
          slotDoctorId: preferredSlot.doctorId,
          requestedDoctorId: doctorId,
          slotStatus: preferredSlot.status
        });
      } else {
        // Slot doesn't exist
        this.logger.warn(`Preferred slot ${preferredSlotId} not found`);
      }
    }

    // Find the best available slot for the doctor
    const currentTime = new Date();
    const endOfDay = new Date(currentTime);
    endOfDay.setHours(23, 59, 59, 999);

    // Look for slots in the next 4 hours first
    const nearTermSlots = await this.slotRepository.findByDateRange(
      currentTime,
      new Date(currentTime.getTime() + 4 * 60 * 60 * 1000),
      { doctorId, status: 'active' }
    );

    // Try to find a slot with available capacity
    for (const slot of nearTermSlots) {
      const currentTokens = await this.tokenRepository.findBySlot(slot.slotId);
      const activeTokens = currentTokens.filter(t => 
        ['allocated', 'confirmed'].includes(t.status)
      );

      if (activeTokens.length < slot.maxCapacity) {
        return this.createSuccessResponse(
          { selectedSlot: slot, method: 'direct' },
          'Found slot with available capacity'
        );
      }
    }

    // Try to find a slot with preemptable tokens
    for (const slot of nearTermSlots) {
      const preemptableTokens = await this.findPreemptableTokens(slot.slotId, 1000); // Emergency priority
      if (preemptableTokens.length > 0) {
        return this.createSuccessResponse(
          { selectedSlot: slot, method: 'preemption' },
          'Found slot with preemptable tokens'
        );
      }
    }

    // As last resort, use capacity override on the earliest slot
    if (nearTermSlots.length > 0) {
      return this.createSuccessResponse(
        { selectedSlot: nearTermSlots[0], method: 'capacity_override' },
        'Using capacity override on earliest available slot'
      );
    }

    // No suitable slots found
    return this.createErrorResponse(
      'NO_EMERGENCY_SLOT_AVAILABLE',
      'No suitable slots found for emergency insertion',
      { doctorId, searchWindow: '4 hours' },
      ['Contact hospital administration', 'Try a different doctor', 'Use manual override']
    );
  }

  async insertEmergencyDirect(patientId, doctorId, slot, priority, patientInfo, urgencyLevel) {
    // Use atomic findOneAndUpdate to increment allocation count and get next token number
    const updatedSlot = await this.slotRepository.model.findOneAndUpdate(
      { 
        slotId: slot.slotId,
        currentAllocation: { $lt: slot.maxCapacity }
      },
      { 
        $inc: { currentAllocation: 1, lastTokenNumber: 1 }
      },
      { 
        new: true,
        upsert: false
      }
    );

    if (!updatedSlot) {
      throw new Error('Slot at capacity or not found');
    }

    const tokenNumber = updatedSlot.lastTokenNumber;
    
    const tokenData = {
      tokenId: `emergency_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      patientId,
      doctorId,
      slotId: slot.slotId,
      tokenNumber,
      source: 'emergency',
      priority,
      status: 'allocated',
      metadata: {
        urgencyLevel,
        emergencyInsertedAt: new Date(),
        insertionMethod: 'direct',
        estimatedServiceTime: patientInfo.estimatedServiceTime || 20 // Emergency patients may need more time
      }
    };

    try {
      const emergencyToken = await this.tokenRepository.create(tokenData);

      return this.createSuccessResponse(
        {
          token: emergencyToken,
          insertionMethod: 'direct',
          preemptedTokens: [],
          slotInfo: {
            slotId: slot.slotId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            date: slot.date,
            currentAllocation: updatedSlot.currentAllocation,
            maxCapacity: slot.maxCapacity
          }
        },
        'Emergency patient inserted successfully'
      );
    } catch (error) {
      // If token creation failed, rollback the slot allocation
      await this.slotRepository.model.findOneAndUpdate(
        { slotId: slot.slotId },
        { 
          $inc: { currentAllocation: -1, lastTokenNumber: -1 }
        }
      );
      throw error;
    }
  }

  
  async insertEmergencyWithPreemption(patientId, doctorId, slot, priority, patientInfo, urgencyLevel) {
    // Find tokens to preempt (lowest priority first)
    const preemptableTokens = await this.findPreemptableTokens(slot.slotId, priority);
    
    if (preemptableTokens.length === 0) {
      return this.createErrorResponse(
        'NO_PREEMPTABLE_TOKENS',
        'No tokens available for preemption',
        { slotId: slot.slotId }
      );
    }

    // Select the lowest priority token to preempt
    const tokenToPreempt = preemptableTokens[0];
    
    // Create emergency token with preempted token's number
    const tokenData = {
      tokenId: `emergency_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      patientId,
      doctorId,
      slotId: slot.slotId,
      tokenNumber: tokenToPreempt.tokenNumber,
      source: 'emergency',
      priority,
      status: 'allocated',
      metadata: {
        urgencyLevel,
        emergencyInsertedAt: new Date(),
        insertionMethod: 'preemption',
        preemptedTokens: [tokenToPreempt.tokenId],
        estimatedServiceTime: patientInfo.estimatedServiceTime || 20
      }
    };

    const emergencyToken = await this.tokenRepository.create(tokenData);

    // Reallocate the preempted token
    const reallocationResults = await this.reallocatePreemptedTokens([tokenToPreempt]);

    return this.createSuccessResponse(
      {
        token: emergencyToken,
        insertionMethod: 'preemption',
        preemptedTokens: [{
          tokenId: tokenToPreempt.tokenId,
          patientId: tokenToPreempt.patientId,
          originalSlotId: slot.slotId,
          reallocationResult: reallocationResults[0]
        }],
        slotInfo: {
          slotId: slot.slotId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          date: slot.date
        }
      },
      'Emergency patient inserted with preemption'
    );
  }

  
  async insertEmergencyWithCapacityOverride(patientId, doctorId, slot, priority, patientInfo, urgencyLevel) {
    // Use atomic update to increment allocation and get next token number
    const updatedSlot = await this.slotRepository.model.findOneAndUpdate(
      { slotId: slot.slotId },
      { 
        $inc: { currentAllocation: 1, lastTokenNumber: 1 }
      },
      { 
        new: true,
        upsert: false
      }
    );

    if (!updatedSlot) {
      throw new Error('Slot not found for capacity override');
    }

    const tokenNumber = updatedSlot.lastTokenNumber;
    
    const tokenData = {
      tokenId: `emergency_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      patientId,
      doctorId,
      slotId: slot.slotId,
      tokenNumber,
      source: 'emergency',
      priority,
      status: 'allocated',
      metadata: {
        urgencyLevel,
        emergencyInsertedAt: new Date(),
        insertionMethod: 'capacity_override',
        capacityOverride: true,
        estimatedServiceTime: patientInfo.estimatedServiceTime || 20
      }
    };

    try {
      const emergencyToken = await this.tokenRepository.create(tokenData);
      
      // Log capacity override
      this.logger.warn(`Emergency capacity override for slot ${slot.slotId}`, {
        slotId: slot.slotId,
        newAllocation: updatedSlot.currentAllocation,
        maxCapacity: slot.maxCapacity,
        emergencyTokenId: emergencyToken.tokenId,
        urgencyLevel
      });

      return this.createSuccessResponse(
        {
          token: emergencyToken,
          insertionMethod: 'capacity_override',
          preemptedTokens: [],
          capacityOverride: true,
          slotInfo: {
            slotId: slot.slotId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            date: slot.date,
            currentAllocation: updatedSlot.currentAllocation,
            maxCapacity: slot.maxCapacity
          }
        },
        'Emergency patient inserted with capacity override'
      );
    } catch (error) {
      // If token creation failed, rollback the slot allocation
      await this.slotRepository.model.findOneAndUpdate(
        { slotId: slot.slotId },
        { 
          $inc: { currentAllocation: -1, lastTokenNumber: -1 }
        }
      );
      throw error;
    }
  }

  async reallocatePreemptedTokens(preemptedTokens) {
    const results = [];
    
    for (const token of preemptedTokens) {
      try {
        const result = await this.reallocatePreemptedToken(token);
        results.push(result);
      } catch (error) {
        this.logger.error(`Error reallocating preempted token ${token.tokenId}:`, error);
        results.push({
          success: false,
          action: 'error',
          reason: 'System error during reallocation'
        });
      }
    }
    
    return results;
  }

  async moveTokenToAlternativeSlot(token, alternativeSlot, reason) {
    try {
      const newTokenNumber = await this.tokenRepository.getNextTokenNumber(alternativeSlot.slotId);

      // Move token to alternative slot
      await this.tokenRepository.moveToSlot(
        token.tokenId, 
        alternativeSlot.slotId, 
        newTokenNumber
      );

      // Update token metadata
      const tokenDoc = await this.tokenRepository.findOne({ tokenId: token.tokenId });
      if (tokenDoc) {
        await this.tokenRepository.updateById(tokenDoc._id, {
          'metadata.originalSlotId': token.slotId,
          'metadata.reallocationReason': reason,
          'metadata.reallocatedAt': new Date()
        });
      }

      // Update slot allocations
      const originalSlot = await this.slotRepository.findOne({ slotId: token.slotId });
      if (originalSlot) {
        await this.slotRepository.decrementAllocation(originalSlot._id);
      }
      
      const newSlot = await this.slotRepository.findOne({ slotId: alternativeSlot.slotId });
      if (newSlot) {
        await this.slotRepository.incrementAllocation(newSlot._id);
      }

      return {
        success: true,
        action: 'reallocated',
        newSlotId: alternativeSlot.slotId,
        newTokenNumber,
        newSlotTime: `${alternativeSlot.startTime} - ${alternativeSlot.endTime}`,
        newSlotDate: alternativeSlot.date,
        reason
      };

    } catch (error) {
      this.logger.error(`Error moving token ${token.tokenId} to alternative slot:`, error);
      
      // Mark token for manual handling
      await this.tokenRepository.updateStatus(token.tokenId, 'pending_reallocation', {
        reallocationReason: reason,
        originalSlotId: token.slotId,
        targetSlotId: alternativeSlot.slotId,
        error: error.message,
        requiresManualIntervention: true
      });

      return {
        success: false,
        action: 'error',
        reason: 'System error during token move'
      };
    }
  }

  
  validateAllocationRequest(request) {
    const errors = [];

    if (!request.patientId) errors.push('patientId is required');
    if (!request.doctorId) errors.push('doctorId is required');
    if (!request.slotId) errors.push('slotId is required');
    if (!request.source) errors.push('source is required');

    const validSources = ['online', 'walkin', 'priority', 'followup', 'emergency'];
    if (request.source && !validSources.includes(request.source)) {
      errors.push(`source must be one of: ${validSources.join(', ')}`);
    }

    if (request.waitingTime && (typeof request.waitingTime !== 'number' || request.waitingTime < 0)) {
      errors.push('waitingTime must be a non-negative number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  
  getConcurrencyStatus() {
    return {
      ongoingOperations: this.concurrencyManager.getOngoingOperations(),
      operationCount: this.concurrencyManager.getOngoingOperations().length
    };
  }

  
  async updateToken(tokenId, updateData) {
    return this.executeOperation('updateToken', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);
      
      const token = await this.tokenRepository.findByTokenId(tokenId);
      
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`,
          { tokenId },
          ['Check the token ID', 'Verify the token exists']
        );
      }

      const updatedToken = await this.tokenRepository.updateStatus(tokenId, updateData.status || token.status, updateData);

      return this.createSuccessResponse(
        { token: updatedToken },
        'Token updated successfully'
      );
    }, { tokenId });
  }

 
  async getTokens(criteria, options = {}) {
    return this.executeOperation('getTokens', async () => {
      const tokens = await this.tokenRepository.find(criteria, options);
      const totalCount = await this.tokenRepository.count(criteria);

      return this.createSuccessResponse(
        { 
          tokens,
          totalCount,
          page: options.page || 1,
          limit: options.limit || 10
        },
        `Found ${tokens.length} tokens`
      );
    }, criteria);
  }

  
  async reallocateTokens(params) {
    return this.executeOperation('reallocateTokens', async () => {
      return this.createSuccessResponse(
        { reallocatedCount: 0 },
        'Token reallocation not yet implemented'
      );
    }, params);
  }

  
  async getTokenStatistics(params) {
    return this.executeOperation('getTokenStatistics', async () => {
      const startDate = params.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = params.endDate || new Date();
      
      return await this.getAllocationStatistics(startDate, endDate);
    }, params);
  }

  
  async getWaitingList(criteria, options = {}) {
    return this.executeOperation('getWaitingList', async () => {
      const waitingCriteria = {
        ...criteria,
        status: { $in: ['allocated', 'confirmed'] }
      };

      const tokens = await this.tokenRepository.find(waitingCriteria, {
        ...options,
        sort: { priority: -1, createdAt: 1 }
      });

      return this.createSuccessResponse(
        { 
          waitingList: tokens,
          totalWaiting: tokens.length
        },
        `Found ${tokens.length} tokens in waiting list`
      );
    }, criteria);
  }

  
  async batchUpdateTokens(params) {
    return this.executeOperation('batchUpdateTokens', async () => {
      const { tokenIds, updates } = params;
      const results = [];

      for (const tokenId of tokenIds) {
        try {
          const result = await this.updateToken(tokenId, updates);
          results.push({ tokenId, success: result.success });
        } catch (error) {
          results.push({ tokenId, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return this.createSuccessResponse(
        { 
          results,
          successCount,
          failureCount: results.length - successCount
        },
        `Batch update completed: ${successCount}/${results.length} successful`
      );
    }, params);
  }

 
  async getTokensBySlot(slotId, options = {}) {
    return this.executeOperation('getTokensBySlot', async () => {
      this.validateRequired({ slotId }, ['slotId']);
      
      const tokens = await this.tokenRepository.findBySlot(slotId, options);

      return this.createSuccessResponse(
        { 
          tokens,
          slotId,
          tokenCount: tokens.length
        },
        `Found ${tokens.length} tokens for slot ${slotId}`
      );
    }, { slotId });
  }

  /**
   * Moves a token to a different slot
   * @param {string} tokenId - Token ID
   * @param {string} newSlotId - New slot ID
   * @param {Object} options - Move options
   * @returns {Promise<Object>} Service response
   */
  async moveTokenToSlot(tokenId, newSlotId, options = {}) {
    return this.executeOperation('moveTokenToSlot', async () => {
      this.validateRequired({ tokenId, newSlotId }, ['tokenId', 'newSlotId']);
      
      return await this.rescheduleToken(tokenId, newSlotId, options.reason || 'user_requested');
    }, { tokenId, newSlotId });
  }

  
  async confirmToken(tokenId, confirmationData = {}) {
    return this.executeOperation('confirmToken', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);
      
      const token = await this.tokenRepository.findByTokenId(tokenId);
      
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`,
          { tokenId }
        );
      }

      if (token.status !== 'allocated') {
        return this.createErrorResponse(
          'INVALID_TOKEN_STATUS',
          'Only allocated tokens can be confirmed',
          { currentStatus: token.status }
        );
      }

      const updatedToken = await this.tokenRepository.updateStatus(tokenId, 'confirmed', {
        confirmedAt: confirmationData.checkInTime || new Date(),
        confirmedBy: confirmationData.confirmedBy
      });

      return this.createSuccessResponse(
        { token: updatedToken },
        'Token confirmed successfully'
      );
    }, { tokenId });
  }

  
  async completeToken(tokenId, completionData = {}) {
    return this.executeOperation('completeToken', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);
      
      const token = await this.tokenRepository.findByTokenId(tokenId);
      
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`,
          { tokenId }
        );
      }

      if (token.status !== 'confirmed') {
        return this.createErrorResponse(
          'INVALID_TOKEN_STATUS',
          'Only confirmed tokens can be completed',
          { currentStatus: token.status }
        );
      }

      const updatedToken = await this.tokenRepository.updateStatus(tokenId, 'completed', {
        completedAt: completionData.completionTime || new Date(),
        completedBy: completionData.completedBy,
        followupRequired: completionData.followupRequired,
        followupDate: completionData.followupDate
      });

      // Release the slot capacity
      const slot = await this.slotRepository.findOne({ slotId: token.slotId });
      if (slot) {
        await this.slotRepository.decrementAllocation(token.slotId);
      }

      return this.createSuccessResponse(
        { token: updatedToken },
        'Token completed successfully'
      );
    }, { tokenId });
  }

  
  async markNoShow(tokenId, noShowData = {}) {
    return this.executeOperation('markNoShow', async () => {
      this.validateRequired({ tokenId }, ['tokenId']);
      
      const token = await this.tokenRepository.findByTokenId(tokenId);
      
      if (!token) {
        return this.createErrorResponse(
          'TOKEN_NOT_FOUND',
          `Token with ID ${tokenId} not found`,
          { tokenId },
          ['Check the token ID', 'Verify the token exists']
        );
      }

      if (token.status !== 'confirmed') {
        return this.createErrorResponse(
          'INVALID_TOKEN_STATUS',
          'Only confirmed tokens can be marked as no-show',
          { 
            currentStatus: token.status,
            tokenId 
          },
          [
            'Token must be confirmed first',
            'Check token status',
            'Use appropriate endpoint for current status'
          ]
        );
      }

      const updatedToken = await this.tokenRepository.updateStatus(tokenId, 'noshow', {
        noShowMarkedAt: new Date(),
        noShowMarkedBy: noShowData.markedBy,
        noShowReason: noShowData.reason,
        noShowNotes: noShowData.notes
      });

      // Release the slot capacity since patient didn't show up
      const slot = await this.slotRepository.findOne({ slotId: token.slotId });
      if (slot) {
        await this.slotRepository.decrementAllocation(token.slotId);
      }

      globalAuditLogger.logTokenOperation('no_show', updatedToken, {
        userId: noShowData.markedBy,
        severity: AUDIT_SEVERITY.MEDIUM,
        metadata: {
          reason: noShowData.reason,
          markedBy: noShowData.markedBy
        }
      });

      return this.createSuccessResponse(
        { token: updatedToken },
        'Token marked as no-show successfully'
      );
    }, { tokenId });
  }

  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = TokenAllocationService;