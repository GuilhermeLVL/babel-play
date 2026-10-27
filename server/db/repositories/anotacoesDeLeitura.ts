/**
 * AS ANOTAÇÕES DO LEITOR (migração 0013, L2 de Livros & Leitura) — a tabela `anotacoes_de_leitura` e nada
 * mais. O que é uma anotação válida mora em `src/core/leitura/anotacao.ts` (o mesmo módulo do cliente).
 *
 * POSSE PELA CHAVE: a chave primária é `(user_id, id)`. Um id que outra pessoa já usa não colide nem
 * sobrescreve a linha dela — vira uma linha NOVA desta pessoa. Por isso não existe caminho de IDOR:
 * toda leitura, escrita e lápide filtra pelo `user_id` do pedido, nunca pelo `id` sozinho.
 *
 * O CONFLITO é "última escrita vence" por `max(atualizado_em, apagado_em)` (o relógio do APARELHO), decidido no
 * banco (`ON CONFLICT … WHERE`), e não num "lê, compara, grava" que dois aparelhos atravessariam juntos.
 *
 * A SINCRONIZAÇÃO (o que cada aparelho ainda não recebeu) é outra coisa: o cursor é `(sincronizado_em, id)`, o
 * relógio do SERVIDOR posto em toda escrita (`proximoRelogio`). Comparar o relógio do aparelho com o cursor perdia
 * a escrita feita sem rede, com data antiga, que sobe depois que o outro aparelho já leu.
 *
 * TETOS (`TETOS_DAS_ANOTACOES`, os três num lugar só): vivas por livro, vivas por pessoa e livros distintos
 * com anotação viva — cobrados sob a trava do usuário (como o glossário). Não dependem de plano (anotar é
 * grátis para todos), por isso moram aqui e não em `src/core/planos.ts`: são tetos de abuso, não cota. O
 * teto por pessoa e o de livros fecham o desvio de inventar `livro_id` novos para fugir do teto por livro.
 * "Nova viva" inclui a RESSURREIÇÃO: uma lápide que volta a `apagado_em = null` ocupa vaga como uma nova.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  type AnotacaoDeLeitura,
  type CorDeAnotacao,
  ehLivroTrazido,
  MAX_CITACAO_POR_LIVRO_TRAZIDO,
  type TipoDeAnotacao,
} from '../../../src/core/leitura/anotacao'
import type { UserId } from '../../lib/authContext'
import { db, emTransacao, type ExecutorDb, linhas, linhasAfetadas, travarUsuario } from '../db'
import { anotacoesDeLeitura as t } from '../schema'

/**
 * Os tetos. `porLivro`: um livro inteiro grifado frase a frase tem poucos milhares (vivas). `porPessoa`: dez
 * livros desses (vivas). `livros`: uma biblioteca grande de quem anota tudo o que lê (livros com alguma viva).
 * `linhasPorPessoa`: TODAS as linhas da pessoa, lápides incluídas — a trava de segurança do armazenamento (a
 * lápide não tem conteúdo, mas ocupa linha); a limpeza diária poda as lápides com mais de `DIAS_DA_LAPIDE`.
 */
export const TETOS_DAS_ANOTACOES = {
  porLivro: 5_000,
  porPessoa: 50_000,
  livros: 1_000,
  linhasPorPessoa: 100_000,
} as const
export type TetosDasAnotacoes = { porLivro: number; porPessoa: number; livros: number; linhasPorPessoa: number }
/**
 * Por quantos dias a lápide fica para os outros aparelhos a receberem. Um aparelho parado mais do que isso
 * pode reenviar a anotação apagada como viva — é o preço de não guardar lápide para sempre.
 */
export const DIAS_DA_LAPIDE = 90
/** Teto de uma leitura (uma página da sincronização). */
export const MAX_POR_LEITURA = 2_000

type Linha = typeof t.$inferSelect

function paraAnotacao(l: Linha): AnotacaoDeLeitura {
  return {
    id: l.id,
    livroId: l.livroId,
    tipo: l.tipo as TipoDeAnotacao,
    alvo: {
      cfi: l.cfi,
      citacao: { exact: l.exact, prefix: l.prefixo, suffix: l.sufixo },
      ...(l.capitulo ? { capitulo: l.capitulo } : {}),
    },
    cor: l.cor as CorDeAnotacao,
    nota: l.nota,
    ...(l.palavra ? { palavra: l.palavra } : {}),
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
    apagadoEm: l.apagadoEm ?? null,
  }
}

