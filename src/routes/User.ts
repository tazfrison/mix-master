import { Router } from 'express';
import data from '../Data';
import { isAdmin } from './helpers';

const router = Router();

router.use('/:id', async (req, res, next) => {
  if (!req.params.id) {
    next('Missing Id');
  }
  res.locals.user = data().fetchUser(parseInt(req.params.id));
  if (!res.locals.user) {
    return next('Invalid user');
  }
  next();
});

const runAction = (target: any, action: string, body: any) => {
  if (!target || !target[action] || typeof target[action] !== 'function') {
    throw new Error('Not an action');
  }
  return target[action](...body);
}

router.post('/:id/mumble/:action', isAdmin,
  (req, res, next) => {
    try {
      res.json(runAction(res.locals.user.mumble, req.params.action, req.body));
    } catch (e) {
      next(e.message);
    }
  });

router.post('/:id/tf2/:action', isAdmin,
  (req, res, next) => {
    try {
      res.json(runAction(res.locals.user.tf2, req.params.action, req.body));
    } catch (e) {
      next(e.message);
    }
  });

router.post('/:id/:action', isAdmin,
  (req, res, next) => {
    try {
      res.json(runAction(res.locals.user, req.params.action, req.body));
    } catch (e) {
      next(e.message);
    }
  });

export default router;