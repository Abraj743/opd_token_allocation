const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');


const environmentConfig = require('./config/environment');
const DatabaseConfig = require('./config/database');
const logger = require('./config/logger');

const { createDIContainer, initializeServices, shutdownServices } = require('./container');

// Import routes
const { createRoutes } = require('./routers');

class Server {
  constructor() {
    this.app = express();
    this.port = environmentConfig.get('port');
    this.databaseConfig = new DatabaseConfig();
    this.container = null;
    
    this.setupMiddleware();
    // Error handling will be set up after routes in start() method
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' ? false : true,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: environmentConfig.get('security').rateLimitWindowMs,
      max: environmentConfig.get('security').rateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.http(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Basic health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
      });
    });

    // Database health check endpoint
    this.app.get('/health/database', async (req, res) => {
      try {
        const dbStatus = await this.databaseConfig.checkHealth();
        res.status(200).json({
          success: true,
          database: {
            status: 'connected',
            connection: dbStatus.connection,
            readyState: dbStatus.readyState,
            host: dbStatus.host,
            name: dbStatus.name,
            collections: dbStatus.collections || []
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Database health check failed:', error);
        res.status(503).json({
          success: false,
          database: {
            status: 'disconnected',
            error: error.message
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    // Detailed system health check endpoint
    this.app.get('/health/system', async (req, res) => {
      try {
        const dbStatus = await this.databaseConfig.checkHealth();
        
        res.status(200).json({
          success: true,
          system: {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV,
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
          },
          database: {
            status: 'connected',
            connection: dbStatus.connection,
            readyState: dbStatus.readyState,
            host: dbStatus.host,
            name: dbStatus.name
          },
          services: {
            container: this.container ? 'initialized' : 'not_initialized'
          }
        });
      } catch (error) {
        logger.error('System health check failed:', error);
        res.status(503).json({
          success: false,
          system: {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          }
        });
      }
    });

    // Setup API routes with dependency injection
    this.setupAPIRoutes();
  }

  setupAPIRoutes() {
    if (!this.container) {
      logger.warn('Container not initialized, skipping API routes setup');
      return;
    }

    try {
      // Create all routes using the router factory
      const routes = createRoutes(this.container);

      // Mount all routes
      this.app.use('/api/patients', routes.patients);
      this.app.use('/api/tokens', routes.tokens);
      this.app.use('/api/slots', routes.slots);
      this.app.use('/api/doctors', routes.doctors);
      this.app.use('/api/doctor-schedules', routes.doctorSchedules);
      this.app.use('/api/simulation', routes.simulation);
      this.app.use('/api/cron', routes.cron);

      logger.info('API routes configured successfully');
    } catch (error) {
      logger.error('Error setting up API routes:', error);
    }
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.originalUrl} not found`,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      
      res.status(error.status || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_SERVER_ERROR',
          message: error.message || 'An unexpected error occurred',
          timestamp: new Date().toISOString(),
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }
      });
    });
  }

  async start() {
    try {
      // Connect to database
      await this.databaseConfig.connect();
      
      // Create and initialize dependency injection container
      this.container = createDIContainer();
      await initializeServices(this.container);
      
      // Setup routes after container is ready
      this.setupRoutes();
      
      // Setup error handling AFTER routes
      this.setupErrorHandling();
      
      // Start server
      this.server = this.app.listen(this.port, () => {
        logger.info(`OPD Token Allocation Engine started on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Health check: http://localhost:${this.port}/health`);
        logger.info(`API endpoints: http://localhost:${this.port}/api`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down server...');
    
    if (this.server) {
      this.server.close(() => {
        logger.info('HTTP server closed');
      });
    }
    
    // Shutdown services
    if (this.container) {
      await shutdownServices(this.container);
    }
    
    await this.databaseConfig.disconnect();
    process.exit(0);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start();
}

module.exports = Server;