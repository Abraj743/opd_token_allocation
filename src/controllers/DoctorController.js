const BaseController = require('./BaseController');


class DoctorController extends BaseController {
  constructor({ doctorService, logger }) {
    super({ logger });
    this.doctorService = doctorService;
  }

  
  async createDoctor(req, res) {
    const serviceResponse = await this.doctorService.createDoctor(req.body);
    this.logOperation(req, 'createDoctor', serviceResponse);
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getDoctorById(req, res) {
    const { id } = req.params;
    const serviceResponse = await this.doctorService.getDoctorById(id);
    this.logOperation(req, 'getDoctorById', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }


  async updateDoctor(req, res) {
    const { id } = req.params;
    const serviceResponse = await this.doctorService.updateDoctor(id, req.body);
    this.logOperation(req, 'updateDoctor', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getDoctors(req, res) {
    const criteria = this.buildFilterCriteria(req.query);
    const serviceResponse = await this.doctorService.getDoctors(criteria);
    this.logOperation(req, 'getDoctors', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  async getDoctorsBySpecialty(req, res) {
    const { specialty } = req.params;
    const serviceResponse = await this.doctorService.getDoctorsBySpecialty(specialty);
    this.logOperation(req, 'getDoctorsBySpecialty', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getActiveDoctors(req, res) {
    const serviceResponse = await this.doctorService.getActiveDoctors();
    this.logOperation(req, 'getActiveDoctors', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateDoctorStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    const serviceResponse = await this.doctorService.updateDoctorStatus(id, status);
    this.logOperation(req, 'updateDoctorStatus', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getDoctorSchedule(req, res) {
    const { id } = req.params;
    const { dayOfWeek } = req.query;
    const serviceResponse = await this.doctorService.getDoctorSchedule(id, parseInt(dayOfWeek));
    this.logOperation(req, 'getDoctorSchedule', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }


  async addScheduleSlot(req, res) {
    const { id } = req.params;
    const { dayOfWeek, slotData } = req.body;
    const serviceResponse = await this.doctorService.addScheduleSlot(id, dayOfWeek, slotData);
    this.logOperation(req, 'addScheduleSlot', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getDoctorStatistics(req, res) {
    const criteria = this.buildFilterCriteria(req.query);
    const serviceResponse = await this.doctorService.getDoctorStatistics(criteria);
    this.logOperation(req, 'getDoctorStatistics', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async searchDoctors(req, res) {
    const { q: searchTerm } = req.query;
    const options = {
      limit: parseInt(req.query.limit) || 20,
      skip: parseInt(req.query.skip) || 0,
      status: req.query.status,
      sort: req.query.sort ? JSON.parse(req.query.sort) : { name: 1 }
    };

    const serviceResponse = await this.doctorService.searchDoctors(searchTerm, options);
    this.logOperation(req, 'searchDoctors', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getDoctorsAvailableOnDay(req, res) {
    const { dayOfWeek } = req.params;
    const serviceResponse = await this.doctorService.getDoctorsAvailableOnDay(parseInt(dayOfWeek));
    this.logOperation(req, 'getDoctorsAvailableOnDay', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getEmergencyAvailableDoctors(req, res) {
    const serviceResponse = await this.doctorService.getEmergencyAvailableDoctors();
    this.logOperation(req, 'getEmergencyAvailableDoctors', serviceResponse);
    this.handleServiceResponse(res, serviceResponse);
  }

  
  buildFilterCriteria(query) {
    const criteria = {};

    if (query.status) {
      criteria.status = query.status;
    }

    if (query.specialty) {
      criteria.specialty = new RegExp(query.specialty, 'i');
    }

    if (query.emergencyAvailable === 'true') {
      criteria['preferences.emergencyAvailability'] = true;
    }

    if (query.minExperience) {
      criteria.experience = { $gte: parseInt(query.minExperience) };
    }

    if (query.maxExperience) {
      criteria.experience = { 
        ...criteria.experience, 
        $lte: parseInt(query.maxExperience) 
      };
    }

    return criteria;
  }
}

module.exports = DoctorController;