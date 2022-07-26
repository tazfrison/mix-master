import { STRING } from 'sequelize';
import { AllowNull, BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { LogJson, TEAMS } from '../types';
import Log from './Log';

@Table({
  timestamps: false,
})
export default class Round extends Model {
  @ForeignKey(() => Log)
  logId: number;

  @BelongsTo(() => Log)
  log: Log;

  @Column
  number: number;

  @Column
  start_time: Date;

  @Column
  duration: number;

  @AllowNull
  @Column
  winner?: TEAMS;

  @AllowNull
  @Column
  firstCap?: TEAMS;

  @Column(STRING)
  set teamStats(value: { [team in TEAMS]: LogJson.RoundTeam }) {
    this.setDataValue('teamStats', JSON.stringify(value));
  };

  get teamStats(): { [team in TEAMS]: LogJson.RoundTeam } {
    return JSON.parse(this.getDataValue('teamStats'));
  }
}
