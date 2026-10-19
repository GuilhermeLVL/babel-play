/**
 * TETO DE USO DO R2 (`openspec/changes/r2-teto-de-uso`).
 *
 * A Cloudflare não tem teto de gasto que bloqueie: passado o nível gratuito (10 GB guardados, 1 milhão
 * de operações de classe A e 10 milhões de classe B por mês), ela só manda um e-mail depois. Os tetos
 * daqui são a trava do lado do app, ligada, ajustada e revertida só por variável de ambiente:
 *
 *   - `R2_TETO_MB`: bytes guardados somando a conta inteira (conferido em `reservarArmazenamento`);
 *   - `R2_TETO_OPS_A_MES` / `R2_TETO_OPS_B_MES`: operações por mês (UTC), contadas no adaptador S3.
 *
 * Gramática das três: ausente → padrão (90 % do grátis); inteiro ≥ 1 → o teto; `0` → fecha (kill
 * switch); `ilimitado` → sem teto. Qualquer outro valor é erro de configuração e derruba o boot (o
 * adaptador S3 lê os tetos ao ser criado, no import das rotas).
 */
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { db } from '../db/db'
import { usageCounters } from '../db/schema'
import { medirUsoDoR2 } from '../http/metricas'
import type { Armazenamento } from './armazenamento'
import { log } from './logger'
import { type EnvelopeDeErro, envelopeDeErro } from './respostaDeErro'

const MB = 1024 * 1024

export interface TetoDoR2 {
  /** Bytes guardados na conta inteira. `Infinity` = sem teto. */
  bytes: number
  /** Operações de classe A (PUT/DELETE) no mês UTC. */
  opsA: number
  /** Operações de classe B (GET/HEAD) no mês UTC. */
  opsB: number
}

const PADRAO_MB = 9216
const PADRAO_OPS_A = 900_000
const PADRAO_OPS_B = 9_000_000

const erroDeConfiguracao = (nome: string, bruto: string) =>
  new Error(`Erro de configuração: ${nome} deve ser um inteiro ≥ 0 ou "ilimitado" (veio "${bruto.slice(0, 40)}")`)

/**
 * Inteiro SEGURO (`Number.isSafeInteger`), não só dígitos: um valor gigante vira float impreciso, estoura
 * o bigint no SQL do contador e a operação passaria sem teto nenhum.
 */
function lerVariavel(nome: string, valor: string | undefined, padrao: number, fator = 1): number {
  const bruto = valor?.trim()
  if (!bruto) return padrao
  if (bruto === 'ilimitado') return Infinity
  if (/^\d+$/.test(bruto) && Number.isSafeInteger(Number(bruto) * fator)) return Number(bruto)
  throw erroDeConfiguracao(nome, bruto)
}

/** Os três tetos do ambiente. Lança em valor inválido (erro de configuração). */
export function lerTetoDoR2(env: NodeJS.ProcessEnv = process.env): TetoDoR2 {
  const mb = lerVariavel('R2_TETO_MB', env.R2_TETO_MB, PADRAO_MB, MB)
  return {
    bytes: Number.isFinite(mb) ? mb * MB : Infinity,
    opsA: lerVariavel('R2_TETO_OPS_A_MES', env.R2_TETO_OPS_A_MES, PADRAO_OPS_A),
    opsB: lerVariavel('R2_TETO_OPS_B_MES', env.R2_TETO_OPS_B_MES, PADRAO_OPS_B),
  }
}

/* ─────────────────────────── aviso e métrica ─────────────────────────── */

type RecursoDoR2 = 'armazenamento' | 'ops_a' | 'ops_b'

/** `recurso:janela` que já avisou neste processo (decisão 5: uma vez por processo e por janela). */
const avisados = new Set<string>()

/**
 * Registra o uso de um teto: o gauge `r2_uso_fracao{recurso}` sempre; o log `r2_teto_alerta_80` ao
 * cruzar 80 %, uma vez por processo e por janela (`total` no armazenamento, `YYYY-MM` nas operações).
 */
export function observarUsoDoR2(recurso: RecursoDoR2, usado: number, teto: number, janela: string): void {
  if (!Number.isFinite(teto) || teto <= 0) return
  const fracao = usado / teto
  medirUsoDoR2(recurso, fracao)
  const chave = `${recurso}:${janela}`
  if (fracao < 0.8 || avisados.has(chave)) return
  avisados.add(chave)
  log('warn', {
    event: 'r2_teto_alerta_80',
    recurso,
    usado,
    teto,
    error: `R2 em ${Math.round(fracao * 100)}% do teto de ${recurso} (${janela})`,
  })
}

