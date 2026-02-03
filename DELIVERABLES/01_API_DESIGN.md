# OPD Token Allocation Engine - API Design

## Overview
Complete REST API design for the OPD Token Allocation Engine with endpoints, request/response schemas, and data models.

## Base URL
```
http://localhost:3000/api
```

## Authentication
- **Development Mode**: Authentication bypassed (NODE_ENV=development)
- **Production Mode**: Requires API key in header `X-API-Key` or query parameter `api_key`

---

## 🏥 Core Entities & Data Schemas

### 1. Doctor Schema
```json
{
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "personalInfo": {
    "name": "Dr. John Smith",
    "specialization": "cardiology",
    "qualification": "MD, MBBS",
    "experience": 15,
    "contactInfo": {
      "phone": "+1234567890",
      "email": "dr.smith@hospital.com"
    }
  },
  "departmentInfo": {
    "department": "cardiology",
    "designation": "Senior Consultant",
    "joiningDate": "2020-01-15T00:00:00.000Z"
  },
  "availability": {
    "status": "active",
    "workingHours": {
      "start": "09:00",
      "end": "17:00"
    }
  }
}
```

### 2. Patient Schema
```json
{
  "patientId": "PAT_1770113275282_5khy8hti6",
  "personalInfo": {
    "name": "Jane Doe",
    "age": 45,
    "gender": "female",
    "contactInfo": {
      "phone": "+1234567890",
      "email": "jane.doe@email.com",
      "address": "123 Main St, City"
    }
  },
  "medicalInfo": {
    "medicalHistory": {
      "chronic": true,
      "critical": false,
      "conditions": ["Hypertension", "Diabetes"]
    },
    "allergies": ["Penicillin"],
    "emergencyContact": {
      "name": "John Doe",
      "phone": "+1234567891",
      "relation": "Spouse"
    }
  },
  "registrationInfo": {
    "registrationDate": "2026-02-01T00:00:00.000Z",
    "source": "online"
  }
}
```

### 3. Time Slot Schema
```json
{
  "slotId": "slot_DOC_1770110541676_c7dncqpga_2026-02-03_1000",
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "date": "2026-02-03T00:00:00.000Z",
  "startTime": "10:00",
  "endTime": "13:00",
  "maxCapacity": 12,
  "currentAllocation": 8,
  "lastTokenNumber": 8,
  "status": "active",
  "specialty": "cardiology",
  "slotType": "regular",
  "metadata": {
    "averageConsultationTime": 15,
    "bufferTime": 5,
    "emergencyReserved": 2,
    "generatedAt": "2026-02-03T00:00:00.000Z",
    "generatedBy": "midnight_slot_generation"
  }
}
```

### 4. Token Schema
```json
{
  "tokenId": "token_1770116266169_5rgpkac",
  "patientId": "PAT_1770113275282_5khy8hti6",
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "slotId": "slot_DOC_1770110541676_c7dncqpga_2026-02-03_1000",
  "tokenNumber": 9,
  "source": "online",
  "priority": 400,
  "status": "allocated",
  "metadata": {
    "waitingTime": 0,
    "estimatedServiceTime": 15,
    "fastTrack": false,
    "consultationType": "regular"
  }
}
```

### 5. Doctor Schedule Schema
```json
{
  "scheduleId": "schedule_DOC_1770110541676_c7dncqpga",
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "department": "cardiology",
  "weeklySchedule": {
    "monday": [
      {
        "startTime": "09:00",
        "endTime": "12:00",
        "maxCapacity": 10,
        "slotType": "regular"
      },
      {
        "startTime": "14:00",
        "endTime": "17:00",
        "maxCapacity": 8,
        "slotType": "regular"
      }
    ],
    "tuesday": [
      {
        "startTime": "10:00",
        "endTime": "15:00",
        "maxCapacity": 12,
        "slotType": "regular"
      }
    ]
  },
  "effectiveFrom": "2026-02-01T00:00:00.000Z",
  "effectiveTo": "2026-12-31T23:59:59.999Z",
  "status": "active"
}
```

---

## 🔗 API Endpoints

### Health Check
```http
GET /api/health
```
**Response:**
```json
{
  "success": true,
  "message": "OPD Token Allocation Engine is running",
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-03T12:00:00.000Z",
    "version": "1.0.0"
  }
}
```

---

## 👨‍⚕️ Doctor Management

### 1. Create Doctor
```http
POST /api/doctors
Content-Type: application/json

{
  "personalInfo": {
    "name": "Dr. John Smith",
    "specialization": "cardiology",
    "qualification": "MD, MBBS",
    "experience": 15
  },
  "departmentInfo": {
    "department": "cardiology",
    "designation": "Senior Consultant"
  }
}
```

### 2. Get All Doctors
```http
GET /api/doctors?page=1&limit=10&department=cardiology
```

### 3. Get Doctor by ID
```http
GET /api/doctors/{doctorId}
```

### 4. Update Doctor
```http
PUT /api/doctors/{doctorId}
```

### 5. Delete Doctor
```http
DELETE /api/doctors/{doctorId}
```

---

## 👤 Patient Management

### 1. Create Patient
```http
POST /api/patients
Content-Type: application/json

{
  "personalInfo": {
    "name": "Jane Doe",
    "age": 45,
    "gender": "female"
  },
  "medicalInfo": {
    "medicalHistory": {
      "chronic": true,
      "conditions": ["Hypertension"]
    }
  }
}
```

### 2. Get All Patients
```http
GET /api/patients?page=1&limit=10
```

