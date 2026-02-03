const BaseController = require('./BaseController');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const SlotSchemas = require('../middleware/schemas/slotSchemas');


class SlotController extends BaseController {
  constructor({ slotManagementService, logger }) {
    super({ logger });
    this.slotManagementService = slotManagementService;
  }

  
  async createSlot(req, res) {
    const params = this.extractParams(req, ['doctorId', 'date', 'startTime', 'endTime', 'maxCapacity']);
    
    const serviceResponse = await this.slotManagementService.createTimeSlot(
      params.doctorId,
      params.date,
      params.startTime,
      params.endTime,
      params.maxCapacity,
      {
        specialty: params.specialty,
        metadata: params.metadata,
        recurrence: params.recurrence
      }
    );
    this.logOperation(req, 'createSlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getAvailableSlots(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['date', 'startTime', 'capacity', 'utilization', 'slotId']);
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    const serviceResponse = await this.slotManagementService.getAvailableSlots(params, searchOptions);
    this.logOperation(req, 'getAvailableSlots', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSlots(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['date', 'startTime', 'capacity', 'status', 'createdAt']);
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    const serviceResponse = await this.slotManagementService.getSlots(params, searchOptions);
    this.logOperation(req, 'getSlots', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSlotById(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.slotManagementService.getSlotById(params.id);
    this.logOperation(req, 'getSlotById', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateSlot(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.slotManagementService.updateSlot(params.id, params);
    this.logOperation(req, 'updateSlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateSlotCapacity(req, res) {
    const params = this.extractParams(req, ['id', 'newCapacity', 'reason', 'updatedBy']);
    
    const serviceResponse = await this.slotManagementService.updateSlotCapacity(params.id, params.newCapacity, {
      reason: params.reason,
      updatedBy: params.updatedBy,
      handleExistingTokens: params.handleExistingTokens,
      notifyAffectedPatients: params.notifyAffectedPatients
    });
    this.logOperation(req, 'updateSlotCapacity', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateSlotStatus(req, res) {
    const params = this.extractParams(req, ['id', 'status', 'reason', 'updatedBy']);
    
    const serviceResponse = await this.slotManagementService.updateSlotStatus(params.id, params.status, {
      reason: params.reason,
      updatedBy: params.updatedBy,
      handleExistingTokens: params.handleExistingTokens,
      notifyAffectedPatients: params.notifyAffectedPatients,
      effectiveDate: params.effectiveDate
    });
    this.logOperation(req, 'updateSlotStatus', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async deleteSlot(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.slotManagementService.deleteSlot(params.id, {
      reason: params.reason,
      deletedBy: params.deletedBy,
      handleExistingTokens: params.handleExistingTokens || 'reallocate',
      notifyAffectedPatients: params.notifyAffectedPatients !== false
    });
    this.logOperation(req, 'deleteSlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async bulkCreateSlots(req, res) {
    const params = this.extractParams(req, ['doctorId', 'dateRange', 'timeSlots', 'daysOfWeek', 'createdBy']);
    
    const serviceResponse = await this.slotManagementService.bulkCreateSlots(params);
    this.logOperation(req, 'bulkCreateSlots', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async cloneSlot(req, res) {
    const params = this.extractParams(req, ['id', 'targetDates', 'createdBy']);
    
    const serviceResponse = await this.slotManagementService.cloneSlot(params.id, params.targetDates, {
      modifications: params.modifications,
      createdBy: params.createdBy
    });
    this.logOperation(req, 'cloneSlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getSlotStatistics(req, res) {
    const params = this.extractParams(req);
    
    const serviceResponse = await this.slotManagementService.getSlotStatistics(params);
    this.logOperation(req, 'getSlotStatistics', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSlotAllocationStatus(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.slotManagementService.getSlotAllocationStatus(params.id);
    this.logOperation(req, 'getSlotAllocationStatus', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSlotsByDoctor(req, res) {
    const params = this.extractParams(req, ['doctorId']);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['date', 'startTime', 'status']);
    
    const searchOptions = {
      ...pagination,
      sort,
      date: params.date,
      dateRange: params.dateRange,
      status: params.status,
      includeFullyBooked: params.includeFullyBooked
    };
    
    const serviceResponse = await this.slotManagementService.getSlotsByDoctor(params.doctorId, searchOptions);
    this.logOperation(req, 'getSlotsByDoctor', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSlotUtilization(req, res) {
    const params = this.extractParams(req);
    
    const serviceResponse = await this.slotManagementService.getSlotUtilization(params);
    this.logOperation(req, 'getSlotUtilization', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }
}

module.exports = SlotController;