/** Log de cada recusa por teto do R2. */
export function registrarRecusaDoR2(recurso: RecursoDoR2, teto: number): void {
  log('warn', { event: 'r2_teto_recusa', recurso, teto })
}

/* ─────────────────────────── operações por mês ─────────────────────────── */

/** O contador das operações é da CONTA, não de uma pessoa: um `userId` fixo que nenhum login gera. */
const USUARIO_DO_R2 = '__r2__'

/** Operação recusada pelo teto mensal do R2. As rotas respondem 503 (`respostaDoTetoDoR2`). */
export class ErroDeTetoDoR2 extends Error {
  /** `R2_TETO_OPS` = teto do mês atingido; `R2_TETO_INDISPONIVEL` = o contador não pôde ser gravado. */
  readonly codigo: 'R2_TETO_OPS' | 'R2_TETO_INDISPONIVEL'
  constructor(
    readonly classe: 'a' | 'b',
    motivo: 'teto' | 'indisponivel' = 'teto',
  ) {
    super(
      motivo === 'teto'
        ? `teto mensal de operações de classe ${classe.toUpperCase()} do R2 atingido`
        : `contador de operações do R2 indisponível (classe ${classe.toUpperCase()})`,
    )
    this.name = 'ErroDeTetoDoR2'
    this.codigo = motivo === 'teto' ? 'R2_TETO_OPS' : 'R2_TETO_INDISPONIVEL'
  }
}

/**
 * Conta uma operação no mês e devolve se ela passa. Decide e conta numa instrução (como
 * `usageCountersRepo.reserve`): o `setWhere` só soma enquanto há folga, e quem perde não afeta linha.
 * `forcar` conta mesmo sem folga (o `remover`). Teto infinito conta sem condição.
 */
async function contarOperacao(classe: 'a' | 'b', janela: string, teto: number, forcar = false): Promise<number | null> {
  const sem = !forcar && Number.isFinite(teto)
  // O INSERT (primeira operação do mês) não passa pelo `setWhere`: teto < 1 recusa antes.
  if (sem && teto < 1) return null
  const agora = Date.now()
  const linhasContadas = await db
    .insert(usageCounters)
    .values({
      id: randomUUID(),
      userId: USUARIO_DO_R2,
      createdAt: agora,
      updatedAt: agora,
      metric: `r2_ops_${classe}`,
      window: janela,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
      set: { count: sql`${usageCounters.count} + 1`, updatedAt: agora },
      ...(sem ? { setWhere: sql`${usageCounters.count} < ${teto}` } : {}),
    })
    .returning({ count: usageCounters.count })
  return linhasContadas[0]?.count ?? null
}

export interface DependenciasDoTeto {
  /** Os tetos (padrão: `lerTetoDoR2()` na criação — mudar exige reiniciar). */
  tetos?: TetoDoR2
  /** Relógio (o teste da virada de mês o injeta). */
  agora?: () => Date
  /** Quem conta no banco (o teste injeta um que falha, para o caminho do contador indisponível). */
  contar?: typeof contarOperacao
}

/** Último aviso de contagem que falhou (epoch ms) — no máximo um por minuto por processo. */
let ultimoAvisoDeContagem = 0
const JANELA_DO_AVISO_DE_CONTAGEM_MS = 60_000

/**
 * Falha ao gravar o contador: `warn`, não `error` (todo `error` vai aos destinos externos, e com o banco
 * instável e o `<audio>` lendo faixas seria um evento externo por operação), e no máximo um por minuto
 * — o mesmo molde de `ia_provedor_limite`.
 */
