# OPD Token Allocation Engine - Algorithm Implementation

## Overview
Comprehensive documentation of the token allocation algorithm implementation, including prioritization logic, smart allocation strategies, and system architecture.

---

## 🧠 Core Algorithm Architecture

### 1. Multi-Strategy Allocation System

The system implements multiple allocation strategies based on request type:

```javascript
// Main allocation entry point
async allocateToken(request) {
  // Step 1: Validate request
  // Step 2: Check for duplicates
  // Step 3: Calculate priority
  // Step 4: Choose allocation strategy
  
  if (request.department) {
    return await this.allocateTokenByDepartment(request, priority);
  } else {
    return await this.allocateWithComplexLogic(request, priority);
  }
}
```

### 2. Department-Based Smart Allocation

**Algorithm Flow:**
```
1. Find all doctors in requested department
2. Check available slots for preferred date
3. If slots available → Select least loaded doctor
4. If no slots → Auto-generate slots for future dates
5. If no future availability → Return alternatives
```

**Implementation:**
```javascript
async selectSlotByDepartment(department, preferredDoctorId, preferredSlotId, preferredDate) {
  // Step 1: Try preferred slot first
  if (preferredSlotId) {
    const slot = await this.checkPreferredSlot(preferredSlotId, department);
    if (slot.available) return slot;
  }
  
  // Step 2: Try preferred doctor
  if (preferredDoctorId) {
    const slots = await this.findDoctorSlots(preferredDoctorId, date);
    if (slots.length > 0) return slots[0];
  }
  
  // Step 3: Smart department allocation
  const doctors = await this.getDoctorsByDepartment(department);
  const slots = await this.findDepartmentSlotsForDate(doctors, date);
  
  if (slots.length > 0) {
    // Sort by doctor workload (least loaded first)
    const slotsWithWorkload = await this.addWorkloadInfoToSlots(slots);
    return slotsWithWorkload.sort((a, b) => 
      a.doctorWorkload.currentPatients - b.doctorWorkload.currentPatients
    )[0];
  }
  
  // Step 4: Auto-generate future slots
  return await this.findOrGenerateNextAvailableSlot(doctors, date, department);
}
```

---

## 🎯 Priority Calculation System

### 1. Priority Scoring Algorithm

**Base Priority by Source:**
```javascript
const basePriorities = {
  emergency: 1000,    // Highest priority
  priority: 800,      // High priority patients
  followup: 600,      // Follow-up appointments
  online: 400,        // Online bookings
  walkin: 200         // Walk-in patients
};
```

### 2. Dynamic Priority Modifiers

**Age-based Modifier:**
```javascript
calculateAgeModifier(age) {
  if (age >= 65) return 100;      // Senior citizens
  if (age <= 12) return 80;       // Children
  if (age >= 50) return 50;       // Middle-aged
  return 0;                       // Adults
}
```

**Medical History Modifier:**
```javascript
calculateMedicalModifier(medicalHistory) {
  let modifier = 0;
  
  if (medicalHistory.critical) modifier += 200;
  if (medicalHistory.chronic) modifier += 100;
  
  // Condition-specific modifiers
  const criticalConditions = ['Heart Disease', 'Cancer', 'Stroke'];
  const chronicConditions = ['Diabetes', 'Hypertension', 'Asthma'];
  
  medicalHistory.conditions?.forEach(condition => {
    if (criticalConditions.includes(condition)) modifier += 150;
    if (chronicConditions.includes(condition)) modifier += 75;
  });
  
  return Math.min(modifier, 300); // Cap at 300
}
```

**Waiting Time Modifier:**
```javascript
calculateWaitingTimeModifier(waitingMinutes) {
  // Increase priority by 1 point per minute waited
  return Math.min(waitingMinutes, 120); // Cap at 2 hours
}
```

### 3. Final Priority Calculation

```javascript
async calculatePriority(source, patientInfo, waitingTime) {
  const basePriority = this.basePriorities[source] || 200;
  const ageModifier = this.calculateAgeModifier(patientInfo.age);
  const medicalModifier = this.calculateMedicalModifier(patientInfo.medicalHistory);
  const waitingModifier = this.calculateWaitingTimeModifier(waitingTime);
  
  const finalPriority = basePriority + ageModifier + medicalModifier + waitingModifier;
  
  return {
    finalPriority: Math.min(finalPriority, 2000), // System maximum
    breakdown: {
      base: basePriority,
      age: ageModifier,
      medical: medicalModifier,
      waiting: waitingModifier
    }
  };
}
```

---

## 🔄 Workload Balancing Algorithm

### 1. Doctor Workload Calculation

