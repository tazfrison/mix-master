import { ID as SteamID } from '@node-steam/id';
import axios from 'axios';
import { Sequelize } from 'sequelize-typescript';
import { InferCreationAttributes, Transaction } from 'sequelize/types';
import { sequelize } from './Data';
import AggregatedClassStats from './models/AggregatedClassStats';
import Log from './models/Log';
import LogClassStats from './models/LogClassStats';
import LogMedicStats from './models/LogMedicStats';
import LogPlayer from './models/LogPlayer';
import Player from './models/Player';
import Round from './models/Round';
import { CLASSES, LogJson, TEAMS } from './types';

const valid = (num: number, denom: number) => ((denom === 0) ? 0 : (num / denom));

const GLOBAL_AGGREGATION_QUERY = `SELECT
lcs.className,
SUM((lcs.kills - avg.kills) * (lcs.kills - avg.kills)) / (avg.total - 1) AS kills_sd,
SUM((lcs.assists - avg.assists) * (lcs.assists - avg.assists)) / (avg.total - 1) AS assists_sd,
SUM((lcs.deaths - avg.deaths) * (lcs.deaths - avg.deaths)) / (avg.total - 1) AS deaths_sd,
SUM((lcs.damage - avg.damage) * (lcs.damage - avg.damage)) / (avg.total - 1) AS damage_sd,
SUM((lcs.ka_d - avg.ka_d) * (lcs.ka_d - avg.ka_d)) / (avg.total - 1) AS ka_d_sd,
SUM((lcs.k_d - avg.k_d) * (lcs.k_d - avg.k_d)) / (avg.total - 1) AS k_d_sd,
SUM((lcs.k_m - avg.k_m) * (lcs.k_m - avg.k_m)) / (avg.total - 1) AS k_m_sd,
SUM((lcs.a_m - avg.a_m) * (lcs.a_m - avg.a_m)) / (avg.total - 1) AS a_m_sd,
SUM((lcs.de_m - avg.de_m) * (lcs.de_m - avg.de_m)) / (avg.total - 1) AS de_m_sd,
SUM((lcs.da_m - avg.da_m) * (lcs.da_m - avg.da_m)) / (avg.total - 1) AS da_m_sd,
SUM((lcs.playtime - avg.playtime) * (lcs.playtime - avg.playtime)) / (avg.total - 1) AS playtime_sd,
avg.total AS total,
SUM(lcs.playtime) AS playtime,
avg.kills AS kills,
avg.assists AS assists,
avg.deaths AS deaths,
avg.damage AS damage,
avg.ka_d AS ka_d,
avg.k_d AS k_d,
avg.k_m AS k_m,
avg.a_m AS a_m,
avg.de_m AS de_m,
avg.da_m AS da_m
FROM LogClassStats AS lcs,
(
  SELECT className,
    COUNT(className) AS total,
    AVG(playtime) AS playtime,
    AVG(kills) AS kills,
    AVG(assists) AS assists,
    AVG(deaths) AS deaths,
    AVG(damage) AS damage,
    AVG(ka_d) AS ka_d,
    AVG(k_d) AS k_d,
    AVG(k_m) AS k_m,
    AVG(a_m) AS a_m,
    AVG(de_m) AS de_m,
    AVG(da_m) AS da_m
  FROM LogClassStats
  GROUP BY className
) AS avg
WHERE lcs.className = avg.className
GROUP BY avg.className;`;

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
  aggregatedClassStatModels: { [playerId: number]: { [classIndex in CLASSES]?: AggregatedClassStats } } = {};

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
      await this.updateAggregatedClassStats();
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

  async updateAggregatedClassStats() {
    const playerIds = Object.keys(this.playerModelsById);

    (await AggregatedClassStats.findAll({
      where: {
        playerId: playerIds,
      },
      transaction: this.transaction,
    })).forEach(aggregatedClassStatsModel => {
      if (!this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId]) {
        this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId] = {}
      }
      this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId][aggregatedClassStatsModel.className] = aggregatedClassStatsModel;
    });

    const newAggregatedClassStats: InferCreationAttributes<AggregatedClassStats>[] = [];
    const logClassStats = await LogClassStats.findAll({
      where: {
        playerId: playerIds,
      },
      transaction: this.transaction,
      group: [
        Sequelize.col('LogClassStats.className'),
        Sequelize.col('LogClassStats.playerId')
      ],
      attributes: [
        [Sequelize.col('LogClassStats.className'), 'className'],
        [Sequelize.col('LogClassStats.playerId'), 'playerId'],
        [Sequelize.fn('count', Sequelize.col('LogClassStats.className')), 'count'],
        [Sequelize.fn('sum', Sequelize.literal('CASE Log.winner WHEN LogPlayer.team THEN 1 ELSE 0 END')), 'wins'],
        [Sequelize.fn('count', Sequelize.literal('Log.winner')), 'nonTies'],
        [Sequelize.fn('sum', Sequelize.col('LogClassStats.playtime')), 'playtime'],
        [Sequelize.fn('sum', Sequelize.col('LogClassStats.kills')), 'kills'],
        [Sequelize.fn('sum', Sequelize.col('LogClassStats.assists')), 'assists'],
        [Sequelize.fn('sum', Sequelize.col('LogClassStats.deaths')), 'deaths'],
        [Sequelize.fn('sum', Sequelize.col('LogClassStats.damage')), 'damage'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.ka_d')), 'ka_d'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.k_d')), 'k_d'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.k_m')), 'k_m'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.a_m')), 'a_m'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.de_m')), 'de_m'],
        [Sequelize.fn('avg', Sequelize.col('LogClassStats.da_m')), 'da_m'],
      ],
      include: [Log, LogPlayer],
    });

    for (const logClassStat of logClassStats) {
      const count = logClassStat.get('count') as number;
      const wins = logClassStat.get('wins') as number;
      const nonTies = logClassStat.get('nonTies') as number;
      const aggregate: InferCreationAttributes<AggregatedClassStats> = {
        count,
        wins,
        losses: nonTies - wins,
        className: logClassStat.className,
        playerId: logClassStat.playerId,
        kills: logClassStat.kills,
        assists: logClassStat.assists,
        deaths: logClassStat.deaths,
        damage: logClassStat.damage,
        playtime: logClassStat.playtime,
        ka_d: logClassStat.ka_d,
        k_d: logClassStat.k_d,
        k_m: logClassStat.k_m,
        a_m: logClassStat.a_m,
        de_m: logClassStat.de_m,
        da_m: logClassStat.da_m,
      }

      if (!this.aggregatedClassStatModels[logClassStat.playerId]) {
        this.aggregatedClassStatModels[logClassStat.playerId] = {}
      }
      if (this.aggregatedClassStatModels[logClassStat.playerId][logClassStat.className]) {
        await this.aggregatedClassStatModels[logClassStat.playerId][logClassStat.className].setAttributes(aggregate).save({ transaction: this.transaction });
      } else {
        newAggregatedClassStats.push(aggregate);
      }
    };

    const averages: {[className in CLASSES]?: AggregatedClassStats} = {};
    const deviations: {[className in CLASSES]?: AggregatedClassStats} = {};
    (await AggregatedClassStats.findAll({
      where: { playerId: null },
      transaction: this.transaction,
    })).forEach(globalStats => {
      if (globalStats.count === 0) {
        averages[globalStats.className] = globalStats;
      } else {
        deviations[globalStats.className] = globalStats;
      }
    });

    const [results] = await sequelize.query(GLOBAL_AGGREGATION_QUERY, { transaction: this.transaction });

    for(const row of results as any[]) {
      const className: CLASSES = row.className;
      const average: InferCreationAttributes<AggregatedClassStats> = {
        count: row.total,
        wins: 0,
        losses: 0,
        className: className,
        kills: row.kills,
        assists: row.assists,
        deaths: row.deaths,
        damage: row.damage,
        playtime: row.playtime,
        ka_d: row.ka_d,
        k_d: row.k_d,
        k_m: row.k_m,
        a_m: row.a_m,
        de_m: row.de_m,
        da_m: row.da_m,
      };
      const deviation: InferCreationAttributes<AggregatedClassStats> = {
        count: 0,
        wins: 0,
        losses: 0,
        className: className,
        kills: Math.sqrt(row.kills_sd),
        assists: Math.sqrt(row.assists_sd),
        deaths: Math.sqrt(row.deaths_sd),
        damage: Math.sqrt(row.damage_sd),
        playtime: Math.sqrt(row.playtime_sd),
        ka_d: Math.sqrt(row.ka_d_sd),
        k_d: Math.sqrt(row.k_d_sd),
        k_m: Math.sqrt(row.k_m_sd),
        a_m: Math.sqrt(row.a_m_sd),
        de_m: Math.sqrt(row.de_m_sd),
        da_m: Math.sqrt(row.da_m_sd),
      };
      if (averages[className]) {
        await averages[className].setAttributes(average).save({ transaction: this.transaction });
      } else {
        newAggregatedClassStats.push(average);
      }
      if (deviations[className]) {
        await deviations[className].setAttributes(deviation).save({ transaction: this.transaction });
      } else {
        newAggregatedClassStats.push(deviation);
      }
    };

    if (newAggregatedClassStats.length > 0) {
      await AggregatedClassStats.bulkCreate(newAggregatedClassStats, { transaction: this.transaction });

      (await AggregatedClassStats.findAll({
        where: {
          playerId: playerIds,
        },
        transaction: this.transaction,
      })).forEach(aggregatedClassStatsModel => {
        if (!this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId]) {
          this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId] = {}
        }
        this.aggregatedClassStatModels[aggregatedClassStatsModel.playerId][aggregatedClassStatsModel.className] = aggregatedClassStatsModel;
      });
    }
  }
}