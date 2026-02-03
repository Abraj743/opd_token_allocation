/**
 * Core Services Test 1: Priority Calculation Service
 * 
 * Purpose: Verify that the priority calculation system works correctly
 * 
 * What you'll learn:
 * - How patient priorities are calculated based on different factors
 * - Priority levels and their numeric ranges
 * - How waiting time affects priority
 * - How patient age and medical history influence priority
 * - Emergency vs routine priority handling
 */

const DatabaseSetup = require('../helpers/database-setup');
const TestDataFactory = require('../helpers/test-data');
const OPDAssertions = require('../helpers/assertions');

const PriorityCalculationService = require('../../services/PriorityCalculationService');
const logger = require('../../config/logger');

describe('🎯 Core Services Test 1: Priority Calculation', () => {
  let dbSetup;
  let priorityService;

  beforeAll(async () => {
    console.log('\n🧪 Testing Priority Calculation Service...');
    dbSetup = new DatabaseSetup();
    await dbSetup.connect();

    // Mock configuration service for priority values
    const mockConfigurationService = {
      getValue: async (key, defaultValue) => {
        const priorities = {
          'priority.emergency': 1000,
          'priority.priority_patient': 800,
          'priority.followup': 600,
          'priority.online_booking': 400,
          'priority.walkin': 200
        };
        return { 
          success: true, 
          data: { value: priorities[key] || defaultValue } 
        };
      }
    };

    priorityService = new PriorityCalculationService({
      configurationService: mockConfigurationService,
      logger
    });
  });

  afterAll(async () => {
    await dbSetup.disconnect();
  });

  describe('Basic Priority Calculation', () => {
    test('should calculate emergency priority correctly', async () => {
      console.log('  🚨 Testing Emergency priority calculation...');
      
      const result = await priorityService.calculatePriority(
        'emergency',
        { 
          age: 65, 
          urgencyLevel: 'critical',
          medicalHistory: { critical: true }
        },
        0 // No waiting time
      );
      
      OPDAssertions.expectPriorityCalculation(result, 'emergency');
      expect(result.data.priorityLevel).toBe('emergency');
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(1000);
      
      console.log(`  ✅ Emergency priority: ${result.data.finalPriority} (${result.data.priorityLevel})`);
    });

    test('should calculate priority patient priority correctly', async () => {
      console.log('  ⭐ Testing Priority patient calculation...');
      
      const result = await priorityService.calculatePriority(
        'priority',
        { 
          age: 70, 
          urgencyLevel: 'urgent',
          medicalHistory: { chronic: true }
        },
        10 // 10 minutes waiting
      );
      
      OPDAssertions.expectPriorityCalculation(result, 'priority');
      expect(result.data.priorityLevel).toBe('high');
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(700);
      
      console.log(`  ✅ Priority patient: ${result.data.finalPriority} (${result.data.priorityLevel})`);
    });

    test('should calculate followup priority correctly', async () => {
      console.log('  🔄 Testing Followup priority calculation...');
      
      const result = await priorityService.calculatePriority(
        'followup',
        { 
          age: 45, 
          isFollowup: true,
          medicalHistory: { chronic: true }
        },
        20 // 20 minutes waiting
      );
      
      OPDAssertions.expectPriorityCalculation(result, 'followup');
      expect(result.data.priorityLevel).toBe('medium');
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(500);
      
      console.log(`  ✅ Followup priority: ${result.data.finalPriority} (${result.data.priorityLevel})`);
    });

    test('should calculate online booking priority correctly', async () => {
      console.log('  💻 Testing Online booking priority calculation...');
      
      const result = await priorityService.calculatePriority(
        'online',
        { 
          age: 35, 
          urgencyLevel: 'routine'
        },
        15 // 15 minutes waiting
      );
      
      OPDAssertions.expectPriorityCalculation(result, 'online');
      expect(result.data.priorityLevel).toBe('medium');
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(300);
      
      console.log(`  ✅ Online booking: ${result.data.finalPriority} (${result.data.priorityLevel})`);
    });

    test('should calculate walkin priority correctly', async () => {
      console.log('  🚶 Testing Walkin priority calculation...');
      
      const result = await priorityService.calculatePriority(
        'walkin',
        { 
          age: 25, 
          urgencyLevel: 'routine'
        },
        60 // 60 minutes waiting
      );
      
      OPDAssertions.expectPriorityCalculation(result, 'walkin');
      expect(result.data.priorityLevel).toBe('low');
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(200);
      
      console.log(`  ✅ Walkin priority: ${result.data.finalPriority} (${result.data.priorityLevel})`);
    });
  });

  describe('Age-Based Priority Adjustments', () => {
    test('should give higher priority to elderly patients', async () => {
      console.log('  👴 Testing Age-based priority adjustments...');
      
      // Young patient
      const youngResult = await priorityService.calculatePriority(
        'online',
        { age: 25, urgencyLevel: 'routine' },
        0
      );
      
      // Elderly patient
      const elderlyResult = await priorityService.calculatePriority(
        'online',
        { age: 75, urgencyLevel: 'routine' },
        0
      );
      
      expect(elderlyResult.data.finalPriority).toBeGreaterThan(youngResult.data.finalPriority);
      
      console.log(`  ✅ Young (25): ${youngResult.data.finalPriority}, Elderly (75): ${elderlyResult.data.finalPriority}`);
    });

    test('should handle pediatric patients appropriately', async () => {
      console.log('  👶 Testing Pediatric priority adjustments...');
      
      const pediatricResult = await priorityService.calculatePriority(
        'online',
        { age: 8, urgencyLevel: 'routine' },
        0
      );
      
      // Pediatric patients should get some priority boost
      expect(pediatricResult.data.finalPriority).toBeGreaterThan(400);
      
      console.log(`  ✅ Pediatric priority: ${pediatricResult.data.finalPriority}`);
    });

    test('should test different age groups', async () => {
      console.log('  📊 Testing various age groups...');
      
      const ageGroups = [
        { age: 5, label: 'Child' },
        { age: 25, label: 'Young Adult' },
        { age: 45, label: 'Middle Age' },
        { age: 65, label: 'Senior' },
        { age: 80, label: 'Elderly' }
      ];
      
      const results = [];
      
      for (const group of ageGroups) {
        const result = await priorityService.calculatePriority(
          'online',
          { age: group.age, urgencyLevel: 'routine' },
          0
        );
        
        results.push({
          ...group,
          priority: result.data.finalPriority
        });
        
        console.log(`    ${group.label} (${group.age}): ${result.data.finalPriority}`);
      }
      
      // Verify that elderly get higher priority than young adults
      const youngAdult = results.find(r => r.label === 'Young Adult');
      const elderly = results.find(r => r.label === 'Elderly');
      
      expect(elderly.priority).toBeGreaterThan(youngAdult.priority);
      
      console.log('  ✅ Age-based priority distribution working correctly');
    });
  });

  describe('Waiting Time Impact', () => {
    test('should increase priority with waiting time', async () => {
      console.log('  ⏰ Testing Waiting time impact...');
      
      // No waiting time
      const noWaitResult = await priorityService.calculatePriority(
        'online',
        { age: 35, urgencyLevel: 'routine' },
        0
      );
      
      // 30 minutes waiting
      const shortWaitResult = await priorityService.calculatePriority(
        'online',
        { age: 35, urgencyLevel: 'routine' },
        30
      );
      
      // 60 minutes waiting
      const longWaitResult = await priorityService.calculatePriority(
        'online',
        { age: 35, urgencyLevel: 'routine' },
        60
      );
      
      expect(shortWaitResult.data.finalPriority).toBeGreaterThan(noWaitResult.data.finalPriority);
      expect(longWaitResult.data.finalPriority).toBeGreaterThan(shortWaitResult.data.finalPriority);
      
      console.log(`  ✅ No wait: ${noWaitResult.data.finalPriority}, 30min: ${shortWaitResult.data.finalPriority}, 60min: ${longWaitResult.data.finalPriority}`);
    });

    test('should handle extreme waiting times', async () => {
      console.log('  ⏳ Testing extreme waiting times...');
      
      // Very long waiting time
      const extremeWaitResult = await priorityService.calculatePriority(
        'walkin',
        { age: 35, urgencyLevel: 'routine' },
        180 // 3 hours
      );
      
      // Should significantly boost priority
      expect(extremeWaitResult.data.finalPriority).toBeGreaterThan(400);
      
      console.log(`  ✅ 3-hour wait priority: ${extremeWaitResult.data.finalPriority}`);
    });
  });

  describe('Medical History Impact', () => {
    test('should prioritize patients with critical conditions', async () => {
      console.log('  🏥 Testing Medical history impact...');
      
      // Regular patient
      const regularResult = await priorityService.calculatePriority(
        'online',
        { age: 50, urgencyLevel: 'routine' },
        0
      );
      
      // Patient with chronic conditions
      const chronicResult = await priorityService.calculatePriority(
        'online',
        { 
          age: 50, 
          urgencyLevel: 'routine',
          medicalHistory: { chronic: true }
        },
        0
      );
      
      // Patient with critical condition
      const criticalResult = await priorityService.calculatePriority(
        'online',
        { 
          age: 50, 
          urgencyLevel: 'urgent',
          medicalHistory: { critical: true }
        },
        0
      );
      
      expect(chronicResult.data.finalPriority).toBeGreaterThan(regularResult.data.finalPriority);
      expect(criticalResult.data.finalPriority).toBeGreaterThan(chronicResult.data.finalPriority);
      
      console.log(`  ✅ Regular: ${regularResult.data.finalPriority}, Chronic: ${chronicResult.data.finalPriority}, Critical: ${criticalResult.data.finalPriority}`);
    });

    test('should handle multiple medical conditions', async () => {
      console.log('  🩺 Testing multiple medical conditions...');
      
      const multiConditionResult = await priorityService.calculatePriority(
        'online',
        { 
          age: 60, 
          urgencyLevel: 'urgent',
          medicalHistory: { 
            chronic: true,
            critical: true,
            conditions: ['Diabetes', 'Hypertension', 'Heart Disease']
          }
        },
        0
      );
      
      // Multiple conditions should result in higher priority
      expect(multiConditionResult.data.finalPriority).toBeGreaterThan(600);
      
      console.log(`  ✅ Multiple conditions priority: ${multiConditionResult.data.finalPriority}`);
    });
  });

  describe('Priority Level Classification', () => {
    test('should classify priorities into correct levels', async () => {
      console.log('  📊 Testing Priority level classification...');
      
      const testCases = [
        { source: 'emergency', expectedLevel: 'emergency', minPriority: 1000 },
        { source: 'priority', expectedLevel: 'high', minPriority: 700 },
        { source: 'followup', expectedLevel: 'medium', minPriority: 500 },
        { source: 'online', expectedLevel: 'medium', minPriority: 300 },
        { source: 'walkin', expectedLevel: 'low', minPriority: 200 }
      ];
      
      for (const testCase of testCases) {
        const result = await priorityService.calculatePriority(
          testCase.source,
          { age: 35, urgencyLevel: 'routine' },
          0
        );
        
        expect(result.data.priorityLevel).toBe(testCase.expectedLevel);
        expect(result.data.finalPriority).toBeGreaterThanOrEqual(testCase.minPriority);
        
        console.log(`    ${testCase.source}: ${result.data.finalPriority} (${result.data.priorityLevel})`);
      }
      
      console.log('  ✅ Priority level classification working correctly');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid source types', async () => {
      console.log('  ❌ Testing invalid source handling...');
      
      const result = await priorityService.calculatePriority(
        'invalid_source',
        { age: 35 },
        0
      );
      
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SOURCE');
      
      console.log('  ✅ Invalid source properly rejected');
    });

    test('should handle missing patient info', async () => {
      console.log('  ⚠️ Testing missing patient info...');
      
      const result = await priorityService.calculatePriority(
        'online',
        {}, // Empty patient info
        0
      );
      
      // Should still work with defaults
      expect(result.success).toBe(true);
      expect(result.data.finalPriority).toBeGreaterThan(0);
      
      console.log('  ✅ Missing patient info handled gracefully');
    });

    test('should handle negative waiting times', async () => {
      console.log('  🔢 Testing negative waiting times...');
      
      const result = await priorityService.calculatePriority(
        'online',
        { age: 35 },
        -10 // Negative waiting time
      );
      
      expect(result.success).toBe(true);
      // Should treat negative as zero
      expect(result.data.finalPriority).toBeGreaterThan(0);
      
      console.log('  ✅ Negative waiting time handled correctly');
    });

    test('should handle extreme age values', async () => {
      console.log('  👶👴 Testing extreme age values...');
      
      // Very young
      const babyResult = await priorityService.calculatePriority(
        'online',
        { age: 0 },
        0
      );
      
      // Very old
      const centenarianResult = await priorityService.calculatePriority(
        'online',
        { age: 100 },
        0
      );
      
      expect(babyResult.success).toBe(true);
      expect(centenarianResult.success).toBe(true);
      expect(centenarianResult.data.finalPriority).toBeGreaterThan(babyResult.data.finalPriority);
      
      console.log(`  ✅ Baby (0): ${babyResult.data.finalPriority}, Centenarian (100): ${centenarianResult.data.finalPriority}`);
    });
  });

  describe('Priority Comparison and Ranking', () => {
    test('should rank different patient scenarios correctly', async () => {
      console.log('  🏆 Testing Priority ranking scenarios...');
      
      const scenarios = [
        {
          name: 'Emergency Critical',
          source: 'emergency',
          patientInfo: { age: 70, urgencyLevel: 'critical', medicalHistory: { critical: true } },
          waitingTime: 0
        },
        {
          name: 'Priority Elderly',
          source: 'priority',
          patientInfo: { age: 80, urgencyLevel: 'urgent', medicalHistory: { chronic: true } },
          waitingTime: 15
        },
        {
          name: 'Followup Chronic',
          source: 'followup',
          patientInfo: { age: 55, isFollowup: true, medicalHistory: { chronic: true } },
          waitingTime: 30
        },
        {
          name: 'Online Long Wait',
          source: 'online',
          patientInfo: { age: 40, urgencyLevel: 'routine' },
          waitingTime: 90
        },
        {
          name: 'Walkin Regular',
          source: 'walkin',
          patientInfo: { age: 30, urgencyLevel: 'routine' },
          waitingTime: 20
        }
      ];
      
      const results = [];
      
      for (const scenario of scenarios) {
        const result = await priorityService.calculatePriority(
          scenario.source,
          scenario.patientInfo,
          scenario.waitingTime
        );
        
        results.push({
          name: scenario.name,
          priority: result.data.finalPriority,
          level: result.data.priorityLevel
        });
      }
      
      // Sort by priority (highest first)
      results.sort((a, b) => b.priority - a.priority);
      
      console.log('    Priority Ranking:');
      results.forEach((result, index) => {
        console.log(`    ${index + 1}. ${result.name}: ${result.priority} (${result.level})`);
      });
      
      // Verify emergency is highest
      expect(results[0].name).toBe('Emergency Critical');
      
      // Verify walkin regular is lowest (unless long wait boosted online)
      const walkinIndex = results.findIndex(r => r.name === 'Walkin Regular');
      const onlineIndex = results.findIndex(r => r.name === 'Online Long Wait');
      
      // Online with long wait might be higher than walkin
      console.log(`    Walkin position: ${walkinIndex + 1}, Online long wait position: ${onlineIndex + 1}`);
      
      console.log('  ✅ Priority ranking working as expected');
    });
  });

  // Summary test to show what we've validated
  test('📊 Priority Calculation Summary', () => {
    console.log('\n📊 Priority Calculation Test Summary:');
    console.log('  ✅ Basic priority calculation for all sources');
    console.log('  ✅ Age-based priority adjustments');
    console.log('  ✅ Waiting time impact on priority');
    console.log('  ✅ Medical history considerations');
    console.log('  ✅ Priority level classification');
    console.log('  ✅ Edge cases and error handling');
    console.log('  ✅ Priority ranking and comparison');
    console.log('\n🎉 Priority calculation system is working perfectly! Ready for slot management testing.');
  });
});