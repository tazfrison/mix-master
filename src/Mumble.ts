import * as Events from 'events';
import { Client, connect, User as MumbleUser } from 'mumble';
import data from './Data';
import User from './User';
import config from 'config';

export interface UserJoined {
  certificate: string;
  session: number;
  name: string;
  ip: string;
  user: MumbleUser;
}

const USERNAME: string = config.get('mumble.username');

export default class Mumble extends Events.EventEmitter {
  client: Client;
  url: string;
  options: any;
  sessionMap: { [sessionId: number]: User } = {};
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
    const notify = async (mUser: MumbleUser) => {
      if (!this.sessionMap[mUser.session]) {
        return;
      }
      const user = this.sessionMap[mUser.session];
      user.notify();
    };

    this.client.on('user-move', notify);
    this.client.on('user-mute', notify);
    this.client.on('user-deaf', notify);

    this.client.on('user-connect', (user: MumbleUser) => {
      if (user.name === 'mix-master') {
        return;
      }
      this.client.connection.sendMessage('UserStats', user.session);
    });

    this.client.connection.on('userStats', (stats: any) => {
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
      const user = data().upsertUser(ip);
      this.sessionMap[stats.session] = user;
      user.setMumble(mUser);
    });

    this.client.on('user-disconnect', async (mUser: MumbleUser) => {
      if (!this.sessionMap[mUser.session]) {
        return;
      }
      const user = this.sessionMap[mUser.session];
      user.setMumble();
    });
  }

  getChannelById(channelId: number) {
    return this.client.channelById(channelId);
  }
}
