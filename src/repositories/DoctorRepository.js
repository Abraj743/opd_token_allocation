const BaseRepository = require('./BaseRepository');


class DoctorRepository extends BaseRepository {
  constructor({ doctorModel, logger }) {
    super({ model: doctorModel, logger });
  }

  async findBySpecialty(specialty) {
    return this.executeOperation('findBySpecialty', async () => {
      return await this.model.findBySpecialty(specialty);
    }, { specialty });
  }

  
  async findActiveDoctors() {
    return this.executeOperation('findActiveDoctors', async () => {
      return await this.model.findAvailableDoctors();
    });
  }

  
  async findEmergencyAvailableDoctors() {
    return this.executeOperation('findEmergencyAvailableDoctors', async () => {
      return await this.model.findEmergencyAvailableDoctors();
    });
  }

  
  async findByDoctorId(doctorId) {
    return this.executeOperation('findByDoctorId', async () => {
      return await this.model.findOne({ doctorId });
    }, { doctorId });
  }

  
  async updateStatus(doctorId, status) {
    return this.executeOperation('updateStatus', async () => {
      return await this.model.findOneAndUpdate(
        { doctorId },
        { status, updatedAt: new Date() },
        { new: true }
      );
    }, { doctorId, status });
  }

  
  async getDoctorSchedule(doctorId, dayOfWeek) {
    return this.executeOperation('getDoctorSchedule', async () => {
      const doctor = await this.model.findOne({ doctorId });
      if (!doctor) return null;
      
      return {
        ...doctor.toObject(),
        daySchedule: doctor.getScheduleForDay(dayOfWeek)
      };
    }, { doctorId, dayOfWeek });
  }

  
  async addScheduleSlot(doctorId, dayOfWeek, slotData) {
    return this.executeOperation('addScheduleSlot', async () => {
      const doctor = await this.model.findOne({ doctorId });
      if (!doctor) return null;
      
      return await doctor.addScheduleSlot(dayOfWeek, slotData);
    }, { doctorId, dayOfWeek, slotData });
  }

  
  async getStatistics(criteria = {}) {
    return this.executeOperation('getStatistics', async () => {
      const pipeline = [
        { $match: criteria },
        {
          $group: {
            _id: null,
            totalDoctors: { $sum: 1 },
            activeDoctors: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            inactiveDoctors: {
              $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
            },
            onLeaveDoctors: {
              $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] }
            },
            emergencyAvailableDoctors: {
              $sum: { $cond: [{ $eq: ['$preferences.emergencyAvailability', true] }, 1, 0] }
            },
            averageExperience: { $avg: '$experience' },
            specialties: { $addToSet: '$specialty' }
          }
        }
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0] || {
        totalDoctors: 0,
        activeDoctors: 0,
        inactiveDoctors: 0,
        onLeaveDoctors: 0,
        emergencyAvailableDoctors: 0,
        averageExperience: 0,
        specialties: []
      };
    }, criteria);
  }

 
  async findAvailableOnDay(dayOfWeek) {
    return this.executeOperation('findAvailableOnDay', async () => {
      return await this.model.find({
        status: 'active',
        'schedule.dayOfWeek': dayOfWeek
      });
    }, { dayOfWeek });
  }

  
  async getTotalCapacityForDay(dayOfWeek) {
    return this.executeOperation('getTotalCapacityForDay', async () => {
      const doctors = await this.findAvailableOnDay(dayOfWeek);
      
      return doctors.reduce((total, doctor) => {
        return total + doctor.getTotalCapacityForDay(dayOfWeek);
      }, 0);
    }, { dayOfWeek });
  }

  
  async search(searchTerm, options = {}) {
    return this.executeOperation('search', async () => {
      const query = {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { specialty: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (options.status) {
        query.status = options.status;
      }

      let queryBuilder = this.model.find(query);

      if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
      }

      if (options.skip) {
        queryBuilder = queryBuilder.skip(options.skip);
      }

      if (options.sort) {
        queryBuilder = queryBuilder.sort(options.sort);
      }

      return await queryBuilder.exec();
    }, { searchTerm, options });
  }
}

module.exports = DoctorRepository;