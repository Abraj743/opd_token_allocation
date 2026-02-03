const Joi = require('joi');
const { CommonSchemas } = require('../validation');


const SlotSchemas = {
  createSlot: Joi.object({
    doctorId: Joi.string().min(3).max(50).required(),
    date: Joi.date().iso().min('now').required(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    maxCapacity: Joi.number().integer().min(1).max(50).required(),
    specialty: Joi.string().max(100).optional(),
    metadata: Joi.object({
      averageConsultationTime: Joi.number().integer().min(5).max(60).default(15),
      bufferTime: Joi.number().integer().min(0).max(15).default(5),
      emergencyReserved: Joi.number().integer().min(0).max(10).default(2),
      roomNumber: Joi.string().max(20).optional(),
      equipment: Joi.array().items(Joi.string().max(50)).optional(),
      notes: Joi.string().max(500).optional()
    }).optional(),
    recurrence: Joi.object({
      type: Joi.string().valid('none', 'daily', 'weekly', 'monthly').default('none'),
      endDate: Joi.date().iso().min(Joi.ref('date')).when('type', {
        is: Joi.not('none'),
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).when('type', {
        is: 'weekly',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      exceptions: Joi.array().items(Joi.date().iso()).optional()
    }).optional()
  }),

  updateSlot: Joi.object({
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    maxCapacity: Joi.number().integer().min(1).max(50).optional(),
    status: Joi.string().valid('active', 'suspended', 'completed', 'cancelled').optional(),
    specialty: Joi.string().max(100).optional(),
    metadata: Joi.object({
      averageConsultationTime: Joi.number().integer().min(5).max(60).optional(),
      bufferTime: Joi.number().integer().min(0).max(15).optional(),
      emergencyReserved: Joi.number().integer().min(0).max(10).optional(),
      roomNumber: Joi.string().max(20).optional(),
      equipment: Joi.array().items(Joi.string().max(50)).optional(),
      notes: Joi.string().max(500).optional()
    }).optional(),
    updateReason: Joi.string().max(200).optional(),
    updatedBy: Joi.string().max(100).optional()
  }).min(1),

  bulkCreateSlots: Joi.object({
    doctorId: Joi.string().min(3).max(50).required(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().min('now').required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).required(),
    timeSlots: Joi.array().items(
      Joi.object({
        startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        maxCapacity: Joi.number().integer().min(1).max(50).required(),
        specialty: Joi.string().max(100).optional()
      })
    ).min(1).max(20).required(),
    daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).max(7).required(),
    excludeDates: Joi.array().items(Joi.date().iso()).optional(),
    metadata: Joi.object({
      averageConsultationTime: Joi.number().integer().min(5).max(60).default(15),
      bufferTime: Joi.number().integer().min(0).max(15).default(5),
      emergencyReserved: Joi.number().integer().min(0).max(10).default(2),
      roomNumber: Joi.string().max(20).optional(),
      equipment: Joi.array().items(Joi.string().max(50)).optional(),
      notes: Joi.string().max(500).optional()
    }).optional(),
    createdBy: Joi.string().max(100).required()
  }),

  getAvailableSlots: Joi.object({
    doctorId: Joi.string().min(3).max(50).optional(),
    date: Joi.date().iso().optional(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).optional(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    specialty: Joi.string().max(100).optional(),
    minCapacity: Joi.number().integer().min(1).max(50).optional(),
    status: Joi.string().valid('active', 'suspended', 'completed', 'cancelled').default('active'),
    includeFullyBooked: Joi.boolean().default(false),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('date')
  }),

  getSlots: Joi.object({
    doctorId: Joi.string().min(3).max(50).optional(),
    date: Joi.date().iso().optional(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).optional(),
    status: Joi.string().valid('active', 'suspended', 'completed', 'cancelled').optional(),
    specialty: Joi.string().max(100).optional(),
    capacityRange: Joi.object({
      min: Joi.number().integer().min(1).max(50).required(),
      max: Joi.number().integer().min(1).max(50).min(Joi.ref('min')).required()
    }).optional(),
    utilizationRange: Joi.object({
      min: Joi.number().min(0).max(100).required(),
      max: Joi.number().min(0).max(100).min(Joi.ref('min')).required()
    }).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('date')
  }),


  getSlotStatistics: Joi.object({
    doctorId: Joi.string().min(3).max(50).optional(),
    dateRange: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }).optional(),
    groupBy: Joi.string().valid('hour', 'day', 'week', 'month', 'doctor', 'specialty').default('day'),
    includeMetrics: Joi.array().items(
      Joi.string().valid('utilization', 'capacity', 'allocation_count', 'cancellation_rate', 'efficiency')
    ).default(['utilization', 'capacity']),
    specialty: Joi.string().max(100).optional()
  }),


  updateSlotCapacity: Joi.object({
    newCapacity: Joi.number().integer().min(1).max(50).required(),
    reason: Joi.string().min(5).max(200).required(),
    updatedBy: Joi.string().max(100).required(),
    handleExistingTokens: Joi.string().valid('keep', 'reallocate', 'cancel').default('reallocate'),
    notifyAffectedPatients: Joi.boolean().default(true)
  }),

  updateSlotStatus: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'cancelled').required(),
    reason: Joi.string().min(5).max(200).required(),
    updatedBy: Joi.string().max(100).required(),
    handleExistingTokens: Joi.string().valid('keep', 'reallocate', 'cancel').default('reallocate'),
    notifyAffectedPatients: Joi.boolean().default(true),
    effectiveDate: Joi.date().iso().min('now').optional()
  }),

  cloneSlot: Joi.object({
    targetDates: Joi.array().items(Joi.date().iso().min('now')).min(1).max(30).required(),
    modifications: Joi.object({
      startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      maxCapacity: Joi.number().integer().min(1).max(50).optional(),
      specialty: Joi.string().max(100).optional()
    }).optional(),
    createdBy: Joi.string().max(100).required()
  }),

  slotIdParam: CommonSchemas.idParam,
  
  doctorIdParam: Joi.object({
    doctorId: Joi.string().min(3).max(50).required()
  }),
  
  slotDoctorParams: Joi.object({
    id: CommonSchemas.objectId.required(),
    doctorId: Joi.string().min(3).max(50).required()
  })
};

module.exports = SlotSchemas;