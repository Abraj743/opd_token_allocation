const mongoose = require('mongoose');

const configurationSchema = new mongoose.Schema({
  configKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
    index: true
  },
  configValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['priority', 'capacity', 'timing', 'notification', 'system', 'business'],
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  updatedBy: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  validationRules: {
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'object', 'array'],
      required: true
    },
    min: Number,
    max: Number,
    enum: [String],
    required: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  collection: 'configurations'
});


configurationSchema.index({ category: 1 });
configurationSchema.index({ isActive: 1 });


configurationSchema.methods.validateConfig = function() {
  const rules = this.validationRules;
  const value = this.configValue;
  
  if (rules.type === 'number' && typeof value !== 'number') {
    throw new Error(`Configuration ${this.configKey} must be a number`);
  }
  
  if (rules.type === 'string' && typeof value !== 'string') {
    throw new Error(`Configuration ${this.configKey} must be a string`);
  }
  
  if (rules.type === 'boolean' && typeof value !== 'boolean') {
    throw new Error(`Configuration ${this.configKey} must be a boolean`);
  }
  
  if (rules.type === 'number') {
    if (rules.min !== undefined && value < rules.min) {
      throw new Error(`Configuration ${this.configKey} must be at least ${rules.min}`);
    }
    
    if (rules.max !== undefined && value > rules.max) {
      throw new Error(`Configuration ${this.configKey} must be at most ${rules.max}`);
    }
  }
  
  if (rules.enum && rules.enum.length > 0) {
    if (!rules.enum.includes(value)) {
      throw new Error(`Configuration ${this.configKey} must be one of: ${rules.enum.join(', ')}`);
    }
  }
  
  return true;
};

configurationSchema.methods.updateValue = function(newValue, updatedBy) {
  this.configValue = newValue;
  this.updatedBy = updatedBy;
  this.validateConfig();
  return this.save();
};

configurationSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

configurationSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};


configurationSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category,
    isActive: true
  }).sort({ configKey: 1 });
};

configurationSchema.statics.findActiveConfigs = function() {
  return this.find({ isActive: true }).sort({ category: 1, configKey: 1 });
};

configurationSchema.statics.getConfigValue = async function(configKey, defaultValue = null) {
  const config = await this.findOne({ 
    configKey,
    isActive: true
  });
  
  return config ? config.configValue : defaultValue;
};

configurationSchema.statics.setConfigValue = async function(configKey, configValue, updatedBy, options = {}) {
  const existingConfig = await this.findOne({ configKey });
  
  if (existingConfig) {
    return existingConfig.updateValue(configValue, updatedBy);
  } else {
    const newConfig = new this({
      configKey,
      configValue,
      updatedBy,
      ...options
    });
    
    newConfig.validateConfig();
    return newConfig.save();
  }
};

configurationSchema.statics.getBulkConfigs = async function(configKeys) {
  const configs = await this.find({
    configKey: { $in: configKeys },
    isActive: true
  });
  
  const configMap = {};
  configs.forEach(config => {
    configMap[config.configKey] = config.configValue;
  });
  
  return configMap;
};

configurationSchema.statics.initializeDefaultConfigs = async function() {
  const defaultConfigs = [
    {
      configKey: 'priority.emergency.base_score',
      configValue: 1000,
      category: 'priority',
      description: 'Base priority score for emergency patients',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 900,
        max: 1000,
        required: true
      }
    },
    {
      configKey: 'priority.priority_patient.base_score',
      configValue: 800,
      category: 'priority',
      description: 'Base priority score for priority patients',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 700,
        max: 899,
        required: true
      }
    },
    {
      configKey: 'priority.followup.base_score',
      configValue: 600,
      category: 'priority',
      description: 'Base priority score for follow-up patients',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 500,
        max: 699,
        required: true
      }
    },
    {
      configKey: 'priority.online.base_score',
      configValue: 400,
      category: 'priority',
      description: 'Base priority score for online booking patients',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 300,
        max: 499,
        required: true
      }
    },
    {
      configKey: 'priority.walkin.base_score',
      configValue: 200,
      category: 'priority',
      description: 'Base priority score for walk-in patients',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 100,
        max: 299,
        required: true
      }
    },
    {
      configKey: 'capacity.default_slot_capacity',
      configValue: 10,
      category: 'capacity',
      description: 'Default capacity for new time slots',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 1,
        max: 50,
        required: true
      }
    },
    {
      configKey: 'timing.consultation_duration',
      configValue: 15,
      category: 'timing',
      description: 'Average consultation duration in minutes',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 5,
        max: 60,
        required: true
      }
    },
    {
      configKey: 'timing.buffer_time',
      configValue: 5,
      category: 'timing',
      description: 'Buffer time between consultations in minutes',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 0,
        max: 30,
        required: true
      }
    },
    {
      configKey: 'business.followup_eligibility_days',
      configValue: 30,
      category: 'business',
      description: 'Number of days within which follow-up is eligible',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 1,
        max: 90,
        required: true
      }
    },
    {
      configKey: 'system.max_reallocation_attempts',
      configValue: 3,
      category: 'system',
      description: 'Maximum attempts for token reallocation',
      updatedBy: 'system',
      validationRules: {
        type: 'number',
        min: 1,
        max: 10,
        required: true
      }
    }
  ];
  
  for (const config of defaultConfigs) {
    const existing = await this.findOne({ configKey: config.configKey });
    if (!existing) {
      await this.create(config);
    }
  }
  
  return defaultConfigs.length;
};

configurationSchema.pre('save', function(next) {
  try {
    this.validateConfig();
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Configuration', configurationSchema);