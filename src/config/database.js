const mongoose = require('mongoose');
const winston = require('winston');

class DatabaseConfig {
  constructor() {
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/opd_token_allocation';
    this.options = {

      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
      maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME) || 30000,
      
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
      connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT) || 10000,
      
      retryWrites: true,
      retryReads: true,
      w: 'majority',
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: process.env.NODE_ENV === 'test' 
        ? { w: 1, j: false }
        : { w: 'majority', j: true },
      
      heartbeatFrequencyMS: parseInt(process.env.DB_HEARTBEAT_FREQUENCY) || 10000
    };
    
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = parseInt(process.env.DB_MAX_CONNECTION_ATTEMPTS) || 5;
    this.reconnectDelay = parseInt(process.env.DB_RECONNECT_DELAY) || 5000;
  }

  async connect() {
    try {
      await mongoose.connect(this.connectionString, this.options);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      winston.info('MongoDB connected successfully', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        poolSize: this.options.maxPoolSize,
        readPreference: this.options.readPreference
      });
      
      this.setupConnectionHandlers();
      
      return mongoose.connection;
    } catch (error) {
      this.isConnected = false;
      this.connectionAttempts++;
      
      winston.error('MongoDB connection failed:', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxAttempts: this.maxConnectionAttempts
      });
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = this.calculateReconnectDelay(this.connectionAttempts);
        winston.info(`Retrying connection in ${delay}ms...`);
        
        await this.sleep(delay);
        return this.connect();
      }
      
      throw error;
    }
  }

  setupConnectionHandlers() {
    mongoose.connection.on('error', (error) => {
      this.isConnected = false;
      winston.error('MongoDB connection error:', {
        error: error.message,
        code: error.code,
        name: error.name
      });
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      winston.warn('MongoDB disconnected');
      
      if (!this.intentionalDisconnect) {
        this.handleReconnection();
      }
    });

    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      this.connectionAttempts = 0;
      winston.info('MongoDB reconnected successfully');
    });

    mongoose.connection.on('timeout', () => {
      winston.warn('MongoDB connection timeout');
    });

    mongoose.connection.on('serverSelectionFailed', (error) => {
      winston.error('MongoDB server selection failed:', error);
    });

    mongoose.connection.on('fullsetup', () => {
      winston.info('MongoDB replica set fully connected');
    });

    mongoose.connection.on('all', () => {
      winston.debug('MongoDB all servers connected');
    });

    mongoose.connection.on('close', () => {
      winston.info('MongoDB connection closed');
    });
  }

  async handleReconnection() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      winston.error('Maximum reconnection attempts reached, giving up');
      return;
    }

    const delay = this.calculateReconnectDelay(this.connectionAttempts);
    winston.info(`Attempting to reconnect to MongoDB in ${delay}ms...`, {
      attempt: this.connectionAttempts + 1,
      maxAttempts: this.maxConnectionAttempts
    });

    await this.sleep(delay);
    
    try {
      await this.connect();
    } catch (error) {
      winston.error('Reconnection attempt failed:', error);
    }
  }

  calculateReconnectDelay(attempt) {
    const baseDelay = this.reconnectDelay;
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    return delay + Math.random() * 1000;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect() {
    try {
      this.intentionalDisconnect = true;
      await mongoose.disconnect();
      this.isConnected = false;
      winston.info('MongoDB disconnected successfully');
    } catch (error) {
      winston.error('Error disconnecting from MongoDB:', error);
      throw error;
    } finally {
      this.intentionalDisconnect = false;
    }
  }

  async checkHealth() {
    try {
      const connection = mongoose.connection;
      
      if (!this.isConnected || connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      await connection.db.admin().ping();
  
      const collections = await connection.db.listCollections().toArray();
      const collectionNames = collections.map(col => col.name);
      
      return {
        connection: 'healthy',
        readyState: connection.readyState,
        host: connection.host,
        port: connection.port,
        name: connection.name,
        collections: collectionNames,
        poolSize: {
          max: this.options.maxPoolSize,
          min: this.options.minPoolSize
        },
        uptime: Date.now() - connection.startTime
      };
    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }


  async isHealthy() {
    try {
      if (!this.isConnected || mongoose.connection.readyState !== 1) {
        return false;
      }

      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      winston.warn('Database health check failed:', error);
      return false;
    }
  }

  getConnectionStats() {
    const connection = mongoose.connection;
    
    return {
      isConnected: this.isConnected,
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      database: connection.name,
      connectionAttempts: this.connectionAttempts,
      maxConnectionAttempts: this.maxConnectionAttempts,
      poolSize: {
        max: this.options.maxPoolSize,
        min: this.options.minPoolSize,
        current: connection.db ? connection.db.serverConfig.poolSize : 0
      }
    };
  }

  async forceReconnect() {
    winston.info('Forcing database reconnection...');
    
    try {
      await this.disconnect();
      await this.sleep(1000);
      await this.connect();
    } catch (error) {
      winston.error('Force reconnect failed:', error);
      throw error;
    }
  }
}

module.exports = DatabaseConfig;