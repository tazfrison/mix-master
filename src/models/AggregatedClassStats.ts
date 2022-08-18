import { FLOAT } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Scopes, Table } from 'sequelize-typescript';
import { CLASSES } from '../types';
import Player from './Player';

@Scopes(() => ({
  globals: { where: { playerId: null } }
}))

@Table
export default class AggregatedClassStats extends Model {
  @ForeignKey(() => Player)
  playerId?: number;

  @BelongsTo(() => Player)
  player?: Player;

  @Column
  count: number;

  @Column
  wins: number;

  @Column
  losses: number;

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
}