```javascript
async calculateDoctorWorkloadForDate(doctorId, date) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Count current patients
  const dayTokens = await this.tokenRepository.find({
    doctorId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['allocated', 'confirmed'] }
  });

  // Count available slots
  const daySlots = await this.slotRepository.find({
    doctorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: 'active'
  });

  const availableCapacity = daySlots.reduce((total, slot) => {
    return total + Math.max(0, slot.maxCapacity - slot.currentAllocation);
  }, 0);

  return {
    currentPatients: dayTokens.length,
    totalSlots: daySlots.length,
    availableSlots: availableCapacity,
    utilizationRate: daySlots.length > 0 
      ? (dayTokens.length / daySlots.reduce((sum, s) => sum + s.maxCapacity, 0)) * 100 
      : 0
  };
}
```

### 2. Least Loaded Doctor Selection

```javascript
async addWorkloadInfoToSlots(slots) {
  const slotsWithWorkload = [];
  
  for (const slot of slots) {
    const workload = await this.calculateDoctorWorkloadForDate(slot.doctorId, slot.date);
    
    slotsWithWorkload.push({
      ...slot.toObject(),
      doctorWorkload: workload
    });
  }
  
  // Sort by current patients (ascending - least loaded first)
  return slotsWithWorkload.sort((a, b) => 
    a.doctorWorkload.currentPatients - b.doctorWorkload.currentPatients
  );
}
```

---

## 🚨 Emergency Allocation Algorithm

### 1. Emergency Token Processing

```javascript
async handleEmergencyInsertion(request) {
  const { patientId, department, urgencyLevel, allowPreemption } = request;
  
  // Step 1: Calculate emergency priority (1000+)
  const emergencyPriority = 1000 + this.getUrgencyBonus(urgencyLevel);
  
  // Step 2: Find immediate slots
  const immediateSlots = await this.findImmediateEmergencySlots(department);
  
  if (immediateSlots.length > 0) {
    return await this.allocateEmergencySlot(patientId, immediateSlots[0], emergencyPriority);
  }
  
  // Step 3: Try preemption if allowed
  if (allowPreemption) {
    const preemptionResult = await this.attemptPreemption(department, emergencyPriority);
    if (preemptionResult.success) {
      return preemptionResult;
    }
  }
  
  // Step 4: Create emergency slot
  return await this.createEmergencySlot(department, emergencyPriority);
}
```

### 2. Preemption Algorithm

```javascript
async attemptPreemption(department, emergencyPriority) {
  // Find tokens with lower priority that can be preempted
  const preemptableTokens = await this.findPreemptableTokens(department, emergencyPriority);
  
  if (preemptableTokens.length === 0) {
    return { success: false, reason: 'No preemptable tokens found' };
  }
  
  // Select token with lowest priority
  const tokenToPreempt = preemptableTokens.sort((a, b) => a.priority - b.priority)[0];
  
  // Preempt the token
  await this.preemptToken(tokenToPreempt);
  
  // Allocate emergency token to the freed slot
  return await this.allocateToPreemptedSlot(tokenToPreempt.slotId, emergencyPriority);
}
```

---

## 🔮 Future Date Auto-Generation

### 1. Next Available Slot Algorithm

```javascript
async findOrGenerateNextAvailableSlot(doctors, startDate, department, maxDaysAhead = 30) {
  for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setUTCDate(checkDate.getUTCDate() + dayOffset);
    
    // Check existing slots
    const existingSlots = await this.findDepartmentSlotsForDate(doctors, checkDate);
    
    if (existingSlots.length > 0) {
      const slotsWithWorkload = await this.addWorkloadInfoToSlots(existingSlots);
      return {
        selectedSlot: slotsWithWorkload[0],
        allocatedDate: checkDate.toDateString(),
        wasGenerated: false
      };
    }
    
    // Try to generate slots for this date
    const generationResult = await this.slotGenerationService.generateSlotsForDate(checkDate);
    
    if (generationResult.success && generationResult.data.generatedSlots > 0) {
      const newSlots = await this.findDepartmentSlotsForDate(doctors, checkDate);
      
      if (newSlots.length > 0) {
        const slotsWithWorkload = await this.addWorkloadInfoToSlots(newSlots);
        return {
          selectedSlot: slotsWithWorkload[0],
          allocatedDate: checkDate.toDateString(),
          wasGenerated: true
        };
      }
    }
  }
  
  return { success: false, reason: 'No availability found within search period' };
}
```

---

## 🛡️ Duplicate Prevention System

### 1. Multi-Level Duplicate Checking

