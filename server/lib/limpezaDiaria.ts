/**
 * A LIMPEZA DIÁRIA DO BANCO (change `modelo-do-aluno-e-dados`, tarefa 2.4; levantamento em
 * `docs/auditoria/2026-10-10-dados-metricas-e-selecao.md`, seção 3).
 *
 * POR QUE EXISTE. Apagar uma sessão, um cartão ou desfazer uma revisão só carimba `deleted_at`; a
 * linha ficava no banco para sempre, na tabela e em todos os índices. Aqui o que foi apagado há mais
 * de `LIMPEZA_RETENCAO_DIAS` (padrão 30) sai de vez. Os 30 dias são a janela em que um engano ainda
 * pode ser desfeito à mão por quem opera o banco.
 *
 * O QUE SAI, por usuário, numa transação só (ou sai tudo daquele usuário, ou nada):
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
 * diários, na mesma transação, e o perfil as soma (`agregadosRepo.revisoesDoPerfil`).
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
import { analisarBancoEmbutido, db, emTransacao, linhas, linhasAfetadas, travarUsuario } from '../db/db'
import {
  agregadosRepo,
  gruposDeRevisoes,
  type PurgadasDaCelula,
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
}

const afetadas = (r: unknown) => linhasAfetadas(r)

/** SQLSTATE do erro do driver (o drizzle o embrulha em `cause`). */
const codigoSql = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } } | null | undefined
  return e?.cause?.code ?? e?.code
}
/** Deadlock (40P01) ou falha de serialização (40001): vale tentar de novo. */
const transitorio = (err: unknown) => ['40P01', '40001'].includes(codigoSql(err) ?? '')

/** Tudo de UM usuário, numa transação que toma a trava consultiva do usuário no começo. */
async function limparUsuario(userId: UserId, corte: number, agora: number) {
  const fuso = await agregadosRepo.fusoGravado(userId)
  return emTransacao(async (tx) => {
    await travarUsuario(tx, userId)
    /* Os cartões que saem: apagados antes do corte e sem nota do Anki apontando para eles. */
    const cartoes = sql`(SELECT c.id FROM vocab_cards c
        WHERE c.user_id = ${userId} AND c.deleted_at IS NOT NULL AND c.deleted_at < ${corte}
          AND NOT EXISTS (SELECT 1 FROM anki_notes n WHERE n.projected_card_id = c.id))`

    /* Antes de apagar: as revisões que saem viram `*_purgadas` nos agregados (ver o cabeçalho). */
    const revisoesQueSaem = sql`((r.deleted_at IS NOT NULL AND r.deleted_at < ${corte}) OR r.card_id IN ${cartoes})`
    const purgadas: PurgadasDaCelula[] = agregarPorDia(
      { revisoes: await gruposDeRevisoes(tx, userId, revisoesQueSaem) },
      (em) => diaNumeroNoFuso(em, fuso),
    ).map((c) => ({ idioma: c.idioma, dia: c.dia, revisoes: c.revisoes, acertos: c.acertos }))

    const revisoes = afetadas(
      await tx.execute(sql`DELETE FROM review_logs AS r WHERE r.user_id = ${userId} AND ${revisoesQueSaem}`),
    )
    const ocorrencias = afetadas(
      await tx.execute(sql`DELETE FROM vocab_occurrences WHERE user_id = ${userId}
          AND ((deleted_at IS NOT NULL AND deleted_at < ${corte}) OR card_id IN ${cartoes})`),
    )
    let soltos = afetadas(
      await tx.execute(
        sql`UPDATE exercise_results SET card_id = NULL WHERE user_id = ${userId} AND card_id IN ${cartoes}`,
      ),
    )
    const nCartoes = afetadas(await tx.execute(sql`DELETE FROM vocab_cards WHERE id IN ${cartoes}`))

    /* As sessões que saem: apagadas antes do corte e sem cartão que ainda as cite (depois de os
         cartões acima terem saído). */
    const sessoes = sql`(SELECT s.id FROM sessions s
        WHERE s.user_id = ${userId} AND s.deleted_at IS NOT NULL AND s.deleted_at < ${corte}
          AND NOT EXISTS (SELECT 1 FROM vocab_cards c WHERE c.session_id = s.id))`
    const falasQueSaem = sql`(SELECT u.id FROM utterances u WHERE u.user_id = ${userId}
        AND ((u.deleted_at IS NOT NULL AND u.deleted_at < ${corte}) OR u.session_id IN ${sessoes}))`
    await tx.execute(
      sql`UPDATE vocab_occurrences SET utterance_id = NULL WHERE user_id = ${userId} AND utterance_id IN ${falasQueSaem}`,
    )
    const falas = afetadas(await tx.execute(sql`DELETE FROM utterances WHERE id IN ${falasQueSaem}`))
    soltos += afetadas(
      await tx.execute(
        sql`UPDATE exercise_results SET session_id = NULL WHERE user_id = ${userId} AND session_id IN ${sessoes}`,
      ),
    )
    const nSessoes = afetadas(await tx.execute(sql`DELETE FROM sessions WHERE id IN ${sessoes}`))

    /* Os agregados acompanham no mesmo passo: recontados do bruto que ficou, mais as purgadas. Só
         se algo saiu: quem só tem linha que fica de propósito (cartão do Anki, sessão com cartão)
         aparece na lista todo dia, e não precisa ser recontado todo dia. */
    const mexeu = revisoes + ocorrencias + nCartoes + falas + nSessoes + soltos > 0
    if (mexeu) await reconstruirNaTransacao(tx, userId, fuso, agora, purgadas)
    return { mexeu, sessoes: nSessoes, falas, cartoes: nCartoes, ocorrencias, revisoes }
  })
}

