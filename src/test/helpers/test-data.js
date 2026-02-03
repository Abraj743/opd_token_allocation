/**
 * Test Data Factory
 * Provides consistent test data for all test suites
 */

class TestDataFactory {
  static createDoctor(overrides = {}) {
    return {
      doctorId: `doctor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: 'Dr. Test Doctor',
      specialty: 'general_medicine',
      qualification: 'MBBS, MD',
      experience: 10,
      schedule: [
        {
          dayOfWeek: new Date().getDay(),
          slots: [
            { startTime: '09:00', endTime: '10:00', capacity: 5 },
            { startTime: '10:00', endTime: '11:00', capacity: 5 },
            { startTime: '14:00', endTime: '15:00', capacity: 3 }
          ]
        }
      ],
      contactInfo: {
        phoneNumber: '9876543210',
        email: 'test.doctor@hospital.com',
        department: 'general_medicine'
      },
      ...overrides
    };
  }

  static createPatient(overrides = {}) {
    const basePatient = {
      patientId: `patient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      personalInfo: {
        name: 'Test Patient',
        age: 35,
        gender: 'male',
        phoneNumber: '9876543220',
        email: 'test.patient@email.com',
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456'
        }
      },
      departmentInfo: {
        preferredDepartment: 'general_medicine',
        chiefComplaint: 'Test complaint',
        urgencyLevel: 'routine'
      },
      medicalInfo: {
        bloodGroup: 'O+',
        allergies: [],
        chronicConditions: [],
        emergencyContact: {
          name: 'Test Emergency Contact',
          relationship: 'spouse',
          phoneNumber: '9876543221'
        }
      }
    };

    // Deep merge overrides to preserve nested object structure
    const result = { ...basePatient, ...overrides };
    
    if (overrides.personalInfo) {
      result.personalInfo = { ...basePatient.personalInfo, ...overrides.personalInfo };
      if (overrides.personalInfo.address) {
        result.personalInfo.address = { ...basePatient.personalInfo.address, ...overrides.personalInfo.address };
      }
    }
    
    if (overrides.departmentInfo) {
      result.departmentInfo = { ...basePatient.departmentInfo, ...overrides.departmentInfo };
    }
    
    if (overrides.medicalInfo) {
      result.medicalInfo = { ...basePatient.medicalInfo, ...overrides.medicalInfo };
      if (overrides.medicalInfo.emergencyContact) {
        result.medicalInfo.emergencyContact = { ...basePatient.medicalInfo.emergencyContact, ...overrides.medicalInfo.emergencyContact };
      }
    }

    return result;
  }

  static createTimeSlot(overrides = {}) {
    return {
      slotId: `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      doctorId: 'test_doctor_id',
      date: new Date(),
      startTime: '09:00',
      endTime: '10:00',
      maxCapacity: 5,
      currentAllocation: 0,
      status: 'active',
      specialty: 'general_medicine',
      lastTokenNumber: 0,
      ...overrides
    };
  }

  static createToken(overrides = {}) {
    return {
      tokenId: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      patientId: 'test_patient_id',
      doctorId: 'test_doctor_id',
      slotId: 'test_slot_id',
      tokenNumber: 1,
      source: 'online',
      priority: 400,
      status: 'allocated',
      ...overrides
    };
  }

  static createConfiguration(overrides = {}) {
    return {
      configKey: `test.config.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`,
      configValue: 'test_value',
      category: 'system',
      description: 'Test configuration for testing purposes',
      updatedBy: 'test_user',
      validationRules: {
        type: 'string',
        required: false
      },
      ...overrides
    };
  }

  // Predefined test scenarios
  static getEmergencyPatient() {
    return this.createPatient({
      personalInfo: {
        name: 'Emergency Patient',
        age: 65,
        gender: 'female',
        phoneNumber: '9876543230',
        email: 'emergency.patient@email.com',
        address: {
          street: '456 Emergency Street',
          city: 'Emergency City',
          state: 'Emergency State',
          pincode: '654321'
        }
      },
      departmentInfo: {
        preferredDepartment: 'cardiology',
        chiefComplaint: 'Severe chest pain',
        urgencyLevel: 'emergency'
      },
      medicalInfo: {
        bloodGroup: 'A+',
        chronicConditions: ['Hypertension', 'Diabetes'],
        emergencyContact: {
          name: 'Emergency Contact Person',
          relationship: 'spouse',
          phoneNumber: '9876543231'
        }
      }
    });
  }

  static getFollowupPatient(lastVisitedDoctorId) {
    return this.createPatient({
      personalInfo: {
        name: 'Followup Patient',
        age: 45,
        gender: 'male'
      },
      departmentInfo: {
        preferredDepartment: 'cardiology',
        chiefComplaint: 'Follow-up consultation',
        urgencyLevel: 'routine',
        lastVisitedDoctor: lastVisitedDoctorId
      }
    });
  }

  static getPriorityPatient() {
    return this.createPatient({
      personalInfo: {
        name: 'Priority Patient',
        age: 70,
        gender: 'male'
      },
      departmentInfo: {
        preferredDepartment: 'general_medicine',
        chiefComplaint: 'Chronic condition management',
        urgencyLevel: 'urgent'
      },
      medicalInfo: {
        chronicConditions: ['Diabetes', 'Hypertension', 'Heart Disease']
      }
    });
  }

  static getCardiologyDoctor() {
    return this.createDoctor({
      name: 'Dr. Cardiology Specialist',
      specialty: 'cardiology',
      qualification: 'MBBS, MD, DM Cardiology',
      experience: 15,
      contactInfo: {
        phoneNumber: '9876543211',
        email: 'cardio.doctor@hospital.com',
        department: 'cardiology'
      }
    });
  }

  static getPediatricsDoctor() {
    return this.createDoctor({
      name: 'Dr. Pediatrics Specialist',
      specialty: 'pediatrics',
      qualification: 'MBBS, MD Pediatrics',
      experience: 8,
      contactInfo: {
        phoneNumber: '9876543212',
        email: 'pediatrics.doctor@hospital.com',
        department: 'pediatrics'
      }
    });
  }

  // Bulk data creation for load testing
  static createMultiplePatients(count, baseData = {}) {
    const patients = [];
    for (let i = 0; i < count; i++) {
      const uniqueId = `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}`;
      const phoneBase = 9876540000 + i; // Ensures exactly 10 digits
      const emergencyPhoneBase = 9876550000 + i; // Ensures exactly 10 digits
      
      patients.push(this.createPatient({
        patientId: `patient_${uniqueId}`,
        personalInfo: {
          name: `Test Patient ${i + 1}`,
          age: 20 + (i % 60), // Ages between 20-80
          phoneNumber: phoneBase.toString(), // Exactly 10 digits
          email: `patient${i + 1}@test.com`, // Unique emails
          ...baseData.personalInfo
        },
        medicalInfo: {
          bloodGroup: 'O+',
          allergies: [],
          chronicConditions: [],
          emergencyContact: {
            name: `Emergency Contact ${i + 1}`,
            relationship: 'spouse',
            phoneNumber: emergencyPhoneBase.toString() // Exactly 10 digits
          },
          ...baseData.medicalInfo
        },
        ...baseData
      }));
    }
    return patients;
  }

  static createMultipleSlots(doctorId, count, baseData = {}) {
    const slots = [];
    const startHour = 9;
    
    for (let i = 0; i < count; i++) {
      const hour = startHour + i;
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;
      
      slots.push(this.createTimeSlot({
        doctorId,
        startTime,
        endTime,
        ...baseData
      }));
    }
    return slots;
  }
}

module.exports = TestDataFactory;