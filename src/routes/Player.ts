import { Router } from 'express';
import Player from '../models/Player';
import { isAdmin } from './helpers';

const router = Router();

router.patch('/:id', isAdmin,
  async (req, res, next) => {
    if (!req.params.id) {
      next('Missing Id');
    }
    const player = await Player.findByPk(req.params.id);
    if (!player) {
      return next('Invalid player');
    }
    await player.update(req.body);
    return res.json(player);
  });

router.get('/:id', async (req, res) => {
  res.json(await Player.scope('withStats').findOne({where: {
    steamId: req.params.id,
  }}));
});

router.get('/', async (req, res) => {
  const steamIds = req.query.steamIds as string[];
  res.json(await Player.scope('withStats').findAll({where: {
    steamId: steamIds,
  }}));
});

export default router;