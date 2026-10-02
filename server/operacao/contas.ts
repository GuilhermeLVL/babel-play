/**
 * `operacao.cjs conta …` — papel e plano de uma conta pela CLI de operação.
 *
 *   node dist-server/operacao.cjs conta listar
 *   node dist-server/operacao.cjs conta papel <e-mail-ou-id> <admin|support|user>
 *   node dist-server/operacao.cjs conta plano <e-mail-ou-id> <free|premium>
 *
 * POR QUE EXISTE: O PRIMEIRO ADMIN. `PATCH /api/admin/users/:id` exige um admin, e nenhuma porta
 * criava o primeiro — só um `UPDATE` à mão no SQLite de produção. A CLI roda dentro da máquina
 * (`fly ssh console`), que é exatamente o nível de acesso de quem já podia fazer o `UPDATE`; ela só
 * tira o SQL solto do caminho e põe as mesmas travas da rota admin no lugar.
 *
 * SÓ CONTA EXISTENTE, como na rota: `usersRepo.setRole` chama `ensure`, e sem a conferência antes
 * um id digitado errado criaria uma conta-fantasma já com `admin` (pré-provisionamento de
 * privilégio). Quem nunca entrou no app não tem linha em `users` — entre uma vez e rode de novo.
 *
 * E-MAIL OU ID. O id (o `sub` do Supabase) sempre funciona. O e-mail é conveniência: `users.email`
 * quase sempre é NULL (o `ensure` do primeiro acesso não o recebe), então o que o banco não tem é
 * perguntado à Admin API do Supabase — a mesma de `aal.ts` e da limpeza de convidados, com
 * `SUPABASE_SERVICE_ROLE_KEY`. A comparação do e-mail é EXATA (sem caixa) e feita aqui: o `filter`
 * da API casa por pedaço, e "ana@x.com" não pode promover "ana@x.com.br".
 *
 * O servidor em execução é OUTRO processo, mas o papel é lido do banco a cada requisição
 * (`server/lib/rbac.ts`): a mudança vale na hora, sem reinício.
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { sql } from 'drizzle-orm'

import { normalizarPlano, PLANOS_DE_ASSINATURA } from '../../src/core/planos'
import { db } from '../db/db'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { type Role, usersRepo } from '../db/repositories/users'
import { users } from '../db/schema'
import { asUserId, type UserId } from '../lib/authContext'
import { adminDoSupabase } from '../lib/config'

type Saida = { out: (linha: string) => void; err: (linha: string) => void }

export interface DependenciasDeContas {
  /** Injetável (testes). */
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
}

const PAPEIS: readonly Role[] = ['admin', 'support', 'user']

export const USO_DE_CONTAS = `uso: operacao.cjs conta listar | papel <e-mail-ou-id> <${PAPEIS.join('|')}> | plano <e-mail-ou-id> <${PLANOS_DE_ASSINATURA.join('|')}>`

/** Falha de operação (sai com 1), com a frase pronta para quem roda. */
class ErroDeConta extends Error {}

const POR_PAGINA = 200
/** 50 páginas × 200 = 10 mil usuários no pior caso (API sem `filter`); acima disso, peça o id. */
const MAX_PAGINAS = 50
const TEMPO_MAXIMO_MS = 10_000

/** O id da conta com esse e-mail no Supabase, ou `null`. Comparação exata, sem caixa. */
async function idPeloSupabase(
  email: string,
  admin: { base: string; chave: string },
  f: typeof fetch,
): Promise<string | null> {
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const q = new URLSearchParams({ page: String(pagina), per_page: String(POR_PAGINA), filter: email })
    const r = await f(`${admin.base}/auth/v1/admin/users?${q.toString()}`, {
      headers: { apikey: admin.chave, authorization: `Bearer ${admin.chave}` },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    })
    if (!r.ok) throw new ErroDeConta(`a Admin API do Supabase respondeu ${r.status}; informe o id da conta`)
    const corpo = (await r.json()) as { users?: Array<{ id?: unknown; email?: unknown }> }
    const lista = Array.isArray(corpo.users) ? corpo.users : []
    const achado = lista.find((u) => typeof u.email === 'string' && u.email.toLowerCase() === email)
    if (achado && typeof achado.id === 'string') return achado.id
    if (lista.length < POR_PAGINA) return null
  }
  throw new ErroDeConta(`e-mail não encontrado nas primeiras ${MAX_PAGINAS * POR_PAGINA} contas; informe o id`)
}

