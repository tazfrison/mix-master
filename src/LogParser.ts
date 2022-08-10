import { ID as SteamID } from '@node-steam/id';
import axios from 'axios';
import { InferCreationAttributes, Transaction } from 'sequelize/types';
import { sequelize } from './Data';
import Log from './models/Log';
import LogClassStats from './models/LogClassStats';
import LogMedicStats from './models/LogMedicStats';
import LogPlayer from './models/LogPlayer';
import Player from './models/Player';
import Round from './models/Round';
import { CLASSES, LogJson, TEAMS } from './types';

const valid = (num: number, denom: number) => ((denom === 0) ? 0 : (num / denom));

export default class LogParser {
  logJson?: LogJson.Root;
  done: boolean = false;
  transaction?: Transaction;

  //Models
  logModel?: Log;
  roundModels: { [index: number]: Round } = {};
  playerModels: { [steamId: string]: Player } = {};
  playerModelsById: { [playerId: number]: Player } = {};
  logPlayerModels: { [steamId: string]: LogPlayer } = {};
  logClassStatModels: { [steamId: string]: { [classIndex in CLASSES]?: LogClassStats } } = {};
  logMedicStatModels: { [steamId: string]: LogMedicStats } = {};

  constructor(public logId: number) { }

  async fetchLog() {
    if (this.logJson) {
      return this.logJson;
    }
    try {
      const response = await axios(`https://logs.tf/api/v1/log/${this.logId}`);
      this.logJson = response.data;
      this.done = false;
      return this.logJson;
    } catch (e) {
      console.log('Error fetch log ' + this.logId);
      throw e;
    }
  }

  async import() {
    if (this.done) {
      throw new Error('Already imported this log');
    }
    this.transaction = await sequelize.transaction();
    const rootJson = await this.fetchLog();

    try {
      await this.ensureLogModel(rootJson);
      await this.ensureRoundModels(rootJson.rounds);
      await this.ensurePlayerModels(rootJson.names);
      await this.ensureLogPlayerModels(rootJson.players);

      const classStatsJsonMap: { [steamId: string]: LogJson.ClassStats[] } = {};
      const medicStatsJsonMap: { [steamId: string]: { playerJson: LogJson.Player, spread: { [steamId: string]: number } } } = {}
      Object.entries(rootJson.players).forEach(([rawSteam, playerJson]) => {
        const steamId = (new SteamID(rawSteam)).getSteamID64();
        classStatsJsonMap[steamId] = playerJson.class_stats;
        if (playerJson.medicstats) {
          medicStatsJsonMap[steamId] = {
            playerJson,
            spread: rootJson.healspread[rawSteam],
          };
        }
      });

      await this.ensureLogClassStats(classStatsJsonMap);
      await this.ensureLogMedicStats(medicStatsJsonMap);
    } catch (e) {
      await this.transaction.rollback();
      throw e;
    }
    await this.transaction.commit();
    delete this.transaction;
    this.done = true;
  }

  async getExistingModels() {
    // Get existing Log, Rounds, LogPlayers, and some Players
    this.logModel = await Log.findByPk(this.logId, {
      include: [{
        model: Round,
      }, {
        model: LogPlayer,
        include: [Player, LogClassStats, LogMedicStats],
      }],
    });

    this.roundModels = {};
    this.playerModels = {};
    this.logPlayerModels = {};
    this.logClassStatModels = {};
    this.logMedicStatModels = {};

    if (!this.logModel) {
      return;
    }

    //Index existing Rounds by round number
    if (this.logModel.rounds) {
      this.logModel.rounds.forEach(roundModel => {
        this.roundModels[roundModel.number] = roundModel;
      });
    }

    //Index existing Players by steamId
    if (this.logModel.players) {
      this.logModel.players.forEach(logPlayerModel => {
        const steamId = logPlayerModel.player.steamId;
        this.playerModels[steamId] = logPlayerModel.player;
        this.playerModelsById[logPlayerModel.player.id] = logPlayerModel.player;

        //Index LogPlayers by steamId
        this.logPlayerModels[steamId] = logPlayerModel;
        if (logPlayerModel.logClassStats) {
          this.logClassStatModels[steamId] = {};
          //Index LogClassStats by steamId and class
          logPlayerModel.logClassStats.forEach(logClassStatModel => {
            this.logClassStatModels[steamId][logClassStatModel.className] = logClassStatModel;
          });
        }
        //Index LogMedicStats by steamId
        if (logPlayerModel.logMedicStats) {
          this.logMedicStatModels[steamId] = logPlayerModel.logMedicStats;
        }
      });
    }
  }

