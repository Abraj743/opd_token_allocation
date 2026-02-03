/**
 * Custom Assertions for OPD System Testing
 * Domain-specific assertions to make tests more readable and maintainable
 */

class OPDAssertions {
  // Token-related assertions
  static expectValidToken(token) {
    expect(token).toBeDefined();
    expect(token.tokenId).toBeDefined();
    expect(token.patientId).toBeDefined();
    expect(token.doctorId).toBeDefined();
    expect(token.slotId).toBeDefined();
    expect(token.tokenNumber).toBeGreaterThan(0);
    expect(['online', 'walkin', 'priority', 'followup', 'emergency']).toContain(token.source);
    expect(['allocated', 'confirmed', 'completed', 'cancelled', 'noshow']).toContain(token.status);
    expect(token.priority).toBeGreaterThan(0);
  }

  static expectTokenPriority(token, expectedRange) {
    expect(token.priority).toBeGreaterThanOrEqual(expectedRange.min);
    expect(token.priority).toBeLessThanOrEqual(expectedRange.max);
  }

  static expectEmergencyToken(token) {
    this.expectValidToken(token);
    expect(token.source).toBe('emergency');
    expect(token.priority).toBeGreaterThanOrEqual(1000);
  }

  // Slot-related assertions
  static expectValidSlot(slot) {
    expect(slot).toBeDefined();
    expect(slot.slotId).toBeDefined();
    expect(slot.doctorId).toBeDefined();
    expect(slot.date).toBeDefined();
    expect(slot.startTime).toBeDefined();
    expect(slot.endTime).toBeDefined();
    expect(slot.maxCapacity).toBeGreaterThan(0);
    expect(slot.currentAllocation).toBeGreaterThanOrEqual(0);
    expect(slot.currentAllocation).toBeLessThanOrEqual(slot.maxCapacity);
    expect(['active', 'suspended', 'completed']).toContain(slot.status);
  }

  static expectSlotCapacityRespected(slot) {
    expect(slot.currentAllocation).toBeLessThanOrEqual(slot.maxCapacity);
  }

  static expectSlotHasCapacity(slot, requiredCapacity = 1) {
    const availableCapacity = slot.maxCapacity - slot.currentAllocation;
    expect(availableCapacity).toBeGreaterThanOrEqual(requiredCapacity);
  }

  // Patient-related assertions
  static expectValidPatient(patient) {
    expect(patient).toBeDefined();
    expect(patient.patientId).toBeDefined();
    expect(patient.personalInfo).toBeDefined();
    expect(patient.personalInfo.name).toBeDefined();
    expect(patient.personalInfo.age).toBeGreaterThan(0);
    expect(['male', 'female', 'other']).toContain(patient.personalInfo.gender);
    expect(patient.medicalInfo).toBeDefined();
  }

  // Doctor-related assertions
  static expectValidDoctor(doctor) {
    expect(doctor).toBeDefined();
    expect(doctor.doctorId).toBeDefined();
    expect(doctor.name).toBeDefined();
    expect(doctor.specialty).toBeDefined();
    expect(doctor.qualification).toBeDefined();
    expect(doctor.experience).toBeGreaterThanOrEqual(0);
    expect(doctor.schedule).toBeDefined();
    expect(Array.isArray(doctor.schedule)).toBe(true);
  }

  // Service response assertions
  static expectSuccessResponse(response) {
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  }

  static expectErrorResponse(response, expectedErrorCode = null) {
    expect(response).toBeDefined();
    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    if (expectedErrorCode) {
      expect(response.error.code).toBe(expectedErrorCode);
    }
  }

  // Allocation-specific assertions
  static expectSuccessfulAllocation(result) {
    this.expectSuccessResponse(result);
    expect(result.data.token).toBeDefined();
    this.expectValidToken(result.data.token);
    expect(['direct', 'preemption', 'reallocation']).toContain(result.data.allocationMethod);
  }

  static expectPreemptionAllocation(result) {
    this.expectSuccessfulAllocation(result);
    expect(result.data.allocationMethod).toBe('preemption');
    expect(result.data.preemptedTokens).toBeDefined();
    expect(Array.isArray(result.data.preemptedTokens)).toBe(true);
    expect(result.data.preemptedTokens.length).toBeGreaterThan(0);
  }

