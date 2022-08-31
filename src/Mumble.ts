import config from 'config';
import * as Events from 'events';
import { Client, connect, User as BaseUser } from 'mumble';
import data from './Data';
import MumbleChannel from './models/MumbleChannel';
import VoiceAccount from './models/VoiceAccount';
import { VOICE } from './types';

export interface UserJoined {
  certificate: string;
  session: number;
  name: string;
  ip: string;
  user: BaseUser;
}

export class MumbleUser extends Events.EventEmitter {
  user: BaseUser;
  voice: VoiceAccount;
  tags: { [key: string]: string } = {};
  constructor(user: BaseUser, voice: VoiceAccount) {
    super();

    this.user = user;
    this.voice = voice;
    const notify = () => this.emit('update');
    user.on('move', () => {
      this.generateTags();
      notify();
    });
    user.on('mute', notify);
    user.on('deaf', notify);
    user.on('disconnect', () => this.emit('disconnect'));

    this.generateTags();
  }

  get name() {
    return this.user.name;
  }

  get hash() {
    return this.user.hash;
  }

  setMute(isMute: boolean) {
    this.user.setMute(isMute);
  }

  setDeaf(isDeaf: boolean) {
    this.user.setDeaf(isDeaf);
  }

  kick(message: string) {
    this.user.kick(message);
  }

  ban(message: string) {
    this.user.ban(message);
  }

  move(channelId: number) {
    this.user.moveToChannel(data().mumble?.getChannelById(channelId));
  }

  async generateTags() {
    //TODO: Convert node-mumble to provide full channels from getPath instead of just names
    const ids: number[] = [];
    let channel = this.user.channel;
    while (channel) {
      ids.unshift(channel.id);
      channel = channel.parent;
    }
    const tags: { [key: string]: string } = this.tags;
    const channelTags: { [id: number]: MumbleChannel } = {};
    (await MumbleChannel.findAll({ where: { id: ids } })).forEach(mumbleChannel => {
      channelTags[mumbleChannel.id] = mumbleChannel;
    });

    ids.forEach(id => {
      if (channelTags[id]) {
        Object.entries(channelTags[id].tags).forEach(([key, value]) => {
          if (value === null) {
            delete tags[key];
          } else {
            tags[key] = value;
          }
        })
      }
    });

    this.tags = tags;
  }

  toJSON() {
    return {
      name: this.user.name,
      hash: this.user.hash,
      mute: this.user.mute,
      deaf: this.user.deaf,
      channel: {
        id: this.user.channel.id,
        name: this.user.channel.name,
        path: this.user.channel.getPath(),
      },
      session: this.user.session,
      tags: this.tags,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}

const USERNAME: string = config.get('mumble.username');

export default class Mumble extends Events.EventEmitter {
  client: Client;
  url: string;
  options: any;
  constructor(url: string, options: any) {
    super();
    this.url = url;
    this.options = options;
  }

  connect() {
    connect(this.url, this.options, (error: any, client: Client) => {
      if (error) {
        throw new Error(error);
      }
      console.log('connected');

      this.client = client;

      client.authenticate(USERNAME, null);
      client.once('initialized', (connection: any) => this.onInit(connection));
    });
  }

  onInit(_connection: any) {
    this.emit('initialized');
    data().addMumble(this);
    if (!this.client.user || !this.client.user.isRegistered()) {
      console.log(USERNAME + ' is not registered');
      return;
    }
    this.setupListeners();
    this.client.users().forEach(user => {
      if (user.name === USERNAME) {
        return;
      }
      this.client.connection.sendMessage('UserStats', user.session);
    });
  }

  setupListeners() {
    this.client.on('user-connect', (user: BaseUser) => {
      if (user.name === USERNAME) {
        return;
      }
      this.client.connection.sendMessage('UserStats', user.session);
    });

    this.client.connection.on('userStats', async (stats: any) => {
      /*stats.certificates.forEach((cert: any) => {
        var prefix = '-----BEGIN CERTIFICATE-----\n';
        var postfix = '-----END CERTIFICATE-----';
        //console.log(prefix + (cert as ByteBuffer).toString('base64').match(/.{0,64}/g).join('\n') + postfix);
      });*/
      const mUser = this.client.userBySession(stats.session);
      if (!mUser) {
        return;
      }

      const address = (stats.address as ByteBuffer).toHex().slice(-8);
      const ip = address.match(/../g).map(a => parseInt(a, 16)).join('.');
      let voice = await VoiceAccount.findOne({ where: { hash: mUser.hash } });
      if (!voice) {
        voice = await VoiceAccount.create({ hash: mUser.hash, name: mUser.name, type: VOICE.mumble, tags: {} });
      }
      const user = new MumbleUser(mUser, voice);
      await data().upsertUser(ip, user);
    });
  }

  getChannelById(channelId: number) {
    return this.client.channelById(channelId);
  }

  async getChannels() {
    const channelTags: { [id: number]: MumbleChannel } = {};
    (await MumbleChannel.findAll()).forEach(mumbleChannel => {
      channelTags[mumbleChannel.id] = mumbleChannel;
    });
    const output = [];
    const channels = [this.client.rootChannel];
    for (let i = 0; i < channels.length; ++i) {
      const channel = channels[i];
      channels.push(...channel.children.sort((a, b) => a.position - b.position));
      output.push({
        id: channel.id,
        name: channel.name,
        children: channel.children.sort((a, b) => a.position - b.position).map(child => child.id),
        tags: channelTags[channel.id] ? channelTags[channel.id].tags : undefined,
      });
    }
    return output;
  }
}
