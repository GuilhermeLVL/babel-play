/**
 * AGREGADOS DIÁRIOS E ESTADO POR ITEM (migração 0053; change `modelo-do-aluno-e-dados`, fatia 2).
 *
 * Três tabelas DERIVADAS de `review_logs` e `exercise_results`, fora do `schema.ts` como
 * `versoes_de_dados` (são soma do bruto, não dado novo do titular):
 *
 *   agregados_diarios     (usuário, idioma, dia) → contadores do dia (`ContadoresDoDia`, no core);
 *   estado_dos_agregados  por usuário: o fuso em que os dias foram contados e as duas marcas;
 *   estado_por_item       (usuário, cartão, jogo) → acertos, erros, último resultado.
 *
 * QUEM ESCREVE. Os repositórios que gravam o bruto pedem aqui as instruções e as põem no MESMO
 * `db.batch` (uma transação): `instrucoesDaRevisao`, `instrucoesDaRevisaoDesfeita`,
 * `instrucoesDaRodada`. Cada lote termina somando em `marca_vista` quantas linhas brutas escreveu.
 *
 * QUEM GARANTE. Os gatilhos da 0053 somam em `marca_bruto` a cada linha escrita no bruto, por
 * qualquer caminho. `garantir()` compara as marcas (e o fuso, quando quem lê depende do dia): se
 * alguém escreveu por fora, ou o fuso gravado mudou, ou o usuário nunca foi contado, reconta do bruto
 * antes de devolver. Quem lê chama `garantir` e depois lê; não existe leitura de agregado velho.
 *
 * A RECONSTRUÇÃO é idempotente: apaga as células do usuário e grava as recontadas, numa transação
 * que toma a trava de escrita logo no começo (`immediate`), para nenhuma revisão entrar entre a
 * leitura do bruto e a gravação. A única coisa preservada são as `*_purgadas` (ver a migração).
 * O dia é `diaNumeroNoFuso` no fuso GRAVADO do usuário, o mesmo da ofensiva e das missões.
 */
import { type SQL, sql } from 'drizzle-orm'

import {
  agregarPorDia,
  type CelulaDoDia,
  CONTADORES_DO_DIA,
  type ContadoresDoDia,
  type GrupoDeItens,
  type GrupoDeRevisoes,
  idiomaDaRodada,
  type RodadaAgregavel,
} from '../../../src/core/learning/agregados'
import { diaNumeroNoFuso, FUSO_PADRAO, fusoOuPadrao } from '../../../src/core/learning/economia'
import type { UserId } from '../../lib/authContext'
import { aplicarPragmas, type DB, db } from '../db'
import { emLotes, type InstrucaoDeBatch } from '../lotes'
import { estadoDaContaRepo } from './estadoDaConta'

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

const QUARTO_DE_HORA = 900_000

/** Contador do core → coluna de `agregados_diarios`. */
const COLUNA: Record<keyof ContadoresDoDia, string> = {
  revisoes: 'revisoes',
  acertos: 'acertos',
  revisoesVivas: 'revisoes_vivas',
  nota1: 'nota1',
  nota2: 'nota2',
  nota3: 'nota3',
  nota4: 'nota4',
  novas: 'novas',
  tempoRevisaoMs: 'tempo_revisao_ms',
  comPrevisao: 'com_previsao',
  somaPrevista: 'soma_prevista',
  lembradasComPrevisao: 'lembradas_com_previsao',
  itensDeJogo: 'itens_de_jogo',
  itensCertos: 'itens_certos',
  itensDrill: 'itens_drill',
  itensDrillCertos: 'itens_drill_certos',
  tempoJogoMs: 'tempo_jogo_ms',
  rodadas: 'rodadas',
}
const COLUNAS_SQL = CONTADORES_DO_DIA.map((k) => COLUNA[k]).join(', ')
const SOMA_SQL = CONTADORES_DO_DIA.map((k) => `${COLUNA[k]} = ${COLUNA[k]} + excluded.${COLUNA[k]}`).join(', ')

