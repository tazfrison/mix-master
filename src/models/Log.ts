import { STRING } from 'sequelize';
import { Column, HasMany, Model, Table } from 'sequelize-typescript';
import { LogJson, TEAMS } from '../types';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import LogPlayer from './LogPlayer';
import Round from './Round';

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

  @Column(STRING)
  set teamStats(value: { [team in TEAMS]: LogJson.Team }) {
    this.setDataValue('teamStats', JSON.stringify(value));
  };
  get teamStats(): { [team in TEAMS]: LogJson.Team } {
    return JSON.parse(this.getDataValue('teamStats'));
  }

  @HasMany(() => Round, {
    onDelete: 'CASCADE',
  })
  rounds?: Round[];

  @HasMany(() => LogPlayer, {
    onDelete: 'CASCADE',
  })
  players?: LogPlayer[];

  @HasMany(() => LogClassStats, {
    onDelete: 'CASCADE',
  })
  classStats?: LogClassStats[];

  @HasMany(() => LogMedicStats, {
    onDelete: 'CASCADE',
  })
  medicStats?: LogMedicStats[];
}
