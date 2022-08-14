import { Router } from 'express';
import data from '../Data';
import Log from '../models/Log';
import { isAdmin } from './helpers';

const router = Router();

router.post('/refresh',// isAdmin,
  async (_req, res) => {
    res.json(await data().refreshLogs());
  });

router.get('/:id', async (req, res) => {
  res.json(await Log.scope('full').findByPk(parseInt(req.params.id)));
});

router.post('/:id', isAdmin,
  async (req, res) => {
    res.json(await data().importLog(parseInt(req.params.id)));
  });

router.get('/', async (_req, res) => {
  res.json(await Log.findAll());
});

export default router;