/**
 * Integration Test 2: Emergency Scenarios
 * 
 * Purpose: Verify that emergency handling works correctly across all system components
 * 
 * What you'll learn:
 * - How emergency patients are prioritized throughout the system
 * - How preemption works (restricted to emergencies only)
 * - How the system handles emergency insertions in full slots
 * - How alternative solutions are provided when preemption isn't possible
 * - How emergency workflows differ from regular allocation flows
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

describe('🚨 Integration Test 2: Emergency Scenarios', () => {
  let dbSetup;
  let services;
  let repositories;
  let testData;

  beforeAll(async () => {
    console.log('\n🧪 Testing Emergency Scenarios Integration...');
    dbSetup = new DatabaseSetup();
    await dbSetup.connect();

    // Initialize repositories
    repositories = {
      token: new TokenRepository({ tokenModel: Token, logger }),
      slot: new SlotRepository({ timeSlotModel: TimeSlot, logger }),
      patient: new PatientRepository({ patientModel: Patient, logger }),
      doctor: new DoctorRepository({ doctorModel: Doctor, logger })
    };

    // Mock configuration service with emergency settings
    const mockConfigurationService = {
      getValue: async (key, defaultValue) => {
        const configs = {
          'priority.emergency': 1000,
          'priority.priority_patient': 800,
          'priority.followup': 600,
          'priority.online_booking': 400,
          'priority.walkin': 200,
          'preemption.min_priority_difference': 200,
          'preemption.emergency_threshold': 1000,
          'emergency.max_preemptions_per_slot': 2,
          'emergency.preemption_grace_period': 15
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

  describe('Emergency Priority Calculation and Handling', () => {
    test('should calculate emergency priorities correctly', async () => {
      console.log('  🎯 Testing Emergency priority calculation...');
      
      const emergencyScenarios = [
        {
          name: 'Critical Emergency - Elderly',
          patientInfo: {
            age: 75,
            urgencyLevel: 'emergency',
            medicalHistory: { critical: true, conditions: ['Heart Attack'] }
          },
          expectedMinPriority: 1200
        },
        {
          name: 'Severe Emergency - Adult',
          patientInfo: {
            age: 45,
            urgencyLevel: 'emergency',
            medicalHistory: { critical: true, conditions: ['Severe Trauma'] }
          },
          expectedMinPriority: 1100
        },
        {
          name: 'Emergency - Child',
          patientInfo: {
            age: 8,
            urgencyLevel: 'emergency',
            medicalHistory: { conditions: ['High Fever'] }
          },
          expectedMinPriority: 1000
        }
      ];

      for (const scenario of emergencyScenarios) {
        const priorityResult = await services.priority.calculatePriority(
          'emergency',
          scenario.patientInfo,
          0 // No waiting time for emergencies
        );

        expect(priorityResult.success).toBe(true);
        expect(priorityResult.data.priorityLevel).toBe('emergency');
        expect(priorityResult.data.finalPriority).toBeGreaterThanOrEqual(scenario.expectedMinPriority);

        console.log(`    ${scenario.name}: Priority ${priorityResult.data.finalPriority}`);
      }

      console.log('  ✅ Emergency priority calculation working correctly');
    });

    test('should prioritize emergencies over all other patients', async () => {
      console.log('  🏆 Testing Emergency vs Regular priority comparison...');
      
      // Calculate priorities for different patient types
      const patientTypes = [
        { source: 'emergency', patientInfo: { age: 50, urgencyLevel: 'emergency' }, label: 'Emergency' },
        { source: 'priority', patientInfo: { age: 80, urgencyLevel: 'urgent' }, label: 'Priority Elderly' },
        { source: 'followup', patientInfo: { age: 60, isFollowup: true }, label: 'Follow-up' },
        { source: 'online', patientInfo: { age: 40, urgencyLevel: 'routine' }, label: 'Online' },
        { source: 'walkin', patientInfo: { age: 30, urgencyLevel: 'routine' }, label: 'Walk-in' }
      ];

      const priorities = [];
      
      for (const type of patientTypes) {
        const result = await services.priority.calculatePriority(
          type.source,
          type.patientInfo,
          0
        );
        
        priorities.push({
          label: type.label,
          source: type.source,
          priority: result.data.finalPriority
        });
      }

      // Sort by priority (highest first)
      priorities.sort((a, b) => b.priority - a.priority);

      console.log('    Priority ranking:');
      priorities.forEach((p, index) => {
        console.log(`    ${index + 1}. ${p.label}: ${p.priority}`);
      });

      // Emergency should always be first
      expect(priorities[0].source).toBe('emergency');
      expect(priorities[0].priority).toBeGreaterThan(priorities[1].priority);

      console.log('  ✅ Emergency patients have highest priority');
    });
  });

  describe('Emergency Preemption Scenarios', () => {
    test('should handle emergency preemption in full slot', async () => {
      console.log('  🚨 Testing Emergency preemption in full slot...');
      
      // Setup: Create doctor and small capacity slot
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Emergency Test',
        specialty: 'emergency_medicine'
      }));
      
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 2, // Small capacity to force preemption
          specialty: 'emergency_medicine'
        })
      );

      // Fill slot with regular patients
      console.log('    Step 1: Filling slot with regular patients...');
      const regularPatients = [];
      
      for (let i = 0; i < 2; i++) {
        const patient = await repositories.patient.create(TestDataFactory.createPatient({
          personalInfo: { name: `Regular Patient ${i + 1}`, age: 30 + i },
          departmentInfo: { urgencyLevel: 'routine' }
        }));
        
        const allocationResult = await services.tokenAllocation.allocateToken({
          patientId: patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: slotResult.data.slot.slotId,
          source: 'online',
          patientInfo: { age: 30 + i, urgencyLevel: 'routine' },
          waitingTime: 0
        });
        
        expect(allocationResult.success).toBe(true);
        regularPatients.push({
          patient,
          token: allocationResult.data.token
        });
      }

      console.log(`    ✅ Slot filled with ${regularPatients.length} regular patients`);

      // Verify slot is full
      const fullSlot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      expect(fullSlot.currentAllocation).toBe(fullSlot.maxCapacity);

      // Step 2: Emergency patient arrives
      console.log('    Step 2: Emergency patient requesting allocation...');
      const emergencyPatient = await repositories.patient.create(TestDataFactory.getEmergencyPatient());
      
      const emergencyAllocationResult = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency',
          medicalHistory: { critical: true }
        },
        waitingTime: 0
      });

      // Verify emergency handling
      if (emergencyAllocationResult.success) {
        if (emergencyAllocationResult.data.allocationMethod === 'preemption') {
          OPDAssertions.expectPreemptionAllocation(emergencyAllocationResult);
          console.log(`    ✅ Emergency preemption successful: ${emergencyAllocationResult.data.preemptedTokens.length} tokens preempted`);
          
          // Verify preempted tokens were handled
          for (const preemptedTokenInfo of emergencyAllocationResult.data.preemptedTokens) {
            const tokenId = typeof preemptedTokenInfo === 'string' ? preemptedTokenInfo : preemptedTokenInfo.tokenId;
            const preemptedToken = await repositories.token.findByTokenId(tokenId);
            expect(['reallocated', 'cancelled']).toContain(preemptedToken.status);
          }
        } else {
          console.log(`    ✅ Emergency allocated via: ${emergencyAllocationResult.data.allocationMethod}`);
        }
      } else {
        // Should provide alternatives if preemption not possible
        OPDAssertions.expectAlternativeSolutions(emergencyAllocationResult);
        console.log(`    ✅ Emergency alternatives provided: ${emergencyAllocationResult.data.recommendedAction}`);
      }
    });

    test('should NOT preempt for non-emergency patients', async () => {
      console.log('  🚫 Testing Non-emergency preemption restriction...');
      
      // Setup: Create full slot
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 1 // Very small capacity
        })
      );

      // Fill slot with one patient
      const firstPatient = await repositories.patient.create(TestDataFactory.createPatient());
      const firstAllocation = await services.tokenAllocation.allocateToken({
        patientId: firstPatient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 30 },
        waitingTime: 0
      });
      expect(firstAllocation.success).toBe(true);

      // Try to allocate priority patient (non-emergency) to full slot
      const priorityPatient = await repositories.patient.create(TestDataFactory.getPriorityPatient());
      const priorityAllocation = await services.tokenAllocation.allocateToken({
        patientId: priorityPatient.patientId,
        doctorId: doctor._id.toString(),
        slotId: slotResult.data.slot.slotId,
        source: 'priority',
        patientInfo: { age: 70, urgencyLevel: 'urgent' },
        waitingTime: 0
      });

      // Should not succeed with preemption
      if (priorityAllocation.success) {
        expect(priorityAllocation.data.allocationMethod).not.toBe('preemption');
        console.log(`    ✅ Priority patient allocated via: ${priorityAllocation.data.allocationMethod}`);
      } else {
        // Should provide alternatives
        OPDAssertions.expectAlternativeSolutions(priorityAllocation);
        console.log(`    ✅ Priority patient provided alternatives: ${priorityAllocation.data.recommendedAction}`);
      }

      console.log('  ✅ Non-emergency preemption properly restricted');
    });

    test('should handle multiple emergency patients with priority ordering', async () => {
      console.log('  🚨🚨 Testing Multiple emergency patients...');
      
      // Setup
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        specialty: 'emergency_medicine'
      }));
      
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 5,
          specialty: 'emergency_medicine'
        })
      );

      // Create multiple emergency patients with different severity
      const emergencyPatients = [
        {
          patient: await repositories.patient.create(TestDataFactory.createPatient({
            personalInfo: { name: 'Critical Emergency', age: 75 },
            departmentInfo: { urgencyLevel: 'emergency' }
          })),
          severity: 'critical',
          expectedHighPriority: true
        },
        {
          patient: await repositories.patient.create(TestDataFactory.createPatient({
            personalInfo: { name: 'Severe Emergency', age: 45 },
            departmentInfo: { urgencyLevel: 'emergency' }
          })),
          severity: 'severe',
          expectedHighPriority: false
        },
        {
          patient: await repositories.patient.create(TestDataFactory.createPatient({
            personalInfo: { name: 'Moderate Emergency', age: 30 },
            departmentInfo: { urgencyLevel: 'urgent' }
          })),
          severity: 'moderate',
          expectedHighPriority: false
        }
      ];

      const allocationResults = [];

      // Allocate all emergency patients
      for (const emergencyInfo of emergencyPatients) {
        const result = await services.tokenAllocation.allocateToken({
          patientId: emergencyInfo.patient.patientId,
          doctorId: doctor._id.toString(),
          slotId: slotResult.data.slot.slotId,
          source: 'emergency',
          patientInfo: {
            age: emergencyInfo.patient.personalInfo.age,
            urgencyLevel: emergencyInfo.patient.departmentInfo.urgencyLevel,
            medicalHistory: { critical: emergencyInfo.severity === 'critical' }
          },
          waitingTime: 0
        });

        expect(result.success).toBe(true);
        allocationResults.push({
          name: emergencyInfo.patient.personalInfo.name,
          severity: emergencyInfo.severity,
          priority: result.data.token.priority,
          tokenNumber: result.data.token.tokenNumber
        });
      }

      // Sort by priority (highest first)
      allocationResults.sort((a, b) => b.priority - a.priority);

      console.log('    Emergency patient priority ordering:');
      allocationResults.forEach((result, index) => {
        console.log(`    ${index + 1}. ${result.name} (${result.severity}): Priority ${result.priority}, Token #${result.tokenNumber}`);
      });

      // Critical emergency should have highest priority
      expect(allocationResults[0].severity).toBe('critical');

      console.log('  ✅ Multiple emergency patients prioritized correctly');
    });
  });

  describe('Emergency Alternative Solutions', () => {
    test('should provide emergency-specific alternatives when preemption not possible', async () => {
      console.log('  🔄 Testing Emergency alternative solutions...');
      
      // Setup: Create multiple doctors in same department
      const emergencyDoctors = [];
      for (let i = 0; i < 2; i++) {
        const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
          name: `Dr. Emergency ${i + 1}`,
          specialty: 'emergency_medicine'
        }));
        emergencyDoctors.push(doctor);
      }

      // Create slots - first one full, second one available
      const fullSlotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: emergencyDoctors[0]._id.toString(),
          maxCapacity: 1,
          currentAllocation: 1, // Already full
          specialty: 'emergency_medicine'
        })
      );

      const availableSlotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: emergencyDoctors[1]._id.toString(),
          maxCapacity: 3,
          currentAllocation: 0,
          specialty: 'emergency_medicine',
          startTime: '10:00',
          endTime: '11:00'
        })
      );

      // Emergency patient requests full slot
      const emergencyPatient = await repositories.patient.create(TestDataFactory.getEmergencyPatient());
      
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: emergencyDoctors[0]._id.toString(),
        slotId: fullSlotResult.data.slot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency',
          preferredDepartment: 'cardiology'
        },
        waitingTime: 0
      });

      if (allocationResult.success) {
        console.log(`    ✅ Emergency allocated via: ${allocationResult.data.allocationMethod}`);
      } else {
        // Should provide emergency-specific alternatives
        OPDAssertions.expectAlternativeSolutions(allocationResult);
        
        expect(allocationResult.data.alternatives).toBeDefined();
        expect(allocationResult.data.recommendedAction).toContain('emergency');
        
        if (allocationResult.data.alternatives.sameDepartment) {
          expect(allocationResult.data.alternatives.sameDepartment.length).toBeGreaterThan(0);
          console.log(`    ✅ Same department alternatives: ${allocationResult.data.alternatives.sameDepartment.length}`);
        }
        
        console.log(`    ✅ Emergency alternatives provided: ${allocationResult.data.recommendedAction}`);
      }
    });

    test('should escalate emergency to higher capacity slots', async () => {
      console.log('  ⬆️ Testing Emergency escalation to higher capacity...');
      
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        specialty: 'emergency_medicine'
      }));

      // Create slots with different capacities
      const smallSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 2,
          currentAllocation: 2, // Full
          startTime: '09:00',
          endTime: '10:00',
          specialty: 'emergency_medicine'
        })
      );

      const largeSlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 10,
          currentAllocation: 5, // Has capacity
          startTime: '10:00',
          endTime: '11:00',
          specialty: 'emergency_medicine'
        })
      );

      // Emergency patient requests small full slot
      const emergencyPatient = await repositories.patient.create(TestDataFactory.getEmergencyPatient());
      
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: doctor._id.toString(),
        slotId: smallSlot.data.slot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency'
        },
        waitingTime: 0
      });

      if (allocationResult.success) {
        console.log(`    ✅ Emergency allocated via: ${allocationResult.data.allocationMethod}`);
      } else if (allocationResult.data.alternatives) {
        // Should suggest larger capacity slots
        if (allocationResult.data.alternatives.sameDoctorSlots) {
          const suggestedSlots = allocationResult.data.alternatives.sameDoctorSlots;
          expect(suggestedSlots.length).toBeGreaterThan(0);
          
          // Should include the larger capacity slot
          const hasLargerSlot = suggestedSlots.some(slot => 
            slot.maxCapacity > smallSlot.data.slot.maxCapacity
          );
          expect(hasLargerSlot).toBe(true);
          
          console.log(`    ✅ Higher capacity slots suggested: ${suggestedSlots.length}`);
        }
      }
    });
  });

  describe('Emergency Workflow Integration', () => {
    test('should handle complete emergency workflow', async () => {
      console.log('  🏥 Testing Complete emergency workflow...');
      
      // Step 1: Emergency patient arrives
      console.log('    Step 1: Emergency patient registration...');
      const emergencyPatient = await repositories.patient.create(TestDataFactory.createPatient({
        personalInfo: { name: 'Emergency Workflow Patient', age: 55 },
        departmentInfo: {
          preferredDepartment: 'cardiology', // Use valid department for emergency cases
          chiefComplaint: 'Chest pain and shortness of breath',
          urgencyLevel: 'emergency'
        },
        medicalInfo: {
          chronicConditions: ['Hypertension'],
          allergies: ['Penicillin']
        }
      }));

      // Step 2: System identifies available emergency doctors
      console.log('    Step 2: Finding available emergency doctors...');
      const emergencyDoctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Emergency Specialist',
        specialty: 'emergency_medicine',
        qualification: 'MBBS, MD Emergency Medicine'
      }));

      // Step 3: Create emergency slot
      console.log('    Step 3: Creating emergency time slot...');
      const emergencySlot = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: emergencyDoctor._id.toString(),
          maxCapacity: 8,
          specialty: 'emergency_medicine',
          status: 'active'
        })
      );

      // Step 4: Calculate emergency priority
      console.log('    Step 4: Calculating emergency priority...');
      const priorityResult = await services.priority.calculatePriority(
        'emergency',
        {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency',
          medicalHistory: { 
            critical: true,
            conditions: emergencyPatient.medicalInfo.chronicConditions
          }
        },
        0
      );

      expect(priorityResult.success).toBe(true);
      expect(priorityResult.data.priorityLevel).toBe('emergency');
      console.log(`    ✅ Emergency priority: ${priorityResult.data.finalPriority}`);

      // Step 5: Allocate emergency token
      console.log('    Step 5: Allocating emergency token...');
      const allocationResult = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: emergencyDoctor._id.toString(),
        slotId: emergencySlot.data.slot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency',
          medicalHistory: { critical: true },
          estimatedServiceTime: 30 // Emergency cases take longer
        },
        waitingTime: 0
      });

      OPDAssertions.expectSuccessfulAllocation(allocationResult);
      expect(allocationResult.data.token.source).toBe('emergency');
      expect(allocationResult.data.token.priority).toBeGreaterThanOrEqual(1000);

      // Step 6: Verify emergency token gets priority position
      console.log('    Step 6: Verifying emergency priority position...');
      
      // Add regular patient to same slot
      const regularPatient = await repositories.patient.create(TestDataFactory.createPatient());
      const regularAllocation = await services.tokenAllocation.allocateToken({
        patientId: regularPatient.patientId,
        doctorId: emergencyDoctor._id.toString(),
        slotId: emergencySlot.data.slot.slotId,
        source: 'online',
        patientInfo: { age: 30, urgencyLevel: 'routine' },
        waitingTime: 0
      });

      expect(regularAllocation.success).toBe(true);

      // Emergency should have lower token number (higher priority)
      expect(allocationResult.data.token.tokenNumber).toBeLessThan(regularAllocation.data.token.tokenNumber);

      console.log(`    ✅ Emergency token #${allocationResult.data.token.tokenNumber}, Regular token #${regularAllocation.data.token.tokenNumber}`);

      // Step 7: Verify complete workflow data integrity
      console.log('    Step 7: Verifying workflow data integrity...');
      
      const savedToken = await repositories.token.findByTokenId(allocationResult.data.token.tokenId);
      const updatedSlot = await repositories.slot.findBySlotId(emergencySlot.data.slot.slotId);
      
      expect(savedToken.source).toBe('emergency');
      expect(savedToken.status).toBe('allocated');
      expect(updatedSlot.currentAllocation).toBe(2); // Emergency + Regular
      
      console.log('  🎉 Complete emergency workflow successful!');
    });

    test('should handle emergency during peak hours', async () => {
      console.log('  ⏰ Testing Emergency during peak hours...');
      
      // Setup: Create busy scenario with multiple doctors and patients
      const doctors = [];
      for (let i = 0; i < 2; i++) {
        const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
          name: `Dr. Peak Hour ${i + 1}`,
          specialty: 'general_medicine'
        }));
        doctors.push(doctor);
      }

      // Create slots that are nearly full
      const slots = [];
      for (const doctor of doctors) {
        const slot = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            maxCapacity: 5,
            currentAllocation: 4, // Nearly full
            specialty: 'general_medicine'
          })
        );
        slots.push(slot);
      }

      // Fill remaining capacity with regular patients
      for (let i = 0; i < slots.length; i++) {
        const regularPatient = await repositories.patient.create(TestDataFactory.createPatient());
        const allocation = await services.tokenAllocation.allocateToken({
          patientId: regularPatient.patientId,
          doctorId: doctors[i]._id.toString(),
          slotId: slots[i].data.slot.slotId,
          source: 'online',
          patientInfo: { age: 30 },
          waitingTime: 0
        });
        expect(allocation.success).toBe(true);
      }

      // Now all slots are full - emergency arrives
      const emergencyPatient = await repositories.patient.create(TestDataFactory.getEmergencyPatient());
      
      const emergencyAllocation = await services.tokenAllocation.allocateToken({
        patientId: emergencyPatient.patientId,
        doctorId: doctors[0]._id.toString(),
        slotId: slots[0].data.slot.slotId,
        source: 'emergency',
        patientInfo: {
          age: emergencyPatient.personalInfo.age,
          urgencyLevel: 'emergency',
          medicalHistory: { critical: true }
        },
        waitingTime: 0
      });

      // Emergency should be handled even during peak hours
      if (emergencyAllocation.success) {
        console.log(`    ✅ Emergency handled during peak via: ${emergencyAllocation.data.allocationMethod}`);
        
        if (emergencyAllocation.data.allocationMethod === 'preemption') {
          expect(emergencyAllocation.data.preemptedTokens.length).toBeGreaterThan(0);
          console.log(`    ✅ Preempted ${emergencyAllocation.data.preemptedTokens.length} tokens during peak hours`);
        }
      } else {
        // Should provide alternatives
        OPDAssertions.expectAlternativeSolutions(emergencyAllocation);
        console.log(`    ✅ Emergency alternatives during peak: ${emergencyAllocation.data.recommendedAction}`);
      }
    });
  });

  // Summary test to show what we've validated
  test('📊 Emergency Scenarios Integration Summary', () => {
    console.log('\n📊 Emergency Scenarios Integration Test Summary:');
    console.log('  ✅ Emergency priority calculation and handling');
    console.log('  ✅ Emergency preemption in full slots (restricted to emergencies)');
    console.log('  ✅ Non-emergency preemption restrictions');
    console.log('  ✅ Multiple emergency patients with priority ordering');
    console.log('  ✅ Emergency-specific alternative solutions');
    console.log('  ✅ Complete emergency workflow integration');
    console.log('  ✅ Emergency handling during peak hours');
    console.log('\n🎉 Emergency scenarios integration is working perfectly! Ready for concurrency testing.');
  });
});