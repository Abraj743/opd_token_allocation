require('dotenv').config();

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI'
];

const optionalEnvVars = {
  LOG_LEVEL: 'info',
  DB_MAX_POOL_SIZE: '10',
  DB_SERVER_SELECTION_TIMEOUT: '5000',
  DB_SOCKET_TIMEOUT: '45000',
  JWT_SECRET: 'default-secret-change-in-production',
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100'
};

class EnvironmentConfig {
  constructor() {
    this.validateRequiredEnvVars();
    this.setDefaultValues();
    this.config = this.loadConfiguration();
  }

  validateRequiredEnvVars() {
    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  setDefaultValues() {
    Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
      if (!process.env[key]) {
        process.env[key] = defaultValue;
      }
    });
  }

  loadConfiguration() {
    return {
      nodeEnv: process.env.NODE_ENV,
      port: parseInt(process.env.PORT),
      
      mongodb: {
        uri: process.env.MONGODB_URI,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE),
        serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT),
        socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT)
      },
      
      logging: {
        level: process.env.LOG_LEVEL
      },
      
      security: {
        jwtSecret: process.env.JWT_SECRET,
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS),
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
      },
      
      business: {
        defaultSlotCapacity: 10,
        emergencySlotReservation: 2,
        maxWaitingTimeHours: 4,
        followupEligibilityDays: 30
      }
    };
  }

  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }
}

module.exports = new EnvironmentConfig();