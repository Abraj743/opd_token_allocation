const express = require('express');
const Joi = require('joi');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const SlotSchemas = require('../middleware/schemas/slotSchemas');


function createSlotRoutes(container) {
  const router = express.Router();
  const slotController = container.resolve('slotController');

  // Create new time slot
  router.post('/',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(SlotSchemas.createSlot),
    LoggingMiddleware.auditLogger('CREATE', 'SLOT'),
    slotController.wrapAsync(slotController.createSlot.bind(slotController))
  );

  // Get slots based on criteria
  router.get('/',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(SlotSchemas.getSlots),
    slotController.wrapAsync(slotController.getSlots.bind(slotController))
  );

  // Get available slots
  router.get('/available',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(SlotSchemas.getAvailableSlots),
    slotController.wrapAsync(slotController.getAvailableSlots.bind(slotController))
  );

  // Bulk create slots
  router.post('/bulk',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(SlotSchemas.bulkCreateSlots),
    LoggingMiddleware.auditLogger('BULK_CREATE', 'SLOTS'),
    slotController.wrapAsync(slotController.bulkCreateSlots.bind(slotController))
  );

  // Get slot statistics
  router.get('/statistics',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateQuery(SlotSchemas.getSlotStatistics),
    slotController.wrapAsync(slotController.getSlotStatistics.bind(slotController))
  );

  // Get slot utilization report
  router.get('/utilization',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateQuery(SlotSchemas.getSlotStatistics),
    slotController.wrapAsync(slotController.getSlotUtilization.bind(slotController))
  );

  // Get slots by doctor
  router.get('/doctor/:doctorId',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(SlotSchemas.doctorIdParam),
    ValidationMiddleware.validateQuery(SlotSchemas.getAvailableSlots),
    slotController.wrapAsync(slotController.getSlotsByDoctor.bind(slotController))
  );

  // Get slot by ID
  router.get('/:id',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    slotController.wrapAsync(slotController.getSlotById.bind(slotController))
  );

  // Update slot information
  router.put('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    ValidationMiddleware.validateBody(SlotSchemas.updateSlot),
    LoggingMiddleware.auditLogger('UPDATE', 'SLOT'),
    slotController.wrapAsync(slotController.updateSlot.bind(slotController))
  );

  // Delete a slot
  router.delete('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    LoggingMiddleware.auditLogger('DELETE', 'SLOT'),
    slotController.wrapAsync(slotController.deleteSlot.bind(slotController))
  );

  // Update slot capacity
  router.patch('/:id/capacity',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    ValidationMiddleware.validateBody(SlotSchemas.updateSlotCapacity),
    LoggingMiddleware.auditLogger('UPDATE_CAPACITY', 'SLOT'),
    slotController.wrapAsync(slotController.updateSlotCapacity.bind(slotController))
  );

  // Update slot status
  router.patch('/:id/status',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    ValidationMiddleware.validateBody(SlotSchemas.updateSlotStatus),
    LoggingMiddleware.auditLogger('UPDATE_STATUS', 'SLOT'),
    slotController.wrapAsync(slotController.updateSlotStatus.bind(slotController))
  );

  // Clone a slot to multiple dates
  router.post('/:id/clone',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    ValidationMiddleware.validateBody(SlotSchemas.cloneSlot),
    LoggingMiddleware.auditLogger('CLONE', 'SLOT'),
    slotController.wrapAsync(slotController.cloneSlot.bind(slotController))
  );

  // Get slot allocation status
  router.get('/:id/allocation-status',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(SlotSchemas.slotIdParam),
    slotController.wrapAsync(slotController.getSlotAllocationStatus.bind(slotController))
  );

  return router;
}

module.exports = createSlotRoutes;