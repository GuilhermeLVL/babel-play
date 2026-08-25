/**
 * Rotas ADMIN (montadas em `/api/admin`, atrás do authMiddleware). Superfície cross-tenant — cada
 * rota é gateada por `requireRole`. Leitura: admin E support. Escrita: só admin. Esta é a ÚNICA porta
 * de acesso a dado de OUTRO dono; os repositórios normais seguem escopados por `UserId` do request.
 */
import { Router } from 'express'
import { z } from 'zod'
import { usersRepo } from '../db/repositories/users'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { requireRole } from '../lib/rbac'
import { asUserId } from '../lib/authContext'
import { idParamSchema, parseOr400 } from '../validation'

export const adminRouter = Router()

// ── Leitura (admin + support) ────────────────────────────────────────────────
adminRouter.get('/users', requireRole('admin', 'support'), async (_req, res) => {
  res.json(await usersRepo.list())
})

adminRouter.get('/users/:id', requireRole('admin', 'support'), async (req, res) => {
  // F11-04: `asUserId` é um cast de marca, não uma validação — o formato nunca era conferido.
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const target = asUserId(p.id)
  const user = await usersRepo.get(target)
  if (!user) { res.status(404).json({ error: 'usuário não encontrado' }); return }
  res.json({ user, subscription: await subscriptionsRepo.getActive(target) })
})

// ── Escrita (só admin) ───────────────────────────────────────────────────────
const patchSchema = z.object({
  role: z.enum(['user', 'admin', 'support']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).strip()

adminRouter.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body ?? {})
  if (!parsed.success || (parsed.data.role === undefined && parsed.data.status === undefined)) {
    res.status(400).json({ error: 'informe role e/ou status válidos' }); return
  }
  const target = asUserId(req.params.id)
  // Gere só contas EXISTENTES: sem isto, `ensure`/`setRole` criariam uma conta-fantasma e poderiam
  // pré-atribuir 'admin' a um `sub` que nem se cadastrou (pré-provisionamento de privilégio).
  if (!(await usersRepo.get(target))) { res.status(404).json({ error: 'usuário não encontrado' }); return }
  // Anti-self-lockout: o admin não remove o PRÓPRIO acesso (evita se trancar para fora).
  if (target === req.userId && (parsed.data.status === 'suspended' || parsed.data.role === 'user' || parsed.data.role === 'support')) {
    res.status(400).json({ error: 'não é possível remover o próprio acesso de admin' }); return
  }
  if (parsed.data.role) await usersRepo.setRole(target, parsed.data.role)
  if (parsed.data.status) await usersRepo.setStatus(target, parsed.data.status)
  res.json(await usersRepo.get(target))
})

const planSchema = z.object({ plan: z.enum(['free', 'pro', 'selfhost']) }).strip()

adminRouter.patch('/users/:id/plan', requireRole('admin'), async (req, res) => {
  const parsed = planSchema.safeParse(req.body ?? {})
  if (!parsed.success) { res.status(400).json({ error: 'plan inválido' }); return }
  const target = asUserId(req.params.id)
  if (!(await usersRepo.get(target))) { res.status(404).json({ error: 'usuário não encontrado' }); return }
  res.json(await subscriptionsRepo.upsert(target, { plan: parsed.data.plan, status: 'active' }))
})
