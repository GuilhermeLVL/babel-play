/**
 * O RESUMO DOS CARTÕES — o que `GET /api/vocab/resumo` devolve (a tela Cartões).
 *
 * A tela só precisa de contagens, e a rota que existia (`GET /api/vocab`) devolve o baralho inteiro
 * para o cliente contar. Aqui o servidor conta, com QUATRO consultas estreitas:
 *
 *   1. os cartões vivos, só com as dez colunas que decidem fase, vencimento e baralho (leitura
 *      compacta: uma célula, sem um objeto do driver por linha — `server/db/leituraCompacta.ts`);
 *   2. os pares distintos cartão × origem de Anki e Trilha (`idx_occ_origem`);
 *   3. a contagem de revisões de sempre;
 *   4. as revisões dos últimos 84 dias, JÁ AGRUPADAS por dia e nota no SQLite: no máximo
 *      84 × 5 linhas, por maior que seja o histórico (`idx_review_user`).
 *
 * O contrato, com a definição de cada número, é `src/core/learning/resumoDosCartoes.ts`. As fases
 * são as do cliente (`fsrsStateOf`, `src/data/rotas/vocabulario.ts`) e `in_deck` nulo conta como no
 * baralho (`rowToVocabCard`, no mesmo arquivo): o número da tela tem de ser o que a Revisão abre.
 *
 * Tudo o que não é `suspensas` conta SÓ cartão no baralho: um idioma, uma sessão ou um baralho do
 * Anki que só tem cartão suspenso não aparece na lista.
 */
import { sql } from 'drizzle-orm'

import {
  type BaralhoNoResumo,
  type ContagemDeFila,
  DIAS_DA_PREVISAO,
  DIAS_DO_CALENDARIO,
  ERROS_DE_DIFICIL,
  ESTABILIDADE_MADURA,
  type Lembradas,
  MAXIMO_DE_SESSOES,
  type ResumoDosCartoes,
} from '../../../src/core/learning/resumoDosCartoes'
import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { type ColunaCompacta, lerCompacto } from '../leituraCompacta'

const DIA = 86_400_000
const SEMANAS_DA_RETENCAO = 8

interface LinhaDeCartao {
  id: string
  inDeck: number | null
  dueAt: number | null
  stability: number | null
  reps: number | null
  lapses: number | null
  idioma: string | null
  sessionId: string | null
  addedAt: number | null
  createdAt: number | null
}

const COLUNAS_DO_RESUMO: ColunaCompacta[] = [
  ['id', 'id', 'texto'],
  ['inDeck', 'in_deck'],
  ['dueAt', 'due_at'],
  ['stability', 'stability'],
  ['reps', 'reps'],
  ['lapses', 'lapses'],
  // Coluna gerada: `lower(substr(coalesce(src_lang,''),1,2))`, a mesma base que o filtro de idioma usa.
  ['idioma', 'src_lang_base', 'texto'],
  ['sessionId', 'session_id', 'texto'],
  ['addedAt', 'added_at'],
  ['createdAt', 'created_at'],
]

type Fase = keyof ContagemDeFila

/** O que as origens (Anki, Trilha) precisam saber de um cartão do baralho. */
interface CartaoNoBaralho {
  fase: Fase
  vence: boolean
}

type Acumulado = BaralhoNoResumo & { recente: number }

function somar(mapa: Map<string, Acumulado>, id: string, c: CartaoNoBaralho, quando = 0) {
  let b = mapa.get(id)
  if (!b) {
    b = { id, total: 0, novas: 0, aprendendo: 0, revisar: 0, recente: 0 }
    mapa.set(id, b)
  }
  b.total += 1
  if (c.vence) b[c.fase] += 1
  if (quando > b.recente) b.recente = quando
}

const semRecente = ({ id, total, novas, aprendendo, revisar }: Acumulado): BaralhoNoResumo => ({
  id,
  total,
  novas,
  aprendendo,
  revisar,
})

