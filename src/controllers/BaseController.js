const logger = require('../config/logger');
const { ErrorHandler, AppError, ErrorFactory } = require('../utils/errors');


class BaseController {
  constructor({ logger: controllerLogger }) {
    this.logger = controllerLogger || logger;
  }

  sendSuccess(res, data, message = 'Operation completed successfully', statusCode = 200) {
    const response = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    res.status(statusCode).json(response);
  }

  
  sendError(res, code, message, statusCode = 500, details = null, suggestions = []) {
    const response = {
      success: false,
      error: {
        code,
        message,
        details,
        suggestions,
        timestamp: new Date().toISOString()
      }
    };

    res.status(statusCode).json(response);
  }

  
  handleServiceResponse(res, serviceResponse, successStatusCode = 200) {
    if (serviceResponse.success) {
      this.sendSuccess(
        res,
        serviceResponse.data,
        serviceResponse.message,
        successStatusCode
      );
    } else {
      const error = serviceResponse.error;
      const httpResponse = ErrorHandler.createHttpResponse(error, res.get('X-Request-ID'));
      
      res.status(httpResponse.statusCode).json(httpResponse.body);
    }
  }

 
  getHttpStatusFromErrorCode(errorCode) {
    const statusMap = {
      'VALIDATION_ERROR': 400,
      'INVALID_ID': 400,
      'NOT_FOUND': 404,
      'DUPLICATE_KEY': 409,
      'BUSINESS_RULE_VIOLATION': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'CONFLICT': 409,
      'INTERNAL_ERROR': 500
    };

    return statusMap[errorCode] || 500;
  }

  
  extractParams(req, requiredParams = []) {
    const params = {
      ...req.params,
      ...req.query,
      ...req.body
    };

    const missing = requiredParams.filter(param => 
      params[param] === undefined || params[param] === null
    );

    if (missing.length > 0) {
      const error = new Error(`Missing required parameters: ${missing.join(', ')}`);
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }

    return params;
  }

  
  wrapAsync(controllerMethod) {
    return async (req, res, next) => {
      try {
        await controllerMethod.call(this, req, res, next);
      } catch (error) {
        this.logger.error('Controller error:', error);
        
        const normalizedError = ErrorHandler.normalize(error);
        const httpResponse = ErrorHandler.createHttpResponse(normalizedError, req.id);
        
        res.status(httpResponse.statusCode).json(httpResponse.body);
      }
    };
  }

  logOperation(req, operation, result = null) {
    const logData = {
      operation,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      success: result ? result.success : false,
      timestamp: new Date().toISOString()
    };

    if (result && result.success) {
      this.logger.info(`Controller operation completed: ${operation}`, logData);
    } else {
      this.logger.warn(`Controller operation failed: ${operation}`, logData);
    }
  }

  validatePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  validateSort(query, allowedFields = []) {
    const sortBy = query.sortBy;
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

    if (sortBy && allowedFields.length > 0 && !allowedFields.includes(sortBy)) {
      const error = new Error(`Invalid sort field. Allowed fields: ${allowedFields.join(', ')}`);
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }

    return sortBy ? { [sortBy]: sortOrder } : {};
  }

  
  createPaginationMeta(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    
    return {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }
}

module.exports = BaseController;