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
 * lote (`rodarLote`, uma transação): `instrucoesDaRevisao`, `instrucoesDaRevisaoDesfeita`,
 * `instrucoesDaRodada`. Cada lote termina somando em `marca_vista` quantas linhas brutas escreveu.
 * Esses lotes começam pela trava do usuário (`travarUsuario`), a mesma da reconstrução:
 * no Postgres, sem ela, lote e reconstrução simultâneos se travavam (deadlock) ou perdiam revisão.
 *
 * QUEM GARANTE. Os gatilhos da 0053 somam em `marca_bruto` a cada linha escrita no bruto, por
 * qualquer caminho. `garantir()` compara as marcas (e o fuso, quando quem lê depende do dia): se
 * alguém escreveu por fora, ou o fuso gravado mudou, ou o usuário nunca foi contado, reconta do bruto
 * antes de devolver. Quem lê chama `garantir` e depois lê; não existe leitura de agregado velho.
 *
 * A RECONSTRUÇÃO é idempotente: apaga as células do usuário e grava as recontadas, numa transação
 * que toma a trava do usuário logo no começo (`travarUsuario`), para duas reconstruções
 * não se cruzarem. A única coisa preservada são as `*_purgadas` (ver a migração).
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
import { type DB, db, emTransacao, type ExecutorDb, linhas as linhasDe, travarUsuario } from '../db'
import { emLotes, type InstrucaoDeBatch, tamanhoDoLote, valoresTipados } from '../lotes'
import { agregadosDiarios, estadoPorItem } from '../schema'
import { estadoDaContaRepo } from './estadoDaConta'

type Tx = ExecutorDb

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
const SOMA_SQL = CONTADORES_DO_DIA.map(
  (k) => `${COLUNA[k]} = agregados_diarios.${COLUNA[k]} + excluded.${COLUNA[k]}`,
).join(', ')

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
  const condicao = seExiste ? sql`EXISTS (${seExiste})` : sql`TRUE`
  /* Todas as células numa instrução (multi-VALUES; Fase 2), e não uma ida ao banco por célula. As células
     já vêm uma por (idioma, dia) de `agregarPorDia`: nenhuma linha do VALUES colide com outra no ON CONFLICT. */
  const chaves = ['userId', 'idioma', 'dia', ...CONTADORES_DO_DIA, 'atualizadoEm']
  return emLotes(celulas, tamanhoDoLote(chaves.length)).map(
    (fatia) => (tx) =>
      tx.execute(sql`
      INSERT INTO agregados_diarios (user_id, idioma, dia, ${sql.raw(COLUNAS_SQL)}, atualizado_em)
      SELECT * FROM (VALUES ${valoresTipados(
        agregadosDiarios,
        chaves,
        // `?? 0` explícito: um contador ausente viraria NULL, e `coluna + NULL` apagaria a soma da célula.
        fatia.map((c) => ({
          ...Object.fromEntries(CONTADORES_DO_DIA.map((k) => [k, c[k] ?? 0])),
          userId,
          idioma: c.idioma,
          dia: c.dia,
          atualizadoEm: agora,
        })),
      )}) AS v
      WHERE ${condicao}
      ON CONFLICT (user_id, idioma, dia) DO UPDATE SET ${sql.raw(SOMA_SQL)}, atualizado_em = excluded.atualizado_em
    `),
  )
}

