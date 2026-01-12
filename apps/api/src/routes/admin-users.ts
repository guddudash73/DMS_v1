import { Router } from 'express';
import bcrypt from 'bcrypt';
import { validate } from '../middlewares/zod';
import {
  AdminCreateUserRequest,
  AdminUpdateUserRequest,
  AdminResetUserPasswordRequest,
} from '@dms/types';
import type { AdminUserListItem, Role } from '@dms/types';
import { userRepository } from '../repositories/userRepository';
import { logAudit } from '../lib/logger';
import { requireRole } from '../middlewares/auth'; // ✅ ADD

const r = Router();

r.use(requireRole('ADMIN'));

const SAFE_ROLES: Role[] = ['RECEPTION', 'VIEWER', 'ADMIN'];

r.get('/', async (req, res, next) => {
  try {
    const query = String(req.query.query ?? '')
      .trim()
      .toLowerCase();
    const role = String(req.query.role ?? '').trim() as Role | '';
    const activeStr = String(req.query.active ?? '').trim();
    const active = activeStr === 'true' ? true : activeStr === 'false' ? false : undefined;

    const users = await userRepository.listUsers();

    let items = users.map<AdminUserListItem>((u) => ({
      userId: u.userId,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      active: u.active ?? true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    if (query) {
      items = items.filter(
        (u) => u.email.toLowerCase().includes(query) || u.displayName.toLowerCase().includes(query),
      );
    }
    if (role) items = items.filter((u) => u.role === role);
    if (typeof active === 'boolean') items = items.filter((u) => u.active === active);

    items.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));

    return res.status(200).json({ items });
  } catch (err) {
    return next(err);
  }
});

r.post('/', validate(AdminCreateUserRequest), async (req, res, next) => {
  try {
    const input = req.body as AdminCreateUserRequest;

    if (input.role === 'DOCTOR') {
      return res.status(400).json({
        error: 'INVALID_ROLE',
        message: 'Use admin-doctors to create doctors',
        traceId: req.requestId,
      });
    }

    if (!SAFE_ROLES.includes(input.role)) {
      return res.status(400).json({
        error: 'INVALID_ROLE',
        message: 'Role not allowed',
        traceId: req.requestId,
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const created = await userRepository.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      role: input.role,
      active: input.active ?? true,
    });

    const result: AdminUserListItem = {
      userId: created.userId,
      email: created.email,
      displayName: created.displayName,
      role: created.role,
      active: created.active ?? true,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_CREATE_USER',
        entity: { type: 'USER', id: created.userId },
        meta: { email: created.email, role: created.role, active: created.active },
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
});

r.patch('/:userId', validate(AdminUpdateUserRequest), async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        error: 'INVALID_USER_ID',
        message: 'User id is required',
        traceId: req.requestId,
      });
    }

    const body = req.body as AdminUpdateUserRequest;

    if (body.role === 'DOCTOR') {
      return res.status(400).json({
        error: 'INVALID_ROLE',
        message: 'Use admin-doctors to manage doctors',
        traceId: req.requestId,
      });
    }

    const updated = await userRepository.updateUser(userId, {
      displayName: body.displayName,
      role: body.role,
      active: body.active,
    });

    if (!updated) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
        traceId: req.requestId,
      });
    }

    const result: AdminUserListItem = {
      userId: updated.userId,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      active: updated.active ?? true,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_UPDATE_USER',
        entity: { type: 'USER', id: userId },
        meta: { patch: body },
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

r.post(
  '/:userId/reset-password',
  validate(AdminResetUserPasswordRequest),
  async (req, res, next) => {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return res.status(400).json({
          error: 'INVALID_USER_ID',
          message: 'User id is required',
          traceId: req.requestId,
        });
      }

      if (req.auth?.userId === userId) {
        return res.status(400).json({
          error: 'CANNOT_RESET_SELF',
          message: 'You cannot reset your own password from this screen.',
          traceId: req.requestId,
        });
      }

      const body = req.body as AdminResetUserPasswordRequest;
      const passwordHash = await bcrypt.hash(body.password, 10);

      const updated = await userRepository.setUserPassword(userId, passwordHash);
      if (!updated) {
        return res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'User not found',
          traceId: req.requestId,
        });
      }

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'ADMIN_RESET_USER_PASSWORD',
          entity: { type: 'USER', id: userId },
          meta: { targetEmail: updated.email },
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  },
);

r.delete('/:userId', async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        error: 'INVALID_USER_ID',
        message: 'User id is required',
        traceId: req.requestId,
      });
    }

    if (req.auth?.userId === userId) {
      return res.status(400).json({
        error: 'CANNOT_DELETE_SELF',
        message: 'You cannot delete your own account',
        traceId: req.requestId,
      });
    }

    await userRepository.deleteUser(userId);

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_DELETE_USER',
        entity: { type: 'USER', id: userId },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default r;
