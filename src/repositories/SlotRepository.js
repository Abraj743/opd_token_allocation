const BaseRepository = require('./BaseRepository');


class SlotRepository extends BaseRepository {
  constructor({ timeSlotModel, logger }) {
    super({ model: timeSlotModel, logger });
  }

  
  async findBySlotId(slotId) {
    return this.findOne({ slotId });
  }

  
  async updateBySlotId(slotId, updateData, options = { new: true }) {
    return this.model.findOneAndUpdate({ slotId }, updateData, options);
  }

  
  async findAvailable(criteria = {}, options = {}) {
    const { page, limit, sort, sortBy, includeFullyBooked, ...mongodbCriteria } = criteria;
    
    const searchCriteria = {
      status: 'active',
      ...mongodbCriteria
    };

    
    const defaultOptions = { sort: { date: 1, startTime: 1 } };
    
    
    
    const allSlots = await this.find(searchCriteria, { ...defaultOptions, ...options });
    
    
    const availableSlots = allSlots.filter(slot => 
      (slot.currentAllocation || 0) < slot.maxCapacity
    );
    
    
    return availableSlots;
  }

  
  async findAvailableSlots(doctorId, date, options = {}) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const criteria = {
      doctorId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'active',
      $expr: {
        $lt: ['$currentAllocation', '$maxCapacity']
      }
    };

