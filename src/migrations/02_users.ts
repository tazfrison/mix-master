import { DataTypes, QueryInterface } from 'sequelize';

async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.createTable('Users', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    voiceAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: {
          tableName: 'VoiceAccounts'
        },
        key: 'id'
      }
    },
    ipCheckId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: {
          tableName: 'IPChecks'
        },
        key: 'id'
      }
    }
  });

  await queryInterface.addColumn('Players', 'coach', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
}

async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('Users');
  await queryInterface.removeColumn('Players', 'coach');
  await queryInterface.removeColumn('VoiceAccounts', 'playerId');
}

module.exports = { up, down };