/** Uma passada da limpeza. `dias` vem do ambiente quando ausente (`LIMPEZA_RETENCAO_DIAS`). */
export async function limparBanco(o: { agora?: number; dias?: number } = {}): Promise<RelatorioDaLimpeza> {
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

  for (const { user_id } of donos) {
    /* Um usuário por transação: a trava do usuário é solta entre um e outro. Deadlock ou falha de
       serialização (transitórios no Postgres) repetem ESTE usuário uma vez; se insistir, ele fica para
       a passada de amanhã e a de hoje segue. Qualquer outro erro interrompe a passada, como antes. */
    let u: Awaited<ReturnType<typeof limparUsuario>> | null = null
    for (let tentativa = 0; tentativa < 2 && !u; tentativa++) {
      try {
        u = await limparUsuario(user_id as UserId, corte, agora)
      } catch (err) {
        if (!transitorio(err)) throw err
        if (tentativa === 1) {
          log('warn', { event: 'limpeza_usuario_adiado', error: codigoSql(err) })
        }
      }
    }
    if (!u) continue
    if (u.mexeu) r.usuarios += 1
    r.sessoes += u.sessoes
    r.falas += u.falas
    r.cartoes += u.cartoes
    r.ocorrencias += u.ocorrencias
    r.revisoes += u.revisoes
  }

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

  // Estatística para o planejador no PGlite, que não tem autoanalyze; no `pg` não faz nada.
  await analisarBancoEmbutido()

  log('info', { event: 'limpeza_diaria', ...r })
  return r
}

/**
 * Liga a limpeza diária: o mesmo padrão das outras (`agendarPodaDoCacheDeTraducao`,
 * `agendarLimpezaDeConvidados`). No processo que prepara os dados, temporizador com `unref()`,
 * primeira passada minutos depois do arranque. Devolve como desligar.
 */
export function agendarLimpezaDiaria(o: { atrasoInicialMs?: number; intervaloMs?: number } = {}): () => void {
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      await limparBanco()
    } catch (err) {
      log('error', { event: 'limpeza_diaria_erro', error: String((err as Error)?.message ?? err).slice(0, 200) })
    }
  }
  const armar = (ms: number) => {
    relogio = setTimeout(() => {
      void rodar().finally(() => armar(o.intervaloMs ?? DIA_MS))
    }, ms)
    relogio.unref?.()
  }
  armar(o.atrasoInicialMs ?? 17 * 60_000)
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}
