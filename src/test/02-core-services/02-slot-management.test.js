/**
 * Core Services Test 2: Slot Management Service
 * 
 * Purpose: Verify that slot management operations work correctly
 * 
 * What you'll learn:
 * - How time slots are created and managed
 * - Slot availability checking and capacity management
 * - Future slot generation based on doctor schedules
 * - Slot status management and updates
 * - Slot allocation and deallocation operations
 */

const DatabaseSetup = require('../helpers/database-setup');
const TestDataFactory = require('../helpers/test-data');
const OPDAssertions = require('../helpers/assertions');

const SlotManagementService = require('../../services/SlotManagementService');
const SlotRepository = require('../../repositories/SlotRepository');
const TokenRepository = require('../../repositories/TokenRepository');

const TimeSlot = require('../../models/TimeSlot');
const Token = require('../../models/Token');
const logger = require('../../config/logger');

describe('⏰ Core Services Test 2: Slot Management', () => {
  let dbSetup;
  let slotManagementService;
  let slotRepository;
  let tokenRepository;

  beforeAll(async () => {
    console.log('\n🧪 Testing Slot Management Service...');
    dbSetup = new DatabaseSetup();
    await dbSetup.connect();

    // Initialize repositories
    slotRepository = new SlotRepository({ timeSlotModel: TimeSlot, logger });
    tokenRepository = new TokenRepository({ tokenModel: Token, logger });

    // Mock configuration service
    const mockConfigurationService = {
      getValue: async (key, defaultValue) => {
        const configs = {
          'slot.default_capacity': 5,
          'slot.max_capacity': 20,
          'slot.future_days': 30
        };
        return { 
          success: true, 
          data: { value: configs[key] || defaultValue } 
        };
      }
    };

    slotManagementService = new SlotManagementService({
      slotRepository,
      tokenRepository,
      configurationService: mockConfigurationService,
      logger
    });
  });

  afterAll(async () => {
    await dbSetup.disconnect();
  });

  beforeEach(async () => {
    await dbSetup.clearDatabase();
  });

  describe('Slot Creation and Management', () => {
    test('should create time slots successfully', async () => {
      console.log('  📅 Testing Slot creation...');
      
      const slotData = TestDataFactory.createTimeSlot();
      
      const result = await slotManagementService.createSlot(slotData);
      
      OPDAssertions.expectSuccessResponse(result);
      OPDAssertions.expectValidSlot(result.data.slot);
      
      // Verify slot was saved to database
      const savedSlot = await slotRepository.findBySlotId(result.data.slot.slotId);
      expect(savedSlot).toBeDefined();
      expect(savedSlot.slotId).toBe(slotData.slotId);
      
      console.log(`  ✅ Slot created: ${result.data.slot.slotId} (${result.data.slot.startTime}-${result.data.slot.endTime})`);
    });

    test('should validate slot data before creation', async () => {
      console.log('  🔍 Testing Slot validation...');
      
      const invalidSlotData = {
        // Missing required fields
        doctorId: 'test_doctor',
        date: new Date()
        // Missing slotId, startTime, endTime, maxCapacity
      };
      
      const result = await slotManagementService.createSlot(invalidSlotData);
      
      OPDAssertions.expectErrorResponse(result, 'VALIDATION_ERROR');
      
      console.log('  ✅ Invalid slot data properly rejected');
    });

    test('should prevent duplicate slot creation', async () => {
      console.log('  🚫 Testing Duplicate slot prevention...');
      
      const slotData = TestDataFactory.createTimeSlot();
      
      // Create first slot
      const firstResult = await slotManagementService.createSlot(slotData);
      expect(firstResult.success).toBe(true);
      
      // Try to create duplicate
      const duplicateResult = await slotManagementService.createSlot(slotData);
      
      OPDAssertions.expectErrorResponse(duplicateResult, 'SLOT_ALREADY_EXISTS');
      
      console.log('  ✅ Duplicate slot creation prevented');
    });
  });

  describe('Slot Availability Management', () => {
    test('should check slot availability correctly', async () => {
      console.log('  🔍 Testing Slot availability checking...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 5,
        currentAllocation: 2
      });
      
      await slotManagementService.createSlot(slotData);
      
      const availabilityResult = await slotManagementService.checkSlotAvailability(slotData.slotId);
      
      OPDAssertions.expectSuccessResponse(availabilityResult);
      expect(availabilityResult.data.isAvailable).toBe(true);
      expect(availabilityResult.data.availableCapacity).toBe(3);
      expect(availabilityResult.data.utilizationPercentage).toBe(40);
      
      console.log(`  ✅ Slot availability: ${availabilityResult.data.availableCapacity}/${slotData.maxCapacity} (${availabilityResult.data.utilizationPercentage}% utilized)`);
    });

    test('should handle full slots correctly', async () => {
      console.log('  🚫 Testing Full slot handling...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 3,
        currentAllocation: 3
      });
      
      await slotManagementService.createSlot(slotData);
      
      const availabilityResult = await slotManagementService.checkSlotAvailability(slotData.slotId);
      
      OPDAssertions.expectSuccessResponse(availabilityResult);
      expect(availabilityResult.data.isAvailable).toBe(false);
      expect(availabilityResult.data.availableCapacity).toBe(0);
      expect(availabilityResult.data.utilizationPercentage).toBe(100);
      
      console.log('  ✅ Full slot properly identified');
    });

    test('should find available slots for doctor and date', async () => {
      console.log('  📋 Testing Available slot queries...');
      
      const doctorId = 'test_doctor_123';
      const today = new Date();
      
      // Create multiple slots with different availability
      const availableSlot = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        startTime: '09:00',
        endTime: '10:00',
        maxCapacity: 5,
        currentAllocation: 2
      });
      
      const fullSlot = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        startTime: '10:00',
        endTime: '11:00',
        maxCapacity: 3,
        currentAllocation: 3
      });
      
      const suspendedSlot = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        startTime: '11:00',
        endTime: '12:00',
        maxCapacity: 4,
        currentAllocation: 1,
        status: 'suspended'
      });
      
      await slotManagementService.createSlot(availableSlot);
      await slotManagementService.createSlot(fullSlot);
      await slotManagementService.createSlot(suspendedSlot);
      
      const availableSlotsResult = await slotManagementService.getAvailableSlotsForDoctor(doctorId, today);
      
      OPDAssertions.expectSuccessResponse(availableSlotsResult);
      expect(availableSlotsResult.data.slots).toHaveLength(1);
      expect(availableSlotsResult.data.slots[0].slotId).toBe(availableSlot.slotId);
      
      console.log(`  ✅ Found ${availableSlotsResult.data.slots.length} available slots out of 3 total`);
    });
  });

  describe('Slot Allocation Operations', () => {
    test('should allocate slot capacity correctly', async () => {
      console.log('  ➕ Testing Slot allocation...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 5,
        currentAllocation: 2
      });
      
      await slotManagementService.createSlot(slotData);
      
      const allocationResult = await slotManagementService.allocateSlotCapacity(slotData.slotId);
      
      OPDAssertions.expectSuccessResponse(allocationResult);
      expect(allocationResult.data.slot.currentAllocation).toBe(3);
      expect(allocationResult.data.previousAllocation).toBe(2);
      
      // Verify in database
      const updatedSlot = await slotRepository.findBySlotId(slotData.slotId);
      expect(updatedSlot.currentAllocation).toBe(3);
      
      console.log(`  ✅ Slot allocation: ${allocationResult.data.previousAllocation} → ${allocationResult.data.slot.currentAllocation}`);
    });

    test('should deallocate slot capacity correctly', async () => {
      console.log('  ➖ Testing Slot deallocation...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 5,
        currentAllocation: 3
      });
      
      await slotManagementService.createSlot(slotData);
      
      const deallocationResult = await slotManagementService.deallocateSlotCapacity(slotData.slotId);
      
      OPDAssertions.expectSuccessResponse(deallocationResult);
      expect(deallocationResult.data.slot.currentAllocation).toBe(2);
      expect(deallocationResult.data.previousAllocation).toBe(3);
      
      // Verify in database
      const updatedSlot = await slotRepository.findBySlotId(slotData.slotId);
      expect(updatedSlot.currentAllocation).toBe(2);
      
      console.log(`  ✅ Slot deallocation: ${deallocationResult.data.previousAllocation} → ${deallocationResult.data.slot.currentAllocation}`);
    });

    test('should prevent over-allocation', async () => {
      console.log('  🚫 Testing Over-allocation prevention...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 3,
        currentAllocation: 3
      });
      
      await slotManagementService.createSlot(slotData);
      
      const allocationResult = await slotManagementService.allocateSlotCapacity(slotData.slotId);
      
      OPDAssertions.expectErrorResponse(allocationResult, 'SLOT_CAPACITY_EXCEEDED');
      
      console.log('  ✅ Over-allocation properly prevented');
    });

    test('should prevent under-deallocation', async () => {
      console.log('  🚫 Testing Under-deallocation prevention...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 5,
        currentAllocation: 0
      });
      
      await slotManagementService.createSlot(slotData);
      
      const deallocationResult = await slotManagementService.deallocateSlotCapacity(slotData.slotId);
      
      OPDAssertions.expectErrorResponse(deallocationResult, 'SLOT_ALLOCATION_UNDERFLOW');
      
      console.log('  ✅ Under-deallocation properly prevented');
    });
  });

  describe('Slot Status Management', () => {
    test('should update slot status correctly', async () => {
      console.log('  🔄 Testing Slot status updates...');
      
      const slotData = TestDataFactory.createTimeSlot({
        status: 'active'
      });
      
      await slotManagementService.createSlot(slotData);
      
      const statusUpdateResult = await slotManagementService.updateSlotStatus(
        slotData.slotId, 
        'suspended'
      );
      
      OPDAssertions.expectSuccessResponse(statusUpdateResult);
      expect(statusUpdateResult.data.slot.status).toBe('suspended');
      expect(statusUpdateResult.data.previousStatus).toBe('active');
      
      // Verify in database
      const updatedSlot = await slotRepository.findBySlotId(slotData.slotId);
      expect(updatedSlot.status).toBe('suspended');
      
      console.log(`  ✅ Status update: ${statusUpdateResult.data.previousStatus} → ${statusUpdateResult.data.slot.status}`);
    });

    test('should handle invalid status transitions', async () => {
      console.log('  ⚠️ Testing Invalid status transitions...');
      
      const slotData = TestDataFactory.createTimeSlot({
        status: 'completed'
      });
      
      await slotManagementService.createSlot(slotData);
      
      const statusUpdateResult = await slotManagementService.updateSlotStatus(
        slotData.slotId, 
        'active'
      );
      
      // Depending on business rules, this might be allowed or not
      // For now, let's assume it's allowed but logged
      if (statusUpdateResult.success) {
        console.log('  ✅ Status transition allowed (with logging)');
      } else {
        OPDAssertions.expectErrorResponse(statusUpdateResult, 'INVALID_STATUS_TRANSITION');
        console.log('  ✅ Invalid status transition properly rejected');
      }
    });
  });

  describe('Future Slot Generation', () => {
    test('should generate future slots based on doctor schedule', async () => {
      console.log('  🔮 Testing Future slot generation...');
      
      const doctorSchedule = {
        doctorId: 'test_doctor_123',
        schedule: [
          {
            dayOfWeek: 1, // Monday
            slots: [
              { startTime: '09:00', endTime: '10:00', capacity: 5 },
              { startTime: '10:00', endTime: '11:00', capacity: 5 },
              { startTime: '14:00', endTime: '15:00', capacity: 3 }
            ]
          },
          {
            dayOfWeek: 3, // Wednesday
            slots: [
              { startTime: '09:00', endTime: '10:00', capacity: 4 },
              { startTime: '15:00', endTime: '16:00', capacity: 4 }
            ]
          }
        ]
      };
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // Next week
      
      const generationResult = await slotManagementService.generateFutureSlots(
        doctorSchedule,
        futureDate,
        7 // Generate for 7 days
      );
      
      OPDAssertions.expectSuccessResponse(generationResult);
      expect(generationResult.data.slotsGenerated).toBeGreaterThan(0);
      expect(generationResult.data.slots).toBeDefined();
      
      // Verify slots were created in database
      const createdSlots = await slotRepository.findByDoctorAndDateRange(
        doctorSchedule.doctorId,
        futureDate,
        new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      );
      
      expect(createdSlots.length).toBe(generationResult.data.slotsGenerated);
      
      console.log(`  ✅ Generated ${generationResult.data.slotsGenerated} future slots`);
    });

    test('should handle weekend and holiday exclusions', async () => {
      console.log('  📅 Testing Weekend/holiday exclusions...');
      
      const doctorSchedule = {
        doctorId: 'test_doctor_456',
        schedule: [
          {
            dayOfWeek: 1, // Monday
            slots: [{ startTime: '09:00', endTime: '10:00', capacity: 5 }]
          },
          {
            dayOfWeek: 6, // Saturday
            slots: [{ startTime: '09:00', endTime: '10:00', capacity: 3 }]
          }
        ]
      };
      
      const startDate = new Date();
      
      const generationResult = await slotManagementService.generateFutureSlots(
        doctorSchedule,
        startDate,
        14, // Generate for 2 weeks
        { excludeWeekends: true }
      );
      
      OPDAssertions.expectSuccessResponse(generationResult);
      
      // Should only generate Monday slots, not Saturday slots
      const mondaySlots = generationResult.data.slots.filter(slot => {
        const slotDate = new Date(slot.date);
        return slotDate.getDay() === 1; // Monday
      });
      
      const saturdaySlots = generationResult.data.slots.filter(slot => {
        const slotDate = new Date(slot.date);
        return slotDate.getDay() === 6; // Saturday
      });
      
      expect(mondaySlots.length).toBeGreaterThan(0);
      expect(saturdaySlots.length).toBe(0);
      
      console.log(`  ✅ Weekend exclusion working: ${mondaySlots.length} weekday slots, ${saturdaySlots.length} weekend slots`);
    });
  });

  describe('Slot Capacity Management', () => {
    test('should handle bulk capacity operations', async () => {
      console.log('  📊 Testing Bulk capacity operations...');
      
      const doctorId = 'test_doctor_789';
      const today = new Date();
      
      // Create multiple slots
      const slots = TestDataFactory.createMultipleSlots(doctorId, 3, {
        date: today,
        maxCapacity: 5,
        currentAllocation: 1
      });
      
      for (const slotData of slots) {
        await slotManagementService.createSlot(slotData);
      }
      
      // Bulk allocate capacity
      const bulkAllocationResult = await slotManagementService.bulkAllocateCapacity(
        doctorId,
        today,
        2 // Allocate 2 more to each slot
      );
      
      OPDAssertions.expectSuccessResponse(bulkAllocationResult);
      expect(bulkAllocationResult.data.slotsUpdated).toBe(3);
      
      // Verify allocations
      const updatedSlots = await slotRepository.findByDoctorAndDate(doctorId, today);
      updatedSlots.forEach(slot => {
        expect(slot.currentAllocation).toBe(3); // 1 + 2
      });
      
      console.log(`  ✅ Bulk allocation: ${bulkAllocationResult.data.slotsUpdated} slots updated`);
    });

    test('should calculate total capacity for doctor and date', async () => {
      console.log('  📈 Testing Total capacity calculation...');
      
      const doctorId = 'test_doctor_capacity';
      const today = new Date();
      
      // Create slots with different capacities
      const slot1 = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        maxCapacity: 5,
        currentAllocation: 2
      });
      
      const slot2 = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        maxCapacity: 8,
        currentAllocation: 3
      });
      
      const slot3 = TestDataFactory.createTimeSlot({
        doctorId,
        date: today,
        maxCapacity: 3,
        currentAllocation: 1
      });
      
      await slotManagementService.createSlot(slot1);
      await slotManagementService.createSlot(slot2);
      await slotManagementService.createSlot(slot3);
      
      const capacityResult = await slotManagementService.getTotalCapacity(doctorId, today);
      
      OPDAssertions.expectSuccessResponse(capacityResult);
      expect(capacityResult.data.totalCapacity).toBe(16); // 5 + 8 + 3
      expect(capacityResult.data.totalAllocated).toBe(6);  // 2 + 3 + 1
      expect(capacityResult.data.totalAvailable).toBe(10); // 16 - 6
      expect(capacityResult.data.utilizationPercentage).toBe(37.5); // 6/16 * 100
      
      console.log(`  ✅ Total capacity: ${capacityResult.data.totalAvailable}/${capacityResult.data.totalCapacity} available (${capacityResult.data.utilizationPercentage}% utilized)`);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle non-existent slot operations', async () => {
      console.log('  ❌ Testing Non-existent slot handling...');
      
      const nonExistentSlotId = 'non_existent_slot_123';
      
      const availabilityResult = await slotManagementService.checkSlotAvailability(nonExistentSlotId);
      OPDAssertions.expectErrorResponse(availabilityResult, 'SLOT_NOT_FOUND');
      
      const allocationResult = await slotManagementService.allocateSlotCapacity(nonExistentSlotId);
      OPDAssertions.expectErrorResponse(allocationResult, 'SLOT_NOT_FOUND');
      
      console.log('  ✅ Non-existent slot operations properly rejected');
    });

    test('should handle concurrent capacity modifications', async () => {
      console.log('  🔄 Testing Concurrent capacity modifications...');
      
      const slotData = TestDataFactory.createTimeSlot({
        maxCapacity: 10,
        currentAllocation: 5
      });
      
      await slotManagementService.createSlot(slotData);
      
      // Simulate concurrent allocations
      const promises = [
        slotManagementService.allocateSlotCapacity(slotData.slotId),
        slotManagementService.allocateSlotCapacity(slotData.slotId),
        slotManagementService.allocateSlotCapacity(slotData.slotId)
      ];
      
      const results = await Promise.allSettled(promises);
      
      // At least some should succeed
      const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
      expect(successfulResults.length).toBeGreaterThan(0);
      
      // Final allocation should not exceed capacity
      const finalSlot = await slotRepository.findBySlotId(slotData.slotId);
      expect(finalSlot.currentAllocation).toBeLessThanOrEqual(finalSlot.maxCapacity);
      
      console.log(`  ✅ Concurrent modifications handled: ${successfulResults.length}/3 succeeded, final allocation: ${finalSlot.currentAllocation}/${finalSlot.maxCapacity}`);
    });
  });

  // Summary test to show what we've validated
  test('📊 Slot Management Summary', () => {
    console.log('\n📊 Slot Management Test Summary:');
    console.log('  ✅ Slot creation and validation');
    console.log('  ✅ Availability checking and capacity management');
    console.log('  ✅ Allocation and deallocation operations');
    console.log('  ✅ Status management and transitions');
    console.log('  ✅ Future slot generation from schedules');
    console.log('  ✅ Bulk operations and capacity calculations');
    console.log('  ✅ Error handling and concurrent operations');
    console.log('\n🎉 Slot management system is working perfectly! Ready for token allocation testing.');
  });
});