import config from 'config';
import { Router } from 'express';
import passport from 'passport';

let baseUrl: string = config.get('express.url');
let port: number = config.get('express.port');
if (port) {
  baseUrl += ':' + port;
} else {
  port = 80;
}
let frontend: string = config.get('express.frontend');
if (!frontend) {
  frontend = baseUrl;
}

const router = Router();

router.get('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      return next(err);
    }
    res.redirect(frontend);
  });
});

router.get('/steam',
  passport.authenticate('steam'),
  function (req, res) {
    // The request will be redirected to Steam for authentication, so
    // this function will not be called.
  });

router.get('/steam/return',
  passport.authenticate('steam', { failureRedirect: '/failure' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect(frontend);
  });

export default router;