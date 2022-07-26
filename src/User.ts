import config from 'config';
import EventEmitter from 'events';
import { User as MumbleUser } from 'mumble';
import data from './Data';
import checkIp from './IPChecker';
import Player from './models/Player';
import VoiceAccount from './models/VoiceAccount';
import TF2, { PlayerJoined } from './TF2';
import { CLASSES, SKILLS, VOICE } from './types';

let NEXT_ID = 1;

const TAG_MAP: { [channelId: number]: { [className in CLASSES]?: SKILLS } } = config.get('mumble.tags');

export default class User extends EventEmitter {
  id: number;
  name?: string;
  validated?: boolean;
  voice?: VoiceAccount;
  player?: Player;
  mumble?: {
    user: MumbleUser;
    hash: string;
    setMute: (isMute: boolean) => void;
    setDeaf: (isDeaf: boolean) => void;
    kick: (message?: string) => void;
    ban: (message?: string) => void;
    move: (channelId: number) => void;
  };
  steamId?: string;
  tf2?: {
    name: string;
    userId: number;
    steamId: string;
    server: TF2;
    mute: boolean;
    isLocked: boolean;
    team: string;
    class: string;
    setMute: (isMute: boolean) => void;
    setSpec: (isLocked: boolean) => void;
    kick: (message?: string) => void;
    ban: (message?: string) => void;
  };

  private _notify: boolean = false;
  constructor(public ip: string, id?: number) {
    super();

    this.id = id || NEXT_ID++;

    ['setMute', 'setDeaf', 'kick', 'ban', 'printIp'].forEach(func => {
      const self: any = this;
      self[func] = self[func].bind(this);
    });
  }

  async validate() {
    if (this.validated === undefined) {
      this.validated = await checkIp(this.ip);
      if (this.validated === false) {
        if (this.mumble) {
          this.mumble.setMute(true);
        }
        if (this.tf2) {
          this.tf2.setMute(true);
          this.tf2.setSpec(true);
        }
      }
      if (this.validated !== undefined) {
        this.notify();
      }
    }
    return this.validated;
  }

  async setMumble(user?: MumbleUser) {
    if (user) {
      let voice = await VoiceAccount.findOne({ where: { hash: user.hash } });
      if (!voice) {
        voice = await VoiceAccount.create({ hash: user.hash, name: user.name, type: VOICE.mumble, tags: {} });
      }
      this.voice = voice;
      this.mumble = {
        user,
        hash: user.hash,
        setMute: (isMute: boolean) => user.setMute(isMute),
        setDeaf: (isDeaf: boolean) => user.setDeaf(isDeaf),
        kick: (message: string) => user.kick(message),
        ban: (message: string) => user.ban(message),
        move: (channelId: number) => user.moveToChannel(data().mumble?.getChannelById(channelId)),
      };
      if (!this.name || this.name !== user.name) {
        this.name = user.name;
      }
      if (await this.validate() === false) {
        this.mumble.setMute(true);
      }
      await this.link();
    } else {
      delete this.mumble;
    }
    this.notify();
  }

  async setTf2(info?: PlayerJoined, server?: TF2) {
    if (info && server) {
      const newTf2 = !this.tf2;
      this.steamId = info.steamId;
      let player = await Player.findOne({ where: { steamId: info.steamId } });
      if (!player) {
        player = await Player.create({ steamId: info.steamId, name: info.name });
      }
      this.player = player;
      this.tf2 = {
        server,
        name: info.name,
        userId: info.userId,
        steamId: info.steamId,
        team: info.team,
        class: info.class,
        mute: newTf2 ? false : this.tf2.mute,
        isLocked: newTf2 ? false : this.tf2.isLocked,
        setMute: (isMute: boolean) => { server.mute(info.userId, this.tf2.mute = isMute); this.notify(); },
        setSpec: (isLocked: boolean) => { server.setSpec(info.userId, this.tf2.isLocked = isLocked); this.notify(); },
        kick: (message: string) => server.kick(info.userId, message),
        ban: (message: string) => server.ban(info.userId, message),
      };
      if (!this.name) {
        this.name = info.name;
      }
      if (newTf2 && await this.validate() === false) {
        this.tf2.setMute(true);
        this.tf2.setSpec(true);
      }
      await this.link();
    } else {
      delete this.tf2;
    }
    this.notify();
  }

  async link() {
    if (this.player && this.voice) {
      if (!this.voice.playerId || this.voice.playerId !== this.player.id) {
        await this.voice.setAttributes({ playerId: this.player.id, player: this.player }).save();
      }
    }
  }

  setMute(isMute: boolean) {
    if (this.mumble) {
      this.mumble.setMute(isMute);
    }
    if (this.tf2) {
      this.tf2.setMute(isMute);
    }
  }

  setDeaf(isDeaf: boolean) {
    if (this.mumble) {
      this.mumble.setDeaf(isDeaf);
    }
  }

  kick(message?: string) {
    if (this.mumble) {
      this.mumble.kick(message);
    }
    if (this.tf2) {
      this.tf2.kick(message);
    }
  }

  ban(message?: string) {
    if (this.mumble) {
      this.mumble.ban(message);
    }
    if (this.tf2) {
      this.tf2.ban(message);
    }
  }

  printIp() {
    console.log(this.name + ': ' + this.ip);
  }

  toJSON() {
    const user: any = {
      id: this.id,
      name: this.name,
      validated: this.validated,
      steamId: this.steamId,
    };

    if (this.mumble) {
      user.mumble = {
        name: this.mumble.user.name,
        hash: this.mumble.hash,
        mute: this.mumble.user.mute,
        deaf: this.mumble.user.deaf,
        channel: {
          id: this.mumble.user.channel.id,
          name: this.mumble.user.channel.name,
          path: this.mumble.user.channel.getPath(),
        },
        session: this.mumble.user.session,
      };
      user.tags = TAG_MAP[this.mumble.user.channel.id] || {};
    }

    if (this.tf2) {
      user.tf2 = {
        userId: this.tf2.userId,
        name: this.tf2.name,
        steamId: this.tf2.steamId,
        serverIp: this.tf2.server.ip,
        mute: this.tf2.mute,
        isLocked: this.tf2.isLocked,
        team: this.tf2.team,
        class: this.tf2.class,
      };
    }
    return user;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  notify() {
    if (this._notify) {
      return;
    }
    this._notify = true;
    setTimeout(() => {
      this._notify = false;
      this.emit('update');
    }, 50);
  }
}