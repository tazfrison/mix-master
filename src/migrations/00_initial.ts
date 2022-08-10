import { DataTypes, QueryInterface } from 'sequelize';

async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.createTable('Logs', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    map: {
      type: DataTypes.STRING,
      allowNull: false
    },
    upload: {
      type: DataTypes.DATE,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bluScore: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    redScore: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    winner: {
      type: DataTypes.STRING
    },
    teamStats: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });

  await queryInterface.createTable('Players', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    steamId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    avatar: {
      type: DataTypes.STRING
    },
    admin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  });

  await queryInterface.createTable('IPChecks', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: false
    },
    validated: {
      type: DataTypes.BOOLEAN
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });

  await queryInterface.createTable('VoiceAccounts', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    tags: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });

  await queryInterface.createTable('Rounds', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    logId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Logs'
        },
        key: 'id'
      }
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    duration: {
      type: DataTypes.NUMBER,
      allowNull: false
    },
    winner: {
      type: DataTypes.STRING
    },
    firstCap: {
      type: DataTypes.STRING
    },
    teamStats: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });

  await queryInterface.createTable('LogPlayers', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    logId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Logs'
        },
        key: 'id'
      }
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    kills: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    assists: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    deaths: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    damage: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    damageTaken: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playtime: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    team: {
      type: DataTypes.STRING,
      allowNull: false
    },
    healthPacks: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    airshots: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    captures: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rawStats: {
      type: DataTypes.STRING,
      allowNull: false
    },
  });

  await queryInterface.createTable('LogClassStats', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    logId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Logs'
        },
        key: 'id'
      }
    },
    logPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'LogPlayers'
        },
        key: 'id'
      }
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    className: {
      type: DataTypes.STRING,
      allowNull: false
    },
    kills: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    assists: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    deaths: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    damage: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playtime: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ka_d: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    k_d: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    k_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    a_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    de_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    da_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    weaponStats: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });

  await queryInterface.createTable('AggregatedClassStats', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    count: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    wins: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    losses: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    className: {
      type: DataTypes.STRING,
      allowNull: false
    },
    kills: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    assists: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    deaths: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    damage: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playtime: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ka_d: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    k_d: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    k_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    a_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    de_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    da_m: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });

  await queryInterface.createTable('LogMedicStats', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    logId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Logs'
        },
        key: 'id'
      }
    },
    logPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'LogPlayers'
        },
        key: 'id'
      }
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: {
          tableName: 'Players'
        },
        key: 'id'
      }
    },
    deaths: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    damageTaken: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playtime: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ubers: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    drops: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    heals: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    buildTime: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    uberStats: {
      type: DataTypes.STRING,
      allowNull: false
    },
    medicStats: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
}

async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.dropTable('Logs');
  await queryInterface.dropTable('Players');
  await queryInterface.dropTable('IPChecks');
  await queryInterface.dropTable('VoiceAccounts');
  await queryInterface.dropTable('Rounds');
  await queryInterface.dropTable('LogPlayers');
  await queryInterface.dropTable('LogClassStats');
  await queryInterface.dropTable('AggregatedClassStats');
  await queryInterface.dropTable('LogMedicStats');
}

module.exports = { up, down };