import { Router } from 'express';
import { z } from 'zod';
import { Post, User } from '../db/index.js';
import { HttpError } from '../lib/httpError.js';
import { formatTimestamp } from '../lib/timestamps.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const postSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  body: z.string().trim().min(1, 'Body is required'),
});

const authorInclude = {
  model: User,
  as: 'author',
  attributes: ['email'],
};

router.use(authenticate);

function serializePost(post) {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    author_id: post.authorId,
    created_at: formatTimestamp(post.createdAt),
    updated_at: formatTimestamp(post.updatedAt),
    author: post.author ? { email: post.author.email } : null,
  };
}

function readPage(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'limit must be a positive integer');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'offset must be a non-negative integer');
  }

  return {
    limit: Math.min(limit, 100),
    offset,
  };
}

function canModify(post, user) {
  return post.authorId === user.id || user.role === 'admin';
}

async function findPost(id) {
  return Post.findByPk(id, {
    include: [authorInclude],
  });
}

router.get('/', async (req, res) => {
  const { limit, offset } = readPage(req.query);
  const posts = await Post.findAll({
    include: [authorInclude],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset,
  });
  res.json(posts.map(serializePost));
});

router.get('/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) {
    throw new HttpError(404, 'NOT_FOUND', 'Post not found');
  }
  res.json(serializePost(post));
});

router.post('/', validate(postSchema), async (req, res) => {
  const created = await Post.create({
    title: req.body.title,
    body: req.body.body,
    authorId: req.user.id,
  });
  const post = await findPost(created.id);
  res.status(201).json(serializePost(post));
});

router.put('/:id', validate(postSchema), async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) {
    throw new HttpError(404, 'NOT_FOUND', 'Post not found');
  }
  if (!canModify(post, req.user)) {
    throw new HttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  await post.update({
    title: req.body.title,
    body: req.body.body,
  });
  res.json(serializePost(post));
});

router.delete('/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) {
    throw new HttpError(404, 'NOT_FOUND', 'Post not found');
  }
  if (!canModify(post, req.user)) {
    throw new HttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  await post.destroy();
  res.status(204).end();
});

export default router;
