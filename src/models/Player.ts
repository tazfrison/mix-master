import { Column, Default, HasMany, Model, Scopes, Table } from 'sequelize-typescript';
import AggregatedClassStats from './AggregatedClassStats';
import Log from './Log';
import LogClassStats from './LogClassStats';
import LogMedicStats from './LogMedicStats';
import LogPlayer from './LogPlayer';

@Scopes(() => ({
  withStats: {
    include: [AggregatedClassStats, {
      model: LogPlayer,
      include: [LogMedicStats, Log, {
        model: LogClassStats,
        separate: true,
        order: [['playtime', 'DESC']],
      }]
    }]
  }
}))

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

  @Default(false)
  @Column
  coach: boolean;

  @HasMany(() => LogPlayer)
  logPlayers?: LogPlayer[];

  @HasMany(() => LogClassStats)
  logClassStats?: LogClassStats[];

  @HasMany(() => AggregatedClassStats)
  aggregatedClassStats?: AggregatedClassStats[];

  @HasMany(() => LogMedicStats)
  logMedicStats?: LogMedicStats[];
}
