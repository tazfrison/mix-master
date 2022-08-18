import config from 'config';
import data from './Data';
import AggregatedClassStats from './models/AggregatedClassStats';
import Player from './models/Player';
import { CLASSES, SKILLS } from './types';
import User from './User';

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
  constructor(ip: string, player: Player, className: CLASSES) {
    super(ip);
    this.player = player;
    this.name = player.name;
    this.validated = getRandom([true, true, true, true, true, false, undefined]);
    this.tags = {
      [className]: parseInt(getRandom(Object.keys(SKILLS).filter(a => !isNaN(Number(a))))),
    }
  }

  toJSON() {
    const user: any = {
      id: this.id,
      name: this.name,
      validated: this.validated,
      player: {
        id: this.player.id,
        steamId: this.player.steamId,
      },
      steamId: this.player.steamId,
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

/*export class FakeServer extends TF2Server {
  constructor(password: string, ip: string, port: number = 27015) {
    super({
      ip,
      password,
      name: ip,
      rcon: 'fake',
      port,
      active: true,
      advancedStats: false,
      channels: { Red: 113, Blue: 114 }
    });

    this.score = {
      Blue: Math.floor(Math.random() * 4),
      Red: Math.floor(Math.random() * 4),
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
      name: this.model.name,
      ip: this.model.ip,
      password: this.model.password,
      score: this.score,
      time: '00:00',
      live: false,
      map: this.map,
      paused: false,
      players: {},
    };
    return server;
  }
}*/

const MAPS: string[] = config.get('tf2.maps');

function getRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const createFakeUser = async () => {
  const className = getRandom(TEAM_CLASSES);
  const players = await AggregatedClassStats.findAll({
    where: {
      className,
    },
    include: [{
      model: Player,
      required: true,
    }]
  });
  const player = getRandom(players);
  const user = new FakeUser(Math.random().toString(16).slice(2, 10), player.player, className);
  data().users[user.id] = user;
}

/*export const createFakeServer = (i: number) => {
  const server = new FakeServer('nope', 'fake' + i);
  data().addServer(server);
}*/