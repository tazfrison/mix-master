import { EventEmitter } from 'events';
import { clearInterval, setInterval } from 'timers';
import data from './Data';
import Player from './models/Player';
import Server from './models/Server';
import User from './User';
import { ID } from '@node-steam/id';

const Rcon: any = require('rcon');

export interface PlayerJoined {
  slotId: number;
  name: string;
  ip: string;
  steamId: string;
}

export class TF2Player extends EventEmitter{
  isMute: boolean = false;
  ip: string;
  slotId: number;
  name: string;
  constructor(public player: Player, public server: TF2Server, info: PlayerJoined) {
    super();
    this.slotId = info.slotId;
    this.name = info.name;
    this.ip = info.ip;
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
    this.emit('update');
  }

  kick(message?: string) {
    this.server.send('sm_kick #' + this.slotId + ' ' + message);
  }

  ban(message?: string) {
    this.server.send('sm_ban #' + this.slotId + ' ' + message);
  }

  update(playerInfo: PlayerJoined) {
    if (this.name !== playerInfo.name) {
      this.name = playerInfo.name;
      this.emit('update');
    }
  }

  disconnect() {
    this.emit('disconnect');
  }

  toJSON() {
    return {
      slotId: this.slotId,
      name: this.player.name,
      steamId: this.player.steamId,
      server: {
        id: this.server.model.id,
        name: this.server.model.name,
      },
      mute: this.isMute,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}

export default class TF2Server extends EventEmitter {
  model: Server;
  ready: boolean = false;
  connection: any;
  interval: NodeJS.Timer;
  players: { [userId: number]: TF2Player } = {};
  map: string;

  constructor(server: Server) {
    super();
    this.model = server;

    this.connection = new Rcon(server.ip, server.port || 27015, server.rcon);
    this.setupListeners();
    this.connection.connect();

    ['changeLevel'].forEach(func => {
      const self: any = this;
      self[func] = self[func].bind(this);
    });
  }

  setupListeners() {
    this.connection.on('auth', () => {
      this.ready = true;
      console.log('Connected ' + this.model.name);
      this.listen();
      this.emit('ready');
    }).on('error', (err: string) => {
      if (!this.ready) {
        return;
      }
      console.log(this.model.ip + ' Error: ' + err);
    }).on('end', () => {
      console.log(this.model.ip + ' disconnected');
      this.ready = false;
      clearInterval(this.interval);
      this.emit('disconnect');
      //TODO: Reconnect logic
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
    let tf2Player = new TF2Player(player, this, info);
    await data().upsertUser(ip, undefined, tf2Player);

    return tf2Player;
  }

  changeLevel(mapName: string) {
    this.connection.send('changelevel ' + mapName);
  }

  disconnect() {
    for (const player of Object.values(this.players)) {
      player.disconnect();
    }
    this.connection.disconnect();
  }

  listen() {
    this.connection.on('response', async (status: string) => {
      if (!status.startsWith('hostname')) {
        return;
      }
      await this.parseJSON(status);
      this.emit('update');
    });
    this.interval = setInterval(() => {
      this.connection.send('status');
    }, 1000);
  }

  async parseJSON(output: string) {
    const lines = output.split('\n');
    const newPlayers: { [userId: number]: PlayerJoined } = {};

    //Get current player info and map
    for(const line of lines) {
      if (line.startsWith('map')) {
        this.map = line.match(/map\s*: (\w+)/)[1];
      } else if (line.startsWith('#') && !line.startsWith('# userid')) {
        const values = line.match(/^#\s+(\d+)[^"]+"(.+)"\s+(\[.*\]).*\s(\d+\.\d+\.\d+\.\d)/);
        if (values === null) {
          continue;
        }
        const parsedInfo: PlayerJoined = {
          name: values[2],
          steamId: new ID(values[3]).get64(),
          ip: values[4],
          slotId: parseInt(values[1]),
        };
        newPlayers[parsedInfo.slotId] = parsedInfo;
      }
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
      model: {
        id: this.model.id,
        name: this.model.name,
        ip: this.model.ip,
        password: this.model.password,
      },
      map: this.map,
      players: {},
    };

    Object.values(this.players).forEach(player => {
      const user = data().fetchUserByIP(player.ip);
      server.players[user.id] = player.toJSON();
    });

    return server;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}