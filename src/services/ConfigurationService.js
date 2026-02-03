const BaseService = require('./BaseService');
const environmentConfig = require('../config/environment');


class ConfigurationService extends BaseService {
  constructor({ configurationRepository, logger }) {
    super({ logger });
    this.configurationRepository = configurationRepository;
    this.configCache = new Map();
    this.environmentCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = null;
    this.lastEnvironmentUpdate = null;
    this.initialized = false;
    this.hotReloadEnabled = true;
    this.configValidationRules = this.initializeValidationRules();
    this.configProfiles = {
      development: this.getDevelopmentDefaults(),
      testing: this.getTestingDefaults(),
      production: this.getProductionDefaults()
    };
  }

  
  initializeValidationRules() {
    return {
      'priority.emergency': { type: 'number', min: 0, max: 2000, required: true },
      'priority.priority_patient': { type: 'number', min: 0, max: 2000, required: true },
      'priority.followup': { type: 'number', min: 0, max: 2000, required: true },
      'priority.online_booking': { type: 'number', min: 0, max: 2000, required: true },
      'priority.walkin': { type: 'number', min: 0, max: 2000, required: true },
      'capacity.default_slot_capacity': { type: 'number', min: 1, max: 100, required: true },
      'capacity.emergency_reserve_percentage': { type: 'number', min: 0, max: 50, required: true },
      'timing.default_consultation_minutes': { type: 'number', min: 5, max: 120, required: true },
      'timing.buffer_minutes': { type: 'number', min: 0, max: 30, required: true },
      'timing.reallocation_window_hours': { type: 'number', min: 1, max: 24, required: true },
      'notification.sms_enabled': { type: 'boolean', required: false },
      'notification.email_enabled': { type: 'boolean', required: false }
    };
  }

  
  getDevelopmentDefaults() {
    return {
      'capacity.default_slot_capacity': 5,
      'timing.default_consultation_minutes': 10,
      'notification.sms_enabled': false,
      'notification.email_enabled': false
    };
  }

  
  getTestingDefaults() {
    return {
      'capacity.default_slot_capacity': 3,
      'timing.default_consultation_minutes': 5,
      'timing.buffer_minutes': 1,
      'notification.sms_enabled': false,
      'notification.email_enabled': false
    };
  }

  
  getProductionDefaults() {
    return {
      'capacity.default_slot_capacity': 15,
      'timing.default_consultation_minutes': 20,
      'timing.buffer_minutes': 10,
      'notification.sms_enabled': true,
      'notification.email_enabled': true
    };
  }

  
  async initialize() {
    return this.executeOperation('initialize', async () => {
      
      await this.loadEnvironmentConfiguration();
      
    
      await this.loadDefaultConfigurations();
      
      
      await this.refreshCache();
      
      await this.validateAllConfigurations(true);
      
      this.initialized = true;
      
      return this.createSuccessResponse(
        { 
          initialized: true,
          environment: environmentConfig.get('nodeEnv'),
          cachedConfigs: this.configCache.size,
          environmentConfigs: this.environmentCache.size
        },
        'Configuration service initialized successfully'
      );
    });
  }

  
  async loadEnvironmentConfiguration() {
    return this.executeOperation('loadEnvironmentConfiguration', async () => {
      const envConfig = environmentConfig.getAll();
      
      this.environmentCache.clear();
      this.environmentCache.set('server', envConfig);
      this.environmentCache.set('database', envConfig.mongodb);
      this.environmentCache.set('logging', envConfig.logging);
      this.environmentCache.set('security', envConfig.security);
      
      this.lastEnvironmentUpdate = Date.now();
      
      this.logger.info('Environment configuration loaded', {
        nodeEnv: envConfig.nodeEnv,
        port: envConfig.port,
        logLevel: envConfig.logging.level
      });

      return this.createSuccessResponse(
        { environmentConfigsLoaded: this.environmentCache.size },
        'Environment configuration loaded successfully'
      );
    });
  }

