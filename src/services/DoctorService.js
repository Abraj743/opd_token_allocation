const BaseService = require('./BaseService');


class DoctorService extends BaseService {
  constructor({ doctorRepository, logger }) {
    super({ logger });
    this.doctorRepository = doctorRepository;
  }

  async createDoctor(doctorData) {
    return this.executeOperation('createDoctor', async () => {
      const doctorId = `DOC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const doctor = await this.doctorRepository.create({
        ...doctorData,
        doctorId
      });

      return { 
        success: true, 
        data: { doctor }
      };
    }, doctorData);
  }

  
  async getDoctorById(doctorId) {
    return this.executeOperation('getDoctorById', async () => {
      const doctor = await this.doctorRepository.findOne({ doctorId });
      
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      return { 
        success: true, 
        data: { doctor }
      };
    }, { doctorId });
  }

  
  async updateDoctor(doctorId, updateData) {
    return this.executeOperation('updateDoctor', async () => {
      const doctor = await this.doctorRepository.findOne({ doctorId });
      
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      const updatedDoctor = await this.doctorRepository.updateById(doctor._id, updateData);
      
      return { 
        success: true, 
        data: { doctor: updatedDoctor }
      };
    }, { doctorId, updateData });
  }

  
  async getDoctors(criteria = {}) {
    return this.executeOperation('getDoctors', async () => {
      const doctors = await this.doctorRepository.find(criteria);
      
      return { 
        success: true, 
        data: {
          doctors,
          count: doctors.length 
        }
      };
    }, criteria);
  }

  
  async getDoctorsBySpecialty(specialty) {
    return this.executeOperation('getDoctorsBySpecialty', async () => {
      const doctors = await this.doctorRepository.find({ 
        specialty: new RegExp(specialty, 'i'),
        status: 'active'
      });
      
      return { 
        success: true, 
        data: {
          doctors,
          count: doctors.length,
          specialty
        }
      };
    }, { specialty });
  }

  
  async getActiveDoctors() {
    return this.executeOperation('getActiveDoctors', async () => {
      const doctors = await this.doctorRepository.find({ status: 'active' });
      
      return { 
        success: true, 
        data: {
          doctors,
          count: doctors.length
        }
      };
    });
  }

  async updateDoctorStatus(doctorId, status) {
    return this.executeOperation('updateDoctorStatus', async () => {
      const doctor = await this.doctorRepository.findOne({ doctorId });
      
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      const updatedDoctor = await this.doctorRepository.updateById(doctor._id, { status });
      
      return { success: true, doctor: updatedDoctor };
    }, { doctorId, status });
  }

  
  async getDoctorSchedule(doctorId, dayOfWeek) {
    return this.executeOperation('getDoctorSchedule', async () => {
      const doctor = await this.doctorRepository.findOne({ doctorId });
      
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      const daySchedule = doctor.getScheduleForDay(dayOfWeek);
      
      return { 
        success: true, 
        doctor: {
          ...doctor.toObject(),
          daySchedule
        }
      };
    }, { doctorId, dayOfWeek });
  }

  async addScheduleSlot(doctorId, dayOfWeek, slotData) {
    return this.executeOperation('addScheduleSlot', async () => {
      const doctor = await this.doctorRepository.findOne({ doctorId });
      
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      const updatedDoctor = await doctor.addScheduleSlot(dayOfWeek, slotData);
      
      return { success: true, doctor: updatedDoctor };
    }, { doctorId, dayOfWeek, slotData });
  }

  
  async getDoctorStatistics(criteria = {}) {
    return this.executeOperation('getDoctorStatistics', async () => {
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

      const result = await this.doctorRepository.model.aggregate(pipeline);
      const statistics = result[0] || {
        totalDoctors: 0,
        activeDoctors: 0,
        inactiveDoctors: 0,
        onLeaveDoctors: 0,
        emergencyAvailableDoctors: 0,
        averageExperience: 0,
        specialties: []
      };
      
      return { success: true, statistics };
    }, criteria);
  }

  
  async searchDoctors(searchTerm, options = {}) {
    return this.executeOperation('searchDoctors', async () => {
      const query = {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { specialty: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (options.status) {
        query.status = options.status;
      }

      const doctors = await this.doctorRepository.find(query, options);
      
      return { 
        success: true, 
        doctors,
        count: doctors.length,
        searchTerm 
      };
    }, { searchTerm, options });
  }

  async getDoctorsAvailableOnDay(dayOfWeek) {
    return this.executeOperation('getDoctorsAvailableOnDay', async () => {
      const doctors = await this.doctorRepository.find({
        status: 'active',
        'schedule.dayOfWeek': dayOfWeek
      });
      
      return { 
        success: true, 
        doctors,
        count: doctors.length,
        dayOfWeek 
      };
    }, { dayOfWeek });
  }

  
  async getEmergencyAvailableDoctors() {
    return this.executeOperation('getEmergencyAvailableDoctors', async () => {
      const doctors = await this.doctorRepository.find({ 
        status: 'active',
        'preferences.emergencyAvailability': true
      });
      
      return { 
        success: true, 
        doctors,
        count: doctors.length 
      };
    });
  }
}

module.exports = DoctorService;