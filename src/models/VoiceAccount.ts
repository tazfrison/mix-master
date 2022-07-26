import { STRING } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';
import { VOICE } from '../types';

@Table({
  timestamps: false,
})
export default class VoiceAccount extends Model {
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
