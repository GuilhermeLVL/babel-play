/**
 * A LIMPEZA DIÁRIA DO BANCO (change `modelo-do-aluno-e-dados`, tarefa 2.4; levantamento em
 * `docs/auditoria/2026-10-10-dados-metricas-e-selecao.md`, seção 3).
 *
 * POR QUE EXISTE. Apagar uma sessão, um cartão ou desfazer uma revisão só carimba `deleted_at`; a
 * linha ficava no banco para sempre, na tabela e em todos os índices. Aqui o que foi apagado há mais
 * de `LIMPEZA_RETENCAO_DIAS` (padrão 30) sai de vez. Os 30 dias são a janela em que um engano ainda
 * pode ser desfeito à mão por quem opera o banco.
 *
 * O QUE SAI, por usuário, EM LOTES de até 500 linhas, cada lote numa transação curta com a trava do
 * usuário (Fase 2, Task 9: nenhuma transação fica aberta enquanto o usuário inteiro é apagado; o teto de
 * lotes por passada deixa o resto para a passada seguinte, e cada lote é idempotente):
 *   · revisões desfeitas e revisões de cartão apagado;
 *   · ocorrências apagadas;
 *   · cartões apagados, com TODAS as ocorrências e revisões deles. `exercise_results.card_id` vira
 *     nulo (o resultado do jogo fica; `item_ref` guarda a palavra);
 *   · falas apagadas;
 *   · sessões apagadas, com todas as falas delas. `exercise_results.session_id` vira nulo.
 *
 * O QUE FICA DE PROPÓSITO, mesmo apagado há mais tempo:
 *   · cartão apagado que uma nota do Anki ainda aponta (`anki_notes.projected_card_id`): a projeção
 *     do Anki reaproveita esse cartão ao reativar a nota. Sai quando o baralho for purgado;
 *   · sessão apagada que ainda tem cartão (o cartão sobrevive à sessão por desenho, e o
 *     `session_id` dele entra nas métricas: zerá-lo mudaria palavras salvas e dias de prática).
 *
 * O QUE NÃO MUDA: a exclusão de conta (`contaRepo.excluir`) e a purga de baralho Anki. Áudio em disco
 * também não é daqui (a sessão apagada já teve o arquivo removido na hora).
 *
 * AS REVISÕES APAGADAS CONTINUAM CONTANDO NO PERFIL. O perfil sempre contou a revisão desfeita e a
 * de cartão apagado em `reviews`, no XP e nos dias de prática. Para o apagamento físico não tirar
 * XP de ninguém 30 dias depois, elas vão para `revisoes_purgadas`/`acertos_purgados` dos agregados
 * diários, na mesma transação do lote que as apaga, e o perfil as soma (`agregadosRepo.revisoesDoPerfil`).
 *
 * DEPOIS: confere os agregados de quem ficou com as marcas diferentes e, NO BANCO EMBUTIDO, roda
 * `ANALYZE` (`analisarBancoEmbutido`): o PGlite é de usuário único, sem autovacuum nem autoanalyze, e
 * a estatística do planejador só existe se alguém a pedir — era o papel do `PRAGMA optimize` no SQLite.
 * No Postgres de produção o autovacuum do servidor cuida disso, e a limpeza não roda ANALYZE. (O
 * checkpoint do WAL, que a passada fazia no SQLite, não tem equivalente.)
 *
 * O ARQUIVO NÃO ENCOLHE: `DELETE` deixa as tuplas mortas para o VACUUM (o autovacuum, no Postgres
 * de produção), que devolve o espaço à própria tabela para as próximas escritas. Encolher pede `VACUUM FULL`, que reescreve a tabela
 * com trava exclusiva e não é feito aqui.
 */
import { sql } from 'drizzle-orm'

import { agregarPorDia } from '../../src/core/learning/agregados'
import { diaNumeroNoFuso } from '../../src/core/learning/economia'
import {
  analisarBancoEmbutido,
  db,
  emTransacao,
  type ExecutorDb,
  linhas,
  linhasAfetadas,
  travarUsuario,
} from '../db/db'
import { admissaoDeIaRepo } from '../db/repositories/admissaoDeIa'
import {
  agregadosRepo,
  gruposDeRevisoes,
  purgarNaTransacao,
  reconstruirNaTransacao,
} from '../db/repositories/agregados'
import type { UserId } from './authContext'
import { diasAteApagarDeVez } from './config'
import { log } from './logger'

const DIA_MS = 86_400_000

