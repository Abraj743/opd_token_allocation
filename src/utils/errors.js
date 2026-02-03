
const ERROR_CATEGORIES = {
  VALIDATION: 'VALIDATION',
  BUSINESS_LOGIC: 'BUSINESS_LOGIC',
  SYSTEM: 'SYSTEM',
  CONCURRENCY: 'CONCURRENCY',
  EXTERNAL: 'EXTERNAL'
};

const ERROR_CODES = {
  // Validation Errors (400)
  VALIDATION_ERROR: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 400,
    message: 'Input validation failed'
  },
  INVALID_ID: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 400,
    message: 'Invalid ID format provided'
  },
  MISSING_REQUIRED_FIELDS: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 400,
    message: 'Required fields are missing'
  },
  INVALID_DATE_RANGE: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 400,
    message: 'Invalid date range provided'
  },
  INVALID_DATA_TYPE: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 400,
    message: 'Invalid data type provided'
  },
  
  // Business Logic Errors (400-409)
  SLOT_CAPACITY_EXCEEDED: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'The requested time slot has reached maximum capacity'
  },
  INVALID_PRIORITY: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 400,
    message: 'Invalid priority level specified'
  },
  SCHEDULING_CONFLICT: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'Scheduling conflict detected'
  },
  TOKEN_ALREADY_ALLOCATED: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'Token has already been allocated'
  },
  PATIENT_NOT_ELIGIBLE: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 400,
    message: 'Patient is not eligible for this operation'
  },
  SLOT_NOT_AVAILABLE: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'The requested time slot is not available'
  },
  REALLOCATION_FAILED: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'Token reallocation failed'
  },
  TOKEN_NOT_FOUND: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 404,
    message: 'Token not found'
  },
  SLOT_NOT_FOUND: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 404,
    message: 'Time slot not found'
  },
  TOKEN_ALREADY_PROCESSED: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 409,
    message: 'Token has already been processed'
  },
  INVALID_TOKEN_STATUS: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 400,
    message: 'Invalid token status for this operation'
  },
  TOKEN_CANNOT_RESCHEDULE: {
    category: ERROR_CATEGORIES.BUSINESS_LOGIC,
    httpStatus: 400,
    message: 'Token cannot be rescheduled in its current state'
  },
  DUPLICATE_KEY_ERROR: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 409,
    message: 'Duplicate key error - record already exists'
  },
  
  // System Errors (500)
  DATABASE_CONNECTION_ERROR: {
    category: ERROR_CATEGORIES.SYSTEM,
    httpStatus: 500,
    message: 'Database connection failed'
  },
  DATABASE_OPERATION_ERROR: {
    category: ERROR_CATEGORIES.SYSTEM,
    httpStatus: 500,
    message: 'Database operation failed'
  },
  CONFIGURATION_ERROR: {
    category: ERROR_CATEGORIES.SYSTEM,
    httpStatus: 500,
    message: 'System configuration error'
  },
  INTERNAL_SERVER_ERROR: {
    category: ERROR_CATEGORIES.SYSTEM,
    httpStatus: 500,
    message: 'An internal server error occurred'
  },
  SERVICE_UNAVAILABLE: {
    category: ERROR_CATEGORIES.SYSTEM,
    httpStatus: 503,
    message: 'Service temporarily unavailable'
  },
  
  // Concurrency Errors (409)
  CONCURRENT_MODIFICATION: {
    category: ERROR_CATEGORIES.CONCURRENCY,
    httpStatus: 409,
    message: 'Resource was modified by another operation'
  },
  DEADLOCK_DETECTED: {
    category: ERROR_CATEGORIES.CONCURRENCY,
    httpStatus: 409,
    message: 'Deadlock detected, operation aborted'
  },
  RACE_CONDITION: {
    category: ERROR_CATEGORIES.CONCURRENCY,
    httpStatus: 409,
    message: 'Race condition detected'
  },
  
  // External Service Errors (502-504)
  EXTERNAL_SERVICE_ERROR: {
    category: ERROR_CATEGORIES.EXTERNAL,
    httpStatus: 502,
    message: 'External service error'
  },
  EXTERNAL_SERVICE_TIMEOUT: {
    category: ERROR_CATEGORIES.EXTERNAL,
    httpStatus: 504,
    message: 'External service timeout'
  },
  
  // Resource Errors (404)
  PATIENT_NOT_FOUND: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 404,
    message: 'Patient not found'
  },
  TOKEN_NOT_FOUND: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 404,
    message: 'Token not found'
  },
  SLOT_NOT_FOUND: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 404,
    message: 'Time slot not found'
  },
  DOCTOR_NOT_FOUND: {
    category: ERROR_CATEGORIES.VALIDATION,
    httpStatus: 404,
    message: 'Doctor not found'
  }
};


class AppError extends Error {
  constructor(code, message = null, details = null, suggestions = []) {
    const errorConfig = ERROR_CODES[code];
    
    if (!errorConfig) {
      throw new Error(`Unknown error code: ${code}`);
    }
    
    super(message || errorConfig.message);
    
    this.name = 'AppError';
    this.code = code;
    this.category = errorConfig.category;
    this.httpStatus = errorConfig.httpStatus;
    this.details = details;
    this.suggestions = suggestions;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, AppError);
  }
  
  
  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        category: this.category,
        message: this.message,
        details: this.details,
        suggestions: this.suggestions,
        timestamp: this.timestamp
      }
    };
  }
  
  isRetryable() {
    const retryableCategories = [ERROR_CATEGORIES.SYSTEM, ERROR_CATEGORIES.EXTERNAL];
    const retryableCodes = ['CONCURRENT_MODIFICATION', 'DEADLOCK_DETECTED'];
    
    return retryableCategories.includes(this.category) || retryableCodes.includes(this.code);
  }
}


