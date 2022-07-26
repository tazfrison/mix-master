import { FLOAT, STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { LogJson } from '../types';
import Log from './Log';
import LogPlayer from './LogPlayer';
import Player from './Player';

@Table({
  timestamps: false,
})
export default class LogMedicStats extends Model {
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
  deaths: number;

  @Column
  damageTaken: number;

  @Column
  playtime: number;

  @Column
  ubers: number;

  @Column
  drops: number;

  @Column
  heals: number;

  @Column(FLOAT)
  buildTime: number;

  @Column(STRING)
  set uberStats(value: { [type: string]: number }) {
    this.setDataValue('uberStats', JSON.stringify(value));
  };
  get uberStats(): { [type: string]: number } {
    return JSON.parse(this.getDataValue('uberStats'));
  }

  @Column(STRING)
  set medicStats(value: LogJson.MedicStats) {
    this.setDataValue('medicStats', JSON.stringify(value));
  };
  get medicStats(): LogJson.MedicStats {
    return JSON.parse(this.getDataValue('medicStats'));
  }
}