/** A conta EXISTENTE que o argumento aponta. Lança `ErroDeConta` quando não há. */
async function localizar(alvo: string, deps: DependenciasDeContas): Promise<UserId> {
  if (!alvo.includes('@')) {
    const id = asUserId(alvo)
    if (!(await usersRepo.get(id))) {
      throw new ErroDeConta(`conta não encontrada: ${alvo}. Só existe aqui quem já entrou no app (veja "conta listar")`)
    }
    return id
  }

  const email = alvo.trim().toLowerCase()
  const locais = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(2)
  if (locais.length > 1) throw new ErroDeConta('mais de uma conta com esse e-mail no banco; informe o id')
  if (locais.length === 1) return asUserId(locais[0].id)

  const admin = adminDoSupabase(deps.env ?? process.env)
  if (!admin) {
    throw new ErroDeConta(
      'o banco não guarda esse e-mail e SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não estão configuradas: informe o id da conta (painel do Supabase → Authentication → Users, ou "conta listar")',
    )
  }
  const sub = await idPeloSupabase(email, admin, deps.fetch ?? fetch)
  if (!sub) throw new ErroDeConta('nenhuma conta com esse e-mail no Supabase')
  const id = asUserId(sub)
  if (!(await usersRepo.get(id))) {
    throw new ErroDeConta(
      `a conta ${sub} existe no Supabase mas ainda não entrou no app: entre uma vez com ela e rode de novo`,
    )
  }
  return id
}

/** O plano como o operador lê: o nome atual, e o estado quando não é `active`. */
async function planoDe(id: UserId): Promise<string> {
  const s = await subscriptionsRepo.getActive(id)
  if (!s) return 'free'
  const plano = normalizarPlano(s.plan) ?? s.plan
  return s.status === 'active' ? plano : `${plano} (${s.status})`
}

/** Executa `conta <sub> …`. Devolve o código de saída (0 ok, 1 falha, 2 uso errado). */
export async function comandoDeContas(
  args: string[],
  saida: Saida = { out: console.log, err: console.error },
  deps: DependenciasDeContas = {},
): Promise<number> {
  const [sub, alvo, valor] = args
  try {
    if (sub === 'listar') {
      const todas = await usersRepo.list(100_000)
      saida.out(`${'id'.padEnd(36)}  ${'papel'.padEnd(7)}  ${'status'.padEnd(9)}  plano`)
      for (const u of todas) {
        saida.out(`${u.id.padEnd(36)}  ${u.role.padEnd(7)}  ${u.status.padEnd(9)}  ${await planoDe(asUserId(u.id))}`)
      }
      saida.out(`${todas.length} conta(s)`)
      return 0
    }

    if (sub === 'papel' && alvo && valor) {
      if (!(PAPEIS as readonly string[]).includes(valor)) {
        saida.err(`papel inválido: ${valor} (use ${PAPEIS.join(', ')})`)
        return 2
      }
      const papel = valor as Role
      const id = await localizar(alvo, deps)
      const antes = await usersRepo.getRole(id)
      await usersRepo.setRole(id, papel)
      saida.out(`papel de ${id}: ${antes} → ${papel}`)
      if (antes === 'admin' && papel !== 'admin') {
        const restam = (await usersRepo.list(100_000)).filter((u) => u.role === 'admin').length
        if (restam === 0) {
          saida.err('atenção: nenhum admin restou. As rotas /api/admin ficam sem dono até outra conta ser promovida')
        }
      }
      return 0
    }

    if (sub === 'plano' && alvo && valor) {
      const plano = normalizarPlano(valor)
      if (!plano) {
        saida.err(`plano inválido: ${valor} (use ${PLANOS_DE_ASSINATURA.join(', ')})`)
        return 2
      }
      const id = await localizar(alvo, deps)
      const antes = await planoDe(id)
      // O mesmo efeito de `PATCH /api/admin/users/:id/plan`: concessão do operador, sem cobrança.
      const s = await subscriptionsRepo.upsert(id, { plan: plano, status: 'active' })
      saida.out(`plano de ${id}: ${antes} → ${s.plan} (${s.status})`)
      return 0
    }
  } catch (err) {
    if (err instanceof ErroDeConta) {
      saida.err(err.message)
      return 1
    }
    throw err
  }
  saida.err(USO_DE_CONTAS)
  return 2
}
