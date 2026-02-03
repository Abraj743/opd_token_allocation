const BaseController = require('./BaseController');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const PatientSchemas = require('../middleware/schemas/patientSchemas');


class PatientController extends BaseController {
  constructor({ patientService, logger }) {
    super({ logger });
    this.patientService = patientService;
  }

  
  async createPatient(req, res) {
    const params = this.extractParams(req, ['personalInfo']);
    
    const serviceResponse = await this.patientService.createPatient(params);
    this.logOperation(req, 'createPatient', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getPatients(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    
    const serviceResponse = await this.patientService.getPatients({
      ...params,
      ...pagination
    });
    this.logOperation(req, 'getPatients', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getPatientById(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.patientService.getPatientById(params.id);
    this.logOperation(req, 'getPatientById', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updatePatient(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.patientService.updatePatientInfo(params.id, params);
    this.logOperation(req, 'updatePatient', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getPatientHistory(req, res) {
    const params = this.extractParams(req, ['id']);
    const pagination = this.validatePagination(req.query);
    
    const serviceResponse = await this.patientService.getPatientHistory(params.id, pagination);
    this.logOperation(req, 'getPatientHistory', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async addVisitRecord(req, res) {
    const params = this.extractParams(req, ['id', 'visitData']);
    
    const serviceResponse = await this.patientService.addVisitRecord(params.id, params.visitData);
    this.logOperation(req, 'addVisitRecord', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async checkFollowupEligibility(req, res) {
    const params = this.extractParams(req, ['id', 'doctorId']);
    
    const serviceResponse = await this.patientService.checkFollowupEligibility(params.id, params.doctorId);
    this.logOperation(req, 'checkFollowupEligibility', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async searchPatients(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['name', 'createdAt', 'updatedAt']);
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    const serviceResponse = await this.patientService.searchPatients(params, searchOptions);
    this.logOperation(req, 'searchPatients', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getDueFollowups(req, res) {
    const params = this.extractParams(req);
    const beforeDate = params.beforeDate ? new Date(params.beforeDate) : new Date();
    
    const serviceResponse = await this.patientService.getPatientsWithDueFollowups(beforeDate);
    this.logOperation(req, 'getDueFollowups', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

 
  async updatePatientStatus(req, res) {
    const params = this.extractParams(req, ['id', 'status']);
    
    const serviceResponse = await this.patientService.updatePatientStatus(params.id, params.status);
    this.logOperation(req, 'updatePatientStatus', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getPatientStatistics(req, res) {
    const params = this.extractParams(req);
    const startDate = params.startDate ? new Date(params.startDate) : null;
    const endDate = params.endDate ? new Date(params.endDate) : null;
    
    const serviceResponse = await this.patientService.getPatientStatistics(startDate, endDate);
    this.logOperation(req, 'getPatientStatistics', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

}

module.exports = PatientController;