/** "Estas `n` linhas brutas eu já contei": o par do gatilho que soma em `marca_bruto`. */
function marcarVistas(userId: UserId, n: number, seExiste?: SQL): InstrucaoDeBatch {
  const condicao = seExiste ? sql`EXISTS (${seExiste})` : sql`TRUE`
  return (tx) =>
    tx.execute(
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
      /* O estado por item numa instrução (multi-VALUES; Fase 2), e não uma por item. O mesmo cartão duas
         vezes na rodada não pode virar duas linhas do mesmo INSERT (`cannot affect row a second time`):
         junta aqui, somando acertos e erros, e o último resultado é o do ÚLTIMO item — o que os upserts
         em sequência davam, já que todos têm o mesmo `ultimo_em`. */
      const porCartao = new Map<string, { acertos: number; erros: number; ultimoResultado: number }>()
      for (const i of rodada.itens) {
        if (!i.cardId || i.correct == null) continue
        const certo = i.correct > 0 ? 1 : 0
        const e = porCartao.get(i.cardId) ?? { acertos: 0, erros: 0, ultimoResultado: certo }
        e.acertos += certo
        e.erros += 1 - certo
        e.ultimoResultado = certo
        porCartao.set(i.cardId, e)
      }
      const linhas = [...porCartao].map(([cardId, e]) => ({
        userId,
        cardId,
        jogo: rodada.jogo,
        ...e,
        ultimoEm: rodada.em,
      }))
      const chaves = ['userId', 'cardId', 'jogo', 'acertos', 'erros', 'ultimoResultado', 'ultimoEm']
      for (const fatia of emLotes(linhas, tamanhoDoLote(chaves.length))) {
        instrucoes.push((tx) =>
          tx.execute(sql`
            INSERT INTO estado_por_item (user_id, card_id, jogo, acertos, erros, ultimo_resultado, ultimo_em)
            SELECT * FROM (VALUES ${valoresTipados(estadoPorItem, chaves, fatia)}) AS v
            WHERE EXISTS (${seExiste})
            ON CONFLICT (user_id, card_id, jogo) DO UPDATE SET
              acertos = estado_por_item.acertos + excluded.acertos,
              erros = estado_por_item.erros + excluded.erros,
              ultimo_resultado = CASE WHEN excluded.ultimo_em >= estado_por_item.ultimo_em THEN excluded.ultimo_resultado ELSE estado_por_item.ultimo_resultado END,
              ultimo_em = GREATEST(estado_por_item.ultimo_em, excluded.ultimo_em)
          `),
        )
      }
    }
    instrucoes.push(marcarVistas(userId, rodada.itens.length, seExiste))
    return instrucoes
  },

  async estado(userId: UserId): Promise<EstadoDosAgregados | null> {
    const [l] = linhasDe<{ fuso: string; marca_bruto: number; marca_vista: number; reconstruido_em: number }>(
      await db.execute(
        sql`SELECT fuso, marca_bruto, marca_vista, reconstruido_em FROM estado_dos_agregados WHERE user_id = ${userId}`,
      ),
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
   * gravado. A primeira instrução da transação é a trava do usuário: duas reconstruções
   * (ou reconstrução e limpeza diária) do mesmo usuário rodam uma depois da outra, sem retry.
   */
  async reconstruir(userId: UserId, fuso?: string): Promise<{ celulas: number }> {
    const f = fuso ?? (await fusoGravado(userId))
    const agora = Date.now()
    return emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      return reconstruirNaTransacao(tx, userId, f, agora)
    })
  },

  /** O total de revisões que continuam no histórico: o "de sempre" da Memória dos Cartões. */
  async revisoesVivas(userId: UserId): Promise<number> {
    await this.garantir(userId)
    const [l] = linhasDe<{ n: number | null }>(
      await db.execute(sql`SELECT sum(revisoes_vivas) AS n FROM agregados_diarios WHERE user_id = ${userId}`),
    )
    return Number(l?.n ?? 0)
  },

  /**
   * O que o perfil soma das revisões: quantas aconteceram, quantas foram acerto (nota >= 3) e em
   * que dias (no `fuso` dado). Conta também as que a limpeza já apagou do bruto (`*_purgadas`).
   */
  async revisoesDoPerfil(userId: UserId, fuso: string): Promise<{ revisoes: number; acertos: number; dias: number[] }> {
    await this.garantir(userId, fuso)
    const linhas = linhasDe<{ dia: number; n: number; a: number }>(
      await db.execute(sql`
      SELECT dia, sum(revisoes + revisoes_purgadas) AS n, sum(acertos + acertos_purgados) AS a
      FROM agregados_diarios WHERE user_id = ${userId} GROUP BY dia`),
    )
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
    const linhas = linhasDe<Record<string, number | string>>(
      await db.execute(
        sql`SELECT idioma, dia, ${sql.raw(COLUNAS_SQL)}, revisoes_purgadas, acertos_purgados
          FROM agregados_diarios WHERE user_id = ${userId} ORDER BY idioma, dia`,
      ),
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
    const linhas = linhasDe<{
      jogo: string
      acertos: number
      erros: number
      ultimo_resultado: number | null
      ultimo_em: number
    }>(
      await db.execute(
        sql`SELECT jogo, acertos, erros, ultimo_resultado, ultimo_em FROM estado_por_item
          WHERE user_id = ${userId} AND card_id = ${cardId} ORDER BY jogo`,
      ),
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
      (tx) => tx.execute(sql`DELETE FROM agregados_diarios WHERE user_id = ${userId}`),
      (tx) => tx.execute(sql`DELETE FROM estado_por_item WHERE user_id = ${userId}`),
      (tx) => tx.execute(sql`DELETE FROM estado_dos_agregados WHERE user_id = ${userId}`),
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
  const linhas = linhasDe<{
    q: number
    idioma: string
    grade: number | null
    viva: number
    nova: number
    n: number
    ms: number
    com: number
    soma: number
  }>(
    await tx.execute(sql`
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
    WHERE r.user_id = ${userId} AND ${onde ?? sql`TRUE`}
    GROUP BY 1, 2, 3, 4, 5`),
  )
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
 * O AJUSTE INCREMENTAL da limpeza diária, por lote de revisões apagadas de vez (na mesma transação curta
 * que as apaga, com a trava do usuário): `celulas` são as células DESSAS revisões (`agregarPorDia` sobre
 * `gruposDeRevisoes` do lote, antes do DELETE). Cada contador da célula sai do agregado e as revisões e
 * acertos entram em `revisoes_purgadas`/`acertos_purgados` — o que a reconstrução completa faria, sem
 * recontar o usuário inteiro a cada lote. `apagadas` (linhas de `review_logs` que saíram) sobe
 * `marca_vista` junto com o `marca_bruto` que o gatilho do DELETE subiu: o leitor não reconta à toa.
 * Célula ausente (agregado nunca montado) nasce com os contadores negativos e as purgadas; a reconstrução
 * completa do fim do usuário reconta os contadores do bruto e preserva as purgadas.
 */
export async function purgarNaTransacao(
  tx: Tx,
  userId: UserId,
  celulas: CelulaDoDia[],
  apagadas: number,
  agora: number,
): Promise<void> {
  for (const lote of emLotes(celulas, 200)) {
    await tx.execute(sql`
      INSERT INTO agregados_diarios
        (user_id, idioma, dia, ${sql.raw(COLUNAS_SQL)}, revisoes_purgadas, acertos_purgados, atualizado_em)
      VALUES ${sql.join(
        lote.map(
          (c) =>
            sql`(${userId}, ${c.idioma}, ${c.dia}, ${sql.join(
              CONTADORES_DO_DIA.map((k) => sql`${-(c[k] ?? 0)}`),
              sql`, `,
            )}, ${c.revisoes}, ${c.acertos}, ${agora})`,
        ),
        sql`, `,
      )}
      ON CONFLICT (user_id, idioma, dia) DO UPDATE SET ${sql.raw(SOMA_SQL)},
        revisoes_purgadas = agregados_diarios.revisoes_purgadas + excluded.revisoes_purgadas,
        acertos_purgados = agregados_diarios.acertos_purgados + excluded.acertos_purgados,
        atualizado_em = excluded.atualizado_em`)
  }
  if (apagadas > 0) await marcarVistas(userId, apagadas)(tx)
}

/**
 * A reconstrução, dentro de uma transação que já tem a trava do usuário. Exportada para a limpeza
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

  /* Trava a linha de estado ANTES de ler o bruto: os gatilhos de quem grava revisão/rodada sobem
     `marca_bruto` nesta linha, então um escritor concorrente espera esta transação terminar (ou ela
     espera o dele) e nenhuma linha bruta entra entre a leitura e a gravação sem ser contada. No
     SQLite isso vinha do escritor único. */
  await tx.execute(sql`SELECT 1 FROM estado_dos_agregados WHERE user_id = ${userId} FOR UPDATE`)

  const revisoes = await gruposDeRevisoes(tx, userId)
  const itens = linhasDe<{ q: number; idioma: string; drill: number; n: number; certos: number; ms: number }>(
    await tx.execute(sql`
    SELECT CAST(e.created_at / ${QUARTO_DE_HORA} AS INTEGER) AS q,
           coalesce(c.src_lang_base, '') AS idioma,
           coalesce((e.kind = 'drill')::int, 0) AS drill,
           count(*) AS n,
           coalesce(sum(CASE WHEN e.correct > 0 THEN 1 ELSE 0 END), 0) AS certos,
           coalesce(sum(e.ms), 0) AS ms
    FROM exercise_results e LEFT JOIN vocab_cards c ON c.id = e.card_id
    WHERE e.user_id = ${userId} AND e.deleted_at IS NULL
    GROUP BY 1, 2, 3`),
  )
  const rodadas = linhasDe<{ em: number; idioma: string }>(
    await tx.execute(sql`
    SELECT min(e.created_at) AS em, min(coalesce(c.src_lang_base, '')) AS idioma
    FROM exercise_results e LEFT JOIN vocab_cards c ON c.id = e.card_id
    WHERE e.user_id = ${userId} AND e.deleted_at IS NULL AND e.round_id IS NOT NULL
    GROUP BY e.round_id`),
  )

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
  const antigas = linhasDe<{ idioma: string; dia: number; r: number; a: number }>(
    await tx.execute(sql`
    SELECT idioma, dia, revisoes_purgadas AS r, acertos_purgados AS a FROM agregados_diarios
    WHERE user_id = ${userId} AND (revisoes_purgadas <> 0 OR acertos_purgados <> 0)`),
  )
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

  await tx.execute(sql`DELETE FROM agregados_diarios WHERE user_id = ${userId}`)
  /* 3 de chave + os contadores + 2 purgadas + 1 carimbo, por linha. */
  for (const lote of emLotes([...linhas.values()], 200)) {
    await tx.execute(sql`
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

  /* O estado por item, inteiro em SQL. o último resultado é o da linha mais recente (`created_at` maior). */
  await tx.execute(sql`DELETE FROM estado_por_item WHERE user_id = ${userId}`)
  await tx.execute(sql`
    INSERT INTO estado_por_item (user_id, card_id, jogo, acertos, erros, ultimo_resultado, ultimo_em)
    SELECT ${userId}, card_id, exercise_kind,
           sum(CASE WHEN correct > 0 THEN 1 ELSE 0 END),
           sum(CASE WHEN correct > 0 THEN 0 ELSE 1 END),
           (array_agg(CASE WHEN correct > 0 THEN 1 ELSE 0 END ORDER BY created_at DESC, id DESC))[1],
           max(created_at)
    FROM exercise_results
    WHERE user_id = ${userId} AND deleted_at IS NULL AND card_id IS NOT NULL
      AND exercise_kind IS NOT NULL AND correct IS NOT NULL
    GROUP BY card_id, exercise_kind`)

  await tx.execute(sql`
    INSERT INTO estado_dos_agregados (user_id, fuso, marca_bruto, marca_vista, reconstruido_em)
    VALUES (${userId}, ${fuso}, 0, 0, ${agora})
    ON CONFLICT (user_id) DO UPDATE SET fuso = excluded.fuso, marca_vista = estado_dos_agregados.marca_bruto,
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
  const pendentes = linhasDe<{ user_id: string }>(
    await db.execute(sql`
    SELECT user_id FROM (
      SELECT DISTINCT user_id FROM review_logs WHERE user_id IS NOT NULL
      UNION SELECT DISTINCT user_id FROM exercise_results WHERE user_id IS NOT NULL
    ) AS u WHERE user_id NOT IN (SELECT user_id FROM estado_dos_agregados) LIMIT ${maximo + 1}`),
  )
  let preenchidos = 0
  for (const p of pendentes.slice(0, maximo)) {
    if (Date.now() > prazo) return { preenchidos, restam: true }
    await agregadosRepo.reconstruir(p.user_id as UserId)
    preenchidos += 1
  }
  return { preenchidos, restam: pendentes.length > maximo }
}
