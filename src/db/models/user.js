import { DataTypes } from 'sequelize';

export function initUser(sequelize) {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user',
        validate: {
          isIn: [['user', 'admin']],
        },
      },
    },
    {
      tableName: 'users',
      underscored: true,
      updatedAt: false,
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
    },
  );

  User.addScope(
    'withPassword',
    {
      attributes: ['id', 'email', 'passwordHash', 'role', 'createdAt'],
    },
    { override: true },
  );

  return User;
}