```javascript
async checkForDuplicateAllocation(patientId, doctorId, slotId, preferredDate) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setUTCHours(23, 59, 59, 999);
  
  // Level 1: Same slot check
  if (slotId) {
    const existingInSlot = await this.tokenRepository.find({
      patientId,
      slotId,
      status: { $in: ['allocated', 'confirmed'] }
    });
    
    if (existingInSlot.length > 0) {
      return this.createDuplicateError('DUPLICATE_TOKEN_IN_SLOT', existingInSlot[0]);
    }
  }
  
  // Level 2: Same doctor same day check
  if (doctorId) {
    const existingWithDoctor = await this.tokenRepository.find({
      patientId,
      doctorId,
      createdAt: { $gte: today, $lte: endOfDay },
      status: { $in: ['allocated', 'confirmed'] }
    });
    
    if (existingWithDoctor.length > 0) {
      return this.createDuplicateError('DUPLICATE_TOKEN_WITH_DOCTOR', existingWithDoctor[0]);
    }
  }
  
  // Level 3: Same day check (with emergency exception)
  const existingOnDate = await this.tokenRepository.find({
    patientId,
    createdAt: { $gte: today, $lte: endOfDay },
    status: { $in: ['allocated', 'confirmed'] }
  });
  
  if (existingOnDate.length > 0) {
    const isEmergency = existingOnDate[0].source === 'emergency' || existingOnDate[0].priority > 800;
    
    if (!isEmergency) {
      return this.createDuplicateError('DUPLICATE_TOKEN_ON_DATE', existingOnDate[0]);
    }
  }
  
  return { success: true };
}
```

---

## ⚡ Concurrency Control

### 1. Optimistic Locking for Slot Allocation

```javascript
async allocateDirectlyInternal(patientId, doctorId, slotId, source, priority) {
  const slot = await this.slotRepository.findOne({ slotId });
  
  if (!slot) {
    throw new Error('Slot not found');
  }
  
  // Atomic increment with capacity check
  const updatedSlot = await this.slotRepository.model.findOneAndUpdate(
    { 
      slotId: slotId,
      currentAllocation: { $lt: slot.maxCapacity }  // Only if under capacity
    },
    { 
      $inc: { currentAllocation: 1, lastTokenNumber: 1 }
    },
    { 
      new: true,
      upsert: false
    }
  );
  
  if (!updatedSlot) {
    throw new Error('Slot at capacity');
  }
  
  // Create token with atomic token number
  const tokenData = {
    tokenId: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    patientId,
    doctorId,
    slotId,
    tokenNumber: updatedSlot.lastTokenNumber,
    source,
    priority,
    status: 'allocated'
  };
  
  try {
    const token = await this.tokenRepository.create(tokenData);
    return this.createSuccessResponse({ token }, 'Token allocated successfully');
  } catch (error) {
    // Rollback on failure
    await this.slotRepository.model.findOneAndUpdate(
      { slotId: slotId },
      { $inc: { currentAllocation: -1, lastTokenNumber: -1 } }
    );
    throw error;
  }
}
```

---

## 📊 Performance Optimizations

### 1. Database Indexing Strategy

```javascript
// Token Collection Indexes
tokenSchema.index({ patientId: 1 });
tokenSchema.index({ doctorId: 1, slotId: 1 });
tokenSchema.index({ slotId: 1, tokenNumber: 1 });
tokenSchema.index({ priority: -1 }); // Descending for priority queries
tokenSchema.index({ status: 1 });
tokenSchema.index({ createdAt: 1 });

// Slot Collection Indexes
slotSchema.index({ doctorId: 1, date: 1 });
slotSchema.index({ date: 1, status: 1 });
slotSchema.index({ specialty: 1, date: 1 });
slotSchema.index({ status: 1, currentAllocation: 1 });
```

### 2. Caching Strategy

```javascript
// Cache frequently accessed data
const doctorCache = new Map();
const slotCache = new Map();

async getCachedDoctorsByDepartment(department) {
  const cacheKey = `doctors_${department}`;
  
  if (doctorCache.has(cacheKey)) {
    return doctorCache.get(cacheKey);
  }
  
  const doctors = await this.doctorRepository.findBySpecialty(department);
  doctorCache.set(cacheKey, doctors);
  
  // Cache for 5 minutes
  setTimeout(() => doctorCache.delete(cacheKey), 300000);
  
  return doctors;
}
```

---

## 🔄 Algorithm Flow Summary

### Complete Token Allocation Flow

```
1. Request Validation
   ├── Check required parameters
   ├── Validate patient exists
   └── Validate request format

2. Duplicate Prevention
   ├── Check same slot
   ├── Check same doctor same day
   └── Check same day (with exceptions)

3. Priority Calculation
   ├── Base priority by source
   ├── Age modifier
   ├── Medical history modifier
   └── Waiting time modifier

4. Allocation Strategy Selection
   ├── Department-based (smart allocation)
   └── Specific doctor/slot

5. Smart Department Allocation
   ├── Try preferred slot/doctor
   ├── Find least loaded doctor
   ├── Auto-generate future slots
   └── Return alternatives if needed

6. Slot Assignment
   ├── Atomic capacity check
   ├── Token creation
   ├── Audit logging
   └── Response formatting

7. Error Handling
   ├── Rollback on failure
   ├── Detailed error messages
   └── Suggested actions
```

This algorithm implementation ensures fair, efficient, and reliable token allocation while handling edge cases and maintaining system performance.