/** A base do idioma de um cartão, como a coluna gerada `src_lang_base` a calcula. */
export function baseDoIdioma(srcLang: string | null | undefined): string {
  return (srcLang ?? '').slice(0, 2).toLowerCase()
}

/** O fuso GRAVADO do usuário (só leitura), ou o padrão: o mesmo que o perfil usa. */
async function fusoGravado(userId: UserId): Promise<string> {
  const { fuso } = await estadoDaContaRepo.fusoGravado(userId)
  return fuso ? fusoOuPadrao(fuso) : FUSO_PADRAO
}

/**
 * Soma células em `agregados_diarios`. Com `seExiste`, a soma só acontece se aquela consulta achar
 * linha: é como a rodada (um INSERT que pode não inserir nada, por ser repetida) leva os agregados
 * junto sem ler antes.
 */
function somarCelulas(userId: UserId, celulas: CelulaDoDia[], agora: number, seExiste?: SQL): InstrucaoDeBatch[] {
  const condicao = seExiste ? sql`EXISTS (${seExiste})` : sql`1`
  return celulas.map((c) =>
    db.run(sql`
      INSERT INTO agregados_diarios (user_id, idioma, dia, ${sql.raw(COLUNAS_SQL)}, atualizado_em)
      SELECT ${userId}, ${c.idioma}, ${c.dia}, ${sql.join(
        CONTADORES_DO_DIA.map((k) => sql`${c[k]}`),
        sql`, `,
      )}, ${agora}
      WHERE ${condicao}
      ON CONFLICT (user_id, idioma, dia) DO UPDATE SET ${sql.raw(SOMA_SQL)}, atualizado_em = excluded.atualizado_em
    `),
  )
}

/** "Estas `n` linhas brutas eu já contei": o par do gatilho que soma em `marca_bruto`. */
function marcarVistas(userId: UserId, n: number, seExiste?: SQL): InstrucaoDeBatch {
  const condicao = seExiste ? sql`EXISTS (${seExiste})` : sql`1`
  return db.run(
    sql`UPDATE estado_dos_agregados SET marca_vista = marca_vista + ${n} WHERE user_id = ${userId} AND ${condicao}`,
  )
}

/** Uma revisão no que os agregados enxergam dela. */
export interface RevisaoAgregavel {
  em: number
  srcLang: string | null | undefined
  grade: number | null
  /** Primeira revisão do cartão (não havia estabilidade). */
  nova: boolean
  respostaMs?: number | null
  retencaoPrevista?: number | null
}

function grupoDaRevisao(r: RevisaoAgregavel, n: 1 | -1, soParteViva: boolean): GrupoDeRevisoes {
  const temPrevisao = typeof r.retencaoPrevista === 'number'
  return {
    em: r.em,
    idioma: baseDoIdioma(r.srcLang),
    grade: r.grade,
    viva: true,
    nova: r.nova,
    n,
    respostaMs: n * (r.respostaMs ?? 0),
    comPrevisao: temPrevisao ? n : 0,
    somaPrevista: temPrevisao ? n * (r.retencaoPrevista as number) : 0,
    soParteViva,
  }
}

/** Um item de rodada no que os agregados e o estado por item enxergam dele. */
export interface ItemAgregavel {
  cardId: string | null
  /** Base do idioma do cartão; '' ou nulo quando o item não tem cartão. */
  idioma: string | null
  kind: string | null
  correct: number | null
  ms: number | null
}

export interface EstadoDosAgregados {
  fuso: string
  marcaBruto: number
  marcaVista: number
  reconstruidoEm: number
}

