import type { Request, Response, NextFunction } from 'express'
import { usersRepo, type Role } from '../db/repositories/users'

/**
 * Gate de RBAC (SaaS Fatia 2) — a PORTA dos endpoints ADMIN cross-tenant. Lê o `role` NO SERVIDOR
 * (`usersRepo`, fonte da verdade), nunca do cliente. FAIL-CLOSED: papel não permitido → 403; erro ao
 * ler o papel → 500 (nega o acesso, nunca passa direto).
 *
 * Importante: own-data NÃO passa por aqui — já é garantido pelo scoping por `UserId` dos repositórios
 * (Marco 1), onde um usuário só consegue passar o PRÓPRIO id. Isto gateia só o acesso a dado de OUTRO
 * dono (endpoints admin que recebem um `targetUserId`).
 */
export function requireRole(...allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let role: Role
    try {
      role = await usersRepo.getRole(req.userId)
    } catch {
      res.status(500).json({ error: 'falha ao verificar permissão' }) // fail-closed: nega
      return
    }
    if (!allowed.includes(role)) {
      res.status(403).json({ error: 'acesso restrito', requiredRole: allowed })
      return
    }
    next()
  }
}