  async loadDefaultConfigurations() {
    return this.executeOperation('loadDefaultConfigurations', async () => {
      const currentEnv = environmentConfig.get('nodeEnv') || 'development';
      const profileDefaults = this.configProfiles[currentEnv] || this.configProfiles.development;
      
      const defaultConfigs = [
        {
          configKey: 'priority.emergency',
          configValue: 1000,
          category: 'priority',
          description: 'Priority score for emergency patients'
        },
        {
          configKey: 'priority.priority_patient',
          configValue: 800,
          category: 'priority',
          description: 'Priority score for priority patients'
        },
        {
          configKey: 'priority.followup',
          configValue: 600,
          category: 'priority',
          description: 'Priority score for follow-up patients'
        },
        {
          configKey: 'priority.online_booking',
          configValue: 400,
          category: 'priority',
          description: 'Priority score for online booking patients'
        },
        {
          configKey: 'priority.walkin',
          configValue: 200,
          category: 'priority',
          description: 'Priority score for walk-in patients'
        },
        
        {
          configKey: 'capacity.default_slot_capacity',
          configValue: profileDefaults['capacity.default_slot_capacity'] || 10,
          category: 'capacity',
          description: 'Default capacity for new time slots'
        },
        {
          configKey: 'capacity.emergency_reserve_percentage',
          configValue: 20,
          category: 'capacity',
          description: 'Percentage of capacity reserved for emergencies'
        },
        
        {
          configKey: 'timing.default_consultation_minutes',
          configValue: profileDefaults['timing.default_consultation_minutes'] || 15,
          category: 'timing',
          description: 'Default consultation time in minutes'
        },
        {
          configKey: 'timing.buffer_minutes',
          configValue: profileDefaults['timing.buffer_minutes'] || 5,
          category: 'timing',
          description: 'Buffer time between consultations in minutes'
        },
        {
          configKey: 'timing.reallocation_window_hours',
          configValue: 4,
          category: 'timing',
          description: 'Time window for token reallocation in hours'
        },
        
        {
          configKey: 'notification.sms_enabled',
          configValue: profileDefaults['notification.sms_enabled'] !== undefined ? 
                      profileDefaults['notification.sms_enabled'] : true,
          category: 'notification',
          description: 'Enable SMS notifications'
        },
        {
          configKey: 'notification.email_enabled',
          configValue: profileDefaults['notification.email_enabled'] !== undefined ? 
                      profileDefaults['notification.email_enabled'] : true,
          category: 'notification',
          description: 'Enable email notifications'
        }
      ];

      let createdCount = 0;
      for (const config of defaultConfigs) {
        const existing = await this.configurationRepository.findByKey(config.configKey);
        if (!existing) {
          await this.configurationRepository.setValue(
            config.configKey,
            config.configValue,
            config.category,
            config.description,
            'system'
          );
          createdCount++;
        }
      }

      this.logger.info('Default configurations loaded', {
        environment: currentEnv,
        totalConfigs: defaultConfigs.length,
        createdConfigs: createdCount
      });

      return this.createSuccessResponse(
        { 
          environment: currentEnv,
          totalConfigs: defaultConfigs.length,
          createdConfigs: createdCount
        },
        'Default configurations loaded successfully'
      );
    });
  }
  
