import { Router } from 'express';
import { InferAttributes } from 'sequelize/types';
import data from '../Data';
import MumbleChannel from '../models/MumbleChannel';
import { isAdmin } from './helpers';

const router = Router();

router.get('/', async (_req, res) => {
  const mumble = data().mumble;
  if (!mumble) {
    return res.json([]);
  }
  return res.json(await mumble.getChannels())
});

router.post('/:id', isAdmin, async (req, res) => {
  const mumble = await MumbleChannel.create({
    id: req.params.id,
    tags: req.body
  });
  res.json(mumble);
});

router.use('/:id', isAdmin, async (req, res, next) => {
  if (!req.params.id) {
    next('Missing Id');
  }
  const mumble = await MumbleChannel.findByPk(parseInt(req.params.id));
  if (!mumble) {
    next('Invalid mumble');
  }
  res.locals.mumble = mumble;
  next();
});

router.patch('/:id', async (req, res) => {
  const mumble: MumbleChannel = res.locals.mumble;
  await mumble.update({
    tags: req.body
  });

  res.json(mumble);
});

router.delete('/:id', (_req, res) => {
  const mumble: MumbleChannel = res.locals.mumble;
  mumble.destroy();
  res.sendStatus(200);
});

export default router;