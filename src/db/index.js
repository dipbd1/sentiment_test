import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { initPost } from './models/post.js';
import { initRefreshToken } from './models/refreshToken.js';
import { initUser } from './models/user.js';

const storage = process.env.DATABASE_PATH || './data/app.db';

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
  timezone: '+00:00',
  pool: {
    max: 1,
    min: 0,
    idle: 10000,
  },
});

export const User = initUser(sequelize);
export const RefreshToken = initRefreshToken(sequelize);
export const Post = initPost(sequelize);

User.hasMany(RefreshToken, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});
RefreshToken.belongsTo(User, {
  foreignKey: { name: 'userId', allowNull: false },
  onDelete: 'CASCADE',
});

User.hasMany(Post, {
  foreignKey: { name: 'authorId', allowNull: false },
  onDelete: 'CASCADE',
});
Post.belongsTo(User, {
  as: 'author',
  foreignKey: { name: 'authorId', allowNull: false },
  onDelete: 'CASCADE',
});

export async function syncDatabase() {
  if (storage !== ':memory:') {
    await mkdir(path.dirname(storage), { recursive: true });
  }
  await sequelize.authenticate();
  await sequelize.query('PRAGMA foreign_keys = ON');
  await sequelize.sync();
}

export async function closeDatabase() {
  await sequelize.close();
}