  validateConfigurationValue(configKey, configValue) {
    const rule = this.configValidationRules[configKey];
    if (!rule) {
      return { valid: true };
    }

   
    if (rule.required && (configValue === null || configValue === undefined)) {
      return { 
        valid: false, 
        error: `Configuration '${configKey}' is required but not provided` 
      };
    }

    if (configValue === null || configValue === undefined) {
      return { valid: true };
    }

    if (rule.type === 'number' && typeof configValue !== 'number') {
      return { 
        valid: false, 
        error: `Configuration '${configKey}' must be a number, got ${typeof configValue}` 
      };
    }

    if (rule.type === 'boolean' && typeof configValue !== 'boolean') {
      return { 
        valid: false, 
        error: `Configuration '${configKey}' must be a boolean, got ${typeof configValue}` 
      };
    }

    if (rule.type === 'string' && typeof configValue !== 'string') {
      return { 
        valid: false, 
        error: `Configuration '${configKey}' must be a string, got ${typeof configValue}` 
      };
    }

    if (rule.type === 'number') {
      if (rule.min !== undefined && configValue < rule.min) {
        return { 
          valid: false, 
          error: `Configuration '${configKey}' must be >= ${rule.min}, got ${configValue}` 
        };
      }
      if (rule.max !== undefined && configValue > rule.max) {
        return { 
          valid: false, 
          error: `Configuration '${configKey}' must be <= ${rule.max}, got ${configValue}` 
        };
      }
    }

    return { valid: true };
  }

 
  async validateAllConfigurations(skipMissingRequired = false) {
    return this.executeOperation('validateAllConfigurations', async () => {
      const configMap = await this.configurationRepository.getAllAsMap();
      const validationErrors = [];
      const warnings = [];

      
      Object.entries(configMap).forEach(([key, value]) => {
        const validation = this.validateConfigurationValue(key, value);
        if (!validation.valid) {
          validationErrors.push({
            configKey: key,
            configValue: value,
            error: validation.error
          });
        }
      });

      
      Object.entries(this.configValidationRules).forEach(([key, rule]) => {
        if (rule.required && !(key in configMap)) {
          const missingError = {
            configKey: key,
            configValue: null,
            error: `Required configuration '${key}' is missing`
          };

          if (skipMissingRequired) {
            warnings.push(missingError);
          } else {
            validationErrors.push(missingError);
          }
        }
      });

      if (warnings.length > 0) {
        this.logger.warn('Missing required configurations (will be created with defaults)', { 
          missingConfigs: warnings.map(w => w.configKey) 
        });
      }

      if (validationErrors.length > 0) {
        this.logger.error('Configuration validation failed', { validationErrors });
        throw new Error(`Configuration validation failed: ${validationErrors.length} errors found`);
      }

      this.logger.info('Configuration validation completed', {
        totalConfigs: Object.keys(configMap).length,
        validatedRules: Object.keys(this.configValidationRules).length,
        warnings: warnings.length
      });

      return this.createSuccessResponse(
        { 
          totalConfigs: Object.keys(configMap).length,
          validatedRules: Object.keys(this.configValidationRules).length,
          validationErrors: [],
          warnings: warnings.length
        },
        'Configuration validation completed successfully'
      );
    });
  }

 
  async getEnvironmentConfig(category, key = null) {
    return this.executeOperation('getEnvironmentConfig', async () => {
      this.validateRequired({ category }, ['category']);
      
      await this.ensureEnvironmentCacheValid();
      
      const categoryConfig = this.environmentCache.get(category);
      if (!categoryConfig) {
        return this.createErrorResponse(
          'ENV_CATEGORY_NOT_FOUND',
          `Environment category '${category}' not found`
        );
      }

      const value = key ? categoryConfig[key] : categoryConfig;
      
      return this.createSuccessResponse(
        { category, key, value },
        'Environment configuration retrieved successfully'
      );
    }, { category, key });
  }

 
  async getAllEnvironmentConfig() {
    return this.executeOperation('getAllEnvironmentConfig', async () => {
      await this.ensureEnvironmentCacheValid();
      
      const allConfig = {};
      this.environmentCache.forEach((value, key) => {
        allConfig[key] = value;
      });

      return this.createSuccessResponse(
        allConfig,
        'All environment configuration retrieved successfully'
      );
    });
  }

  
  async setHotReloadEnabled(enabled) {
    return this.executeOperation('setHotReloadEnabled', async () => {
      this.validateRequired({ enabled }, ['enabled']);
      
      this.hotReloadEnabled = enabled;
      
      this.logger.info(`Hot-reload ${enabled ? 'enabled' : 'disabled'}`);

      return this.createSuccessResponse(
        { hotReloadEnabled: this.hotReloadEnabled },
        `Hot-reload ${enabled ? 'enabled' : 'disabled'} successfully`
      );
    }, { enabled });
  }

 
  async hotReload() {
    return this.executeOperation('hotReload', async () => {
      if (!this.hotReloadEnabled) {
        return this.createErrorResponse(
          'HOT_RELOAD_DISABLED',
          'Hot-reload is disabled. Enable it first using setHotReloadEnabled(true)'
        );
      }

      const oldCacheSize = this.configCache.size;
      
      await this.refreshCache();
      
      await this.validateAllConfigurations(false);
      
      this.logger.info('Configuration hot-reloaded successfully', {
        oldCacheSize,
        newCacheSize: this.configCache.size
      });

      return this.createSuccessResponse(
        { 
          oldCacheSize,
          newCacheSize: this.configCache.size,
          reloadedAt: new Date().toISOString()
        },
        'Configuration hot-reloaded successfully'
      );
    });
  }

  
  async ensureEnvironmentCacheValid() {
    const now = Date.now();
    if (!this.lastEnvironmentUpdate || (now - this.lastEnvironmentUpdate) > this.cacheTimeout) {
      await this.loadEnvironmentConfiguration();
    }
  }

  async getValue(configKey, defaultValue = null) {
    return this.executeOperation('getValue', async () => {
      this.validateRequired({ configKey }, ['configKey']);
      
      await this.ensureCacheValid();
      
      let value = this.configCache.get(configKey);
      if (value === undefined) {
        value = await this.configurationRepository.getValue(configKey, defaultValue);
        this.configCache.set(configKey, value);
      }

      return this.createSuccessResponse(
        { key: configKey, value },
        'Configuration value retrieved successfully'
      );
    }, { configKey });
  }

  async setValue(configKey, configValue, category = 'general', description = '', updatedBy = 'system') {
    return this.executeOperation('setValue', async () => {
      this.validateRequired({ configKey, configValue }, ['configKey', 'configValue']);
      
      const validation = this.validateConfigurationValue(configKey, configValue);
      if (!validation.valid) {
        return this.createErrorResponse(
          'CONFIG_VALIDATION_FAILED',
          validation.error
        );
      }
      
      const config = await this.configurationRepository.setValue(
        configKey,
        configValue,
        category,
        description,
        updatedBy
      );

      this.configCache.set(configKey, configValue);

      this.logger.info('Configuration value updated', {
        configKey,
        category,
        updatedBy
      });

      return this.createSuccessResponse(
        config,
        'Configuration value set successfully'
      );
    }, { configKey, category });
  }