  async ensureLogModel(rootJson: LogJson.Root) {
    //Find existing log
    this.logModel = await Log.findByPk(this.logId, { transaction: this.transaction });

    let winner: TEAMS = null;
    if (rootJson.teams.Blue.score > rootJson.teams.Red.score) {
      winner = TEAMS.Blue;
    } else if (rootJson.teams.Blue.score < rootJson.teams.Red.score) {
      winner = TEAMS.Red;
    }

    const logAttributes: InferCreationAttributes<Log> = {
      id: this.logId,
      winner,
      title: rootJson.info.title,
      upload: new Date(rootJson.info.date * 1000),
      map: rootJson.info.map,
      duration: rootJson.length,
      bluScore: rootJson.teams.Blue.score,
      redScore: rootJson.teams.Red.score,
      teamStats: rootJson.teams,
    };

    // Create or update Log
    if (this.logModel) {
      await this.logModel.setAttributes(logAttributes).save({ transaction: this.transaction });
    } else {
      this.logModel = await Log.create(logAttributes, { transaction: this.transaction });
    }
  }

  async ensureRoundModels(roundsJson: LogJson.Round[]) {
    (await Round.findAll({
      where: { logId: this.logId },
      transaction: this.transaction,
    })).forEach(roundModel => {
      this.roundModels[roundModel.number] = roundModel;
    });

    const newRounds: InferCreationAttributes<Round>[] = [];
    let i = 0;
    for (const roundJson of roundsJson) {
      const roundAttributes: InferCreationAttributes<Round> = {
        number: ++i,
        startTime: new Date(roundJson.start_time * 1000),
        duration: roundJson.length,
        logId: this.logModel.id,
        log: this.logModel,
        winner: roundJson.winner || null,
        firstCap: roundJson.firstcap || null,
        teamStats: roundJson.team,
      };

      //Create or update Round
      if (this.roundModels[i]) {
        await this.roundModels[i].setAttributes(roundAttributes).save({ transaction: this.transaction });
      } else {
        newRounds.push(roundAttributes);
      }
    }

    // Create and index new Rounds
    if (newRounds.length > 0) {
      await Round.bulkCreate(newRounds, { transaction: this.transaction });

      (await Round.findAll({
        where: { logId: this.logId },
        transaction: this.transaction,
      })).forEach(roundModel => {
        this.roundModels[roundModel.number] = roundModel;
      });
    }
  }

  async ensurePlayerModels(namesJson: { [steamId: string]: string }) {
    const steamIds = Object.keys(namesJson).map(rawSteamId => (new SteamID(rawSteamId)).getSteamID64());
    //Fetch Player models
    (await Player.findAll({
      where: {
        steamId: steamIds,
      },
      transaction: this.transaction,
    })).forEach(playerModel => {
      this.playerModels[playerModel.steamId] = playerModel;
      this.playerModelsById[playerModel.id] = playerModel;
    });

    const newPlayers: InferCreationAttributes<Player>[] = [];
    for (const [rawSteamId, name] of Object.entries(namesJson)) {
      const steamId = (new SteamID(rawSteamId)).getSteamID64();
      const playerAttributes: InferCreationAttributes<Player> = {
        steamId,
        name,
        admin: false,
      };
      if (this.playerModels[steamId]) {
        playerAttributes.admin = this.playerModels[steamId].admin;
        await this.playerModels[steamId].setAttributes(playerAttributes).save({ transaction: this.transaction });
      } else {
        newPlayers.push(playerAttributes);
      }
    };

    if (newPlayers.length > 0) {
      // Create and index new Players
      await Player.bulkCreate(newPlayers, { transaction: this.transaction });

      //Refetch models
      (await Player.findAll({
        where: {
          steamId: steamIds,
        },
        transaction: this.transaction,
      })).forEach(playerModel => {
        this.playerModels[playerModel.steamId] = playerModel;
        this.playerModelsById[playerModel.id] = playerModel;
      });
    }
  }

