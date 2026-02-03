const Joi = require('joi');
const logger = require('../config/logger');


class ValidationMiddleware {
  
  static validateBody(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });
        
        if (error) {
          const validationErrors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));
          
          logger.warn('Request body validation failed', {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            requestId: req.id
          });
          
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request body validation failed',
              details: {
                errors: validationErrors
              }
            },
            timestamp: new Date().toISOString(),
            requestId: req.id
          });
        }
        
        req.body = value;
        next();
      } catch (error) {
        logger.error('Body validation middleware error', {
          error: error.message,
          stack: error.stack,
          path: req.path
        });
        
        res.status(500).json({
          success: false,
          error: {
            code: 'VALIDATION_MIDDLEWARE_ERROR',
            message: 'Internal validation error'
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
    };
  }
  
  
  static validateQuery(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });
        
        if (error) {
          const validationErrors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));
          
          logger.warn('Query parameters validation failed', {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            requestId: req.id
          });
          
          return res.status(400).json({
            success: false,
            error: {
              code: 'QUERY_VALIDATION_ERROR',
              message: 'Query parameters validation failed',
              details: {
                errors: validationErrors
              }
            },
            timestamp: new Date().toISOString(),
            requestId: req.id
          });
        }
        
        req.query = value;
        next();
      } catch (error) {
        logger.error('Query validation middleware error', {
          error: error.message,
          stack: error.stack,
          path: req.path
        });
        
        res.status(500).json({
          success: false,
          error: {
            code: 'VALIDATION_MIDDLEWARE_ERROR',
            message: 'Internal validation error'
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
    };
  }
  
  
  static validateParams(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });
        
        if (error) {
          const validationErrors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));
          
          logger.warn('Path parameters validation failed', {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            requestId: req.id
          });
          
          return res.status(400).json({
            success: false,
            error: {
              code: 'PARAMS_VALIDATION_ERROR',
              message: 'Path parameters validation failed',
              details: {
                errors: validationErrors
              }
            },
            timestamp: new Date().toISOString(),
            requestId: req.id
          });
        }
        
        req.params = value;
        next();
      } catch (error) {
        logger.error('Params validation middleware error', {
          error: error.message,
          stack: error.stack,
          path: req.path
        });
        
        res.status(500).json({
          success: false,
          error: {
            code: 'VALIDATION_MIDDLEWARE_ERROR',
            message: 'Internal validation error'
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
    };
  }
}


const CommonSchemas = {

  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format'),
  
  
  uuid: Joi.string().uuid(),
  
  
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('asc'),
    sortBy: Joi.string().default('createdAt')
  }),
  
  
  dateRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate'))
  }),
  
  
  idParam: Joi.object({
    id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
  })
};

module.exports = {
  ValidationMiddleware,
  CommonSchemas
};