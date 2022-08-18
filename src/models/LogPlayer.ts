import { STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, HasMany, HasOne, Model, Scopes, Table } from 'sequelize-typescript';
import { LogJson, TEAMS } from '../types';
import Log from './Log';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import Player from './Player';
import { Sequelize } from 'sequelize-typescript';

@Scopes(() => ({
  playerCounts: {
    include: [Log],
    group: ['PlayerId'],
    attributes: [
      'PlayerId',
      [Sequelize.fn('COUNT', 'PlayerId'), 'total'],
      [Sequelize.fn('sum', Sequelize.literal('CASE Log.winner WHEN LogPlayer.team THEN 1 ELSE 0 END')), 'wins'],
      [Sequelize.fn('count', Sequelize.literal('Log.winner')), 'nonTies'],
    ]
  }
}))

@Table({
  timestamps: false,
})
export default class LogPlayer extends Model {
  @ForeignKey(() => Log)
  logId: number;

  @BelongsTo(() => Log)
  log: Log;

  @ForeignKey(() => Player)
  playerId: number;

  @BelongsTo(() => Player)
  player: Player;

  @Column
  kills: number;

  @Column
  assists: number;

  @Column
  deaths: number;

  @Column
  damage: number;

  @Column
  damageTaken: number;

  @Column
  playtime: number;

  @Column
  team: TEAMS;

  @Column
  healthPacks: number;

  @Column
  airshots: number;

  @Column
  captures: number;

  @Column(STRING)
  set rawStats(value: LogJson.Player) {
    this.setDataValue('rawStats', JSON.stringify(value));
  };
  get rawStats(): LogJson.Player {
    return JSON.parse(this.getDataValue('rawStats'));
  }

  @HasMany(() => LogClassStats)
  logClassStats?: LogClassStats[];

  @HasOne(() => LogMedicStats)
  logMedicStats?: LogMedicStats;
}
