const BaseController = require('./BaseController');

class CronController extends BaseController {
  constructor({ slotGenerationService, logger }) {
    super({ logger });
    this.slotGenerationService = slotGenerationService;
  }

  async generateSlotsForToday(req, res) {
    const serviceResponse = await this.slotGenerationService.generateSlotsForToday();
    this.logOperation(req, 'generateSlotsForToday', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  async generateSlotsForDate(req, res) {
    const { date } = req.params;
    
    const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Invalid date format. Use YYYY-MM-DD format.'
        }
      });
    }
    
    const [, year, month, day] = dateMatch;
    const targetDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    
    this.logger.info(`Generating slots for date: ${date} -> ${targetDate.toISOString()} (${targetDate.toDateString()})`);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Invalid date format. Use YYYY-MM-DD format.'
        }
      });
    }

    const serviceResponse = await this.slotGenerationService.generateSlotsForDate(targetDate);
    this.logOperation(req, 'generateSlotsForDate', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getGenerationStatistics(req, res) {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const serviceResponse = await this.slotGenerationService.getGenerationStatistics(start, end);
    this.logOperation(req, 'getGenerationStatistics', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }
}

module.exports = CronController;