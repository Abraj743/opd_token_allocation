const BaseRepository = require('./BaseRepository');


class ConfigurationRepository extends BaseRepository {
  constructor({ configurationModel, logger }) {
    super({ model: configurationModel, logger });
  }

  
  async findByKey(configKey) {
    return this.findOne({ configKey });
  }

  
  async getValue(configKey, defaultValue = null) {
    try {
      const config = await this.findByKey(configKey);
      return config ? config.configValue : defaultValue;
    } catch (error) {
      this.logger.error(`Error getting configuration value for key ${configKey}:`, error);
      return defaultValue;
    }
  }

  
  async setValue(configKey, configValue, category = 'general', description = '', updatedBy = 'system') {
    try {
      const updateData = {
        configValue,
        category,
        description,
        updatedAt: new Date(),
        updatedBy
      };

      const options = { 
        new: true, 
        upsert: true, 
        setDefaultsOnInsert: true 
      };

      const config = await this.model.findOneAndUpdate(
        { configKey },
        updateData,
        options
      );

      this.logger.debug(`Set configuration ${configKey} = ${JSON.stringify(configValue)}`);
      return config;
    } catch (error) {
      this.logger.error(`Error setting configuration value for key ${configKey}:`, error);
      throw error;
    }
  }

  
  async findByCategory(category) {
    return this.find({ category }, { sort: { configKey: 1 } });
  }

  
  async getAllAsMap(category = null) {
    try {
      const criteria = category ? { category } : {};
      const configs = await this.find(criteria);
      
      const configMap = {};
      configs.forEach(config => {
        configMap[config.configKey] = config.configValue;
      });

      return configMap;
    } catch (error) {
      this.logger.error('Error getting all configurations as map:', error);
      throw error;
    }
  }

  
  async deleteByKey(configKey) {
    try {
      const config = await this.model.findOneAndDelete({ configKey });
      if (config) {
        this.logger.debug(`Deleted configuration ${configKey}`);
      }
      return config;
    } catch (error) {
      this.logger.error(`Error deleting configuration ${configKey}:`, error);
      throw error;
    }
  }


  async getWithMetadata(configKey) {
    return this.findByKey(configKey);
  }

 
  async updateValue(configKey, configValue, updatedBy = 'system') {
    const updateData = {
      configValue,
      updatedAt: new Date(),
      updatedBy
    };

    try {
      const config = await this.model.findOneAndUpdate(
        { configKey },
        updateData,
        { new: true }
      );

      if (config) {
        this.logger.debug(`Updated configuration ${configKey} = ${JSON.stringify(configValue)}`);
      }
      return config;
    } catch (error) {
      this.logger.error(`Error updating configuration value for key ${configKey}:`, error);
      throw error;
    }
  }

 
  async updateMetadata(configKey, metadata) {
    const updateData = {
      ...metadata,
      updatedAt: new Date()
    };

    try {
      const config = await this.model.findOneAndUpdate(
        { configKey },
        updateData,
        { new: true }
      );

      if (config) {
        this.logger.debug(`Updated metadata for configuration ${configKey}`);
      }
      return config;
    } catch (error) {
      this.logger.error(`Error updating metadata for configuration ${configKey}:`, error);
      throw error;
    }
  }

  
  async findUpdatedAfter(afterDate) {
    const criteria = {
      updatedAt: { $gt: afterDate }
    };

    return this.find(criteria, { sort: { updatedAt: -1 } });
  }

  
  async bulkSet(configurations, updatedBy = 'system') {
    try {
      const results = [];
      
      for (const config of configurations) {
        const result = await this.setValue(
          config.configKey,
          config.configValue,
          config.category || 'general',
          config.description || '',
          updatedBy
        );
        results.push(result);
      }

      this.logger.debug(`Bulk set ${configurations.length} configurations`);
      return results;
    } catch (error) {
      this.logger.error('Error bulk setting configurations:', error);
      throw error;
    }
  }

  
  async getHistory(configKey, limit = 10) {
    const current = await this.findByKey(configKey);
    return current ? [current] : [];
  }
}

module.exports = ConfigurationRepository;