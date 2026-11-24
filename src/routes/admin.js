import { Router } from 'express';
import { z } from 'zod';
import { User } from '../db/index.js';
import { HttpError } from '../lib/httpError.js';
import { formatTimestamp } from '../lib/timestamps.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const roleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

router.use(authenticate, requireRole('admin'));

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    created_at: formatTimestamp(user.createdAt),
  };
}

router.get('/users', async (req, res) => {
  const users = await User.findAll({
    attributes: ['id', 'email', 'role', 'createdAt'],
    order: [['id', 'ASC']],
  });
  res.json(users.map(serializeUser));
});

router.patch('/users/:id/role', validate(roleSchema), async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'User not found');
  }

  if (user.role === 'admin' && req.body.role === 'user') {
    const adminCount = await User.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Cannot demote the last admin');
    }
  }

  await user.update({ role: req.body.role });
  res.json(serializeUser(user));
});

router.delete('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Cannot delete your own account');
  }

  const user = await User.findByPk(req.params.id);
  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'User not found');
  }

  await user.destroy();
  res.status(204).end();
});

export default router;
