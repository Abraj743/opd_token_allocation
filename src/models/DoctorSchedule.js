const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
  },
  endTime: {
    type: String,
    required: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
  },
  maxCapacity: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  slotType: {
    type: String,
    enum: ['regular', 'emergency_reserved', 'vip'],
    default: 'regular'
  }
}, { _id: false });

const doctorScheduleSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    required: true,
    unique: true,
    ref: 'Doctor'
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  weeklySchedule: {
    monday: {
      type: [timeSlotSchema],
      default: []
    },
    tuesday: {
      type: [timeSlotSchema],
      default: []
    },
    wednesday: {
      type: [timeSlotSchema],
      default: []
    },
    thursday: {
      type: [timeSlotSchema],
      default: []
    },
    friday: {
      type: [timeSlotSchema],
      default: []
    },
    saturday: {
      type: [timeSlotSchema],
      default: []
    },
    sunday: {
      type: [timeSlotSchema],
      default: []
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveTo: {
    type: Date,
    default: null // null means indefinite
  },
  specialInstructions: {
    type: String,
    maxlength: 500
  },
  emergencyAvailable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'doctor_schedules',
  toJSON: {
    transform: function(doc, ret) {
      delete ret._id;
      delete ret.__v;
      delete ret.createdAt;
      delete ret.updatedAt;
      return ret;
    }
  }
});


doctorScheduleSchema.index({ doctorId: 1 });
doctorScheduleSchema.index({ department: 1 });
doctorScheduleSchema.index({ isActive: 1 });


doctorScheduleSchema.methods.getScheduleForDay = function(dayName) {
  const day = dayName.toLowerCase();
  return this.weeklySchedule[day] || [];
};

doctorScheduleSchema.methods.isAvailableOnDay = function(dayName) {
  const daySchedule = this.getScheduleForDay(dayName);
  return daySchedule.length > 0;
};

doctorScheduleSchema.methods.getTotalCapacityForDay = function(dayName) {
  const daySchedule = this.getScheduleForDay(dayName);
  return daySchedule.reduce((total, slot) => total + slot.maxCapacity, 0);
};


doctorScheduleSchema.statics.findByDepartment = function(department) {
  return this.find({ 
    department, 
    isActive: true 
  });
};

doctorScheduleSchema.statics.findActiveDoctors = function() {
  return this.find({ isActive: true });
};

doctorScheduleSchema.statics.findAvailableForDay = function(dayName) {
  const day = dayName.toLowerCase();
  return this.find({
    isActive: true,
    [`weeklySchedule.${day}.0`]: { $exists: true }
  });
};

module.exports = mongoose.model('DoctorSchedule', doctorScheduleSchema);