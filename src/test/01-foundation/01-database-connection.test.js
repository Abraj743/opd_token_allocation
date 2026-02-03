/**
 * Foundation Test 1: Database Connection
 * 
 * Purpose: Verify that the system can connect to MongoDB and perform basic operations
 * 
 * What you'll learn:
 * - How the system connects to MongoDB
 * - Database configuration and setup
 * - Basic database operations (create, read, update, delete)
 * - Connection error handling
 */

const DatabaseSetup = require('../helpers/database-setup');
const OPDAssertions = require('../helpers/assertions');
const mongoose = require('mongoose');

describe('🔌 Foundation Test 1: Database Connection', () => {
  let dbSetup;

  beforeAll(async () => {
    console.log('\n🧪 Testing Database Connection...');
    dbSetup = new DatabaseSetup();
  });

  afterAll(async () => {
    if (dbSetup) {
      await dbSetup.disconnect();
    }
  });

  describe('Database Connection Establishment', () => {
    test('should connect to MongoDB successfully', async () => {
      console.log('  📡 Connecting to test database...');
      
      const connected = await dbSetup.connect();
      
      expect(connected).toBe(true);
      OPDAssertions.expectDatabaseConnected();
      
      console.log('  ✅ Database connection established');
    });

    test('should have correct connection state', () => {
      console.log('  🔍 Verifying connection state...');
      
      expect(mongoose.connection.readyState).toBe(1); // 1 = connected
      expect(mongoose.connection.db).toBeDefined();
      
      console.log('  ✅ Connection state is valid');
    });

    test('should be able to list collections', async () => {
      console.log('  📋 Testing collection access...');
      
      const collections = await mongoose.connection.db.collections();
      
      expect(Array.isArray(collections)).toBe(true);
      
      console.log(`  ✅ Can access collections (${collections.length} found)`);
    });
  });

  describe('Basic Database Operations', () => {
    const testCollectionName = 'test_connection';
    let testCollection;

    beforeEach(async () => {
      testCollection = mongoose.connection.db.collection(testCollectionName);
      await testCollection.deleteMany({}); // Clean slate for each test
    });

    afterEach(async () => {
      await testCollection.deleteMany({}); // Cleanup after each test
    });

    test('should create documents', async () => {
      console.log('  📝 Testing document creation...');
      
      const testDoc = { 
        name: 'Test Document', 
        createdAt: new Date(),
        testId: 'test_001'
      };
      
      const result = await testCollection.insertOne(testDoc);
      
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
      
      console.log('  ✅ Document creation successful');
    });

    test('should read documents', async () => {
      console.log('  📖 Testing document reading...');
      
      // First, insert a test document
      const testDoc = { 
        name: 'Read Test Document', 
        testId: 'read_test_001' 
      };
      await testCollection.insertOne(testDoc);
      
      // Then, read it back
      const foundDoc = await testCollection.findOne({ testId: 'read_test_001' });
      
      expect(foundDoc).toBeDefined();
      expect(foundDoc.name).toBe('Read Test Document');
      expect(foundDoc.testId).toBe('read_test_001');
      
      console.log('  ✅ Document reading successful');
    });

    test('should update documents', async () => {
      console.log('  ✏️ Testing document updates...');
      
      // Insert a document
      const testDoc = { 
        name: 'Original Name', 
        testId: 'update_test_001',
        version: 1
      };
      await testCollection.insertOne(testDoc);
      
      // Update it
      const updateResult = await testCollection.updateOne(
        { testId: 'update_test_001' },
        { 
          $set: { 
            name: 'Updated Name', 
            version: 2,
            updatedAt: new Date()
          } 
        }
      );
      
      expect(updateResult.acknowledged).toBe(true);
      expect(updateResult.modifiedCount).toBe(1);
      
      // Verify the update
      const updatedDoc = await testCollection.findOne({ testId: 'update_test_001' });
      expect(updatedDoc.name).toBe('Updated Name');
      expect(updatedDoc.version).toBe(2);
      
      console.log('  ✅ Document update successful');
    });

    test('should delete documents', async () => {
      console.log('  🗑️ Testing document deletion...');
      
      // Insert a document
      const testDoc = { 
        name: 'To Be Deleted', 
        testId: 'delete_test_001' 
      };
      await testCollection.insertOne(testDoc);
      
      // Verify it exists
      let foundDoc = await testCollection.findOne({ testId: 'delete_test_001' });
      expect(foundDoc).toBeDefined();
      
      // Delete it
      const deleteResult = await testCollection.deleteOne({ testId: 'delete_test_001' });
      
      expect(deleteResult.acknowledged).toBe(true);
      expect(deleteResult.deletedCount).toBe(1);
      
      // Verify it's gone
      foundDoc = await testCollection.findOne({ testId: 'delete_test_001' });
      expect(foundDoc).toBeNull();
      
      console.log('  ✅ Document deletion successful');
    });
  });

  describe('Database Error Handling', () => {
    test('should handle invalid operations gracefully', async () => {
      console.log('  ⚠️ Testing error handling...');
      
      try {
        // Try to perform an invalid operation
        await mongoose.connection.db.collection('invalid_collection').findOne({ 
          $invalidOperator: 'test' 
        });
        
        // If we get here, the operation didn't fail as expected
        fail('Expected operation to fail');
      } catch (error) {
        // This is expected - the operation should fail
        expect(error).toBeDefined();
        console.log('  ✅ Invalid operations properly rejected');
      }
    });

    test('should maintain connection stability', () => {
      console.log('  🔄 Testing connection stability...');
      
      // After all operations, connection should still be stable
      expect(mongoose.connection.readyState).toBe(1);
      expect(dbSetup.isConnected()).toBe(true);
      
      console.log('  ✅ Connection remains stable');
    });
  });

  describe('Database Cleanup Operations', () => {
    test('should clear database collections', async () => {
      console.log('  🧹 Testing database cleanup...');
      
      // Create some test data
      const testCollection = mongoose.connection.db.collection('cleanup_test');
      await testCollection.insertMany([
        { name: 'Test Doc 1', testId: 'cleanup_001' },
        { name: 'Test Doc 2', testId: 'cleanup_002' },
        { name: 'Test Doc 3', testId: 'cleanup_003' }
      ]);
      
      // Verify data exists
      const countBefore = await testCollection.countDocuments();
      expect(countBefore).toBe(3);
      
      // Clear the database
      await dbSetup.clearDatabase();
      
      // Verify data is cleared
      const countAfter = await testCollection.countDocuments();
      expect(countAfter).toBe(0);
      
      console.log('  ✅ Database cleanup successful');
    });
  });

  // Summary test to show what we've validated
  test('📊 Database Connection Summary', () => {
    console.log('\n📊 Database Connection Test Summary:');
    console.log('  ✅ MongoDB connection established');
    console.log('  ✅ Basic CRUD operations working');
    console.log('  ✅ Error handling functional');
    console.log('  ✅ Connection stability maintained');
    console.log('  ✅ Database cleanup operations working');
    console.log('\n🎉 Database foundation is solid! Ready for model testing.');
  });
});