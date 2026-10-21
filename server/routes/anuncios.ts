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
 *   2. PERFIL PROTEGIDO (menor, idade não declarada, convidado) → 403 `perfil_protegido`. Nunca há anúncio para
 *      ele (`politicaDeAnuncio.ts`), e o servidor não confia no cliente para isso.
 *   3. TETOS DO DIA UTC (`LIMITE_DE_PREMIADOS_POR_DIA` por pessoa, `TETO_GLOBAL_DE_PREMIADOS_POR_DIA` no total,
 *      em `src/core/planos.ts`), contados nas exibições CONCLUÍDAS → 429 `teto_do_dia`. O `iniciar` confere
 *      para a exibição nem começar; o `concluir` confere de novo, sob trava, para as pendentes não furarem.
 *
 * O `concluir` credita só se a exibição é DESTA conta (senão 404 `exibicao_desconhecida`, sem dizer se existe
 * para outra), está pendente e foi iniciada há menos de 10 minutos (senão 410 `exibicao_expirada`). Concluída
 * antes → 200 com `jaCreditado: true`, sem creditar de novo.
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

import { FLAG_ANUNCIOS } from '../../src/core/anuncios/politicaDeAnuncio'
import {
  ehEspacoPremiado,
  type EspacoPremiado,
  PRAZO_DA_EXIBICAO_MS,
  type RecompensaDoPremiado,
  recompensaDoPremiado,
} from '../../src/core/anuncios/premiado'
import { LIMITE_DE_PREMIADOS_POR_DIA, TETO_GLOBAL_DE_PREMIADOS_POR_DIA } from '../../src/core/planos'
import { anunciosPremiadosRepo, diaUtc } from '../db/repositories/anunciosPremiados'
import { economiaRepo } from '../db/repositories/economia'
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
  protegido: 'este perfil não vê anúncios',
  teto: 'os anúncios premiados de hoje acabaram; voltam amanhã',
  desconhecida: 'exibição desconhecida',
  expirada: 'esta exibição passou do prazo e não rende recompensa',
} as const

/**
 * As portas comuns às duas pontas: a flag e o perfil. Respondeu, devolve `false`. O convidado é "sem conta", o
 * perfil protegido por definição (e o `exigirContaParaEscrever` já o barra antes daqui).
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
    const agora = Date.now()
    const { daPessoa, global } = await anunciosPremiadosRepo.concluidasNoDia(req.userId, diaUtc(agora))
    if (daPessoa >= LIMITE_DE_PREMIADOS_POR_DIA || global >= TETO_GLOBAL_DE_PREMIADOS_POR_DIA) {
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
      limitePorPessoa: LIMITE_DE_PREMIADOS_POR_DIA,
      tetoGlobal: TETO_GLOBAL_DE_PREMIADOS_POR_DIA,
    })
    if (r.tipo === 'desconhecida') {
      responderErro(res, 404, MENSAGENS.desconhecida, 'exibicao_desconhecida')
      return
    }
    if (r.tipo === 'expirada') {
      responderErro(res, 410, MENSAGENS.expirada, 'exibicao_expirada')
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
