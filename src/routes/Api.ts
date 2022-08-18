import { Router } from 'express';
import data from '../Data';
import Server from '../models/Server';

import AggregatedClassStats from '../models/AggregatedClassStats';
import { isAdmin } from './helpers';
import LogsRouter from './Logs';
import ServerRouter from './Server';
import Player from '../models/Player';

const router = Router();

router.get('/state', async (req, res) => {
  const state = await data().getState();
  if (req.isAuthenticated()) {
    state.profile = req.user;
  }
  res.json(state);
});

router.get('/players/:id', async (req, res) => {
  res.json(await Player.scope('withStats').findOne({where: {
    steamId: req.params.id,
  }}));
});

router.get('/players', async (req, res) => {
  const steamIds = req.query.steamIds as string[];
  res.json(await Player.scope('withStats').findAll({where: {
    steamId: steamIds,
  }}));
});

router.get('/stats', async (_req, res) => {
  res.json(await AggregatedClassStats.scope('globals').findAll());
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

router.get('/servers', isAdmin,
  async (_req, res) => {
    res.json(await Server.scope('admin').findAll());
  });

router.use('/server', ServerRouter);
router.use('/logs', LogsRouter);

export default router;