const Joi = require('joi');
const { CommonSchemas } = require('../validation');


const PatientSchemas = {
  createPatient: Joi.object({
    personalInfo: Joi.object({
      name: Joi.string().min(2).max(100).required(),
      age: Joi.number().integer().min(0).max(150).required(),
      gender: Joi.string().valid('male', 'female', 'other').required(),
      phoneNumber: Joi.string().pattern(/^[0-9]{10}$/).required(),
      email: Joi.string().email().optional(),
      address: Joi.object({
        street: Joi.string().max(200).required(),
        city: Joi.string().max(100).required(),
        state: Joi.string().max(100).required(),
        pincode: Joi.string().pattern(/^[0-9]{6}$/).required()
      }).required()
    }).required(),
    departmentInfo: Joi.object({
      preferredDepartment: Joi.string().valid(
        'general_medicine', 'cardiology', 'pediatrics', 'orthopedics', 
        'dermatology', 'gynecology', 'neurology', 'psychiatry', 
        'ophthalmology', 'ent'
      ).required(),
      referredBy: Joi.string().max(100).optional(),
      chiefComplaint: Joi.string().min(5).max(500).required(),
      urgencyLevel: Joi.string().valid('routine', 'urgent', 'emergency').default('routine'),
      lastVisitedDoctor: CommonSchemas.objectId.optional()
    }).required(),
    medicalInfo: Joi.object({
      bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown').default('unknown'),
      allergies: Joi.array().items(Joi.string().max(100)).optional(),
      chronicConditions: Joi.array().items(Joi.string().max(100)).optional(),
      emergencyContact: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        relationship: Joi.string().valid('spouse', 'parent', 'child', 'sibling', 'friend', 'other').required(),
        phoneNumber: Joi.string().pattern(/^[0-9]{10}$/).required()
      }).required()
    }).required(),
    preferences: Joi.object({
      preferredLanguage: Joi.string().max(50).default('english'),
      communicationMethod: Joi.string().valid('sms', 'email', 'call').default('sms'),
      doctorPreference: CommonSchemas.objectId.optional()
    }).optional()
  }),

  
  updatePatient: Joi.object({
    personalInfo: Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      age: Joi.number().integer().min(0).max(150).optional(),
      gender: Joi.string().valid('male', 'female', 'other').optional(),
      phoneNumber: Joi.string().pattern(/^[0-9]{10}$/).optional(),
      email: Joi.string().email().optional(),
      address: Joi.object({
        street: Joi.string().max(200).optional(),
        city: Joi.string().max(100).optional(),
        state: Joi.string().max(100).optional(),
        pincode: Joi.string().pattern(/^[0-9]{6}$/).optional()
      }).optional()
    }).optional(),
    departmentInfo: Joi.object({
      preferredDepartment: Joi.string().valid(
        'general_medicine', 'cardiology', 'pediatrics', 'orthopedics', 
        'dermatology', 'gynecology', 'neurology', 'psychiatry', 
        'ophthalmology', 'ent'
      ).optional(),
      referredBy: Joi.string().max(100).optional(),
      chiefComplaint: Joi.string().min(5).max(500).optional(),
      urgencyLevel: Joi.string().valid('routine', 'urgent', 'emergency').optional(),
      lastVisitedDoctor: CommonSchemas.objectId.optional()
    }).optional(),
    medicalInfo: Joi.object({
      bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown').optional(),
      allergies: Joi.array().items(Joi.string().max(100)).optional(),
      chronicConditions: Joi.array().items(Joi.string().max(100)).optional(),
      emergencyContact: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        relationship: Joi.string().valid('spouse', 'parent', 'child', 'sibling', 'friend', 'other').required(),
        phoneNumber: Joi.string().pattern(/^[0-9]{10}$/).required()
      }).optional()
    }).optional(),
    preferences: Joi.object({
      preferredLanguage: Joi.string().max(50).optional(),
      communicationMethod: Joi.string().valid('sms', 'email', 'call').optional(),
      doctorPreference: CommonSchemas.objectId.optional()
    }).optional()
  }).min(1),

  addVisitRecord: Joi.object({
    visitData: Joi.object({
      doctorId: CommonSchemas.objectId.required(),
      date: Joi.date().iso().max('now').required(),
      diagnosis: Joi.string().min(5).max(500).required(),
      prescription: Joi.string().max(1000).optional(),
      followupRequired: Joi.boolean().default(false),
      followupDate: Joi.date().iso().min('now').when('followupRequired', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      notes: Joi.string().max(1000).optional(),
      treatmentPlan: Joi.string().max(1000).optional()
    }).required()
  }),

  updatePatientStatus: Joi.object({
    status: Joi.string().valid('active', 'inactive', 'blocked').required(),
    reason: Joi.string().max(200).optional()
  }),

  getPatients: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    age: Joi.number().integer().min(0).max(150).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    department: Joi.string().valid(
      'general_medicine', 'cardiology', 'pediatrics', 'orthopedics', 
      'dermatology', 'gynecology', 'neurology', 'psychiatry', 
      'ophthalmology', 'ent'
    ).optional(),
    urgencyLevel: Joi.string().valid('routine', 'urgent', 'emergency').optional(),
    bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown').optional(),
    registrationDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('desc'),
    sortBy: Joi.string().valid('name', 'age', 'registrationDate', 'urgencyLevel').default('registrationDate')
  }),

  searchPatients: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    phoneNumber: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    email: Joi.string().email().optional(),
    status: Joi.string().valid('active', 'inactive', 'blocked').optional(),
    ageMin: Joi.number().integer().min(0).max(150).optional(),
    ageMax: Joi.number().integer().min(0).max(150).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    preferredDepartment: Joi.string().valid(
      'general_medicine', 'cardiology', 'pediatrics', 'orthopedics', 
      'dermatology', 'gynecology', 'neurology', 'psychiatry', 
      'ophthalmology', 'ent'
    ).optional(),
    urgencyLevel: Joi.string().valid('routine', 'urgent', 'emergency').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),

  getPatientHistory: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    doctorId: CommonSchemas.objectId.optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),

  getDueFollowups: Joi.object({
    beforeDate: Joi.date().iso().default(new Date()),
    doctorId: CommonSchemas.objectId.optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),

  getPatientStatistics: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    groupBy: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
    includeInactive: Joi.boolean().default(false)
  }),


  patientIdParam: CommonSchemas.idParam,
  
  patientDoctorParams: Joi.object({
    id: Joi.string().min(3).max(50).required(),
    doctorId: Joi.string().min(3).max(50).required()
  }),

  getPatientById: Joi.object({
    id: Joi.string().min(3).max(50).required() 
  }),

  getPatientHistory: {
    params: Joi.object({
      id: Joi.string().min(3).max(50).required()
    }),
    query: Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
      limit: Joi.number().integer().min(1).max(100).default(10),
      page: Joi.number().integer().min(1).default(1)
    })
  },

  checkFollowupEligibility: Joi.object({
    id: Joi.string().min(3).max(50).required(),
    doctorId: Joi.string().min(3).max(50).required()
  })
};

module.exports = PatientSchemas;