  async ensureLogPlayerModels(playersJson: { [steamId: string]: LogJson.Player }) {
    //Fetch LogPlayer models
    (await LogPlayer.findAll({
      where: {
        logId: this.logId,
      },
      transaction: this.transaction,
    })).forEach(logPlayerModel => {
      const playerModel = this.playerModelsById[logPlayerModel.playerId];
      this.logPlayerModels[playerModel.steamId] = logPlayerModel;
    });

    const newLogPlayers: InferCreationAttributes<LogPlayer>[] = [];
    for (const [rawSteamId, playerJson] of Object.entries(playersJson)) {
      const steamId = (new SteamID(rawSteamId)).getSteamID64();
      const playerModel = this.playerModels[steamId];
      const playtime = playerJson.class_stats.reduce((total, stats) => total += stats.total_time, 0);
      const logPlayerAttributes: InferCreationAttributes<LogPlayer> = {
        kills: playerJson.kills,
        assists: playerJson.assists,
        deaths: playerJson.deaths,
        damage: playerJson.dmg,
        damageTaken: playerJson.dt,
        playtime: playtime,
        team: playerJson.team,
        healthPacks: playerJson.medkits,
        airshots: playerJson.as,
        captures: playerJson.cpc,
        rawStats: playerJson,
        logId: this.logModel.id,
        log: this.logModel,
        playerId: playerModel.id,
        player: playerModel,
      };

      //Update existing LogPlayers
      if (this.logPlayerModels[steamId]) {
        await this.logPlayerModels[steamId].setAttributes(logPlayerAttributes).save({ transaction: this.transaction });
      } else {
        newLogPlayers.push(logPlayerAttributes);
      }
    }

    if (newLogPlayers.length > 0) {
      // Create and index new LogPlayers
      await LogPlayer.bulkCreate(newLogPlayers, { transaction: this.transaction });

      //Refetch
      (await LogPlayer.findAll({
        where: {
          logId: this.logId,
        },
        transaction: this.transaction,
      })).forEach(logPlayerModel => {
        const playerModel = this.playerModelsById[logPlayerModel.playerId];
        this.logPlayerModels[playerModel.steamId] = logPlayerModel;
      });
    }
  }

