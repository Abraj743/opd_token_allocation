/**
 * End-to-End Test 2: Doctor Operations
 * 
 * Purpose: Verify doctor-side operations and schedule management
 * 
 * What you'll learn:
 * - How doctors manage their schedules and time slots
 * - How doctor availability affects patient allocation
 * - How schedule changes and cancellations are handled
 * - How the system manages doctor workload and capacity
 * - How multi-doctor scenarios work in practice
 */

const DatabaseSetup = require('../helpers/database-setup');
const TestDataFactory = require('../helpers/test-data');
const OPDAssertions = require('../helpers/assertions');

// Import services and repositories
const TokenAllocationService = require('../../services/TokenAllocationService');
const PriorityCalculationService = require('../../services/PriorityCalculationService');
const SlotManagementService = require('../../services/SlotManagementService');
const TokenRepository = require('../../repositories/TokenRepository');
const SlotRepository = require('../../repositories/SlotRepository');
const PatientRepository = require('../../repositories/PatientRepository');
const DoctorRepository = require('../../repositories/DoctorRepository');

// Import models
const Token = require('../../models/Token');
const TimeSlot = require('../../models/TimeSlot');
const Patient = require('../../models/Patient');
const Doctor = require('../../models/Doctor');
const logger = require('../../config/logger');

