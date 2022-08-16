import { DataTypes, QueryInterface } from 'sequelize';

async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.createTable('Servers', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: false
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    rcon: {
      type: DataTypes.STRING,
      allowNull: false
    },
    advancedStats: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    channels: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
}

async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('Servers');
}

module.exports = { up, down };