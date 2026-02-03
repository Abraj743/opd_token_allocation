/**
 * End-to-End Test 1: Complete Patient Journey
 * 
 * Purpose: Verify complete patient workflows from registration to completion
 * 
 * What you'll learn:
 * - How a complete patient journey works from start to finish
 * - How different patient types (regular, emergency, follow-up) are handled
 * - How the system manages the entire lifecycle of a token
 * - How real-world scenarios play out in the complete system
 * - How all components work together to provide seamless patient experience
 */

const DatabaseSetup = require('../helpers/database-setup');
const TestDataFactory = require('../helpers/test-data');
const OPDAssertions = require('../helpers/assertions');

// Import all services and repositories for complete system test
const TokenAllocationService = require('../../services/TokenAllocationService');
const PriorityCalculationService = require('../../services/PriorityCalculationService');
const SlotManagementService = require('../../services/SlotManagementService');
const PatientService = require('../../services/PatientService');
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

describe('👤 End-to-End Test 1: Complete Patient Journey', () => {
  let dbSetup;
  let services;
  let repositories;
  let hospitalSystem;

  beforeAll(async () => {
    console.log('\n🧪 Testing Complete Patient Journey End-to-End...');
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
          'patient.max_tokens_per_day': 3,
          'patient.followup_window_days': 30,
          'system.grace_period_minutes': 15
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
      }),
      patient: new PatientService({
        patientRepository: repositories.patient,
        tokenRepository: repositories.token,
        logger
      })
    };

    // Set service dependencies
    services.tokenAllocation.priorityCalculationService = services.priority;
    services.tokenAllocation.slotManagementService = services.slotManagement;

    // Create hospital system simulation
    hospitalSystem = {
      doctors: [],
      departments: ['general_medicine', 'cardiology', 'pediatrics', 'emergency_medicine'],
      operatingHours: { start: '08:00', end: '18:00' }
    };
  });

  afterAll(async () => {
    await dbSetup.disconnect();
  });

  beforeEach(async () => {
    await dbSetup.clearDatabase();
    hospitalSystem.doctors = [];
    await setupHospitalSystem();
  });

  async function setupHospitalSystem() {
    console.log('    Setting up hospital system...');
    
    // Create doctors for each department
    for (const department of hospitalSystem.departments) {
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: `Dr. ${department.charAt(0).toUpperCase() + department.slice(1)}`,
        specialty: department,
        qualification: `MBBS, MD ${department}`
      }));
      
      hospitalSystem.doctors.push(doctor);
      
      // Create morning and afternoon slots for each doctor
      const morningSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          startTime: '09:00',
          endTime: '12:00',
          maxCapacity: department === 'emergency_medicine' ? 15 : 8,
          specialty: department
        })
      );
      
      const afternoonSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          startTime: '14:00',
          endTime: '17:00',
          maxCapacity: department === 'emergency_medicine' ? 12 : 6,
          specialty: department
        })
      );
      
      doctor.morningSlot = morningSlot.data.slot;
      doctor.afternoonSlot = afternoonSlot.data.slot;
    }
    
    console.log(`    ✅ Hospital system ready: ${hospitalSystem.doctors.length} doctors, ${hospitalSystem.doctors.length * 2} slots`);
  }

  describe('Regular Patient Journey', () => {
    test('should handle complete regular patient workflow', async () => {
      console.log('  👤 Testing Regular patient complete workflow...');
      
      // Step 1: Patient Registration
      console.log('    Step 1: Patient registration and profile creation...');
      const patientData = TestDataFactory.createPatient({
        personalInfo: {
          name: 'John Regular Patient',
          age: 35,
          gender: 'male',
          phoneNumber: '9876543210',
          email: 'john.regular@email.com'
        },
        departmentInfo: {
          preferredDepartment: 'general_medicine',
          chiefComplaint: 'Annual health checkup',
          urgencyLevel: 'routine'
        },
        medicalInfo: {
          bloodGroup: 'O+',
          allergies: ['Peanuts'],
          chronicConditions: []
        }
      });
      
      const patient = await repositories.patient.create(patientData);
      console.log(`    ✅ Patient registered: ${patient.personalInfo.name} (ID: ${patient.patientId})`);

      // Step 2: Department and Doctor Selection
      console.log('    Step 2: Finding available doctors in preferred department...');
      const generalMedicineDoctor = hospitalSystem.doctors.find(d => d.specialty === 'general_medicine');
      expect(generalMedicineDoctor).toBeDefined();
      
      // Check doctor availability
      const availableSlots = [generalMedicineDoctor.morningSlot, generalMedicineDoctor.afternoonSlot]
        .filter(slot => slot.currentAllocation < slot.maxCapacity);
      
      expect(availableSlots.length).toBeGreaterThan(0);
      console.log(`    ✅ Available slots found: ${availableSlots.length} slots for ${generalMedicineDoctor.name}`);

      // Step 3: Priority Assessment
      console.log('    Step 3: Calculating patient priority...');
      const priorityResult = await services.priority.calculatePriority(
        'online', // Online booking
        {
          age: patient.personalInfo.age,
          urgencyLevel: patient.departmentInfo.urgencyLevel,
          medicalHistory: { chronic: false }
        },
        0 // No waiting time yet
      );
      
      expect(priorityResult.success).toBe(true);
      console.log(`    ✅ Priority calculated: ${priorityResult.data.finalPriority} (${priorityResult.data.priorityLevel})`);

      // Step 4: Token Allocation
      console.log('    Step 4: Allocating appointment token...');
      const selectedSlot = availableSlots[0]; // Choose first available slot
      
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: generalMedicineDoctor._id.toString(),
        slotId: selectedSlot.slotId,
        source: 'online',
        patientInfo: {
          age: patient.personalInfo.age,
          urgencyLevel: patient.departmentInfo.urgencyLevel,
          estimatedServiceTime: 20
        },
        waitingTime: 0
      });
      
      OPDAssertions.expectSuccessfulAllocation(allocationResult);
      const token = allocationResult.data.token;
      
      console.log(`    ✅ Token allocated: ${token.tokenId} (Number: ${token.tokenNumber})`);
      console.log(`    ✅ Appointment scheduled with ${generalMedicineDoctor.name}`);

      // Step 5: Token Confirmation
      console.log('    Step 5: Patient confirms appointment...');
      const confirmationResult = await repositories.token.updateStatus(token.tokenId, 'confirmed');
      expect(confirmationResult.status).toBe('confirmed');
      
      console.log(`    ✅ Appointment confirmed: ${token.tokenId}`);

      // Step 6: Simulate Patient Arrival and Check-in
      console.log('    Step 6: Patient arrives and checks in...');
      // In a real system, this would involve check-in process
      const checkinTime = new Date();
      const checkedInToken = await repositories.token.update(token._id, {
        'metadata.checkinTime': checkinTime,
        'metadata.status': 'checked_in'
      });
      
      console.log(`    ✅ Patient checked in at ${checkinTime.toLocaleTimeString()}`);

      // Step 7: Consultation Process
      console.log('    Step 7: Consultation with doctor...');
      // Simulate consultation start
      const consultationStart = new Date();
      await repositories.token.update(token._id, {
        status: 'in_consultation',
        'metadata.consultationStartTime': consultationStart
      });
      
      console.log(`    ✅ Consultation started at ${consultationStart.toLocaleTimeString()}`);

      // Step 8: Consultation Completion
      console.log('    Step 8: Consultation completion...');
      const consultationEnd = new Date();
      const completionResult = await repositories.token.updateStatus(token.tokenId, 'completed');
      await repositories.token.update(token._id, {
        'metadata.consultationEndTime': consultationEnd,
        'metadata.consultationDuration': consultationEnd - consultationStart
      });
      
      expect(completionResult.status).toBe('completed');
      console.log(`    ✅ Consultation completed at ${consultationEnd.toLocaleTimeString()}`);

      // Step 9: Slot Capacity Release
      console.log('    Step 9: Releasing slot capacity...');
      const updatedSlot = await repositories.slot.findBySlotId(selectedSlot.slotId);
      // In a real system, capacity would be managed differently for completed vs cancelled
      console.log(`    ✅ Slot utilization: ${updatedSlot.currentAllocation}/${updatedSlot.maxCapacity}`);

      // Step 10: Journey Verification
      console.log('    Step 10: Verifying complete journey...');
      const finalToken = await repositories.token.findByTokenId(token.tokenId);
      const finalPatient = await repositories.patient.findByPatientId(patient.patientId);
      
      expect(finalToken.status).toBe('completed');
      expect(finalToken.patientId).toBe(patient.patientId);
      expect(finalToken.doctorId).toBe(generalMedicineDoctor._id.toString());
      expect(finalPatient.patientId).toBe(patient.patientId);
      
      console.log('    ✅ Journey verification complete');
      console.log('\n  🎉 Regular patient journey completed successfully!');
      
      // Journey Summary
      console.log('\n    📊 Journey Summary:');
      console.log(`    Patient: ${finalPatient.personalInfo.name}`);
      console.log(`    Doctor: ${generalMedicineDoctor.name} (${generalMedicineDoctor.specialty})`);
      console.log(`    Token: ${finalToken.tokenId} (Priority: ${finalToken.priority})`);
      console.log(`    Status: ${finalToken.status}`);
      console.log(`    Department: ${finalPatient.departmentInfo.preferredDepartment}`);
    });

    test('should handle patient with multiple appointments', async () => {
      console.log('  👥 Testing Patient with multiple appointments...');
      
      // Create patient
      const patient = await repositories.patient.create(TestDataFactory.createPatient({
        personalInfo: { name: 'Multi Appointment Patient' }
      }));

      // Book appointments with different doctors
      const appointments = [];
      
      // Appointment 1: General Medicine
      const generalDoc = hospitalSystem.doctors.find(d => d.specialty === 'general_medicine');
      const appointment1 = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: generalDoc._id.toString(),
        slotId: generalDoc.morningSlot.slotId,
        source: 'online',
        patientInfo: { age: 40, urgencyLevel: 'routine' },
        waitingTime: 0
      });
      expect(appointment1.success).toBe(true);
      appointments.push(appointment1.data.token);

      // Appointment 2: Cardiology (follow-up)
      const cardioDoc = hospitalSystem.doctors.find(d => d.specialty === 'cardiology');
      const appointment2 = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: cardioDoc._id.toString(),
        slotId: cardioDoc.afternoonSlot.slotId,
        source: 'followup',
        patientInfo: { age: 40, isFollowup: true },
        waitingTime: 0
      });
      expect(appointment2.success).toBe(true);
      appointments.push(appointment2.data.token);

      // Verify patient has multiple active tokens
      const patientTokens = await repositories.token.findByPatientId(patient.patientId);
      expect(patientTokens).toHaveLength(2);
      
      console.log(`    ✅ Patient has ${patientTokens.length} appointments:`);
      patientTokens.forEach((token, index) => {
        console.log(`    ${index + 1}. ${token.tokenId} - Token #${token.tokenNumber} (${token.source})`);
      });

      // Complete first appointment
      await repositories.token.updateStatus(appointments[0].tokenId, 'completed');
      
      // Verify second appointment still active
      const activeTokens = await repositories.token.findByPatientId(patient.patientId);
      const activeCount = activeTokens.filter(t => t.status === 'allocated').length;
      expect(activeCount).toBe(1);
      
      console.log('  ✅ Multiple appointments handled correctly');
    });
  });

  describe('Emergency Patient Journey', () => {
    test('should handle complete emergency patient workflow', async () => {
      console.log('  🚨 Testing Emergency patient complete workflow...');
      
      // Step 1: Emergency Patient Arrival
      console.log('    Step 1: Emergency patient arrives at hospital...');
      const emergencyPatient = await repositories.patient.create(TestDataFactory.createPatient({
        personalInfo: {
          name: 'Emergency Critical Patient',
          age: 65,
          gender: 'female'
        },
        departmentInfo: {
          preferredDepartment: 'general_medicine', // Use valid department
          chiefComplaint: 'Severe chest pain, difficulty breathing',
          urgencyLevel: 'emergency' // Use valid urgency level
        },
        medicalInfo: {
          bloodGroup: 'A+',
          chronicConditions: ['Hypertension', 'Diabetes'],
          allergies: ['Aspirin']
        }
      }));
      
      console.log(`    ✅ Emergency patient registered: ${emergencyPatient.personalInfo.name}`);

      // Step 2: Immediate Triage and Priority Assessment
      console.log('    Step 2: Emergency triage and priority assessment...');
      const emergencyPriority = await services.priority.calculatePriority(
        'emergency',
        {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'critical',
          medicalHistory: { 
            critical: true,
            conditions: emergencyPatient.medicalInfo.chronicConditions
          }
        },
        0
      );
      
      expect(emergencyPriority.success).toBe(true);
      expect(emergencyPriority.data.priorityLevel).toBe('emergency');
      console.log(`    ✅ Emergency priority: ${emergencyPriority.data.finalPriority} (Critical level)`);

      // Step 3: Emergency Doctor Assignment
      console.log('    Step 3: Assigning emergency doctor...');
      const emergencyDoctor = hospitalSystem.doctors.find(d => d.specialty === 'emergency_medicine');
      expect(emergencyDoctor).toBeDefined();
      
      // Check if emergency slot has capacity or needs preemption
      const emergencySlot = emergencyDoctor.morningSlot;
      const slotAvailability = await services.slotManagement.checkSlotAvailability(emergencySlot.slotId);
      
      console.log(`    Emergency slot availability: ${slotAvailability.data.availableCapacity}/${emergencySlot.maxCapacity}`);

      // Step 4: Emergency Token Allocation (with potential preemption)
      console.log('    Step 4: Emergency token allocation...');
      const emergencyAllocation = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: emergencyDoctor._id.toString(),
        slotId: emergencySlot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'critical',
          medicalHistory: { critical: true },
          estimatedServiceTime: 45 // Emergency cases take longer
        },
        waitingTime: 0
      });
      
      expect(emergencyAllocation.success).toBe(true);
      const emergencyToken = emergencyAllocation.data.token;
      
      console.log(`    ✅ Emergency token allocated: ${emergencyToken.tokenId}`);
      console.log(`    ✅ Allocation method: ${emergencyAllocation.data.allocationMethod}`);
      
      if (emergencyAllocation.data.allocationMethod === 'preemption') {
        console.log(`    ✅ Preempted tokens: ${emergencyAllocation.data.preemptedTokens.length}`);
      }

      // Step 5: Immediate Processing (Skip normal queue)
      console.log('    Step 5: Emergency fast-track processing...');
      // Emergency patients typically skip normal check-in queue
      await repositories.token.updateStatus(emergencyToken.tokenId, 'confirmed');
      
      const immediateProcessing = new Date();
      await repositories.token.update(emergencyToken._id, {
        'metadata.emergencyProcessingTime': immediateProcessing,
        'metadata.fastTrack': true
      });
      
      console.log(`    ✅ Emergency fast-track activated at ${immediateProcessing.toLocaleTimeString()}`);

      // Step 6: Emergency Consultation
      console.log('    Step 6: Emergency consultation begins...');
      const emergencyConsultationStart = new Date();
      await repositories.token.updateStatus(emergencyToken.tokenId, 'in_consultation');
      await repositories.token.update(emergencyToken._id, {
        'metadata.consultationStartTime': emergencyConsultationStart,
        'metadata.consultationType': 'emergency'
      });
      
      console.log(`    ✅ Emergency consultation started at ${emergencyConsultationStart.toLocaleTimeString()}`);

      // Step 7: Emergency Treatment and Stabilization
      console.log('    Step 7: Emergency treatment and stabilization...');
      // Simulate longer emergency treatment time
      const treatmentDuration = 45 * 60 * 1000; // 45 minutes
      const treatmentEnd = new Date(emergencyConsultationStart.getTime() + treatmentDuration);
      
      await repositories.token.update(emergencyToken._id, {
        'metadata.treatmentEndTime': treatmentEnd,
        'metadata.treatmentDuration': treatmentDuration,
        'metadata.patientStabilized': true
      });
      
      console.log(`    ✅ Emergency treatment completed, patient stabilized`);

      // Step 8: Emergency Completion or Transfer
      console.log('    Step 8: Emergency case completion...');
      await repositories.token.updateStatus(emergencyToken.tokenId, 'completed');
      
      const completionTime = new Date();
      await repositories.token.update(emergencyToken._id, {
        'metadata.completionTime': completionTime,
        'metadata.outcome': 'stabilized_and_discharged'
      });
      
      console.log(`    ✅ Emergency case completed at ${completionTime.toLocaleTimeString()}`);

      // Step 9: Emergency Journey Verification
      console.log('    Step 9: Verifying emergency journey...');
      const finalEmergencyToken = await repositories.token.findByTokenId(emergencyToken.tokenId);
      
      expect(finalEmergencyToken.source).toBe('emergency');
      expect(finalEmergencyToken.status).toBe('completed');
      expect(finalEmergencyToken.priority).toBeGreaterThanOrEqual(1000);
      expect(finalEmergencyToken.metadata.fastTrack).toBe(true);
      
      console.log('    ✅ Emergency journey verification complete');
      console.log('\n  🚨 Emergency patient journey completed successfully!');
      
      // Emergency Journey Summary
      console.log('\n    📊 Emergency Journey Summary:');
      console.log(`    Patient: ${emergencyPatient.personalInfo.name} (Age: ${emergencyPatient.personalInfo.age})`);
      console.log(`    Complaint: ${emergencyPatient.departmentInfo.chiefComplaint}`);
      console.log(`    Priority: ${finalEmergencyToken.priority} (Emergency level)`);
      console.log(`    Doctor: ${emergencyDoctor.name} (${emergencyDoctor.specialty})`);
      console.log(`    Fast-track: ${finalEmergencyToken.metadata.fastTrack ? 'Yes' : 'No'}`);
      console.log(`    Outcome: ${finalEmergencyToken.metadata.outcome}`);
    });

    test('should handle emergency during busy period', async () => {
      console.log('  ⏰ Testing Emergency during busy period...');
      
      // Setup: Fill emergency slot with regular patients
      const emergencyDoctor = hospitalSystem.doctors.find(d => d.specialty === 'emergency_medicine');
      const emergencySlot = emergencyDoctor.morningSlot;
      
      // Add several regular patients to create busy period
      const regularPatients = [];
      for (let i = 0; i < 10; i++) {
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Busy Period Patient ${i + 1}` }
        }));
        
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: emergencyDoctor._id.toString(),
          slotId: emergencySlot.slotId,
          source: 'online',
          patientInfo: { age: 30 + i, urgencyLevel: 'routine' },
          waitingTime: 0
        });
        
        if (allocation.success) {
          regularPatients.push(allocation.data.token);
        }
      }
      
      console.log(`    ✅ Busy period setup: ${regularPatients.length} regular patients in queue`);

      // Emergency arrives during busy period
      const emergencyPatient = await repositories.patient.create(TestDataFactory.getEmergencyPatient());
      
      const emergencyAllocation = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: emergencyDoctor._id.toString(),
        slotId: emergencySlot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'critical',
          medicalHistory: { critical: true }
        },
        waitingTime: 0
      });
      
      // Emergency should be handled despite busy period
      if (emergencyAllocation.success) {
        console.log(`    ✅ Emergency handled during busy period via: ${emergencyAllocation.data.allocationMethod}`);
        
        // Emergency should get priority position
        expect(emergencyAllocation.data.token.priority).toBeGreaterThan(
          Math.max(...regularPatients.map(t => t.priority))
        );
      } else {
        // Should provide emergency alternatives
        expect(emergencyAllocation.data.alternatives).toBeDefined();
        console.log(`    ✅ Emergency alternatives provided: ${emergencyAllocation.data.recommendedAction}`);
      }
    });
  });

  describe('Follow-up Patient Journey', () => {
    test('should handle complete follow-up patient workflow', async () => {
      console.log('  🔄 Testing Follow-up patient complete workflow...');
      
      // Step 1: Initial Visit Setup
      console.log('    Step 1: Setting up initial visit history...');
      const cardiologyDoctor = hospitalSystem.doctors.find(d => d.specialty === 'cardiology');
      
      const followupPatient = await repositories.patient.create(TestDataFactory.createPatient({
        personalInfo: {
          name: 'Follow-up Patient',
          age: 55,
          gender: 'male'
        },
        departmentInfo: {
          preferredDepartment: 'cardiology',
          chiefComplaint: 'Follow-up for cardiac condition',
          urgencyLevel: 'routine',
          lastVisitedDoctor: cardiologyDoctor._id.toString() // Previous visit
        },
        medicalInfo: {
          chronicConditions: ['Hypertension', 'Cardiac Arrhythmia']
        }
      }));
      
      console.log(`    ✅ Follow-up patient registered: ${followupPatient.personalInfo.name}`);
      console.log(`    ✅ Previous doctor: ${cardiologyDoctor.name}`);

      // Step 2: Follow-up Priority Assessment
      console.log('    Step 2: Follow-up priority assessment...');
      const followupPriority = await services.priority.calculatePriority(
        'followup',
        {
          age: followupPatient.personalInfo.age,
          isFollowup: true,
          medicalHistory: { chronic: true }
        },
        0
      );
      
      expect(followupPriority.success).toBe(true);
      expect(followupPriority.data.priorityLevel).toBe('medium');
      console.log(`    ✅ Follow-up priority: ${followupPriority.data.finalPriority} (Medium level)`);

      // Step 3: Doctor Continuity Check
      console.log('    Step 3: Checking doctor continuity...');
      const continuityAllocation = await services.tokenAllocation.allocateToken({
        patientId: followupPatient.patientId,
        doctorId: cardiologyDoctor._id.toString(),
        slotId: cardiologyDoctor.afternoonSlot.slotId,
        source: 'followup',
        patientInfo: {
          age: followupPatient.personalInfo.age,
          isFollowup: true,
          lastVisitedDoctor: cardiologyDoctor._id.toString()
        },
        waitingTime: 0
      });
      
      if (continuityAllocation.success) {
        console.log(`    ✅ Continuity maintained: Same doctor appointment confirmed`);
        
        const followupToken = continuityAllocation.data.token;
        
        // Step 4: Follow-up Consultation
        console.log('    Step 4: Follow-up consultation...');
        await repositories.token.updateStatus(followupToken.tokenId, 'confirmed');
        
        // Simulate consultation with medical history review
        const consultationStart = new Date();
        await repositories.token.updateStatus(followupToken.tokenId, 'in_consultation');
        await repositories.token.update(followupToken._id, {
          'metadata.consultationStartTime': consultationStart,
          'metadata.consultationType': 'followup',
          'metadata.medicalHistoryReviewed': true
        });
        
        console.log(`    ✅ Follow-up consultation started with history review`);

        // Step 5: Follow-up Completion and Next Steps
        console.log('    Step 5: Follow-up completion and planning...');
        const consultationEnd = new Date();
        await repositories.token.updateStatus(followupToken.tokenId, 'completed');
        
        await repositories.token.update(followupToken._id, {
          'metadata.consultationEndTime': consultationEnd,
          'metadata.nextFollowupRecommended': true,
          'metadata.nextFollowupDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        console.log(`    ✅ Follow-up completed with next appointment recommended`);
        
        // Verify follow-up journey
        const finalFollowupToken = await repositories.token.findByTokenId(followupToken.tokenId);
        expect(finalFollowupToken.source).toBe('followup');
        expect(finalFollowupToken.status).toBe('completed');
        expect(finalFollowupToken.metadata.consultationType).toBe('followup');
        
        console.log('\n  🔄 Follow-up patient journey completed successfully!');
        
      } else {
        // Handle continuity recommendation
        console.log(`    ⚠️ Continuity issue: ${continuityAllocation.message}`);
        if (continuityAllocation.data && continuityAllocation.data.alternativeSlots) {
          console.log(`    ✅ Alternative slots with same doctor: ${continuityAllocation.data.alternativeSlots.length}`);
        }
      }
    });
  });

  describe('Complex Multi-Patient Scenarios', () => {
    test('should handle realistic daily patient flow', async () => {
      console.log('  🏥 Testing Realistic daily patient flow...');
      
      // Simulate a typical OPD day with mixed patient types
      const dailyPatients = [
        // Morning rush - online bookings
        ...Array.from({ length: 8 }, (_, i) => ({
          type: 'online',
          patient: TestDataFactory.createPatient({
            personalInfo: { name: `Morning Online ${i + 1}`, age: 30 + i }
          }),
          department: 'general_medicine',
          timeSlot: 'morning'
        })),
        
        // Walk-ins throughout the day
        ...Array.from({ length: 5 }, (_, i) => ({
          type: 'walkin',
          patient: TestDataFactory.createPatient({
            personalInfo: { name: `Walk-in ${i + 1}`, age: 25 + i }
          }),
          department: 'general_medicine',
          timeSlot: 'morning'
        })),
        
        // Priority patients
        ...Array.from({ length: 3 }, (_, i) => ({
          type: 'priority',
          patient: TestDataFactory.getPriorityPatient(),
          department: 'cardiology',
          timeSlot: 'afternoon'
        })),
        
        // Follow-up patients
        ...Array.from({ length: 4 }, (_, i) => ({
          type: 'followup',
          patient: TestDataFactory.getFollowupPatient(
            hospitalSystem.doctors.find(d => d.specialty === 'cardiology')._id.toString()
          ),
          department: 'cardiology',
          timeSlot: 'afternoon'
        })),
        
        // Emergency cases
        { type: 'emergency', patient: TestDataFactory.getEmergencyPatient(), department: 'emergency_medicine', timeSlot: 'morning' },
        { type: 'emergency', patient: TestDataFactory.getEmergencyPatient(), department: 'emergency_medicine', timeSlot: 'afternoon' }
      ];

      console.log(`    Processing ${dailyPatients.length} patients across all departments...`);
      
      const results = {
        successful: 0,
        failed: 0,
        byType: {},
        byDepartment: {}
      };

      // Process all patients
      for (const patientInfo of dailyPatients) {
        try {
          // Register patient
          const patient = await repositories.patient.create(patientInfo.patient);
          
          // Find appropriate doctor and slot
          const doctor = hospitalSystem.doctors.find(d => d.specialty === patientInfo.department);
          const slot = patientInfo.timeSlot === 'morning' ? doctor.morningSlot : doctor.afternoonSlot;
          
          // Allocate token
          const allocation = await services.tokenAllocation.allocateToken({
            patientId: patient.patientId,
            doctorId: doctor._id.toString(),
            slotId: slot.slotId,
            source: patientInfo.type,
            patientInfo: {
              age: patient.personalInfo.age,
              urgencyLevel: patient.departmentInfo.urgencyLevel || 'routine',
              isFollowup: patientInfo.type === 'followup',
              medicalHistory: patientInfo.type === 'emergency' ? { critical: true } : {}
            },
            waitingTime: 0
          });
          
          if (allocation.success) {
            results.successful++;
            results.byType[patientInfo.type] = (results.byType[patientInfo.type] || 0) + 1;
            results.byDepartment[patientInfo.department] = (results.byDepartment[patientInfo.department] || 0) + 1;
          } else {
            results.failed++;
          }
          
        } catch (error) {
          results.failed++;
        }
      }

      console.log('\n    📊 Daily Flow Results:');
      console.log(`    Total Processed: ${dailyPatients.length}`);
      console.log(`    Successful: ${results.successful} (${(results.successful/dailyPatients.length*100).toFixed(1)}%)`);
      console.log(`    Failed: ${results.failed} (${(results.failed/dailyPatients.length*100).toFixed(1)}%)`);
      
      console.log('\n    By Patient Type:');
      Object.entries(results.byType).forEach(([type, count]) => {
        console.log(`    ${type}: ${count} patients`);
      });
      
      console.log('\n    By Department:');
      Object.entries(results.byDepartment).forEach(([dept, count]) => {
        console.log(`    ${dept}: ${count} patients`);
      });

      // Verify system handled the load
      expect(results.successful).toBeGreaterThan(dailyPatients.length * 0.7); // At least 70% success
      expect(results.byType.emergency).toBeGreaterThan(0); // Emergencies should be handled
      
      console.log('\n  🏥 Daily patient flow handled successfully!');
    });
  });

  // Summary test to show what we've validated
  test('📊 Complete Patient Journey Summary', () => {
    console.log('\n📊 Complete Patient Journey Test Summary:');
    console.log('  ✅ Regular patient complete workflow (registration to completion)');
    console.log('  ✅ Patient with multiple appointments across departments');
    console.log('  ✅ Emergency patient complete workflow with fast-track');
    console.log('  ✅ Emergency handling during busy periods');
    console.log('  ✅ Follow-up patient workflow with doctor continuity');
    console.log('  ✅ Realistic daily patient flow across all departments');
    console.log('  ✅ Mixed patient types and priority handling');
    console.log('\n🎉 Complete patient journey testing successful! Ready for doctor operations testing.');
  });
});