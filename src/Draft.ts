import EventEmitter from 'events';
import data from './Data';
import { CLASSES, DRAFT_TYPE, TEAMS } from './types';
import User from './User';

const RED = TEAMS.Red;
const BLU = TEAMS.Blue;

interface Slot {
  class: CLASSES;
  name: string;
  user?: User;
  previousChannel?: number;
}

class Team {
  slots: Slot[];
  constructor(public name: TEAMS, public channelId: number) {
    this.slots = [
      { class: CLASSES.demoman, name: 'Demoman' },
      { class: CLASSES.medic, name: 'Medic' },
      { class: CLASSES.scout, name: 'Scout' },
      { class: CLASSES.scout, name: 'Scout' },
      { class: CLASSES.soldier, name: 'Pocket' },
      { class: CLASSES.soldier, name: 'Roamer' },
    ];
  }

  draft(index: number, user?: User ) {
    if (this.slots[index].user && this.slots[index].user.mumble && this.slots[index].previousChannel) {
      this.slots[index].user.mumble.move(this.slots[index].previousChannel);
      delete this.slots[index].user;
      delete this.slots[index].previousChannel;
    }
    this.slots[index].user = user;
    if (user && user.mumble) {
      this.slots[index].previousChannel = user.mumble!.user.channel.id;
      user.mumble.move(this.channelId);
    }
  }

  cancel() {
    this.slots.forEach(slot => {
      if (slot.user && slot.user.mumble && slot.previousChannel) {
        slot.user.mumble.move(slot.previousChannel);
      }
    });
  }
}

export default class Draft extends EventEmitter {
  active: boolean = false;
  serverId?: number;
  teams?: {[team in TEAMS]?: Team};
  type: DRAFT_TYPE = DRAFT_TYPE.COACHED_MIX;

  start(serverId: number) {
    const server = data().fetchServer(serverId);
    if (this.active) {
      throw new Error('Draft already in progress');
    }
    if (!server || !server.model.channels) {
      throw new Error('Invalid server');
    }
    const channels = server.model.channels;
    this.serverId = serverId;
    this.teams = {
      [RED]: new Team(RED, channels[RED]),
      [BLU]: new Team(BLU, channels[BLU]),
    };
    this.active = true;
    this.notify();
  }

  draft(team: TEAMS, index: number, userId?: number) {
    const user = userId ? data().fetchUser(userId) : undefined;
    if (this.teams[team]) {
      this.teams[team].draft(index, user);
    }
    this.notify();
  }

  end() {
    this.active = false;
    delete this.serverId;
    delete this.teams;
    this.notify();
  }

  cancel() {
    this.teams[RED].cancel();
    this.teams[BLU].cancel();
    this.end();
  }

  notify() {
    this.emit('update');
  }

  toJSON() {
    const draft: any = {
      active: this.active,
      serverIp: this.serverId,
      type: this.type,
    };

    const map = ((slot: Slot) => {
      return {
        class: slot.class,
        name: slot.name,
        id: slot.user ? slot.user.id : undefined,
      };
    });

    if (this.active && this.teams) {
      draft.teams = {
        [RED]: this.teams[RED].slots.map(map),
        [BLU]: this.teams[BLU].slots.map(map),
      }
    }

    return draft;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}
