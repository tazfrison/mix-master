import { STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, HasMany, HasOne, Model, Table } from 'sequelize-typescript';
import { LogJson, TEAMS } from '../types';
import Log from './Log';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import Player from './Player';

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

  @HasMany(() => LogClassStats, {
    onDelete: 'CASCADE',
  })
  logClassStats?: LogClassStats[];

  @HasOne(() => LogMedicStats, {
    onDelete: 'CASCADE',
  })
  logMedicStats?: LogMedicStats;
}
