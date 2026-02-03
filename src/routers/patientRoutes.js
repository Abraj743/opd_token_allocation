const express = require('express');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const PatientSchemas = require('../middleware/schemas/patientSchemas');


function createPatientRoutes(container) {
  const router = express.Router();
  const patientController = container.resolve('patientController');

  // Create new patient
  router.post('/', 
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateBody(PatientSchemas.createPatient),
    LoggingMiddleware.auditLogger('CREATE', 'PATIENT'),
    patientController.wrapAsync(patientController.createPatient.bind(patientController))
  );

  // Get all patients
  router.get('/',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(PatientSchemas.getPatients),
    patientController.wrapAsync(patientController.getPatients.bind(patientController))
  );

  // Search patients
  router.get('/search',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(PatientSchemas.searchPatients),
    patientController.wrapAsync(patientController.searchPatients.bind(patientController))
  );

  // Get patients with due follow-ups
  router.get('/due-followups',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateQuery(PatientSchemas.getDueFollowups),
    patientController.wrapAsync(patientController.getDueFollowups.bind(patientController))
  );

  // Get patient statistics
  router.get('/statistics',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateQuery(PatientSchemas.getPatientStatistics),
    patientController.wrapAsync(patientController.getPatientStatistics.bind(patientController))
  );

  // Get patient by ID
  router.get('/:id',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(PatientSchemas.getPatientById),
    patientController.wrapAsync(patientController.getPatientById.bind(patientController))
  );

  // Update patient
  router.put('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(PatientSchemas.updatePatient.params),
    ValidationMiddleware.validateBody(PatientSchemas.updatePatient.body),
    LoggingMiddleware.auditLogger('UPDATE', 'PATIENT'),
    patientController.wrapAsync(patientController.updatePatient.bind(patientController))
  );

  // Update patient status
  router.patch('/:id/status',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateParams(PatientSchemas.updatePatientStatus.params),
    ValidationMiddleware.validateBody(PatientSchemas.updatePatientStatus.body),
    LoggingMiddleware.auditLogger('UPDATE', 'PATIENT_STATUS'),
    patientController.wrapAsync(patientController.updatePatientStatus.bind(patientController))
  );

  // Get patient history
  router.get('/:id/history',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(PatientSchemas.getPatientHistory.params),
    ValidationMiddleware.validateQuery(PatientSchemas.getPatientHistory.query),
    patientController.wrapAsync(patientController.getPatientHistory.bind(patientController))
  );

  // Add visit record
  router.post('/:id/visits',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(PatientSchemas.addVisitRecord.params),
    ValidationMiddleware.validateBody(PatientSchemas.addVisitRecord.body),
    LoggingMiddleware.auditLogger('CREATE', 'VISIT'),
    patientController.wrapAsync(patientController.addVisitRecord.bind(patientController))
  );

  // Check follow-up eligibility
  router.get('/:id/followup-eligibility/:doctorId',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(PatientSchemas.checkFollowupEligibility),
    patientController.wrapAsync(patientController.checkFollowupEligibility.bind(patientController))
  );

  return router;
}

module.exports = createPatientRoutes;