export interface RelatorioDaLimpeza {
  /** O corte: o que foi apagado antes deste instante saiu. */
  corte: number
  /** Usuários de quem alguma linha saiu. */
  usuarios: number
  sessoes: number
  falas: number
  cartoes: number
  ocorrencias: number
  revisoes: number
  /** Usuários cujos agregados estavam atrás do bruto e foram recontados. */
  agregadosRecontados: number
  /** Chaves `u:` da tabela `travas` de quem não existe mais em `users`, podadas. */
  travasPodadas: number
  /** Linhas da admissão de IA (`admissao_de_ia`) sem uso há mais de 2 dias, podadas. */
  admissaoPodada: number
  /** Lotes (transações curtas) que a passada usou. */
  lotes: number
  /** O teto de lotes acabou antes do fim: o resto sai na passada seguinte. */
  incompleta: boolean
}

const afetadas = (r: unknown) => linhasAfetadas(r)

/** SQLSTATE do erro do driver (o drizzle o embrulha em `cause`). */
const codigoSql = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } } | null | undefined
  return e?.cause?.code ?? e?.code
}
/** Deadlock (40P01) ou falha de serialização (40001): vale tentar de novo. */
const transitorio = (err: unknown) => ['40P01', '40001'].includes(codigoSql(err) ?? '')

/** Linhas por lote: cada lote é uma transação curta (trava do usuário + uma instrução de apagar). */
const LOTE = 500
/** Teto de lotes por passada (somando todos os usuários): o que sobrar sai na passada seguinte. */
const MAX_LOTES = 200

/** O que a passada leva de um usuário para o outro: os totais e o orçamento de lotes. */
interface Andamento {
  lote: number
  lotesRestantes: number
  lotes: number
  sessoes: number
  falas: number
  cartoes: number
  ocorrencias: number
  revisoes: number
}

/**
 * Tudo de UM usuário, EM LOTES. Cada lote é uma transação curta que toma a trava do usuário, escolhe
 * até `lote` linhas de UM passo e as apaga (ou solta) numa instrução; entre um lote e outro nenhuma
 * transação fica aberta. Os passos vão na ordem das dependências e cada um só começa quando o anterior
 * se esgotou: revisões e ocorrências antes dos cartões, falas antes das sessões. Cada lote é idempotente
 * (as consultas recalculam o que sai), então um lote que falhou, ou uma passada que bateu no teto de
 * lotes, recomeça de onde parou na próxima vez. A trava do usuário é solta a cada lote (entre passos
 * também): uma escrita do próprio usuário pode entrar entre dois lotes, e o lote seguinte recalcula o que
 * sai. Devolve `false` se o teto acabou antes deste usuário.
 */
