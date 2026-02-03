const { createContainer, asClass, asFunction, asValue, Lifetime } = require('awilix');
const logger = require('./config/logger');

// Import repositories
const PatientRepository = require('./repositories/PatientRepository');
const TokenRepository = require('./repositories/TokenRepository');
const SlotRepository = require('./repositories/SlotRepository');
const ConfigurationRepository = require('./repositories/ConfigurationRepository');
const DoctorRepository = require('./repositories/DoctorRepository');

// Import services
const PatientService = require('./services/PatientService');
const TokenAllocationService = require('./services/TokenAllocationService');
const SlotManagementService = require('./services/SlotManagementService');
const PriorityCalculationService = require('./services/PriorityCalculationService');
const ConfigurationService = require('./services/ConfigurationService');
const DoctorService = require('./services/DoctorService');
const SimulationService = require('./services/SimulationService');
const SimulationReportingService = require('./services/SimulationReportingService');
const SlotGenerationService = require('./services/SlotGenerationService');
const DoctorScheduleService = require('./services/DoctorScheduleService');

// Import controllers
const PatientController = require('./controllers/PatientController');
const TokenController = require('./controllers/TokenController');
const SlotController = require('./controllers/SlotController');
const DoctorController = require('./controllers/DoctorController');
const DoctorScheduleController = require('./controllers/DoctorScheduleController');
const SimulationController = require('./controllers/SimulationController');
const CronController = require('./controllers/CronController');

// Import models
const models = require('./models');


function createDIContainer() {
  const container = createContainer({
    injectionMode: 'PROXY'
  });

  try {
    // Register models as values (they are Mongoose models)
    container.register({
      patientModel: asValue(models.Patient),
      tokenModel: asValue(models.Token),
      timeSlotModel: asValue(models.TimeSlot),
      doctorModel: asValue(models.Doctor),
      configurationModel: asValue(models.Configuration),
      doctorScheduleModel: asValue(models.DoctorSchedule)
    });

    // Register repositories as classes with singleton lifetime
    container.register({
      patientRepository: asClass(PatientRepository, { lifetime: Lifetime.SINGLETON }),
      tokenRepository: asClass(TokenRepository, { lifetime: Lifetime.SINGLETON }),
      slotRepository: asClass(SlotRepository, { lifetime: Lifetime.SINGLETON }),
      configurationRepository: asClass(ConfigurationRepository, { lifetime: Lifetime.SINGLETON }),
      doctorRepository: asClass(DoctorRepository, { lifetime: Lifetime.SINGLETON })
    });

    // Register services as classes with singleton lifetime
    container.register({
      configurationService: asClass(ConfigurationService, { lifetime: Lifetime.SINGLETON }),
      priorityCalculationService: asClass(PriorityCalculationService, { lifetime: Lifetime.SINGLETON }),
      patientService: asClass(PatientService, { lifetime: Lifetime.SINGLETON }),
      doctorService: asClass(DoctorService, { lifetime: Lifetime.SINGLETON }),
      slotManagementService: asClass(SlotManagementService, { lifetime: Lifetime.SINGLETON }),
      tokenAllocationService: asClass(TokenAllocationService, { lifetime: Lifetime.SINGLETON }),
      simulationService: asClass(SimulationService, { lifetime: Lifetime.SINGLETON }),
      simulationReportingService: asClass(SimulationReportingService, { lifetime: Lifetime.SINGLETON }),
      slotGenerationService: asClass(SlotGenerationService, { lifetime: Lifetime.SINGLETON }),
      doctorScheduleService: asClass(DoctorScheduleService, { lifetime: Lifetime.SINGLETON })
    });

    // Register controllers as classes with scoped lifetime (new instance per request)
    container.register({
      patientController: asClass(PatientController, { lifetime: Lifetime.SCOPED }),
      tokenController: asClass(TokenController, { lifetime: Lifetime.SCOPED }),
      slotController: asClass(SlotController, { lifetime: Lifetime.SCOPED }),
      doctorController: asClass(DoctorController, { lifetime: Lifetime.SCOPED }),
      doctorScheduleController: asClass(DoctorScheduleController, { lifetime: Lifetime.SCOPED }),
      simulationController: asClass(SimulationController, { lifetime: Lifetime.SCOPED }),
      cronController: asClass(CronController, { lifetime: Lifetime.SCOPED })
    });

    // Register utility services
    container.register({
      logger: asValue(logger)
    });

    logger.info('Dependency injection container configured successfully');
    return container;

  } catch (error) {
    logger.error('Failed to configure dependency injection container:', error);
    throw error;
  }
}


async function initializeServices(container) {
  try {
    logger.info('Initializing services...');

    // Initialize configuration service first (other services may depend on it)
    const configurationService = container.resolve('configurationService');
    await configurationService.initialize();

    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}


async function shutdownServices(container) {
  try {
    logger.info('Shutting down services...');

    // Get all registered services that might need cleanup
    const services = [
      'configurationService',
      'tokenAllocationService',
      'slotManagementService',
      'patientService'
    ];

    // Call shutdown method on services that have it
    for (const serviceName of services) {
      try {
        const service = container.resolve(serviceName);
        if (typeof service.shutdown === 'function') {
          await service.shutdown();
          logger.debug(`${serviceName} shut down successfully`);
        }
      } catch (error) {
        logger.warn(`Error shutting down ${serviceName}:`, error);
      }
    }

    // Dispose of the container
    container.dispose();
    logger.info('Services shut down successfully');

  } catch (error) {
    logger.error('Error during service shutdown:', error);
    throw error;
  }
}

module.exports = {
  createDIContainer,
  initializeServices,
  shutdownServices
};