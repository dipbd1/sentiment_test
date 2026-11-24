import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { initPost } from './models/post.js';
import { initRefreshToken } from './models/refreshToken.js';
import { initSupportConversation } from './models/supportConversation.js';
import { initSupportMessage } from './models/supportMessage.js';
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
export const SupportConversation = initSupportConversation(sequelize);
export const SupportMessage = initSupportMessage(sequelize);

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

SupportConversation.hasMany(SupportMessage, {
  foreignKey: { name: 'conversationId', allowNull: false },
  onDelete: 'CASCADE',
});
SupportMessage.belongsTo(SupportConversation, {
  foreignKey: { name: 'conversationId', allowNull: false },
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

export async function loadSupportHistory(customerUserId) {
  const conversation = await SupportConversation.findOne({
    where: { customerUserId },
  });

  if (!conversation) {
    return [];
  }

  const messages = await SupportMessage.findAll({
    where: { conversationId: conversation.id },
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
    attributes: ['role', 'content'],
  });

  return messages.slice(-10).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

export async function saveSupportExchange({ customerUserId, message, analysis }) {
  const [conversation] = await SupportConversation.findOrCreate({
    where: { customerUserId },
    defaults: { customerUserId },
  });

  const userMessage = await SupportMessage.create({
    conversationId: conversation.id,
    role: 'user',
    content: message,
    intent: null,
    sentiment: null,
    priority: null,
    language: null,
  });

  const assistantMessage = await SupportMessage.create({
    conversationId: conversation.id,
    role: 'assistant',
    content: analysis.response,
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    priority: analysis.priority,
    language: analysis.language,
  });

  return { conversation, userMessage, assistantMessage };
}
