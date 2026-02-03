const BaseService = require('./BaseService');


class DoctorScheduleService extends BaseService {
  constructor({ doctorScheduleModel, logger }) {
    super({ logger });
    this.doctorScheduleModel = doctorScheduleModel;
  }

  async createSchedule(scheduleData) {
    return this.executeOperation('createSchedule', async () => {
      this.validateRequired(scheduleData, ['doctorId', 'department', 'weeklySchedule']);

      const { doctorId } = scheduleData;

    
      const existingSchedule = await this.doctorScheduleModel.findOne({ doctorId });
      if (existingSchedule) {
        return this.createErrorResponse(
          'SCHEDULE_ALREADY_EXISTS',
          `Schedule already exists for doctor ${doctorId}`,
          { doctorId },
          ['Update the existing schedule instead', 'Use a different doctor ID']
        );
      }

      const schedule = await this.doctorScheduleModel.create(scheduleData);

      return this.createSuccessResponse(
        { schedule },
        'Doctor schedule created successfully'
      );
    }, scheduleData);
  }

  
  async getSchedules(filters = {}) {
    return this.executeOperation('getSchedules', async () => {
      const { doctorId, department, isActive, emergencyAvailable, limit = 10, skip = 0 } = filters;

      const query = {};
      if (doctorId) query.doctorId = doctorId;
      if (department) query.department = department;
      if (isActive !== undefined) query.isActive = isActive;
      if (emergencyAvailable !== undefined) query.emergencyAvailable = emergencyAvailable;

      const schedules = await this.doctorScheduleModel
        .find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort({ createdAt: -1 });

      const totalCount = await this.doctorScheduleModel.countDocuments(query);

      return this.createSuccessResponse(
        { 
          schedules,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            skip: parseInt(skip),
            hasMore: (skip + limit) < totalCount
          }
        },
        `Found ${schedules.length} doctor schedules`
      );
    }, filters);
  }

  async getSchedulesByDepartment(department) {
    return this.executeOperation('getSchedulesByDepartment', async () => {
      this.validateRequired({ department }, ['department']);

      const schedules = await this.doctorScheduleModel.findByDepartment(department);

      return this.createSuccessResponse(
        { 
          schedules,
          department,
          totalDoctors: schedules.length
        },
        `Found ${schedules.length} doctor schedules in ${department} department`
      );
    }, { department });
  }

 
  async getActiveSchedules() {
    return this.executeOperation('getActiveSchedules', async () => {
      const schedules = await this.doctorScheduleModel.findActiveDoctors();

      const schedulesByDepartment = {};
      schedules.forEach(schedule => {
        if (!schedulesByDepartment[schedule.department]) {
          schedulesByDepartment[schedule.department] = [];
        }
        schedulesByDepartment[schedule.department].push(schedule);
      });

      return this.createSuccessResponse(
        { 
          schedules,
          schedulesByDepartment,
          totalActiveDoctors: schedules.length,
          totalDepartments: Object.keys(schedulesByDepartment).length
        },
        `Found ${schedules.length} active doctor schedules`
      );
    });
  }

  async getSchedulesForDay(dayName) {
    return this.executeOperation('getSchedulesForDay', async () => {
      this.validateRequired({ dayName }, ['dayName']);

      const schedules = await this.doctorScheduleModel.findAvailableForDay(dayName);

      return this.createSuccessResponse(
        { 
          schedules,
          dayName,
          totalAvailableDoctors: schedules.length
        },
        `Found ${schedules.length} doctors available on ${dayName}`
      );
    }, { dayName });
  }

  async getScheduleByDoctorId(doctorId) {
    return this.executeOperation('getScheduleByDoctorId', async () => {
      this.validateRequired({ doctorId }, ['doctorId']);

      const schedule = await this.doctorScheduleModel.findOne({ doctorId });

      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found for doctor ${doctorId}`,
          { doctorId },
          ['Create a schedule for this doctor', 'Check the doctor ID']
        );
      }

      return this.createSuccessResponse(
        { schedule },
        'Doctor schedule retrieved successfully'
      );
    }, { doctorId });
  }

  async getScheduleById(id) {
    return this.executeOperation('getScheduleById', async () => {
      this.validateRequired({ id }, ['id']);

      const schedule = await this.doctorScheduleModel.findById(id);

      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id },
          ['Check the schedule ID', 'Use a valid schedule ID']
        );
      }

      return this.createSuccessResponse(
        { schedule },
        'Schedule retrieved successfully'
      );
    }, { id });
  }

  async updateSchedule(id, updateData) {
    return this.executeOperation('updateSchedule', async () => {
      this.validateRequired({ id }, ['id']);

      const schedule = await this.doctorScheduleModel.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );

      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id },
          ['Check the schedule ID', 'Use a valid schedule ID']
        );
      }

      return this.createSuccessResponse(
        { schedule },
        'Schedule updated successfully'
      );
    }, { id, updateData });
  }

  async addSlotToDay(id, day, slot) {
    return this.executeOperation('addSlotToDay', async () => {
      this.validateRequired({ id, day, slot }, ['id', 'day', 'slot']);

      const schedule = await this.doctorScheduleModel.findById(id);
      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id }
        );
      }

      if (!schedule.weeklySchedule[day]) {
        schedule.weeklySchedule[day] = [];
      }
      schedule.weeklySchedule[day].push(slot);

      await schedule.save();

      return this.createSuccessResponse(
        { schedule },
        `Slot added to ${day} successfully`
      );
    }, { id, day, slot });
  }

 
  async removeSlotFromDay(id, day, slotIndex) {
    return this.executeOperation('removeSlotFromDay', async () => {
      this.validateRequired({ id, day, slotIndex }, ['id', 'day', 'slotIndex']);

      const schedule = await this.doctorScheduleModel.findById(id);
      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id }
        );
      }

      if (!schedule.weeklySchedule[day] || !schedule.weeklySchedule[day][slotIndex]) {
        return this.createErrorResponse(
          'SLOT_NOT_FOUND',
          `Slot not found at index ${slotIndex} for ${day}`,
          { day, slotIndex }
        );
      }

      schedule.weeklySchedule[day].splice(slotIndex, 1);
      await schedule.save();

      return this.createSuccessResponse(
        { schedule },
        `Slot removed from ${day} successfully`
      );
    }, { id, day, slotIndex });
  }

  
  async updateScheduleStatus(id, isActive) {
    return this.executeOperation('updateScheduleStatus', async () => {
      this.validateRequired({ id, isActive }, ['id', 'isActive']);

      const schedule = await this.doctorScheduleModel.findByIdAndUpdate(
        id,
        { isActive, updatedAt: new Date() },
        { new: true }
      );

      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id }
        );
      }

      return this.createSuccessResponse(
        { schedule },
        `Schedule ${isActive ? 'activated' : 'deactivated'} successfully`
      );
    }, { id, isActive });
  }

  
  async deleteSchedule(id) {
    return this.executeOperation('deleteSchedule', async () => {
      this.validateRequired({ id }, ['id']);

      const schedule = await this.doctorScheduleModel.findByIdAndDelete(id);

      if (!schedule) {
        return this.createErrorResponse(
          'SCHEDULE_NOT_FOUND',
          `Schedule not found with ID ${id}`,
          { id }
        );
      }

      return this.createSuccessResponse(
        { deletedSchedule: schedule },
        'Schedule deleted successfully'
      );
    }, { id });
  }

  async createOrUpdateSchedule(scheduleData) {
    return this.executeOperation('createOrUpdateSchedule', async () => {
      this.validateRequired(scheduleData, ['doctorId', 'department', 'weeklySchedule']);

      const { doctorId, department, weeklySchedule, ...otherData } = scheduleData;

      const existingSchedule = await this.doctorScheduleModel.findOne({ doctorId });

      let schedule;
      if (existingSchedule) {
        schedule = await this.doctorScheduleModel.findOneAndUpdate(
          { doctorId },
          {
            department,
            weeklySchedule,
            ...otherData,
            updatedAt: new Date()
          },
          { new: true }
        );
      } else {
        schedule = await this.doctorScheduleModel.create({
          doctorId,
          department,
          weeklySchedule,
          ...otherData
        });
      }

      return this.createSuccessResponse(
        { schedule },
        existingSchedule ? 'Doctor schedule updated successfully' : 'Doctor schedule created successfully'
      );
    }, scheduleData);
  }

  async getDoctorSchedule(doctorId) {
    return this.getScheduleByDoctorId(doctorId);
  }

  async getDepartmentSchedules(department) {
    return this.getSchedulesByDepartment(department);
  }

  async getAllActiveSchedules() {
    return this.getActiveSchedules();
  }
}

module.exports = DoctorScheduleService;