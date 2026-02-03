// Token Sources
const TOKEN_SOURCES = {
  ONLINE: 'online',
  WALKIN: 'walkin',
  PRIORITY: 'priority',
  FOLLOWUP: 'followup',
  EMERGENCY: 'emergency'
};

// Priority Levels
const PRIORITY_LEVELS = {
  EMERGENCY: 1000,
  PRIORITY_PATIENT: 800,
  FOLLOWUP_PATIENT: 600,
  ONLINE_BOOKING: 400,
  WALKIN_PATIENT: 200
};

// Token Status
const TOKEN_STATUS = {
  ALLOCATED: 'allocated',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noshow'
};

// Slot Status
const SLOT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  COMPLETED: 'completed'
};

// Patient Status
const PATIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked'
};

// Doctor Status
const DOCTOR_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ON_LEAVE: 'on_leave'
};

// Gender Options
const GENDER = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
};

// Communication Methods
const COMMUNICATION_METHODS = {
  SMS: 'sms',
  EMAIL: 'email',
  CALL: 'call'
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SLOT_CAPACITY_EXCEEDED: 'SLOT_CAPACITY_EXCEEDED',
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  DOCTOR_NOT_FOUND: 'DOCTOR_NOT_FOUND',
  INVALID_PRIORITY: 'INVALID_PRIORITY',
  SCHEDULING_CONFLICT: 'SCHEDULING_CONFLICT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
};

// Configuration Categories
const CONFIG_CATEGORIES = {
  PRIORITY: 'priority',
  CAPACITY: 'capacity',
  TIMING: 'timing',
  NOTIFICATION: 'notification'
};

module.exports = {
  TOKEN_SOURCES,
  PRIORITY_LEVELS,
  TOKEN_STATUS,
  SLOT_STATUS,
  PATIENT_STATUS,
  DOCTOR_STATUS,
  GENDER,
  COMMUNICATION_METHODS,
  ERROR_CODES,
  CONFIG_CATEGORIES
};