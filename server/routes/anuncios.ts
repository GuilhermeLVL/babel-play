/**
 * A RECOMPENSA DO ANÚNCIO PREMIADO (montada em `/api/anuncios`; spec `anuncios-no-gratis`, "O premiado é sempre
 * escolha" e "Amostra de nuvem com teto global").
 *
 * Na web não há verificação servidor a servidor (SSV) da rede de anúncios (R32): a recompensa é um aperto de mão
 * em DOIS passos, e o cliente nunca diz o que ganhou — só qual exibição terminou.
 *
 *   POST /premiado/iniciar  { espaco }      → { exibicaoId }   (32 hex aleatórios, linha pendente)
 *   POST /premiado/concluir { exibicaoId }  → { jaCreditado, espaco, recompensa }
 *
 * AS PORTAS, nas duas pontas e nesta ordem:
 *   1. FLAG `anuncios` desligada → 404 `anuncios_desligados` (a rota "não existe" para quem não vê anúncio).
 *   2. PERFIL PROTEGIDO (menor, idade não declarada, convidado) → 403 `perfil_protegido`. O premiado ("assista e
 *      ganhe") é só para adultos declarados (18+; `politicaDeAnuncio.ts`, decisão do dono de 25/10/2026: o perfil
 *      protegido vê só o anúncio comum, que não passa por esta rota), e o servidor não confia no cliente para isso.
 *   3. PLANO SEM ANÚNCIOS (`semAnuncios` do plano EFETIVO do servidor: quem paga, quem está no teste de 14 dias
 *      do Premium, o self-host) → 403 `sem_anuncios`.
 *   4. ESPAÇO INATIVO (fora de `ESPACOS_PREMIADOS_ATIVOS`: a interface só monta `fim-premiado` e `loja-seeds`)
 *      → 400 `espaco_inativo`. No `concluir`, pelo espaço gravado na linha. Os testes trocam a lista com
 *      `definirEspacosAtivosParaTestes` (recusada em produção).
 *   5. Só no `iniciar`: CONTA com menos de 3 dias (`IDADE_MINIMA_DA_CONTA_MS`, a mesma regra da política do
 *      cliente) ou sem linha em `users` (idade desconhecida) → 403 `conta_nova`.
 *   6. `nuvem-30` com a nuvem do Grátis (`nuvem_gratuita_alivio`) desligada → 409 `alivio_desligado`: os 30 min
 *      não teriam como ser usados. No `concluir` também, porque a flag pode mudar entre os dois passos.
 *   7. Só no `iniciar`: 3 ou mais exibições PENDENTES nos últimos 10 min → 429 `exibicoes_pendentes`.
 *   8. TETO DO MÊS UTC do `nuvem-30` (`LIMITE_DE_NUVEM_30_POR_MES` por pessoa, 10 = 5 h) → 429 `teto_do_mes`; e os
 *      TETOS DO DIA UTC (em `src/core/planos.ts`: `LIMITE_DE_PREMIADOS_POR_DIA` por pessoa,
 *      `LIMITE_DE_NUVEM_30_POR_DIA` por pessoa no `nuvem-30`, `TETO_GLOBAL_DE_PREMIADOS_POR_DIA` no total),
 *      contados nas exibições CONCLUÍDAS → 429 `teto_do_dia`. O `iniciar` confere para a exibição nem começar; o
 *      `concluir` confere de novo, sob trava, para as pendentes não furarem.
 *
 * O `concluir` credita só se a exibição é DESTA conta (senão 404 `exibicao_desconhecida`, sem dizer se existe
 * para outra), está pendente, foi iniciada há menos de 10 minutos (senão 410 `exibicao_expirada`) e há pelo menos
 * a duração mínima do espaço (`DURACAO_MINIMA_DA_EXIBICAO_MS`, 15 s; senão 409 `cedo_demais` — R33: sem isso,
 * concluir logo depois de iniciar forjaria a recompensa). Concluída antes → 200 com `jaCreditado: true`, sem
 * creditar de novo.
 *
 * A RECOMPENSA (`src/core/anuncios/premiado.ts`): Seeds vão para o razão (`seed_credits`) com o crédito
 * `anuncio:<exibicaoId>`, idempotente por (user_id, credito_id) — por isso a resposta `jaCreditado` reaplica o
 * crédito (não credita duas vezes; completa um crédito que tenha falhado depois da conclusão). A nuvem do
 * `nuvem-30` é a própria linha concluída, lida por `bonusDeNuvemDoPremiado.ts`. O tema por 24 h e a ajuda da
 * rodada voltam na resposta para o cliente aplicar.
 */
