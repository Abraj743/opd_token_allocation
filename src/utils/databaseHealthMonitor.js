const mongoose = require('mongoose');
const logger = require('../config/logger');
const { AppError, ErrorFactory } = require('./errors');

const DEFAULT_HEALTH_CONFIG = {
  checkInterval: 30000,       
  timeoutMs: 5000,            
  maxConsecutiveFailures: 3,   
  recoveryCheckInterval: 10000, 
  enableAutoRecovery: true,    
  maxRecoveryAttempts: 5,      
  recoveryBackoffMs: 5000     
};


const HEALTH_STATES = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
  RECOVERING: 'RECOVERING'
};


class DatabaseHealthMonitor {
  constructor(databaseConfig, config = {}) {
    this.databaseConfig = databaseConfig;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    
    // Health state tracking
    this.state = HEALTH_STATES.HEALTHY;
    this.consecutiveFailures = 0;
    this.lastHealthCheck = null;
    this.lastFailure = null;
    this.recoveryAttempts = 0;
    
    // Metrics
    this.metrics = {
      totalChecks: 0,
      totalFailures: 0,
      totalRecoveries: 0,
      averageResponseTime: 0,
      uptime: Date.now(),
      lastStateChange: Date.now()
    };
    
    // Monitoring intervals
    this.healthCheckInterval = null;
    this.recoveryInterval = null;
    this.isMonitoring = false;
  }

  
  start() {
    if (this.isMonitoring) {
      logger.warn('Database health monitor is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting database health monitor', {
      checkInterval: this.config.checkInterval,
      timeout: this.config.timeoutMs
    });

    // Start regular health checks
    this.scheduleHealthCheck();
  }

  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.recoveryInterval) {
      clearTimeout(this.recoveryInterval);
      this.recoveryInterval = null;
    }

    logger.info('Database health monitor stopped');
  }

  
  scheduleHealthCheck() {
    if (!this.isMonitoring) return;

    const interval = this.state === HEALTH_STATES.UNHEALTHY || this.state === HEALTH_STATES.RECOVERING
      ? this.config.recoveryCheckInterval
      : this.config.checkInterval;

    this.healthCheckInterval = setTimeout(() => {
      this.performHealthCheck();
    }, interval);
  }

  
  async performHealthCheck() {
    const startTime = Date.now();
    this.metrics.totalChecks++;

    try {
      // Check database connection
      if (this.databaseConfig.isHealthy && !await this.databaseConfig.isHealthy()) {
        throw new AppError('Database connection is not healthy', 'DATABASE_UNHEALTHY');
      }

      // Perform ping operation
      await mongoose.connection.db.admin().ping();
      
      // Test a simple query
      await mongoose.connection.db.collection('healthcheck').findOne({}, { timeout: this.config.timeoutMs });

      // Health check passed
      this.onHealthCheckSuccess(Date.now() - startTime);
      
    } catch (error) {
      // Health check failed
      this.onHealthCheckFailure(error, Date.now() - startTime);
    }

    // Schedule next check only if monitoring
    if (this.isMonitoring) {
      this.scheduleHealthCheck();
    }
  }

  
  onHealthCheckSuccess(responseTime) {
    this.lastHealthCheck = Date.now();
    this.consecutiveFailures = 0;
    
    // Update metrics
    this.updateAverageResponseTime(responseTime);
    
    // Update state if recovering
    if (this.state !== HEALTH_STATES.HEALTHY) {
      this.changeState(HEALTH_STATES.HEALTHY);
      this.metrics.totalRecoveries++;
      this.recoveryAttempts = 0;
      
      logger.info('Database health recovered', {
        previousState: this.state,
        responseTime,
        totalRecoveries: this.metrics.totalRecoveries
      });
    }
  }

  
  onHealthCheckFailure(error, responseTime) {
    this.lastHealthCheck = Date.now();
    this.lastFailure = Date.now();
    this.consecutiveFailures++;
    this.metrics.totalFailures++;
    
    logger.error('Database health check failed', {
      error: error.message,
      consecutiveFailures: this.consecutiveFailures,
      responseTime,
      state: this.state
    });

    // Determine new state based on consecutive failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      if (this.state !== HEALTH_STATES.UNHEALTHY) {
        this.changeState(HEALTH_STATES.UNHEALTHY);
        
        // Attempt recovery if enabled
        if (this.config.enableAutoRecovery) {
          this.attemptRecovery();
        }
      }
    } else if (this.state === HEALTH_STATES.HEALTHY) {
      this.changeState(HEALTH_STATES.DEGRADED);
    }
  }

  
  async attemptRecovery() {
    if (this.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      logger.error('Maximum recovery attempts reached, manual intervention required', {
        attempts: this.recoveryAttempts,
        maxAttempts: this.config.maxRecoveryAttempts
      });
      return;
    }

    this.recoveryAttempts++;
    this.changeState(HEALTH_STATES.RECOVERING);

    logger.info('Attempting database recovery', {
      attempt: this.recoveryAttempts,
      maxAttempts: this.config.maxRecoveryAttempts
    });

    try {
      // Wait before recovery attempt
      const backoffDelay = this.config.recoveryBackoffMs * Math.pow(2, this.recoveryAttempts - 1);
      await this.sleep(backoffDelay);

      // Attempt to reconnect
      if (this.databaseConfig.forceReconnect) {
        await this.databaseConfig.forceReconnect();
      }

      logger.info('Database recovery attempt completed', {
        attempt: this.recoveryAttempts
      });

    } catch (error) {
      logger.error('Database recovery attempt failed', {
        attempt: this.recoveryAttempts,
        error: error.message
      });
    }
  }

  
  changeState(newState) {
    const previousState = this.state;
    this.state = newState;
    this.metrics.lastStateChange = Date.now();

    logger.info('Database health state changed', {
      from: previousState,
      to: newState,
      consecutiveFailures: this.consecutiveFailures
    });
  }

  
  updateAverageResponseTime(responseTime) {
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      // Exponential moving average
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime * 0.9) + (responseTime * 0.1);
    }
  }

  
  getHealthStatus() {
    return {
      state: this.state,
      isHealthy: this.state === HEALTH_STATES.HEALTHY,
      consecutiveFailures: this.consecutiveFailures,
      lastHealthCheck: this.lastHealthCheck,
      lastFailure: this.lastFailure,
      recoveryAttempts: this.recoveryAttempts,
      metrics: {
        ...this.metrics,
        uptimeMs: Date.now() - this.metrics.uptime,
        timeSinceLastStateChange: Date.now() - this.metrics.lastStateChange
      }
    };
  }

  
  async forceHealthCheck() {
    logger.info('Forcing database health check');
    await this.performHealthCheck();
    return this.getHealthStatus();
  }

  
  reset() {
    this.state = HEALTH_STATES.HEALTHY;
    this.consecutiveFailures = 0;
    this.lastHealthCheck = null;
    this.lastFailure = null;
    this.recoveryAttempts = 0;
    this.metrics.lastStateChange = Date.now();

    logger.info('Database health monitor state reset');
  }

  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  DatabaseHealthMonitor,
  HEALTH_STATES
};