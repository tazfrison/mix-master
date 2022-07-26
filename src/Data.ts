import config from 'config';
import EventEmitter from 'events';
import Draft from './Draft';
import { createFakeServer, createFakeUser, FakeServer, FakeUser } from './fakes';
import Mumble from './Mumble';
import TF2 from './TF2';
import User from './User';

import { Sequelize } from 'sequelize-typescript';
import { InferCreationAttributes } from 'sequelize/types';
import LogParser from './LogParser';
import IPCheck from './models/IPCheck';
import Log from './models/Log';
import LogClassStats from './models/LogClassStats';
import LogMedicStats from './models/LogMedicStats';
import LogPlayer from './models/LogPlayer';
import Player from './models/Player';
import Round from './models/Round';
import VoiceAccount from './models/VoiceAccount';

const adminList: string[] = config.get('roles.admin');

const models = [LogClassStats, LogMedicStats, LogPlayer, VoiceAccount, Player, Round, Log, IPCheck];

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/database.sqlite3',
  models,
  logging: false,
});

declare global {
  namespace Express {
    interface User {
      id: number;
      steamId: string;
      avatar: string;
      name: string;
      admin: boolean;
    }
  }
}

class Data extends EventEmitter {
  users: { [id: number]: User } = {};
  ipMap: { [ip: string]: number } = {};
  servers: { [ip: string]: TF2 } = {};
  draft: Draft;
  mumble?: Mumble;
  constructor() {
    super();

    this.draft = new Draft();
    this.draft.on('update', () => this.emit('updateDraft', this.draft));
  }

  async initModels() {
    for (const model of models) {
      await model.sync();
    }
  }

  async fetchLog(logId: number) {
    return Log.findByPk(logId, {
      include: [{
        model: Round,
      }, {
        model: LogPlayer,
        include: [Player, LogMedicStats, {
          model: LogClassStats,
          separate: true,
          order: [['playtime', 'DESC']],
        }],
      }],
    });
  }

  async fetchLogs() {
    return Log.findAll();
  }

  async fetchPlayer(steamId: string) {
    return Player.findOne({
      where: {
        steamId,
      },
      include: [{
        model: LogPlayer,
        include: [Log, {
          model: LogClassStats,
          separate: true,
          order: [['playtime', 'DESC']],
        }],
      }],
    });
  }

  async fetchPlayers() {
    return LogPlayer.findAll({
      include: [Player],
      group: ['PlayerId'],
      attributes: ['PlayerId', [Sequelize.fn('COUNT', 'PlayerId'), 'LogCount']]
    });
  }

  async purgeLogs(full?: boolean) {
    for (const model of models) {
      await model.drop();
    }
    await sequelize.sync({
      alter: true,
    });
  }

  async refreshLogs() {
    const logs = await Log.findAll();
    for (const log of logs) {
      console.log('Refreshing ' + log.id);
      await this.importLog(log.id);
    }
    return { logs: logs.length };
  }

  async importLog(logId: number) {
    const parser = new LogParser(logId);
    await parser.import();
    const log = await this.fetchLog(logId);
    this.emit('updateLog', log);
    return log;
  }

  async saveProfile(steamId: string, profile: any) {
    let player = await Player.findOne({ where: { steamId } });
    const attributes: InferCreationAttributes<Player> = {
      steamId,
      name: profile.personaname,
      admin: adminList.indexOf(steamId) !== -1,
      avatar: profile.avatar,
    };
    if (!player) {
      player = await Player.create(attributes);
    } else {
      player.setAttributes(attributes).save();
    }
    return player.toJSON();
  }

  fetchServer(ip: string) {
    return this.servers[ip];
  }

  addServer(server: TF2) {
    this.servers[server.ip] = server;
    server.on('update', () => this.emit('updateServer', server));
  }

  addMumble(mumble: Mumble) {
    this.mumble = mumble;
  }

  fetchUserByIP(ip: string) {
    return this.fetchUser(this.ipMap[ip]);
  }

  fetchUser(id: number) {
    return this.users[id];
  }

  upsertUser(ip: string) {
    let user = this.fetchUserByIP(ip);
    if (!user) {
      user = new User(ip);
      user.on('update', () => this.emit('updateUser', user));
      this.users[user.id] = user;
      this.ipMap[ip] = user.id;
    }
    return user;
  }

  async getState() {
    return {
      servers: Object.values(this.servers).sort((a, b) => a.ip.localeCompare(b.ip)),
      users: Object.values(this.users),
      draft: this.draft,
      logs: await this.fetchLogs(),
      players: await this.fetchPlayers(),
      maps: config.get('tf2.maps'),
    } as any;
  }

  fakes(users: number, servers: number) {
    for (let [id, user] of Object.entries(this.users)) {
      if (user instanceof FakeUser) {
        user.removeAllListeners();
        delete this.users[parseInt(id)];
      }
    }
    for (let [ip, server] of Object.entries(this.servers)) {
      if (server instanceof FakeServer) {
        server.removeAllListeners();
        delete this.servers[ip];
      }
    }
    for (let i = 0; i < users; ++i) {
      createFakeUser();
    }

    for (let i = 1; i <= servers; ++i) {
      createFakeServer(i);
    }
  }
}

const instance = new Data();

export default function data() {
  return instance;
}
