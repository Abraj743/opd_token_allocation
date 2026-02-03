const BaseService = require('./BaseService');


class SlotGenerationService extends BaseService {
  constructor({ 
    doctorScheduleModel, 
    slotRepository, 
    tokenRepository,
    logger 
  }) {
    super({ logger });
    this.doctorScheduleModel = doctorScheduleModel;
    this.slotRepository = slotRepository;
    this.tokenRepository = tokenRepository;
  }

  async generateSlotsForToday() {
    return this.executeOperation('generateSlotsForToday', async () => {
      const today = new Date();
      const dayName = this.getDayName(today);
      
      this.logger.info(`Starting slot generation for ${dayName} - ${today.toDateString()}`);

      
      const activeDoctors = await this.doctorScheduleModel.findActiveDoctors();
      
      if (activeDoctors.length === 0) {
        return this.createSuccessResponse({
          generatedSlots: 0,
          processedDoctors: 0
        }, 'No active doctors found');
      }

      const results = {
        processedDoctors: 0,
        generatedSlots: 0,
        updatedSlots: 0,
        skippedDoctors: 0,
        errors: []
      };

    
      for (const doctorSchedule of activeDoctors) {
        try {
          const doctorResult = await this.generateSlotsForDoctor(doctorSchedule, today, dayName);
          
          results.processedDoctors++;
          results.generatedSlots += doctorResult.generatedSlots;
          results.updatedSlots += doctorResult.updatedSlots;
          
          if (doctorResult.skipped) {
            results.skippedDoctors++;
          }

        } catch (error) {
          this.logger.error(`Error processing doctor ${doctorSchedule.doctorId}:`, error);
          results.errors.push({
            doctorId: doctorSchedule.doctorId,
            error: error.message
          });
        }
      }

      this.logger.info(`Slot generation completed:`, results);

      return this.createSuccessResponse(results, 
        `Generated ${results.generatedSlots} new slots and updated ${results.updatedSlots} existing slots for ${results.processedDoctors} doctors`
      );
    });
  }

  
  async generateSlotsForDoctor(doctorSchedule, date, dayName) {
    const daySchedule = doctorSchedule.getScheduleForDay(dayName);
    
    if (daySchedule.length === 0) {
      this.logger.debug(`Doctor ${doctorSchedule.doctorId} has no schedule for ${dayName}`);
      return { generatedSlots: 0, updatedSlots: 0, skipped: true };
    }

    let generatedSlots = 0;
    let updatedSlots = 0;

    
    for (const timeSlot of daySchedule) {
      const slotId = this.generateSlotId(doctorSchedule.doctorId, date, timeSlot.startTime);
      
      
      const existingSlot = await this.slotRepository.findBySlotId(slotId);
      
      if (existingSlot) {
       
        const updatedSlot = await this.updateExistingSlot(existingSlot);
        if (updatedSlot) {
          updatedSlots++;
        }
      } else {
      
        const newSlot = await this.createNewSlot(
          doctorSchedule, 
          date, 
          timeSlot, 
          slotId
        );
        if (newSlot) {
          generatedSlots++;
        }
      }
    }

    this.logger.debug(`Doctor ${doctorSchedule.doctorId}: Generated ${generatedSlots} new slots, updated ${updatedSlots} existing slots`);

    return { generatedSlots, updatedSlots, skipped: false };
  }

 
  async createNewSlot(doctorSchedule, date, timeSlot, slotId) {
    try {
      const normalizedDate = this.normalizeDate(date);
      this.logger.info(`Creating slot ${slotId} for date: ${date.toDateString()} -> normalized: ${normalizedDate.toISOString()}`);
      
      const slotData = {
        slotId,
        doctorId: doctorSchedule.doctorId,
        date: normalizedDate,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        maxCapacity: timeSlot.maxCapacity,
        currentAllocation: 0,
        lastTokenNumber: 0,
        status: 'active',
        specialty: doctorSchedule.department,
        slotType: timeSlot.slotType || 'regular',
        metadata: {
          generatedAt: new Date(),
          generatedBy: 'midnight_slot_generation',
          emergencyReserved: timeSlot.slotType === 'emergency_reserved' ? 1 : 0
        }
      };

      const createdSlot = await this.slotRepository.create(slotData);
      this.logger.info(`Created new slot: ${slotId} for doctor ${doctorSchedule.doctorId} on ${normalizedDate.toISOString()}`);
      
      return createdSlot;
    } catch (error) {
      this.logger.error(`Error creating slot ${slotId}:`, error);
      return null;
    }
  }

 
  async updateExistingSlot(existingSlot) {
    try {
      
      const activeTokens = await this.tokenRepository.find({
        slotId: existingSlot.slotId,
        status: { $in: ['allocated', 'confirmed'] }
      });

      const currentAllocation = activeTokens.length;
      const lastTokenNumber = activeTokens.length > 0 
        ? Math.max(...activeTokens.map(t => t.tokenNumber))
        : 0;

     
      const updatedSlot = await this.slotRepository.updateBySlotId(existingSlot.slotId, {
        currentAllocation,
        lastTokenNumber,
        'metadata.lastUpdated': new Date(),
        'metadata.updatedBy': 'midnight_slot_generation'
      });

      this.logger.debug(`Updated slot ${existingSlot.slotId}: ${currentAllocation}/${existingSlot.maxCapacity} allocated`);
      
      return updatedSlot;
    } catch (error) {
      this.logger.error(`Error updating slot ${existingSlot.slotId}:`, error);
      return null;
    }
  }

