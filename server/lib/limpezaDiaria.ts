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
 * DEPOIS: confere os agregados de quem ficou com as marcas diferentes, roda `PRAGMA optimize` (dá
 * estatística ao planejador, que nunca teve) e, só com `LIMPEZA_CHECKPOINT=1`, o checkpoint do WAL
 * com truncamento.
 *
 * O CHECKPOINT É OPCIONAL E NASCE DESLIGADO. Em produção quem cuida do WAL é o Litestream
 * (`litestream.yml`): ele faz os próprios checkpoints e precisa ver todos os quadros do WAL antes
 * de eles serem dobrados no arquivo. Um checkpoint com truncamento feito pela aplicação pode
 * passar na frente dele e obrigá-lo a recomeçar a réplica com uma cópia inteira do banco. Não há
 * como provar daqui que isso não acontece na versão em uso (0.5.17), então o padrão é não fazer.
 *
 * O ARQUIVO NÃO ENCOLHE: `DELETE` devolve as páginas à lista de livres do próprio arquivo, que as
 * reaproveita nas próximas escritas. Encolher pede `VACUUM`, que reescreve o banco inteiro com a
 * trava de escrita e não é feito aqui.
 */
import { sql } from 'drizzle-orm'

import { agregarPorDia } from '../../src/core/learning/agregados'
import { diaNumeroNoFuso } from '../../src/core/learning/economia'
import { aplicarPragmas, bancoLocal, client, db } from '../db/db'
import {
  agregadosRepo,
  gruposDeRevisoes,
  type PurgadasDaCelula,
  reconstruirNaTransacao,
} from '../db/repositories/agregados'
import type { UserId } from './authContext'
import { checkpointNaLimpeza, diasAteApagarDeVez } from './config'
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
  otimizado: boolean
  /** `null` = checkpoint não pedido; `false` = pedido e ocupado (ou falhou); `true` = feito. */
  checkpoint: boolean | null
}

const afetadas = (r: unknown) => Number((r as { rowsAffected?: number }).rowsAffected ?? 0)
const ocupado = (err: unknown) => /SQLITE_BUSY|database is locked/i.test(String((err as Error)?.message ?? err))

/** Tudo de UM usuário, numa transação que toma a trava de escrita no começo. */
async function limparUsuario(userId: UserId, corte: number, agora: number) {
  const fuso = await agregadosRepo.fusoGravado(userId)
  return db.transaction(
    async (tx) => {
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
        await tx.run(sql`DELETE FROM review_logs AS r WHERE r.user_id = ${userId} AND ${revisoesQueSaem}`),
      )
      const ocorrencias = afetadas(
        await tx.run(sql`DELETE FROM vocab_occurrences WHERE user_id = ${userId}
          AND ((deleted_at IS NOT NULL AND deleted_at < ${corte}) OR card_id IN ${cartoes})`),
      )
      let soltos = afetadas(
        await tx.run(
          sql`UPDATE exercise_results SET card_id = NULL WHERE user_id = ${userId} AND card_id IN ${cartoes}`,
        ),
      )
      const nCartoes = afetadas(await tx.run(sql`DELETE FROM vocab_cards WHERE id IN ${cartoes}`))

      /* As sessões que saem: apagadas antes do corte e sem cartão que ainda as cite (depois de os
         cartões acima terem saído). */
      const sessoes = sql`(SELECT s.id FROM sessions s
        WHERE s.user_id = ${userId} AND s.deleted_at IS NOT NULL AND s.deleted_at < ${corte}
          AND NOT EXISTS (SELECT 1 FROM vocab_cards c WHERE c.session_id = s.id))`
      const falasQueSaem = sql`(SELECT u.id FROM utterances u WHERE u.user_id = ${userId}
        AND ((u.deleted_at IS NOT NULL AND u.deleted_at < ${corte}) OR u.session_id IN ${sessoes}))`
      await tx.run(
        sql`UPDATE vocab_occurrences SET utterance_id = NULL WHERE user_id = ${userId} AND utterance_id IN ${falasQueSaem}`,
      )
      const falas = afetadas(await tx.run(sql`DELETE FROM utterances WHERE id IN ${falasQueSaem}`))
      soltos += afetadas(
        await tx.run(
          sql`UPDATE exercise_results SET session_id = NULL WHERE user_id = ${userId} AND session_id IN ${sessoes}`,
        ),
      )
      const nSessoes = afetadas(await tx.run(sql`DELETE FROM sessions WHERE id IN ${sessoes}`))

      /* Os agregados acompanham no mesmo passo: recontados do bruto que ficou, mais as purgadas. Só
         se algo saiu: quem só tem linha que fica de propósito (cartão do Anki, sessão com cartão)
         aparece na lista todo dia, e não precisa ser recontado todo dia. */
      const mexeu = revisoes + ocorrencias + nCartoes + falas + nSessoes + soltos > 0
      if (mexeu) await reconstruirNaTransacao(tx, userId, fuso, agora, purgadas)
      return { mexeu, sessoes: nSessoes, falas, cartoes: nCartoes, ocorrencias, revisoes }
    },
    { behavior: 'immediate' },
  )
}

