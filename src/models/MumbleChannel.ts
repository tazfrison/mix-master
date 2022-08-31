import { STRING } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';

@Table({
  timestamps: false,
})
export default class MumbleChannel extends Model {
  @Column(STRING)
  set tags(value: {[name: string]: string | null}) {
    this.setDataValue('tags', JSON.stringify(value));
  }

  get tags(): {[name: string]: string | null} {
    return JSON.parse(this.getDataValue('tags'));
  }
}