export const agregadosRepo = {
  fusoGravado,

  /** As instruções que acompanham o INSERT de UMA revisão, no mesmo lote. */
  instrucoesDaRevisao(userId: UserId, fuso: string, r: RevisaoAgregavel): InstrucaoDeBatch[] {
    const celulas = agregarPorDia({ revisoes: [grupoDaRevisao(r, 1, false)] }, (em) => diaNumeroNoFuso(em, fuso))
    return [...somarCelulas(userId, celulas, r.em), marcarVistas(userId, 1)]
  },

  /**
   * As instruções que acompanham a exclusão LÓGICA de revisões (desfazer; apagar o cartão): cada uma
   * sai dos contadores das vivas e continua em `revisoes`/`acertos`, como no perfil.
   */
  instrucoesDaRevisaoDesfeita(
    userId: UserId,
    fuso: string,
    revisoes: RevisaoAgregavel[],
    agora: number,
  ): InstrucaoDeBatch[] {
    if (!revisoes.length) return []
    const celulas = agregarPorDia({ revisoes: revisoes.map((r) => grupoDaRevisao(r, -1, true)) }, (em) =>
      diaNumeroNoFuso(em, fuso),
    )
    return [...somarCelulas(userId, celulas, agora), marcarVistas(userId, revisoes.length)]
  },

  /**
   * As instruções que acompanham o INSERT de UMA rodada: agregados do dia e estado por item.
   * `seExiste` é a consulta que só acha linha se ESTA gravação inseriu a rodada (a rodada repetida
   * não insere nada, e então nada aqui pode somar).
   */
  instrucoesDaRodada(
    userId: UserId,
    fuso: string,
    rodada: { em: number; jogo: string | null; comRodada: boolean; itens: ItemAgregavel[] },
    seExiste: SQL,
  ): InstrucaoDeBatch[] {
    if (!rodada.itens.length) return []
    const itens: GrupoDeItens[] = rodada.itens.map((i) => ({
      em: rodada.em,
      idioma: i.idioma ?? '',
      drill: i.kind === 'drill',
      n: 1,
      certos: (i.correct ?? 0) > 0 ? 1 : 0,
      ms: i.ms ?? 0,
    }))
    const rodadas: RodadaAgregavel[] = rodada.comRodada
      ? [{ em: rodada.em, idioma: idiomaDaRodada(rodada.itens.map((i) => i.idioma)) }]
      : []
    const celulas = agregarPorDia({ itens, rodadas }, (em) => diaNumeroNoFuso(em, fuso))
    const instrucoes = somarCelulas(userId, celulas, rodada.em, seExiste)
    if (rodada.jogo) {
      for (const i of rodada.itens) {
        if (!i.cardId || i.correct == null) continue
        const certo = i.correct > 0 ? 1 : 0
        instrucoes.push(
          db.run(sql`
            INSERT INTO estado_por_item (user_id, card_id, jogo, acertos, erros, ultimo_resultado, ultimo_em)
            SELECT ${userId}, ${i.cardId}, ${rodada.jogo}, ${certo}, ${1 - certo}, ${certo}, ${rodada.em}
            WHERE EXISTS (${seExiste})
            ON CONFLICT (user_id, card_id, jogo) DO UPDATE SET
              acertos = acertos + excluded.acertos,
              erros = erros + excluded.erros,
              ultimo_resultado = CASE WHEN excluded.ultimo_em >= ultimo_em THEN excluded.ultimo_resultado ELSE ultimo_resultado END,
              ultimo_em = max(ultimo_em, excluded.ultimo_em)
          `),
        )
      }
    }
    instrucoes.push(marcarVistas(userId, rodada.itens.length, seExiste))
    return instrucoes
  },

  async estado(userId: UserId): Promise<EstadoDosAgregados | null> {
    const [l] = await db.all<{ fuso: string; marca_bruto: number; marca_vista: number; reconstruido_em: number }>(
      sql`SELECT fuso, marca_bruto, marca_vista, reconstruido_em FROM estado_dos_agregados WHERE user_id = ${userId}`,
    )
    if (!l) return null
    return {
      fuso: l.fuso,
      marcaBruto: Number(l.marca_bruto),
      marcaVista: Number(l.marca_vista),
      reconstruidoEm: Number(l.reconstruido_em),
    }
  },

  /**
   * Deixa os agregados do usuário EM DIA antes de uma leitura. Com `fuso`, também exige que os dias
   * tenham sido contados nele (quem só soma totais não depende do dia e não passa o fuso).
   * Devolve se precisou reconstruir.
   */
  async garantir(userId: UserId, fuso?: string): Promise<boolean> {
    const e = await this.estado(userId)
    if (e && e.marcaBruto === e.marcaVista && (fuso === undefined || e.fuso === fuso)) return false
    await this.reconstruir(userId, fuso)
    return true
  },

  /**
   * Reconta do bruto os agregados e o estado por item de UM usuário. Idempotente. Sem `fuso`, usa o
   * gravado. A trava de escrita é tomada no começo; se outro escritor estiver no meio de uma
   * transação, tenta de novo (a conexão da transação nasce sem `busy_timeout`, ver `db.ts`).
   */
  async reconstruir(userId: UserId, fuso?: string): Promise<{ celulas: number }> {
    const f = fuso ?? (await fusoGravado(userId))
    const agora = Date.now()
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      try {
        try {
          return await db.transaction((tx) => reconstruirNaTransacao(tx, userId, f, agora), { behavior: 'immediate' })
        } finally {
          // A transação roda em conexão nova e devolve a principal sem os PRAGMAs (ver `emTransacao`).
          await aplicarPragmas().catch(() => {})
        }
      } catch (err) {
        ultimoErro = err
        if (!/SQLITE_BUSY|database is locked/i.test(String((err as Error)?.message ?? err))) throw err
        await new Promise((r) => setTimeout(r, 40 * (tentativa + 1)))
      }
    }
    throw ultimoErro
  },

  /** O total de revisões que continuam no histórico: o "de sempre" da Memória dos Cartões. */
  async revisoesVivas(userId: UserId): Promise<number> {
    await this.garantir(userId)
    const [l] = await db.all<{ n: number | null }>(
      sql`SELECT sum(revisoes_vivas) AS n FROM agregados_diarios WHERE user_id = ${userId}`,
    )
    return Number(l?.n ?? 0)
  },

  /**
   * O que o perfil soma das revisões: quantas aconteceram, quantas foram acerto (nota >= 3) e em
   * que dias (no `fuso` dado). Conta também as que a limpeza já apagou do bruto (`*_purgadas`).
   */
  async revisoesDoPerfil(userId: UserId, fuso: string): Promise<{ revisoes: number; acertos: number; dias: number[] }> {
    await this.garantir(userId, fuso)
    const linhas = await db.all<{ dia: number; n: number; a: number }>(sql`
      SELECT dia, sum(revisoes + revisoes_purgadas) AS n, sum(acertos + acertos_purgados) AS a
      FROM agregados_diarios WHERE user_id = ${userId} GROUP BY dia`)
    let revisoes = 0
    let acertos = 0
    const dias: number[] = []
    for (const l of linhas) {
      const n = Number(l.n)
      revisoes += n
      acertos += Number(l.a)
      if (n > 0) dias.push(Number(l.dia))
    }
    return { revisoes, acertos, dias }
  },

  /** As células de um usuário, por (idioma, dia). Para teste, operação e as métricas que vierem. */
  async celulas(userId: UserId): Promise<Array<CelulaDoDia & { revisoesPurgadas: number; acertosPurgados: number }>> {
    const linhas = await db.all<Record<string, number | string>>(
      sql`SELECT idioma, dia, ${sql.raw(COLUNAS_SQL)}, revisoes_purgadas, acertos_purgados
          FROM agregados_diarios WHERE user_id = ${userId} ORDER BY idioma, dia`,
    )
    return linhas.map((l) => {
      const c = { idioma: String(l.idioma), dia: Number(l.dia) } as CelulaDoDia & {
        revisoesPurgadas: number
        acertosPurgados: number
      }
      for (const k of CONTADORES_DO_DIA) c[k] = Number(l[COLUNA[k]])
      c.revisoesPurgadas = Number(l.revisoes_purgadas)
      c.acertosPurgados = Number(l.acertos_purgados)
      return c
    })
  },

  /** O estado por item de um cartão, por jogo. Ninguém lê em produção ainda (tarefa 2.3). */
  async estadoPorItem(
    userId: UserId,
    cardId: string,
  ): Promise<
    Array<{ jogo: string; acertos: number; erros: number; ultimoResultado: number | null; ultimoEm: number }>
  > {
    const linhas = await db.all<{
      jogo: string
      acertos: number
      erros: number
      ultimo_resultado: number | null
      ultimo_em: number
    }>(
      sql`SELECT jogo, acertos, erros, ultimo_resultado, ultimo_em FROM estado_por_item
          WHERE user_id = ${userId} AND card_id = ${cardId} ORDER BY jogo`,
    )
    return linhas.map((l) => ({
      jogo: l.jogo,
      acertos: Number(l.acertos),
      erros: Number(l.erros),
      ultimoResultado: l.ultimo_resultado == null ? null : Number(l.ultimo_resultado),
      ultimoEm: Number(l.ultimo_em),
    }))
  },

  /** As instruções que tiram do banco tudo o que estas tabelas guardam de um usuário (exclusão de conta). */
  instrucoesDeExclusao(userId: UserId): InstrucaoDeBatch[] {
    return [
      db.run(sql`DELETE FROM agregados_diarios WHERE user_id = ${userId}`),
      db.run(sql`DELETE FROM estado_por_item WHERE user_id = ${userId}`),
      db.run(sql`DELETE FROM estado_dos_agregados WHERE user_id = ${userId}`),
    ]
  },
}

