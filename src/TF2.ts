import { EventEmitter } from 'events';
import { clearInterval, setInterval } from 'timers';
import data from './Data';

const Rcon: any = require('rcon');

export interface PlayerJoined {
  userId: number;
  name: string;
  ip: string;
  steamId: string;
  team: string;
  class: string;
  id: number;
}

export default class TF2 extends EventEmitter {
  name: string;
  ready: boolean = false;
  connection: any;
  ip: string;
  interval: NodeJS.Timer;
  players: {[userId: number]: PlayerJoined} = {};
  map: string;
  score: {
    blu: number;
    red: number;
  } = { blu: 0, red: 0 };
  time: string = '--:--';
  live: boolean;
  paused: boolean = false;

  constructor(name: string, password: string, ip: string, port: number = 27015) {
    super();
    this.name = name;
    this.ip = ip;
    this.connection = new Rcon(ip, port, password);
    this.setupListeners();
    this.connection.connect();

    ['mute', 'changeLevel', 'kick', 'ban'].forEach(func => {
      const self: any = this;
      self[func] = self[func].bind(this);
    });
  }

  setupListeners() {
    this.connection.on('auth', () => {
      this.ready = true;
      data().addServer(this);
      this.listen();
    }).on('error', (err: string) => {
      if (!this.ready) {
        setTimeout(() => {
          this.connection.connect();
        }, 60 * 1000);
        return;
      }
      console.log(this.ip + ' Error: ' + err);
    }).on('end', () => {
      console.log(this.ip + ' lost connection');
      clearInterval(this.interval);
    });
  }

  mute(userId: number, isMute: boolean) {
    if (isMute) {
      this.connection.send('sm_silence #' + userId);
    } else {
      this.connection.send('sm_unsilence #' + userId);
    }
  }

  kick(userId: number, message: string) {
    this.connection.send('sm_kick #' + userId + ' ' + message);
  }

  ban(userId: number, message: string) {
    this.connection.send('sm_ban #' + userId + ' ' + message);
  }

  setSpec(userId: number, isLocked: boolean) {
    if (isLocked) {
      this.connection.send('sm_splock #' + userId);
    } else {
      this.connection.send('sm_spunlock #' + userId);
    }
  }

  changeLevel(mapName: string) {
    this.connection.send('changelevel ' + mapName);
  }

  listen() {
    this.connection.on('response', (status: string) => {
      if (status[0] !== '{') {
        return;
      }
      this.parseStats(status);
      this.emit('update');
    });
    this.interval = setInterval(() => {
      this.connection.send('sm_gamejson');
    }, 1000);
  }

  parseStats(output: string) {
    const players = output.split('\n');
    const stats = JSON.parse(players.shift());
    this.score = {
      blu: stats.BLU,
      red: stats.RED,
    };
    this.live = stats.live == 1;
    this.paused = this.time === stats.time;
    this.time = stats.time;
    this.map = stats.map;
    const newPlayers: {[userId: number]: any} = {};
    players.map(a => JSON.parse(a)).forEach(player => {
      newPlayers[player[5]] = {
        name: player[0],
        team: player[1],
        class: player[2],
        steamId: player[3],
        ip: player[4],
        userId: player[5],
      };
    });

    Object.keys(this.players).map(a => parseInt(a)).forEach((userId) => {
      if (newPlayers[userId]) {
        if (newPlayers[userId].steamId === this.players[userId].steamId) {// User was connected last check, no change
          newPlayers[userId].id = this.players[userId].id;
          return;
        }
      }
      const user = data().fetchUserByIP(this.players[userId].ip); // User has disconnected
      user.setTf2();
      delete this.players[userId];
    });
    Object.keys(newPlayers).map(a => parseInt(a)).forEach(userId => {
      const user = data().upsertUser(newPlayers[userId].ip);
      user.setTf2(newPlayers[userId], this);
      newPlayers[userId].id = user.id;
    });
    this.players = newPlayers;
  }

  toJSON() {
    const server: any = {
      name: this.name,
      ip: this.ip,
      score: this.score,
      time: this.time,
      live: this.live,
      map: this.map,
      paused: this.live && this.paused,
      players: {},
    };

    Object.values(this.players).forEach(player => {
      server.players[player.id] = {
        team: player.team,
        class: player.class,
      }
    });

    return server;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}