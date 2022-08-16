import data from './Data';
import Player from './models/Player';
import TF2Server, { PlayerJoined, TF2Player } from './TF2Server';
import { CLASSES, TEAMS } from './types';
import User from './User';

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
  Demoman: CLASSES.demoman,
  Heavy: CLASSES.heavy,
  Engineer: CLASSES.engineer,
  Medic: CLASSES.medic,
  Sniper: CLASSES.sniper,
  Spy: CLASSES.spy,
  Spectator: CLASSES.spectator,
  Unassigned: CLASSES.unassigned,
}

export interface AdvancedPlayerJoined extends PlayerJoined {
  team: TEAMS;
  class: CLASSES;
}

export class TF2PlayerStats extends TF2Player {
  isLocked: boolean = false;
  team: TEAMS;
  class: CLASSES;
  constructor(public player: Player, public user: User, public server: TF2Server, info: AdvancedPlayerJoined) {
    super(player, user, server, info);
    this.team = info.team;
    this.class = info.class;
  }

  setSpec(isLocked: boolean) {
    if (isLocked) {
      this.server.send('sm_splock #' + this.slotId);
    } else {
      this.server.send('sm_spunlock #' + this.slotId);
    }
    this.isLocked = isLocked;
  }

  update(playerInfo: AdvancedPlayerJoined) {
    let notify = false;
    const keys: (keyof TF2PlayerStats & keyof AdvancedPlayerJoined)[] = ['name', 'team', 'class'];
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

  toJSON() {
    return {
      userId: this.user.id,
      slotId: this.slotId,
      name: this.player.name,
      steamId: this.player.steamId,
      serverIp: this.server.model.ip,
      mute: this.isMute,
      isLocked: this.isLocked,
      team: this.team,
      class: this.class,
    };
  }
}

export default class AdvancedTF2Server extends TF2Server {
  players: { [userId: number]: TF2PlayerStats } = {};
  score: {
    [TEAMS.Blue]: number;
    [TEAMS.Red]: number;
  } = { [TEAMS.Blue]: 0, [TEAMS.Red]: 0 };
  time: string = '--:--';
  live: boolean;
  paused: boolean = false;


  async makeTF2Player(info: AdvancedPlayerJoined) {
    const { steamId, name, ip } = info;
    let player = await Player.findOne({ where: { steamId } });
    if (!player) {
      player = await Player.create({ steamId, name });
    }
    const user = data().upsertUser(ip);
    const tf2Player: TF2Player = new TF2PlayerStats(player, user, this, info);
    user.setTf2(tf2Player);

    return tf2Player;
  }

  listen() {
    if (this.model.advancedStats) {
      this.connection.on('response', async (status: string) => {
        if (status[0] !== '{') {
          return;
        }
        await this.parseJSON(status);
        this.emit('update');
      });
      this.interval = setInterval(() => {
        this.connection.send('sm_gamejson');
      }, 1000);
    } else {

    }
  }

  async parseJSON(output: string) {
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
    const newPlayers: { [userId: number]: AdvancedPlayerJoined } = {};
    for (const entry of players) {
      const info = JSON.parse(entry);
      const parsedInfo: AdvancedPlayerJoined = {
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
      this.players[newPlayer.slotId] = newPlayer as TF2PlayerStats;
    }));
  }

  toJSON() {
    const server: any = {
      model: {
        id: this.model.id,
        name: this.model.name,
        ip: this.model.ip,
        password: this.model.password,
        advancedStats: this.model.advancedStats,
      },
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
}