const BaseRepository = require('./BaseRepository');


class PatientRepository extends BaseRepository {
  constructor({ patientModel, logger }) {
    super({ model: patientModel, logger });
  }

  async findByPatientId(patientId) {
    return this.findOne({ patientId });
  }

 
  async findByPhoneOrEmail(phone, email) {
    const criteria = {
      $or: []
    };

    if (phone) {
      criteria.$or.push({ 'personalInfo.phoneNumber': phone });
    }

    if (email) {
      criteria.$or.push({ 'personalInfo.email': email });
    }

    if (criteria.$or.length === 0) {
      return [];
    }

    return this.find(criteria);
  }

  
  async addVisitRecord(patientId, visitData) {
    const updateData = {
      $push: { visitHistory: visitData },
      updatedAt: new Date()
    };

    return this.updateById(patientId, updateData);
  }

  
  async getVisitHistoryWithDoctor(patientId, doctorId) {
    try {
      const patient = await this.findById(patientId);
      if (!patient) {
        return [];
      }

      return patient.visitHistory.filter(visit => 
        visit.doctorId.toString() === doctorId.toString()
      );
    } catch (error) {
      this.logger.error(`Error getting visit history for patient ${patientId} with doctor ${doctorId}:`, error);
      throw error;
    }
  }

  
  async getMostRecentVisit(patientId) {
    try {
      const patient = await this.findById(patientId);
      if (!patient || !patient.visitHistory || patient.visitHistory.length === 0) {
        return null;
      }

      const sortedVisits = patient.visitHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
      return sortedVisits[0];
    } catch (error) {
      this.logger.error(`Error getting most recent visit for patient ${patientId}:`, error);
      throw error;
    }
  }

  
  async findPatientsWithDueFollowups(beforeDate = new Date()) {
    const criteria = {
      'visitHistory': {
        $elemMatch: {
          followupRequired: true,
          followupDate: { $lte: beforeDate }
        }
      }
    };

    return this.find(criteria);
  }

  
  async updateStatus(patientId, status) {
    const updateData = {
      status,
      updatedAt: new Date()
    };

    return this.updateById(patientId, updateData);
  }

  
  async searchByName(nameQuery, options = {}) {
    const criteria = {
      'personalInfo.name': {
        $regex: nameQuery,
        $options: 'i'
      }
    };

    return this.find(criteria, options);
  }

  
  async update(patientId, updateData, options = { new: true }) {
    const data = {
      ...updateData,
      updatedAt: new Date()
    };

    return this.updateById(patientId, data, options);
  }

  
  async findByDepartment(department, options = {}) {
    const criteria = {
      'departmentInfo.preferredDepartment': department
    };

    const defaultOptions = { sort: { createdAt: -1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findAll(options = {}) {
    const defaultOptions = { sort: { createdAt: -1 } };
    return this.find({}, { ...defaultOptions, ...options });
  }
}

module.exports = PatientRepository;