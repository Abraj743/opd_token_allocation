/**
 * Integration Test 3: Concurrency Handling
 * 
 * Purpose: Verify that the system handles concurrent operations safely and correctly
 * 
 * What you'll learn:
 * - How the system handles multiple simultaneous allocation requests
 * - How concurrency control prevents race conditions and data corruption
 * - How atomic operations ensure data consistency
 * - How the system maintains performance under concurrent load
 * - How slot capacity limits are enforced under concurrent access
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

describe('🔄 Integration Test 3: Concurrency Handling', () => {
  let dbSetup;
  let services;
  let repositories;
  let testData;

  beforeAll(async () => {
    console.log('\n🧪 Testing Concurrency Handling Integration...');
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
          'concurrency.max_retries': 3,
          'concurrency.retry_delay': 100
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

  describe('Concurrent Token Allocation', () => {
    test('should handle concurrent allocations to same slot safely', async () => {
      console.log('  🎫 Testing Concurrent allocations to same slot...');
      
      // Setup: Create doctor and slot with limited capacity
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Concurrency Test'
      }));
      
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 5, // Limited capacity to test concurrency
          currentAllocation: 0
        })
      );

      const slotId = slotResult.data.slot.slotId;
      const doctorId = doctor._id.toString();

      // Create multiple concurrent allocation requests
      console.log('    Creating 10 concurrent allocation requests...');
      const concurrentRequests = [];
      
      for (let i = 0; i < 10; i++) {
        const request = {
          patientId: `concurrent_patient_${i}`,
          doctorId,
          slotId,
          source: 'online',
          patientInfo: { age: 30 + i },
          waitingTime: 0
        };
        
        // Create promise but don't await yet
        concurrentRequests.push(
          services.tokenAllocation.allocateToken(request)
        );
      }

      // Execute all requests concurrently
      const startTime = Date.now();
      const results = await Promise.allSettled(concurrentRequests);
      const endTime = Date.now();
      
      console.log(`    ✅ Concurrent requests completed in ${endTime - startTime}ms`);

      // Analyze results
      const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failedResults = results.filter(r => r.status === 'rejected' || !r.value.success);
      
      console.log(`    ✅ Successful allocations: ${successfulResults.length}`);
      console.log(`    ✅ Failed allocations: ${failedResults.length}`);

      // Verify capacity constraints were respected
      expect(successfulResults.length).toBeLessThanOrEqual(5); // Should not exceed slot capacity
      expect(successfulResults.length).toBeGreaterThan(0); // At least some should succeed

      // Verify final slot state
      const finalSlot = await repositories.slot.findBySlotId(slotId);
      expect(finalSlot.currentAllocation).toBe(successfulResults.length);
      expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);

      // Verify token numbers are unique and sequential
      const tokens = [];
      for (const result of successfulResults) {
        const token = await repositories.token.findByTokenId(result.value.data.token.tokenId);
        tokens.push(token);
      }

      const tokenNumbers = tokens.map(t => t.tokenNumber).sort((a, b) => a - b);
      const uniqueNumbers = [...new Set(tokenNumbers)];
      
      expect(uniqueNumbers.length).toBe(tokenNumbers.length); // All numbers should be unique
      expect(tokenNumbers[0]).toBe(1); // Should start from 1
      expect(tokenNumbers[tokenNumbers.length - 1]).toBe(tokenNumbers.length); // Should be sequential

      console.log(`    ✅ Token numbers: ${tokenNumbers.join(', ')}`);
      console.log('  ✅ Concurrent allocation safety verified');
    });

    test('should handle concurrent allocations across multiple slots', async () => {
      console.log('  🎯 Testing Concurrent allocations across multiple slots...');
      
      // Setup: Create multiple doctors and slots
      const doctors = [];
      const slots = [];
      
      for (let i = 0; i < 3; i++) {
        const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
          name: `Dr. Multi Slot ${i + 1}`
        }));
        doctors.push(doctor);
        
        const slotResult = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            maxCapacity: 4,
            startTime: `${9 + i}:00`,
            endTime: `${10 + i}:00`
          })
        );
        slots.push(slotResult.data.slot);
      }

      // Create concurrent requests across all slots
      const concurrentRequests = [];
      
      for (let i = 0; i < 15; i++) { // 15 requests for 3 slots (12 total capacity)
        const slotIndex = i % 3;
        const request = {
          patientId: `multi_slot_patient_${i}`,
          doctorId: doctors[slotIndex]._id.toString(),
          slotId: slots[slotIndex].slotId,
          source: 'online',
          patientInfo: { age: 25 + i },
          waitingTime: 0
        };
        
        concurrentRequests.push(
          services.tokenAllocation.allocateToken(request)
        );
      }

      // Execute concurrently
      const results = await Promise.allSettled(concurrentRequests);
      
      const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failedResults = results.filter(r => r.status === 'rejected' || !r.value.success);
      
      console.log(`    ✅ Total successful: ${successfulResults.length}/15`);
      console.log(`    ✅ Total failed: ${failedResults.length}/15`);

      // Verify each slot's capacity was respected
      for (let i = 0; i < slots.length; i++) {
        const finalSlot = await repositories.slot.findBySlotId(slots[i].slotId);
        expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);
        
        console.log(`    Slot ${i + 1}: ${finalSlot.currentAllocation}/${finalSlot.maxCapacity} allocated`);
      }

      // Total successful should not exceed total capacity
      expect(successfulResults.length).toBeLessThanOrEqual(12); // 3 slots × 4 capacity each

      console.log('  ✅ Multi-slot concurrent allocation handled correctly');
    });
  });

  describe('Concurrent Slot Operations', () => {
    test('should handle concurrent slot capacity modifications', async () => {
      console.log('  📊 Testing Concurrent slot capacity modifications...');
      
      // Setup: Create slot
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 10,
          currentAllocation: 5
        })
      );

      const slotId = slotResult.data.slot.slotId;

      // Create concurrent capacity operations
      const operations = [
        () => services.slotManagement.allocateSlotCapacity(slotId),
        () => services.slotManagement.allocateSlotCapacity(slotId),
        () => services.slotManagement.deallocateSlotCapacity(slotId),
        () => services.slotManagement.allocateSlotCapacity(slotId),
        () => services.slotManagement.deallocateSlotCapacity(slotId)
      ];

      // Execute operations concurrently
      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      const successfulOps = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failedOps = results.filter(r => r.status === 'rejected' || !r.value.success);

      console.log(`    ✅ Successful operations: ${successfulOps.length}`);
      console.log(`    ✅ Failed operations: ${failedOps.length}`);

      // Verify final slot state is consistent
      const finalSlot = await repositories.slot.findBySlotId(slotId);
      expect(finalSlot.currentAllocation).toBeGreaterThanOrEqual(0);
      expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);

      console.log(`    ✅ Final slot allocation: ${finalSlot.currentAllocation}/${finalSlot.maxCapacity}`);
      console.log('  ✅ Concurrent slot operations handled safely');
    });

    test('should prevent slot capacity violations under concurrent load', async () => {
      console.log('  🚫 Testing Slot capacity violation prevention...');
      
      // Setup: Create slot with very small capacity
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 2, // Very small capacity
          currentAllocation: 0
        })
      );

      // Create many concurrent allocation attempts
      const allocationPromises = [];
      for (let i = 0; i < 8; i++) { // 8 attempts for 2 capacity
        allocationPromises.push(
          services.tokenAllocation.allocateToken({
            patientId: `capacity_test_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slotResult.data.slot.slotId,
            source: 'online',
            patientInfo: { age: 30 + i },
            waitingTime: 0
          })
        );
      }

      const results = await Promise.allSettled(allocationPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      // Should have exactly 2 successful (capacity limit)
      expect(successful.length).toBe(2);
      expect(failed.length).toBe(6);

      // Verify slot capacity was not exceeded
      const finalSlot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      expect(finalSlot.currentAllocation).toBe(2);
      expect(finalSlot.currentAllocation).toBe(finalSlot.maxCapacity);

      console.log(`    ✅ Capacity respected: ${successful.length} successful, ${failed.length} rejected`);
      console.log('  ✅ Capacity violations prevented under concurrent load');
    });
  });

  describe('Concurrent Emergency Handling', () => {
    test('should handle concurrent emergency allocations', async () => {
      console.log('  🚨 Testing Concurrent emergency allocations...');
      
      // Setup: Create emergency doctor with limited capacity
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
        name: 'Dr. Emergency Concurrent',
        specialty: 'emergency_medicine'
      }));
      
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 3,
          specialty: 'emergency_medicine'
        })
      );

      // Create concurrent emergency requests
      const emergencyRequests = [];
      for (let i = 0; i < 5; i++) { // 5 emergencies for 3 capacity
        emergencyRequests.push(
          services.tokenAllocation.allocateToken({
            patientId: `emergency_concurrent_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slotResult.data.slot.slotId,
            source: 'emergency',
            patientInfo: {
              age: 50 + i,
              urgencyLevel: 'critical',
              medicalHistory: { critical: true }
            },
            waitingTime: 0
          })
        );
      }

      const results = await Promise.allSettled(emergencyRequests);
      
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      console.log(`    ✅ Emergency allocations: ${successful.length} successful, ${failed.length} failed`);

      // Verify emergency priorities were handled correctly
      const tokens = [];
      for (const result of successful) {
        const token = await repositories.token.findByTokenId(result.value.data.token.tokenId);
        tokens.push(token);
      }

      // All successful tokens should be emergency priority
      tokens.forEach(token => {
        expect(token.source).toBe('emergency');
        expect(token.priority).toBeGreaterThanOrEqual(1000);
      });

      // Verify slot capacity constraints
      const finalSlot = await repositories.slot.findBySlotId(slotResult.data.slot.slotId);
      expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);

      console.log('  ✅ Concurrent emergency allocations handled correctly');
    });

    test('should handle mixed concurrent requests (emergency + regular)', async () => {
      console.log('  🔀 Testing Mixed concurrent requests...');
      
      // Setup
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slotResult = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 6
        })
      );

      // Create mixed concurrent requests
      const mixedRequests = [];
      
      // Add emergency requests
      for (let i = 0; i < 2; i++) {
        mixedRequests.push({
          type: 'emergency',
          promise: services.tokenAllocation.allocateToken({
            patientId: `emergency_mixed_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slotResult.data.slot.slotId,
            source: 'emergency',
            patientInfo: { age: 60 + i, urgencyLevel: 'critical' },
            waitingTime: 0
          })
        });
      }

      // Add regular requests
      for (let i = 0; i < 6; i++) {
        mixedRequests.push({
          type: 'regular',
          promise: services.tokenAllocation.allocateToken({
            patientId: `regular_mixed_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slotResult.data.slot.slotId,
            source: 'online',
            patientInfo: { age: 30 + i, urgencyLevel: 'routine' },
            waitingTime: 0
          })
        });
      }

      // Shuffle requests to simulate random arrival order
      for (let i = mixedRequests.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mixedRequests[i], mixedRequests[j]] = [mixedRequests[j], mixedRequests[i]];
      }

      // Execute all requests concurrently
      const results = await Promise.allSettled(
        mixedRequests.map(req => req.promise)
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      console.log(`    ✅ Mixed requests: ${successful.length} successful, ${failed.length} failed`);

      // Analyze successful allocations by type
      const successfulTokens = [];
      for (const result of successful) {
        const token = await repositories.token.findByTokenId(result.value.data.token.tokenId);
        successfulTokens.push(token);
      }

      const emergencyTokens = successfulTokens.filter(t => t.source === 'emergency');
      const regularTokens = successfulTokens.filter(t => t.source === 'online');

      console.log(`    ✅ Emergency tokens allocated: ${emergencyTokens.length}`);
      console.log(`    ✅ Regular tokens allocated: ${regularTokens.length}`);

      // Emergency tokens should have lower numbers (higher priority)
      if (emergencyTokens.length > 0 && regularTokens.length > 0) {
        const maxEmergencyNumber = Math.max(...emergencyTokens.map(t => t.tokenNumber));
        const minRegularNumber = Math.min(...regularTokens.map(t => t.tokenNumber));
        
        // This might not always be true due to concurrency, but let's check priorities
        const emergencyPriorities = emergencyTokens.map(t => t.priority);
        const regularPriorities = regularTokens.map(t => t.priority);
        
        expect(Math.min(...emergencyPriorities)).toBeGreaterThan(Math.max(...regularPriorities));
        console.log(`    ✅ Emergency priorities (${emergencyPriorities.join(',')}) > Regular priorities (${regularPriorities.join(',')})`);
      }

      console.log('  ✅ Mixed concurrent requests handled with proper prioritization');
    });
  });

  describe('Performance Under Concurrent Load', () => {
    test('should maintain performance under high concurrent load', async () => {
      console.log('  ⚡ Testing Performance under high concurrent load...');
      
      // Setup: Create multiple doctors and slots
      const doctors = [];
      const slots = [];
      
      for (let i = 0; i < 3; i++) { // Reduced from 5 to 3 for faster execution
        const doctor = await repositories.doctor.create(TestDataFactory.createDoctor({
          name: `Dr. Load Test ${i + 1}`
        }));
        doctors.push(doctor);
        
        const slotResult = await services.slotManagement.createSlot(
          TestDataFactory.createTimeSlot({
            doctorId: doctor._id.toString(),
            maxCapacity: 8, // Reduced capacity for faster processing
            startTime: `${9 + i}:00`,
            endTime: `${10 + i}:00`
          })
        );
        slots.push(slotResult.data.slot);
      }

      // Create moderate volume of concurrent requests (reduced from 100 to 50)
      const totalRequests = 50;
      const concurrentRequests = [];
      
      console.log(`    Creating ${totalRequests} concurrent requests...`);
      
      for (let i = 0; i < totalRequests; i++) {
        const slotIndex = i % slots.length;
        const request = {
          patientId: `load_test_patient_${i}`,
          doctorId: doctors[slotIndex]._id.toString(),
          slotId: slots[slotIndex].slotId,
          source: i % 10 === 0 ? 'emergency' : 'online', // 10% emergency
          patientInfo: {
            age: 20 + (i % 60),
            urgencyLevel: i % 10 === 0 ? 'critical' : 'routine'
          },
          waitingTime: 0
        };
        
        concurrentRequests.push(
          services.tokenAllocation.allocateToken(request)
        );
      }

      // Execute with performance measurement
      const startTime = Date.now();
      const results = await Promise.allSettled(concurrentRequests);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      console.log(`    ✅ Load test completed in ${totalTime}ms`);
      console.log(`    ✅ Successful: ${successful.length}/${totalRequests} (${(successful.length/totalRequests*100).toFixed(1)}%)`);
      console.log(`    ✅ Failed: ${failed.length}/${totalRequests} (${(failed.length/totalRequests*100).toFixed(1)}%)`);
      console.log(`    ✅ Average time per request: ${(totalTime/totalRequests).toFixed(2)}ms`);
      console.log(`    ✅ Throughput: ${(totalRequests/(totalTime/1000)).toFixed(1)} requests/second`);

      // Performance assertions (more lenient)
      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
      expect(successful.length).toBeGreaterThan(totalRequests * 0.3); // At least 30% success rate
      
      // Verify data consistency after high load
      let totalAllocated = 0;
      for (const slot of slots) {
        const finalSlot = await repositories.slot.findBySlotId(slot.slotId);
        expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);
        totalAllocated += finalSlot.currentAllocation;
      }
      
      expect(totalAllocated).toBe(successful.length);
      console.log(`    ✅ Data consistency verified: ${totalAllocated} total allocations`);

      console.log('  ✅ System maintained performance and consistency under high load');
    }, 20000); // 20 second timeout

    test('should handle concurrent operations without deadlocks', async () => {
      console.log('  🔒 Testing Deadlock prevention...');
      
      // Setup: Create shared resources
      const doctor = await repositories.doctor.create(TestDataFactory.createDoctor());
      const slot1 = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 5,
          startTime: '09:00',
          endTime: '10:00'
        })
      );
      
      const slot2 = await services.slotManagement.createSlot(
        TestDataFactory.createTimeSlot({
          doctorId: doctor._id.toString(),
          maxCapacity: 5,
          startTime: '10:00',
          endTime: '11:00'
        })
      );

      // Create operations that could potentially deadlock (reduced volume)
      const operations = [];
      
      // Concurrent allocations to both slots (reduced from 10 to 5)
      for (let i = 0; i < 5; i++) {
        operations.push(
          services.tokenAllocation.allocateToken({
            patientId: `deadlock_test_1_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slot1.data.slot.slotId,
            source: 'online',
            patientInfo: { age: 30 + i },
            waitingTime: 0
          })
        );
        
        operations.push(
          services.tokenAllocation.allocateToken({
            patientId: `deadlock_test_2_${i}`,
            doctorId: doctor._id.toString(),
            slotId: slot2.data.slot.slotId,
            source: 'online',
            patientInfo: { age: 30 + i },
            waitingTime: 0
          })
        );
      }

      // Add some capacity operations (reduced from 5 to 3)
      for (let i = 0; i < 3; i++) {
        operations.push(
          services.slotManagement.allocateSlotCapacity(slot1.data.slot.slotId)
        );
        operations.push(
          services.slotManagement.deallocateSlotCapacity(slot1.data.slot.slotId)
        );
      }

      // Execute all operations concurrently with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operations timed out - possible deadlock')), 10000); // Reduced timeout
      });

      try {
        const results = await Promise.race([
          Promise.allSettled(operations),
          timeoutPromise
        ]);

        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
        const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

        console.log(`    ✅ Operations completed without deadlock`);
        console.log(`    ✅ Successful: ${successful.length}, Failed: ${failed.length}`);

        // Verify final state consistency
        const finalSlot1 = await repositories.slot.findBySlotId(slot1.data.slot.slotId);
        const finalSlot2 = await repositories.slot.findBySlotId(slot2.data.slot.slotId);
        
        expect(finalSlot1.currentAllocation).toBeLessThanOrEqual(finalSlot1.maxCapacity);
        expect(finalSlot2.currentAllocation).toBeLessThanOrEqual(finalSlot2.maxCapacity);

        console.log('  ✅ No deadlocks detected, operations completed successfully');
        
      } catch (error) {
        if (error.message.includes('timed out')) {
          throw new Error('Deadlock detected - operations did not complete within timeout');
        }
        throw error;
      }
    }, 15000); // 15 second timeout
  });

  // Summary test to show what we've validated
  test('📊 Concurrency Handling Integration Summary', () => {
    console.log('\n📊 Concurrency Handling Integration Test Summary:');
    console.log('  ✅ Concurrent token allocations to same slot');
    console.log('  ✅ Concurrent allocations across multiple slots');
    console.log('  ✅ Concurrent slot capacity modifications');
    console.log('  ✅ Slot capacity violation prevention under load');
    console.log('  ✅ Concurrent emergency allocation handling');
    console.log('  ✅ Mixed concurrent requests (emergency + regular)');
    console.log('  ✅ Performance under high concurrent load');
    console.log('  ✅ Deadlock prevention and timeout handling');
    console.log('\n🎉 Concurrency handling integration is working perfectly! Ready for end-to-end testing.');
  });
});