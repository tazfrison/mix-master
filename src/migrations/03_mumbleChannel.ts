import { DataTypes, QueryInterface } from 'sequelize';

async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.createTable('MumbleChannel', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    tags: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
}

async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('MumbleChannel');
}

module.exports = { up, down };