async function limparUsuario(userId: UserId, corte: number, agora: number, a: Andamento): Promise<boolean> {
  const fuso = await agregadosRepo.fusoGravado(userId)
  /* Os cartões que saem: apagados antes do corte e sem nota do Anki apontando para eles. */
  const cartoes = sql`(SELECT c.id FROM vocab_cards c
      WHERE c.user_id = ${userId} AND c.deleted_at IS NOT NULL AND c.deleted_at < ${corte}
        AND NOT EXISTS (SELECT 1 FROM anki_notes n WHERE n.projected_card_id = c.id))`
  /* As sessões que saem: apagadas antes do corte e sem cartão que ainda as cite (depois de os cartões
     acima terem saído — por isso os passos das sessões vêm depois do dos cartões). */
  const sessoes = sql`(SELECT s.id FROM sessions s
      WHERE s.user_id = ${userId} AND s.deleted_at IS NOT NULL AND s.deleted_at < ${corte}
        AND NOT EXISTS (SELECT 1 FROM vocab_cards c WHERE c.session_id = s.id))`
  const falasQueSaem = sql`(SELECT u.id FROM utterances u WHERE u.user_id = ${userId}
      AND ((u.deleted_at IS NOT NULL AND u.deleted_at < ${corte}) OR u.session_id IN ${sessoes}))`
  const n = a.lote

  /* Os passos. Cada um é UMA instrução sobre no máximo `n` linhas, e devolve quantas mexeu. */
  type Passo = { conta?: 'ocorrencias' | 'cartoes' | 'falas' | 'sessoes'; fazer: (tx: ExecutorDb) => Promise<number> }
  const passos: Passo[] = [
    {
      conta: 'ocorrencias',
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`DELETE FROM vocab_occurrences WHERE id IN (SELECT o.id FROM vocab_occurrences o
            WHERE o.user_id = ${userId}
              AND ((o.deleted_at IS NOT NULL AND o.deleted_at < ${corte}) OR o.card_id IN ${cartoes}) LIMIT ${n})`),
        ),
    },
    {
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`UPDATE exercise_results SET card_id = NULL WHERE id IN (SELECT e.id FROM exercise_results e
            WHERE e.user_id = ${userId} AND e.card_id IN ${cartoes} LIMIT ${n})`),
        ),
    },
    {
      conta: 'cartoes',
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`DELETE FROM vocab_cards WHERE id IN (SELECT id FROM ${cartoes} AS x LIMIT ${n})`),
        ),
    },
    {
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`UPDATE vocab_occurrences SET utterance_id = NULL WHERE id IN (SELECT o.id FROM vocab_occurrences o
            WHERE o.user_id = ${userId} AND o.utterance_id IN ${falasQueSaem} LIMIT ${n})`),
        ),
    },
    {
      conta: 'falas',
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`DELETE FROM utterances WHERE id IN (SELECT id FROM ${falasQueSaem} AS x LIMIT ${n})`),
        ),
    },
    {
      fazer: async (tx) =>
        afetadas(
          await tx.execute(sql`UPDATE exercise_results SET session_id = NULL WHERE id IN (SELECT e.id FROM exercise_results e
            WHERE e.user_id = ${userId} AND e.session_id IN ${sessoes} LIMIT ${n})`),
        ),
    },
    {
      conta: 'sessoes',
      fazer: async (tx) =>
        afetadas(await tx.execute(sql`DELETE FROM sessions WHERE id IN (SELECT id FROM ${sessoes} AS x LIMIT ${n})`)),
    },
  ]

  /** Um lote numa transação curta com a trava do usuário. `null` quando o orçamento acabou. O lote só
      gasta orçamento depois do COMMIT: o que falhou (e é repetido no 40P01/40001) não conta duas vezes. */
  const umLote = async <T>(fn: (tx: ExecutorDb) => Promise<T>): Promise<{ r: T } | null> => {
    if (a.lotesRestantes <= 0) return null
    const r = await emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      return fn(tx)
    })
    a.lotesRestantes -= 1
    a.lotes += 1
    return { r }
  }

  /* 1. As revisões que saem, com as purgadas: cada lote tira as suas dos contadores e as soma em
        `*_purgadas` (ver o cabeçalho) na MESMA transação, incrementalmente (`purgarNaTransacao`, só as
        células do lote), para o perfil nunca ver uma revisão que saiu do bruto sem ter entrado em
        `*_purgadas`. A reconstrução completa é UMA, no fim do usuário (passo 3). */
  let mexeu = false
  const revisoesQueSaem = sql`((r.deleted_at IS NOT NULL AND r.deleted_at < ${corte}) OR r.card_id IN ${cartoes})`
  for (;;) {
    const feito = await umLote(async (tx) => {
      const ids = linhas<{ id: string }>(
        await tx.execute(
          sql`SELECT r.id FROM review_logs r WHERE r.user_id = ${userId} AND ${revisoesQueSaem} LIMIT ${n}`,
        ),
      ).map((l) => l.id)
      if (ids.length === 0) return 0
      const doLote = sql`r.id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
      const celulas = agregarPorDia({ revisoes: await gruposDeRevisoes(tx, userId, doLote) }, (em) =>
        diaNumeroNoFuso(em, fuso),
      )
      const apagadas = afetadas(
        await tx.execute(sql`DELETE FROM review_logs AS r WHERE r.user_id = ${userId} AND ${doLote}`),
      )
      await purgarNaTransacao(tx, userId, celulas, apagadas, agora)
      return apagadas
    })
    if (!feito) return false
    a.revisoes += feito.r
    if (feito.r > 0) mexeu = true
    if (feito.r < n) break
  }

  /* 2. O resto, passo a passo. */
  for (const passo of passos) {
    for (;;) {
      const feito = await umLote(passo.fazer)
      if (!feito) return false
      if (feito.r > 0) mexeu = true
      if (passo.conta) a[passo.conta] += feito.r
      if (feito.r < n) break
    }
  }

  /* 3. Os agregados acompanham: UMA reconstrução completa, do bruto que ficou (as purgadas já estão lá,
        somadas lote a lote no passo 1). Só se algo saiu: quem só tem linha que fica de propósito (cartão do Anki, sessão com cartão) aparece na
        lista todo dia, e não precisa ser recontado todo dia. Se a passada morrer antes daqui, os
        gatilhos de `exercise_results` já subiram `marca_bruto` e a conferência recontará. */
  if (mexeu) {
    await emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      await reconstruirNaTransacao(tx, userId, fuso, agora)
    })
  }
  return true
}

/** Uma passada da limpeza. `dias` vem do ambiente quando ausente (`LIMPEZA_RETENCAO_DIAS`). */
export async function limparBanco(
  o: { agora?: number; dias?: number; lote?: number; maxLotes?: number } = {},
): Promise<RelatorioDaLimpeza> {
  const agora = o.agora ?? Date.now()
  const corte = agora - (o.dias ?? diasAteApagarDeVez()) * DIA_MS
  const r: RelatorioDaLimpeza = {
    corte,
    usuarios: 0,
    sessoes: 0,
    falas: 0,
    cartoes: 0,
    ocorrencias: 0,
    revisoes: 0,
    agregadosRecontados: 0,
    travasPodadas: 0,
    admissaoPodada: 0,
    lotes: 0,
    incompleta: false,
  }

  /* Quem tem o que apagar. Os cinco índices parciais `idx_*_apagadas` (migração 0053) respondem
     sem varrer as tabelas. Linha sem dono (`user_id` nulo) não entra: o arranque as carimba. */
  const donos = linhas<{ user_id: string }>(
    await db.execute(sql`
    SELECT user_id FROM sessions WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM utterances WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM vocab_cards WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM vocab_occurrences WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM review_logs WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL`),
  )

  const a: Andamento = {
    lote: o.lote ?? LOTE,
    lotesRestantes: o.maxLotes ?? MAX_LOTES,
    lotes: 0,
    sessoes: 0,
    falas: 0,
    cartoes: 0,
    ocorrencias: 0,
    revisoes: 0,
  }
  for (const { user_id } of donos) {
    /* Deadlock ou falha de serialização (transitórios no Postgres) repetem ESTE usuário uma vez — os lotes
       que já saíram ficam, e a repetição segue do lote que falhou; se insistir, ele fica para a passada de
       amanhã e a de hoje segue. Qualquer outro erro interrompe a passada, como antes. */
    const antes = a.sessoes + a.falas + a.cartoes + a.ocorrencias + a.revisoes
    let terminou: boolean | null = null
    for (let tentativa = 0; tentativa < 2 && terminou === null; tentativa++) {
      try {
        terminou = await limparUsuario(user_id as UserId, corte, agora, a)
      } catch (err) {
        if (!transitorio(err)) throw err
        if (tentativa === 1) {
          log('warn', { event: 'limpeza_usuario_adiado', error: codigoSql(err) })
        }
      }
    }
    if (a.sessoes + a.falas + a.cartoes + a.ocorrencias + a.revisoes > antes) r.usuarios += 1
    if (terminou === false) {
      // O teto de lotes acabou: o resto (deste e dos próximos usuários) sai na passada seguinte.
      r.incompleta = true
      break
    }
  }
  r.sessoes = a.sessoes
  r.falas = a.falas
  r.cartoes = a.cartoes
  r.ocorrencias = a.ocorrencias
  r.revisoes = a.revisoes
  r.lotes = a.lotes

  /* A conferência dos agregados: quem ficou com as marcas diferentes (escrita por fora dos
     repositórios) é recontado agora, e não na próxima leitura da pessoa. */
  const atrasados = linhas<{ user_id: string }>(
    await db.execute(sql`SELECT user_id FROM estado_dos_agregados WHERE marca_bruto <> marca_vista LIMIT 500`),
  )
  for (const { user_id } of atrasados) {
    await agregadosRepo.reconstruir(user_id as UserId)
    r.agregadosRecontados += 1
  }

  /* As travas de linha (`travas`, ver `travarUsuario`) de quem não existe mais em `users`: um DELETE só,
     com teto por passada. `SKIP LOCKED` pula a linha que uma transação está segurando agora (sem esperar
     por ela nem cair no `lock_timeout`); a chave podada de quem ainda usa o app volta na próxima trava. */
  r.travasPodadas = afetadas(
    await db.execute(sql`DELETE FROM travas WHERE chave IN (
      SELECT t.chave FROM travas t
      WHERE t.chave LIKE 'u:%' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = substr(t.chave, 3))
      LIMIT 5000 FOR UPDATE SKIP LOCKED)`),
  )

  /* A admissão de IA (`admissao_de_ia`): janelas de minuto e dia passadas, bloqueios vencidos e vagas em
     voo paradas. Dois dias de folga: a janela do dia UTC corrente nunca sai. */
  r.admissaoPodada = await admissaoDeIaRepo.podar(agora - 2 * DIA_MS)

  // Estatística para o planejador no PGlite, que não tem autoanalyze; no `pg` não faz nada.
  await analisarBancoEmbutido()

  log('info', { event: 'limpeza_diaria', ...r })
  return r
}
