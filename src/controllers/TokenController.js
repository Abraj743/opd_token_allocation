const BaseController = require('./BaseController');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const TokenSchemas = require('../middleware/schemas/tokenSchemas');


class TokenController extends BaseController {
  constructor({ tokenAllocationService, logger }) {
    super({ logger });
    this.tokenAllocationService = tokenAllocationService;
  }

  
  async createToken(req, res) {
    const params = this.extractParams(req);
    
    const serviceResponse = await this.tokenAllocationService.allocateToken(params);
    this.logOperation(req, 'createToken', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getTokenById(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.tokenAllocationService.getTokenById(params.id);
    this.logOperation(req, 'getTokenById', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateToken(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.tokenAllocationService.updateToken(params.id, params);
    this.logOperation(req, 'updateToken', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async cancelToken(req, res) {
    const params = this.extractParams(req, ['id', 'reason', 'cancelledBy']);
    
    const serviceResponse = await this.tokenAllocationService.cancelToken(params.id, {
      reason: params.reason,
      notes: params.notes,
      cancelledBy: params.cancelledBy,
      refundRequired: params.refundRequired,
      notifyPatient: params.notifyPatient
    });
    this.logOperation(req, 'cancelToken', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getTokens(req, res) {
    const allParams = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['createdAt', 'priority', 'tokenNumber', 'status']);
    
    const paginationKeys = ['page', 'limit', 'sortBy', 'sortOrder', 'sort'];
    const searchCriteria = {};
    
    Object.keys(allParams).forEach(key => {
      if (!paginationKeys.includes(key)) {
        searchCriteria[key] = allParams[key];
      }
    });
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    console.log('🔍 Token search - Criteria:', JSON.stringify(searchCriteria, null, 2));
    console.log('🔍 Token search - Options:', JSON.stringify(searchOptions, null, 2));
    
    const serviceResponse = await this.tokenAllocationService.getTokens(searchCriteria, searchOptions);
    
    console.log('✅ Token search result:', serviceResponse.data.totalCount, 'tokens found');
    
    this.logOperation(req, 'getTokens', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async handleEmergencyInsertion(req, res) {
    const params = this.extractParams(req);
    
    const serviceResponse = await this.tokenAllocationService.handleEmergencyInsertion(params);
    this.logOperation(req, 'handleEmergencyInsertion', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async reallocateTokens(req, res) {
    const params = this.extractParams(req, ['criteria', 'reason', 'requestedBy']);
    
    const serviceResponse = await this.tokenAllocationService.reallocateTokens(params);
    this.logOperation(req, 'reallocateTokens', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getTokenStatistics(req, res) {
    const params = this.extractParams(req);
    
    const serviceResponse = await this.tokenAllocationService.getTokenStatistics(params);
    this.logOperation(req, 'getTokenStatistics', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getWaitingList(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['priority', 'createdAt', 'waitingTime']);
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    const serviceResponse = await this.tokenAllocationService.getWaitingList(params, searchOptions);
    this.logOperation(req, 'getWaitingList', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async batchUpdateTokens(req, res) {
    const params = this.extractParams(req, ['tokenIds', 'updates', 'reason', 'requestedBy']);
    
    const serviceResponse = await this.tokenAllocationService.batchUpdateTokens(params);
    this.logOperation(req, 'batchUpdateTokens', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getTokensBySlot(req, res) {
    const params = this.extractParams(req, ['slotId']);
    const pagination = this.validatePagination(req.query);
    const sort = this.validateSort(req.query, ['tokenNumber', 'priority', 'createdAt']);
    
    const searchOptions = {
      ...pagination,
      sort
    };
    
    const serviceResponse = await this.tokenAllocationService.getTokensBySlot(params.slotId, searchOptions);
    this.logOperation(req, 'getTokensBySlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async moveTokenToSlot(req, res) {
    const params = this.extractParams(req, ['id', 'slotId']);
    
    const serviceResponse = await this.tokenAllocationService.moveTokenToSlot(params.id, params.slotId, {
      reason: params.reason,
      requestedBy: params.requestedBy
    });
    this.logOperation(req, 'moveTokenToSlot', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async confirmToken(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.tokenAllocationService.confirmToken(params.id, {
      confirmedBy: params.confirmedBy,
      checkInTime: new Date(),
      notes: params.notes
    });
    this.logOperation(req, 'confirmToken', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async completeToken(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.tokenAllocationService.completeToken(params.id, {
      completedBy: params.completedBy,
      completionTime: new Date(),
      notes: params.notes,
      followupRequired: params.followupRequired,
      followupDate: params.followupDate
    });
    this.logOperation(req, 'completeToken', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async markNoShow(req, res) {
    const params = this.extractParams(req, ['id']);
    
    const serviceResponse = await this.tokenAllocationService.markNoShow(params.id, {
      markedBy: params.markedBy,
      reason: params.reason,
      notes: params.notes
    });
    this.logOperation(req, 'markNoShow', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }
}

module.exports = TokenController;