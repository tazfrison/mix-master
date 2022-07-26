import { STRING } from 'sequelize';
import { Column, HasMany, Model, Scopes, Table } from 'sequelize-typescript';
import { LogJson, TEAMS } from '../types';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import LogPlayer from './LogPlayer';
import Player from './Player';
import Round from './Round';

@Scopes(() => ({
  full: {
    include: [{
      model: Round,
    }, {
      model: LogPlayer,
      include: [Player, LogMedicStats, {
        model: LogClassStats,
        separate: true,
        order: [['playtime', 'DESC']],
      }],
    }],
  }
}))

@Table({
  timestamps: false,
})
export default class Log extends Model {
  @Column
  title: string;

  @Column
  upload: Date;

  @Column
  map: string;

  @Column
  duration: number;

  @Column
  bluScore: number;

  @Column
  redScore: number;

  @Column
  winner?: TEAMS;

  @Column(STRING)
  set teamStats(value: { [team in TEAMS]: LogJson.Team }) {
    this.setDataValue('teamStats', JSON.stringify(value));
  };
  get teamStats(): { [team in TEAMS]: LogJson.Team } {
    return JSON.parse(this.getDataValue('teamStats'));
  }

  @HasMany(() => Round)
  rounds?: Round[];

  @HasMany(() => LogPlayer)
  players?: LogPlayer[];

  @HasMany(() => LogClassStats)
  classStats?: LogClassStats[];

  @HasMany(() => LogMedicStats)
  medicStats?: LogMedicStats[];
}
