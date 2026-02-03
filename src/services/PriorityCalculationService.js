const BaseService = require('./BaseService');


class PriorityCalculationService extends BaseService {
  constructor({ configurationService, logger }) {
    super({ logger });
    this.configurationService = configurationService;
    this.priorityCache = new Map();
  }

  
  async calculatePriority(tokenSource, patientInfo = {}, waitingTime = 0) {
    return this.executeOperation('calculatePriority', async () => {
      this.validateRequired({ tokenSource }, ['tokenSource']);
      
      const validSources = ['online', 'walkin', 'priority', 'followup', 'emergency'];
      if (!validSources.includes(tokenSource)) {
        return this.createErrorResponse(
          'INVALID_SOURCE',
          `Invalid token source: ${tokenSource}. Must be one of: ${validSources.join(', ')}`,
          { tokenSource, validSources },
          ['Use a valid token source']
        );
      }
      
      const basePriority = await this.getBasePriority(tokenSource);
      
      const adjustments = this.calculateDynamicAdjustments(patientInfo, waitingTime);
      
      const finalPriority = basePriority + adjustments.total;
      
      const result = {
        tokenSource,
        basePriority,
        adjustments: adjustments.breakdown,
        totalAdjustment: adjustments.total,
        finalPriority,
        priorityLevel: this.getPriorityLevel(finalPriority)
      };

      return this.createSuccessResponse(
        result,
        'Priority calculated successfully'
      );
    }, { tokenSource, waitingTime });
  }

  
  async shouldPreempt(newToken, existingToken) {
    return this.executeOperation('shouldPreempt', async () => {
      this.validateRequired({ newToken, existingToken }, ['newToken', 'existingToken']);
      
      
      const newPriorityResult = await this.calculatePriority(
        newToken.source,
        newToken.patientInfo,
        newToken.waitingTime
      );
      
      const existingPriorityResult = await this.calculatePriority(
        existingToken.source,
        existingToken.patientInfo,
        existingToken.waitingTime
      );

      const newPriority = newPriorityResult.data.finalPriority;
      const existingPriority = existingPriorityResult.data.finalPriority;
      
      const shouldPreempt = newPriority > existingPriority;
      const priorityDifference = newPriority - existingPriority;
      
      let reason = '';
      if (shouldPreempt) {
        reason = `New token has higher priority (${newPriority} vs ${existingPriority})`;
      } else if (newPriority === existingPriority) {
        reason = 'Equal priority - first-come-first-served applies';
      } else {
        reason = `Existing token has higher priority (${existingPriority} vs ${newPriority})`;
      }

      const result = {
        shouldPreempt,
        newTokenPriority: newPriority,
        existingTokenPriority: existingPriority,
        priorityDifference,
        reason,
        newTokenDetails: newPriorityResult.data,
        existingTokenDetails: existingPriorityResult.data
      };

      return this.createSuccessResponse(
        result,
        'Preemption decision calculated successfully'
      );
    }, { 
      newTokenSource: newToken?.source, 
      existingTokenSource: existingToken?.source 
    });
  }

