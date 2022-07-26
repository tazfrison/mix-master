import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import { STRING } from 'sequelize';
import { VOICE } from '../types';
import Player from './Player';

@Table({
  timestamps: false,
})
export default class VoiceAccount extends Model {
  @ForeignKey(() => Player)
  playerId?: number;

  @BelongsTo(() => Player)
  player?: Player;

  @Column
  hash: string;

  @Column
  name: string;

  @Column
  type: VOICE;

  @Column(STRING)
  set tags(value: {[name: string]: string}) {
    this.setDataValue('tags', JSON.stringify(value));
  }

  get tags(): {[name: string]: string} {
    return JSON.parse(this.getDataValue('tags'));
  }
}