function avisarContagemFalhou(err: unknown): void {
  const agora = Date.now()
  if (agora - ultimoAvisoDeContagem < JANELA_DO_AVISO_DE_CONTAGEM_MS) return
  ultimoAvisoDeContagem = agora
  log('warn', { event: 'r2_teto_contagem_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
}

/** Só para os testes: esquece a janela do aviso de contagem. */
export function esquecerAvisoDeContagem(): void {
  ultimoAvisoDeContagem = 0
}

/**
 * Embrulha o adaptador S3 contando cada operação por classe (decisão 3 do design):
 * A = `gravar`, `gravarDeArquivo`, `remover`; B = `ler`, `lerFaixa`, `tamanho`. `sondar` (a readiness)
 * passa sem contar. No teto, `gravar`/`gravarDeArquivo` (A) e `ler`/`lerFaixa`/`tamanho` (B) lançam
 * `ErroDeTetoDoR2`; `remover` SEMPRE passa (decisão 6): apagar reduz o problema.
 *
 * Jobs internos que precisam medir ou apagar independentemente do teto (exclusão de conta/LGPD,
 * apagar sessão, retenção, reconciliação da cota) usam `semTeto(store)`: a mesma contagem, sem
 * recusa. As rotas de usuário (ler o áudio, upload) ficam no embrulho — um cliente em laço não soma
 * HEADs além do teto.
 *
 * Falha ao contar (banco fora): classe A (`gravar`/`gravarDeArquivo`) falha FECHADA com
 * `ErroDeTetoDoR2` de código `R2_TETO_INDISPONIVEL` (a rota responde 503 e devolve a reserva de cota);
 * classe B e `remover` passam, com aviso limitado a um por minuto.
 */
export function comTetoDeOperacoes(store: Armazenamento, deps: DependenciasDoTeto = {}): Armazenamento {
  const tetos = deps.tetos ?? lerTetoDoR2()
  const relogio = deps.agora ?? (() => new Date())
  const contar = deps.contar ?? contarOperacao

  const passar = async (classe: 'a' | 'b', forcar = false): Promise<void> => {
    const teto = classe === 'a' ? tetos.opsA : tetos.opsB
    const recurso = classe === 'a' ? 'ops_a' : 'ops_b'
    const janela = relogio().toISOString().slice(0, 7)
    let contado: number | null
    try {
      contado = await contar(classe, janela, teto, forcar)
    } catch (err) {
      avisarContagemFalhou(err)
      /* Classe A (gravar) falha FECHADA: sem contador não há como saber se a conta está no teto, e
         gravar é o que cria custo novo. Classe B e `remover` seguem abertos — a reprodução de áudio e
         a exclusão não caem por falha do contador. */
      if (classe === 'a' && !forcar) throw new ErroDeTetoDoR2('a', 'indisponivel')
      return
    }
    if (contado !== null) {
      observarUsoDoR2(recurso, contado, teto, janela)
      return
    }
    medirUsoDoR2(recurso, 1)
    registrarRecusaDoR2(recurso, teto)
    throw new ErroDeTetoDoR2(classe)
  }

  /** O mesmo adaptador; `livre` conta tudo e não recusa nada (a via de `semTeto`). */
  const montar = (livre: boolean): Armazenamento => ({
    tipo: store.tipo,
    gravar: async (nome, bytes, contentType) => (await passar('a', livre), store.gravar(nome, bytes, contentType)),
    gravarDeArquivo: async (nome, caminho, contentType) => (
      await passar('a', livre), store.gravarDeArquivo(nome, caminho, contentType)
    ),
    remover: async (nome) => (await passar('a', true), store.remover(nome)),
    ler: async (nome) => (await passar('b', livre), store.ler(nome)),
    lerFaixa: async (nome, inicio, fim) => (await passar('b', livre), store.lerFaixa(nome, inicio, fim)),
    tamanho: async (nome) => (await passar('b', livre), store.tamanho(nome)),
    sondar: () => store.sondar(),
  })
  return Object.assign(montar(false), { [VIA_SEM_TETO]: montar(true) })
}

const VIA_SEM_TETO = Symbol('r2.semTeto')

/**
 * A via SEM TETO de um adaptador embrulhado por `comTetoDeOperacoes`: as operações continuam contando
 * (o número reflete o R2), só não recusam. Só para jobs internos que precisam medir ou apagar
 * independentemente do teto — nunca numa rota que atende pedido de usuário. Store que não é embrulho
 * (disco) volta como veio.
 */
export function semTeto(store: Armazenamento): Armazenamento {
  return (store as Armazenamento & { [VIA_SEM_TETO]?: Armazenamento })[VIA_SEM_TETO] ?? store
}

/** A resposta HTTP de um `ErroDeTetoDoR2` (503 no envelope); `null` para qualquer outro erro. */
export function respostaDoTetoDoR2(err: unknown): { status: number; body: EnvelopeDeErro } | null {
  if (!(err instanceof ErroDeTetoDoR2)) return null
  if (err.codigo === 'R2_TETO_INDISPONIVEL') {
    return {
      status: 503,
      body: envelopeDeErro('não foi possível gravar o áudio agora; tente de novo em instantes', 'r2_teto_indisponivel'),
    }
  }
  return {
    status: 503,
    body: envelopeDeErro('o serviço de áudio está no limite de uso deste mês; tente mais tarde', 'r2_teto_operacoes'),
  }
}
