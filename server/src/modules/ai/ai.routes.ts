import { Router } from 'express';
import { authGuard } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { aiLimiter, aiAutocompleteLimiter } from '../../middleware/rateLimit.middleware';
import {
  status,
  command,
  completeText,
  commandSchema,
  completeSchema,
} from './ai.controller';

export const aiRouter = Router();

// All AI endpoints require a logged-in user.
aiRouter.use(authGuard);

aiRouter.get('/status', status);
aiRouter.post('/command', aiLimiter, validate(commandSchema), command);
aiRouter.post('/complete', aiAutocompleteLimiter, validate(completeSchema), completeText);