export type MotivoDeRecusa = 'livro_cheio' | 'pessoa_cheia' | 'livros_demais' | 'linhas_demais' | 'citacao_demais'
export type ResultadoDoLote = {
  gravadas: AnotacaoDeLeitura[]
  recusadas: Array<{ id: string; motivo: MotivoDeRecusa }>
  /** Lápides de id que a pessoa não tem: não há o que apagar, e nenhuma linha nasce. */
  ignoradas: string[]
}

/** O cursor da sincronização: o relógio do servidor da última linha lida, e o `id` de desempate. */
export interface CursorDaLeitura {
  s: number
  id: string
}
export const cursorParaTexto = (c: CursorDaLeitura) => `${c.s}:${c.id}`
export function cursorDoTexto(x: string): CursorDaLeitura | null {
  const m = /^(\d{1,16}):([A-Za-z0-9_-]{1,64})$/.exec(x)
  return m ? { s: Number(m[1]), id: m[2] } : null
}

export interface PaginaDeAnotacoes {
  anotacoes: AnotacaoDeLeitura[]
  /** Onde a próxima página começa (o mesmo de entrada, se a página veio vazia). */
  cursor: CursorDaLeitura | null
  temMais: boolean
}

/**
 * A LÁPIDE SEM CONTEÚDO: fica só o que a sincronização precisa (id, livro, tipo, cor e as datas). Trecho, nota,
 * palavra, capítulo e CFI saem no momento em que a anotação é apagada — o servidor não guarda o que a pessoa
 * mandou apagar.
 */
const SEM_CONTEUDO = { cfi: '', exact: '', prefixo: '', sufixo: '', capitulo: null, nota: '', palavra: null } as const

const marca = (atualizadoEm: number, apagadoEm: number | null) => Math.max(atualizadoEm, apagadoEm ?? 0)
const caracteres = (s: string) => Array.from(s).length

/**
 * O PRÓXIMO VALOR DO RELÓGIO DO SERVIDOR para esta pessoa: o relógio da máquina, mas nunca menor que o maior já
 * dado + 1. Chamado SOB a trava do usuário: as escritas da pessoa saem em fila, e uma transação só ganha um valor
 * depois que a anterior terminou — por isso quem lê com o cursor `(s, id)` nunca pula uma linha que ainda ia
 * aparecer "atrás" dele. O relógio do aparelho não entra nessa conta.
 */
async function proximoRelogio(tx: ExecutorDb, userId: UserId, agora: number): Promise<number> {
  const [{ s }] = linhas<{ s: number | string | null }>(
    await tx.execute(sql`SELECT MAX(sincronizado_em) AS s FROM ${t} WHERE user_id = ${userId}`),
  )
  return Math.max(agora, Number(s ?? 0) + 1)
}

type Guardada = { livroId: string; atualizadoEm: number; apagadoEm: number | null; exact: string }

