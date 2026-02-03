const mongoose = require('mongoose');

const metadataSchema = new mongoose.Schema({
  originalSlotId: {
    type: String,
    ref: 'TimeSlot'
  },
  preemptedTokens: [{
    type: String,
    ref: 'Token'
  }],
  waitingTime: {
    type: Number,
    default: 0,
    min: 0 
  },
  estimatedServiceTime: {
    type: Number,
    default: 15,
    min: 5,
    max: 60 
  },
  fastTrack: {
    type: Boolean,
    default: false
  },
  emergencyProcessingTime: {
    type: Date
  },
  consultationType: {
    type: String,
    enum: ['regular', 'emergency', 'followup', 'priority']
  },
  consultationStartTime: {
    type: Date
  },
  consultationEndTime: {
    type: Date
  },
  consultationDuration: {
    type: Number
  },
  treatmentEndTime: {
    type: Date
  },
  treatmentDuration: {
    type: Number
  },
  patientStabilized: {
    type: Boolean
  },
  checkinTime: {
    type: Date
  },
  status: {
    type: String
  },
  medicalHistoryReviewed: {
    type: Boolean
  },
  nextFollowupRecommended: {
    type: Boolean
  },
  nextFollowupDate: {
    type: Date
  },
  completionTime: {
    type: Date
  },
  outcome: {
    type: String
  }
}, { _id: false });

const tokenSchema = new mongoose.Schema({
  tokenId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  patientId: {
    type: String,
    required: true,
    ref: 'Patient'
  },
  doctorId: {
    type: String,
    required: true,
    ref: 'Doctor'
  },
  slotId: {
    type: String,
    required: true,
    ref: 'TimeSlot'
  },
  tokenNumber: {
    type: Number,
    required: true,
    min: 1
  },
  source: {
    type: String,
    required: true,
    enum: ['online', 'walkin', 'priority', 'followup', 'emergency']
  },
  priority: {
    type: Number,
    required: true,
    min: 0,
    max: 2000 
  },
  status: {
    type: String,
    enum: ['allocated', 'confirmed', 'completed', 'cancelled', 'noshow'],
    default: 'allocated'
  },
  metadata: {
    type: metadataSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  collection: 'tokens',
  toJSON: {
    transform: function(doc, ret) {

      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      
      delete ret._id;
      delete ret.__v;
    
      return ret;
    }
  }
});


tokenSchema.index({ patientId: 1 });
tokenSchema.index({ doctorId: 1, slotId: 1 });
tokenSchema.index({ slotId: 1, tokenNumber: 1 });
tokenSchema.index({ priority: -1 });
tokenSchema.index({ source: 1 });
tokenSchema.index({ status: 1 });
tokenSchema.index({ createdAt: 1 });

tokenSchema.methods.confirm = function() {
  if (this.status !== 'allocated') {
    throw new Error('Only allocated tokens can be confirmed');
  }
  
  this.status = 'confirmed';
  return this.save();
};

tokenSchema.methods.complete = function() {
  if (!['allocated', 'confirmed'].includes(this.status)) {
    throw new Error('Only allocated or confirmed tokens can be completed');
  }
  
  this.status = 'completed';
  return this.save();
};

tokenSchema.methods.cancel = function() {
  if (['completed', 'cancelled'].includes(this.status)) {
    throw new Error('Cannot cancel completed or already cancelled tokens');
  }
  
  this.status = 'cancelled';
  return this.save();
};

tokenSchema.methods.markNoShow = function() {
  if (this.status !== 'confirmed') {
    throw new Error('Only confirmed tokens can be marked as no-show');
  }
  
  this.status = 'noshow';
  return this.save();
};

tokenSchema.methods.updateWaitingTime = function() {
  const waitingMinutes = Math.floor((new Date() - this.createdAt) / (1000 * 60));
  this.metadata.waitingTime = waitingMinutes;
  return this.save();
};

tokenSchema.methods.reschedule = function(newSlotId, newTokenNumber) {
  if (this.status === 'completed') {
    throw new Error('Cannot reschedule completed tokens');
  }
  

  if (!this.metadata.originalSlotId) {
    this.metadata.originalSlotId = this.slotId;
  }
  
  this.slotId = newSlotId;
  this.tokenNumber = newTokenNumber;
  this.status = 'allocated';
  
  return this.save();
};

tokenSchema.methods.isActive = function() {
  return ['allocated', 'confirmed'].includes(this.status);
};

tokenSchema.methods.canBePreempted = function() {
  return this.status === 'allocated' && this.source !== 'emergency';
};

tokenSchema.methods.getPriorityLevel = function() {
  if (this.priority >= 1000) return 'emergency';
  if (this.priority >= 800) return 'priority';
  if (this.priority >= 600) return 'followup';
  if (this.priority >= 400) return 'online';
  return 'walkin';
};

tokenSchema.statics.findBySlot = function(slotId) {
  return this.find({ 
    slotId,
    status: { $in: ['allocated', 'confirmed'] }
  }).sort({ tokenNumber: 1 });
};

tokenSchema.statics.findByPatient = function(patientId) {
  return this.find({ patientId }).sort({ createdAt: -1 });
};

tokenSchema.statics.findByDoctor = function(doctorId, date = null) {
  const query = { doctorId };
  
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.createdAt = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }
  
  return this.find(query).sort({ createdAt: 1 });
};

tokenSchema.statics.findPreemptableTokens = function(slotId, minPriority) {
  return this.find({
    slotId,
    status: 'allocated',
    priority: { $lt: minPriority },
    source: { $ne: 'emergency' }
  }).sort({ priority: 1, createdAt: 1 });
};

tokenSchema.statics.getNextTokenNumber = async function(slotId) {
  const lastToken = await this.findOne({ slotId })
    .sort({ tokenNumber: -1 })
    .select('tokenNumber');
  
  return lastToken ? lastToken.tokenNumber + 1 : 1;
};

tokenSchema.statics.findActiveTokens = function() {
  return this.find({
    status: { $in: ['allocated', 'confirmed'] }
  });
};

tokenSchema.statics.findTokensByPriorityRange = function(minPriority, maxPriority) {
  return this.find({
    priority: { $gte: minPriority, $lte: maxPriority },
    status: { $in: ['allocated', 'confirmed'] }
  }).sort({ priority: -1, createdAt: 1 });
};

tokenSchema.statics.findTokensBySource = function(source) {
  return this.find({ source }).sort({ createdAt: -1 });
};

tokenSchema.pre('save', function(next) {
  if (this.isNew && !this.priority) {
    const basePriorities = {
      emergency: 1000,
      priority: 800,
      followup: 600,
      online: 400,
      walkin: 200
    };
    
    this.priority = basePriorities[this.source] || 200;
  }
  
  next();
});

module.exports = mongoose.model('Token', tokenSchema);