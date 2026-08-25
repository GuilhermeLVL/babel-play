/**
 * Identidade do request (Marco 1 — multi-tenant, camada de aplicação).
 *
 * `UserId` é um tipo BRANDED: um `string` que só a camada de auth (e os helpers de teste)
 * conseguem cunhar via `asUserId`. Isso força, EM TEMPO DE COMPILAÇÃO, que todo repositório
 * receba a identidade certa — passar um `sessionId`/`cardId` cru no lugar do userId vira erro
 * de tipo. (A garantia é de *entrega*; que o `WHERE` realmente USE o userId é provado pelos
 * testes de vazamento — ver tests/integration/mt1-tenant-*.test.ts.)
 *
 * Sem dependências de runtime de propósito: repos e testes importam daqui sem puxar Express.
 */

export type UserId = string & { readonly __brand: 'UserId' }

/** Único ponto que cunha um UserId. Usado pela auth e por helpers de teste. */
export function asUserId(s: string): UserId {
  return s as UserId
}

/**
 * Dono local. Quando `AUTH_REQUIRED` está desligada (self-host/local), todo request é atribuído
 * a este id — sem token, sem tela de login. Também é o alvo do backfill das linhas legadas
 * (user_id NULL) para que os dados do usuário local atual continuem visíveis (Commit 2).
 */
export const LOCAL_OWNER: UserId = asUserId(process.env.LOCAL_OWNER_ID || 'local-owner')

// Augmentation do Express: todo Request carrega o userId resolvido pelo authMiddleware
// e o requestId de correlação (server/lib/requestId.ts), usado nas linhas de log.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: UserId
      requestId?: string
    }
  }
}