    const defaultOptions = { sort: { startTime: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findByDoctorAndDate(doctorId, date, options = {}) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const criteria = {
      doctorId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    };

    const defaultOptions = { sort: { startTime: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  async findByDoctor(doctorId, options = {}) {
    const criteria = { doctorId };
    const defaultOptions = { sort: { date: 1, startTime: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findByDoctorId(doctorId, options = {}) {
    return this.findByDoctor(doctorId, options);
  }

  
  async findByDateRange(startDate, endDate, additionalCriteria = {}) {
    const criteria = {
      date: {
        $gte: startDate,
        $lte: endDate
      },
      ...additionalCriteria
    };

    return this.find(criteria, { sort: { date: 1, startTime: 1 } });
  }

  
  async findByDate(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const slots = await this.model.find({
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }).sort({ doctorId: 1, startTime: 1 });

      return slots;
    } catch (error) {
      this.logger.error(`Error finding slots by date:`, { date, error: error.message });
      throw error;
    }
  }

  
  async updateCapacity(slotId, newCapacity) {
    const updateData = {
      maxCapacity: newCapacity,
      updatedAt: new Date()
    };

    return this.updateBySlotId(slotId, updateData);
  }

  
  async getCurrentAllocation(slotId) {
    try {
      const slot = await this.findBySlotId(slotId);
      return slot ? slot.currentAllocation : 0;
    } catch (error) {
      this.logger.error(`Error getting current allocation for slot ${slotId}:`, error);
      throw error;
    }
  }

  
  async incrementAllocation(slotId, increment = 1) {
    const updateData = {
      $inc: { currentAllocation: increment },
      updatedAt: new Date()
    };

    return this.model.findOneAndUpdate({ slotId }, updateData, { new: true });
  }

  
  async decrementAllocation(slotId, decrement = 1) {
    const updateData = {
      $inc: { currentAllocation: -decrement },
      updatedAt: new Date()
    };

    return this.model.findOneAndUpdate({ slotId }, updateData, { new: true });
  }

  
  async findWithAvailableCapacity(requiredCapacity = 1, additionalCriteria = {}) {
    const criteria = {
      status: 'active',
      $expr: {
        $gte: [
          { $subtract: ['$maxCapacity', '$currentAllocation'] },
          requiredCapacity
        ]
      },
      ...additionalCriteria
    };

    return this.find(criteria, { sort: { date: 1, startTime: 1 } });
  }

  
  async findBySpecialty(specialty, options = {}) {
    const criteria = { specialty };
    const defaultOptions = { sort: { date: 1, startTime: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async updateStatus(slotId, status) {
    const updateData = {
      status,
      updatedAt: new Date()
    };

    return this.updateBySlotId(slotId, updateData);
  }

  async findOverbooked(additionalCriteria = {}) {
    const criteria = {
      $expr: {
        $gt: ['$currentAllocation', '$maxCapacity']
      },
      ...additionalCriteria
    };

    return this.find(criteria, { sort: { date: 1, startTime: 1 } });
  }

  
  async getUtilizationStatistics(startDate, endDate) {
    try {
      const pipeline = [
        {
          $match: {
            date: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $group: {
            _id: {
              doctorId: '$doctorId',
              specialty: '$specialty'
            },
            totalSlots: { $sum: 1 },
            totalCapacity: { $sum: '$maxCapacity' },
            totalAllocated: { $sum: '$currentAllocation' },
            avgUtilization: {
              $avg: {
                $divide: ['$currentAllocation', '$maxCapacity']
              }
            }
          }
        }
      ];

      const results = await this.model.aggregate(pipeline);
      return results;
    } catch (error) {
      this.logger.error('Error getting slot utilization statistics:', error);
      throw error;
    }
  }

  
  async findAlternativeSlots(originalSlotId, doctorId = null, preferredDate = null, timeWindowHours = 4) {
    const criteria = {
      _id: { $ne: originalSlotId },
      status: 'active',
      $expr: {
        $lt: ['$currentAllocation', '$maxCapacity']
      }
    };

    if (doctorId) {
      criteria.doctorId = doctorId;
    }

    if (preferredDate) {
      const startTime = new Date(preferredDate.getTime() - (timeWindowHours * 60 * 60 * 1000));
      const endTime = new Date(preferredDate.getTime() + (timeWindowHours * 60 * 60 * 1000));
      
      criteria.date = {
        $gte: startTime,
        $lte: endTime
      };
    }

    return this.find(criteria, { 
      sort: { 
        date: 1, 
        startTime: 1 
      },
      limit: 10 
    });
  }

  
  async findOverlappingSlots(doctorId, date, startTime, endTime) {
    const slotDate = new Date(date);
    
    const criteria = {
      doctorId,
      date: slotDate,
      $or: [
        
        {
          startTime: { $lte: startTime },
          endTime: { $gt: startTime }
        },
       
        {
          startTime: { $lt: endTime },
          endTime: { $gte: endTime }
        },
       
        {
          startTime: { $gte: startTime },
          endTime: { $lte: endTime }
        },
       
        {
          startTime: { $lte: startTime },
          endTime: { $gte: endTime }
        }
      ]
    };

    return this.find(criteria);
  }

  
  async updateMetadata(slotId, metadata) {
    const updateData = {
      $set: {
        'metadata': metadata,
        updatedAt: new Date()
      }
    };

    return this.updateBySlotId(slotId, updateData);
  }

  
  async findByDoctorAndDateRange(doctorId, startDate, endDate, options = {}) {
    const criteria = {
      doctorId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    };

    const defaultOptions = { sort: { date: 1, startTime: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async getStatistics(criteria = {}) {
    try {
      const pipeline = [
        { $match: criteria },
        {
          $group: {
            _id: null,
            totalSlots: { $sum: 1 },
            activeSlots: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            suspendedSlots: {
              $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
            },
            completedSlots: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            totalCapacity: { $sum: '$maxCapacity' },
            totalAllocated: { $sum: '$currentAllocation' }
          }
        }
      ];

      const results = await this.model.aggregate(pipeline);
      
      if (results.length === 0) {
        return {
          totalSlots: 0,
          activeSlots: 0,
          suspendedSlots: 0,
          completedSlots: 0,
          totalCapacity: 0,
          totalAllocated: 0
        };
      }

      return results[0];
    } catch (error) {
      this.logger.error('Error getting slot statistics:', error);
      throw error;
    }
  }
}

module.exports = SlotRepository;