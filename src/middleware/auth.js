const logger = require('../config/logger');


class AuthMiddleware {
  static authenticate(req, res, next) {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        req.user = { id: 'dev-user', role: 'admin' };
        return next();
      }
      
      if (!apiKey) {
        logger.warn('Authentication failed: Missing API key', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_API_KEY',
            message: 'API key is required for authentication',
            details: {
              header: 'X-API-Key',
              queryParam: 'api_key'
            }
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
      
     
      const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');
      
      if (!validApiKeys.includes(apiKey)) {
        logger.warn('Authentication failed: Invalid API key', {
          apiKey: apiKey.substring(0, 8) + '...',
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key provided'
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
      
    
      req.user = {
        id: 'api-user',
        role: 'admin',
        apiKey: apiKey
      };
      
      logger.info('Authentication successful', {
        userId: req.user.id,
        path: req.path,
        method: req.method
      });
      
      next();
    } catch (error) {
      logger.error('Authentication middleware error', {
        error: error.message,
        stack: error.stack,
        path: req.path
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_MIDDLEWARE_ERROR',
          message: 'Internal authentication error'
        },
        timestamp: new Date().toISOString(),
        requestId: req.id
      });
    }
  }
  
  
  static authorize(requiredRole) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'NOT_AUTHENTICATED',
              message: 'Authentication required'
            },
            timestamp: new Date().toISOString(),
            requestId: req.id
          });
        }
        

        const roleHierarchy = {
          admin: 3,
          staff: 2,
          user: 1
        };
        
        const userRoleLevel = roleHierarchy[req.user.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
        
        if (userRoleLevel < requiredRoleLevel) {
          logger.warn('Authorization failed: Insufficient permissions', {
            userId: req.user.id,
            userRole: req.user.role,
            requiredRole,
            path: req.path
          });
          
          return res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: `Role '${requiredRole}' required, but user has role '${req.user.role}'`
            },
            timestamp: new Date().toISOString(),
            requestId: req.id
          });
        }
        
        next();
      } catch (error) {
        logger.error('Authorization middleware error', {
          error: error.message,
          stack: error.stack,
          path: req.path
        });
        
        res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_MIDDLEWARE_ERROR',
            message: 'Internal authorization error'
          },
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
    };
  }
}

module.exports = AuthMiddleware;