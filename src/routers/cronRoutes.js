const express = require('express');
const { AuthMiddleware, LoggingMiddleware } = require('../middleware');


function createCronRoutes(container) {
  const router = express.Router();
  const cronController = container.resolve('cronController');

  // Generate slots for today (midnight cron job)
  router.post('/generate-slots',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    LoggingMiddleware.auditLogger('GENERATE', 'DAILY_SLOTS'),
    cronController.wrapAsync(cronController.generateSlotsForToday.bind(cronController))
  );

  // Generate slots for specific date (manual trigger)
  router.post('/generate-slots/:date',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    LoggingMiddleware.auditLogger('GENERATE', 'DATE_SLOTS'),
    cronController.wrapAsync(cronController.generateSlotsForDate.bind(cronController))
  );

  // Get generation statistics
  router.get('/generation-stats',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    cronController.wrapAsync(cronController.getGenerationStatistics.bind(cronController))
  );

  return router;
}

module.exports = createCronRoutes;