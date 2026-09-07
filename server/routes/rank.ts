/**
 * RANKING GLOBAL (montado em `/api/rank`) — a rota PÚBLICA.
 *
 * VEIO DO CLOUDFLARE (07/09), quando a edição leve foi encerrada. Era uma Pages Function contra um
 * banco D1 separado, e a única funcionalidade que dependia daquela hospedagem — que nunca foi
 * publicada. A tela de "Recordes e ranking" dizia, desde sempre, "o ranking global vive na versão
 * publicada"; sem esta rota, aquela frase passaria a apontar para uma versão que nunca existiria.
 *
 * ELA FICA ANTES DO `authMiddleware`, como o health e o webhook, e isso é o desenho e não um
 * descuido: o placar é público e anônimo — sai o apelido que a pessoa escolheu, os pontos e o
 * combo — e precisa funcionar exatamente igual com e sem conta. Exigir token aqui quebraria o
 * ranking justamente no modo para o qual ele foi feito, e o cliente (`src/lib/ranking.ts`) fala
 * com ela por `fetch` cru pela mesma razão: o funil `apiFetch` desvia para o servidor em memória
 * quando a identidade é anônima, e aquele servidor não tem placar de ninguém além de quem joga
 * nele.
 *
 * O PREÇO DE SER PÚBLICA é que ela não sabe quem está do outro lado. As guardas são as de um
 * placar de fliperama: teto de pontos, apelido saneado, um envio por minuto por origem. Elas não
 * impedem trapaça — impedem que a trapaça quebre a tabela.
 */
import { Router } from 'express'
import { rankRepo, sanearApelido, hashDaOrigem, TETO_DE_PONTOS, TETO_DE_COMBO } from '../db/repositories/rank'
import { MINIGAME_IDS } from '../../src/core/minigames/revelavel'
import { CHAVE_DE_HASH } from '../crypto'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'

export const rankRouter = Router()

/* Os jogos que existem, do core — e não uma lista repetida aqui. A versão Cloudflare tinha um
   `Set` escrito à mão com os nove nomes, que envelheceria em silêncio no dia em que um jogo
   entrasse ou saísse: o envio passaria a levar 404 sem ninguém entender por quê. */
const JOGOS = new Set<string>(MINIGAME_IDS)

const LIMITE_PADRAO = 20
const LIMITE_MAXIMO = 50

rankRouter.get('/:jogo', async (req, res) => {
  const jogo = String(req.params.jogo ?? '')
  if (!JOGOS.has(jogo)) {
    responderErro(res, 404, 'jogo desconhecido', 'jogo_desconhecido')
    return
  }
  try {
    const pedido = Number(req.query.limite ?? LIMITE_PADRAO)
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Number.isFinite(pedido) ? Math.floor(pedido) : LIMITE_PADRAO))
    res.json({ linhas: await rankRepo.topo(jogo, limite) })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'rank_route_error', route: req.path, requestId: req.requestId }) })
  }
})

rankRouter.post('/:jogo', async (req, res) => {
  const jogo = String(req.params.jogo ?? '')
  if (!JOGOS.has(jogo)) {
    responderErro(res, 404, 'jogo desconhecido', 'jogo_desconhecido')
    return
  }
  try {
    const corpo = (req.body ?? {}) as Record<string, unknown>
    const apelido = sanearApelido(corpo.apelido)
    const pontos = Math.round(Number(corpo.pontos))
    const combo = Math.round(Number(corpo.combo))

    if (!apelido) {
      responderErro(res, 400, 'apelido inválido (3 a 20 caracteres)', 'apelido_invalido')
      return
    }
    /* O teto não é desconfiança do jogador: é o que impede que UM envio absurdo deixe o resto da
       tabela invisível para sempre. Um placar sem conta não tem como distinguir os dois casos. */
    if (!Number.isFinite(pontos) || pontos <= 0 || pontos > TETO_DE_PONTOS) {
      responderErro(res, 400, 'pontuação fora do plausível', 'pontuacao_implausivel', { teto: TETO_DE_PONTOS })
      return
    }
    if (!Number.isFinite(combo) || combo < 0 || combo > TETO_DE_COMBO) {
      responderErro(res, 400, 'combo fora do plausível', 'combo_implausivel', { teto: TETO_DE_COMBO })
      return
    }

    const agora = Date.now()
    const ipHash = hashDaOrigem(req.ip ?? 'desconhecido', CHAVE_DE_HASH)
    if (await rankRepo.enviouRecentemente(ipHash, agora)) {
      responderErro(res, 429, 'aguarde um minuto entre envios', 'envio_muito_frequente')
      return
    }

    res.json(await rankRepo.registrar({ jogo, apelido, pontos, combo, ipHash, agora }))
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'rank_route_error', route: req.path, requestId: req.requestId }) })
  }
})
