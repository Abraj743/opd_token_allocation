const mongoose = require('mongoose');

const metadataSchema = new mongoose.Schema({
  averageConsultationTime: {
    type: Number,
    default: 15,
    min: 5,
    max: 60
  },
  bufferTime: {
    type: Number,
    default: 5,
    min: 0,
    max: 30
  },
  emergencyReserved: {
    type: Number,
    default: 2,
    min: 0,
    max: 10
  }
}, { _id: false });

const timeSlotSchema = new mongoose.Schema({
  slotId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  doctorId: {
    type: String,
    required: true,
    ref: 'Doctor'
  },
  date: {
    type: Date,
    required: true,
    validate: {
      validator: function(date) {
        return date >= new Date().setHours(0, 0, 0, 0);
      },
      message: 'Slot date cannot be in the past'
    }
  },
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
  maxCapacity: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  currentAllocation: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: function(allocation) {
        return allocation <= this.maxCapacity;
      },
      message: 'Current allocation cannot exceed maximum capacity'
    }
  },
  lastTokenNumber: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'completed'],
    default: 'active'
  },
  specialty: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  metadata: {
    type: metadataSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  collection: 'timeslots',
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


timeSlotSchema.index({ doctorId: 1, date: 1 });
timeSlotSchema.index({ date: 1, startTime: 1 });
timeSlotSchema.index({ specialty: 1, date: 1 });
timeSlotSchema.index({ status: 1 });


timeSlotSchema.methods.hasAvailableCapacity = function(requiredSlots = 1) {
  return (this.maxCapacity - this.currentAllocation) >= requiredSlots;
};

timeSlotSchema.methods.getAvailableCapacity = function() {
  return this.maxCapacity - this.currentAllocation;
};

timeSlotSchema.methods.allocateToken = function() {
  if (!this.hasAvailableCapacity()) {
    throw new Error('No available capacity in this slot');
  }
  
  this.currentAllocation += 1;
  return this.save();
};

timeSlotSchema.methods.releaseToken = function() {
  if (this.currentAllocation <= 0) {
    throw new Error('No tokens to release in this slot');
  }
  
  this.currentAllocation -= 1;
  return this.save();
};

timeSlotSchema.methods.updateCapacity = function(newCapacity) {
  if (newCapacity < this.currentAllocation) {
    throw new Error('New capacity cannot be less than current allocation');
  }
  
  this.maxCapacity = newCapacity;
  return this.save();
};

timeSlotSchema.methods.isActive = function() {
  return this.status === 'active';
};

timeSlotSchema.methods.getUtilizationPercentage = function() {
  return (this.currentAllocation / this.maxCapacity) * 100;
};

timeSlotSchema.methods.getEstimatedEndTime = function() {
  const consultationTime = this.metadata.averageConsultationTime;
  const bufferTime = this.metadata.bufferTime;
  const totalMinutes = this.currentAllocation * (consultationTime + bufferTime);
  
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = startMinutes + totalMinutes;
  
  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

timeSlotSchema.statics.findAvailableSlots = function(criteria = {}) {
  const query = {
    status: 'active',
    date: { $gte: new Date().setHours(0, 0, 0, 0) },
    $expr: { $lt: ['$currentAllocation', '$maxCapacity'] }
  };
  
  if (criteria.doctorId) query.doctorId = criteria.doctorId;
  if (criteria.specialty) query.specialty = new RegExp(criteria.specialty, 'i');
  if (criteria.date) query.date = criteria.date;
  if (criteria.startTime) query.startTime = { $gte: criteria.startTime };
  
  return this.find(query).sort({ date: 1, startTime: 1 });
};

timeSlotSchema.statics.findByDoctor = function(doctorId, date = null) {
  const query = { doctorId };
  if (date) {
    query.date = date;
  } else {
    query.date = { $gte: new Date().setHours(0, 0, 0, 0) };
  }
  
  return this.find(query).sort({ date: 1, startTime: 1 });
};

timeSlotSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate
    },
    status: 'active'
  }).sort({ date: 1, startTime: 1 });
};

timeSlotSchema.statics.findOverlappingSlots = function(doctorId, date, startTime, endTime) {
  return this.find({
    doctorId,
    date,
    $or: [
      {
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }
    ]
  });
};

module.exports = mongoose.model('TimeSlot', timeSlotSchema);