import config from 'config';
import EventEmitter from 'events';
import { TF2PlayerStats } from './AdvancedTF2Server';
import checkIp from './IPChecker';
import IPCheck from './models/IPCheck';
import UserModel from './models/User';
import { MumbleUser } from './Mumble';
import { TF2Player } from './TF2Server';
import { CLASSES, SKILLS } from './types';

//const TAG_MAP: { [channelId: number]: { [className in CLASSES]?: SKILLS } } = config.get('mumble.tags');

export default class User extends EventEmitter {
  model: UserModel;
  check: IPCheck;
  mumble?: MumbleUser;
  tf2?: TF2Player;

  private _notify: boolean = false;
  constructor(model: UserModel, ipCheck: IPCheck) {
    super();
    this.model = model;
    this.model.changed('updatedAt', true);
    this.model.save();
    this.check = ipCheck;
    if (this.check.validated === false) {
      this.suppress();
    }

    ['setMute', 'setDeaf', 'kick', 'ban', 'printIp'].forEach(func => {
      const self: any = this;
      self[func] = self[func].bind(this);
    });
  }

  get id() {
    return this.model.id;
  }

  get name() {
    return this.model.name;
  }

  get ip() {
    return this.check.ip;
  }

  async validate() {
    if (this.check.validated === undefined) {
      this.check = await checkIp(this.check.ip);
      if (this.check.validated === false) {
        this.suppress();
      }
      if (this.check !== undefined) {
        this.notify();
      }
    }
    return this.check.validated;
  }

  updateUser(model: UserModel) {
    this.model = model;
    this.notify();
  }

  async setMumble(user: MumbleUser) {
    this.mumble = user;
    if (!this.model.voiceAccount || this.model.voiceAccount.id !== user.voice.id) {
      this.model.changed('updatedAt', true);
      await this.model.save();
      this.emit('change', {
        voice: user.voice,
        player: this.model.player,
      });
    } else {
      this.notify();
    }

    user.on('update', () => this.notify());
    user.on('disconnect', async () => {
      user.removeAllListeners();
      delete this.mumble;
      this.model.changed('updatedAt', true);
      await this.model.save();
      this.notify();
    });
  }

  async setTf2(player: TF2Player) {
    this.tf2 = player;
    if (!this.model.player || this.model.player.id !== player.player.id) {
      this.model.changed('updatedAt', true);
      await this.model.save();
      this.emit('change', {
        voice: this.model.voiceAccount,
        player: player.player,
      });
    } else {
      this.notify();
    }

    player.on('update', () => this.notify());
    player.on('disconnect', async () => {
      player.removeAllListeners();
      delete this.tf2;
      this.model.changed('updatedAt', true);
      await this.model.save();
      this.notify();
    });
  }

  suppress() {
    this.setMute(true);
    if (this.tf2 && this.tf2 instanceof TF2PlayerStats) {
      this.tf2.setSpec(true);
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
      validated: this.check?.validated,
    };

    if (this.model.player) {
      user.player = {
        id: this.model.player.id,
        steamId: this.model.player.steamId,
      };
      user.steamId = this.model.player.steamId;
    }

    if (this.model.voiceAccount) {
      user.voice = {
        id: this.model.voiceAccount.id,
      };
    }

    if (this.mumble) {
      user.mumble = this.mumble.toJSON();
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