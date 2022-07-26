import { FLOAT, STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { CLASSES, LogJson } from '../types';
import Log from './Log';
import LogPlayer from './LogPlayer';
import Player from './Player';

@Table({
  timestamps: false,
})
export default class LogClassStats extends Model {
  @ForeignKey(() => Log)
  logId: number;

  @BelongsTo(() => Log)
  log: Log;

  @ForeignKey(() => LogPlayer)
  logPlayerId: number;

  @BelongsTo(() => LogPlayer)
  logPlayer: LogPlayer;

  @ForeignKey(() => Player)
  playerId: number;

  @BelongsTo(() => Player)
  player: Player;

  @Column
  className: CLASSES;

  @Column
  kills: number;

  @Column
  assists: number;

  @Column
  deaths: number;

  @Column
  damage: number;

  @Column
  playtime: number;

  @Column(FLOAT)
  ka_d: number;

  @Column(FLOAT)
  k_d: number;

  @Column(FLOAT)
  k_m: number;

  @Column(FLOAT)
  a_m: number;

  @Column(FLOAT)
  de_m: number;

  @Column(FLOAT)
  da_m: number;

  @Column(STRING)
  set weaponStats(value: LogJson.ClassWeaponStats) {
    this.setDataValue('weaponStats', JSON.stringify(value));
  };
  get weaponStats(): LogJson.ClassWeaponStats {
    return JSON.parse(this.getDataValue('weaponStats'));
  }
}
