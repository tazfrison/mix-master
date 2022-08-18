import config from 'config';
import cors from 'cors';
import express, { Application } from 'express';
import http from 'http';
import path from 'path';
import socketio from 'socket.io';
import data, { sequelize } from './Data';
import RootRouter from './routes/Root';

import session from 'express-session';
import passport from 'passport';
import SteamStrategy from 'passport-steam';

import SequelizeStore from 'connect-session-sequelize';

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
    this.app.use('/', RootRouter);

    //UI Routing
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
      'update',
      'delete',
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
