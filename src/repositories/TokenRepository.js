const BaseRepository = require('./BaseRepository');


class TokenRepository extends BaseRepository {
  constructor({ tokenModel, logger }) {
    super({ model: tokenModel, logger });
  }

  
  async findBySlot(slotId, options = {}) {
    const criteria = { slotId };
    const defaultOptions = { sort: { tokenNumber: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

 
  async findByPriority(slotId, minPriority) {
    const criteria = {
      slotId,
      priority: { $gte: minPriority }
    };
    
    return this.find(criteria, { sort: { priority: -1, createdAt: 1 } });
  }

  
  async findPreemptableTokens(slotId, priority) {
    const criteria = {
      slotId,
      priority: { $lt: priority },
      status: { $in: ['allocated', 'confirmed'] }
    };
    
    return this.find(criteria, { sort: { priority: 1, createdAt: -1 } });
  }

 
  async getNextTokenNumber(slotId) {
    try {
      const lastToken = await this.model
        .findOne({ slotId })
        .sort({ tokenNumber: -1 })
        .exec();

      return lastToken ? lastToken.tokenNumber + 1 : 1;
    } catch (error) {
      this.logger.error(`Error getting next token number for slot ${slotId}:`, error);
      throw error;
    }
  }

  
  async countActiveTokensForSlot(slotId) {
    const criteria = {
      slotId,
      status: { $in: ['allocated', 'confirmed'] }
    };
    
    return this.count(criteria);
  }

  
  async findByPatient(patientId, options = {}) {
    const criteria = { patientId };
    const defaultOptions = { sort: { createdAt: -1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

 
  async findByTokenId(tokenId) {
    return this.findOne({ tokenId });
  }

  
  async findBySlotId(slotId, options = {}) {
    const criteria = { slotId };
    const defaultOptions = { sort: { tokenNumber: 1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findByPatientId(patientId, options = {}) {
    const criteria = { patientId };
    const defaultOptions = { sort: { createdAt: -1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findByDoctor(doctorId, options = {}) {
    const criteria = { doctorId };
    const defaultOptions = { sort: { createdAt: -1 } };
    return this.find(criteria, { ...defaultOptions, ...options });
  }

  
  async findByDoctorId(doctorId, options = {}) {
    return this.findByDoctor(doctorId, options);
  }

  
  async updateStatus(tokenId, status, additionalData = {}) {
    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalData
    };

    const token = await this.findOne({ tokenId });
    if (!token) {
      return null;
    }

    return this.updateById(token._id, updateData);
  }

  
  async update(id, updateData) {
   
    const finalUpdateData = {
      ...updateData,
      updatedAt: new Date()
    };

    
    return this.updateById(id, finalUpdateData);
  }

  
  async moveToSlot(tokenId, newSlotId, newTokenNumber) {
    const token = await this.findOne({ tokenId });
    if (!token) {
      return null;
    }

    const updateData = {
      'metadata.originalSlotId': token.slotId,
      slotId: newSlotId,
      tokenNumber: newTokenNumber,
      updatedAt: new Date()
    };

    return this.updateById(token._id, updateData);
  }

 
  async findTokensNeedingReallocation(affectedSlotIds) {
    const criteria = {
      slotId: { $in: affectedSlotIds },
      status: { $in: ['allocated', 'confirmed'] }
    };
    
    return this.find(criteria, { sort: { priority: -1, createdAt: 1 } });
  }

 
  async findBySource(source, options = {}) {
    const criteria = { source };
    return this.find(criteria, options);
  }

  
  async getTokenStatistics(startDate, endDate) {
    try {
      const pipeline = [
        {
          $match: {
            createdAt: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $group: {
            _id: {
              source: '$source',
              status: '$status'
            },
            count: { $sum: 1 },
            avgWaitingTime: { $avg: '$metadata.waitingTime' }
          }
        }
      ];

      const results = await this.model.aggregate(pipeline);
      return results;
    } catch (error) {
      this.logger.error('Error getting token statistics:', error);
      throw error;
    }
  }
}

module.exports = TokenRepository;