  async getByCategory(category) {
    return this.executeOperation('getByCategory', async () => {
      this.validateRequired({ category }, ['category']);
      
      const configs = await this.configurationRepository.findByCategory(category);
      
      return this.createSuccessResponse(
        configs,
        `Retrieved ${configs.length} configurations for category: ${category}`
      );
    }, { category });
  }

  async getAllAsMap(category = null) {
    return this.executeOperation('getAllAsMap', async () => {
      const configMap = await this.configurationRepository.getAllAsMap(category);
      
      return this.createSuccessResponse(
        configMap,
        `Retrieved configuration map${category ? ` for category: ${category}` : ''}`
      );
    }, { category });
  }

  
  async deleteValue(configKey) {
    return this.executeOperation('deleteValue', async () => {
      this.validateRequired({ configKey }, ['configKey']);
      
      const deleted = await this.configurationRepository.deleteByKey(configKey);
      
      if (!deleted) {
        return this.createErrorResponse(
          'CONFIG_NOT_FOUND',
          `Configuration with key '${configKey}' not found`
        );
      }


      this.configCache.delete(configKey);

      return this.createSuccessResponse(
        deleted,
        'Configuration deleted successfully'
      );
    }, { configKey });
  }

  async refreshCache() {
    return this.executeOperation('refreshCache', async () => {
      const configMap = await this.configurationRepository.getAllAsMap();
      
      this.configCache.clear();
      Object.entries(configMap).forEach(([key, value]) => {
        this.configCache.set(key, value);
      });
      
      this.lastCacheUpdate = Date.now();

      return this.createSuccessResponse(
        { cachedConfigs: this.configCache.size },
        'Configuration cache refreshed successfully'
      );
    });
  }

  async getPriorityConfig() {
    return this.executeOperation('getPriorityConfig', async () => {
      const priorityConfigs = await this.configurationRepository.findByCategory('priority');
      
      const priorityMap = {};
      priorityConfigs.forEach(config => {
        const key = config.configKey.replace('priority.', '');
        priorityMap[key] = config.configValue;
      });

      return this.createSuccessResponse(
        priorityMap,
        'Priority configuration retrieved successfully'
      );
    });
  }

  async getCapacityConfig() {
    return this.executeOperation('getCapacityConfig', async () => {
      const capacityConfigs = await this.configurationRepository.findByCategory('capacity');
      
      const capacityMap = {};
      capacityConfigs.forEach(config => {
        const key = config.configKey.replace('capacity.', '');
        capacityMap[key] = config.configValue;
      });

      return this.createSuccessResponse(
        capacityMap,
        'Capacity configuration retrieved successfully'
      );
    });
  }

  async ensureCacheValid() {
    const now = Date.now();
    if (!this.lastCacheUpdate || (now - this.lastCacheUpdate) > this.cacheTimeout) {
      await this.refreshCache();
    }
  }

  async bulkUpdate(configurations, updatedBy = 'system') {
    return this.executeOperation('bulkUpdate', async () => {
      this.validateRequired({ configurations }, ['configurations']);
      
      if (!Array.isArray(configurations)) {
        throw new Error('Configurations must be an array');
      }

      const validationErrors = [];
      configurations.forEach((config, index) => {
        if (!config.configKey || config.configValue === undefined) {
          validationErrors.push({
            index,
            error: 'Configuration must have configKey and configValue'
          });
          return;
        }

        const validation = this.validateConfigurationValue(config.configKey, config.configValue);
        if (!validation.valid) {
          validationErrors.push({
            index,
            configKey: config.configKey,
            error: validation.error
          });
        }
      });

      if (validationErrors.length > 0) {
        return this.createErrorResponse(
          'BULK_VALIDATION_FAILED',
          `Bulk update validation failed: ${validationErrors.length} errors`,
          { validationErrors }
        );
      }

      const results = await this.configurationRepository.bulkSet(configurations, updatedBy);
      

      results.forEach(config => {
        this.configCache.set(config.configKey, config.configValue);
      });

      this.logger.info('Bulk configuration update completed', {
        updatedCount: results.length,
        updatedBy
      });

      return this.createSuccessResponse(
        results,
        `Bulk updated ${results.length} configurations`
      );
    }, { configCount: configurations?.length });
  }


  async shutdown() {
    this.logger.info('Shutting down configuration service...');
    this.configCache.clear();
    this.environmentCache.clear();
    this.initialized = false;
    this.hotReloadEnabled = false;
  }
}

module.exports = ConfigurationService;