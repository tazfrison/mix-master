import config from 'config';
import cors from 'cors';
import express, { Application, RequestHandler } from 'express';
import http from 'http';
import path from 'path';
import socketio from 'socket.io';
import data, { sequelize } from './Data';

import session from 'express-session';
import passport from 'passport';
import SteamStrategy from 'passport-steam';

import SequelizeStore from 'connect-session-sequelize';
import { fetch } from './Stats';

const store = new (SequelizeStore(session.Store))({
  db: sequelize,
});
store.sync();

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
const API_KEY: string = config.get('steam.apiKey');
const SECRET: string = config.get('express.secret');

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj as any);
});

passport.use(new (SteamStrategy as any)({
  returnURL: baseUrl + '/auth/steam/return',
  realm: baseUrl,
  apiKey: API_KEY,
},
  async function (_identifier: any, profile: any, done: any) {
    done(null, await data().saveProfile(profile.id, profile._json));
  }
));

export default class WebServer {
  app: Application;
  server: http.Server;
  io: socketio.Server;
  sockets: socketio.Socket[] = [];
  users: { [id: number]: Express.User } = {};
  constructor() {
    this.app = express();
    this.app.set('port', port);
    this.app.use(cors({
      origin: [baseUrl, frontend],
    }));
    this.app.use(express.static(path.join(__dirname, '../', 'public')));
    this.app.use(express.json());
    this.app.use(session({
      secret: SECRET,
      resave: false,
      saveUninitialized: true,
      store: store,
      proxy: true,
    }));
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    this.server = http.createServer(this.app);
    this.io = new socketio.Server(this.server, {
      cors: {
        origin: [baseUrl, frontend],
      }
    });

    this.setListeners();
  }

  setListeners() {
    //Auth Routes
    this.app.get('/auth/logout', (req, res, next) => {
      console.log('logout');
      req.session.destroy((err) => {
        if (err) {
          console.log(err);
          return next(err);
        }
        res.redirect(frontend);
      });
    })
    this.app.get('/auth/steam',
      passport.authenticate('steam'),
      function (req, res) {
        // The request will be redirected to Steam for authentication, so
        // this function will not be called.
      });

    this.app.get('/auth/steam/return',
      passport.authenticate('steam', { failureRedirect: '/failure' }),
      function (req, res) {
        // Successful authentication, redirect home.
        res.redirect(frontend);
      });

    //API Routes
    this.app.get('/api/state', async (req, res) => {
      const state = await data().getState();
      if (req.isAuthenticated()) {
        state.profile = req.user;
      }
      res.json(state);
    });

    this.app.get('/api/stats', async (req, res) => {
      res.json(await fetch());
    });

    const isAdmin: RequestHandler = (req, res, next) => {
      if (!req.isAuthenticated() || !req.user.admin) {
        res.status(403);
        return next('No permissions');
      }
      next();
    };

    this.app.post('/api/fakes',// isAdmin,
      async (req, res) => {
        await data().fakes(req.body[0], req.body[1]);
        res.json(data().getState());
      });

    this.app.get('/api/players/:id', async (req, res) => {
      res.json(await data().fetchPlayer(req.params.id));
    });

    this.app.post('/api/logs/purge',// isAdmin,
      async (req, res) => {
        res.json(await data().purgeLogs(req.query.full === '1'));
      });

    this.app.post('/api/logs/refresh',// isAdmin,
      async (req, res) => {
        res.json(await data().refreshLogs());
      });

    this.app.get('/api/logs/:id', async (req, res) => {
      res.json(await data().fetchLog(parseInt(req.params.id)));
    });

    this.app.post('/api/logs/:id', isAdmin,
      async (req, res) => {
        res.json(await data().importLog(parseInt(req.params.id)));
      });

    this.app.get('/api/logs/', async (req, res) => {
      res.json(await data().fetchLogs());
    });

    this.app.post('/api/draft/:action', isAdmin,
      (req, res, next) => {
        const action = req.params.action;
        const draft = data().draft as any;
        if (typeof draft[action] === 'function') {
          return res.send(draft[action](...req.body));
        }
        return next('Not an action');
      });

    this.app.post('/api/:domain/:id/:namespace/:action?', isAdmin,
      (req, res, next) => {
        const domain = req.params.domain;
        const id = req.params.id;
        const action = req.params.action || req.params.namespace;
        const namespace = req.params.action ? req.params.namespace : '';

        let target: any;
        switch (domain) {
          case 'user':
            target = data().fetchUser(parseInt(id));
            break;
          case 'server':
            target = data().fetchServer(id);
            break;
          default:
            return next('Invalid domain');
        }
        if (namespace !== '') {
          if (target[namespace] && typeof target[namespace][action] === 'function') {
            return res.send(target[namespace][action](...req.body));
          }
        } else if (typeof target[action] === 'function') {
          return res.send(target[action](...req.body));
        }
        return next('Not an action');
      });

    //UI/Routing
    this.app.get('/*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../', 'public', 'index.html'));
    });

    // Socket events

    this.io.on('connection', socket => {
      this.sockets.push(socket);
      socket.on('disconnect', () => {
        socket.removeAllListeners();
        this.sockets.splice(this.sockets.indexOf(socket), 1);
      });
    });

    [
      'users/update', 'users/delete',
      'servers/update', 'servers/delete',
      'draft/update',
      'logs/update',
    ].forEach(event => {
      data().on(event, data => {
        this.sockets.forEach(socket => {
          socket.emit(event, data);
        });
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        console.log('Listening');
        resolve();
      });
    });
  }
}
