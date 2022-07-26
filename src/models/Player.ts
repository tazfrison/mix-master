import { Column, Default, HasMany, Model, Table } from 'sequelize-typescript';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import LogPlayer from './LogPlayer';

@Table({
  timestamps: false,
})
export default class Player extends Model {
  @Column
  steamId: string;

  @Column
  name: string;

  @Column
  avatar?: string;

  @Default(false)
  @Column
  admin: boolean;

  @HasMany(() => LogPlayer)
  logPlayers?: LogPlayer[];

  @HasMany(() => LogClassStats)
  logClassStats?: LogClassStats[];

  @HasMany(() => LogMedicStats)
  logMedicStats?: LogMedicStats[];
}
