const BaseService = require('./BaseService');
const { globalAuditLogger, AUDIT_EVENT_TYPES, AUDIT_SEVERITY } = require('../utils/auditLogger');


class PatientService extends BaseService {
  constructor({ patientRepository, logger }) {
    super({ logger });
    this.patientRepository = patientRepository;
  }

  
  async createPatient(patientData) {
    return this.executeOperation('createPatient', async () => {
      this.validateRequired(patientData, ['personalInfo']);
      
      const existingPatients = await this.patientRepository.findByPhoneOrEmail(
        patientData.personalInfo?.phoneNumber,
        patientData.personalInfo?.email
      );

      if (existingPatients.length > 0) {
        return this.createErrorResponse(
          'DUPLICATE_PATIENT',
          'Patient with this phone number or email already exists',
          { existingPatients: existingPatients.map(p => ({ id: p._id, name: p.personalInfo.name })) },
          ['Update existing patient record', 'Use different contact information']
        );
      }

      const patientId = `PAT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const patientWithDefaults = {
        ...patientData,
        patientId,
        status: patientData.status || 'active',
        visitHistory: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const patient = await this.patientRepository.create(patientWithDefaults);

      globalAuditLogger.logPatientOperation('create', patient, {
        severity: AUDIT_SEVERITY.MEDIUM
      });

      return this.createSuccessResponse(
        { patient },
        'Patient created successfully'
      );
    }, { patientName: patientData.personalInfo?.name });
  }

  async getPatientById(patientId) {
    return this.executeOperation('getPatientById', async () => {
      this.validateRequired({ patientId }, ['patientId']);
      
      const patient = await this.patientRepository.findOne({ patientId });
      
      if (!patient) {
        return this.createErrorResponse(
          'PATIENT_NOT_FOUND',
          `Patient with ID ${patientId} not found`,
          { patientId },
          ['Check the patient ID', 'Verify the patient exists']
        );
      }

      return this.createSuccessResponse(
        { patient },
        'Patient retrieved successfully'
      );
    }, { patientId });
  }

  async getPatients(options = {}) {
    return this.executeOperation('getPatients', async () => {
      const {
        name,
        age,
        gender,
        department,
        urgencyLevel,
        bloodGroup,
        registrationDate,
        page = 1,
        limit = 10,
        sort = 'desc',
        sortBy = 'registrationDate'
      } = options;

      const searchCriteria = {};
      
      if (name) {
        searchCriteria['personalInfo.name'] = new RegExp(name, 'i');
      }
      if (age) {
        searchCriteria['personalInfo.age'] = age;
      }
      if (gender) {
        searchCriteria['personalInfo.gender'] = gender;
      }
      if (department) {
        searchCriteria['departmentInfo.preferredDepartment'] = department;
      }
      if (urgencyLevel) {
        searchCriteria['departmentInfo.urgencyLevel'] = urgencyLevel;
      }
      if (bloodGroup) {
        searchCriteria['medicalInfo.bloodGroup'] = bloodGroup;
      }
      if (registrationDate) {
        const searchDate = new Date(registrationDate);
        const startOfDay = new Date(searchDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(searchDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        searchCriteria.createdAt = {
          $gte: startOfDay,
          $lte: endOfDay
        };
      }

      
      const patients = await this.patientRepository.find(
        searchCriteria,
        {
          sort: { [sortBy]: sort === 'asc' ? 1 : -1 },
          limit: parseInt(limit),
          skip: (parseInt(page) - 1) * parseInt(limit)
        }
      );

      const totalCount = await this.patientRepository.count(searchCriteria);

      return this.createSuccessResponse(
        {
          patients,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalPatients: totalCount,
            patientsPerPage: parseInt(limit),
            hasNextPage: (parseInt(page) * parseInt(limit)) < totalCount,
            hasPreviousPage: parseInt(page) > 1
          },
          summary: {
            totalPatients: patients.length,
            departments: [...new Set(patients.map(p => p.departmentInfo?.preferredDepartment).filter(Boolean))],
            urgencyLevels: [...new Set(patients.map(p => p.departmentInfo?.urgencyLevel).filter(Boolean))]
          }
        },
        `Found ${patients.length} patients`
      );
    }, options);
  }

  async updatePatientInfo(patientId, updateData) {
    return this.executeOperation('updatePatientInfo', async () => {
      this.validateRequired({ patientId }, ['patientId']);
      
      const { _id, createdAt, visitHistory, ...allowedUpdates } = updateData;
      allowedUpdates.updatedAt = new Date();

      const updatedPatient = await this.patientRepository.updateOne({ patientId }, allowedUpdates);
      
      if (!updatedPatient) {
        return this.createErrorResponse(
          'PATIENT_NOT_FOUND',
          `Patient with ID ${patientId} not found`,
          { patientId },
          ['Check the patient ID', 'Verify the patient exists']
        );
      }

      
      globalAuditLogger.logPatientOperation('update', {
        ...updatedPatient,
        updatedFields: Object.keys(allowedUpdates)
      }, {
        severity: AUDIT_SEVERITY.MEDIUM
      });

      return this.createSuccessResponse(
        updatedPatient,
        'Patient information updated successfully'
      );
    }, { patientId });
  }

  
  async addVisitRecord(patientId, visitData) {
    return this.executeOperation('addVisitRecord', async () => {
      this.validateRequired({ patientId, visitData }, ['patientId', 'visitData']);
      this.validateRequired(visitData, ['doctorId', 'date', 'diagnosis']);
      
      const visitRecord = {
        ...visitData,
        visitId: `visit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        date: new Date(visitData.date)
      };

      const updatedPatient = await this.patientRepository.addVisitRecord(patientId, visitRecord);
      
      if (!updatedPatient) {
        return this.createErrorResponse(
          'PATIENT_NOT_FOUND',
          `Patient with ID ${patientId} not found`
        );
      }

      return this.createSuccessResponse(
        { patient: updatedPatient, visitRecord },
        'Visit record added successfully'
      );
    }, { patientId, doctorId: visitData?.doctorId });
  }

  
  async checkFollowupEligibility(patientId, doctorId) {
    return this.executeOperation('checkFollowupEligibility', async () => {
      this.validateRequired({ patientId, doctorId }, ['patientId', 'doctorId']);
      
      const visitHistory = await this.patientRepository.getVisitHistoryWithDoctor(patientId, doctorId);
      
      if (visitHistory.length === 0) {
        return this.createSuccessResponse(
          { eligible: false, reason: 'No previous visits with this doctor' },
          'Follow-up eligibility checked'
        );
      }

      const sortedVisits = visitHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastVisit = sortedVisits[0];
      
      const eligible = lastVisit.followupRequired === true;
      const daysSinceLastVisit = Math.floor((new Date() - new Date(lastVisit.date)) / (1000 * 60 * 60 * 24));
      
      let reason = '';
      if (eligible) {
        reason = `Follow-up required from last visit on ${lastVisit.date}`;
      } else {
        reason = 'No follow-up required from last visit';
      }

      const result = {
        eligible,
        reason,
        lastVisitDate: lastVisit.date,
        daysSinceLastVisit,
        followupDue: lastVisit.followupDate,
        totalVisits: visitHistory.length
      };

      return this.createSuccessResponse(
        result,
        'Follow-up eligibility checked successfully'
      );
    }, { patientId, doctorId });
  }

  
  async searchPatients(searchCriteria, options = {}) {
    return this.executeOperation('searchPatients', async () => {
      let patients = [];
      let total = 0;

      if (searchCriteria.name) {
        patients = await this.patientRepository.searchByName(searchCriteria.name, options);
        total = await this.patientRepository.count({
          'personalInfo.name': { $regex: searchCriteria.name, $options: 'i' }
        });
      } else if (searchCriteria.phone || searchCriteria.email) {
        patients = await this.patientRepository.findByPhoneOrEmail(
          searchCriteria.phone,
          searchCriteria.email
        );
        total = patients.length;
      } else {
        patients = await this.patientRepository.find({}, options);
        total = await this.patientRepository.count({});
      }

      const pagination = options.page ? {
        total,
        page: options.page,
        limit: options.limit,
        totalPages: Math.ceil(total / options.limit)
      } : null;

      return this.createSuccessResponse(
        { patients, pagination },
        `Found ${patients.length} patients`
      );
    }, searchCriteria);
  }

  
  async getPatientsWithDueFollowups(beforeDate = new Date()) {
    return this.executeOperation('getPatientsWithDueFollowups', async () => {
      const patients = await this.patientRepository.findPatientsWithDueFollowups(beforeDate);
      
      return this.createSuccessResponse(
        patients,
        `Found ${patients.length} patients with due follow-ups`
      );
    }, { beforeDate });
  }

  
  async updatePatientStatus(patientId, status) {
    return this.executeOperation('updatePatientStatus', async () => {
      this.validateRequired({ patientId, status }, ['patientId', 'status']);
      
      const validStatuses = ['active', 'inactive', 'blocked'];
      if (!validStatuses.includes(status)) {
        return this.createErrorResponse(
          'INVALID_STATUS',
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        );
      }

      const updatedPatient = await this.patientRepository.updateStatus(patientId, status);
      
      if (!updatedPatient) {
        return this.createErrorResponse(
          'PATIENT_NOT_FOUND',
          `Patient with ID ${patientId} not found`
        );
      }

      return this.createSuccessResponse(
        updatedPatient,
        `Patient status updated to ${status}`
      );
    }, { patientId, status });
  }

  
  async getPatientStatistics(startDate = null, endDate = null) {
    return this.executeOperation('getPatientStatistics', async () => {
      const criteria = {};
      
      if (startDate || endDate) {
        criteria.createdAt = {};
        if (startDate) criteria.createdAt.$gte = startDate;
        if (endDate) criteria.createdAt.$lte = endDate;
      }

      const totalPatients = await this.patientRepository.count(criteria);
      const activePatients = await this.patientRepository.count({ ...criteria, status: 'active' });
      const inactivePatients = await this.patientRepository.count({ ...criteria, status: 'inactive' });
      const blockedPatients = await this.patientRepository.count({ ...criteria, status: 'blocked' });

      const statistics = {
        totalPatients,
        activePatients,
        inactivePatients,
        blockedPatients,
        period: {
          startDate,
          endDate
        }
      };

      return this.createSuccessResponse(
        statistics,
        'Patient statistics retrieved successfully'
      );
    }, { startDate, endDate });
  }

  
  async getPatientHistory(patientId, options = {}) {
    return this.executeOperation('getPatientHistory', async () => {
      this.validateRequired({ patientId }, ['patientId']);
      
      const patient = await this.patientRepository.findOne({ patientId });
      
      if (!patient) {
        return this.createErrorResponse(
          'PATIENT_NOT_FOUND',
          `Patient with ID ${patientId} not found`,
          { patientId },
          ['Check the patient ID', 'Verify the patient exists']
        );
      }

      let visitHistory = patient.visitHistory || [];
      
      visitHistory = visitHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (options.limit) {
        const startIndex = options.skip || 0;
        const endIndex = startIndex + options.limit;
        visitHistory = visitHistory.slice(startIndex, endIndex);
      }

      const result = {
        patientId,
        patientName: patient.personalInfo.name,
        visitHistory,
        totalVisits: patient.visitHistory?.length || 0
      };

      return this.createSuccessResponse(
        result,
        'Patient history retrieved successfully'
      );
    }, { patientId });
  }
}

module.exports = PatientService;