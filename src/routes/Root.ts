import { RequestHandler, Router } from 'express';
import APIRouter from './Api';
import AuthRouter from './Auth';

const RootRouter = Router();

RootRouter.use('/api/', APIRouter);
RootRouter.use('/auth/', AuthRouter);

export default RootRouter;