const express = require('express');
const Joi = require('joi');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');


function createDoctorScheduleRoutes(container) {
  const router = express.Router();
  const doctorScheduleController = container.resolve('doctorScheduleController');

  const timeSlotSchema = Joi.object({
    startTime: Joi.string().required().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: Joi.string().required().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    maxCapacity: Joi.number().required().min(1).max(50),
    slotType: Joi.string().valid('regular', 'emergency_reserved', 'vip').default('regular')
  });

  const weeklyScheduleSchema = Joi.object({
    monday: Joi.array().items(timeSlotSchema).default([]),
    tuesday: Joi.array().items(timeSlotSchema).default([]),
    wednesday: Joi.array().items(timeSlotSchema).default([]),
    thursday: Joi.array().items(timeSlotSchema).default([]),
    friday: Joi.array().items(timeSlotSchema).default([]),
    saturday: Joi.array().items(timeSlotSchema).default([]),
    sunday: Joi.array().items(timeSlotSchema).default([])
  });

  const createScheduleSchema = Joi.object({
    doctorId: Joi.string().required().min(3).max(50),
    department: Joi.string().required().trim().max(100),
    weeklySchedule: weeklyScheduleSchema.required(),
    isActive: Joi.boolean().default(true),
    effectiveFrom: Joi.date().iso().default(Date.now),
    effectiveTo: Joi.date().iso().optional(),
    specialInstructions: Joi.string().max(500).optional(),
    emergencyAvailable: Joi.boolean().default(true)
  });

  const updateScheduleSchema = Joi.object({
    department: Joi.string().optional().trim().max(100),
    weeklySchedule: weeklyScheduleSchema.optional(),
    isActive: Joi.boolean().optional(),
    effectiveFrom: Joi.date().iso().optional(),
    effectiveTo: Joi.date().iso().optional(),
    specialInstructions: Joi.string().max(500).optional(),
    emergencyAvailable: Joi.boolean().optional()
  }).min(1);

  const querySchema = Joi.object({
    doctorId: Joi.string().optional(),
    department: Joi.string().optional(),
    isActive: Joi.boolean().optional(),
    emergencyAvailable: Joi.boolean().optional(),
    dayOfWeek: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').optional(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    skip: Joi.number().integer().min(0).default(0)
  });

  const idParamSchema = Joi.object({
    id: Joi.string().required()
  });

  const doctorIdParamSchema = Joi.object({
    doctorId: Joi.string().required()
  });

  const dayParamSchema = Joi.object({
    day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required()
  });

  const addSlotSchema = Joi.object({
    day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
    slot: timeSlotSchema.required()
  });

  // Create new doctor schedule
  router.post('/',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(createScheduleSchema),
    LoggingMiddleware.auditLogger('CREATE', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.createSchedule.bind(doctorScheduleController))
  );

  // Get all doctor schedules
  router.get('/',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(querySchema),
    doctorScheduleController.wrapAsync(doctorScheduleController.getSchedules.bind(doctorScheduleController))
  );

  // Get schedules by department
  router.get('/department/:department',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(Joi.object({
      department: Joi.string().required()
    })),
    doctorScheduleController.wrapAsync(doctorScheduleController.getSchedulesByDepartment.bind(doctorScheduleController))
  );

  // Get active schedules
  router.get('/active',
    AuthMiddleware.authenticate,
    doctorScheduleController.wrapAsync(doctorScheduleController.getActiveSchedules.bind(doctorScheduleController))
  );

  // Get schedules available for specific day
  router.get('/available/:day',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(dayParamSchema),
    doctorScheduleController.wrapAsync(doctorScheduleController.getSchedulesForDay.bind(doctorScheduleController))
  );

  // Get schedule by doctor ID
  router.get('/doctor/:doctorId',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(doctorIdParamSchema),
    doctorScheduleController.wrapAsync(doctorScheduleController.getScheduleByDoctorId.bind(doctorScheduleController))
  );

  // Get schedule by ID
  router.get('/:id',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(idParamSchema),
    doctorScheduleController.wrapAsync(doctorScheduleController.getScheduleById.bind(doctorScheduleController))
  );

  // Update doctor schedule
  router.put('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(updateScheduleSchema),
    LoggingMiddleware.auditLogger('UPDATE', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.updateSchedule.bind(doctorScheduleController))
  );

  // Add slot to specific day
  router.post('/:id/slots',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(addSlotSchema),
    LoggingMiddleware.auditLogger('ADD_SLOT', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.addSlotToDay.bind(doctorScheduleController))
  );

  // Remove slot from specific day
  router.delete('/:id/slots/:day/:slotIndex',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(Joi.object({
      id: Joi.string().required(),
      day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
      slotIndex: Joi.number().integer().min(0).required()
    })),
    LoggingMiddleware.auditLogger('REMOVE_SLOT', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.removeSlotFromDay.bind(doctorScheduleController))
  );

  // Activate/Deactivate schedule
  router.patch('/:id/status',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(Joi.object({
      isActive: Joi.boolean().required()
    })),
    LoggingMiddleware.auditLogger('UPDATE_STATUS', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.updateScheduleStatus.bind(doctorScheduleController))
  );

  // Delete doctor schedule
  router.delete('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    LoggingMiddleware.auditLogger('DELETE', 'DOCTOR_SCHEDULE'),
    doctorScheduleController.wrapAsync(doctorScheduleController.deleteSchedule.bind(doctorScheduleController))
  );

  return router;
}

module.exports = createDoctorScheduleRoutes;