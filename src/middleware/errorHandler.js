

const logger = require('../config/logger');
const { ErrorHandler, AppError, ERROR_CATEGORIES } = require('../utils/errors');


class ErrorHandlingMiddleware {
  
  static globalErrorHandler(err, req, res, next) {
    const errorId = req.id ? `${req.id}-error` : `error-${Date.now()}`;
    
    
    const normalizedError = ErrorHandler.normalize(err);
    
   
    const logLevel = ErrorHandler.getLogLevel(normalizedError);
    
    
    const logData = {
      errorId,
      requestId: req.id,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: {
        code: normalizedError.code,
        category: normalizedError.category,
        message: normalizedError.message,
        details: normalizedError.details
      },
      stack: normalizedError.stack,
      timestamp: normalizedError.timestamp
    };
    
    if (logLevel === 'error') {
      logger.error('Unhandled error occurred', logData);
    } else {
      logger.warn('Request error occurred', logData);
    }
    
    
    const response = normalizedError.toJSON();
    response.errorId = errorId;
    response.requestId = req.id;
    
    
    if (process.env.NODE_ENV === 'production') {
      delete response.error.details?.stack;
      delete response.error.details?.originalError;
    }
    
    res.status(normalizedError.httpStatus).json(response);
  }
  
 
  static asyncErrorHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
  
  
  static validationErrorHandler(err, req, res, next) {
    if (err.isJoi) {
      const validationError = new AppError(
        'VALIDATION_ERROR',
        'Request validation failed',
        {
          validationErrors: err.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }))
        },
        [{
          action: 'fix_validation',
          description: 'Correct the validation errors and retry',
          fields: err.details.map(detail => detail.path.join('.'))
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(validationError, req, res, next);
    }
    
    next(err);
  }
  
  
  static databaseErrorHandler(err, req, res, next) {
    
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
      const value = err.keyValue?.[field] || 'unknown';
      
      const duplicateError = new AppError(
        'TOKEN_ALREADY_ALLOCATED',
        `Duplicate value for ${field}`,
        {
          field,
          value,
          collection: err.collection?.collectionName
        },
        [{
          action: 'use_different_value',
          description: `Use a different value for ${field}`,
          field
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(duplicateError, req, res, next);
    }
    
    
    if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
      const connectionError = new AppError(
        'DATABASE_CONNECTION_ERROR',
        'Database connection failed',
        {
          errorName: err.name,
          errorMessage: err.message
        },
        [{
          action: 'retry',
          description: 'Retry the operation after a short delay'
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(connectionError, req, res, next);
    }
    
    
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(error => ({
        field: error.path,
        message: error.message,
        value: error.value,
        kind: error.kind
      }));
      
      const mongooseError = new AppError(
        'VALIDATION_ERROR',
        'Database validation failed',
        { validationErrors },
        [{
          action: 'fix_validation',
          description: 'Correct the validation errors and retry',
          fields: validationErrors.map(e => e.field)
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(mongooseError, req, res, next);
    }
    
    
    if (err.name === 'CastError') {
      const castError = new AppError(
        'INVALID_ID',
        `Invalid ${err.kind} for field ${err.path}`,
        {
          field: err.path,
          value: err.value,
          expectedType: err.kind
        },
        [{
          action: 'fix_format',
          description: `Provide a valid ${err.kind} for ${err.path}`,
          field: err.path,
          expectedFormat: err.kind === 'ObjectId' ? '24-character hex string' : err.kind
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(castError, req, res, next);
    }
    
    next(err);
  }
  
  
  static rateLimitErrorHandler(err, req, res, next) {
    if (err.status === 429) {
      const rateLimitError = new AppError(
        'SERVICE_UNAVAILABLE',
        'Too many requests',
        {
          limit: err.limit,
          current: err.current,
          remaining: err.remaining,
          resetTime: err.resetTime
        },
        [{
          action: 'wait_and_retry',
          description: `Wait ${Math.ceil(err.resetTime / 1000)} seconds before retrying`,
          waitTime: err.resetTime
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(rateLimitError, req, res, next);
    }
    
    next(err);
  }
  
 
  static notFoundHandler(req, res, next) {
    const notFoundError = new AppError(
      'SLOT_NOT_FOUND',
      `Endpoint not found: ${req.method} ${req.path}`,
      {
        method: req.method,
        path: req.path,
        availableEndpoints: [
          'GET /api/patients',
          'POST /api/patients',
          'GET /api/tokens',
          'POST /api/tokens',
          'GET /api/slots',
          'POST /api/slots',
          'GET /api/status'
        ]
      },
      [{
        action: 'check_endpoint',
        description: 'Verify the endpoint URL and HTTP method',
        documentation: '/api/docs'
      }]
    );
    
    ErrorHandlingMiddleware.globalErrorHandler(notFoundError, req, res, next);
  }
  
  
  static timeoutHandler(timeout = 30000) {
    return (req, res, next) => {
      const timeoutId = setTimeout(() => {
        if (!res.headersSent) {
          const timeoutError = new AppError(
            'EXTERNAL_SERVICE_TIMEOUT',
            `Request timeout after ${timeout}ms`,
            {
              timeout,
              method: req.method,
              path: req.path
            },
            [{
              action: 'retry',
              description: 'Retry with a simpler request or increase timeout'
            }]
          );
          
          ErrorHandlingMiddleware.globalErrorHandler(timeoutError, req, res, next);
        }
      }, timeout);
      
      
      res.on('finish', () => {
        clearTimeout(timeoutId);
      });
      
      next();
    };
  }
  
  
  static securityErrorHandler(err, req, res, next) {
    if (err.status === 401) {
      const authError = new AppError(
        'UNAUTHORIZED',
        'Authentication required',
        {
          path: req.path,
          method: req.method
        },
        [{
          action: 'authenticate',
          description: 'Provide valid authentication credentials',
          header: 'Authorization'
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(authError, req, res, next);
    }
    
    if (err.status === 403) {
      const forbiddenError = new AppError(
        'FORBIDDEN',
        'Insufficient permissions',
        {
          path: req.path,
          method: req.method,
          requiredRole: err.requiredRole
        },
        [{
          action: 'check_permissions',
          description: 'Contact administrator for required permissions'
        }]
      );
      
      return ErrorHandlingMiddleware.globalErrorHandler(forbiddenError, req, res, next);
    }
    
    next(err);
  }
  
  
  static healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      errorCategories: Object.keys(ERROR_CATEGORIES),
      features: [
        'structured_errors',
        'error_suggestions',
        'audit_logging',
        'error_categorization'
      ]
    };
  }
}

module.exports = ErrorHandlingMiddleware;