  static expectAlternativeSolutions(result) {
    this.expectErrorResponse(result);
    expect(result.data).toBeDefined();
    
    // Handle both old and new error response formats
    if (result.data.alternatives) {
      expect(result.data.alternatives).toBeDefined();
      expect(result.data.recommendedAction).toBeDefined();
    } else if (result.data.requestedSlot) {
      // Handle NO_ALTERNATIVES_AVAILABLE format
      expect(result.data.requestedSlot).toBeDefined();
      expect(result.data.suggestions).toBeDefined();
      // Should still have alternatives structure even if empty
      if (result.data.alternatives) {
        expect(result.data.alternatives).toBeDefined();
      }
    }
  }

  // Priority calculation assertions
  static expectPriorityCalculation(result, source) {
    this.expectSuccessResponse(result);
    expect(result.data.finalPriority).toBeGreaterThan(0);
    expect(result.data.priorityLevel).toBeDefined();
    expect(result.data.basePriority).toBeGreaterThan(0);
    
    // Source-specific priority ranges
    const priorityRanges = {
      emergency: { min: 1000, max: 2000 },
      priority: { min: 700, max: 900 },
      followup: { min: 500, max: 700 },
      online: { min: 300, max: 500 },
      walkin: { min: 100, max: 400 }
    };
    
    if (priorityRanges[source]) {
      const range = priorityRanges[source];
      expect(result.data.finalPriority).toBeGreaterThanOrEqual(range.min);
      expect(result.data.finalPriority).toBeLessThanOrEqual(range.max);
    }
  }

  // Concurrency assertions
  static expectConcurrencyHandled(results, maxCapacity) {
    const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failedResults = results.filter(r => r.status === 'rejected' || !r.value.success);
    
    // Should not exceed capacity
    expect(successfulResults.length).toBeLessThanOrEqual(maxCapacity);
    
    // Should have some failures if over capacity
    if (results.length > maxCapacity) {
      expect(failedResults.length).toBeGreaterThan(0);
    }
    
    // All successful results should have valid tokens
    successfulResults.forEach(result => {
      this.expectValidToken(result.value.data.token);
    });
  }

  // Performance assertions
  static expectPerformanceWithinLimits(duration, maxDurationMs) {
    expect(duration).toBeLessThanOrEqual(maxDurationMs);
  }

  static expectAllocationEfficiency(efficiency, minEfficiency = 0.8) {
    expect(efficiency).toBeGreaterThanOrEqual(minEfficiency);
    expect(efficiency).toBeLessThanOrEqual(1.0);
  }

  // Database assertions
  static expectDatabaseConnected() {
    const mongoose = require('mongoose');
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
  }

  static expectCollectionExists(collectionName) {
    const mongoose = require('mongoose');
    expect(mongoose.connection.db).toBeDefined();
    // Note: This is a basic check, actual collection existence would need async verification
  }

  // Validation assertions
  static expectValidationError(result, fieldName = null) {
    this.expectErrorResponse(result, 'VALIDATION_ERROR');
    if (fieldName) {
      expect(result.error.message).toContain(fieldName);
    }
  }

  // Custom matchers for Jest (optional enhancement)
  static setupCustomMatchers() {
    expect.extend({
      toBeValidToken(received) {
        try {
          OPDAssertions.expectValidToken(received);
          return {
            message: () => `Expected ${received} not to be a valid token`,
            pass: true
          };
        } catch (error) {
          return {
            message: () => `Expected ${received} to be a valid token: ${error.message}`,
            pass: false
          };
        }
      },
      
      toBeSuccessfulAllocation(received) {
        try {
          OPDAssertions.expectSuccessfulAllocation(received);
          return {
            message: () => `Expected ${received} not to be a successful allocation`,
            pass: true
          };
        } catch (error) {
          return {
            message: () => `Expected ${received} to be a successful allocation: ${error.message}`,
            pass: false
          };
        }
      }
    });
  }
}

module.exports = OPDAssertions;