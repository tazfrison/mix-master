import { RequestHandler } from 'express';

export const isAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user.admin) {
    res.status(403);
    return next('No permissions');
  }
  next();
};