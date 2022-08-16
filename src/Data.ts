import config from 'config';
import EventEmitter from 'events';
import Draft from './Draft';
import { createFakeUser, FakeUser } from './fakes';
import Mumble from './Mumble';
import TF2Server from './TF2Server';
import User from './User';

import { Sequelize } from 'sequelize-typescript';
import { InferCreationAttributes } from 'sequelize/types';
import { SequelizeStorage, Umzug } from 'umzug';
import LogParser from './LogParser';
import AggregatedClassStats from './models/AggregatedClassStats';
import IPCheck from './models/IPCheck';
import Log from './models/Log';
import LogClassStats from './models/LogClassStats';
import LogMedicStats from './models/LogMedicStats';
import LogPlayer from './models/LogPlayer';
import Player from './models/Player';
import Round from './models/Round';
import Server from './models/Server';
import VoiceAccount from './models/VoiceAccount';
import { updateStats } from './Stats';
import AdvancedTF2Server from './AdvancedTF2Server';

const adminList: string[] = config.get('roles.admin');

const models = [AggregatedClassStats, LogClassStats, LogMedicStats, LogPlayer, VoiceAccount, Player, Round, Log, IPCheck, Server];

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/database.sqlite3',
  models,
  logging: false,
  retry: {
    max: 10
  },
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
  servers: { [id: number]: TF2Server } = {};
  draft: Draft;
  mumble?: Mumble;
  constructor() {
    super();

    this.draft = new Draft();
    this.draft.on('update', () => this.emit('draft/update', this.draft));
  }

  async initModels() {
    const umzug = new Umzug({
      migrations: { glob: 'build/migrations/*.js' },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: console,
    });
    const pending = await umzug.pending();
    if (pending.length > 0) {
      await umzug.up();
      await this.refreshLogs();
    }
    for (const model of models) {
      await model.sync();
    }
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

  async refreshLogs() {
    const logs = await Log.findAll();
    for (const log of logs) {
      console.log('Refreshing ' + log.id);
      await this.importLog(log.id);
    }
    await updateStats();
    return { logs: logs.length };
  }

  async importLog(logId: number) {
    const parser = new LogParser(logId);
    await parser.import();
    const log = await Log.scope('full').findByPk(logId);
    const playerIds = log.players.map(player => player.id);
    await(updateStats(playerIds));
    this.emit('logs/update', log);
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

  fetchServer(id: number) {
    return this.servers[id];
  }

  addServer(model: Server) {
    let server: TF2Server;
    if (model.advancedStats) {
      server = new AdvancedTF2Server(model);
    } else {
      server = new TF2Server(model);
    }

    server.once('ready', () => {
      this.servers[server.model.id] = server;
      server.on('update', () => this.emit('servers/update', server));
      server.on('disconnect', () => {
        delete this.servers[server.model.id];
        server.removeAllListeners();
        this.emit('servers/delete', server);
      });
    });
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
      user.on('update', () => this.emit('users/update', user));
      user.on('disconnect', () => {
        this.emit('users/delete', user);
        user.removeAllListeners();
        delete this.users[user.id];
        delete this.ipMap[user.ip];
      });
      this.users[user.id] = user;
      this.ipMap[ip] = user.id;
    }
    return user;
  }

  async getState() {
    return {
      servers: Object.values(this.servers).sort((a, b) => a.model.name.localeCompare(b.model.name)),
      users: Object.values(this.users),
      draft: this.draft,
      logs: await Log.findAll(),
      players: await this.fetchPlayers(),
      maps: config.get('tf2.maps'),
    } as any;
  }

  async fakes(users: number, _servers: number) {
    for (let [id, user] of Object.entries(this.users)) {
      if (user instanceof FakeUser) {
        user.removeAllListeners();
        delete this.users[parseInt(id)];
      }
    }
    const players = await Player.findAll();
    for (let i = 0; i < users; ++i) {
      createFakeUser(players);
    }
  }
}

const instance = new Data();

export default function data() {
  return instance;
}
