import { Column, Model, Table } from 'sequelize-typescript';

@Table
export default class IPCheck extends Model {
  @Column
  ip: string;

  @Column
  validated?: boolean
}
