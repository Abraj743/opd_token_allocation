const logger = require('../config/logger');
const { globalAuditLogger, AUDIT_EVENT_TYPES, AUDIT_SEVERITY } = require('../utils/auditLogger');
const crypto = require('crypto');

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


class LoggingMiddleware {
  
  static requestLogger(req, res, next) {
    req.id = req.headers['x-request-id'] || uuidv4();
    
    
    res.setHeader('X-Request-ID', req.id);
    
    
    const startTime = Date.now();
    
    logger.info('Request started', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
    
    const originalJson = res.json;
    res.json = function(body) {
      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(body).length,
        success: body?.success !== false,
        timestamp: new Date().toISOString()
      });
      
      
      if (body?.success === false) {
        logger.warn('Request failed', {
          requestId: req.id,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          errorCode: body.error?.code,
          errorMessage: body.error?.message,
          duration: `${duration}ms`
        });
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  }
  
  
  static errorLogger(err, req, res, next) {
    const errorId = uuidv4();
    
    
    logger.error('Unhandled error occurred', {
      errorId,
      requestId: req.id,
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || 500,
      timestamp: new Date().toISOString()
    });
    
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const errorResponse = {
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message: isDevelopment ? err.message : 'An internal server error occurred',
        ...(isDevelopment && { stack: err.stack }),
        errorId
      },
      timestamp: new Date().toISOString(),
      requestId: req.id
    };
    
    res.status(err.statusCode || 500).json(errorResponse);
  }
  
 
  static auditLogger(operation, resourceType) {
    return (req, res, next) => {
      
      req.auditInfo = {
        operation,
        resourceType,
        timestamp: new Date().toISOString(),
        userId: req.user?.id,
        userRole: req.user?.role,
        requestId: req.id,
        correlationId: globalAuditLogger.generateCorrelationId(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.session?.id
      };
      
      
      const originalJson = res.json;
      res.json = function(body) {
        
        const outcome = body?.success !== false ? 'SUCCESS' : 'FAILURE';
        const severity = outcome === 'FAILURE' ? AUDIT_SEVERITY.HIGH : AUDIT_SEVERITY.MEDIUM;
        
        
        globalAuditLogger.log(
          operation.toUpperCase().replace(' ', '_'),
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            resourceId: body?.data?.id || body?.id,
            responseSize: JSON.stringify(body).length,
            ...(body?.error && { 
              errorCode: body.error.code, 
              errorMessage: body.error.message 
            })
          },
          {
            ...req.auditInfo,
            outcome,
            severity,
            resourceType,
            resourceId: body?.data?.id || body?.id
          }
        );
        
        
        if (body?.success !== false) {
          logger.info('Audit log', {
            ...req.auditInfo,
            statusCode: res.statusCode,
            resourceId: body?.data?.id || body?.id,
            success: true
          });
        } else {
          logger.warn('Audit log - Operation failed', {
            ...req.auditInfo,
            statusCode: res.statusCode,
            errorCode: body.error?.code,
            errorMessage: body.error?.message,
            success: false
          });
        }
        
        return originalJson.call(this, body);
      };
      
      next();
    };
  }
  
  
  static performanceMonitor(slowThreshold = 1000) {
    return (req, res, next) => {
      const startTime = Date.now();
      
      
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        
        if (duration > slowThreshold) {
          logger.warn('Slow request detected', {
            requestId: req.id,
            method: req.method,
            path: req.path,
            duration: `${duration}ms`,
            threshold: `${slowThreshold}ms`,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString()
          });
        }
        
       
        logger.debug('Performance metrics', {
          requestId: req.id,
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          statusCode: res.statusCode,
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        });
        
        return originalEnd.apply(this, args);
      };
      
      next();
    };
  }
}

module.exports = LoggingMiddleware;