import EventEmitter from 'events';
import data from './Data';
import { CLASSES, DRAFT_TYPE, TEAMS } from './types';
import User from './User';

const RED = TEAMS.Red;
const BLU = TEAMS.Blue;

const channels: { [serverIp: string]: { [RED]: number, [BLU]: number } } = {
  'mix1.newbie.tf': {
    [RED]: 113,
    [BLU]: 114,
  },
  'mix2.newbie.tf': {
    [RED]: 117,
    [BLU]: 116,
  },
  'mix3.newbie.tf': {
    [RED]: 145,
    [BLU]: 118,
  },
  'fake1': {
    [RED]: 113,
    [BLU]: 114,
  },
};

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
  serverIp?: string;
  teams?: {
    [RED]: Team,
    [BLU]: Team,
  };
  type: DRAFT_TYPE = DRAFT_TYPE.COACHED_MIX;

  start(serverIp: string) {
    const server = data().fetchServer(serverIp);
    if (this.active) {
      throw new Error('Draft already in progress');
    }
    if (!server || !channels[serverIp]) {
      throw new Error('Invalid server');
    }
    this.serverIp = serverIp;
    this.teams = {
      [RED]: new Team(RED, channels[serverIp][RED]),
      [BLU]: new Team(BLU, channels[serverIp][BLU]),
    };
    this.active = true;
    this.notify();
  }

  draft(team: TEAMS, index: number, userId?: number) {
    const user = userId ? data().fetchUser(userId) : undefined;
    this.teams[team].draft(index, user);
    this.notify();
  }

  end() {
    this.active = false;
    delete this.serverIp;
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
      serverIp: this.serverIp,
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