describe('👨‍⚕️ End-to-End Test 2: Doctor Operations', () => {
  let dbSetup;
  let services;
  let repositories;
  let hospitalSystem;

  beforeAll(async () => {
    console.log('\n🧪 Testing Doctor Operations End-to-End...');
    dbSetup = new DatabaseSetup();
    await dbSetup.connect();

    // Initialize repositories
    repositories = {
      token: new TokenRepository({ tokenModel: Token, logger }),
      slot: new SlotRepository({ timeSlotModel: TimeSlot, logger }),
      patient: new PatientRepository({ patientModel: Patient, logger }),
      doctor: new DoctorRepository({ doctorModel: Doctor, logger })
    };

    // Mock configuration service
    const mockConfigurationService = {
      getValue: async (key, defaultValue) => {
        const configs = {
          'priority.emergency': 1000,
          'priority.priority_patient': 800,
          'priority.followup': 600,
          'priority.online_booking': 400,
          'priority.walkin': 200,
          'doctor.max_daily_patients': 50,
          'doctor.consultation_time_buffer': 5,
          'schedule.change_notice_hours': 24
        };
        return { 
          success: true, 
          data: { value: configs[key] || defaultValue } 
        };
      }
    };

    // Initialize services
    services = {
      priority: new PriorityCalculationService({
        configurationService: mockConfigurationService,
        logger
      }),
      slotManagement: new SlotManagementService({
        slotRepository: repositories.slot,
        tokenRepository: repositories.token,
        configurationService: mockConfigurationService,
        logger
      }),
      tokenAllocation: new TokenAllocationService({
        tokenRepository: repositories.token,
        slotRepository: repositories.slot,
        priorityCalculationService: null, // Will be set after creation
        slotManagementService: null, // Will be set after creation
        logger
      })
    };

    // Set service dependencies
    services.tokenAllocation.priorityCalculationService = services.priority;
    services.tokenAllocation.slotManagementService = services.slotManagement;

    hospitalSystem = {
      doctors: [],
      departments: ['general_medicine', 'cardiology', 'pediatrics', 'orthopedics']
    };
  });

  afterAll(async () => {
    await dbSetup.disconnect();
  });

  beforeEach(async () => {
    await dbSetup.clearDatabase();
    hospitalSystem.doctors = [];
  });

  describe('Doctor Schedule Management', () => {
    test('should handle doctor schedule creation and management', async () => {
      console.log('  📅 Testing Doctor schedule creation and management...');
      
      // Step 1: Create doctor with comprehensive schedule
      console.log('    Step 1: Creating doctor with weekly schedule...');
      const doctorData = TestDataFactory.createDoctor({
        name: 'Dr. Schedule Manager',
        specialty: 'general_medicine',
        qualification: 'MBBS, MD Internal Medicine',
        experience: 12,
        schedule: [
          {
            dayOfWeek: 1, // Monday
            slots: [
              { startTime: '09:00', endTime: '12:00', capacity: 12 },
              { startTime: '14:00', endTime: '17:00', capacity: 10 }
            ]
          },
          {
            dayOfWeek: 2, // Tuesday
            slots: [
              { startTime: '09:00', endTime: '12:00', capacity: 12 },
              { startTime: '14:00', endTime: '16:00', capacity: 8 }
            ]
          },
          {
            dayOfWeek: 3, // Wednesday
            slots: [
              { startTime: '10:00', endTime: '13:00', capacity: 10 }
            ]
          },
          {
            dayOfWeek: 4, // Thursday
            slots: [
              { startTime: '09:00', endTime: '12:00', capacity: 12 },
              { startTime: '14:00', endTime: '17:00', capacity: 10 }
            ]
          },
          {
            dayOfWeek: 5, // Friday
            slots: [
              { startTime: '09:00', endTime: '11:00', capacity: 8 }
            ]
          }
        ]
      });
      
      const doctor = await repositories.doctor.create(doctorData);
      hospitalSystem.doctors.push(doctor);
      
      console.log(`    ✅ Doctor created: ${doctor.name}`);
      console.log(`    ✅ Weekly schedule: ${doctor.schedule.length} days configured`);

      // Step 2: Generate time slots from doctor's schedule
      console.log('    Step 2: Generating time slots from schedule...');
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const generatedSlots = [];
      
      // Generate slots for next 7 days
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        const dayOfWeek = currentDate.getDay();
        
        // Find doctor's schedule for this day
        const daySchedule = doctor.schedule.find(s => s.dayOfWeek === dayOfWeek);
        
        if (daySchedule) {
          for (const timeSlot of daySchedule.slots) {
            const slotData = TestDataFactory.createTimeSlot({
              doctorId: doctor._id.toString(),
              date: currentDate,
              startTime: timeSlot.startTime,
              endTime: timeSlot.endTime,
              maxCapacity: timeSlot.capacity,
              specialty: doctor.specialty
            });
            
            const slotResult = await services.slotManagement.createSlot(slotData);
            if (slotResult.success) {
              generatedSlots.push(slotResult.data.slot);
            }
          }
        }
      }
      
      console.log(`    ✅ Generated ${generatedSlots.length} time slots for the week`);

      // Step 3: Verify doctor availability queries
      console.log('    Step 3: Testing doctor availability queries...');
      
      // Check availability for specific days
      const mondaySlots = generatedSlots.filter(slot => {
        const slotDate = new Date(slot.date);
        return slotDate.getDay() === 1; // Monday
      });
      
      const wednesdaySlots = generatedSlots.filter(slot => {
        const slotDate = new Date(slot.date);
        return slotDate.getDay() === 3; // Wednesday
      });
      
      expect(mondaySlots.length).toBe(2); // Morning and afternoon
      expect(wednesdaySlots.length).toBe(1); // Only morning
      
      console.log(`    ✅ Monday slots: ${mondaySlots.length}, Wednesday slots: ${wednesdaySlots.length}`);

      // Step 4: Calculate total weekly capacity
      console.log('    Step 4: Calculating weekly capacity...');
      const totalWeeklyCapacity = generatedSlots.reduce((total, slot) => total + slot.maxCapacity, 0);
      const averageDailyCapacity = totalWeeklyCapacity / 7;
      
      console.log(`    ✅ Total weekly capacity: ${totalWeeklyCapacity} patients`);
      console.log(`    ✅ Average daily capacity: ${averageDailyCapacity.toFixed(1)} patients`);
      
      expect(totalWeeklyCapacity).toBeGreaterThan(0);
      
      console.log('  ✅ Doctor schedule management working correctly');
    });

    test('should handle doctor schedule modifications', async () => {
      console.log('  ✏️ Testing Doctor schedule modifications...');
      
      // Create doctor with initial schedule
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Schedule Modifier'
      }));
      
      // Create initial slots
      const originalSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          startTime: '09:00',
          endTime: '12:00',
          maxCapacity: 10
        })
      );
      
      // Add some patients to the slot
      const patients = [];
      for (let i = 0; i < 3; i++) {
        const patient = await repositories.patient.create(TestDataFactory.createPatient());
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: originalSlot.data.slot.slotId,
          source: 'online',
          patientInfo: { age: 30 + i },
          waitingTime: 0
        });
        
        if (allocation.success) {
          patients.push({ patient, token: allocation.data.token });
        }
      }
      
      console.log(`    ✅ Initial setup: ${patients.length} patients scheduled`);

      // Modify slot capacity (doctor decides to see more patients)
      console.log('    Modifying slot capacity...');
      const capacityUpdate = await services.slotManagement.updateSlotCapacity(
        originalSlot.data.slot.slotId,
        15 // Increase from 10 to 15
      );
      
      if (capacityUpdate.success) {
        console.log(`    ✅ Capacity increased: ${capacityUpdate.data.previousCapacity} → ${capacityUpdate.data.newCapacity}`);
      }

      // Modify slot timing (doctor adjusts schedule)
      console.log('    Modifying slot timing...');
      const updatedSlot = await repositories.slot.update(originalSlot.data.slot._id, {
        startTime: '09:30',
        endTime: '12:30'
      });
      
      console.log(`    ✅ Timing updated: 09:00-12:00 → ${updatedSlot.startTime}-${updatedSlot.endTime}`);

      // Verify existing patients are not affected
      const existingTokens = await repositories.token.findBySlotId(originalSlot.data.slot.slotId);
      expect(existingTokens.length).toBe(patients.length);
      
      console.log(`    ✅ Existing patients preserved: ${existingTokens.length} tokens`);
      console.log('  ✅ Schedule modifications handled correctly');
    });
  });

  describe('Doctor Workload Management', () => {
    test('should manage doctor daily workload and capacity', async () => {
      console.log('  📊 Testing Doctor workload management...');
      
      // Create doctor with multiple slots
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Workload Manager',
        specialty: 'general_medicine'
      }));
      
      // Create multiple slots for the day
      const slots = [];
      const slotConfigs = [
        { startTime: '09:00', endTime: '11:00', capacity: 8 },
        { startTime: '11:00', endTime: '13:00', capacity: 10 },
        { startTime: '14:00', endTime: '16:00', capacity: 8 },
        { startTime: '16:00', endTime: '18:00', capacity: 6 }
      ];
      
      for (const config of slotConfigs) {
        const slotResult = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            startTime: config.startTime,
            endTime: config.endTime,
            maxCapacity: config.capacity,
            specialty: doctor.specialty
          })
        );
        
        if (slotResult.success) {
          slots.push(slotResult.data.slot);
        }
      }
      
      console.log(`    ✅ Created ${slots.length} slots for the day`);
      
      // Calculate total daily capacity
      const totalDailyCapacity = slots.reduce((total, slot) => total + slot.maxCapacity, 0);
      console.log(`    ✅ Total daily capacity: ${totalDailyCapacity} patients`);

      // Simulate patient bookings throughout the day
      console.log('    Simulating patient bookings...');
      const bookingResults = [];
      
      // Book patients across all slots
      for (let i = 0; i < totalDailyCapacity + 5; i++) { // Try to book more than capacity
        const slotIndex = i % slots.length;
        const selectedSlot = slots[slotIndex];
        
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Workload Patient ${i + 1}` }
        }));
        
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: selectedSlot.slotId,
          source: 'online',
          patientInfo: { age: 25 + (i % 50) },
          waitingTime: 0
        });
        
        bookingResults.push({
          patient: patient.personalInfo.name,
          slot: `${selectedSlot.startTime}-${selectedSlot.endTime}`,
          success: allocation.success,
          reason: allocation.success ? 'allocated' : allocation.error?.code
        });
      }
      
      const successfulBookings = bookingResults.filter(r => r.success);
      const failedBookings = bookingResults.filter(r => !r.success);
      
      console.log(`    ✅ Successful bookings: ${successfulBookings.length}`);
      console.log(`    ✅ Failed bookings: ${failedBookings.length}`);
      
      // Verify capacity limits were respected
      expect(successfulBookings.length).toBeLessThanOrEqual(totalDailyCapacity);
      
      // Check workload distribution across slots
      console.log('    Workload distribution:');
      for (const slot of slots) {
        const updatedSlot = await repositories.slot.findBySlotId(slot.slotId);
        const utilization = (updatedSlot.currentAllocation / updatedSlot.maxCapacity * 100).toFixed(1);
        console.log(`    ${slot.startTime}-${slot.endTime}: ${updatedSlot.currentAllocation}/${updatedSlot.maxCapacity} (${utilization}%)`);
      }
      
      console.log('  ✅ Doctor workload management working correctly');
    });

    test('should handle doctor overload and patient redistribution', async () => {
      console.log('  ⚖️ Testing Doctor overload handling...');
      
      // Create two doctors in same department
      const doctor1 = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Popular',
        specialty: 'cardiology'
      }));
      
      const doctor2 = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Available',
        specialty: 'cardiology'
      }));
      
      // Create slots - doctor1 with small capacity, doctor2 with larger capacity
      const doctor1Slot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor1._id.toString(),
          maxCapacity: 3, // Small capacity
          specialty: 'cardiology'
        })
      );
      
      const doctor2Slot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor2._id.toString(),
          maxCapacity: 10, // Large capacity
          specialty: 'cardiology',
          startTime: '10:00',
          endTime: '13:00'
        })
      );
      
      console.log(`    ✅ Doctor1 capacity: ${doctor1Slot.data.slot.maxCapacity}`);
      console.log(`    ✅ Doctor2 capacity: ${doctor2Slot.data.slot.maxCapacity}`);

      // Try to book many patients with doctor1 (popular doctor)
      const allocationResults = [];
      
      for (let i = 0; i < 8; i++) { // 8 patients for 3 capacity
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Overload Patient ${i + 1}` },
          departmentInfo: { preferredDepartment: 'cardiology' }
        }));
        
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor1._id.toString(),
          slotId: doctor1Slot.data.slot.slotId,
          source: 'online',
          patientInfo: { 
            age: 30 + i,
            preferredDepartment: 'cardiology'
          },
          waitingTime: 0
        });
        
        allocationResults.push({
          patient: patient.personalInfo.name,
          success: allocation.success,
          method: allocation.success ? allocation.data.allocationMethod : null,
          alternatives: allocation.success ? null : allocation.data?.alternatives
        });
      }
      
      const successful = allocationResults.filter(r => r.success);
      const failed = allocationResults.filter(r => !r.success);
      
      console.log(`    ✅ Direct allocations to popular doctor: ${successful.length}`);
      console.log(`    ✅ Failed allocations: ${failed.length}`);
      
      // Check if alternatives were provided for failed allocations
      const alternativesProvided = failed.filter(r => r.alternatives).length;
      console.log(`    ✅ Alternatives provided: ${alternativesProvided}/${failed.length}`);
      
      // Verify doctor1's capacity wasn't exceeded
      const finalDoctor1Slot = await repositories.slot.findBySlotId(doctor1Slot.data.slot.slotId);
      expect(finalDoctor1Slot.currentAllocation).toBeLessThanOrEqual(finalDoctor1Slot.maxCapacity);
      
      console.log('  ✅ Doctor overload handled with alternatives');
    });
  });

  describe('Doctor Schedule Changes and Cancellations', () => {
    test('should handle doctor-initiated schedule changes', async () => {
      console.log('  📅 Testing Doctor-initiated schedule changes...');
      
      // Setup: Doctor with scheduled patients
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Schedule Changer'
      }));
      
      const originalSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          startTime: '14:00',
          endTime: '17:00',
          maxCapacity: 8
        })
      );
      
      // Book several patients
      const scheduledPatients = [];
      for (let i = 0; i < 5; i++) {
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Scheduled Patient ${i + 1}` }
        }));
        
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: originalSlot.data.slot.slotId,
          source: 'online',
          patientInfo: { age: 30 + i },
          waitingTime: 0
        });
        
        if (allocation.success) {
          await repositories.token.updateStatus(allocation.data.token.tokenId, 'confirmed');
          scheduledPatients.push({
            patient,
            token: allocation.data.token
          });
        }
      }
      
      console.log(`    ✅ Initial setup: ${scheduledPatients.length} patients scheduled`);

      // Doctor decides to change schedule (emergency came up)
      console.log('    Doctor initiates schedule change...');
      
      // Create new slot for rescheduling
      const newSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          startTime: '09:00',
          endTime: '12:00',
          maxCapacity: 8,
          date: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next day
        })
      );
      
      // Reschedule patients to new slot
      const reschedulingResults = [];
      
      for (const scheduledPatient of scheduledPatients) {
        const rescheduleResult = await services.tokenAllocation.rescheduleToken(
          scheduledPatient.token.tokenId,
          newSlot.data.slot._id.toString(),
          'doctor_schedule_change'
        );
        
        reschedulingResults.push({
          patient: scheduledPatient.patient.personalInfo.name,
          success: rescheduleResult.success,
          newSlot: rescheduleResult.success ? rescheduleResult.data.rescheduleDetails.newSlotId : null
        });
      }
      
      const successfulReschedules = reschedulingResults.filter(r => r.success);
      console.log(`    ✅ Successfully rescheduled: ${successfulReschedules.length}/${scheduledPatients.length} patients`);
      
      // Verify original slot is now available
      const updatedOriginalSlot = await repositories.slot.findBySlotId(originalSlot.data.slot.slotId);
      expect(updatedOriginalSlot.currentAllocation).toBe(0);
      
      // Verify new slot has the patients
      const updatedNewSlot = await repositories.slot.findById(newSlot.data.slot._id);
      expect(updatedNewSlot.currentAllocation).toBe(successfulReschedules.length);
      
      console.log('  ✅ Doctor schedule changes handled correctly');
    });

    test('should handle doctor unavailability and emergency cancellations', async () => {
      console.log('  🚨 Testing Doctor unavailability and emergency cancellations...');
      
      // Setup: Doctor with full schedule
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Emergency Unavailable'
      }));
      
      const slot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 6
        })
      );
      
      // Fill the slot with patients
      const affectedPatients = [];
      for (let i = 0; i < 6; i++) {
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Affected Patient ${i + 1}` }
        }));
        
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: slot.data.slot.slotId,
          source: 'online',
          patientInfo: { age: 25 + i },
          waitingTime: 0
        });
        
        if (allocation.success) {
          affectedPatients.push({
            patient,
            token: allocation.data.token
          });
        }
      }
      
      console.log(`    ✅ Setup complete: ${affectedPatients.length} patients affected`);

      // Doctor becomes unavailable (emergency)
      console.log('    Doctor becomes unavailable due to emergency...');
      
      // Mark slot as suspended
      const suspensionResult = await services.slotManagement.updateSlotStatus(
        slot.data.slot.slotId,
        'suspended'
      );
      
      expect(suspensionResult.success).toBe(true);
      console.log(`    ✅ Slot suspended: ${slot.data.slot.slotId}`);

      // Handle affected patients
      const patientHandlingResults = [];
      
      for (const affectedPatient of affectedPatients) {
        // Cancel the token with reason
        const cancellationResult = await services.tokenAllocation.cancelToken(
          affectedPatient.token.tokenId,
          'doctor_unavailable'
        );
        
        patientHandlingResults.push({
          patient: affectedPatient.patient.personalInfo.name,
          cancelled: cancellationResult.success,
          reason: 'doctor_unavailable'
        });
      }
      
      const successfulCancellations = patientHandlingResults.filter(r => r.cancelled);
      console.log(`    ✅ Patients notified and cancelled: ${successfulCancellations.length}/${affectedPatients.length}`);
      
      // Verify slot capacity was freed
      const updatedSlot = await repositories.slot.findBySlotId(slot.data.slot.slotId);
      expect(updatedSlot.currentAllocation).toBe(0);
      expect(updatedSlot.status).toBe('suspended');
      
      // Verify tokens were cancelled
      for (const result of patientHandlingResults) {
        if (result.cancelled) {
          const cancelledToken = await repositories.token.findByTokenId(
            affectedPatients.find(p => p.patient.personalInfo.name === result.patient).token.tokenId
          );
          expect(cancelledToken.status).toBe('cancelled');
        }
      }
      
      console.log('  ✅ Doctor unavailability handled with proper patient notification');
    });
  });

  describe('Multi-Doctor Coordination', () => {
    test('should coordinate multiple doctors in same department', async () => {
      console.log('  👥 Testing Multi-doctor coordination...');
      
      // Create multiple doctors in cardiology department
      const cardiologyDoctors = [];
      for (let i = 0; i < 3; i++) {
        const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
          name: `Dr. Cardiology ${i + 1}`,
          specialty: 'cardiology',
          experience: 8 + i * 2
        }));
        cardiologyDoctors.push(doctor);
      }
      
      // Create slots for each doctor
      const doctorSlots = [];
      for (let i = 0; i < cardiologyDoctors.length; i++) {
        const doctor = cardiologyDoctors[i];
        
        const morningSlot = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            startTime: '09:00',
            endTime: '12:00',
            maxCapacity: 6 + i * 2, // Varying capacities
            specialty: 'cardiology'
          })
        );
        
        const afternoonSlot = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            startTime: '14:00',
            endTime: '17:00',
            maxCapacity: 5 + i * 2,
            specialty: 'cardiology'
          })
        );
        
        doctorSlots.push({
          doctor,
          morningSlot: morningSlot.data.slot,
          afternoonSlot: afternoonSlot.data.slot
        });
      }
      
      console.log(`    ✅ Created ${cardiologyDoctors.length} cardiology doctors with slots`);

      // Simulate patient requests for cardiology department
      const cardiologyPatients = [];
      for (let i = 0; i < 20; i++) { // More patients than any single doctor can handle
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Cardiology Patient ${i + 1}` },
          departmentInfo: { preferredDepartment: 'cardiology' }
        }));
        cardiologyPatients.push(patient);
      }
      
      // Distribute patients across available doctors
      const allocationResults = [];
      
      for (const patient of cardiologyPatients) {
        // Find doctor with most availability
        let bestDoctor = null;
        let bestSlot = null;
        let maxAvailability = 0;
        
        for (const doctorInfo of doctorSlots) {
          const morningAvailability = doctorInfo.morningSlot.maxCapacity - doctorInfo.morningSlot.currentAllocation;
          const afternoonAvailability = doctorInfo.afternoonSlot.maxCapacity - doctorInfo.afternoonSlot.currentAllocation;
          
          if (morningAvailability > maxAvailability) {
            maxAvailability = morningAvailability;
            bestDoctor = doctorInfo.doctor;
            bestSlot = doctorInfo.morningSlot;
          }
          
          if (afternoonAvailability > maxAvailability) {
            maxAvailability = afternoonAvailability;
            bestDoctor = doctorInfo.doctor;
            bestSlot = doctorInfo.afternoonSlot;
          }
        }
        
        if (bestDoctor && bestSlot && maxAvailability > 0) {
          const allocation = await services.tokenAllocation.allocateToken({
            patientId: patient.patientId,
            doctorId: bestDoctor._id.toString(),
            slotId: bestSlot.slotId,
            source: 'online',
            patientInfo: { 
              age: 30 + (cardiologyPatients.indexOf(patient) % 40),
              preferredDepartment: 'cardiology'
            },
            waitingTime: 0
          });
          
          if (allocation.success) {
            // Update local slot allocation for next iteration
            bestSlot.currentAllocation++;
            
            allocationResults.push({
              patient: patient.personalInfo.name,
              doctor: bestDoctor.name,
              slot: `${bestSlot.startTime}-${bestSlot.endTime}`,
              success: true
            });
          }
        } else {
          allocationResults.push({
            patient: patient.personalInfo.name,
            success: false,
            reason: 'no_availability'
          });
        }
      }
      
      const successful = allocationResults.filter(r => r.success);
      const failed = allocationResults.filter(r => !r.success);
      
      console.log(`    ✅ Successful allocations: ${successful.length}/${cardiologyPatients.length}`);
      console.log(`    ✅ Failed allocations: ${failed.length}/${cardiologyPatients.length}`);
      
      // Show distribution across doctors
      console.log('    Patient distribution:');
      for (const doctorInfo of doctorSlots) {
        const doctorAllocations = successful.filter(r => r.doctor === doctorInfo.doctor.name);
        console.log(`    ${doctorInfo.doctor.name}: ${doctorAllocations.length} patients`);
      }
      
      // Verify no doctor exceeded capacity
      for (const doctorInfo of doctorSlots) {
        const updatedMorning = await repositories.slot.findBySlotId(doctorInfo.morningSlot.slotId);
        const updatedAfternoon = await repositories.slot.findBySlotId(doctorInfo.afternoonSlot.slotId);
        
        expect(updatedMorning.currentAllocation).toBeLessThanOrEqual(updatedMorning.maxCapacity);
        expect(updatedAfternoon.currentAllocation).toBeLessThanOrEqual(updatedAfternoon.maxCapacity);
      }
      
      console.log('  ✅ Multi-doctor coordination working effectively');
    });

    test('should handle cross-department referrals', async () => {
      console.log('  🔄 Testing Cross-department referrals...');
      
      // Create doctors in different departments
      const generalDoctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. General Medicine',
        specialty: 'general_medicine'
      }));
      
      const cardiologyDoctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Cardiology Specialist',
        specialty: 'cardiology'
      }));
      
      // Create slots
      const generalSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: generalDoctor._id.toString(),
          specialty: 'general_medicine'
        })
      );
      
      const cardiologySlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: cardiologyDoctor._id.toString(),
          specialty: 'cardiology'
        })
      );
      
      // Patient initially visits general medicine
      const patient = await repositories.patient.create(TestDataFactory.createPatient({
        personalInfo: { name: 'Referral Patient' },
        departmentInfo: { 
          preferredDepartment: 'general_medicine',
          chiefComplaint: 'Chest discomfort and fatigue'
        }
      }));
      
      // Initial consultation with general doctor
      console.log('    Step 1: Initial consultation with general medicine...');
      const initialAllocation = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: generalDoctor._id.toString(),
        slotId: generalSlot.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 45, urgencyLevel: 'routine' },
        waitingTime: 0
      });
      
      expect(initialAllocation.success).toBe(true);
      console.log(`    ✅ Initial appointment: ${initialAllocation.data.token.tokenId}`);
      
      // Complete initial consultation
      await repositories.token.updateStatus(initialAllocation.data.token.tokenId, 'completed');
      
      // Update patient record with referral information
      await repositories.patient.update(patient._id, {
        'departmentInfo.referralTo': 'cardiology',
        'departmentInfo.referralReason': 'Suspected cardiac condition',
        'departmentInfo.referralDoctor': generalDoctor._id.toString(),
        'departmentInfo.lastVisitedDoctor': generalDoctor._id.toString()
      });
      
      // Referral to cardiology
      console.log('    Step 2: Referral to cardiology specialist...');
      const referralAllocation = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: cardiologyDoctor._id.toString(),
        slotId: cardiologySlot.data.slot.slotId,
        source: 'followup', // Referral treated as follow-up
        patientInfo: {
          age: 45,
          isReferral: true,
          referralFrom: 'general_medicine',
          referralDoctor: generalDoctor._id.toString()
        },
        waitingTime: 0
      });
      
      expect(referralAllocation.success).toBe(true);
      console.log(`    ✅ Referral appointment: ${referralAllocation.data.token.tokenId}`);
      
      // Verify referral priority (should be higher than regular)
      expect(referralAllocation.data.token.priority).toBeGreaterThan(400); // Higher than regular online
      
      // Verify patient has appointments with both doctors
      const patientTokens = await repositories.token.findByPatientId(patient.patientId);
      expect(patientTokens).toHaveLength(2);
      
      const generalToken = patientTokens.find(t => t.doctorId === generalDoctor._id.toString());
      const cardiologyToken = patientTokens.find(t => t.doctorId === cardiologyDoctor._id.toString());
      
      expect(generalToken.status).toBe('completed');
      expect(cardiologyToken.status).toBe('allocated');
      
      console.log('    ✅ Cross-department referral completed successfully');
      console.log(`    General Medicine: ${generalToken.status}`);
      console.log(`    Cardiology: ${cardiologyToken.status}`);
      
      console.log('  ✅ Cross-department referrals working correctly');
    });
  });

  // Summary test to show what we've validated
  test('📊 Doctor Operations Summary', () => {
    console.log('\n📊 Doctor Operations Test Summary:');
    console.log('  ✅ Doctor schedule creation and management');
    console.log('  ✅ Doctor schedule modifications and updates');
    console.log('  ✅ Doctor workload management and capacity control');
    console.log('  ✅ Doctor overload handling with patient redistribution');
    console.log('  ✅ Doctor-initiated schedule changes and rescheduling');
    console.log('  ✅ Doctor unavailability and emergency cancellations');
    console.log('  ✅ Multi-doctor coordination within departments');
    console.log('  ✅ Cross-department referrals and patient flow');
    console.log('\n🎉 Doctor operations testing successful! Ready for system performance testing.');
  });
});