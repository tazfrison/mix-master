import { Sequelize } from 'sequelize-typescript';
import { InferCreationAttributes, Op } from 'sequelize';
import LogClassStats from './models/LogClassStats';
import { sequelize } from './Data';
import AggregatedClassStats from './models/AggregatedClassStats';
import Log from './models/Log';
import LogPlayer from './models/LogPlayer';

const query = `SELECT
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

export async function updateStats(playerIds?: number[]) {
  let where = undefined;
  if (playerIds) {
    where = { playerId: playerIds.concat([null]) };
  }
  const transaction = await sequelize.transaction();
  if (playerIds) {
    await AggregatedClassStats.destroy({ where, transaction });
  } else {
    await AggregatedClassStats.truncate();
  }
  const stats = (await LogClassStats.findAll({
    where,
    transaction,
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
  })).map(logClassStat => {
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
    return aggregate;
  });

  const [results] = await sequelize.query(query, { transaction });
  results.forEach((row: any) => {
    //Averages
    stats.push({
      count: row.total,
      wins: 0,
      losses: 0,
      className: row.className,
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
    });
    //Standard Deviations
    stats.push({
      count: 0,
      wins: 0,
      losses: 0,
      className: row.className,
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
    });
  });

  await AggregatedClassStats.bulkCreate(stats, { transaction });
  await transaction.commit();
}

export async function fetch() {
  return await AggregatedClassStats.findAll();
}