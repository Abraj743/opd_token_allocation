const express = require('express');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');

function createSimulationRoutes(container) {
  const router = express.Router();
  const simulationController = container.resolve('simulationController');

  // Run OPD day simulation
  router.post('/opd-day',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    LoggingMiddleware.auditLogger('CREATE', 'SIMULATION'),
    simulationController.wrapAsync(simulationController.runOPDDaySimulation.bind(simulationController))
  );

  // Get simulation status
  router.get('/status',
    AuthMiddleware.authenticate,
    simulationController.wrapAsync(simulationController.getSimulationStatus.bind(simulationController))
  );

  // Stop running simulation
  router.post('/stop',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    LoggingMiddleware.auditLogger('UPDATE', 'SIMULATION_STOP'),
    simulationController.wrapAsync(simulationController.stopSimulation.bind(simulationController))
  );

  // Generate simulation report
  router.post('/report',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    simulationController.wrapAsync(simulationController.generateReport.bind(simulationController))
  );

  // Run quick simulation test
  router.post('/quick-test',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    LoggingMiddleware.auditLogger('CREATE', 'SIMULATION_TEST'),
    simulationController.wrapAsync(simulationController.runQuickTest.bind(simulationController))
  );

  // Get simulation configuration options
  router.get('/config',
    AuthMiddleware.authenticate,
    simulationController.wrapAsync(simulationController.getSimulationConfig.bind(simulationController))
  );

  // Validate simulation parameters
  router.post('/validate',
    AuthMiddleware.authenticate,
    simulationController.wrapAsync(simulationController.validateSimulationParams.bind(simulationController))
  );

  // Get simulation history
  router.get('/history',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    simulationController.wrapAsync(simulationController.getSimulationHistory.bind(simulationController))
  );

  return router;
}

module.exports = createSimulationRoutes;