import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import LogClassStats from './models/LogClassStats';
import { sequelize } from './Data';

export async function generate_old() {
  return LogClassStats.findAll({
    where: { className: { [Op.not]: null } },
    group: ['className'],
    attributes: ['className',
      [Sequelize.fn('count', Sequelize.col('className')), 'total'],
      [Sequelize.fn('sum', Sequelize.col('kills')), 'kills'],
      [Sequelize.fn('sum', Sequelize.col('assists')), 'assists'],
      [Sequelize.fn('sum', Sequelize.col('deaths')), 'deaths'],
      [Sequelize.fn('sum', Sequelize.col('damage')), 'damage'],
      [Sequelize.fn('sum', Sequelize.col('playtime')), 'playtime'],
    ],
  });
}

export async function generate() {
  const [results] = await sequelize.query(`SELECT
  lcs.className,
  SUM((lcs.ka_d - avg.ka_d) * (lcs.ka_d - avg.ka_d)) / (avg.total - 1) as ka_d_sd,
  SUM((lcs.k_d - avg.k_d) * (lcs.k_d - avg.k_d)) / (avg.total - 1) as k_d_sd,
  SUM((lcs.k_m - avg.k_m) * (lcs.k_m - avg.k_m)) / (avg.total - 1) as k_m_sd,
  SUM((lcs.a_m - avg.a_m) * (lcs.a_m - avg.a_m)) / (avg.total - 1) as a_m_sd,
  SUM((lcs.de_m - avg.de_m) * (lcs.de_m - avg.de_m)) / (avg.total - 1) as de_m_sd,
  SUM((lcs.da_m - avg.da_m) * (lcs.da_m - avg.da_m)) / (avg.total - 1) as da_m_sd,
  avg.total AS total,
  avg.playtime AS playtime,
  avg.ka_d AS ka_d,
  avg.k_d AS k_d,
  avg.k_m AS k_m,
  avg.a_m AS a_m,
  avg.de_m AS de_m,
  avg.da_m AS da_m
from LogClassStats as lcs,
  (
    SELECT className,
      COUNT(className) as total,
      SUM(playtime) as playtime,
      AVG(ka_d) AS ka_d,
      AVG(k_d) AS k_d,
      AVG(k_m) AS k_m,
      AVG(a_m) AS a_m,
      AVG(de_m) AS de_m,
      AVG(da_m) AS da_m
    FROM LogClassStats
    group by className
  ) AS avg
where lcs.className = avg.className
group by avg.className;`);
  return results.map((row: any) => {
    Object.keys(row).forEach(key => {
      if (key.slice(-3) === '_sd') {
        row[key] = Math.sqrt(row[key]);
      }
    });
    return row;
  });
}
