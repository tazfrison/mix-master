import { Router } from 'express';
import { InferAttributes } from 'sequelize/types';
import data from '../Data';
import Server from '../models/Server';
import { isAdmin } from './helpers';

const router = Router();

router.post('/', async (req, res) => {
  const body: InferAttributes<Server> = req.body;
  const server = await Server.create(body);
  res.json(server);
});

router.use('/:id', async (req, res, next) => {
  if (!req.params.id) {
    next('Missing Id');
  }
  res.locals.server = data().fetchServer(req.params.id);
  next();
});

router.get('/:id', (_req, res) => {
  res.json(res.locals.server);
});

router.patch('/:id', async (req, res) => {
  const body: InferAttributes<Server> = req.body;
  const server: Server = res.locals.server;
  await server.update(body);

  res.json(server);
});

router.post('/:id/:action', isAdmin,
  (req, res, next) => {
    const server: any = res.locals.server;
    const action = req.params.action;
    if (!server || !server[action] || typeof server[action] !== 'function') {
      return next('Not an action');
    }
    res.json(server[action](...req.body));
  });

export default router;