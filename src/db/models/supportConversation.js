import { DataTypes } from 'sequelize';

export function initSupportConversation(sequelize) {
  return sequelize.define(
    'SupportConversation',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      customerUserId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: 'support_conversations',
      underscored: true,
      updatedAt: false,
    },
  );
}