import { randomBytes } from 'node:crypto'

import { Router } from 'express'
import { z } from 'zod'

import { FLAG_ANUNCIOS, IDADE_MINIMA_DA_CONTA_MS } from '../../src/core/anuncios/politicaDeAnuncio'
import {
  ehEspacoPremiado,
  type EspacoPremiado,
  ESPACOS_PREMIADOS_ATIVOS,
  PRAZO_DA_EXIBICAO_MS,
  type RecompensaDoPremiado,
  recompensaDoPremiado,
} from '../../src/core/anuncios/premiado'
import { FLAG_NUVEM_GRATUITA_ALIVIO } from '../../src/core/nuvemDeAlivio'
import {
  DURACAO_MINIMA_DA_EXIBICAO_MS,
  LIMITE_DE_NUVEM_30_POR_DIA,
  LIMITE_DE_NUVEM_30_POR_MES,
  LIMITE_DE_PREMIADOS_PENDENTES,
  LIMITE_DE_PREMIADOS_POR_DIA,
  TETO_GLOBAL_DE_PREMIADOS_POR_DIA,
} from '../../src/core/planos'
import { anunciosPremiadosRepo, diaUtc } from '../db/repositories/anunciosPremiados'
import { economiaRepo } from '../db/repositories/economia'
import { usersRepo } from '../db/repositories/users'
import { getEntitlements, getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { ehAdultoDeclarado } from '../lib/idade'
import { responderErro } from '../lib/respostaDeErro'
import { parseOr400 } from '../validation'

export const anunciosRouter = Router()

const iniciarSchema = z.object({ espaco: z.string().refine(ehEspacoPremiado, 'espaço premiado desconhecido') })
const concluirSchema = z.object({ exibicaoId: z.string().regex(/^[0-9a-f]{32}$/) })

const MENSAGENS = {
  desligados: 'anúncios não estão disponíveis',
  protegido: 'o anúncio com recompensa é só para maiores de 18 anos',
  teto: 'os anúncios premiados de hoje acabaram; voltam amanhã',
  desconhecida: 'exibição desconhecida',
  expirada: 'esta exibição passou do prazo e não rende recompensa',
  semAnuncios: 'este plano não tem anúncios',
  alivioDesligado: 'a nuvem grátis não está disponível agora',
  pendentes: 'há exibições em aberto; termine ou espere alguns minutos',
  cedo: 'o anúncio ainda não terminou',
  inativo: 'este espaço de anúncio não está disponível',
  contaNova: 'as recompensas de anúncio começam depois dos primeiros dias da conta',
  tetoDoMes: 'a nuvem dos anúncios deste mês acabou; volta no mês que vem',
} as const

/** O espaço que dá nuvem, e o teto dele por pessoa no dia. */
const ESPACO_DE_NUVEM = 'nuvem-30'
const LIMITE_POR_ESPACO: Readonly<Record<string, number>> = { [ESPACO_DE_NUVEM]: LIMITE_DE_NUVEM_30_POR_DIA }
/** E no mês UTC. */
const LIMITE_POR_ESPACO_NO_MES: Readonly<Record<string, number>> = { [ESPACO_DE_NUVEM]: LIMITE_DE_NUVEM_30_POR_MES }

/** A lista ativa trocada por um teste (`null` = a de `ESPACOS_PREMIADOS_ATIVOS`). */
let ativosDeTeste: ReadonlySet<string> | null = null

/**
 * SÓ PARA TESTES: troca a lista de espaços ativos (para exercitar `nuvem-30`, `tema-24h` e `ajuda-premiada`
 * antes de eles ganharem tela); `null` volta ao padrão. Em produção lança: a lista de verdade é a do core.
 */
export function definirEspacosAtivosParaTestes(lista: readonly EspacoPremiado[] | null): void {
  if (process.env.NODE_ENV === 'production') throw new Error('definirEspacosAtivosParaTestes: só em teste')
  ativosDeTeste = lista ? new Set(lista) : null
}

const espacoAtivo = (espaco: string): boolean =>
  ativosDeTeste ? ativosDeTeste.has(espaco) : (ESPACOS_PREMIADOS_ATIVOS as readonly string[]).includes(espaco)

/** A conta tem os 3 dias da política? Sem linha em `users`, a idade é desconhecida e não tem. */
async function contaComIdadeMinima(userId: import('../lib/authContext').UserId, agora: number): Promise<boolean> {
  const conta = await usersRepo.get(userId)
  return !!conta && agora - Number(conta.createdAt) >= IDADE_MINIMA_DA_CONTA_MS
}

/** A nuvem do Grátis está ligada para este pedido? Sem ela, o `nuvem-30` não tem o que entregar. */
const alivioLigado = (req: import('express').Request) => flagLigada(req, FLAG_NUVEM_GRATUITA_ALIVIO)

/**
 * As portas comuns às duas pontas: a flag, o perfil e o plano. Respondeu, devolve `false`. O convidado é "sem
 * conta", o perfil protegido por definição (e o `exigirContaParaEscrever` já o barra antes daqui).
 */
async function portasDoPremiado(req: import('express').Request, res: import('express').Response): Promise<boolean> {
  if (!(await flagLigada(req, FLAG_ANUNCIOS))) {
    responderErro(res, 404, MENSAGENS.desligados, 'anuncios_desligados')
    return false
  }
  if (req.convidado || !(await ehAdultoDeclarado(req.userId)).adulto) {
    responderErro(res, 403, MENSAGENS.protegido, 'perfil_protegido')
    return false
  }
  /* O plano EFETIVO resolvido no servidor (assinatura, teste de 14 dias ou Grátis), nunca o que o cliente diz. */
  if (getEntitlements(await getPlanForUser(req.userId)).semAnuncios) {
    responderErro(res, 403, MENSAGENS.semAnuncios, 'sem_anuncios')
    return false
  }
  return true
}

const erro500 = (req: import('express').Request, res: import('express').Response, err: unknown) =>
  res.status(500).json({
    error: erroDeRota(err, { status: 500, event: 'anuncios_route_error', route: req.path, requestId: req.requestId }),
  })

anunciosRouter.post('/premiado/iniciar', async (req, res) => {
  const corpo = parseOr400(iniciarSchema, req.body, res)
  if (!corpo) return
  try {
    if (!(await portasDoPremiado(req, res))) return
    if (!espacoAtivo(corpo.espaco)) {
      responderErro(res, 400, MENSAGENS.inativo, 'espaco_inativo')
      return
    }
    const agora = Date.now()
    if (!(await contaComIdadeMinima(req.userId, agora))) {
      responderErro(res, 403, MENSAGENS.contaNova, 'conta_nova')
      return
    }
    if (corpo.espaco === ESPACO_DE_NUVEM && !(await alivioLigado(req))) {
      responderErro(res, 409, MENSAGENS.alivioDesligado, 'alivio_desligado')
      return
    }
    if (
      (await anunciosPremiadosRepo.pendentesDesde(req.userId, agora - PRAZO_DA_EXIBICAO_MS)) >=
      LIMITE_DE_PREMIADOS_PENDENTES
    ) {
      responderErro(res, 429, MENSAGENS.pendentes, 'exibicoes_pendentes')
      return
    }
    const { daPessoa, doEspaco, global, doEspacoNoMes } = await anunciosPremiadosRepo.concluidasNoDia(
      req.userId,
      diaUtc(agora),
      corpo.espaco,
    )
    if (doEspacoNoMes >= (LIMITE_POR_ESPACO_NO_MES[corpo.espaco] ?? Number.POSITIVE_INFINITY)) {
      responderErro(res, 429, MENSAGENS.tetoDoMes, 'teto_do_mes')
      return
    }
    if (
      daPessoa >= LIMITE_DE_PREMIADOS_POR_DIA ||
      global >= TETO_GLOBAL_DE_PREMIADOS_POR_DIA ||
      doEspaco >= (LIMITE_POR_ESPACO[corpo.espaco] ?? Number.POSITIVE_INFINITY)
    ) {
      responderErro(res, 429, MENSAGENS.teto, 'teto_do_dia')
      return
    }
    const exibicaoId = randomBytes(16).toString('hex')
    await anunciosPremiadosRepo.iniciar(req.userId, exibicaoId, corpo.espaco, agora)
    res.json({ exibicaoId })
  } catch (err) {
    erro500(req, res, err)
  }
})

anunciosRouter.post('/premiado/concluir', async (req, res) => {
  const corpo = parseOr400(concluirSchema, req.body, res)
  if (!corpo) return
  try {
    if (!(await portasDoPremiado(req, res))) return
    const r = await anunciosPremiadosRepo.concluir(req.userId, corpo.exibicaoId, Date.now(), {
      prazoMs: PRAZO_DA_EXIBICAO_MS,
      duracaoMinimaMs: (espaco) =>
        ehEspacoPremiado(espaco) ? DURACAO_MINIMA_DA_EXIBICAO_MS[espaco] : PRAZO_DA_EXIBICAO_MS,
      limitePorPessoa: LIMITE_DE_PREMIADOS_POR_DIA,
      tetoGlobal: TETO_GLOBAL_DE_PREMIADOS_POR_DIA,
      limitePorEspaco: LIMITE_POR_ESPACO,
      limitePorEspacoNoMes: LIMITE_POR_ESPACO_NO_MES,
      espacoAtivo,
      espacosBloqueados: (await alivioLigado(req)) ? new Set() : new Set([ESPACO_DE_NUVEM]),
    })
    if (r.tipo === 'desconhecida') {
      responderErro(res, 404, MENSAGENS.desconhecida, 'exibicao_desconhecida')
      return
    }
    if (r.tipo === 'espaco-inativo') {
      responderErro(res, 400, MENSAGENS.inativo, 'espaco_inativo')
      return
    }
    if (r.tipo === 'expirada') {
      responderErro(res, 410, MENSAGENS.expirada, 'exibicao_expirada')
      return
    }
    if (r.tipo === 'espaco-bloqueado') {
      responderErro(res, 409, MENSAGENS.alivioDesligado, 'alivio_desligado')
      return
    }
    if (r.tipo === 'cedo-demais') {
      responderErro(res, 409, MENSAGENS.cedo, 'cedo_demais')
      return
    }
    if (r.tipo === 'teto-do-mes') {
      responderErro(res, 429, MENSAGENS.tetoDoMes, 'teto_do_mes')
      return
    }
    if (r.tipo === 'teto') {
      responderErro(res, 429, MENSAGENS.teto, 'teto_do_dia')
      return
    }
    /* A linha só guarda espaços que o `iniciar` validou. */
    const espaco = r.espaco as EspacoPremiado
    const recompensa: RecompensaDoPremiado = recompensaDoPremiado(espaco, r.concluidoEm)
    if (recompensa.tipo === 'seeds') {
      await economiaRepo.creditar(req.userId, {
        creditoId: `anuncio:${corpo.exibicaoId}`,
        amount: recompensa.seeds,
        xp: 0,
        reason: `anuncio:${espaco}`,
      })
    }
    res.json({ jaCreditado: r.tipo === 'ja-creditada', espaco, recompensa })
  } catch (err) {
    erro500(req, res, err)
  }
})
