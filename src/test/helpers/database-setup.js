const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

class DatabaseSetup {
  constructor() {
    this.mongoServer = null;
    this.connection = null;
  }

  async connect() {
    try {
      // Start in-memory MongoDB instance
      this.mongoServer = await MongoMemoryServer.create();
      const mongoUri = this.mongoServer.getUri();
      
      // Connect to the in-memory database
      this.connection = await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      console.log('✅ Test database connected');
      return true;
    } catch (error) {
      console.error('❌ Test database connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
      }
      if (this.mongoServer) {
        await this.mongoServer.stop();
      }
      console.log('✅ Test database disconnected');
    } catch (error) {
      console.error('❌ Test database disconnect failed:', error.message);
    }
  }

  async clearDatabase() {
    try {
      if (mongoose.connection.db) {
        const collections = await mongoose.connection.db.collections();
        for (const collection of collections) {
          await collection.deleteMany({});
        }
      }
    } catch (error) {
      console.error('❌ Database cleanup failed:', error.message);
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

module.exports = DatabaseSetup;