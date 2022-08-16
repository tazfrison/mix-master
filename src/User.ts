import config from 'config';
import EventEmitter from 'events';
import { TF2PlayerStats } from './AdvancedTF2Server';
import data from './Data';
import checkIp from './IPChecker';
import Player from './models/Player';
import VoiceAccount from './models/VoiceAccount';
import { MumbleUser } from './Mumble';
import { TF2Player } from './TF2Server';
import { CLASSES, SKILLS, VOICE } from './types';

let NEXT_ID = 1;

const TAG_MAP: { [channelId: number]: { [className in CLASSES]?: SKILLS } } = config.get('mumble.tags');

export default class User extends EventEmitter {
  id: number;
  name?: string;
  validated?: boolean;
  voice?: VoiceAccount;
  player?: Player;
  mumble?: MumbleUser;
  tf2?: TF2Player;

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
          if (this.tf2 instanceof TF2PlayerStats) {
            this.tf2.setSpec(true);
          }
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
      this.mumble = user;
      let voice = await VoiceAccount.findOne({ where: { hash: user.hash } });
      if (!voice) {
        voice = await VoiceAccount.create({ hash: user.hash, name: user.name, type: VOICE.mumble, tags: {} });
      }
      this.voice = voice;
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

  async setTf2(player: TF2Player) {
    this.tf2 = player;
    this.player = player.player;
    if (!this.name) {
      this.name = player.name;
    }
    player
      .on('update', () => {
        this.notify();
      })
      .on('disconnect', () => {
        player.removeAllListeners();
        delete this.tf2;
        this.notify();
      });
    if (await this.validate() === false) {
      this.tf2.setMute(true);
      if (this.tf2 instanceof TF2PlayerStats) {
        this.tf2.setSpec(true);
      }
    }
    await this.link();
    this.notify();
  }

  async link() {
    if (this.voice) {
      if (this.player) {
        if (!this.voice.playerId || this.voice.playerId !== this.player.id) {
          await this.voice.setAttributes({ playerId: this.player.id, player: this.player }).save();
        }
      } else {
        const playerId = this.voice.playerId;
        if (playerId) {
          this.player = await Player.findByPk(playerId);
        }
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
    };

    if (this.player) {
      user.player = {
        id: this.player.id,
        steamId: this.player.steamId,
      };
      user.steamId = this.player.steamId;
    }

    if (this.voice) {
      user.voice = {
        id: this.voice.id,
      };
    }

    if (this.mumble) {
      user.mumble = this.mumble.toJSON();
      user.tags = TAG_MAP[this.mumble.user.channel.id] || {};
    }

    if (this.tf2) {
      user.tf2 = this.tf2.toJSON();
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
      if (!this.mumble && !this.tf2) {
        this.emit('disconnect');
      } else {
        this.emit('update');
      }
    }, 50);
  }
}