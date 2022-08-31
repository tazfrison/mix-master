import config from 'config';
import EventEmitter from 'events';
import Draft from './Draft';
import { createFakeUser, FakeUser } from './fakes';
import Mumble, { MumbleUser } from './Mumble';
import TF2Server, { TF2Player } from './TF2Server';
import User from './User';

import { Sequelize } from 'sequelize-typescript';
import { InferCreationAttributes, WhereAttributeHash, WhereOptions } from 'sequelize/types';
import { SequelizeStorage, Umzug } from 'umzug';
import AdvancedTF2Server from './AdvancedTF2Server';
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
import UserModel from './models/User';
import checkIp from './IPChecker';
import MumbleChannel from './models/MumbleChannel';

const adminList: string[] = config.get('roles.admin');

const models = [AggregatedClassStats, LogClassStats, LogMedicStats, LogPlayer, VoiceAccount, Player, Round, Log, IPCheck, Server, UserModel, MumbleChannel];

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/database.sqlite3',
  models,
  logging: false,
  retry: {
    max: 10
  },
});

class Data extends EventEmitter {
  users: { [id: number]: User } = {};
  ipMap: { [ip: string]: number } = {};
  servers: { [id: number]: TF2Server } = {};
  draft: Draft;
  mumble?: Mumble;
  constructor() {
    super();

    this.draft = new Draft();
    this.draft.on('update', () => this.emit('update', { type: 'draft', data: this.draft }));
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

  async refreshLogs() {
    const logs = await Log.findAll();
    for (const log of logs) {
      console.log('Refreshing ' + log.id);
      await this.importLog(log.id);
    }
    console.log('Refresh done');
    return { logs: logs.length };
  }

  async importLog(logId: number) {
    const parser = new LogParser(logId);
    await parser.import();
    const log = await Log.scope('full').findByPk(logId);
    this.emit('update', { type: 'log', data: log });
    return log;
  }

  async saveProfile(steamId: string, profile: any) {
    let player = await Player.findOne({ where: { steamId } });
    const attributes: InferCreationAttributes<Player> = {
      steamId,
      name: profile.personaname,
      admin: adminList.indexOf(steamId) !== -1,
      avatar: profile.avatar,
      coach: false,
    };
    if (!player) {
      player = await Player.create(attributes);
    } else {
      attributes.admin = player.admin;
      attributes.coach = player.coach;
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
      server.on('update', () => this.emit('update', { type: 'server', data: server }));
      server.on('disconnect', () => {
        delete this.servers[server.model.id];
        server.removeAllListeners();
        this.emit('delete', { type: 'server', data: server });
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

  async upsertUser(ip: string, mumble?: MumbleUser, tf2?: TF2Player) {
    const findUserModel = async (voice?: VoiceAccount, player?: Player) => {
      if (!voice && !player) {
        throw new Error('Nothing to create user from');
      }
      let where: WhereAttributeHash<UserModel> = {};
      if (voice) {
        where.voiceAccountId = voice.id;
      }
      if (player) {
        where.playerId = player.id;
      }
      const model = await UserModel.findOne({
        where,
        order: [['updatedAt', 'DESC']]
      });
      return model;
    };

    const createUserModel = async (ipCheck: IPCheck, voice?: VoiceAccount, player?: Player) => {
      if (!voice && !player) {
        throw new Error('Nothing to create user from');
      }
      const attrs: InferCreationAttributes<UserModel> = {
        name: voice?.name || player.name,
        ipCheckId: ipCheck.id,
      }
      if (voice) {
        attrs.voiceAccountId = voice.id;
      }
      if (player) {
        attrs.playerId = player.id;
      }
      const model = await UserModel.create(attrs);
      await model.reload();
      return model;
    };

    let user = this.fetchUserByIP(ip);
    if (!user) {
      const ipCheck = await checkIp(ip);
      let model = await findUserModel(mumble?.voice, tf2?.player);
      if (!model) {
        model = await createUserModel(ipCheck, mumble?.voice, tf2?.player);
      } else {
        await model.setAttributes({ ipCheckId: ipCheck.id }).save();
      }
      user = new User(model, ipCheck);
      this.users[model.id] = user;
      this.ipMap[ip] = model.id;
      user.on('change', async ({ voice, player }: { voice: VoiceAccount, player: Player}) => {
        //Check if model can be updated
        if (voice.id === user.model.voiceAccountId && player.id === user.model.playerId) {
          //Nothing to do
          await user.model.setAttributes({ ipCheckId: ipCheck.id }).save();
          return;
        } else if ((user.model.voiceAccountId && user.model.voiceAccountId !== voice.id) || (user.model.playerId && user.model.playerId !== player.id)) {
          //Incompatible
          this.emit('delete', { type: 'user', data: user });
          delete this.users[user.id];
          delete this.ipMap[user.ip];
          let model = await findUserModel(voice, player);
          if (!model) {
            model = await createUserModel(ipCheck, voice, player);
          } else {
            await model.setAttributes({ ipCheckId: ipCheck.id }).save();
          }
          user.updateUser(model);
          this.users[model.id] = user;
          this.ipMap[ip] = model.id;
          return;
        } else if (!user.model.voiceAccountId && user.model.playerId === player.id) {
          //Merge with existing voice user
          const model = await findUserModel(voice, undefined);
          if (model) {
            await model.destroy();
          }
        } else if (!user.model.playerId && user.model.voiceAccountId === voice.id) {
          //Merge with existing player user
          const model = await findUserModel(undefined, player);
          if (model) {
            await model.destroy();
          }
        }
        await user.model.setAttributes({ voiceAccountId: voice.id, playerId: player.id }).save();
        await user.model.reload();
      });
      user.on('update', () => this.emit('update', { type: 'user', data: user }));
      user.on('disconnect', () => {
        this.emit('delete', { type: 'user', data: user });
        user.removeAllListeners();
        delete this.users[user.id];
        delete this.ipMap[user.ip];
      });
    }
    if (mumble) {
      user.setMumble(mumble);
    }
    if (tf2) {
      user.setTf2(tf2);
    }
    return user;
  }

  send(event: string, data: any) {
    this.emit(event, data);
  }

  async getState() {
    const users = Object.values(this.users);
    const steamIds: string[] = [];
    users.forEach(user => {
      if (user.model.player) {
        steamIds.push(user.model.player.steamId);
      }
    });
    return {
      servers: Object.values(this.servers).sort((a, b) => a.model.name.localeCompare(b.model.name)),
      users,
      draft: this.draft,
      logs: await Log.findAll(),
      maps: config.get('tf2.maps'),
      globalStats: await AggregatedClassStats.scope('globals').findAll(),
      players: await Player.scope('withStats').findAll({
        where: {
          steamId: steamIds,
        }
      }),
    } as any;
  }

  async fakes(users: number, _servers: number) {
    for (let [id, user] of Object.entries(this.users)) {
      if (user instanceof FakeUser) {
        user.removeAllListeners();
        delete this.users[parseInt(id)];
      }
    }
    for (let i = 0; i < users; ++i) {
      await createFakeUser();
    }
  }
}

const instance = new Data();

export default function data() {
  return instance;
}
