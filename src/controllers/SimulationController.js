const BaseController = require('./BaseController');


class SimulationController extends BaseController {
  constructor({ simulationService, simulationReportingService, logger }) {
    super({ logger });
    this.simulationService = simulationService;
    this.simulationReportingService = simulationReportingService;
  }

  
  async executeControllerOperation(operationName, req, res, operation) {
    try {
      const result = await operation();
      this.logOperation(req, operationName, result);
      this.handleServiceResponse(res, result);
    } catch (error) {
      this.logger.error(`Error in ${operationName}:`, error);
      this.sendError(res, 'INTERNAL_ERROR', error.message, 500);
    }
  }

  
  async runOPDDaySimulation(req, res) {
    return this.executeControllerOperation('runOPDDaySimulation', req, res, async () => {
      const {
        doctorCount = 3,
        simulationDate,
        durationHours = 8,
        patientsPerHour = 5,
        realTime = false,
        generateReport = true
      } = req.body;

      const simDate = simulationDate ? new Date(simulationDate) : new Date();

      const simulationResult = await this.simulationService.runOPDDaySimulation({
        doctorCount,
        simulationDate: simDate,
        durationHours,
        patientsPerHour,
        realTime
      });

      if (!simulationResult.success) {
        return simulationResult;
      }

      let response = simulationResult;

      if (generateReport) {
        const reportResult = await this.simulationReportingService.generateSimulationReport(
          simulationResult.data
        );

        if (reportResult.success) {
          response.data.detailedReport = reportResult.data;
        }
      }

      return response;
    });
  }

  
  async getSimulationStatus(req, res) {
    return this.executeControllerOperation('getSimulationStatus', req, res, async () => {
      return await this.simulationService.getSimulationStatus();
    });
  }

  
  async stopSimulation(req, res) {
    return this.executeControllerOperation('stopSimulation', req, res, async () => {
      return this.simulationService.stopSimulation();
    });
  }

  
  async generateReport(req, res) {
    return this.executeControllerOperation('generateReport', req, res, async () => {
      const { simulationResults } = req.body;

      if (!simulationResults) {
        return {
          success: false,
          error: {
            code: 'MISSING_SIMULATION_RESULTS',
            message: 'Simulation results are required to generate report'
          }
        };
      }

      return await this.simulationReportingService.generateSimulationReport(simulationResults);
    });
  }

  
  async runQuickTest(req, res) {
    return this.executeControllerOperation('runQuickTest', req, res, async () => {
      const simulationResult = await this.simulationService.runOPDDaySimulation({
        doctorCount: 2,
        simulationDate: new Date(),
        durationHours: 2,
        patientsPerHour: 3,
        realTime: false
      });

      if (!simulationResult.success) {
        return simulationResult;
      }

      const basicMetrics = this.generateBasicMetrics(simulationResult.data);

      return {
        success: true,
        data: {
          simulation: simulationResult.data,
          basicMetrics
        },
        message: 'Quick simulation test completed'
      };
    });
  }