class ErrorFactory {
  
  static validation(message, details = null, suggestions = []) {
    return new AppError('VALIDATION_ERROR', message, details, suggestions);
  }
  
  
  static slotCapacityExceeded(slotId, currentCapacity, maxCapacity, alternativeSlots = []) {
    const details = {
      slotId,
      currentCapacity,
      maxCapacity
    };
    
    const suggestions = alternativeSlots.map(slot => ({
      action: 'reschedule',
      slotId: slot.slotId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      availableCapacity: slot.availableCapacity,
      doctorName: slot.doctorName
    }));
    
    return new AppError('SLOT_CAPACITY_EXCEEDED', null, details, suggestions);
  }
  
  
  static patientNotFound(patientId, suggestions = []) {
    const details = { patientId };
    const defaultSuggestions = [
      {
        action: 'register',
        description: 'Register as a new patient',
        endpoint: '/api/patients'
      },
      {
        action: 'search',
        description: 'Search by phone number or email',
        endpoint: '/api/patients/search'
      }
    ];
    
    return new AppError('PATIENT_NOT_FOUND', null, details, suggestions.length > 0 ? suggestions : defaultSuggestions);
  }
  
  
  static tokenNotFound(tokenId) {
    const details = { tokenId };
    const suggestions = [
      {
        action: 'create',
        description: 'Create a new token allocation',
        endpoint: '/api/tokens'
      }
    ];
    
    return new AppError('TOKEN_NOT_FOUND', null, details, suggestions);
  }
  
 
  static schedulingConflict(conflictDetails, alternativeSlots = []) {
    const suggestions = alternativeSlots.map(slot => ({
      action: 'reschedule',
      slotId: slot.slotId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      doctorName: slot.doctorName,
      availableCapacity: slot.availableCapacity
    }));
    
    return new AppError('SCHEDULING_CONFLICT', null, conflictDetails, suggestions);
  }
  
  
  static databaseError(originalError) {
    const details = {
      operation: 'database_operation',
      originalError: originalError ? originalError.message : 'Unknown database error'
    };
    
    return new AppError('DATABASE_OPERATION_ERROR', null, details);
  }
  
  
  static concurrentModification(resourceType, resourceId) {
    const details = {
      resourceType,
      resourceId,
      reason: 'Resource was modified by another operation'
    };
    
    const suggestions = [
      {
        action: 'retry',
        description: 'Retry the operation with fresh data',
        delay: '1-2 seconds'
      },
      {
        action: 'refresh',
        description: 'Refresh the resource and try again'
      }
    ];
    
    return new AppError('CONCURRENT_MODIFICATION', null, details, suggestions);
  }
  
  
  static externalServiceError(serviceName, operation, originalError) {
    const details = {
      serviceName,
      operation,
      originalError: originalError.message
    };
    
    const suggestions = [
      {
        action: 'retry',
        description: 'Retry the operation after a short delay'
      },
      {
        action: 'fallback',
        description: 'Use alternative service if available'
      }
    ];
    
    return new AppError('EXTERNAL_SERVICE_ERROR', null, details, suggestions);
  }
}


class ErrorHandler {
  
  static normalize(error) {
    if (error instanceof AppError) {
      return error;
    }
    
    // Handle errors with explicit codes first
    if (error.code && ERROR_CODES[error.code]) {
      return new AppError(error.code, error.message, error.details || null, error.suggestions || []);
    }
    
    // Handle MongoDB/Mongoose errors
    if (error.name === 'ValidationError') {
      return ErrorFactory.validation('Data validation failed', error.errors);
    }
    
    if (error.name === 'CastError') {
      return new AppError('INVALID_ID', 'Invalid ID format provided', {
        field: error.path,
        value: error.value
      });
    }
    
    if (error.code === 11000) {
      return new AppError('TOKEN_ALREADY_ALLOCATED', 'Duplicate key error', error.keyPattern);
    }
    
    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('timed out')) {
      return new AppError('EXTERNAL_SERVICE_TIMEOUT');
    }
    
    // Handle connection errors
    if (error.code === 'ECONNREFUSED' || error.message.includes('connection')) {
      return new AppError('DATABASE_CONNECTION_ERROR');
    }
    
    // Generic error
    return new AppError('INTERNAL_SERVER_ERROR', error.message, {
      originalError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  
  
  static getLogLevel(error) {
    if (error instanceof AppError) {
      if (error.category === ERROR_CATEGORIES.VALIDATION) {
        return 'warn';
      }
      if (error.category === ERROR_CATEGORIES.BUSINESS_LOGIC) {
        return 'warn';
      }
      return 'error';
    }
    return 'error';
  }
  
  
  static createHttpResponse(error, requestId = null) {
    const normalizedError = ErrorHandler.normalize(error);
    const response = normalizedError.toJSON();
    
    if (requestId) {
      response.requestId = requestId;
    }
    
    return {
      statusCode: normalizedError.httpStatus,
      body: response
    };
  }
}

module.exports = {
  ERROR_CATEGORIES,
  ERROR_CODES,
  AppError,
  ErrorFactory,
  ErrorHandler
};