/** Revisões purgadas a somar numa célula: o que a limpeza diária entrega à reconstrução. */
export interface PurgadasDaCelula {
  idioma: string
  dia: number
  revisoes: number
  acertos: number
}

/** As revisões de um usuário agrupadas para a conta do core; `onde` recorta (a limpeza usa). */
export async function gruposDeRevisoes(tx: Tx | DB, userId: UserId, onde?: SQL): Promise<GrupoDeRevisoes[]> {
  const linhas = await tx.all<{
    q: number
    idioma: string
    grade: number | null
    viva: number
    nova: number
    n: number
    ms: number
    com: number
    soma: number
  }>(sql`
    SELECT CAST(coalesce(r.reviewed_at, r.created_at) / ${QUARTO_DE_HORA} AS INTEGER) AS q,
           coalesce(c.src_lang_base, '') AS idioma,
           r.grade AS grade,
           (r.deleted_at IS NULL) AS viva,
           (r.prev_stability IS NULL) AS nova,
           count(*) AS n,
           coalesce(sum(r.resposta_ms), 0) AS ms,
           count(r.retencao_prevista) AS com,
           coalesce(sum(r.retencao_prevista), 0) AS soma
    FROM review_logs r LEFT JOIN vocab_cards c ON c.id = r.card_id
    WHERE r.user_id = ${userId} AND ${onde ?? sql`1`}
    GROUP BY 1, 2, 3, 4, 5`)
  return linhas.map((l) => ({
    em: Number(l.q) * QUARTO_DE_HORA,
    idioma: l.idioma,
    grade: l.grade == null ? null : Number(l.grade),
    viva: Number(l.viva) === 1,
    nova: Number(l.nova) === 1,
    n: Number(l.n),
    respostaMs: Number(l.ms),
    comPrevisao: Number(l.com),
    somaPrevista: Number(l.soma),
  }))
}

