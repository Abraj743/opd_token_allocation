const mongoose = require('mongoose');
const logger = require('../config/logger');
const { AppError, ErrorFactory } = require('./errors');


const DEFAULT_RETRY_CONFIG = {
  maxRetries: 1, 
  baseDelay: 50,
  maxDelay: 200, 
  backoffFactor: 1.5,
  jitter: true
};


const CONCURRENCY_ERRORS = {
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  TRANSACTION_ABORTED: 'TRANSACTION_ABORTED',
  DEADLOCK_DETECTED: 'DEADLOCK_DETECTED',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED'
};


class OptimisticLockManager {
  constructor(retryConfig = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  
  async executeWithRetry(operation, options = {}) {
    const { maxRetries = this.config.maxRetries, context = 'operation' } = options;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation(attempt);
        
        if (attempt > 0) {
          logger.info(`Concurrent operation succeeded after ${attempt} retries`, {
            context,
            attempt,
            maxRetries
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable error
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        
        logger.warn(`Concurrent operation failed, retrying in ${delay}ms`, {
          context,
          attempt: attempt + 1,
          maxRetries,
          error: error.message,
          errorType: this.getErrorType(error)
        });
        
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    logger.error(`Concurrent operation failed after ${maxRetries} retries`, {
      context,
      error: lastError.message,
      errorType: this.getErrorType(lastError)
    });

    throw new AppError(
      CONCURRENCY_ERRORS.MAX_RETRIES_EXCEEDED,
      `Operation failed after ${maxRetries} retries due to concurrency conflicts`,
      { 
        originalError: lastError.message,
        errorType: this.getErrorType(lastError),
        maxRetries,
        context
      },
      ['Try again later', 'Check for conflicting operations']
    );
  }

  
  async updateWithOptimisticLock(model, id, updateFn, options = {}) {
    return this.executeWithRetry(async (attempt) => {
      // Start a session for this operation
      const session = await mongoose.startSession();
      
      try {
        return await session.withTransaction(async () => {
          // Find the document with the current version
          const document = await model.findById(id).session(session);
          
          if (!document) {
            throw new AppError('DOCUMENT_NOT_FOUND', `Document with ID ${id} not found`);
          }

          // Store the original version
          const originalVersion = document.__v;
          
          // Apply the update function
          const updatedData = await updateFn(document, attempt);
          
          // Perform the update with version check
          const result = await model.findOneAndUpdate(
            { 
              _id: id, 
              __v: originalVersion 
            },
            { 
              ...updatedData,
              $inc: { __v: 1 }
            },
            { 
              new: true,
              session,
              runValidators: true
            }
          );

          if (!result) {
            throw new AppError(
              CONCURRENCY_ERRORS.VERSION_CONFLICT,
              'Document was modified by another operation',
              { 
                documentId: id,
                expectedVersion: originalVersion,
                attempt: attempt + 1
              }
            );
          }

          return result;
        });
      } finally {
        await session.endSession();
      }
    }, { context: `updateWithOptimisticLock:${model.modelName}:${id}` });
  }

 
  async executeTransaction(transactionFn, options = {}) {
    return this.executeWithRetry(async (attempt) => {
      const session = await mongoose.startSession();
      
      try {
        return await session.withTransaction(async () => {
          return await transactionFn(session, attempt);
        }, {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
          ...options.transactionOptions
        });
      } finally {
        await session.endSession();
      }
    }, { context: options.context || 'transaction' });
  }

  isRetryableError(error) {
    // MongoDB transient transaction errors
    if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
      return true;
    }

    // MongoDB unknown transaction commit result
    if (error.hasErrorLabel && error.hasErrorLabel('UnknownTransactionCommitResult')) {
      return true;
    }

    // Version conflict (optimistic locking)
    if (error.code === CONCURRENCY_ERRORS.VERSION_CONFLICT) {
      return true;
    }

    // Write conflicts
    if (error.code === 112) { // WriteConflict
      return true;
    }

    // Deadlock detection
    if (error.code === 46) { // LockTimeout
      return true;
    }

    // Connection errors
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      return true;
    }

    return false;
  }

  
  getErrorType(error) {
    if (error.code === CONCURRENCY_ERRORS.VERSION_CONFLICT) {
      return 'VERSION_CONFLICT';
    }
    if (error.code === 112) {
      return 'WRITE_CONFLICT';
    }
    if (error.code === 46) {
      return 'LOCK_TIMEOUT';
    }
    if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
      return 'TRANSIENT_TRANSACTION_ERROR';
    }
    if (error.name === 'MongoNetworkError') {
      return 'NETWORK_ERROR';
    }
    if (error.name === 'MongoTimeoutError') {
      return 'TIMEOUT_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  calculateDelay(attempt) {
    let delay = Math.min(
      this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt),
      this.config.maxDelay
    );

    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


class TokenConcurrencyManager {
  constructor(tokenRepository, slotRepository, retryConfig = {}) {
    this.tokenRepository = tokenRepository;
    this.slotRepository = slotRepository;
    this.lockManager = new OptimisticLockManager(retryConfig);
    
    // Track ongoing operations to prevent conflicts
    this.ongoingOperations = new Map();
  }

  
  async allocateTokenConcurrently(allocationData, options = {}) {
    const { slotId, patientId } = allocationData;
    const operationKey = `allocate:${slotId}:${patientId}`;

    // Check if similar operation is already in progress
    if (this.ongoingOperations.has(operationKey)) {
      throw new AppError(
        'OPERATION_IN_PROGRESS',
        'Similar token allocation is already in progress',
        { slotId, patientId }
      );
    }

    this.ongoingOperations.set(operationKey, Date.now());

    try {
      return await this.lockManager.executeTransaction(async (session) => {
        // Find and lock the slot
        const slot = await this.slotRepository.model
          .findOne({ slotId })
          .session(session);

        if (!slot) {
          throw new AppError('SLOT_NOT_FOUND', `Slot ${slotId} not found`);
        }

        // Check current allocation count with proper locking
        const currentTokens = await this.tokenRepository.model
          .countDocuments({
            slotId,
            status: { $in: ['allocated', 'confirmed'] }
          })
          .session(session);

        if (currentTokens >= slot.maxCapacity) {
          throw new AppError(
            'SLOT_CAPACITY_EXCEEDED',
            'Slot is at maximum capacity',
            { slotId, currentTokens, maxCapacity: slot.maxCapacity }
          );
        }

        // Get next token number atomically
        const tokenNumber = await this.getNextTokenNumberAtomic(slotId, session);

        // Create the token
        const tokenData = {
          ...allocationData,
          tokenNumber,
          status: 'allocated',
          createdAt: new Date()
        };

        const token = new this.tokenRepository.model(tokenData);
        await token.save({ session });

        // Update slot allocation count atomically
        await this.slotRepository.model
          .findByIdAndUpdate(
            slot._id,
            { $inc: { currentAllocation: 1 } },
            { session }
          );

        return token;
      }, { context: `allocateToken:${slotId}` });

    } finally {
      this.ongoingOperations.delete(operationKey);
    }
  }

  
  async cancelTokenConcurrently(tokenId, options = {}) {
    const operationKey = `cancel:${tokenId}`;

    if (this.ongoingOperations.has(operationKey)) {
      throw new AppError(
        'OPERATION_IN_PROGRESS',
        'Token cancellation is already in progress',
        { tokenId }
      );
    }

    this.ongoingOperations.set(operationKey, Date.now());

    try {
      return await this.lockManager.updateWithOptimisticLock(
        this.tokenRepository.model,
        tokenId,
        async (token) => {
          if (['completed', 'cancelled'].includes(token.status)) {
            throw new AppError(
              'TOKEN_ALREADY_PROCESSED',
              `Token is already ${token.status}`,
              { tokenId, currentStatus: token.status }
            );
          }

          // Update slot allocation in the same transaction
          await this.lockManager.executeTransaction(async (session) => {
            const slot = await this.slotRepository.model
              .findOne({ slotId: token.slotId })
              .session(session);

            if (slot) {
              await this.slotRepository.model
                .findByIdAndUpdate(
                  slot._id,
                  { $inc: { currentAllocation: -1 } },
                  { session }
                );
            }
          });

          return {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: options.reason || 'user_requested'
          };
        }
      );

    } finally {
      this.ongoingOperations.delete(operationKey);
    }
  }


  async moveTokenConcurrently(tokenId, newSlotId, options = {}) {
    const operationKey = `move:${tokenId}:${newSlotId}`;

    if (this.ongoingOperations.has(operationKey)) {
      throw new AppError(
        'OPERATION_IN_PROGRESS',
        'Token move is already in progress',
        { tokenId, newSlotId }
      );
    }

    this.ongoingOperations.set(operationKey, Date.now());

    try {
      return await this.lockManager.executeTransaction(async (session) => {
        // Find and lock the token
        const token = await this.tokenRepository.model
          .findById(tokenId)
          .session(session);

        if (!token) {
          throw new AppError('TOKEN_NOT_FOUND', `Token ${tokenId} not found`);
        }

        // Find and lock both slots
        const [oldSlot, newSlot] = await Promise.all([
          this.slotRepository.model.findOne({ slotId: token.slotId }).session(session),
          this.slotRepository.model.findOne({ slotId: newSlotId }).session(session)
        ]);

        if (!newSlot) {
          throw new AppError('SLOT_NOT_FOUND', `New slot ${newSlotId} not found`);
        }

        // Check new slot capacity
        const newSlotTokens = await this.tokenRepository.model
          .countDocuments({
            slotId: newSlotId,
            status: { $in: ['allocated', 'confirmed'] }
          })
          .session(session);

        if (newSlotTokens >= newSlot.maxCapacity) {
          throw new AppError(
            'SLOT_CAPACITY_EXCEEDED',
            'New slot is at maximum capacity',
            { newSlotId, currentTokens: newSlotTokens, maxCapacity: newSlot.maxCapacity }
          );
        }

        // Get next token number for new slot
        const newTokenNumber = await this.getNextTokenNumberAtomic(newSlotId, session);

        // Update token
        await this.tokenRepository.model
          .findByIdAndUpdate(
            tokenId,
            {
              'metadata.originalSlotId': token.slotId,
              slotId: newSlotId,
              tokenNumber: newTokenNumber,
              updatedAt: new Date()
            },
            { session }
          );

        // Update slot allocations
        if (oldSlot) {
          await this.slotRepository.model
            .findByIdAndUpdate(
              oldSlot._id,
              { $inc: { currentAllocation: -1 } },
              { session }
            );
        }

        await this.slotRepository.model
          .findByIdAndUpdate(
            newSlot._id,
            { $inc: { currentAllocation: 1 } },
            { session }
          );

        return {
          tokenId,
          oldSlotId: token.slotId,
          newSlotId,
          newTokenNumber
        };
      }, { context: `moveToken:${tokenId}` });

    } finally {
      this.ongoingOperations.delete(operationKey);
    }
  }

  
  async getNextTokenNumberAtomic(slotId, session) {
    const lastToken = await this.tokenRepository.model
      .findOne({ slotId })
      .sort({ tokenNumber: -1 })
      .session(session);

    return lastToken ? lastToken.tokenNumber + 1 : 1;
  }

  
  cleanupStaleOperations(maxAge = 300000) { // 5 minutes default
    const now = Date.now();
    for (const [key, timestamp] of this.ongoingOperations.entries()) {
      if (now - timestamp > maxAge) {
        this.ongoingOperations.delete(key);
        logger.warn(`Cleaned up stale operation: ${key}`, {
          age: now - timestamp,
          maxAge
        });
      }
    }
  }

  
  getOngoingOperations() {
    return Array.from(this.ongoingOperations.entries()).map(([key, timestamp]) => ({
      operation: key,
      startTime: new Date(timestamp),
      duration: Date.now() - timestamp
    }));
  }
}


const globalOptimisticLockManager = new OptimisticLockManager();

module.exports = {
  OptimisticLockManager,
  TokenConcurrencyManager,
  globalOptimisticLockManager,
  CONCURRENCY_ERRORS,
  DEFAULT_RETRY_CONFIG
};