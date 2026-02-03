

const logger = require('../config/logger');
const crypto = require('crypto');

const AUDIT_EVENT_TYPES = {
  // Patient operations
  PATIENT_CREATED: 'PATIENT_CREATED',
  PATIENT_UPDATED: 'PATIENT_UPDATED',
  PATIENT_VIEWED: 'PATIENT_VIEWED',
  PATIENT_DELETED: 'PATIENT_DELETED',
  
  // Token operations
  TOKEN_ALLOCATED: 'TOKEN_ALLOCATED',
  TOKEN_CANCELLED: 'TOKEN_CANCELLED',
  TOKEN_COMPLETED: 'TOKEN_COMPLETED',
  TOKEN_NO_SHOW: 'TOKEN_NO_SHOW',
  TOKEN_REALLOCATED: 'TOKEN_REALLOCATED',
  TOKEN_PREEMPTED: 'TOKEN_PREEMPTED',
  
  // Slot operations
  SLOT_CREATED: 'SLOT_CREATED',
  SLOT_UPDATED: 'SLOT_UPDATED',
  SLOT_CAPACITY_CHANGED: 'SLOT_CAPACITY_CHANGED',
  SLOT_DELETED: 'SLOT_DELETED',
  
  // Emergency operations
  EMERGENCY_INSERTION: 'EMERGENCY_INSERTION',
  EMERGENCY_PREEMPTION: 'EMERGENCY_PREEMPTION',
  
  // System operations
  SYSTEM_STARTUP: 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN: 'SYSTEM_SHUTDOWN',
  CONFIGURATION_CHANGED: 'CONFIGURATION_CHANGED',
  
  // Security operations
  AUTHENTICATION_SUCCESS: 'AUTHENTICATION_SUCCESS',
  AUTHENTICATION_FAILURE: 'AUTHENTICATION_FAILURE',
  AUTHORIZATION_FAILURE: 'AUTHORIZATION_FAILURE',
  
  // Error operations
  ALLOCATION_FAILED: 'ALLOCATION_FAILED',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION'
};


