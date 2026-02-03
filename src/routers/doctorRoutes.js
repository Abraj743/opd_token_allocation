const express = require('express');
const Joi = require('joi');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');


function createDoctorRoutes(container) {
  const router = express.Router();
  const doctorController = container.resolve('doctorController');

  const createDoctorSchema = Joi.object({
    name: Joi.string().required().max(100),
    specialty: Joi.string().required().max(100),
    qualification: Joi.string().required().max(200),
    experience: Joi.number().required().min(0).max(60),
    contactInfo: Joi.object({
      phoneNumber: Joi.string().required().pattern(/^[0-9]{10}$/),
      email: Joi.string().required().email(),
      department: Joi.string().required().max(100)
    }).required(),
    schedule: Joi.array().items(
      Joi.object({
        dayOfWeek: Joi.number().required().min(0).max(6),
        slots: Joi.array().items(
          Joi.object({
            startTime: Joi.string().required().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            endTime: Joi.string().required().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            capacity: Joi.number().required().min(1).max(50)
          })
        )
      })
    ).optional(),
    preferences: Joi.object({
      maxPatientsPerSlot: Joi.number().optional().min(1).max(50),
      emergencyAvailability: Joi.boolean().optional(),
      followupPriority: Joi.boolean().optional(),
      averageConsultationTime: Joi.number().optional().min(5).max(60)
    }).optional(),
    status: Joi.string().optional().valid('active', 'inactive', 'on_leave')
  });

  const updateDoctorSchema = Joi.object({
    name: Joi.string().optional().max(100),
    specialty: Joi.string().optional().max(100),
    qualification: Joi.string().optional().max(200),
    experience: Joi.number().optional().min(0).max(60),
    contactInfo: Joi.object({
      phoneNumber: Joi.string().optional().pattern(/^[0-9]{10}$/),
      email: Joi.string().optional().email(),
      department: Joi.string().optional().max(100)
    }).optional(),
    preferences: Joi.object({
      maxPatientsPerSlot: Joi.number().optional().min(1).max(50),
      emergencyAvailability: Joi.boolean().optional(),
      followupPriority: Joi.boolean().optional(),
      averageConsultationTime: Joi.number().optional().min(5).max(60)
    }).optional(),
    status: Joi.string().optional().valid('active', 'inactive', 'on_leave')
  });

  const querySchema = Joi.object({
    status: Joi.string().optional().valid('active', 'inactive', 'on_leave'),
    specialty: Joi.string().optional(),
    emergencyAvailable: Joi.boolean().optional(),
    minExperience: Joi.number().optional().min(0),
    maxExperience: Joi.number().optional().max(60),
    limit: Joi.number().optional().min(1).max(100),
    skip: Joi.number().optional().min(0)
  });

  const searchSchema = Joi.object({
    q: Joi.string().required().min(1),
    status: Joi.string().optional().valid('active', 'inactive', 'on_leave'),
    limit: Joi.number().optional().min(1).max(100),
    skip: Joi.number().optional().min(0),
    sort: Joi.string().optional()
  });

  const idParamSchema = Joi.object({
    id: Joi.string().required()
  });

  const statusUpdateSchema = Joi.object({
    status: Joi.string().required().valid('active', 'inactive', 'on_leave')
  });

  const scheduleQuerySchema = Joi.object({
    dayOfWeek: Joi.number().required().min(0).max(6)
  });

  const addScheduleSchema = Joi.object({
    dayOfWeek: Joi.number().required().min(0).max(6),
    slotData: Joi.object({
      startTime: Joi.string().required().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      endTime: Joi.string().required().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      capacity: Joi.number().required().min(1).max(50)
    }).required()
  });

  // Create new doctor
  router.post('/',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(createDoctorSchema),
    LoggingMiddleware.auditLogger('CREATE', 'DOCTOR'),
    doctorController.wrapAsync(doctorController.createDoctor.bind(doctorController))
  );

  // Get all doctors
  router.get('/',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(querySchema),
    doctorController.wrapAsync(doctorController.getDoctors.bind(doctorController))
  );

  // Search doctors
  router.get('/search',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(searchSchema),
    doctorController.wrapAsync(doctorController.searchDoctors.bind(doctorController))
  );

  // Get active doctors
  router.get('/active',
    AuthMiddleware.authenticate,
    doctorController.wrapAsync(doctorController.getActiveDoctors.bind(doctorController))
  );

  // Get emergency available doctors
  router.get('/emergency-available',
    AuthMiddleware.authenticate,
    doctorController.wrapAsync(doctorController.getEmergencyAvailableDoctors.bind(doctorController))
  );

  // Get doctor statistics
  router.get('/statistics',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateQuery(querySchema),
    doctorController.wrapAsync(doctorController.getDoctorStatistics.bind(doctorController))
  );

  // Get doctors by specialty
  router.get('/specialty/:specialty',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(Joi.object({
      specialty: Joi.string().required()
    })),
    doctorController.wrapAsync(doctorController.getDoctorsBySpecialty.bind(doctorController))
  );

  // Get doctors available on specific day
  router.get('/available/:dayOfWeek',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(Joi.object({
      dayOfWeek: Joi.number().required().min(0).max(6)
    })),
    doctorController.wrapAsync(doctorController.getDoctorsAvailableOnDay.bind(doctorController))
  );

  // Get doctor by ID
  router.get('/:id',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(idParamSchema),
    doctorController.wrapAsync(doctorController.getDoctorById.bind(doctorController))
  );

  // Update doctor
  router.put('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(updateDoctorSchema),
    LoggingMiddleware.auditLogger('UPDATE', 'DOCTOR'),
    doctorController.wrapAsync(doctorController.updateDoctor.bind(doctorController))
  );

  // Update doctor status
  router.patch('/:id/status',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(statusUpdateSchema),
    LoggingMiddleware.auditLogger('UPDATE_STATUS', 'DOCTOR'),
    doctorController.wrapAsync(doctorController.updateDoctorStatus.bind(doctorController))
  );

  // Get doctor schedule
  router.get('/:id/schedule',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateQuery(scheduleQuerySchema),
    doctorController.wrapAsync(doctorController.getDoctorSchedule.bind(doctorController))
  );

  // Add schedule slot to doctor
  router.post('/:id/schedule',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(idParamSchema),
    ValidationMiddleware.validateBody(addScheduleSchema),
    LoggingMiddleware.auditLogger('ADD_SCHEDULE', 'DOCTOR'),
    doctorController.wrapAsync(doctorController.addScheduleSlot.bind(doctorController))
  );

  return router;
}

module.exports = createDoctorRoutes;