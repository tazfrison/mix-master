import { Session, SessionData } from 'express-session';

declare module 'http' {
  interface IncomingMessage {
    session: Session & Partial<SessionData>
  }
}

declare module 'express-session' {
  interface SessionData {
    passport: {
      user: Express.User
    }
  }
}

declare global {
  namespace Express {
    interface User {
      id: number;
      steamId: string;
      avatar: string;
      name: string;
      admin: boolean;
    }
  }
}

export enum DRAFT_TYPE {
  COACHED_MIX,
}

export enum VOICE {
  mumble = 'mumble',
  discord = 'discord',
}

export enum SKILLS {
  NO = 0,
  MINOR = 1,
  FREE = 2,
  PAID = 3,
}

export enum CLASSES {
  scout = 'scout',
  soldier = 'soldier',
  pyro = 'pyro',
  demoman = 'demoman',
  heavy = 'heavyweapons',
  engineer = 'engineer',
  medic = 'medic',
  sniper = 'sniper',
  spy = 'spy',
  spectator = 'spectator',
  unassigned = 'unassigned',
}

export enum TEAMS {
  Red = 'Red',
  Blue = 'Blue',
  Spectator = 'Spectator',
  Unassigned = 'Unassigned',
}

export namespace Config {
  export interface Root {
    roles: {
      admin: string[];
    };
    express: Express;
    steam: {
      apiKey: string;
    };
    mumble: Mumble;
    ipCheck: IPCheck;
    tf2: TF2;
  }

  export interface Express {
    url: string;
    port: number;
    secret: string;
    frontend?: string;
  }

  export interface Mumble {
    username: string;
    ip: string;
    tags: Tags
  }

  export interface Tags {
    [channelId: number]: {
      [className in CLASSES]?: SKILLS;
    };
  }

  export interface IPCheck {
    url: string;
    email: string;
  }

  export interface TF2 {
    maps: string[];
  }
}

export namespace LogJson {
  export interface Root {
    version: number;
    teams: { [team in TEAMS]: Team };
    length: number;
    players: { [steamId: string]: Player };
    names: { [steamId: string]: string };
    rounds: Round[];
    healspread: { [healerId: string]: { [healedId: string]: number } };
    classkills: { [classKill in CLASSES]?: number };
    classdeaths: { [classDeath in CLASSES]?: number };
    classkillassists: { [classAssist in CLASSES]?: number };
    chat: {
      steamid: string;
      name: string;
      msg: string;
    }[];
    info: {
      map: string;
      supplemental: boolean;
      total_length: number;
      hasRealDamage: boolean;
      hasWeaponDamage: boolean;
      hasAccuracy: boolean;
      hasHP: boolean;
      hasHP_real: boolean;
      hasHS: false;
      hasHS_hit: false;
      hasBS: false;
      hasCP: boolean;
      hasSB: false;
      hasDT: boolean;
      hasAS: boolean;
      hasHR: boolean;
      hasIntel: false;
      AD_scoring: false;
      notifications: any[];
      title: string;
      date: number;
    };
    killstreaks: {
      steamid: string;
      streak: number;
      time: number;
    }[];
    success: boolean;
  }

  export interface Team {
    score: number;
    kills: number;
    deaths: number;
    dmg: number;
    charges: number;
    drops: number;
    firstcaps: number;
    caps: number;
  }

  export interface Player {
    team: TEAMS;
    class_stats: ClassStats[];
    kills: number;
    deaths: number;
    assists: number;
    suicides: number;
    kapd: string;
    kpd: string;
    dmg: number;
    dmg_real: number;
    dt: number;
    dt_real: number;
    hr: number;
    lks: number;
    as: number;
    dapd: number;
    dapm: number;
    ubers: number;
    ubertypes: { [medigun: string]: number };
    drops: number;
    medkits: number;
    medkits_hp: number;
    backstabs: number;
    headshots: number;
    headshots_hit: number;
    sentries: number;
    heal: number;
    cpc: number;
    ic: number;
    medicstats?: MedicStats;
  }

  export interface MedicStats {
    advantages_lost: number;
    biggest_advantage_lost: number;
    deaths_with_95_99_uber: number;
    deaths_within_20s_after_uber: number;
    avg_time_before_healing: number;
    avg_time_to_build: number;
    avg_time_before_using: number;
    avg_uber_length: number;
  }

  export interface ClassWeaponStats {
    [weapon: string]: {
      kills: number;
      dmg: number;
      avg_dmg: number;
      shots: number;
      hits: number;
    }
  };

  export interface ClassStats {
    type: CLASSES;
    kills: number;
    assists: number;
    deaths: number;
    dmg: number;
    weapon: ClassWeaponStats;
    total_time: number;
  }

  export interface RoundTeam {
    score: number;
    kills: number;
    dmg: number;
    ubers: number;
  }

  export interface Round {
    start_time: number;
    winner: TEAMS;
    team: { [team in TEAMS]: RoundTeam };
    events: {
      type: string;
      time: number;
      team: TEAMS;
    }[];
    players: { [steamId: string]: {
      team: TEAMS;
      kills: number;
      dmg: number;
    } };
    firstcap: TEAMS | null;
    length: number;
  }
}