  async ensureLogClassStats(classStatsJsonMap: { [steamId: string]: LogJson.ClassStats[] }) {
    //Fetch LogPlayer models
    (await LogClassStats.findAll({
      where: {
        logId: this.logId,
      },
      transaction: this.transaction,
    })).forEach(logClassStatsModel => {
      const playerModel = this.playerModelsById[logClassStatsModel.playerId];
      if (!this.logClassStatModels[playerModel.steamId]) {
        this.logClassStatModels[playerModel.steamId] = {};
      }
      this.logClassStatModels[playerModel.steamId][logClassStatsModel.className] = logClassStatsModel;
    });

    const newLogClassStats: InferCreationAttributes<LogClassStats>[] = [];
    for (const [steamId, classStatsList] of Object.entries(classStatsJsonMap)) {
      const logPlayerModel = this.logPlayerModels[steamId];
      const playerModel = this.playerModels[steamId];
      for (const classStatsJson of classStatsList) {
        const className = classStatsJson.type;
        if (!className || (className.toString()) === 'undefined') {
          continue;
        }
        const classStatAttributes: InferCreationAttributes<LogClassStats> = {
          kills: classStatsJson.kills,
          assists: classStatsJson.assists,
          deaths: classStatsJson.deaths,
          damage: classStatsJson.dmg,
          playtime: classStatsJson.total_time,
          className: className,
          logPlayerId: logPlayerModel.id,
          logPlayer: logPlayerModel,
          playerId: playerModel.id,
          player: playerModel,
          ka_d: valid(classStatsJson.kills + classStatsJson.assists, classStatsJson.deaths),
          k_d: valid(classStatsJson.kills, classStatsJson.deaths),
          k_m: valid(classStatsJson.kills * 60, classStatsJson.total_time),
          a_m: valid(classStatsJson.assists * 60, classStatsJson.total_time),
          de_m: valid(classStatsJson.deaths * 60, classStatsJson.total_time),
          da_m: valid(classStatsJson.dmg * 60, classStatsJson.total_time),
          weaponStats: classStatsJson.weapon,
          logId: this.logId,
          log: this.logModel,
        };

        if (!this.logClassStatModels[steamId]) {
          this.logClassStatModels[steamId] = {};
        }
        if (this.logClassStatModels[steamId][className]) {
          await this.logClassStatModels[steamId][className].setAttributes(classStatAttributes).save({ transaction: this.transaction });
        } else {
          newLogClassStats.push(classStatAttributes);
        }
      }
    }

    if (newLogClassStats.length > 0) {
      await LogClassStats.bulkCreate(newLogClassStats, { transaction: this.transaction });
      (await LogClassStats.findAll({
        where: {
          logId: this.logId,
        },
        transaction: this.transaction,
      })).forEach(logClassStatsModel => {
        const playerModel = this.playerModelsById[logClassStatsModel.playerId];
        if (!this.logClassStatModels[playerModel.steamId]) {
          this.logClassStatModels[playerModel.steamId] = {};
        }
        this.logClassStatModels[playerModel.steamId][logClassStatsModel.className] = logClassStatsModel;
      });
    }
  }

  async ensureLogMedicStats(medicStatsJsonMap: { [steamId: string]: { playerJson: LogJson.Player, spread: { [steamId: string]: number } } }) {
    (await LogMedicStats.findAll({
      where: {
        logId: this.logId,
      },
      transaction: this.transaction,
    })).forEach(logMedicStatsModel => {
      const playerModel = this.playerModelsById[logMedicStatsModel.playerId];
      this.logMedicStatModels[playerModel.steamId] = logMedicStatsModel;
    });

    const newMedicStats: InferCreationAttributes<LogMedicStats>[] = [];
    for (const [steamId, { playerJson, spread }] of Object.entries(medicStatsJsonMap)) {
      const logPlayerModel = this.logPlayerModels[steamId];
      const playerModel = this.playerModels[steamId];
      const playtime = playerJson.class_stats.find(stats => stats.type === CLASSES.medic).total_time;
      const medicAttributes: InferCreationAttributes<LogMedicStats> = {
        deaths: playerJson.deaths,
        damageTaken: playerJson.dt,
        playtime: playtime,
        ubers: playerJson.ubers,
        drops: playerJson.drops,
        heals: playerJson.heal,
        buildTime: playerJson.medicstats.avg_time_to_build,
        uberStats: playerJson.ubertypes,
        medicStats: playerJson.medicstats,
        logPlayerId: logPlayerModel.id,
        logPlayer: logPlayerModel,
        playerId: playerModel.id,
        player: playerModel,
        logId: this.logId,
        log: this.logModel,
      };

      //Update existing LogPlayers
      if (this.logMedicStatModels[steamId]) {
        await this.logMedicStatModels[steamId].setAttributes(medicAttributes).save({ transaction: this.transaction });
      } else {
        newMedicStats.push(medicAttributes);
      }
    }

    if (newMedicStats.length > 0) {
      // Create and index new LogPlayers
      await LogMedicStats.bulkCreate(newMedicStats, { transaction: this.transaction });
      (await LogMedicStats.findAll({
        where: {
          logId: this.logId,
        },
        transaction: this.transaction,
      })).forEach(logMedicStatsModel => {
        const playerModel = this.playerModelsById[logMedicStatsModel.playerId];
        this.logMedicStatModels[playerModel.steamId] = logMedicStatsModel;
      });
    }
  }
}