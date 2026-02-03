const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    validate: {
      validator: function(endTime) {
        const [startHour, startMin] = this.startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        return endMinutes > startMinutes;
      },
      message: 'End time must be after start time'
    }
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  }
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6 // 0 = Sunday, 6 = Saturday
  },
  slots: [slotSchema]
}, { _id: false });

const contactInfoSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    match: /^[0-9]{10}$/,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  department: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  }
}, { _id: false });

const preferencesSchema = new mongoose.Schema({
  maxPatientsPerSlot: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  emergencyAvailability: {
    type: Boolean,
    default: true
  },
  followupPriority: {
    type: Boolean,
    default: true
  },
  averageConsultationTime: {
    type: Number,
    default: 15,
    min: 5,
    max: 60 
  }
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  specialty: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  qualification: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  experience: {
    type: Number,
    required: true,
    min: 0,
    max: 60 
  },
  schedule: [scheduleSchema],
  preferences: {
    type: preferencesSchema,
    default: () => ({})
  },
  contactInfo: {
    type: contactInfoSchema,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave'],
    default: 'active'
  }
}, {
  timestamps: true,
  collection: 'doctors',
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


doctorSchema.index({ specialty: 1 });
doctorSchema.index({ status: 1 });
doctorSchema.index({ 'schedule.dayOfWeek': 1 });


doctorSchema.methods.getScheduleForDay = function(dayOfWeek) {
  return this.schedule.find(s => s.dayOfWeek === dayOfWeek);
};

doctorSchema.methods.isAvailableOnDay = function(dayOfWeek) {
  const daySchedule = this.getScheduleForDay(dayOfWeek);
  return daySchedule && daySchedule.slots.length > 0;
};

doctorSchema.methods.getTotalSlotsForDay = function(dayOfWeek) {
  const daySchedule = this.getScheduleForDay(dayOfWeek);
  return daySchedule ? daySchedule.slots.length : 0;
};

doctorSchema.methods.getTotalCapacityForDay = function(dayOfWeek) {
  const daySchedule = this.getScheduleForDay(dayOfWeek);
  if (!daySchedule) return 0;
  
  return daySchedule.slots.reduce((total, slot) => total + slot.capacity, 0);
};

doctorSchema.methods.isEmergencyAvailable = function() {
  return this.status === 'active' && this.preferences.emergencyAvailability;
};

doctorSchema.methods.addScheduleSlot = function(dayOfWeek, slotData) {
  let daySchedule = this.getScheduleForDay(dayOfWeek);
  
  if (!daySchedule) {
    daySchedule = { dayOfWeek, slots: [] };
    this.schedule.push(daySchedule);
  }
  
  daySchedule.slots.push(slotData);
  return this.save();
};


doctorSchema.statics.findBySpecialty = function(specialty) {
  return this.find({ 
    specialty: new RegExp(specialty, 'i'),
    status: 'active'
  });
};

doctorSchema.statics.findAvailableDoctors = function() {
  return this.find({ status: 'active' });
};

doctorSchema.statics.findEmergencyAvailableDoctors = function() {
  return this.find({ 
    status: 'active',
    'preferences.emergencyAvailability': true
  });
};

module.exports = mongoose.model('Doctor', doctorSchema);