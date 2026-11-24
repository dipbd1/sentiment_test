import { DataTypes } from 'sequelize';

export function initSupportMessage(sequelize) {
  return sequelize.define(
    'SupportMessage',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['user', 'assistant']],
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      intent: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sentiment: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      language: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'support_messages',
      underscored: true,
      timestamps: true,
    },
  );
}
