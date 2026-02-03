const createPatientRoutes = require('./patientRoutes');
const createTokenRoutes = require('./tokenRoutes');
const createSlotRoutes = require('./slotRoutes');
const createDoctorRoutes = require('./doctorRoutes');
const createDoctorScheduleRoutes = require('./doctorScheduleRoutes');
const createSimulationRoutes = require('./simulationRoutes');
const createCronRoutes = require('./cronRoutes');

/**
 * Creates and configures all API routes
 * @param {Object} container - Dependency injection container
 * @returns {Object} Object containing all configured routers
 */
function createRoutes(container) {
  return {
    patients: createPatientRoutes(container),
    tokens: createTokenRoutes(container),
    slots: createSlotRoutes(container),
    doctors: createDoctorRoutes(container),
    doctorSchedules: createDoctorScheduleRoutes(container),
    simulation: createSimulationRoutes(container),
    cron: createCronRoutes(container)
  };
}

module.exports = {
  createRoutes,
  createPatientRoutes,
  createTokenRoutes,
  createSlotRoutes,
  createDoctorRoutes,
  createDoctorScheduleRoutes,
  createSimulationRoutes,
  createCronRoutes
};