  generateSlotId(doctorId, date, startTime) {
    const normalizedDate = this.normalizeDate(date);
    const dateStr = normalizedDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = startTime.replace(':', ''); 
    return `slot_${doctorId}_${dateStr}_${timeStr}`;
  }

  
  getDayName(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getUTCDay()];
  }

 
  normalizeDate(date) {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }

 
  async generateSlotsForDate(targetDate) {
    return this.executeOperation('generateSlotsForDate', async () => {
      const dayName = this.getDayName(targetDate);
      
      this.logger.info(`Generating slots for ${dayName} - ${targetDate.toDateString()} (UTC: ${targetDate.toISOString()})`);

      const activeDoctors = await this.doctorScheduleModel.findActiveDoctors();
      
      if (activeDoctors.length === 0) {
        return this.createSuccessResponse({
          generatedSlots: 0,
          processedDoctors: 0
        }, 'No active doctors found');
      }
      
      const results = {
        processedDoctors: 0,
        generatedSlots: 0,
        updatedSlots: 0,
        skippedDoctors: 0,
        errors: []
      };

      for (const doctorSchedule of activeDoctors) {
        try {
          const doctorResult = await this.generateSlotsForDoctor(doctorSchedule, targetDate, dayName);
          
          results.processedDoctors++;
          results.generatedSlots += doctorResult.generatedSlots;
          results.updatedSlots += doctorResult.updatedSlots;
          
          if (doctorResult.skipped) {
            results.skippedDoctors++;
          }

        } catch (error) {
          this.logger.error(`Error processing doctor ${doctorSchedule.doctorId}:`, error);
          results.errors.push({
            doctorId: doctorSchedule.doctorId,
            error: error.message
          });
        }
      }

      return this.createSuccessResponse(results, 
        `Generated ${results.generatedSlots} new slots and updated ${results.updatedSlots} existing slots for ${targetDate.toDateString()}`
      );
    });
  }

  
  async getGenerationStatistics(startDate, endDate) {
    return this.executeOperation('getGenerationStatistics', async () => {
      const slots = await this.slotRepository.find({
        date: { $gte: startDate, $lte: endDate },
        'metadata.generatedBy': 'midnight_slot_generation'
      });

      const stats = {
        totalSlotsGenerated: slots.length,
        slotsByDepartment: {},
        slotsByDate: {},
        averageCapacity: 0,
        totalCapacity: 0
      };

      slots.forEach(slot => {
        // By department
        if (!stats.slotsByDepartment[slot.specialty]) {
          stats.slotsByDepartment[slot.specialty] = 0;
        }
        stats.slotsByDepartment[slot.specialty]++;

        // By date
        const dateStr = slot.date.toDateString();
        if (!stats.slotsByDate[dateStr]) {
          stats.slotsByDate[dateStr] = 0;
        }
        stats.slotsByDate[dateStr]++;

        // Capacity
        stats.totalCapacity += slot.maxCapacity;
      });

      stats.averageCapacity = slots.length > 0 ? Math.round(stats.totalCapacity / slots.length) : 0;

      return this.createSuccessResponse(stats, 'Generation statistics retrieved successfully');
    });
  }
}

module.exports = SlotGenerationService;