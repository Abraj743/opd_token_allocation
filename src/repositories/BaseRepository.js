const logger = require('../config/logger');
const { globalOptimisticLockManager, CONCURRENCY_ERRORS } = require('../utils/concurrencyControl');
const { AppError, ErrorFactory } = require('../utils/errors');

class BaseRepository {
  constructor({ model, logger: repositoryLogger }) {
    this.model = model;
    this.logger = repositoryLogger || logger;
    this.lockManager = globalOptimisticLockManager;
  }

  
  async create(data) {
    try {
      const document = new this.model(data);
      const savedDocument = await document.save();
      this.logger.debug(`Created ${this.model.modelName} with ID: ${savedDocument._id}`);
      return savedDocument;
    } catch (error) {
      this.logger.error(`Error creating ${this.model.modelName}:`, {
        error: error.message,
        data: this.sanitizeLogData(data)
      });
      throw this.handleDatabaseError(error, 'create');
    }
  }

  
  async createWithRetry(data, options = {}) {
    return this.lockManager.executeWithRetry(async (attempt) => {
      return this.create(data);
    }, { context: `create_${this.model.modelName}`, ...options });
  }

  
  async findById(id) {
    try {
      const document = await this.model.findById(id);
      if (document) {
        this.logger.debug(`Found ${this.model.modelName} with ID: ${id}`);
      }
      return document;
    } catch (error) {
      this.logger.error(`Error finding ${this.model.modelName} by ID ${id}:`, error);
      throw this.handleDatabaseError(error, 'findById');
    }
  }

  
  async find(criteria = {}, options = {}) {
    try {
      let query = this.model.find(criteria);
      
      if (options.sort) {
        query = query.sort(options.sort);
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.skip) {
        query = query.skip(options.skip);
      }
      
      if (options.populate) {
        query = query.populate(options.populate);
      }

      const documents = await query.exec();
      this.logger.debug(`Found ${documents.length} ${this.model.modelName} documents`);
      return documents;
    } catch (error) {
      this.logger.error(`Error finding ${this.model.modelName} documents:`, error);
      throw this.handleDatabaseError(error, 'find');
    }
  }

  
  async findOne(criteria) {
    try {
      const document = await this.model.findOne(criteria);
      if (document) {
        this.logger.debug(`Found one ${this.model.modelName} document`);
      }
      return document;
    } catch (error) {
      this.logger.error(`Error finding one ${this.model.modelName} document:`, error);
      throw this.handleDatabaseError(error, 'findOne');
    }
  }

  
  async updateById(id, updateData, options = { new: true }) {
    try {
      const document = await this.model.findByIdAndUpdate(id, updateData, options);
      if (document) {
        this.logger.debug(`Updated ${this.model.modelName} with ID: ${id}`);
      }
      return document;
    } catch (error) {
      this.logger.error(`Error updating ${this.model.modelName} with ID ${id}:`, {
        error: error.message,
        updateData: this.sanitizeLogData(updateData)
      });
      throw this.handleDatabaseError(error, 'updateById');
    }
  }

  
  async updateByIdWithLock(id, updateFn, options = {}) {
    return this.lockManager.updateWithOptimisticLock(
      this.model,
      id,
      updateFn,
      options
    );
  }

  
  async updateMany(criteria, updateData, options = {}) {
    try {
      const result = await this.model.updateMany(criteria, updateData, options);
      this.logger.debug(`Updated ${result.modifiedCount} ${this.model.modelName} documents`);
      return result;
    } catch (error) {
      this.logger.error(`Error updating ${this.model.modelName} documents:`, {
        error: error.message,
        criteria: this.sanitizeLogData(criteria),
        updateData: this.sanitizeLogData(updateData)
      });
      throw this.handleDatabaseError(error, 'updateMany');
    }
  }

  
  async deleteById(id) {
    try {
      const document = await this.model.findByIdAndDelete(id);
      if (document) {
        this.logger.debug(`Deleted ${this.model.modelName} with ID: ${id}`);
      }
      return document;
    } catch (error) {
      this.logger.error(`Error deleting ${this.model.modelName} with ID ${id}:`, error);
      throw this.handleDatabaseError(error, 'deleteById');
    }
  }

  
  async count(criteria = {}) {
    try {
      const count = await this.model.countDocuments(criteria);
      this.logger.debug(`Counted ${count} ${this.model.modelName} documents`);
      return count;
    } catch (error) {
      this.logger.error(`Error counting ${this.model.modelName} documents:`, error);
      throw this.handleDatabaseError(error, 'count');
    }
  }

  
  async exists(criteria) {
    try {
      const document = await this.model.exists(criteria);
      return !!document;
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.model.modelName}:`, error);
      throw this.handleDatabaseError(error, 'exists');
    }
  }

  
  async executeTransaction(transactionFn, options = {}) {
    return this.lockManager.executeTransaction(transactionFn, {
      context: `transaction_${this.model.modelName}`,
      ...options
    });
  }

  async incrementField(id, field, amount = 1) {
    return this.updateByIdWithLock(id, async (document) => {
      const updateData = { $inc: {} };
      updateData.$inc[field] = amount;
      return updateData;
    });
  }

  
  async decrementField(id, field, amount = 1) {
    return this.incrementField(id, field, -amount);
  }

  
  handleDatabaseError(error, operation) {
    if (error.code === 11000) {
      const field = this.extractDuplicateKeyField(error);
      this.logger.error(`Duplicate key error details:`, {
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
        message: error.message,
        field: field
      });
      return new AppError(
        'DUPLICATE_KEY_ERROR',
        `Duplicate value for field: ${field}`,
        { field, operation, modelName: this.model.modelName, keyPattern: error.keyPattern, keyValue: error.keyValue },
        ['Use a different value', 'Check if record already exists']
      );
    }

    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message
      }));
      
      return new AppError(
        'VALIDATION_ERROR',
        'Document validation failed',
        { validationErrors, operation, modelName: this.model.modelName },
        ['Check required fields', 'Verify data format']
      );
    }

  
    if (error.name === 'CastError') {
      return new AppError(
        'INVALID_DATA_TYPE',
        `Invalid data type for field: ${error.path}`,
        { field: error.path, value: error.value, operation, modelName: this.model.modelName },
        ['Check data type', 'Verify field format']
      );
    }

    
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      return ErrorFactory.externalServiceError(
        'MongoDB',
        error.name === 'MongoTimeoutError' ? 'timeout' : 'connection',
        error
      );
    }


    if (error.code === CONCURRENCY_ERRORS.VERSION_CONFLICT) {
      return new AppError(
        'CONCURRENT_MODIFICATION',
        'Document was modified by another operation',
        { operation, modelName: this.model.modelName },
        ['Retry the operation', 'Refresh data and try again']
      );
    }

    this.logger.error(`Unhandled database error in ${operation}:`, {
      error: error.message,
      code: error.code,
      name: error.name,
      modelName: this.model.modelName
    });

    return ErrorFactory.databaseError(error);
  }

  
  extractDuplicateKeyField(error) {
    if (error.keyPattern) {
      return Object.keys(error.keyPattern)[0];
    }
    
    
    const match = error.message.match(/index: (\w+)/);
    return match ? match[1] : 'unknown';
  }

  
  sanitizeLogData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  
  getHealthStatus() {
    return {
      modelName: this.model.modelName,
      status: 'healthy'
    };
  }

  
  async executeOperation(operationName, operation, context = {}) {
    try {
      this.logger.debug(`Executing ${operationName} on ${this.model.modelName}`, context);
      const result = await operation();
      this.logger.debug(`Completed ${operationName} on ${this.model.modelName}`, { 
        ...context, 
        resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0)
      });
      return result;
    } catch (error) {
      this.logger.error(`Error in ${operationName} on ${this.model.modelName}:`, {
        error: error.message,
        context,
        operation: operationName
      });
      throw this.handleDatabaseError(error, operationName);
    }
  }
}

module.exports = BaseRepository;