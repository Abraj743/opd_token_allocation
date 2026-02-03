const BaseController = require('./BaseController');


class DoctorScheduleController extends BaseController {
  constructor({ doctorScheduleService, logger }) {
    super({ logger });
    this.doctorScheduleService = doctorScheduleService;
  }

  
  async createSchedule(req, res) {
    const params = this.extractParams(req, ['doctorId', 'department', 'weeklySchedule']);
    
    const serviceResponse = await this.doctorScheduleService.createSchedule(params);
    this.logOperation(req, 'createSchedule', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse, 201);
  }

  
  async getSchedules(req, res) {
    const params = this.extractParams(req);
    const pagination = this.validatePagination(req.query);
    
    const serviceResponse = await this.doctorScheduleService.getSchedules({
      ...params,
      ...pagination
    });
    this.logOperation(req, 'getSchedules', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSchedulesByDepartment(req, res) {
    const { department } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.getSchedulesByDepartment(department);
    this.logOperation(req, 'getSchedulesByDepartment', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getActiveSchedules(req, res) {
    const serviceResponse = await this.doctorScheduleService.getActiveSchedules();
    this.logOperation(req, 'getActiveSchedules', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getSchedulesForDay(req, res) {
    const { day } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.getSchedulesForDay(day);
    this.logOperation(req, 'getSchedulesForDay', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getScheduleByDoctorId(req, res) {
    const { doctorId } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.getScheduleByDoctorId(doctorId);
    this.logOperation(req, 'getScheduleByDoctorId', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async getScheduleById(req, res) {
    const { id } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.getScheduleById(id);
    this.logOperation(req, 'getScheduleById', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateSchedule(req, res) {
    const { id } = req.params;
    const updateData = this.extractParams(req);
    
    const serviceResponse = await this.doctorScheduleService.updateSchedule(id, updateData);
    this.logOperation(req, 'updateSchedule', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async addSlotToDay(req, res) {
    const { id } = req.params;
    const { day, slot } = this.extractParams(req, ['day', 'slot']);
    
    const serviceResponse = await this.doctorScheduleService.addSlotToDay(id, day, slot);
    this.logOperation(req, 'addSlotToDay', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async removeSlotFromDay(req, res) {
    const { id, day, slotIndex } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.removeSlotFromDay(id, day, parseInt(slotIndex));
    this.logOperation(req, 'removeSlotFromDay', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async updateScheduleStatus(req, res) {
    const { id } = req.params;
    const { isActive } = this.extractParams(req, ['isActive']);
    
    const serviceResponse = await this.doctorScheduleService.updateScheduleStatus(id, isActive);
    this.logOperation(req, 'updateScheduleStatus', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  
  async deleteSchedule(req, res) {
    const { id } = req.params;
    
    const serviceResponse = await this.doctorScheduleService.deleteSchedule(id);
    this.logOperation(req, 'deleteSchedule', serviceResponse);
    
    this.handleServiceResponse(res, serviceResponse);
  }

  async createOrUpdateSchedule(req, res) {
    return this.createSchedule(req, res);
  }

  async getDoctorSchedule(req, res) {
    return this.getScheduleByDoctorId(req, res);
  }

  async getDepartmentSchedules(req, res) {
    return this.getSchedulesByDepartment(req, res);
  }

  async getAllSchedules(req, res) {
    return this.getSchedules(req, res);
  }
}

module.exports = DoctorScheduleController;