/**
 * A reconstrução, dentro de uma transação que já tem a trava de escrita. Exportada para a limpeza
 * diária, que apaga o bruto e reconta no MESMO passo, entregando as revisões que acabou de apagar.
 */
export async function reconstruirNaTransacao(
  tx: Tx,
  userId: UserId,
  fuso: string,
  agora: number,
  purgadasNovas: PurgadasDaCelula[] = [],
): Promise<{ celulas: number }> {
  const diaDe = (em: number) => diaNumeroNoFuso(em, fuso)

  const revisoes = await gruposDeRevisoes(tx, userId)
  const itens = await tx.all<{ q: number; idioma: string; drill: number; n: number; certos: number; ms: number }>(sql`
    SELECT CAST(e.created_at / ${QUARTO_DE_HORA} AS INTEGER) AS q,
           coalesce(c.src_lang_base, '') AS idioma,
           coalesce(e.kind = 'drill', 0) AS drill,
           count(*) AS n,
           coalesce(sum(CASE WHEN e.correct > 0 THEN 1 ELSE 0 END), 0) AS certos,
           coalesce(sum(e.ms), 0) AS ms
    FROM exercise_results e LEFT JOIN vocab_cards c ON c.id = e.card_id
    WHERE e.user_id = ${userId} AND e.deleted_at IS NULL
    GROUP BY 1, 2, 3`)
  const rodadas = await tx.all<{ em: number; idioma: string }>(sql`
    SELECT min(e.created_at) AS em, min(coalesce(c.src_lang_base, '')) AS idioma
    FROM exercise_results e LEFT JOIN vocab_cards c ON c.id = e.card_id
    WHERE e.user_id = ${userId} AND e.deleted_at IS NULL AND e.round_id IS NOT NULL
    GROUP BY e.round_id`)

  const celulas = agregarPorDia(
    {
      revisoes,
      itens: itens.map((l) => ({
        em: Number(l.q) * QUARTO_DE_HORA,
        idioma: l.idioma,
        drill: Number(l.drill) === 1,
        n: Number(l.n),
        certos: Number(l.certos),
        ms: Number(l.ms),
      })),
      rodadas: rodadas.map((l) => ({ em: Number(l.em), idioma: l.idioma })),
    },
    diaDe,
  )

  /* As purgadas: as que já estavam gravadas mais as que a limpeza acabou de apagar do bruto. */
  const purgadas = new Map<string, PurgadasDaCelula>()
  const somarPurgada = (p: PurgadasDaCelula) => {
    const chave = `${p.idioma}|${p.dia}`
    const atual = purgadas.get(chave)
    if (atual) {
      atual.revisoes += p.revisoes
      atual.acertos += p.acertos
    } else purgadas.set(chave, { ...p })
  }
  const antigas = await tx.all<{ idioma: string; dia: number; r: number; a: number }>(sql`
    SELECT idioma, dia, revisoes_purgadas AS r, acertos_purgados AS a FROM agregados_diarios
    WHERE user_id = ${userId} AND (revisoes_purgadas <> 0 OR acertos_purgados <> 0)`)
  for (const l of antigas) {
    somarPurgada({ idioma: l.idioma, dia: Number(l.dia), revisoes: Number(l.r), acertos: Number(l.a) })
  }
  for (const p of purgadasNovas) somarPurgada(p)

  const linhas = new Map<string, { c: CelulaDoDia | null; idioma: string; dia: number; p: PurgadasDaCelula | null }>()
  for (const c of celulas) linhas.set(`${c.idioma}|${c.dia}`, { c, idioma: c.idioma, dia: c.dia, p: null })
  for (const [chave, p] of purgadas) {
    if (!p.revisoes && !p.acertos) continue
    const l = linhas.get(chave)
    if (l) l.p = p
    else linhas.set(chave, { c: null, idioma: p.idioma, dia: p.dia, p })
  }

  await tx.run(sql`DELETE FROM agregados_diarios WHERE user_id = ${userId}`)
  /* 3 de chave + os contadores + 2 purgadas + 1 carimbo, por linha. */
  for (const lote of emLotes([...linhas.values()], 200)) {
    await tx.run(sql`
      INSERT INTO agregados_diarios
        (user_id, idioma, dia, ${sql.raw(COLUNAS_SQL)}, revisoes_purgadas, acertos_purgados, atualizado_em)
      VALUES ${sql.join(
        lote.map(
          (l) =>
            sql`(${userId}, ${l.idioma}, ${l.dia}, ${sql.join(
              CONTADORES_DO_DIA.map((k) => sql`${l.c ? l.c[k] : 0}`),
              sql`, `,
            )}, ${l.p?.revisoes ?? 0}, ${l.p?.acertos ?? 0}, ${agora})`,
        ),
        sql`, `,
      )}`)
  }

  /* O estado por item, inteiro em SQL. `correct` sem agregação vem da linha do `max(created_at)`
     (regra do SQLite para consulta com um único max): é o resultado mais recente. */
  await tx.run(sql`DELETE FROM estado_por_item WHERE user_id = ${userId}`)
  await tx.run(sql`
    INSERT INTO estado_por_item (user_id, card_id, jogo, acertos, erros, ultimo_resultado, ultimo_em)
    SELECT ${userId}, card_id, exercise_kind,
           sum(CASE WHEN correct > 0 THEN 1 ELSE 0 END),
           sum(CASE WHEN correct > 0 THEN 0 ELSE 1 END),
           CASE WHEN correct > 0 THEN 1 ELSE 0 END,
           max(created_at)
    FROM exercise_results
    WHERE user_id = ${userId} AND deleted_at IS NULL AND card_id IS NOT NULL
      AND exercise_kind IS NOT NULL AND correct IS NOT NULL
    GROUP BY card_id, exercise_kind`)

  await tx.run(sql`
    INSERT INTO estado_dos_agregados (user_id, fuso, marca_bruto, marca_vista, reconstruido_em)
    VALUES (${userId}, ${fuso}, 0, 0, ${agora})
    ON CONFLICT (user_id) DO UPDATE SET fuso = excluded.fuso, marca_vista = marca_bruto,
      reconstruido_em = excluded.reconstruido_em`)
  return { celulas: linhas.size }
}