/**
 * Uma passada da limpeza. `dias` e `checkpoint` vêm do ambiente quando ausentes
 * (`LIMPEZA_RETENCAO_DIAS`, `LIMPEZA_CHECKPOINT`).
 */
export async function limparBanco(
  o: { agora?: number; dias?: number; checkpoint?: boolean } = {},
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
    otimizado: false,
    checkpoint: null,
  }

  /* Quem tem o que apagar. Os cinco índices parciais `idx_*_apagadas` (migração 0053) respondem
     sem varrer as tabelas. Linha sem dono (`user_id` nulo) não entra: o arranque as carimba. */
  const donos = await db.all<{ user_id: string }>(sql`
    SELECT user_id FROM sessions WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM utterances WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM vocab_cards WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM vocab_occurrences WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL
    UNION SELECT user_id FROM review_logs WHERE deleted_at IS NOT NULL AND deleted_at < ${corte} AND user_id IS NOT NULL`)

  try {
    for (const { user_id } of donos) {
      /* Um usuário por transação: a trava de escrita é solta entre um e outro. Banco ocupado numa
         tentativa não derruba a passada; quem ficou para trás entra na de amanhã. */
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        try {
          const u = await limparUsuario(user_id as UserId, corte, agora)
          if (u.mexeu) r.usuarios += 1
          r.sessoes += u.sessoes
          r.falas += u.falas
          r.cartoes += u.cartoes
          r.ocorrencias += u.ocorrencias
          r.revisoes += u.revisoes
          break
        } catch (err) {
          if (!ocupado(err)) throw err
          await new Promise((ok) => setTimeout(ok, 50 * (tentativa + 1)))
        }
      }
    }
  } finally {
    // As transações rodam em conexão nova e devolvem a principal sem os PRAGMAs (ver `emTransacao`).
    await aplicarPragmas().catch(() => {})
  }

  /* A conferência dos agregados: quem ficou com as marcas diferentes (escrita por fora dos
     repositórios) é recontado agora, e não na próxima leitura da pessoa. */
  const atrasados = await db.all<{ user_id: string }>(
    sql`SELECT user_id FROM estado_dos_agregados WHERE marca_bruto <> marca_vista LIMIT 500`,
  )
  for (const { user_id } of atrasados) {
    await agregadosRepo.reconstruir(user_id as UserId)
    r.agregadosRecontados += 1
  }

  if (bancoLocal) {
    try {
      await client.execute('PRAGMA optimize')
      r.otimizado = true
    } catch (err) {
      log('warn', { event: 'limpeza_diaria_optimize_falhou', error: String(err).slice(0, 160) })
    }
    if (o.checkpoint ?? checkpointNaLimpeza()) {
      try {
        const c = await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        // A primeira coluna é `busy`: 1 quando um leitor (ou o replicador) segurou o checkpoint.
        r.checkpoint = Number(Object.values(c.rows[0] ?? {})[0] ?? 1) === 0
      } catch (err) {
        r.checkpoint = false
        log('warn', { event: 'limpeza_diaria_checkpoint_falhou', error: String(err).slice(0, 160) })
      }
    }
  }

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
