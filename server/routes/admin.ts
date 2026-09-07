/**
 * Rotas ADMIN (montadas em `/api/admin`, atrás do authMiddleware). Superfície cross-tenant — cada
 * rota é gateada por `requireRole`. Leitura: admin E support. Escrita: só admin. Esta é a ÚNICA porta
 * de acesso a dado de OUTRO dono; os repositórios normais seguem escopados por `UserId` do request.
 */
import { Router } from 'express'
import { z } from 'zod'
import { PLANOS_DE_ASSINATURA, type PlanoDeAssinatura } from '../../src/core/planos'
import { usersRepo } from '../db/repositories/users'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { requireRole } from '../lib/rbac'
import { lerUltimosErros } from '../lib/diarioDeErros'
import { resumoDoDono } from '../db/repositories/resumo'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { aplicarEvento, eventoSchema } from '../lib/billingEventos'
import { asUserId } from '../lib/authContext'
import { idParamSchema, parseOr400 } from '../validation'
import { reconciliarArmazenamento, modoDeReconciliacao } from '../lib/storageQuota'
import { log } from '../lib/logger'

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

const planSchema = z.object({ plan: z.enum(PLANOS_DE_ASSINATURA as unknown as [PlanoDeAssinatura, ...PlanoDeAssinatura[]]) }).strip() // deriva da matriz

adminRouter.patch('/users/:id/plan', requireRole('admin'), async (req, res) => {
  const parsed = planSchema.safeParse(req.body ?? {})
  if (!parsed.success) { res.status(400).json({ error: 'plan inválido' }); return }
  const target = asUserId(req.params.id)
  if (!(await usersRepo.get(target))) { res.status(404).json({ error: 'usuário não encontrado' }); return }
  res.json(await subscriptionsRepo.upsert(target, { plan: parsed.data.plan, status: 'active' }))
})

/**
 * O DIÁRIO DE ERROS, finalmente lido por alguém (E4). Até aqui ele gravava em disco e a leitura era
 * grep manual via SSH — "ninguém é acordado" (diarioDeErros.ts). Inclui os erros do CLIENTE, que
 * entram pelo mesmo funil (`POST /api/erros-do-cliente`).
 */
/**
 * RECONCILIAR ARMAZENAMENTO DE TODO MUNDO — o runner do `STORAGE_RECONCILE_MODE=job`.
 *
 * A varredura (O(n sessões), com `stat`/`HEAD` por arquivo) morava dentro de
 * `GET /api/me/entitlements`, ou seja, era paga pela latência de quem estava usando o app
 * (auditoria de 2026-09-07, achado A33). Com o modo `job` ela sai desse caminho — e precisa de
 * alguém que a chame, senão o modo vira um interruptor de desligar em silêncio. Este é o alguém:
 * um cron do deploy bate aqui.
 *
 * Sequencial de propósito: é trabalho de limpeza, e paralelizar `stat` sobre o mesmo disco só
 * antecipa a contenção que a mudança existe para evitar.
 */
adminRouter.post('/armazenamento/reconciliar', requireRole('admin'), async (_req, res) => {
  const usuarios = await usersRepo.list()
  const porUsuario: Array<{ userId: string; bytes: number }> = []
  for (const u of usuarios) {
    try {
      porUsuario.push({ userId: u.id, bytes: await reconciliarArmazenamento(asUserId(u.id)) })
    } catch (err) {
      log('warn', { event: 'storage_reconcile_job_failed', error: `${u.id}: ${String(err).slice(0, 120)}` })
    }
  }
  res.json({ modo: modoDeReconciliacao(), reconciliados: porUsuario.length, total: usuarios.length, porUsuario })
})

adminRouter.get('/erros', requireRole('admin'), (req, res) => {
  const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 100))
  const { dir, erros } = lerUltimosErros(limite)
  if (dir === null) {
    res.json({ diario: 'desligado (ERROS_DIR=off ou sink não registrado)', erros: [] })
    return
  }
  res.json({ diario: dir, total: erros.length, erros })
})

/** Os números agregados do dono — contagens das tabelas existentes, sem telemetria nova. */
adminRouter.get('/resumo', requireRole('admin'), async (_req, res) => {
  res.json(await resumoDoDono())
})

/**
 * EVENTOS DE COBRANÇA QUE NÃO TIVERAM EFEITO (auditoria de 2026-09-07, A05).
 *
 * O webhook responde 200 mesmo quando não consegue aplicar um pagamento — o Asaas não reentrega
 * um 200, e antes o evento simplesmente sumia num `break`. Agora ele fica `nao-aplicado` com o
 * motivo e o payload guardado, e é daqui que um administrador o vê e o reaplica com a lógica
 * ATUAL (por exemplo, depois de registrar a compra que faltava). Reaplicar é idempotente: evento
 * já `aplicado` responde `repetido` sem efeito.
 */
adminRouter.get('/billing/pendentes', requireRole('admin', 'support'), async (_req, res) => {
  res.json(await billingEventsRepo.listarPendentes())
})

adminRouter.post('/billing/reprocessar/:id', requireRole('admin'), async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const linha = await billingEventsRepo.ler(p.id)
  if (!linha) { res.status(404).json({ error: 'evento não encontrado' }); return }
  if (linha.estado === 'aplicado') { res.json({ ok: true, repetido: true, estado: 'aplicado' }); return }
  if (!linha.payload) { res.status(409).json({ error: 'evento sem payload guardado — anterior ao registro de estado' }); return }

  let ev
  try { ev = eventoSchema.parse(JSON.parse(linha.payload)) } catch {
    res.status(409).json({ error: 'payload guardado fora da forma esperada' }); return
  }
  const r = await aplicarEvento(ev, req.requestId)
  await billingEventsRepo.registrarResultado(linha.id, r.estado, r.motivo)
  res.json({ ok: r.estado === 'aplicado', estado: r.estado, motivo: r.motivo })
})
