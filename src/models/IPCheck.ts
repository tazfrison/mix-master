import { Column, Model, Table } from 'sequelize-typescript';
import { VIRTUAL } from 'sequelize';

const EXPIRATION = 6 * 60 * 60 * 1000; //6 Hours

@Table
export default class IPCheck extends Model {
  @Column
  ip: string;

  @Column
  validated?: boolean

  @Column(VIRTUAL)
  get expired() {
    const expiration = (new Date(this.getDataValue('updatedAt'))).getTime() + EXPIRATION;
    return expiration < (new Date()).getTime();
  }
}
