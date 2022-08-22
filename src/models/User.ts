import { AfterCreate, AfterUpdate, BelongsTo, Column, DefaultScope, ForeignKey, Model, Table } from 'sequelize-typescript';
import data from '../Data';
import IPCheck from './IPCheck';
import Player from './Player';
import VoiceAccount from './VoiceAccount';

@DefaultScope(() => ({
  include: [Player, VoiceAccount, IPCheck],
}))

@Table
export default class User extends Model {
  @ForeignKey(() => Player)
  playerId?: number;

  @BelongsTo(() => Player)
  player?: Player;

  @ForeignKey(() => VoiceAccount)
  voiceAccountId?: number;

  @BelongsTo(() => VoiceAccount)
  voiceAccount?: VoiceAccount;

  @ForeignKey(() => IPCheck)
  ipCheckId?: number;

  @BelongsTo(() => IPCheck)
  ipCheck?: IPCheck;

  @Column
  name: string;

  @AfterCreate
  @AfterUpdate
  static async sendAlert(instance: User) {
    const user = await instance.reload();
    data().send('update', { type: 'User', data: user, admin: true });
  }
}