  async getBasePriority(tokenSource) {
    const cacheKey = `priority.${tokenSource}`;
    
    if (this.priorityCache.has(cacheKey)) {
      return this.priorityCache.get(cacheKey);
    }

    const defaultPriorities = {
      emergency: 1000,
      priority: 800,
      followup: 600,
      online: 400,
      walkin: 200
    };

    let priority = defaultPriorities[tokenSource] || 0;

    try {
      if (this.configurationService) {
        const configResult = await this.configurationService.getValue(cacheKey, priority);
        if (configResult.success) {
          priority = configResult.data.value;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to get priority config for ${tokenSource}, using default:`, error.message);
    }
    
    this.priorityCache.set(cacheKey, priority);
    setTimeout(() => this.priorityCache.delete(cacheKey), 5 * 60 * 1000);
    
    return priority;
  }

  
  calculateDynamicAdjustments(patientInfo, waitingTime) {
    const adjustments = {
      breakdown: {},
      total: 0
    };

    const effectiveWaitingTime = Math.max(0, waitingTime);

    if (effectiveWaitingTime > 0) {
      let waitingAdjustment;
      if (effectiveWaitingTime >= 180) { // 3+ hours
        waitingAdjustment = 250; // Significant boost for extreme waits
      } else if (effectiveWaitingTime >= 120) { // 2+ hours
        waitingAdjustment = 150;
      } else if (effectiveWaitingTime >= 60) { // 1+ hour
        waitingAdjustment = 100;
      } else {
        waitingAdjustment = Math.min(effectiveWaitingTime * 0.8, 40); // Further reduced multiplier
      }
      adjustments.breakdown.waitingTime = waitingAdjustment;
      adjustments.total += waitingAdjustment;
    }

    // Age-based adjustments - more conservative for priority patients
    if (patientInfo.age !== undefined && patientInfo.age !== null) {
      if (patientInfo.age >= 80) {
        adjustments.breakdown.seniorCitizen = 60;
        adjustments.total += 60;
      } else if (patientInfo.age >= 65) {
        adjustments.breakdown.elderly = 20; // Further reduced from 30 to keep priority patients under 900
        adjustments.total += 20;
      } else if (patientInfo.age <= 12) { // Pediatric patients up to 12
        adjustments.breakdown.pediatric = 30; // Moderate boost for pediatric patients
        adjustments.total += 30;
      }
    }

    // Medical history adjustments - more conservative
    if (patientInfo.medicalHistory) {
      if (patientInfo.medicalHistory.critical) {
        adjustments.breakdown.criticalCondition = 100;
        adjustments.total += 100;
      } else if (patientInfo.medicalHistory.chronic) {
        adjustments.breakdown.chronicCondition = 30; // Further reduced from 40
        adjustments.total += 30;
      }

      // Multiple conditions get additional boost
      if (patientInfo.medicalHistory.conditions && Array.isArray(patientInfo.medicalHistory.conditions)) {
        const conditionCount = patientInfo.medicalHistory.conditions.length;
        if (conditionCount >= 3) {
          adjustments.breakdown.multipleConditions = 75;
          adjustments.total += 75;
        } else if (conditionCount >= 2) {
          adjustments.breakdown.multipleConditions = 40;
          adjustments.total += 40;
        }

        // Specific condition adjustments
        const conditions = patientInfo.medicalHistory.conditions.map(c => c.toLowerCase());
        
        if (conditions.includes('diabetes') || conditions.includes('hypertension')) {
          adjustments.breakdown.commonChronic = 20;
          adjustments.total += 20;
        }
        
        if (conditions.includes('heart disease') || conditions.includes('kidney_disease')) {
          adjustments.breakdown.seriousChronic = 40;
          adjustments.total += 40;
        }
      }
    }

    // Urgency level adjustments - more conservative for priority patients
    if (patientInfo.urgencyLevel) {
      switch (patientInfo.urgencyLevel.toLowerCase()) {
        case 'emergency':
          adjustments.breakdown.urgencyLevel = 200; // Highest adjustment for emergency
          adjustments.total += 200;
          break;
        case 'critical':
          adjustments.breakdown.urgencyLevel = 150;
          adjustments.total += 150;
          break;
        case 'urgent':
          adjustments.breakdown.urgencyLevel = 40; // Further reduced from 50
          adjustments.total += 40;
          break;
        case 'moderate':
          adjustments.breakdown.urgencyLevel = 30;
          adjustments.total += 30;
          break;
        case 'routine':
          // No adjustment for routine
          break;
      }
    }

    // Pregnancy adjustment
    if (patientInfo.isPregnant) {
      adjustments.breakdown.pregnancy = 75;
      adjustments.total += 75;
    }

    // Disability adjustment
    if (patientInfo.hasDisability) {
      adjustments.breakdown.disability = 50;
      adjustments.total += 50;
    }

    // Follow-up urgency adjustment
    if (patientInfo.followupUrgency) {
      switch (patientInfo.followupUrgency) {
        case 'urgent':
          adjustments.breakdown.urgentFollowup = 75;
          adjustments.total += 75;
          break;
        case 'moderate':
          adjustments.breakdown.moderateFollowup = 40;
          adjustments.total += 40;
          break;
        case 'routine':
          adjustments.breakdown.routineFollowup = 20;
          adjustments.total += 20;
          break;
      }
    }

    return adjustments;
  }

  
  getPriorityLevel(priorityScore) {
    if (priorityScore >= 1000) return 'emergency';
    if (priorityScore >= 700) return 'high';
    if (priorityScore >= 400) return 'medium'; 
    if (priorityScore >= 200) return 'low';
    return 'very_low';
  }

  async compareTokens(token1, token2) {
    return this.executeOperation('compareTokens', async () => {
      this.validateRequired({ token1, token2 }, ['token1', 'token2']);
      
      const priority1Result = await this.calculatePriority(
        token1.source,
        token1.patientInfo,
        token1.waitingTime
      );
      
      const priority2Result = await this.calculatePriority(
        token2.source,
        token2.patientInfo,
        token2.waitingTime
      );

      const priority1 = priority1Result.data.finalPriority;
      const priority2 = priority2Result.data.finalPriority;
      
      let higherPriorityToken = null;
      let comparison = '';
      
      if (priority1 > priority2) {
        higherPriorityToken = token1;
        comparison = 'Token 1 has higher priority';
      } else if (priority2 > priority1) {
        higherPriorityToken = token2;
        comparison = 'Token 2 has higher priority';
      } else {
        comparison = 'Tokens have equal priority - FCFS applies';
      }

      const result = {
        token1Priority: priority1,
        token2Priority: priority2,
        higherPriorityToken,
        comparison,
        priorityDifference: Math.abs(priority1 - priority2),
        token1Details: priority1Result.data,
        token2Details: priority2Result.data
      };

      return this.createSuccessResponse(
        result,
        'Token comparison completed successfully'
      );
    });
  }

  
  async getPriorityConfiguration() {
    return this.executeOperation('getPriorityConfiguration', async () => {
      const priorityConfig = await this.configurationService.getPriorityConfig();
      
      if (!priorityConfig.success) {
        return priorityConfig;
      }

      const config = priorityConfig.data;
      
      const priorityLevels = {
        emergency: { score: config.emergency, level: 'EMERGENCY' },
        priority_patient: { score: config.priority_patient, level: 'HIGH' },
        followup: { score: config.followup, level: 'MEDIUM_HIGH' },
        online_booking: { score: config.online_booking, level: 'MEDIUM' },
        walkin: { score: config.walkin, level: 'LOW' }
      };

      const result = {
        basePriorities: config,
        priorityLevels,
        adjustmentRules: {
          waitingTime: 'Up to 100 points for 2+ hours waiting',
          age: {
            infant: '75 points for age <= 5',
            elderly: '50 points for age >= 65',
            seniorCitizen: '100 points for age >= 80'
          },
          medicalHistory: {
            chronic: '75 points for chronic conditions',
            critical: '150 points for critical conditions'
          },
          special: {
            pregnancy: '100 points',
            disability: '75 points'
          }
        }
      };

      return this.createSuccessResponse(
        result,
        'Priority configuration retrieved successfully'
      );
    });
  }

  
  clearCache() {
    this.priorityCache.clear();
    this.logger.debug('Priority calculation cache cleared');
  }
}

module.exports = PriorityCalculationService;