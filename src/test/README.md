# OPD Token Allocation System - Test Suite

## 🧪 Sequential Testing Flow

This test suite is designed to validate the OPD Token Allocation System step by step, from basic components to complex scenarios.

## 📁 Test Structure

```
src/test/
├── README.md                    # This file - testing overview
├── 01-foundation/              # Basic system components
│   ├── 01-database-connection.test.js
│   ├── 02-models.test.js
│   └── 03-repositories.test.js
├── 02-core-services/           # Business logic services
│   ├── 01-priority-calculation.test.js
│   ├── 02-slot-management.test.js
│   └── 03-token-allocation.test.js
├── 03-integration/             # Component interactions
│   ├── 01-basic-allocation-flow.test.js
│   ├── 02-emergency-scenarios.test.js
│   └── 03-concurrency-handling.test.js
├── 04-end-to-end/             # Complete user scenarios
│   ├── 01-patient-journey.test.js
│   ├── 02-doctor-operations.test.js
│   └── 03-system-performance.test.js
└── helpers/                   # Test utilities
    ├── test-data.js
    ├── database-setup.js
    └── assertions.js
```

## 🚀 How to Run Tests

### Sequential Testing (Recommended for Learning)
```bash
# Run tests in order to understand the system flow
npm test -- src/test/01-foundation/01-database-connection.test.js
npm test -- src/test/01-foundation/02-models.test.js
npm test -- src/test/01-foundation/03-repositories.test.js
npm test -- src/test/02-core-services/01-priority-calculation.test.js
# ... continue sequentially
```

### Category Testing
```bash
npm test -- src/test/01-foundation/        # Test foundation components
npm test -- src/test/02-core-services/     # Test business logic
npm test -- src/test/03-integration/       # Test component interactions
npm test -- src/test/04-end-to-end/        # Test complete scenarios
```

### All Tests
```bash
npm test                                    # Run all tests
```

## 📚 Learning Path

### Phase 1: Foundation (Understanding Basic Components)
1. **Database Connection** - Verify MongoDB connectivity
2. **Models** - Test data models and validation
3. **Repositories** - Test data access layer

### Phase 2: Core Services (Understanding Business Logic)
1. **Priority Calculation** - How patient priorities are determined
2. **Slot Management** - How time slots are managed
3. **Token Allocation** - Core allocation algorithm
3. **Token Allocation** - Core allocation algorithm

### Phase 3: Integration (Understanding Component Interactions)
1. **Basic Allocation Flow** - End-to-end allocation process
2. **Emergency Scenarios** - How emergencies are handled
3. **Concurrency Handling** - Multiple simultaneous requests

### Phase 4: End-to-End (Understanding Complete System)
1. **Patient Journey** - Complete patient experience
2. **Doctor Operations** - Doctor-side operations

## 🎯 What Each Test Validates

### Foundation Tests
- ✅ Database connectivity and configuration
- ✅ Model creation, validation, and methods
- ✅ Repository CRUD operations

### Core Service Tests
- ✅ Priority calculation algorithms
- ✅ Slot availability and management
- ✅ Token allocation logic and rules

### Integration Tests
- ✅ Service interactions and data flow
- ✅ Emergency preemption scenarios
- ✅ Concurrent request handling

### End-to-End Tests
- ✅ Complete user workflows
- ✅ Real-world scenarios and edge cases
- ✅ Performance under load

## 🔧 Test Configuration

Tests use:
- **Jest** as the test framework
- **MongoDB Memory Server** for isolated testing
- **Test factories** for consistent test data
- **Custom assertions** for domain-specific validations

## 📊 Expected Outcomes

After running all tests, you should understand:
1. How the OPD system components work individually
2. How components interact with each other
3. How the complete system handles real-world scenarios
4. System performance characteristics and limitations

## 🚨 Important Notes

- Tests are designed to run independently
- Each test cleans up after itself
- Tests use realistic but controlled data
- Performance tests may take longer to complete