import { STRING } from 'sequelize';
import { Column, Default, DefaultScope, Model, Scopes, Table } from 'sequelize-typescript';
import { TEAMS } from '../types';

@DefaultScope(() => ({
  attributes: { exclude: ['rcon'] }
}))

@Scopes(() => ({
  admin: {}
}))

@Table({
  timestamps: false,
})
export default class Server extends Model {
  @Column
  name: string;

  @Column
  ip: string;

  @Column
  port: number;

  @Column
  password: string;

  @Column
  rcon: string;

  @Default(false)
  @Column
  advancedStats: boolean;

  @Column(STRING)
  set channels(value: { [team in TEAMS]?: number }) {
    this.setDataValue('channels', JSON.stringify(value));
  };
  get channels(): { [team in TEAMS]?: number } {
    return JSON.parse(this.getDataValue('channels'));
  }
}
