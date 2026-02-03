const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  city: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  state: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  pincode: {
    type: String,
    required: true,
    match: /^[0-9]{6}$/,
    trim: true
  }
}, { _id: false });

const emergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  relationship: {
    type: String,
    required: true,
    enum: ['spouse', 'parent', 'child', 'sibling', 'friend', 'other'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    match: /^[0-9]{10}$/,
    trim: true
  }
}, { _id: false });

const visitHistorySchema = new mongoose.Schema({
  visitId: {
    type: String,
    required: true
  },
  doctorId: {
    type: String,
    required: true,
    ref: 'Doctor'
  },
  date: {
    type: Date,
    required: true
  },
  diagnosis: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  prescription: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  followupRequired: {
    type: Boolean,
    default: false
  },
  followupDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !this.followupRequired || value != null;
      },
      message: 'Follow-up date is required when follow-up is needed'
    }
  }
}, { _id: false });

const patientSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  personalInfo: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    age: {
      type: Number,
      required: true,
      min: 0,
      max: 150
    },
    gender: {
      type: String,
      required: true,
      enum: ['male', 'female', 'other']
    },
    phoneNumber: {
      type: String,
      required: true,
      match: /^[0-9]{10}$/,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    address: {
      type: addressSchema,
      required: true
    }
  },
  departmentInfo: {
    preferredDepartment: {
      type: String,
      required: true,
      enum: ['general_medicine', 'cardiology', 'pediatrics', 'orthopedics', 'dermatology', 'gynecology', 'neurology', 'psychiatry', 'ophthalmology', 'ent'],
      trim: true,
      index: true
    },
    referredBy: {
      type: String,
      trim: true,
      maxlength: 100
    },
    chiefComplaint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    urgencyLevel: {
      type: String,
      enum: ['routine', 'urgent', 'emergency'],
      default: 'routine'
    },
    lastVisitedDoctor: {
      type: String,
      ref: 'Doctor',
      index: true
    }
  },
  medicalInfo: {
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
      default: 'unknown'
    },
    allergies: [{
      type: String,
      trim: true,
      maxlength: 100
    }],
    chronicConditions: [{
      type: String,
      trim: true,
      maxlength: 100
    }],
    emergencyContact: {
      type: emergencyContactSchema,
      required: true
    }
  },
  visitHistory: [visitHistorySchema],
  preferences: {
    preferredLanguage: {
      type: String,
      default: 'english',
      trim: true,
      maxlength: 50
    },
    communicationMethod: {
      type: String,
      enum: ['sms', 'email', 'call'],
      default: 'sms'
    },
    doctorPreference: {
      type: String,
      ref: 'Doctor'
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active'
  }
}, {
  timestamps: true,
  collection: 'patients',
  toJSON: {
    transform: function(doc, ret) {
      delete ret._id;
      delete ret.__v;
      delete ret.createdAt;
      delete ret.updatedAt;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {

      delete ret._id;
      delete ret.__v;
      delete ret.createdAt;
      delete ret.updatedAt;
      return ret;
    }
  }
});

patientSchema.index({ 'personalInfo.phoneNumber': 1 });
patientSchema.index({ 'personalInfo.email': 1 });
patientSchema.index({ status: 1 });
patientSchema.index({ 'visitHistory.doctorId': 1 });


patientSchema.methods.addVisitRecord = function(visitData) {
  this.visitHistory.push(visitData);
  return this.save();
};

patientSchema.methods.getLastVisitWithDoctor = function(doctorId) {
  return this.visitHistory
    .filter(visit => visit.doctorId === doctorId)
    .sort((a, b) => b.date - a.date)[0];
};

patientSchema.methods.isFollowupEligible = function(doctorId) {
  const lastVisit = this.getLastVisitWithDoctor(doctorId);
  if (!lastVisit || !lastVisit.followupRequired) {
    return false;
  }
  
  const daysSinceVisit = (new Date() - lastVisit.date) / (1000 * 60 * 60 * 24);
  return daysSinceVisit <= 30;
};

patientSchema.methods.hasChronicConditions = function() {
  return this.medicalInfo.chronicConditions && this.medicalInfo.chronicConditions.length > 0;
};

patientSchema.statics.findByContact = function(phone, email) {
  const query = {};
  if (phone) query['personalInfo.phoneNumber'] = phone;
  if (email) query['personalInfo.email'] = email;
  
  return this.findOne({ $or: [query] });
};

patientSchema.statics.findActivePatients = function() {
  return this.find({ status: 'active' });
};

module.exports = mongoose.model('Patient', patientSchema);