/** Os maiores primeiro; o id desempata, para a ordem não depender da ordem das linhas. */
const porTamanho = (a: Acumulado, b: Acumulado) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const porRecente = (a: Acumulado, b: Acumulado) => b.recente - a.recente || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const lembradasVazias = (): Lembradas => ({ total: 0, lembradas: 0 })

export async function resumoDosCartoes(
  userId: UserId,
  { agora, inicioDoDia }: { agora: number; inicioDoDia: number },
): Promise<ResumoDosCartoes> {
  /* O primeiro dia do calendário: o dia k atrás é [inicioDoDia - k·DIA, inicioDoDia - (k-1)·DIA). */
  const inicioDoCalendario = inicioDoDia - (DIAS_DO_CALENDARIO - 1) * DIA

  const [cartoes, origens, deSempre, revisoes] = await Promise.all([
    lerCompacto<LinhaDeCartao>(COLUNAS_DO_RESUMO, {
      tabela: 'vocab_cards',
      onde: sql`user_id = ${userId} AND deleted_at IS NULL`,
    }),
    /* DISTINCT, como em `vocabRepo.list`: a mesma nota pode gerar mais de uma ocorrência para o
       mesmo cartão (reimportação, ativação em lote). */
    lerCompacto<{ cardId: string; tipo: string; ref: string | null }>(
      [
        ['cardId', 'card_id', 'texto'],
        ['tipo', 'origin_kind', 'texto'],
        ['ref', 'origin_ref', 'texto'],
      ],
      {
        tabela: 'vocab_occurrences',
        onde: sql`user_id = ${userId} AND deleted_at IS NULL AND origin_kind IN (${'anki'}, ${'trilha'})`,
        distinta: true,
      },
    ),
    db.all<{ n: number }>(sql`SELECT count(*) AS n FROM review_logs WHERE user_id = ${userId} AND deleted_at IS NULL`),
    /* A data da revisão é `reviewed_at`, ou `created_at` nas linhas antigas que não a têm. O filtro
       é escrito em dois ramos (em vez de `coalesce(...) >= ?`) para `idx_review_user`
       (user_id, reviewed_at) servir aos dois. O CAST trunca o quociente; o filtro garante que ele
       não é negativo, então truncar é o piso. */
    db.all<{ dia: number; nota: number | null; n: number }>(sql`
      SELECT CAST((coalesce(reviewed_at, created_at) - ${inicioDoCalendario}) / ${DIA} AS INTEGER) AS dia,
             grade AS nota, count(*) AS n
      FROM review_logs
      WHERE user_id = ${userId} AND deleted_at IS NULL
        AND (reviewed_at >= ${inicioDoCalendario} OR (reviewed_at IS NULL AND created_at >= ${inicioDoCalendario}))
      GROUP BY 1, 2`),
  ])

  const hoje: ContagemDeFila = { novas: 0, aprendendo: 0, revisar: 0 }
  const fases = { novas: 0, aprendendo: 0, jovens: 0, maduras: 0 }
  const previsao = new Array<number>(DIAS_DA_PREVISAO + 1).fill(0)
  const idiomas = new Map<string, Acumulado>()
  const sessoes = new Map<string, Acumulado>()
  const noBaralho = new Map<string, CartaoNoBaralho>()
  let total = 0
  let suspensas = 0
  let dificeis = 0
  let guardadas = 0

  for (const c of cartoes) {
    if (c.inDeck != null && c.inDeck !== 1) {
      suspensas += 1
      continue
    }
    total += 1
    const fase: Fase = c.stability == null ? 'novas' : (c.reps ?? 0) < 2 ? 'aprendendo' : 'revisar'
    const vence = c.dueAt != null && c.dueAt <= agora
    const cartao: CartaoNoBaralho = { fase, vence }
    noBaralho.set(c.id, cartao)

    if (fase === 'revisar') fases[(c.stability as number) < ESTABILIDADE_MADURA ? 'jovens' : 'maduras'] += 1
    else fases[fase] += 1
    if (vence) hoje[fase] += 1
    if (c.stability == null && c.dueAt == null) guardadas += 1
    if ((c.lapses ?? 0) >= ERROS_DE_DIFICIL) dificeis += 1
    if (c.dueAt != null) {
      const dia = Math.max(0, Math.floor((c.dueAt - inicioDoDia) / DIA))
      if (dia <= DIAS_DA_PREVISAO) previsao[dia] += 1
    }
    if (c.idioma) somar(idiomas, c.idioma, cartao)
    if (c.sessionId) somar(sessoes, c.sessionId, cartao, c.addedAt ?? c.createdAt ?? 0)
  }

  const anki = new Map<string, Acumulado>()
  const daTrilha = new Set<string>()
  const trilha: ContagemDeFila & { total: number } = { total: 0, novas: 0, aprendendo: 0, revisar: 0 }
  for (const o of origens) {
    const cartao = noBaralho.get(o.cardId)
    if (!cartao) continue
    if (o.tipo === 'anki') {
      if (o.ref) somar(anki, o.ref, cartao)
    } else if (!daTrilha.has(o.cardId)) {
      // A Trilha é uma só: o cartão conta uma vez, tenha quantas ocorrências (e idiomas) tiver.
      daTrilha.add(o.cardId)
      trilha.total += 1
      if (cartao.vence) trilha[cartao.fase] += 1
    }
  }

  const calendario = new Array<number>(DIAS_DO_CALENDARIO).fill(0)
  const d7 = lembradasVazias()
  const d30 = lembradasVazias()
  const semanas = Array.from({ length: SEMANAS_DA_RETENCAO }, lembradasVazias)
  const botoes: [number, number, number, number] = [0, 0, 0, 0]
  let revisadasHoje = 0
  for (const r of revisoes) {
    const n = Number(r.n)
    /* Uma revisão carimbada depois do fim do dia pedido (relógios diferentes) fica em "hoje":
       `revisadasHoje` é "desde o começo do dia". */
    const posicao = Math.min(DIAS_DO_CALENDARIO - 1, Math.max(0, Number(r.dia)))
    const diasAtras = DIAS_DO_CALENDARIO - 1 - posicao
    calendario[posicao] += n
    if (diasAtras === 0) revisadasHoje += n
    // Sem nota (linha antiga) a revisão aconteceu, mas não diz se a palavra foi lembrada.
    const nota = r.nota == null ? 0 : Number(r.nota)
    if (nota < 1 || nota > 4) continue
    const lembradas = nota >= 2 ? n : 0
    if (diasAtras < 7) {
      d7.total += n
      d7.lembradas += lembradas
    }
    if (diasAtras < 30) {
      d30.total += n
      d30.lembradas += lembradas
      botoes[nota - 1] += n
    }
    const semana = Math.floor(diasAtras / 7)
    if (semana < SEMANAS_DA_RETENCAO) {
      const s = semanas[SEMANAS_DA_RETENCAO - 1 - semana]
      s.total += n
      s.lembradas += lembradas
    }
  }

  return {
    agora,
    inicioDoDia,
    total,
    suspensas,
    idiomas: idiomas.size,
    dificeis,
    revisoesDeSempre: Number(deSempre[0]?.n ?? 0),
    revisadasHoje,
    hoje,
    guardadas,
    fases,
    previsao,
    calendario,
    retencao: { d7, d30, semanas },
    botoes,
    baralhos: {
      idiomas: [...idiomas.values()].sort(porTamanho).map(semRecente),
      sessoes: [...sessoes.values()].sort(porRecente).slice(0, MAXIMO_DE_SESSOES).map(semRecente),
      anki: [...anki.values()].sort(porTamanho).map(semRecente),
      trilha: trilha.total ? trilha : null,
    },
  }
}