export const anotacoesDeLeituraRepo = {
  /**
   * Uma PÁGINA das anotações da pessoa — de um livro ou de todos —, inclusive as lápides, escritas no servidor
   * DEPOIS do `cursor` (a sincronização incremental), na ordem `(sincronizado_em, id)`. `temMais` = há outra
   * página; o cliente só guarda o cursor quando chega ao fim.
   */
  async listar(
    userId: UserId,
    opcoes: { livroId?: string; cursor?: CursorDaLeitura | null; limite?: number } = {},
  ): Promise<PaginaDeAnotacoes> {
    const limite = Math.max(1, Math.min(opcoes.limite ?? MAX_POR_LEITURA, MAX_POR_LEITURA))
    const filtros = [eq(t.userId, userId)]
    if (opcoes.livroId) filtros.push(eq(t.livroId, opcoes.livroId))
    if (opcoes.cursor) filtros.push(sql`(${t.sincronizadoEm}, ${t.id}) > (${opcoes.cursor.s}, ${opcoes.cursor.id})`)
    const rows = await db
      .select()
      .from(t)
      .where(and(...filtros))
      .orderBy(t.sincronizadoEm, t.id)
      .limit(limite + 1)
    const temMais = rows.length > limite
    const pagina = temMais ? rows.slice(0, limite) : rows
    const ultima = pagina.at(-1)
    return {
      anotacoes: pagina.map(paraAnotacao),
      cursor: ultima ? { s: ultima.sincronizadoEm, id: ultima.id } : (opcoes.cursor ?? null),
      temMais,
    }
  },

  /**
   * Grava um lote (já validado). Cada anotação entra se for nova ou mais recente que a guardada (pelo
   * `atualizado_em`/`apagado_em` do aparelho: só o desempate do conflito); a mais velha perde em silêncio e a
   * resposta devolve a que ficou valendo. Toda linha que muda ganha o `sincronizado_em` do servidor. Uma escrita
   * que faria uma anotação VIVA nascer — nova, ou lápide ressuscitada — passa pelos tetos (`livro_cheio`,
   * `pessoa_cheia`, `livros_demais`); a citação de livro TRAZIDO, pelo teto somado (`citacao_demais`). `tetos` e
   * `agora` são injetáveis só para o teste.
   */
  async gravarLote(
    userId: UserId,
    lote: readonly AnotacaoDeLeitura[],
    tetos: TetosDasAnotacoes = TETOS_DAS_ANOTACOES,
    agora = Date.now(),
  ): Promise<ResultadoDoLote> {
    const recusadas: ResultadoDoLote['recusadas'] = []
    const ignoradas: string[] = []
    await emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      const relogio = await proximoRelogio(tx, userId, agora)
      /* A contagem das vivas, UMA vez por lote e sob a trava: por livro, o total e os livros distintos — e os
         caracteres de citação viva de cada livro. */
      const porLivro = new Map<string, number>()
      const citacaoPorLivro = new Map<string, number>()
      for (const r of linhas<{ livro_id: string; n: number | string; c: number | string | null }>(
        await tx.execute(
          sql`SELECT livro_id, COUNT(*) AS n, SUM(char_length(exact)) AS c FROM ${t} WHERE user_id = ${userId} AND apagado_em IS NULL GROUP BY livro_id`,
        ),
      )) {
        porLivro.set(r.livro_id, Number(r.n))
        citacaoPorLivro.set(r.livro_id, Number(r.c ?? 0))
      }
      let total = [...porLivro.values()].reduce((s, n) => s + n, 0)
      const [{ n: linhasBrutas }] = linhas<{ n: number | string }>(
        await tx.execute(sql`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ${userId}`),
      )
      let todasAsLinhas = Number(linhasBrutas)
      const vivas = (livroId: string) => porLivro.get(livroId) ?? 0
      const livrosVivos = () => [...porLivro.values()].filter((n) => n > 0).length
      /* As guardadas do lote inteiro numa consulta só (e não uma por anotação). */
      const guardadas = new Map<string, Guardada>()
      const idsDoLote = [...new Set(lote.map((a) => a.id))]
      if (idsDoLote.length) {
        const achadas = await tx
          .select({
            id: t.id,
            livroId: t.livroId,
            atualizadoEm: t.atualizadoEm,
            apagadoEm: t.apagadoEm,
            exact: t.exact,
          })
          .from(t)
          .where(and(eq(t.userId, userId), inArray(t.id, idsDoLote)))
        for (const { id, ...g } of achadas) guardadas.set(id, g)
      }
      const escritas = new Map<string, typeof t.$inferInsert>()
      for (const a of lote) {
        const guardada = guardadas.get(a.id)
        /* LÁPIDE DE ID DESCONHECIDO: nada a apagar. Não cria linha — senão um cliente encheria o banco de
           lápides, que nenhum teto de vivas conta. */
        if (!guardada && a.apagadoEm != null) {
          ignoradas.push(a.id)
          continue
        }
        if (!guardada && todasAsLinhas >= tetos.linhasPorPessoa) {
          recusadas.push({ id: a.id, motivo: 'linhas_demais' })
          continue
        }
        /* O livro que conta é o da linha guardada (o UPDATE não muda `livro_id`). A escrita só muda algo se
           vencer a guardada; se perder, não há o que contar. */
        const livroId = guardada?.livroId ?? a.livroId
        const vence = !guardada || marca(a.atualizadoEm, a.apagadoEm) > marca(guardada.atualizadoEm, guardada.apagadoEm)
        if (!vence) continue
        const estavaViva = !!guardada && guardada.apagadoEm == null
        const ficaViva = a.apagadoEm == null
        if (!estavaViva && ficaViva) {
          const motivo: MotivoDeRecusa | null =
            vivas(livroId) >= tetos.porLivro
              ? 'livro_cheio'
              : total >= tetos.porPessoa
                ? 'pessoa_cheia'
                : vivas(livroId) === 0 && livrosVivos() >= tetos.livros
                  ? 'livros_demais'
                  : null
          if (motivo) {
            recusadas.push({ id: a.id, motivo })
            continue
          }
        }
        /* O TETO SOMADO DA CITAÇÃO de livro trazido: conta o que a escrita acrescenta à viva de antes. */
        const antes = estavaViva ? caracteres(guardada.exact) : 0
        const depois = ficaViva ? caracteres(a.alvo.citacao.exact) : 0
        const soma = (citacaoPorLivro.get(livroId) ?? 0) - antes + depois
        if (ehLivroTrazido(livroId) && depois > antes && soma > MAX_CITACAO_POR_LIVRO_TRAZIDO) {
          recusadas.push({ id: a.id, motivo: 'citacao_demais' })
          continue
        }
        citacaoPorLivro.set(livroId, soma)
        if (!estavaViva && ficaViva) {
          porLivro.set(livroId, vivas(livroId) + 1)
          total++
        } else if (estavaViva && !ficaViva) {
          porLivro.set(livroId, Math.max(0, vivas(livroId) - 1))
          total--
        }
        if (!guardada) todasAsLinhas++
        const lapide = a.apagadoEm != null
        const valores = {
          userId,
          id: a.id,
          livroId,
          tipo: a.tipo,
          cfi: a.alvo.cfi,
          exact: a.alvo.citacao.exact,
          prefixo: a.alvo.citacao.prefix,
          sufixo: a.alvo.citacao.suffix,
          capitulo: a.alvo.capitulo ?? null,
          cor: a.cor,
          nota: a.nota,
          palavra: a.palavra ?? null,
          criadoEm: a.criadoEm,
          atualizadoEm: a.atualizadoEm,
          apagadoEm: a.apagadoEm,
          sincronizadoEm: relogio,
          ...(lapide ? SEM_CONTEUDO : {}),
        }
        /* A próxima versão do MESMO id neste lote compara com esta. */
        guardadas.set(a.id, { livroId, atualizadoEm: a.atualizadoEm, apagadoEm: a.apagadoEm, exact: valores.exact })
        escritas.set(a.id, valores)
      }
      for (const valores of escritas.values()) {
        /* O livro de uma anotação não muda: `livro_id` fica fora do UPDATE (um lote não "move" a anotação
           de outro livro para cá e fura o teto por esse caminho). */
        const mutaveis = {
          tipo: valores.tipo,
          cfi: valores.cfi,
          exact: valores.exact,
          prefixo: valores.prefixo,
          sufixo: valores.sufixo,
          capitulo: valores.capitulo,
          cor: valores.cor,
          nota: valores.nota,
          palavra: valores.palavra,
          atualizadoEm: valores.atualizadoEm,
          apagadoEm: valores.apagadoEm,
          sincronizadoEm: valores.sincronizadoEm,
        }
        await tx
          .insert(t)
          .values(valores)
          .onConflictDoUpdate({
            target: [t.userId, t.id],
            set: mutaveis,
            setWhere: sql`greatest(excluded.atualizado_em, coalesce(excluded.apagado_em, 0)) > greatest(${t.atualizadoEm}, coalesce(${t.apagadoEm}, 0))`,
          })
      }
    })
    const ids = lote.map((a) => a.id).filter((id) => !recusadas.some((r) => r.id === id) && !ignoradas.includes(id))
    const gravadas = ids.length
      ? (
          await db
            .select()
            .from(t)
            .where(and(eq(t.userId, userId), inArray(t.id, ids)))
        ).map(paraAnotacao)
      : []
    return { gravadas, recusadas, ignoradas }
  },

  /** Lápide numa anotação DA PESSOA. `false` = não existe (ou é de outra pessoa, que dá no mesmo). */
  async apagar(userId: UserId, id: string, agora = Date.now()): Promise<boolean> {
    return emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      const relogio = await proximoRelogio(tx, userId, agora)
      const r = await tx
        .update(t)
        .set({ apagadoEm: agora, sincronizadoEm: relogio, ...SEM_CONTEUDO })
        .where(and(eq(t.userId, userId), eq(t.id, id), isNull(t.apagadoEm)))
        .returning({ id: t.id })
      return r.length > 0
    })
  },

  /** A limpeza diária: apaga de vez as lápides com mais de `DIAS_DA_LAPIDE` dias (em lotes de 5 mil). */
  async podarLapides(agora = Date.now()): Promise<number> {
    const corte = agora - DIAS_DA_LAPIDE * 86_400_000
    return linhasAfetadas(
      await db.execute(sql`DELETE FROM anotacoes_de_leitura WHERE (user_id, id) IN (
        SELECT user_id, id FROM anotacoes_de_leitura WHERE apagado_em IS NOT NULL AND apagado_em < ${corte}
        LIMIT 5000 FOR UPDATE SKIP LOCKED)`),
    )
  },
}