  async getSimulationConfig(req, res) {
    return this.executeControllerOperation('getSimulationConfig', req, res, async () => {
      const config = {
        defaultOptions: {
          doctorCount: 3,
          durationHours: 8,
          patientsPerHour: 5,
          realTime: false
        },
        limits: {
          maxDoctors: 10,
          maxDurationHours: 12,
          maxPatientsPerHour: 20
        },
        specialties: [
          'General Medicine',
          'Cardiology',
          'Dermatology',
          'Orthopedics',
          'Pediatrics'
        ],
        patientSources: [
          'online',
          'walkin',
          'priority',
          'followup',
          'emergency'
        ],
        reportOptions: {
          includeCharts: true,
          includeRecommendations: true,
          includeDetailedMetrics: true
        }
      };

      return {
        success: true,
        data: config,
        message: 'Simulation configuration retrieved'
      };
    });
  }

  
  async validateSimulationParams(req, res) {
    return this.executeControllerOperation('validateSimulationParams', req, res, async () => {
      const {
        doctorCount,
        durationHours,
        patientsPerHour,
        simulationDate
      } = req.body;

      const validation = {
        isValid: true,
        errors: [],
        warnings: []
      };

      if (doctorCount !== undefined) {
        if (doctorCount < 1 || doctorCount > 10) {
          validation.errors.push('Doctor count must be between 1 and 10');
          validation.isValid = false;
        }
      }

      if (durationHours !== undefined) {
        if (durationHours < 1 || durationHours > 12) {
          validation.errors.push('Duration must be between 1 and 12 hours');
          validation.isValid = false;
        }
      }

      if (patientsPerHour !== undefined) {
        if (patientsPerHour < 1 || patientsPerHour > 20) {
          validation.errors.push('Patients per hour must be between 1 and 20');
          validation.isValid = false;
        }
      }

      if (simulationDate) {
        const simDate = new Date(simulationDate);
        if (isNaN(simDate.getTime())) {
          validation.errors.push('Invalid simulation date format');
          validation.isValid = false;
        }
      }

      if (doctorCount && patientsPerHour && durationHours) {
        const totalPatients = patientsPerHour * durationHours;
        const totalCapacity = doctorCount * 6 * 12;

        if (totalPatients > totalCapacity * 0.9) {
          validation.warnings.push('High patient load may result in allocation failures');
        }

        if (totalPatients < totalCapacity * 0.3) {
          validation.warnings.push('Low patient load may result in underutilized resources');
        }
      }

      return {
        success: true,
        data: validation,
        message: validation.isValid ? 'Parameters are valid' : 'Parameter validation failed'
      };
    });
  }

  
  async getSimulationHistory(req, res) {
    return this.executeControllerOperation('getSimulationHistory', req, res, async () => {
      const history = [
        {
          simulationId: 'sim_1234567890',
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
          duration: '45s',
          doctorCount: 3,
          totalPatients: 40,
          successRate: 92.5,
          status: 'completed'
        },
        {
          simulationId: 'sim_1234567889',
          startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          duration: '38s',
          doctorCount: 2,
          totalPatients: 24,
          successRate: 95.8,
          status: 'completed'
        }
      ];

      return {
        success: true,
        data: {
          history,
          totalSimulations: history.length
        },
        message: 'Simulation history retrieved'
      };
    });
  }

  generateBasicMetrics(simulationData) {
    const { events, metrics } = simulationData;
    const successfulEvents = events.filter(e => e.success);

    return {
      summary: {
        totalEvents: events.length,
        successful: successfulEvents.length,
        failed: events.length - successfulEvents.length,
        successRate: `${((successfulEvents.length / events.length) * 100).toFixed(1)}%`
      },
      breakdown: {
        bySource: this.calculateSourceBreakdown(events),
        bySpecialty: this.calculateSpecialtyBreakdown(successfulEvents),
        byHour: this.calculateHourlyBreakdown(events)
      },
      performance: {
        emergenciesHandled: events.filter(e => e.type === 'emergency_arrival' && e.success).length,
        totalPreemptions: successfulEvents.reduce((sum, e) => sum + (e.preemptedTokens || 0), 0),
        averageProcessingTime: '150ms'
      }
    };
  }

  calculateSourceBreakdown(events) {
    const breakdown = {};
    
    events.forEach(event => {
      if (!breakdown[event.source]) {
        breakdown[event.source] = { total: 0, successful: 0 };
      }
      breakdown[event.source].total++;
      if (event.success) {
        breakdown[event.source].successful++;
      }
    });

    Object.keys(breakdown).forEach(source => {
      const data = breakdown[source];
      data.successRate = `${((data.successful / data.total) * 100).toFixed(1)}%`;
    });

    return breakdown;
  }

  calculateSpecialtyBreakdown(successfulEvents) {
    const breakdown = {};
    
    successfulEvents.forEach(event => {
      if (event.specialty) {
        breakdown[event.specialty] = (breakdown[event.specialty] || 0) + 1;
      }
    });

    return breakdown;
  }

  
  calculateHourlyBreakdown(events) {
    const breakdown = {};
    
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      const hourKey = `${hour}:00`;
      
      if (!breakdown[hourKey]) {
        breakdown[hourKey] = { total: 0, successful: 0 };
      }
      
      breakdown[hourKey].total++;
      if (event.success) {
        breakdown[hourKey].successful++;
      }
    });

    return breakdown;
  }

}

module.exports = SimulationController;