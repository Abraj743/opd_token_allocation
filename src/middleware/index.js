const AuthMiddleware = require('./auth');
const { ValidationMiddleware, CommonSchemas } = require('./validation');
const LoggingMiddleware = require('./logging');
const ErrorHandlingMiddleware = require('./errorHandler');

module.exports = {
  AuthMiddleware,
  ValidationMiddleware,
  CommonSchemas,
  LoggingMiddleware,
  ErrorHandlingMiddleware
};