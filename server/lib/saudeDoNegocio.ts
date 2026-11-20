/**
 * A SAÚDE DO NEGÓCIO — o que `GET /api/ops/saude` responde e o que o vigia agendado (`saude-do-negocio.yml`) olha de
 * hora em hora. Responde à pergunta "algo que importa quebrou sem o usuário ter reclamado?", com as checagens que o
 * servidor sabe fazer sozinho (as de fora, como a idade do backup, o próprio workflow faz):
 *
 *  - `cobranca_pendente`: evento do Asaas `nao-aplicado` (o pagamento chegou e o plano NÃO foi concedido). Não some
 *    sozinho: alguém tem de reaplicar em Admin › Cobrança;
 *  - `jobs`: cron que não termina há tempo demais (a linha `g:fim:<job>` de `travas`, gravada por `executar.ts`);
 *  - `orcamento_ia`: o orçamento mensal ou do dia perto do fim (a 100% a nuvem fecha para todos).
 *
 * `avaliarJobs` é pura (relógio, jobs e marcas entram por parâmetro) para o teste cobrir os limites.
 */
import { sql } from 'drizzle-orm'

import { db, linhas } from '../db/db'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { PREFIXO_DO_FIM } from '../jobs/executar'
import { type Job, JOBS } from '../jobs/registro'
import { estadoDoOrcamento } from './orcamentoDeIa'

export interface Checagem {
  nome: string
  ok: boolean
  detalhe: string
}

export interface Saude {
  ok: boolean
  em: string
  checagens: Checagem[]
}

const HORA = 3_600_000
const horas = (ms: number) => `${Math.round((ms / HORA) * 10) / 10} h`
/** Quanto um job pode ficar sem terminar antes de a checagem ficar vermelha: 1,5 ciclo + 2 h de folga. */
export const limiteDoJob = (j: Job): number => j.node.intervaloMs * 1.5 + 2 * HORA

/**
 * Cada job que está LIGADO neste ambiente tem de ter terminado dentro do limite. Sem marca ainda: verde enquanto a
 * vigilância é nova (`desde`), vermelho depois do limite — o job nunca terminou.
 */
export function avaliarJobs(
  jobs: readonly Job[],
  env: NodeJS.ProcessEnv,
  fins: ReadonlyMap<string, number>,
  desde: number | null,
  agora: number,
): Checagem[] {
  const ligados = jobs.filter((j) => !j.condicao || j.condicao(env))
  return ligados.map((j) => {
    const limite = limiteDoJob(j)
    const fim = fins.get(j.nome)
    if (fim !== undefined) {
      const idade = agora - fim
      return {
        nome: `job:${j.nome}`,
        ok: idade <= limite,
        detalhe: `terminou há ${horas(idade)} (limite ${horas(limite)})`,
      }
    }
    const vigiadoHa = desde === null ? 0 : agora - desde
    const vencido = vigiadoHa > limite
    return {
      nome: `job:${j.nome}`,
      ok: !vencido,
      detalhe: vencido
        ? `nunca terminou em ${horas(vigiadoHa)} de vigilância (limite ${horas(limite)})`
        : 'ainda sem registro (vigilância recente)',
    }
  })
}

/** Lê as marcas de fim dos jobs e a data em que a vigilância começou (gravada na primeira chamada). */
async function lerMarcas(agora: number): Promise<{ fins: Map<string, number>; desde: number }> {
  await db.execute(
    sql`INSERT INTO travas (chave, criado_em) VALUES ('g:saude:desde', ${agora}) ON CONFLICT (chave) DO NOTHING`,
  )
  const r = linhas(
    await db.execute(
      sql`SELECT chave, criado_em FROM travas WHERE chave LIKE ${`${PREFIXO_DO_FIM}%`} OR chave = 'g:saude:desde'`,
    ),
  )
  const fins = new Map<string, number>()
  let desde = agora
  for (const l of r as Array<{ chave: string; criado_em: number | string }>) {
    const t = Number(l.criado_em)
    if (l.chave === 'g:saude:desde') desde = t
    else fins.set(l.chave.slice(PREFIXO_DO_FIM.length), t)
  }
  return { fins, desde }
}

export async function coletarSaude(env: NodeJS.ProcessEnv = process.env, agora = Date.now()): Promise<Saude> {
  const checagens: Checagem[] = []

  const pendentes = await billingEventsRepo.listarPendentes()
  checagens.push({
    nome: 'cobranca_pendente',
    ok: pendentes.length === 0,
    detalhe:
      pendentes.length === 0
        ? 'nenhum evento do Asaas sem efeito'
        : `${pendentes.length} evento(s) do Asaas não aplicado(s): reaplique em Admin › Cobrança`,
  })

  /* O staging não tem cron (`wrangler.jsonc`): a checagem dos jobs só vale onde eles rodam. */
  if (env.ASAAS_SANDBOX === '1') {
    checagens.push({ nome: 'jobs', ok: true, detalhe: 'este ambiente não tem cron' })
  } else {
    const { fins, desde } = await lerMarcas(agora)
    checagens.push(...avaliarJobs(JOBS, env, fins, desde, agora))
  }

  const o = await estadoDoOrcamento()
  const pct = Math.max(o.percentual ?? 0, o.dia.percentual ?? 0)
  checagens.push({
    nome: 'orcamento_ia',
    ok: pct < 90 && o.esgotadoEm === null && o.dia.esgotadoEm === null,
    detalhe: `mês ${o.percentual ?? '—'}% e dia ${o.dia.percentual ?? '—'}% do teto`,
  })

  return { ok: checagens.every((c) => c.ok), em: new Date(agora).toISOString(), checagens }
}