/**
 * PASSO DE ARRANQUE: conta o passado de quem ainda não tem agregados. Roda no processo que prepara
 * os dados, depois das migrações. Um usuário por transação (a trava de escrita é solta entre um e
 * outro), com teto de usuários e de tempo: o que sobrar entra no próximo arranque ou na primeira
 * leitura de cada um (`garantir`). Não é chamável por rota.
 */
export async function preencherAgregadosPendentes(
  o: { maximoDeUsuarios?: number; tetoMs?: number } = {},
): Promise<{ preenchidos: number; restam: boolean }> {
  const maximo = o.maximoDeUsuarios ?? 500
  const prazo = Date.now() + (o.tetoMs ?? 15_000)
  /* Quem tem bruto e não tem estado. `users` não serve de lista: o dono do self-host pode não ter
     linha lá, e conta sem atividade não precisa de célula nenhuma. */
  const pendentes = await db.all<{ user_id: string }>(sql`
    SELECT user_id FROM (
      SELECT DISTINCT user_id FROM review_logs WHERE user_id IS NOT NULL
      UNION SELECT DISTINCT user_id FROM exercise_results WHERE user_id IS NOT NULL
    ) WHERE user_id NOT IN (SELECT user_id FROM estado_dos_agregados) LIMIT ${maximo + 1}`)
  let preenchidos = 0
  for (const p of pendentes.slice(0, maximo)) {
    if (Date.now() > prazo) return { preenchidos, restam: true }
    await agregadosRepo.reconstruir(p.user_id as UserId)
    preenchidos += 1
  }
  return { preenchidos, restam: pendentes.length > maximo }
}
