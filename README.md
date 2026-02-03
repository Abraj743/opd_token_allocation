# OPD Token Allocation Engine

A hospital management system designed to efficiently allocate patient tokens across doctor time slots while handling real-world variability such as delays, cancellations, and emergency insertions.

## Features

- **Multi-source Token Management**: Handle tokens from online booking, walk-in patients, priority patients, follow-ups, and emergencies
- **Priority-based Allocation**: Sophisticated priority algorithm with dynamic adjustments
- **Dynamic Reallocation**: Handle schedule changes, cancellations, and emergency insertions
- **Capacity Management**: Enforce slot capacity limits with real-time tracking
- **RESTful API**: Complete API for integration with existing hospital systems
- **Audit Logging**: Comprehensive logging for all allocation decisions
- **Simulation Support**: Test system behavior with realistic OPD scenarios

## Technology Stack

- **Runtime**: Node.js with JavaScript (ES6+)
- **Web Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Dependency Injection**: Awilix container
- **Configuration**: dotenv for environment variables
- **Logging**: Winston for structured logging
- **Validation**: Joi for request validation
- **Testing**: Jest for unit tests, fast-check for property-based testing

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v5.0 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd opd-token-allocation-engine
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Health Check

Visit `http://localhost:3000/health` to verify the server is running.

## Project Structure

```
src/
├── config/           # Configuration files
│   ├── database.js   # MongoDB connection configuration
│   ├── environment.js # Environment variable management
│   └── logger.js     # Winston logging configuration
├── controllers/      # HTTP request handlers (coming soon)
├── services/         # Business logic layer (coming soon)
├── repositories/     # Data access layer (coming soon)
├── models/           # Mongoose schemas (coming soon)
├── middleware/       # Express middleware (coming soon)
├── utils/            # Utility functions and constants
│   └── constants.js  # Application constants
└── server.js         # Main server file
```

## Testing

### 🎓 Learning-Oriented Sequential Testing (Recommended)

For understanding how the system works step-by-step:

```bash
# Interactive test menu - choose what to run
npm run test:sequential

# Run all tests with guided explanations
npm run test:all-guided

# Run only foundation tests (Database, Models, Repositories)
npm run test:foundation

# Run only core services tests (Priority, Slot Management)
npm run test:services

# Show test structure overview
npm run test:structure
```

### 🚀 Production Validation Testing

For comprehensive system validation with real database:

```bash
# Run comprehensive end-to-end test with MongoDB
npm run test:comprehensive
```

### 🔧 Development Testing

For regular development and debugging:

```bash
# Run all Jest tests
npm test

# Run tests with coverage
npm run test:coverage

# Run property-based tests
npm run test:pbt

# Watch mode for development
npm run test:watch
```

### 📚 Test Structure

```
src/test/
├── README.md                    # Testing overview and guide
├── run-sequential-tests.js      # Interactive test runner
├── helpers/                     # Test utilities
│   ├── database-setup.js        # Test database management
│   ├── test-data.js            # Test data factories
│   └── assertions.js           # Custom assertions
├── 01-foundation/              # Basic system components
│   ├── 01-database-connection.test.js
│   ├── 02-models.test.js
│   └── 03-repositories.test.js
└── 02-core-services/           # Business logic services
    ├── 01-priority-calculation.test.js
    └── 02-slot-management.test.js
```

### 🎯 Which Testing Approach to Use?

- **New to the system?** → Use `npm run test:sequential` to learn step-by-step
- **Validating for production?** → Use `npm run test:comprehensive` for full validation
- **Developing features?** → Use `npm test` for fast feedback
- **Debugging issues?** → Run specific test files with `npm test -- path/to/test.js`

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:pbt` - Run property-based tests only
- `npm run test:sequential` - Interactive sequential test runner
- `npm run test:foundation` - Run foundation tests only
- `npm run test:services` - Run core services tests only
- `npm run test:comprehensive` - Run comprehensive system validation
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port
- `MONGODB_URI` - MongoDB connection string

### Optional Variables

- `LOG_LEVEL` - Logging level (default: info)
- `JWT_SECRET` - JWT signing secret
- `RATE_LIMIT_WINDOW_MS` - Rate limiting window
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window

## API Documentation

The API is currently under development. Available endpoints:

- `GET /health` - Health check endpoint
- `GET /api` - API information and available endpoints

More endpoints will be added as development progresses.

## Development Status

This project is currently in active development. The following components are implemented:

- ✅ Project structure and dependencies
- ✅ Configuration management
- ✅ Database connection setup
- ✅ Logging system
- ✅ Basic Express server
- ⏳ Data models (in progress)
- ⏳ Business services (planned)
- ⏳ API controllers (planned)
- ⏳ Testing suite (planned)

## Contributing

This project follows the spec-driven development methodology. Please refer to the design document and requirements before making changes.

## License

MIT License