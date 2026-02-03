const Joi = require('joi');
const { CommonSchemas } = require('../validation');


const TokenSchemas = {
  createToken: Joi.object({
    patientId: Joi.string().min(3).max(50).required(),
    department: Joi.string().min(3).max(50).optional(),
    doctorId: Joi.string().min(3).max(50).optional(),
    slotId: Joi.string().min(3).max(50).optional(),
    preferredDate: Joi.date().iso().min('now').optional(),
    source: Joi.string().valid('online', 'walkin', 'priority', 'followup', 'emergency').required(),
    patientType: Joi.object({
      age: Joi.number().integer().min(0).max(150).optional(),
      isFollowup: Joi.boolean().default(false),
      isPriority: Joi.boolean().default(false),
      medicalHistory: Joi.object({
        chronic: Joi.boolean().default(false),
        critical: Joi.boolean().default(false),
        conditions: Joi.array().items(Joi.string().max(100)).optional()
      }).optional()
    }).optional(),
    preferences: Joi.object({
      preferredTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      notes: Joi.string().max(500).optional()
    }).optional(),
    metadata: Joi.object({
      requestedBy: Joi.string().max(100).optional(),
      requestSource: Joi.string().valid('web', 'mobile', 'desk', 'phone').optional(),
      urgencyLevel: Joi.string().valid('low', 'medium', 'high', 'emergency').default('medium')
    }).optional()
  }).custom((value, helpers) => {
    if (!value.department && (!value.doctorId || !value.slotId)) {
      return helpers.error('any.custom', {
        message: 'Either department (for smart allocation) or both doctorId and slotId must be provided'
      });
    }
    return value;
  }),

  updateToken: Joi.object({
    slotId: Joi.string().min(3).max(50).optional(),
    status: Joi.string().valid('allocated', 'confirmed', 'completed', 'cancelled', 'noshow').optional(),
    preferences: Joi.object({
      preferredTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      notes: Joi.string().max(500).optional()
    }).optional(),
    metadata: Joi.object({
      updatedBy: Joi.string().max(100).optional(),
      updateReason: Joi.string().max(200).optional(),
      urgencyLevel: Joi.string().valid('low', 'medium', 'high', 'emergency').optional()
    }).optional()
  }).min(1),

  emergencyInsertion: Joi.object({
    patientId: Joi.string().min(3).max(50).required(),
    department: Joi.string().min(3).max(50).required(),
    doctorId: Joi.string().min(3).max(50).optional(),
    slotId: Joi.string().min(3).max(50).optional(),
    urgencyLevel: Joi.string().valid('high', 'emergency').default('emergency'),
    medicalReason: Joi.string().min(10).max(500).required(),
    requestedBy: Joi.string().max(100).required(),
    patientType: Joi.object({
      age: Joi.number().integer().min(0).max(150).optional(),
      medicalHistory: Joi.object({
        chronic: Joi.boolean().default(false),
        critical: Joi.boolean().default(true),
        conditions: Joi.array().items(Joi.string().max(100)).optional()
      }).optional()
    }).optional(),
    allowPreemption: Joi.boolean().default(true)
  }),

  reallocateTokens: Joi.object({
    criteria: Joi.object({
      doctorId: Joi.string().min(3).max(50).optional(),
      slotId: Joi.string().min(3).max(50).optional(),
      dateRange: Joi.object({
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
      }).optional(),
      status: Joi.array().items(Joi.string().valid('allocated', 'confirmed')).optional()
    }).required(),
    targetCriteria: Joi.object({
      doctorId: Joi.string().min(3).max(50).optional(),
      timeRange: Joi.object({
        startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
      }).optional(),
      maxWaitingTime: Joi.number().integer().min(0).max(480).optional()
    }).optional(),
    reason: Joi.string().min(5).max(200).required(),
    requestedBy: Joi.string().max(100).required()
  }),

  cancelToken: Joi.object({
    reason: Joi.string().valid('patient_request', 'doctor_unavailable', 'emergency', 'system_error', 'other').required(),
    notes: Joi.string().max(500).optional(),
    cancelledBy: Joi.string().max(100).required(),
    refundRequired: Joi.boolean().default(false),
    notifyPatient: Joi.boolean().default(true)
  }),


  markNoShow: Joi.object({
    reason: Joi.string().max(500).optional(),
    markedBy: Joi.string().max(100).required(),
    notes: Joi.string().max(500).optional(),
    notifyPatient: Joi.boolean().default(true),
    penaltyApplied: Joi.boolean().default(false)
  }),


  getTokens: Joi.object({
    patientId: Joi.string().min(3).max(50).optional(),
    doctorId: Joi.string().min(3).max(50).optional(),
    slotId: Joi.string().min(3).max(50).optional(),
    status: Joi.string().valid('allocated', 'confirmed', 'completed', 'cancelled', 'noshow').optional(),
    source: Joi.string().valid('online', 'walkin', 'priority', 'followup', 'emergency').optional(),
    date: Joi.date().iso().optional(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).optional(),
    priorityMin: Joi.number().integer().min(0).max(1000).optional(),
    priorityMax: Joi.number().integer().min(0).max(1000).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),

  getTokenStatistics: Joi.object({
    doctorId: Joi.string().min(3).max(50).optional(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).optional(),
    groupBy: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    includeMetrics: Joi.array().items(
      Joi.string().valid('allocation_rate', 'cancellation_rate', 'noshow_rate', 'wait_times', 'priority_distribution')
    ).default(['allocation_rate', 'wait_times'])
  }),

  getWaitingList: Joi.object({
    doctorId: Joi.string().min(3).max(50).optional(),
    date: Joi.date().iso().optional(),
    priorityMin: Joi.number().integer().min(0).max(1000).optional(),
    maxWaitTime: Joi.number().integer().min(0).max(480).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),

  batchUpdateTokens: Joi.object({
    tokenIds: Joi.array().items(Joi.string().min(3).max(50)).min(1).max(50).required(),
    updates: Joi.object({
      status: Joi.string().valid('allocated', 'confirmed', 'completed', 'cancelled', 'noshow').optional(),
      slotId: Joi.string().min(3).max(50).optional(),
      metadata: Joi.object({
        updatedBy: Joi.string().max(100).optional(),
        updateReason: Joi.string().max(200).optional(),
        batchId: Joi.string().max(50).optional()
      }).optional()
    }).min(1).required(),
    reason: Joi.string().min(5).max(200).required(),
    requestedBy: Joi.string().max(100).required()
  }),


  tokenIdParam: Joi.object({
    id: Joi.string().min(3).max(50).required()
  }),
  
  tokenSlotParams: Joi.object({
    id: Joi.string().min(3).max(50).required(),
    slotId: Joi.string().min(3).max(50).required()
  })
};

module.exports = TokenSchemas;