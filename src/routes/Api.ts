import { Router } from 'express';
import data from '../Data';
import Server from '../models/Server';
import { fetch } from '../Stats';

import ServerRouter from './Server';
import LogsRouter from './Logs';
import { isAdmin } from './helpers';

const router = Router();

router.get('/state', async (req, res) => {
  const state = await data().getState();
  if (req.isAuthenticated()) {
    state.profile = req.user;
  }
  res.json(state);
});

router.get('/stats', async (_req, res) => {
  res.json(await fetch());
});

router.post('/fakes',// isAdmin,
  async (req, res) => {
    await data().fakes(req.body[0], req.body[1]);
    res.json(data().getState());
  });

router.post('/draft/:action', isAdmin,
  (req, res, next) => {
    const action = req.params.action;
    const draft = data().draft as any;
    if (typeof draft[action] === 'function') {
      return res.send(draft[action](...req.body));
    }
    return next('Not an action');
  });

router.get('/servers', (_req, res) => {
  res.json(Server.findAll());
});

router.use('/server', ServerRouter);
router.use('/logs', LogsRouter);

export default router;