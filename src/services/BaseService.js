const logger = require('../config/logger');
const { ErrorHandler, AppError, ErrorFactory } = require('../utils/errors');

class BaseService {
  constructor({ logger: serviceLogger }) {
    this.logger = serviceLogger || logger;
  }

  validateRequired(params, requiredFields) {
    const missing = requiredFields.filter(field => 
      params[field] === undefined || params[field] === null
    );

    if (missing.length > 0) {
      const error = new Error(`Missing required parameters: ${missing.join(', ')}`);
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
  }

  
  createSuccessResponse(data, message = 'Operation completed successfully') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  createErrorResponse(code, message, details = null, suggestions = []) {
    return {
      success: false,
      error: {
        code,
        message,
        details,
        suggestions,
        timestamp: new Date().toISOString()
      },
      data: details
    };
  }

  
  handleError(error, operation) {
    this.logger.error(`Error in ${operation}:`, error);

    const normalizedError = ErrorHandler.normalize(error);
    return normalizedError.toJSON();
  }

  
  logOperation(operation, params = {}, result = null) {
    const logData = {
      operation,
      params: this.sanitizeLogData(params),
      success: result ? result.success : false,
      timestamp: new Date().toISOString()
    };

    if (result && result.success) {
      this.logger.info(`Service operation completed: ${operation}`, logData);
    } else {
      this.logger.warn(`Service operation failed: ${operation}`, logData);
    }
  }

  
  sanitizeLogData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = { ...data };

    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  
  validateBusinessRule(validationFn, errorMessage, errorCode = 'BUSINESS_RULE_VIOLATION') {
    if (!validationFn()) {
      const error = new Error(errorMessage);
      error.code = errorCode;
      error.status = 400;
      throw error;
    }
  }

  
  async executeOperation(operationName, operationFn, params = {}) {
    try {
      this.logger.debug(`Starting operation: ${operationName}`, this.sanitizeLogData(params));
      
      const result = await operationFn();
      
      this.logOperation(operationName, params, result);
      return result;
      
    } catch (error) {
      const errorResponse = this.handleError(error, operationName);
      this.logOperation(operationName, params, errorResponse);
      return errorResponse;
    }
  }
}

module.exports = BaseService;