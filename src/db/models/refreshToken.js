import { DataTypes } from 'sequelize';

export function initRefreshToken(sequelize) {
  return sequelize.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      tokenHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      replacedByTokenHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'refresh_tokens',
      underscored: true,
      updatedAt: false,
    },
  );
}