const AUDIT_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class AuditLogger {
  constructor() {
    this.correlationMap = new Map(); // Track correlation IDs
  }
  
 
  generateCorrelationId() {
    return crypto.randomUUID();
  }
  
  log(eventType, details = {}, options = {}) {
    const {
      userId = null,
      userRole = null,
      requestId = null,
      correlationId = null,
      severity = AUDIT_SEVERITY.MEDIUM,
      resourceType = null,
      resourceId = null,
      ipAddress = null,
      userAgent = null,
      sessionId = null,
      outcome = 'SUCCESS',
      errorCode = null,
      errorMessage = null,
      metadata = {}
    } = options;
    
    const auditEntry = {
      // Core audit fields
      eventType,
      timestamp: new Date().toISOString(),
      severity,
      outcome,
      
      // User context
      userId,
      userRole,
      sessionId,
      
      // Request context
      requestId,
      correlationId: correlationId || this.generateCorrelationId(),
      ipAddress,
      userAgent,
      
      // Resource context
      resourceType,
      resourceId,
      
      // Operation details
      details: this.sanitizeDetails(details),
      
      // Error information (if applicable)
      ...(errorCode && { errorCode }),
      ...(errorMessage && { errorMessage }),
      
      // Additional metadata
      metadata: this.sanitizeMetadata(metadata),
      
      // System context
      nodeId: process.env.NODE_ID || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0'
    };
    
    // Log with appropriate level based on severity and outcome
    const logLevel = this.getLogLevel(severity, outcome);
    
    logger[logLevel]('Audit Log', auditEntry);
    
    // Store correlation ID for future reference
    if (auditEntry.correlationId) {
      this.correlationMap.set(auditEntry.correlationId, {
        eventType,
        timestamp: auditEntry.timestamp,
        resourceType,
        resourceId
      });
    }
    
    return auditEntry.correlationId;
  }
  
  
  logPatientOperation(operation, patientData, options = {}) {
    const eventTypeMap = {
      'create': AUDIT_EVENT_TYPES.PATIENT_CREATED,
      'update': AUDIT_EVENT_TYPES.PATIENT_UPDATED,
      'view': AUDIT_EVENT_TYPES.PATIENT_VIEWED,
      'delete': AUDIT_EVENT_TYPES.PATIENT_DELETED
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown patient operation: ${operation}`);
    }
    
    const details = {
      operation,
      patientId: patientData.patientId || patientData._id,
      name: patientData.personalInfo?.name,
      phoneNumber: patientData.personalInfo?.phoneNumber,
      ...(operation === 'update' && { 
        updatedFields: Object.keys(patientData.updatedFields || {})
      })
    };
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'Patient',
      resourceId: patientData.patientId || patientData._id,
      severity: operation === 'delete' ? AUDIT_SEVERITY.HIGH : AUDIT_SEVERITY.MEDIUM
    });
  }
  
  
  logTokenOperation(operation, tokenData, options = {}) {
    const eventTypeMap = {
      'allocate': AUDIT_EVENT_TYPES.TOKEN_ALLOCATED,
      'cancel': AUDIT_EVENT_TYPES.TOKEN_CANCELLED,
      'complete': AUDIT_EVENT_TYPES.TOKEN_COMPLETED,
      'no_show': AUDIT_EVENT_TYPES.TOKEN_NO_SHOW,
      'reallocate': AUDIT_EVENT_TYPES.TOKEN_REALLOCATED,
      'preempt': AUDIT_EVENT_TYPES.TOKEN_PREEMPTED
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown token operation: ${operation}`);
    }
    
    const details = {
      operation,
      tokenId: tokenData.tokenId || tokenData._id,
      patientId: tokenData.patientId,
      doctorId: tokenData.doctorId,
      slotId: tokenData.slotId,
      tokenNumber: tokenData.tokenNumber,
      source: tokenData.source,
      priority: tokenData.priority,
      status: tokenData.status,
      ...(operation === 'reallocate' && {
        originalSlotId: tokenData.originalSlotId,
        newSlotId: tokenData.slotId,
        reason: tokenData.reallocationReason
      }),
      ...(operation === 'preempt' && {
        preemptedBy: tokenData.preemptedBy,
        preemptionReason: tokenData.preemptionReason
      })
    };
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'Token',
      resourceId: tokenData.tokenId || tokenData._id,
      severity: ['cancel', 'preempt'].includes(operation) ? AUDIT_SEVERITY.HIGH : AUDIT_SEVERITY.MEDIUM
    });
  }
  
  
  logSlotOperation(operation, slotData, options = {}) {
    const eventTypeMap = {
      'create': AUDIT_EVENT_TYPES.SLOT_CREATED,
      'update': AUDIT_EVENT_TYPES.SLOT_UPDATED,
      'capacity_change': AUDIT_EVENT_TYPES.SLOT_CAPACITY_CHANGED,
      'delete': AUDIT_EVENT_TYPES.SLOT_DELETED
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown slot operation: ${operation}`);
    }
    
    const details = {
      operation,
      slotId: slotData.slotId || slotData._id,
      doctorId: slotData.doctorId,
      date: slotData.date,
      startTime: slotData.startTime,
      endTime: slotData.endTime,
      maxCapacity: slotData.maxCapacity,
      currentAllocation: slotData.currentAllocation,
      ...(operation === 'capacity_change' && {
        previousCapacity: slotData.previousCapacity,
        newCapacity: slotData.maxCapacity,
        affectedTokens: slotData.affectedTokens
      })
    };
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'TimeSlot',
      resourceId: slotData.slotId || slotData._id,
      severity: operation === 'delete' ? AUDIT_SEVERITY.HIGH : AUDIT_SEVERITY.MEDIUM
    });
  }
  
  
  logEmergencyOperation(operation, emergencyData, options = {}) {
    const eventTypeMap = {
      'insertion': AUDIT_EVENT_TYPES.EMERGENCY_INSERTION,
      'preemption': AUDIT_EVENT_TYPES.EMERGENCY_PREEMPTION
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown emergency operation: ${operation}`);
    }
    
    const details = {
      operation,
      emergencyTokenId: emergencyData.tokenId,
      patientId: emergencyData.patientId,
      doctorId: emergencyData.doctorId,
      slotId: emergencyData.slotId,
      urgencyLevel: emergencyData.urgencyLevel,
      medicalReason: emergencyData.medicalReason,
      preemptedTokens: emergencyData.preemptedTokens || [],
      reallocatedTokens: emergencyData.reallocatedTokens || []
    };
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'EmergencyToken',
      resourceId: emergencyData.tokenId,
      severity: AUDIT_SEVERITY.CRITICAL
    });
  }
  
  
  logSystemOperation(operation, details = {}, options = {}) {
    const eventTypeMap = {
      'startup': AUDIT_EVENT_TYPES.SYSTEM_STARTUP,
      'shutdown': AUDIT_EVENT_TYPES.SYSTEM_SHUTDOWN,
      'config_change': AUDIT_EVENT_TYPES.CONFIGURATION_CHANGED
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown system operation: ${operation}`);
    }
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'System',
      severity: AUDIT_SEVERITY.HIGH
    });
  }
  
  
  logSecurityOperation(operation, details = {}, options = {}) {
    const eventTypeMap = {
      'auth_success': AUDIT_EVENT_TYPES.AUTHENTICATION_SUCCESS,
      'auth_failure': AUDIT_EVENT_TYPES.AUTHENTICATION_FAILURE,
      'authz_failure': AUDIT_EVENT_TYPES.AUTHORIZATION_FAILURE
    };
    
    const eventType = eventTypeMap[operation];
    if (!eventType) {
      throw new Error(`Unknown security operation: ${operation}`);
    }
    
    return this.log(eventType, details, {
      ...options,
      resourceType: 'Security',
      severity: operation === 'auth_success' ? AUDIT_SEVERITY.LOW : AUDIT_SEVERITY.HIGH,
      outcome: operation === 'auth_success' ? 'SUCCESS' : 'FAILURE'
    });
  }
  
  
  logAllocationFailure(reason, details = {}, options = {}) {
    return this.log(AUDIT_EVENT_TYPES.ALLOCATION_FAILED, {
      reason,
      ...details
    }, {
      ...options,
      severity: AUDIT_SEVERITY.HIGH,
      outcome: 'FAILURE'
    });
  }
  
 
  logBusinessRuleViolation(rule, details = {}, options = {}) {
    return this.log(AUDIT_EVENT_TYPES.BUSINESS_RULE_VIOLATION, {
      violatedRule: rule,
      ...details
    }, {
      ...options,
      severity: AUDIT_SEVERITY.HIGH,
      outcome: 'FAILURE'
    });
  }
  
  
  getCorrelationHistory(correlationId) {
    return this.correlationMap.get(correlationId);
  }
  
 
  cleanupCorrelations(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - maxAge;
    
    for (const [correlationId, entry] of this.correlationMap.entries()) {
      if (new Date(entry.timestamp).getTime() < cutoff) {
        this.correlationMap.delete(correlationId);
      }
    }
  }
  
  
  getLogLevel(severity, outcome) {
    if (outcome === 'FAILURE') {
      return severity === AUDIT_SEVERITY.CRITICAL ? 'error' : 'warn';
    }
    
    switch (severity) {
      case AUDIT_SEVERITY.CRITICAL:
        return 'error';
      case AUDIT_SEVERITY.HIGH:
        return 'warn';
      case AUDIT_SEVERITY.MEDIUM:
        return 'info';
      case AUDIT_SEVERITY.LOW:
        return 'debug';
      default:
        return 'info';
    }
  }
  
  
  sanitizeDetails(details) {
    if (!details || typeof details !== 'object') {
      return details;
    }
    
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'auth', 'credential',
      'ssn', 'socialSecurityNumber', 'creditCard', 'bankAccount'
    ];
    
    const sanitized = { ...details };
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  
  sanitizeMetadata(metadata) {
    return this.sanitizeDetails(metadata);
  }
  
  createAuditMiddleware(eventType, options = {}) {
    return (req, res, next) => {
      // Store audit info in request for later use
      req.auditInfo = {
        eventType,
        correlationId: this.generateCorrelationId(),
        userId: req.user?.id,
        userRole: req.user?.role,
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.session?.id,
        ...options
      };
      
      // Override res.json to log audit trail after response
      const originalJson = res.json;
      res.json = function(body) {
        // Determine outcome based on response
        const outcome = body?.success !== false ? 'SUCCESS' : 'FAILURE';
        
        // Log audit entry
        const auditLogger = req.app.get('auditLogger') || globalAuditLogger;
        auditLogger.log(req.auditInfo.eventType, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseSize: JSON.stringify(body).length,
          ...(body?.error && { errorCode: body.error.code, errorMessage: body.error.message })
        }, {
          ...req.auditInfo,
          outcome
        });
        
        return originalJson.call(this, body);
      };
      
      next();
    };
  }
  
  getStatistics() {
    return {
      correlationMapSize: this.correlationMap.size,
      eventTypes: Object.keys(AUDIT_EVENT_TYPES),
      severityLevels: Object.keys(AUDIT_SEVERITY),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

const globalAuditLogger = new AuditLogger();

setInterval(() => {
  globalAuditLogger.cleanupCorrelations();
}, 60 * 60 * 1000);

module.exports = {
  AuditLogger,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITY,
  globalAuditLogger
};