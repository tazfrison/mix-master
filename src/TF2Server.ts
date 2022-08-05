import { EventEmitter } from 'events';
import { clearInterval, setInterval } from 'timers';
import data from './Data';
import Player from './models/Player';
import { CLASSES, Config, TEAMS } from './types';
import User from './User';

const Rcon: any = require('rcon');

const TEAM_MAP: { [name: string]: TEAMS } = {
  'RED': TEAMS.Red,
  'BLU': TEAMS.Blue,
  'Spectator': TEAMS.Spectator,
  'Unassigned': TEAMS.Unassigned,
}

const CLASS_MAP: { [name: string]: CLASSES } = {
  Scout: CLASSES.scout,
  Soldier: CLASSES.soldier,
  Pyro: CLASSES.pyro,
  Demo: CLASSES.demoman,
  Heavy: CLASSES.heavy,
  Engineer: CLASSES.engineer,
  Medic: CLASSES.medic,
  Sniper: CLASSES.sniper,
  Spy: CLASSES.spy,
  Spectator: CLASSES.spectator,
  Unassigned: CLASSES.unassigned,
}

export interface PlayerJoined {
  slotId: number;
  name: string;
  ip: string;
  steamId: string;
  team: TEAMS;
  class: CLASSES;
}

export class TF2Player extends EventEmitter{
  isMute: boolean = false;
  isLocked: boolean = false;
  slotId: number;
  name: string;
  team: TEAMS;
  class: CLASSES;
  constructor(public player: Player, public user: User, public server: TF2Server, info: PlayerJoined) {
    super();
    this.slotId = info.slotId;
    this.name = info.name;
    this.team = info.team;
    this.class = info.class;
  }

  get steamId() {
    return this.player.steamId;
  }

  setMute(isMute: boolean) {
    if (isMute) {
      this.server.send('sm_silence #' + this.slotId);
    } else {
      this.server.send('sm_unsilence #' + this.slotId);
    }
    this.isMute = isMute;
  }

  kick(message?: string) {
    this.server.send('sm_kick #' + this.slotId + ' ' + message);
  }

  ban(message?: string) {
    this.server.send('sm_ban #' + this.slotId + ' ' + message);
  }

  setSpec(isLocked: boolean) {
    if (isLocked) {
      this.server.send('sm_splock #' + this.slotId);
    } else {
      this.server.send('sm_spunlock #' + this.slotId);
    }
    this.isLocked = isLocked;
  }

  update(playerInfo: PlayerJoined) {
    let notify = false;
    const keys: (keyof TF2Player & keyof PlayerJoined)[] = ['name', 'team', 'class'];
    keys.forEach(key => {
      if (key === 'steamId' || key === 'slotId') {
        return;
      }
      if (this[key] !== playerInfo[key]) {
        notify = true;
        (this as any)[key] = playerInfo[key];
      }
    });
    if (notify) {
      this.emit('update');
    }
  }

  disconnect() {
    this.emit('disconnect');
  }

  toJSON() {
    return {
      userId: this.user.id,
      slotId: this.slotId,
      name: this.player.name,
      steamId: this.player.steamId,
      serverIp: this.server.config.ip,
      mute: this.isMute,
      isLocked: this.isLocked,
      team: this.team,
      class: this.class,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}

export default class TF2Server extends EventEmitter {
  config: Config.TF2Server;
  ready: boolean = false;
  connection: any;
  interval: NodeJS.Timer;
  players: { [userId: number]: TF2Player } = {};
  map: string;
  score: {
    [TEAMS.Blue]: number;
    [TEAMS.Red]: number;
  } = { [TEAMS.Blue]: 0, [TEAMS.Red]: 0 };
  time: string = '--:--';
  live: boolean;
  paused: boolean = false;

  constructor(config: Config.TF2Server) {
    super();
    this.config = config;

    this.connection = new Rcon(config.ip, config.port || 27015, config.rcon);
    this.setupListeners();
    this.connection.connect();
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
      console.log(this.config.ip + ' Error: ' + err);
    }).on('end', () => {
      console.log(this.config.ip + ' lost connection');
      clearInterval(this.interval);
      this.emit('disconnect');
      this.connection.connect();
    });
  }

  send(message: string) {
    if (this.connection && this.ready) {
      this.connection.send(message);
    }
  }

  async makeTF2Player(info: PlayerJoined) {
    const { steamId, name, ip } = info;
    let player = await Player.findOne({ where: { steamId } });
    if (!player) {
      player = await Player.create({ steamId, name });
    }
    const user = data().upsertUser(ip);
    const tf2Player = new TF2Player(player, user, this, info);
    user.setTf2(tf2Player);

    return tf2Player;
  }

  changeLevel(mapName: string) {
    this.connection.send('changelevel ' + mapName);
  }

  listen() {
    this.connection.on('response', async (status: string) => {
      if (status[0] !== '{') {
        return;
      }
      await this.parseStats(status);
      this.emit('update');
    });
    this.interval = setInterval(() => {
      this.connection.send('sm_gamejson');
    }, 1000);
  }

  async parseStats(output: string) {
    const players = output.split('\n');
    const stats = JSON.parse(players.shift());
    this.score = {
      [TEAMS.Blue]: stats.BLU,
      [TEAMS.Red]: stats.RED,
    };
    this.live = stats.live == 1;
    this.paused = this.time === stats.time;
    this.time = stats.time;
    this.map = stats.map;

    //Get current player info
    const newPlayers: { [userId: number]: PlayerJoined } = {};
    for (const entry of players) {
      const info = JSON.parse(entry);
      const parsedInfo: PlayerJoined = {
        name: info[0],
        team: TEAM_MAP[info[1]],
        class: CLASS_MAP[info[2]],
        steamId: info[3],
        ip: info[4],
        slotId: info[5],
      }
      newPlayers[parsedInfo.slotId] = parsedInfo;
    }

    Object.keys(this.players).map(a => parseInt(a)).forEach((userId) => {//Iterate players from last check
      const player = this.players[userId];
      if (newPlayers[userId] && newPlayers[userId].steamId === player.steamId) {//Player still connected
        player.update(newPlayers[userId]);//Check for changes
        delete newPlayers[userId];
        return;
      }
      //Player has disconnected
      player.disconnect();
      delete this.players[userId];
    });

    //Create new players
    await Promise.all(Object.values(newPlayers).map(async info => {
      const newPlayer = await this.makeTF2Player(info);
      this.players[newPlayer.slotId] = newPlayer;
    }));
  }

  toJSON() {
    const server: any = {
      name: this.config.name,
      ip: this.config.ip,
      password: this.config.password,
      score: this.score,
      time: this.time,
      live: this.live,
      map: this.map,
      paused: this.live && this.paused,
      players: {},
    };

    Object.values(this.players).forEach(player => {
      server.players[player.user.id] = player.toJSON();
    });

    return server;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}