/**
 * OS CONTADORES DA ADMISSÃO DE IA NO BANCO (tabela `admissao_de_ia`, migração 0005). Só SQL: quem decide
 * teto, plano e motivo de recusa é `server/ai/admissao.ts`.
 *
 * POR QUE NO BANCO. A conta do provedor é uma para o app inteiro; num Worker cada isolate teria o próprio
 * balde em memória, e a soma passaria do limite. A reserva é UMA instrução, atômica entre conexões:
 *
 *   INSERT … VALUES (chave, janela, custo) ON CONFLICT (chave, janela) DO UPDATE
 *     SET usado = eff + custo WHERE eff + exigido <= teto RETURNING usado
 *   eff = GREATEST(usado − GREATEST(agora − atualizado_em, 0) × taxa, 0)
 *
 * O `ON CONFLICT DO UPDATE` trava a linha e reavalia o `WHERE` sobre a versão mais nova dela: duas
 * conexões nunca somam além do teto. A linha que ainda não existe só nasce se `exigido <= teto`.
 *
 * O MINUTO É UM TOKEN BUCKET de verdade, com reabastecimento PREGUIÇOSO na própria instrução: a linha do
 * minuto (janela constante `min`) guarda o `usado` no instante `atualizado_em`, e quem chega desconta o que
 * escorreu desde então (`taxa` = limite por minuto / 60.000, por ms). Sem pico de 2× na virada do minuto e
 * com a espera de sempre (~3 s a 20 rpm). O DIA é janela fixa UTC (`YYYY-MM-DD`, `taxa` 0): é assim que o
 * provedor conta. `usado` é `double precision`: o saldo do minuto é fracionário; inteiros (o dia) ficam exatos
 * até 2^53, e o erro do fracionário (~1e-12) está abaixo da folga do teto.
 *
 * POR QUE NÃO UM DURABLE OBJECT. O spec da migração (`docs/specs/2026-10-19-migracao-cloudflare.md`) pede
 * o estado no Postgres: uma ida ao banco por admissão; o DO não nasce na América do Sul e o salto custaria
 * ~130 ms em cada fala.
 */
import { sql } from 'drizzle-orm'

import { db, linhas, linhasAfetadas } from '../db'

/** Os tipos de chamada de IA (o `TipoDeIa` de `server/ai/admissao.ts` deriva daqui). */
export const TIPOS_DE_IA = ['stt', 'llm', 'tts'] as const
type Tipo = (typeof TIPOS_DE_IA)[number]

/**
 * A vaga em voo parada há mais que isto é de um isolate que caiu: conta como zero. Por tipo, folgado sobre
 * a chamada mais longa que o tipo faz: STT e voz respondem em segundos (prazo de 30–60 s); o LLM inclui o
 * tutor e o polimento em lote, com prazos maiores.
 */
export const VOO_PARADO_MS: Record<Tipo, number> = { stt: 2 * 60_000, tts: 2 * 60_000, llm: 5 * 60_000 }

/** A janela constante do balde do minuto (token bucket): o tempo mora em `atualizado_em`. */
export const JANELA_DO_MINUTO = 'min'

/** Uma dimensão a reservar: `custo` entra em `usado` se `usado + exigido <= teto` (`exigido` padrão = `custo`). */
export interface Reserva {
  chave: string
  janela: string
  custo: number
  /** O que precisa caber no teto (o `tpm` admite com `min(tokens, teto)` e fica devendo o resto). */
  exigido?: number
  teto: number
  /** Reabastecimento por ms (o balde do minuto: limite / 60.000). Ausente/0: janela fixa, sem escorrer. */
  taxa?: number
}

export type ResultadoDaReserva =
  | { ok: true; /** `usado` de cada reserva depois desta, na ordem. */ usados: number[] }
  | {
      ok: false
      /** O balde está fechado pelo 429 do provedor até aqui (ms). */
      bloqueadoAte?: number
      /** Índices das reservas que não couberam. */
      recusadas: number[]
      /** `usado` EFETIVO (já reabastecido até `agora`) de cada reserva no que a instrução viu, na ordem. */
      usados: number[]
    }

interface LinhaDaReserva {
  i: number
  depois: number | null
  antes: number | null
  bloqueado_ate: number | null
}

/** A chave da vaga em voo de um usuário. */
export const chaveDeVoo = (userId: string, tipo: string) => `voo:${userId}:${tipo}`

