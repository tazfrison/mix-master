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

router.use('/:id', isAdmin
  , async (req, res, next) => {
    if (!req.params.id) {
      next('Missing Id');
    }
    const server = await Server.scope('admin').findByPk(parseInt(req.params.id));
    if (!server) {
      next('Invalid server');
    }
    res.locals.server = server;
    next();
  });

router.patch('/:id', async (req, res) => {
  const body: InferAttributes<Server> = req.body;
  const server: Server = res.locals.server;
  await server.update(body);

  res.json(server);
});

router.delete('/:id',
  (_req, res) => {
    const server: Server = res.locals.server;
    const liveServer = data().fetchServer(server.id);
    if (liveServer) {
      liveServer.disconnect();
    }
    server.destroy();
    res.sendStatus(200);
  });

router.get('/:id/connect',
  (_req, res) => {
    const server: Server = res.locals.server;
    const liveServer = data().fetchServer(server.id);
    if (!liveServer) {
      data().addServer(server);
    }
    res.sendStatus(200);
  });

router.get('/:id/disconnect',
  (_req, res) => {
    const server: Server = res.locals.server;
    const liveServer = data().fetchServer(server.id);
    if (liveServer) {
      liveServer.disconnect();
    }
    res.sendStatus(200);
  });

router.post('/:id/:action',
  (req, res, next) => {
    const server: any = res.locals.server;
    const action = req.params.action;
    if (!server || !server[action] || typeof server[action] !== 'function') {
      return next('Not an action');
    }
    res.json(server[action](...req.body));
  });

export default router;