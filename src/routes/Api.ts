import { Router } from 'express';
import data from '../Data';
import AggregatedClassStats from '../models/AggregatedClassStats';
import Player from '../models/Player';
import { isAdmin } from './helpers';
import LogsRouter from './Logs';
import PlayerRouter from './Player';
import ServerRouter from './Server';
import UserRouter from './User';

const router = Router();

router.get('/mumble/channels', (req, res) => {
  const mumble = data().mumble;
  if (!mumble) {
    return res.json([]);
  }
  return res.json(mumble.getChannels())
});

router.get('/state', async (req, res) => {
  const state = await data().getState();
  if (req.isAuthenticated()) {
    const player = await Player.findByPk(req.user.id);
    state.profile = player;
  }
  res.json(state);
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

router.use('/players', PlayerRouter);
router.use('/users', UserRouter);
router.use('/servers', ServerRouter);
router.use('/logs', LogsRouter);

export default router;