### 3. Get Patient by ID
```http
GET /api/patients/{patientId}
```

### 4. Update Patient
```http
PUT /api/patients/{patientId}
```

---

## 📅 Doctor Schedule Management

### 1. Create Doctor Schedule
```http
POST /api/doctor-schedules
Content-Type: application/json

{
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "department": "cardiology",
  "weeklySchedule": {
    "monday": [
      {
        "startTime": "09:00",
        "endTime": "12:00",
        "maxCapacity": 10
      }
    ]
  }
}
```

### 2. Get Doctor Schedules
```http
GET /api/doctor-schedules?doctorId={doctorId}
```

### 3. Update Doctor Schedule
```http
PUT /api/doctor-schedules/{scheduleId}
```

---

## 🕐 Slot Management

### 1. Get Available Slots
```http
GET /api/slots?doctorId={doctorId}&date=2026-02-03&status=active
```

### 2. Get Slot by ID
```http
GET /api/slots/{slotId}
```

### 3. Update Slot
```http
PUT /api/slots/{slotId}
```

---

## 🎫 Token Management (Core Functionality)

### 1. Create Token (Department-based Smart Allocation)
```http
POST /api/tokens
Content-Type: application/json

{
  "patientId": "PAT_1770113275282_5khy8hti6",
  "department": "cardiology",
  "source": "online",
  "patientType": {
    "age": 45,
    "medicalHistory": {
      "chronic": true,
      "conditions": ["Hypertension"]
    }
  },
  "preferences": {
    "preferredTime": "10:00"
  }
}
```

### 2. Create Token (Specific Doctor & Slot)
```http
POST /api/tokens
Content-Type: application/json

{
  "patientId": "PAT_1770113275282_5khy8hti6",
  "doctorId": "DOC_1770110541676_c7dncqpga",
  "slotId": "slot_DOC_1770110541676_c7dncqpga_2026-02-03_1000",
  "source": "online"
}
```

### 3. Emergency Token Allocation
```http
POST /api/tokens/emergency
Content-Type: application/json

{
  "patientId": "PAT_EMERGENCY_123",
  "department": "cardiology",
  "urgencyLevel": "emergency",
  "medicalReason": "Chest pain, suspected heart attack",
  "requestedBy": "Dr. Emergency",
  "allowPreemption": true
}
```

### 4. Get All Tokens
```http
GET /api/tokens?page=1&limit=10&status=allocated&sortBy=priority&sortOrder=desc
```

### 5. Get Token by ID
```http
GET /api/tokens/{tokenId}
```

### 6. Confirm Token (Patient Check-in)
```http
POST /api/tokens/{tokenId}/confirm
Content-Type: application/json

{
  "confirmedBy": "Reception Staff"
}
```

### 7. Complete Token
```http
POST /api/tokens/{tokenId}/complete
Content-Type: application/json

{
  "completedBy": "Dr. Smith",
  "notes": "Consultation completed successfully"
}
```

### 8. Mark Token as No-Show
```http
POST /api/tokens/{tokenId}/no-show
Content-Type: application/json

{
  "reason": "Patient did not show up for appointment",
  "markedBy": "Reception Staff"
}
```

### 9. Cancel Token
```http
DELETE /api/tokens/{tokenId}
Content-Type: application/json

{
  "reason": "patient_request",
  "cancelledBy": "Reception Staff",
  "notes": "Patient requested cancellation"
}
```

### 10. Move Token to Different Slot
```http
POST /api/tokens/{tokenId}/move/{newSlotId}
Content-Type: application/json

{
  "reason": "Doctor unavailable",
  "requestedBy": "Admin"
}
```

---

## 📊 Statistics & Reporting

### 1. Token Statistics
```http
GET /api/tokens/statistics?startDate=2026-02-01&endDate=2026-02-03
```

### 2. Waiting List
```http
GET /api/tokens/waiting-list?doctorId={doctorId}&priorityMin=800
```

### 3. Tokens by Slot
```http
GET /api/tokens/slot/{slotId}
```

---

## ⚙️ System Operations

### 1. Generate Slots for Today
```http
POST /api/cron/generate-slots
```

### 2. Generate Slots for Specific Date
```http
POST /api/cron/generate-slots/2026-02-04
```

### 3. Slot Generation Statistics
```http
GET /api/cron/generation-stats?startDate=2026-02-01&endDate=2026-02-03
```

---

## 📝 Standard Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  },
  "timestamp": "2026-02-03T12:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "field": "patientId",
      "value": "invalid_id"
    },
    "suggestions": [
      "Check the patient ID format",
      "Ensure patient exists in system"
    ],
    "timestamp": "2026-02-03T12:00:00.000Z"
  }
}
```

---

## 🔒 Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Request validation failed | 400 |
| `NOT_FOUND` | Resource not found | 404 |
| `DUPLICATE_KEY_ERROR` | Duplicate resource | 409 |
| `SLOT_FULL` | Slot at capacity | 409 |
| `INVALID_TOKEN_STATUS` | Invalid token status transition | 400 |
| `INSUFFICIENT_PERMISSIONS` | Authorization failed | 403 |
| `INTERNAL_SERVER_ERROR` | System error | 500 |

---

## 📋 Query Parameters

### Pagination
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

### Sorting
- `sortBy`: Field to sort by
- `sortOrder`: `asc` or `desc` (default: `asc`)

### Filtering
- `status`: Filter by status
- `date`: Filter by date (ISO format)
- `department`: Filter by department
- `priority`: Filter by priority level

---

This API design provides complete CRUD operations for all entities with proper validation, error handling, and consistent response formats.