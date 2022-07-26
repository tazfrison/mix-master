import data from './Data';
import TF2 from './TF2';
import { CLASSES, SKILLS } from './types';
import User from './User';
import config from 'config';

const TEAM_CLASSES = [
  CLASSES.demoman,
  CLASSES.medic,
  CLASSES.scout,
  CLASSES.scout,
  CLASSES.soldier,
  CLASSES.soldier,
];

export class FakeUser extends User {
  tags: { [className in CLASSES]?: SKILLS };
  constructor(ip: string, id?: number) {
    super(ip, id);
    this.name = ip;
    this.validated = getRandom([true, false, undefined]);
    this.mumble = {
      user: ({
        channel: {
          id: 45,
        }
      }) as any,
      hash: ip,
      setMute: () => true,
      setDeaf: () => true,
      kick: () => true,
      ban: () => true,
      move: () => true,
    };
    const className = getRandom(TEAM_CLASSES);
    this.tags = {
      [className]: parseInt(getRandom(Object.keys(SKILLS).filter(a => !isNaN(Number(a))))),
    }
  }

  toJSON() {
    const user: any = {
      id: this.id,
      name: this.name,
      validated: this.validated,
      mumble: {
        name: this.name,
        hash: this.ip,
        mute: false,
        deaf: false,
        session: this.id,
        channel: {
          id: 45,
          path: [],
        }
      },
      tags: this.tags,
    };
    return user;
  }
}

export class FakeServer extends TF2 {
  constructor(password: string, ip: string, port: number = 27015) {
    super(ip, password, ip, port);

    this.score = {
      blu: Math.floor(Math.random() * 4),
      red: Math.floor(Math.random() * 4),
    };

    this.map = getRandom(MAPS);
  }

  setupListeners() {
    this.connection = {
      connect: () => { },
      on: () => { },
      send: () => { },
    };
  }

  toJSON() {
    const server: any = {
      ip: this.ip,
      score: this.score,
      time: '00:00',
      live: false,
      map: this.map,
      paused: false,
      players: {},
    };
    return server;
  }
}

const MAPS: string[] = config.get('tf2.maps');

const getRandom = (arr: any[]) => {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const createFakeUser = () => {
  const user = new FakeUser(Math.random().toString(16).slice(2, 10));
  data().users[user.id] = user;
}

export const createFakeServer = (i: number) => {
  const server = new FakeServer('nope', 'fake' + i);
  data().addServer(server);
}