const JANELA_DO_BLOQUEIO = 'bloqueio'
const JANELA_DO_VOO = 'total'

export const admissaoDeIaRepo = {
  /** UMA dimensão: reserva `custo` se couber no `teto`. Uma instrução. */
  async reservar(r: Reserva & { agora?: number }): Promise<boolean> {
    return (await admissaoDeIaRepo.reservarJuntas([r], { agora: r.agora ?? Date.now() })).ok
  },

  /**
   * VÁRIAS DIMENSÕES DE UMA VEZ (minuto, dia, pedidos, tokens), e o bloqueio do 429 de `bloqueio`, numa
   * instrução só. Tudo ou nada: a instrução só tenta inserir se TODAS cabem no que ela enxerga (a recusa
   * comum — o minuto cheio com o dia livre — não reserva nada); o `WHERE` do `ON CONFLICT` reconfere cada
   * linha travada. Se uma corrida fizer parte caber e parte não, as que couberam são desfeitas logo depois
   * (uma segunda instrução, só nesse caso). No intervalo entre as duas o erro é para menos — alguém pode
   * ser recusado à toa, nunca admitido além do teto. As linhas são tomadas sempre na ordem de `itens`
   * (minuto antes de dia), então duas reservas simultâneas não se travam em cruz.
   */
  async reservarJuntas(itens: Reserva[], o: { agora: number; bloqueio?: string }): Promise<ResultadoDaReserva> {
    const bloqueio = o.bloqueio ?? null
    if (itens.length === 0) {
      if (!bloqueio) return { ok: true, usados: [] }
      const r = linhas<{ ate: number }>(
        await db.execute(
          sql`SELECT bloqueado_ate AS ate FROM admissao_de_ia
            WHERE chave = ${bloqueio} AND janela = ${JANELA_DO_BLOQUEIO} AND bloqueado_ate > ${o.agora}`,
        ),
      )[0]
      return r ? { ok: false, bloqueadoAte: Number(r.ate), recusadas: [], usados: [] } : { ok: true, usados: [] }
    }
    const valores = sql.join(
      itens.map(
        (r, i) =>
          sql`(${i}::int, ${r.chave}::text, ${r.janela}::text, ${r.custo}::float8, ${r.exigido ?? r.custo}::float8, ${r.teto}::float8, ${r.taxa ?? 0}::float8)`,
      ),
      sql`, `,
    )
    const resultado = linhas<LinhaDaReserva>(
      await db.execute(sql`
        WITH pedido(i, chave, janela, custo, exigido, teto, taxa) AS (VALUES ${valores}),
        bloqueio AS (
          SELECT bloqueado_ate AS ate FROM admissao_de_ia
          WHERE chave = ${bloqueio}::text AND janela = ${JANELA_DO_BLOQUEIO} AND bloqueado_ate > ${o.agora}
        ),
        reservado AS (
          INSERT INTO admissao_de_ia AS a (chave, janela, usado, atualizado_em)
          SELECT p.chave, p.janela, p.custo, ${o.agora} FROM pedido p
          WHERE NOT EXISTS (SELECT 1 FROM bloqueio)
            AND NOT EXISTS (
              SELECT 1 FROM pedido q LEFT JOIN admissao_de_ia x ON x.chave = q.chave AND x.janela = q.janela
              WHERE COALESCE(GREATEST(x.usado - GREATEST(${o.agora} - x.atualizado_em, 0) * q.taxa, 0), 0)
                + q.exigido > q.teto)
          ORDER BY p.i
          ON CONFLICT (chave, janela) DO UPDATE
            SET usado = GREATEST(a.usado - GREATEST(${o.agora} - a.atualizado_em, 0)
                  * (SELECT p.taxa FROM pedido p WHERE p.chave = a.chave AND p.janela = a.janela), 0)
                + EXCLUDED.usado,
                atualizado_em = GREATEST(a.atualizado_em, EXCLUDED.atualizado_em)
            WHERE GREATEST(a.usado - GREATEST(${o.agora} - a.atualizado_em, 0)
                  * (SELECT p.taxa FROM pedido p WHERE p.chave = a.chave AND p.janela = a.janela), 0)
                + (SELECT p.exigido FROM pedido p WHERE p.chave = a.chave AND p.janela = a.janela)
              <= (SELECT p.teto FROM pedido p WHERE p.chave = a.chave AND p.janela = a.janela)
          RETURNING a.chave, a.janela, a.usado
        )
        SELECT p.i, r.usado AS depois,
          GREATEST(x.usado - GREATEST(${o.agora} - x.atualizado_em, 0) * p.taxa, 0) AS antes,
          (SELECT ate FROM bloqueio) AS bloqueado_ate
        FROM pedido p
        LEFT JOIN reservado r ON r.chave = p.chave AND r.janela = p.janela
        LEFT JOIN admissao_de_ia x ON x.chave = p.chave AND x.janela = p.janela
        ORDER BY p.i`),
    )
    const nulas = resultado.filter((l) => l.depois === null).map((l) => Number(l.i))
    if (nulas.length === 0) return { ok: true, usados: resultado.map((l) => Number(l.depois)) }
    /* Nada reservado: foi a conferência prévia (ou o bloqueio). As recusadas são as que já não cabiam no
       que a instrução viu; numa corrida em que nenhuma aparece cheia, todas. */
    const cheias = resultado
      .filter((l) => Number(l.antes ?? 0) + (itens[l.i].exigido ?? itens[l.i].custo) > itens[l.i].teto)
      .map((l) => Number(l.i))
    const recusadas = nulas.length === resultado.length && cheias.length ? cheias : nulas
    // Desfaz as que couberam (só quando parte coube): a reserva é tudo ou nada.
    const desfazer = resultado
      .filter((l) => l.depois !== null)
      .map((l) => ({ chave: itens[l.i].chave, janela: itens[l.i].janela, delta: -itens[l.i].custo }))
    if (desfazer.length) await admissaoDeIaRepo.ajustar(desfazer, o.agora)
    const bloqueadoAte = resultado[0]?.bloqueado_ate
    return {
      ok: false,
      ...(bloqueadoAte !== null && bloqueadoAte !== undefined ? { bloqueadoAte: Number(bloqueadoAte) } : {}),
      recusadas,
      usados: resultado.map((l) => Number(l.antes ?? 0)),
    }
  },

  /**
   * Soma `delta` (positivo ou negativo) ao `usado` de cada janela, sem passar de zero para baixo, numa
   * instrução. A linha que não existe nasce com `max(delta, 0)`. Devolver um pedido, acertar os tokens
   * reais e desfazer uma reserva parcial passam por aqui. NÃO renova `atualizado_em` da linha existente:
   * no balde do minuto, isso apagaria o reabastecimento que escorreu desde a última reserva.
   */
  async ajustar(itens: Array<{ chave: string; janela: string; delta: number }>, agora = Date.now()): Promise<void> {
    const reais = itens.filter((i) => Number.isFinite(i.delta) && i.delta !== 0)
    if (reais.length === 0) return
    const valores = sql.join(
      reais.map((r) => sql`(${r.chave}::text, ${r.janela}::text, ${r.delta}::float8)`),
      sql`, `,
    )
    await db.execute(sql`
      WITH v(chave, janela, delta) AS (VALUES ${valores})
      INSERT INTO admissao_de_ia AS a (chave, janela, usado, atualizado_em)
      SELECT v.chave, v.janela, GREATEST(v.delta, 0), ${agora} FROM v
      ON CONFLICT (chave, janela) DO UPDATE
        SET usado = GREATEST(a.usado + (SELECT v.delta FROM v WHERE v.chave = a.chave AND v.janela = a.janela), 0)`)
  },

  /** O `usado` efetivo (reabastecido até `agora`) de cada (chave, janela), e o bloqueio. Uma instrução. Só leitura. */
  async ler(
    itens: Array<{ chave: string; janela: string; taxa?: number }>,
    bloqueio: string,
    agora: number,
  ): Promise<{ usados: number[]; bloqueadoAte: number }> {
    const pares = [...itens, { chave: bloqueio, janela: JANELA_DO_BLOQUEIO, taxa: 0 }]
    const valores = sql.join(
      pares.map((p, i) => sql`(${i}::int, ${p.chave}::text, ${p.janela}::text, ${p.taxa ?? 0}::float8)`),
      sql`, `,
    )
    const r = linhas<{ i: number; usado: number | null; bloqueado_ate: number | null }>(
      await db.execute(sql`
        WITH p(i, chave, janela, taxa) AS (VALUES ${valores})
        SELECT p.i, GREATEST(x.usado - GREATEST(${agora} - x.atualizado_em, 0) * p.taxa, 0) AS usado, x.bloqueado_ate
        FROM p
        LEFT JOIN admissao_de_ia x ON x.chave = p.chave AND x.janela = p.janela
        ORDER BY p.i`),
    )
    const ate = Number(r[itens.length]?.bloqueado_ate ?? 0)
    return {
      usados: r.slice(0, itens.length).map((l) => Number(l.usado ?? 0)),
      bloqueadoAte: ate > agora ? ate : 0,
    }
  },

  /**
   * O 429 DO PROVEDOR: fecha o balde `chave` até `ate` (ms), em todas as instâncias. Coluna própria, e não
   * `usado = teto`: o prazo é o do `Retry-After`, não o do reabastecimento do balde. Só estende (um 429 com
   * espera menor não encurta o bloqueio de outro).
   */
  async bloquearAte(chave: string, ate: number, agora = Date.now()): Promise<void> {
    await db.execute(sql`
      INSERT INTO admissao_de_ia AS a (chave, janela, bloqueado_ate, atualizado_em)
      VALUES (${chave}, ${JANELA_DO_BLOQUEIO}, ${ate}, ${agora})
      ON CONFLICT (chave, janela) DO UPDATE
        SET bloqueado_ate = GREATEST(a.bloqueado_ate, EXCLUDED.bloqueado_ate), atualizado_em = EXCLUDED.atualizado_em`)
  },

  /**
   * OCUPA UMA VAGA EM VOO do usuário se houver (`em_voo < max`). Uma instrução. A linha parada há mais de
   * `VOO_PARADO_MS[tipo]` (ninguém entrou nesse tempo) conta como zero: a vaga que um isolate derrubado
   * não soltou não trava a pessoa para sempre.
   */
  async entrarEmVoo(userId: string, tipo: Tipo, max: number, agora = Date.now()): Promise<boolean> {
    const parado = agora - VOO_PARADO_MS[tipo]
    const r = await db.execute(sql`
      INSERT INTO admissao_de_ia AS a (chave, janela, em_voo, atualizado_em)
      SELECT ${chaveDeVoo(userId, tipo)}::text, ${JANELA_DO_VOO}::text, 1, ${agora}::bigint WHERE 1 <= ${max}::int
      ON CONFLICT (chave, janela) DO UPDATE
        SET em_voo = (CASE WHEN a.atualizado_em < ${parado} THEN 0 ELSE a.em_voo END) + 1,
            atualizado_em = EXCLUDED.atualizado_em
        WHERE (CASE WHEN a.atualizado_em < ${parado} THEN 0 ELSE a.em_voo END) + 1 <= ${max}::int
      RETURNING a.em_voo`)
    return linhas(r).length > 0
  },

  /** Solta uma vaga em voo (nunca abaixo de zero). Não renova `atualizado_em`: quem marca a vida é a entrada. */
  async sairDeVoo(userId: string, tipo: Tipo): Promise<void> {
    await db.execute(sql`
      UPDATE admissao_de_ia SET em_voo = GREATEST(em_voo - 1, 0)
      WHERE chave = ${chaveDeVoo(userId, tipo)} AND janela = ${JANELA_DO_VOO}`)
  },

  /**
   * Apaga o que não foi tocado desde `antesDe` (baldes de minuto parados, dias passados, bloqueios
   * vencidos, vagas em voo paradas). A limpeza diária chama com 2 dias. Teto de 5.000 linhas por passada
   * e `SKIP LOCKED` (a linha que uma reserva segura agora fica para a próxima), como a poda de `travas`.
   * Devolve quantas linhas saíram.
   */
  async podar(antesDe: number): Promise<number> {
    return linhasAfetadas(
      await db.execute(sql`DELETE FROM admissao_de_ia WHERE (chave, janela) IN (
        SELECT chave, janela FROM admissao_de_ia
        WHERE atualizado_em < ${antesDe} AND bloqueado_ate < ${antesDe}
        LIMIT 5000 FOR UPDATE SKIP LOCKED)`),
    )
  },

  /** Só para os testes: esquece tudo. */
  async esquecerTudo(): Promise<void> {
    await db.execute(sql`DELETE FROM admissao_de_ia`)
  },
}
