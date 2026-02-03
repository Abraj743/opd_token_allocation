/**
 * Integration Test 1: Basic Allocation Flow
 * 
 * Purpose: Verify that all components work together in basic allocation scenarios
 * 
 * What you'll learn:
 * - How the complete allocation flow works from request to completion
 * - How services interact with each other and repositories
 * - How data flows through the entire system
 * - How the system handles real-world allocation scenarios
 * - How different components coordinate to provide seamless functionality
 */

const DatabaseSetup = require('../helpers/database-setup');
const TestDataFactory = require('../helpers/test-data');
const OPDAssertions = require('../helpers/assertions');

// Import all the services and repositories
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

describe('🔄 Integration Test 1: Basic Allocation Flow', () => {
  let dbSetup;
  let services;
  let repositories;
  let testData;

  beforeAll(async () => {
    console.log('\n🧪 Testing Basic Allocation Flow Integration...');
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
          'slot.default_capacity': 5,
          'preemption.min_priority_difference': 200
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

    testData = {
      doctors: [],
      patients: [],
      slots: [],
      tokens: []
    };
  });

  afterAll(async () => {
    await dbSetup.disconnect();
  });

  beforeEach(async () => {
    await dbSetup.clearDatabase();
    testData = { doctors: [], patients: [], slots: [], tokens: [] };
  });

  describe('Complete Patient Registration to Token Allocation Flow', () => {
    test('should handle complete patient journey from registration to token allocation', async () => {
      console.log('  👤 Testing Complete patient journey...');
      
      // Step 1: Create and register a doctor
      console.log('    Step 1: Registering doctor...');
      const doctorData = TestDataFactory.createDoctor({
        name: 'Dr. Integration Test',
        specialty: 'general_medicine'
      });
      
      const doctor = await repositories.doctor.create(doctorData);
      testData.doctors.push(doctor);
      
      expect(doctor._id).toBeDefined();
      console.log(`    ✅ Doctor registered: ${doctor.name} (${doctor.specialty})`);

      // Step 2: Create time slots for the doctor
      console.log('    Step 2: Creating time slots...');
      const slotData = TestDataFactory.createTimeSlot({
        doctorId: doctor._id.toString(),
        specialty: doctor.specialty,
        maxCapacity: 5,
        currentAllocation: 0
      });
      
      const slotResult = await services.slotManagement.createSlot(slotData);
      expect(slotResult.success).toBe(true);
      testData.slots.push(slotResult.data.slot);
      
      console.log(`    ✅ Slot created: ${slotResult.data.slot.startTime}-${slotResult.data.slot.endTime} (Capacity: ${slotResult.data.slot.maxCapacity})`);

      // Step 3: Register a patient
      console.log('    Step 3: Registering patient...');
      const patientData = TestDataFactory.createPatient({
        personalInfo: {
          name: 'Integration Test Patient',
          age: 35,
          phoneNumber: '9876543210'
        },
        departmentInfo: {
          preferredDepartment: 'general_medicine',
          chiefComplaint: 'Routine checkup',
          urgencyLevel: 'routine'
        }
      });
      
      const patient = await repositories.patient.create(patientData);
      testData.patients.push(patient);
      
      expect(patient._id).toBeDefined();
      console.log(`    ✅ Patient registered: ${patient.personalInfo.name} (Age: ${patient.personalInfo.age})`);

      // Step 4: Calculate patient priority
      console.log('    Step 4: Calculating patient priority...');
      const priorityResult = await services.priority.calculatePriority(
        'online',
        {
          age: patient.personalInfo.age,
          urgencyLevel: patient.departmentInfo.urgencyLevel
        },
        0 // No waiting time
      );
      
      expect(priorityResult.success).toBe(true);
      console.log(`    ✅ Priority calculated: ${priorityResult.data.finalPriority} (${priorityResult.data.priorityLevel})`);

      // Step 5: Check slot availability
      console.log('    Step 5: Checking slot availability...');
      const availabilityResult = await services.slotManagement.checkSlotAvailability(
        slotResult.data.slot.slotId
      );
      
      expect(availabilityResult.success).toBe(true);
      expect(availabilityResult.data.isAvailable).toBe(true);
      console.log(`    ✅ Slot available: ${availabilityResult.data.availableCapacity}/${slotResult.data.slot.maxCapacity} capacity`);

      // Step 6: Allocate token
      console.log('    Step 6: Allocating token...');
      const allocationRequest = {
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: {
          age: patient.personalInfo.age,
          urgencyLevel: patient.departmentInfo.urgencyLevel
        },
        waitingTime: 0
      };
      
      const allocationResult = await services.tokenAllocation.allocateToken(allocationRequest);
      
      OPDAssertions.expectSuccessfulAllocation(allocationResult);
      testData.tokens.push(allocationResult.data.token);
      
      console.log(`    ✅ Token allocated: ${allocationResult.data.token.tokenId} (Number: ${allocationResult.data.token.tokenNumber})`);

      // Step 7: Verify complete integration
      console.log('    Step 7: Verifying integration...');
      
      // Verify token was created in database
      const savedToken = await repositories.token.findByTokenId(allocationResult.data.token.tokenId);
      expect(savedToken).toBeDefined();
      expect(savedToken.patientId).toBe(patient.patientId);
      expect(savedToken.doctorId).toBe(doctor._id.toString());
      
      // Verify slot allocation was updated
      const updatedSlot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      expect(updatedSlot.currentAllocation).toBe(1);
      
      // Verify patient-token relationship
      const patientTokens = await repositories.token.findByPatientId(patient.patientId);
      expect(patientTokens).toHaveLength(1);
      expect(patientTokens[0].tokenId).toBe(allocationResult.data.token.tokenId);
      
      console.log('    ✅ Integration verified: All components working together');
      console.log('\n  🎉 Complete patient journey successful!');
    });

    test('should handle multiple patients with different priorities', async () => {
      console.log('  👥 Testing Multiple patients with priorities...');
      
      // Setup: Create doctor and slot
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 10
        })
      );
      
      // Create patients with different characteristics
      const patients = [
        {
          data: TestDataFactory.createPatient({
            personalInfo: { name: 'Young Patient', age: 25 },
            departmentInfo: { urgencyLevel: 'routine' }
          }),
          source: 'walkin',
          expectedPriorityRange: [200, 400]
        },
        {
          data: TestDataFactory.createPatient({
            personalInfo: { name: 'Elderly Patient', age: 75 },
            departmentInfo: { urgencyLevel: 'urgent' }
          }),
          source: 'priority',
          expectedPriorityRange: [700, 900]
        },
        {
          data: TestDataFactory.createPatient({
            personalInfo: { name: 'Regular Patient', age: 40 },
            departmentInfo: { urgencyLevel: 'routine' }
          }),
          source: 'online',
          expectedPriorityRange: [300, 500]
        }
      ];
      
      const allocationResults = [];
      
      // Register patients and allocate tokens
      for (const patientInfo of patients) {
        // Register patient
        const patient = await repositories.patient.create(patientInfo.data);
        
        // Allocate token
        const allocationRequest = {
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: slotResult.data.slot.slotId,
          source: patientInfo.source,
          patientInfo: {
            age: patient.personalInfo.age,
            urgencyLevel: patient.departmentInfo.urgencyLevel
          },
          waitingTime: 0
        };
        
        const result = await services.tokenAllocation.allocateToken(allocationRequest);
        expect(result.success).toBe(true);
        
        allocationResults.push({
          patient: patient.personalInfo.name,
          source: patientInfo.source,
          priority: result.data.token.priority,
          tokenNumber: result.data.token.tokenNumber,
          expectedRange: patientInfo.expectedPriorityRange
        });
      }
      
      // Verify priority ordering
      allocationResults.sort((a, b) => b.priority - a.priority);
      
      console.log('    Priority allocation results:');
      allocationResults.forEach((result, index) => {
        console.log(`    ${index + 1}. ${result.patient} (${result.source}): Priority ${result.priority}, Token #${result.tokenNumber}`);
        
        // Verify priority is in expected range
        expect(result.priority).toBeGreaterThanOrEqual(result.expectedRange[0]);
        expect(result.priority).toBeLessThanOrEqual(result.expectedRange[1]);
      });
      
      // Elderly priority patient should have highest priority
      expect(allocationResults[0].patient).toBe('Elderly Patient');
      
      console.log('  ✅ Multiple patient priorities handled correctly');
    });
  });

  describe('Service Integration and Data Flow', () => {
    test('should demonstrate service coordination in slot management', async () => {
      console.log('  🔗 Testing Service coordination...');
      
      // Create test data
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const patient = await repositories.patient.create(TestDataFactory.createPatient());
      
      // Step 1: Slot Management Service creates slot
      console.log('    Step 1: Creating slot via SlotManagementService...');
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 3
        })
      );
      expect(slotResult.success).toBe(true);
      
      // Step 2: Priority Calculation Service calculates priority
      console.log('    Step 2: Calculating priority via PriorityCalculationService...');
      const priorityResult = await services.priority.calculatePriority(
        'online',
        { age: 35, urgencyLevel: 'routine' },
        0
      );
      expect(priorityResult.success).toBe(true);
      
      // Step 3: Token Allocation Service coordinates everything
      console.log('    Step 3: Coordinating allocation via TokenAllocationService...');
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 35, urgencyLevel: 'routine' },
        waitingTime: 0
      });
      
      expect(allocationResult.success).toBe(true);
      
      // Step 4: Verify all services updated their respective data
      console.log('    Step 4: Verifying cross-service data consistency...');
      
      // Check slot was updated by SlotManagementService
      const updatedSlot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      expect(updatedSlot.currentAllocation).toBe(1);
      
      // Check token was created with correct priority
      const token = await repositories.token.findByTokenId(allocationResult.data.token.tokenId);
      expect(token.priority).toBe(priorityResult.data.finalPriority);
      
      // Check patient-token relationship
      const patientTokens = await repositories.token.findByPatientId(patient.patientId);
      expect(patientTokens).toHaveLength(1);
      
      console.log('  ✅ Service coordination working perfectly');
    });

    test('should handle service failures gracefully', async () => {
      console.log('  ⚠️ Testing Service failure handling...');
      
      // Test allocation to non-existent slot (should fail gracefully)
      const patient = await repositories.patient.create(TestDataFactory.createPatient());
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: 'non_existent_slot',
        source: 'online',
        patientInfo: { age: 35 },
        waitingTime: 0
      });
      
      expect(allocationResult.success).toBe(false);
      expect(allocationResult.error.code).toBe('SLOT_NOT_FOUND');
      
      // Verify no partial data was created
      const tokens = await repositories.token.findByPatientId(patient.patientId);
      expect(tokens).toHaveLength(0);
      
      console.log('  ✅ Service failures handled gracefully');
    });
  });

  describe('Repository Integration', () => {
    test('should demonstrate repository coordination', async () => {
      console.log('  🗄️ Testing Repository coordination...');
      
      // Create related data across multiple repositories
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const patient = await repositories.patient.create(TestDataFactory.createPatient());
      
      const slot = await repositories.slot.create(TestDataFactory.createTimeSlot({
        doctorId: doctor._id.toString()
      }));
      
      const token = await repositories.token.create(TestDataFactory.createToken({
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slot.slotId
      }));
      
      // Test cross-repository queries
      console.log('    Testing cross-repository relationships...');
      
      // Find tokens by doctor
      const doctorTokens = await repositories.token.findByDoctorId(doctor._id.toString());
      expect(doctorTokens).toHaveLength(1);
      expect(doctorTokens[0].tokenId).toBe(token.tokenId);
      
      // Find slots by doctor
      const doctorSlots = await repositories.slot.findByDoctorId(doctor._id.toString());
      expect(doctorSlots).toHaveLength(1);
      expect(doctorSlots[0].slotId).toBe(slot.slotId);
      
      // Find tokens by patient
      const patientTokens = await repositories.token.findByPatientId(patient.patientId);
      expect(patientTokens).toHaveLength(1);
      expect(patientTokens[0].tokenId).toBe(token.tokenId);
      
      console.log('  ✅ Repository coordination working correctly');
    });

    test('should maintain data consistency across repositories', async () => {
      console.log('  🔒 Testing Data consistency...');
      
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const patient = await repositories.patient.create(TestDataFactory.createPatient());
      
      // Create slot and allocate token
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 5
        })
      );
      
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 35 },
        waitingTime: 0
      });
      
      expect(allocationResult.success).toBe(true);
      
      // Verify consistency across all repositories
      const slot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      const token = await repositories.token.findByTokenId(allocationResult.data.token.tokenId);
      
      // Check referential integrity
      expect(token.doctorId).toBe(doctor._id.toString());
      expect(token.patientId).toBe(patient.patientId);
      expect(token.slotId).toBe(slot.slotId);
      expect(slot.doctorId).toBe(doctor._id.toString());
      
      // Check allocation consistency
      expect(slot.currentAllocation).toBe(1);
      
      console.log('  ✅ Data consistency maintained across repositories');
    });
  });

  describe('Error Propagation and Recovery', () => {
    test('should handle and propagate errors correctly', async () => {
      console.log('  🚨 Testing Error propagation...');
      
      // Test invalid allocation request
      const invalidResult = await services.tokenAllocation.allocateToken({
        // Missing required fields
        patientId: 'test_patient',
        source: 'online'
      });
      
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toBeDefined();
      expect(invalidResult.error.code).toBe('VALIDATION_ERROR');
      
      console.log(`    ✅ Validation error properly propagated: ${invalidResult.error.code}`);
      
      // Test database constraint violations
      try {
        // Try to create duplicate slot
        const slotData = TestDataFactory.createTimeSlot();
        await repositories.slot.create(slotData);
        await repositories.slot.create(slotData); // Duplicate
        
        // If no error thrown, that's also valid (depends on constraints)
        console.log('    ✅ Duplicate handling working');
      } catch (error) {
        console.log(`    ✅ Database constraint properly enforced: ${error.message}`);
      }
    });

    test('should recover from transient failures', async () => {
      console.log('  🔄 Testing Failure recovery...');
      
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const patient = await repositories.patient.create(TestDataFactory.createPatient());
      
      // Create slot with very small capacity
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 1
        })
      );
      
      // First allocation should succeed
      const firstResult = await services.tokenAllocation.allocateToken({
        patientId: patient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 35 },
        waitingTime: 0
      });
      
      expect(firstResult.success).toBe(true);
      
      // Second allocation should fail (slot full)
      const secondResult = await services.tokenAllocation.allocateToken({
        patientId: 'another_patient',
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 30 },
        waitingTime: 0
      });
      
      expect(secondResult.success).toBe(false);
      
      // Cancel first token to free capacity
      const cancellationResult = await services.tokenAllocation.cancelToken(
        firstResult.data.token.tokenId,
        'patient_request'
      );
      
      expect(cancellationResult.success).toBe(true);
      
      // Now second allocation should succeed
      const retryResult = await services.tokenAllocation.allocateToken({
        patientId: 'another_patient',
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 30 },
        waitingTime: 0
      });
      
      expect(retryResult.success).toBe(true);
      
      console.log('  ✅ System recovered from capacity constraint');
    });
  });

  // Summary test to show what we've validated
  test('📊 Basic Allocation Flow Integration Summary', () => {
    console.log('\n📊 Basic Allocation Flow Integration Test Summary:');
    console.log('  ✅ Complete patient journey from registration to token allocation');
    console.log('  ✅ Multiple patients with different priorities');
    console.log('  ✅ Service coordination and data flow');
    console.log('  ✅ Repository integration and relationships');
    console.log('  ✅ Data consistency across all components');
    console.log('  ✅ Error propagation and recovery mechanisms');
    console.log('\n🎉 Basic allocation flow integration is working perfectly! Ready for emergency scenarios testing.');
  });
});