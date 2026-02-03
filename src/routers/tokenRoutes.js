const express = require('express');
const { ValidationMiddleware, AuthMiddleware, LoggingMiddleware } = require('../middleware');
const TokenSchemas = require('../middleware/schemas/tokenSchemas');


function createTokenRoutes(container) {
  const router = express.Router();
  const tokenController = container.resolve('tokenController');

  // Create new token
  router.post('/',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateBody(TokenSchemas.createToken),
    LoggingMiddleware.auditLogger('CREATE', 'TOKEN'),
    tokenController.wrapAsync(tokenController.createToken.bind(tokenController))
  );

  // Get tokens based on criteria
  router.get('/',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(TokenSchemas.getTokens),
    tokenController.wrapAsync(tokenController.getTokens.bind(tokenController))
  );

  // Emergency token insertion
  router.post('/emergency',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateBody(TokenSchemas.emergencyInsertion),
    LoggingMiddleware.auditLogger('CREATE', 'EMERGENCY_TOKEN'),
    tokenController.wrapAsync(tokenController.handleEmergencyInsertion.bind(tokenController))
  );

  // Reallocate tokens based on criteria
  router.post('/reallocate',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(TokenSchemas.reallocateTokens),
    LoggingMiddleware.auditLogger('REALLOCATE', 'TOKENS'),
    tokenController.wrapAsync(tokenController.reallocateTokens.bind(tokenController))
  );

  // Get token statistics
  router.get('/statistics',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateQuery(TokenSchemas.getTokenStatistics),
    tokenController.wrapAsync(tokenController.getTokenStatistics.bind(tokenController))
  );

  // Get waiting list
  router.get('/waiting-list',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateQuery(TokenSchemas.getWaitingList),
    tokenController.wrapAsync(tokenController.getWaitingList.bind(tokenController))
  );

  // Batch update multiple tokens
  router.patch('/batch',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('admin'),
    ValidationMiddleware.validateBody(TokenSchemas.batchUpdateTokens),
    LoggingMiddleware.auditLogger('BATCH_UPDATE', 'TOKENS'),
    tokenController.wrapAsync(tokenController.batchUpdateTokens.bind(tokenController))
  );

  // Get tokens for a specific slot
  router.get('/slot/:slotId',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams({ slotId: require('../middleware/validation').CommonSchemas.objectId }),
    tokenController.wrapAsync(tokenController.getTokensBySlot.bind(tokenController))
  );

  // Get token by ID
  router.get('/:id',
    AuthMiddleware.authenticate,
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    tokenController.wrapAsync(tokenController.getTokenById.bind(tokenController))
  );

  // Update token information
  router.put('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    ValidationMiddleware.validateBody(TokenSchemas.updateToken),
    LoggingMiddleware.auditLogger('UPDATE', 'TOKEN'),
    tokenController.wrapAsync(tokenController.updateToken.bind(tokenController))
  );

  // Cancel a token
  router.delete('/:id',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    ValidationMiddleware.validateBody(TokenSchemas.cancelToken),
    LoggingMiddleware.auditLogger('CANCEL', 'TOKEN'),
    tokenController.wrapAsync(tokenController.cancelToken.bind(tokenController))
  );

  // Move token to different slot
  router.post('/:id/move/:slotId',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenSlotParams),
    LoggingMiddleware.auditLogger('MOVE', 'TOKEN'),
    tokenController.wrapAsync(tokenController.moveTokenToSlot.bind(tokenController))
  );

  // Confirm token (patient check-in)
  router.post('/:id/confirm',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    LoggingMiddleware.auditLogger('CONFIRM', 'TOKEN'),
    tokenController.wrapAsync(tokenController.confirmToken.bind(tokenController))
  );

  // Mark token as completed
  router.post('/:id/complete',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    LoggingMiddleware.auditLogger('COMPLETE', 'TOKEN'),
    tokenController.wrapAsync(tokenController.completeToken.bind(tokenController))
  );

  // Mark token as no-show
  router.post('/:id/no-show',
    AuthMiddleware.authenticate,
    AuthMiddleware.authorize('staff'),
    ValidationMiddleware.validateParams(TokenSchemas.tokenIdParam),
    ValidationMiddleware.validateBody(TokenSchemas.markNoShow),
    LoggingMiddleware.auditLogger('NO_SHOW', 'TOKEN'),
    tokenController.wrapAsync(tokenController.markNoShow.bind(tokenController))
  );

  return router;
}

module.exports = createTokenRoutes;