/** Rotas de vocabulário/SRS (montadas em `/api/vocab`). */
import { createHash, randomBytes } from 'node:crypto'

import { Router } from 'express'

import type { Grade } from '../../src/core/learning/scheduler'
import { versoesRepo } from '../db/repositories/versoes'
import { vocabRepo } from '../db/repositories/vocab'
import { CachePorVersao } from '../lib/cachePorVersao'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import {
  bulkAddCardsSchema,
  desfazerRevisaoSchema,
  idParamSchema,
  parseOr400,
  patchVocabSchema,
  relabelVocabSchema,
  reviewGradeSchema,
  vocabPaginaQuerySchema,
  vocabParaJogoQuerySchema,
} from '../validation'

export const vocabRouter = Router()

/**
 * O BARALHO INTEIRO, com ETag pela VERSÃO dos dados (fix/rotas-caras, auditoria de prontidão
 * Fase 2 §2.1).
 *
 * Era a rota mais cara do servidor: 133 ms de CPU por chamada com 3.000 cartões (2,3 MB), com o
 * event loop preso pelo driver durante a leitura inteira — e o cliente a chama de 16 telas. O
 * ETag que o Express já mandava era um hash do CORPO: para responder 304 ele precisava montar o
 * baralho inteiro primeiro, então revalidar custava o mesmo que baixar.
 *
 * Agora o ETag sai de `versoes_de_dados.vocab` (um contador mantido por gatilho a cada escrita em
 * `vocab_cards` e `vocab_occurrences`, migração 0032):
 *   · If-None-Match igual → 304 com UMA consulta de chave primária, sem tocar no baralho;
 *   · sem ETag, mas versão já servida → o MESMO corpo, guardado em memória (`baralhosServidos`);
 *   · versão nova → lê, serializa e guarda.
 *
 * O ETag carrega também um resumo do usuário e a ÉPOCA do processo. O primeiro impede que um
 * navegador compartilhado (duas contas no mesmo perfil) revalide o baralho de uma conta com o
 * ETag da outra quando os contadores coincidem; a segunda impede que um banco restaurado de
 * backup (contadores de volta ao passado) case com um ETag emitido antes da restauração.
 */
const EPOCA = randomBytes(4).toString('hex')
/* Teto de ~64 MB, contando 2 bytes por caractere (o pior caso do V8, texto com acento): ~13
   baralhos grandes (2,3 MB cada) ou centenas de pequenos. Quem não cabe continua sendo servido —
   só não fica. Medido: com 24 MB, dez usuários pesados alternando já não cabiam e toda leitura
   voltava ao banco. */
const baralhosServidos = new CachePorVersao<string>(512, 64 * 1024 * 1024)

function etagDoBaralho(userId: string, versao: number): string {
  const quem = createHash('sha256').update(userId).digest('base64url').slice(0, 12)
  return `W/"vocab-${EPOCA}-${quem}-${versao}"`
}

/** If-None-Match casa? Comparação FRACA (RFC 9110 §13.1.2): o `W/` não conta, `*` casa com tudo. */
function casaComIfNoneMatch(cabecalho: string | undefined, etag: string): boolean {
  if (!cabecalho) return false
  const semW = (t: string) => t.trim().replace(/^W\//, '')
  return cabecalho.split(',').some((t) => t.trim() === '*' || semW(t) === semW(etag))
}

vocabRouter.get('/', async (req, res) => {
  // A versão ANTES do baralho — ver `CachePorVersao` para o porquê da ordem.
  const { vocab: versao } = await versoesRepo.de(req.userId)
  const etag = etagDoBaralho(req.userId, versao)
  res.setHeader('ETag', etag)
  if (casaComIfNoneMatch(req.headers['if-none-match'], etag)) {
    res.status(304).end()
    return
  }
  let corpo = baralhosServidos.obter(req.userId, String(versao))
  if (corpo === undefined) {
    /* `JSON.stringify` é o que `res.json` faria (sem replacer nem espaços configurados no app):
       o corpo é byte a byte o de antes, e o `Content-Type` também (`application/json; charset=utf-8`). */
    corpo = JSON.stringify(await vocabRepo.list(req.userId))
    baralhosServidos.guardar(req.userId, String(versao), corpo, corpo.length * 2)
  }
  res.type('json').send(corpo)
})

/**
 * SELEÇÃO PARA JOGO (F4) — no servidor, onde os índices trabalham.
 * Antes o cliente baixava o baralho inteiro a cada fim de rodada e filtrava em JS.
 */
async function paraJogo(
  req: Parameters<Parameters<typeof vocabRouter.get>[1]>[0],
  res: Parameters<Parameters<typeof vocabRouter.get>[1]>[1],
  entrada: unknown,
) {
  // F11-04: o `as never` saiu daqui. Os enums são validados no schema, então o que chega ao
  // repositório já tem o tipo que ele declara — em vez de o compilador acreditar no cliente.
  const q = parseOr400(vocabParaJogoQuerySchema, entrada, res)
  if (!q) return
  try {
    res.json(
      await vocabRepo.selecionarParaJogo(req.userId, {
        fonte: q.fonte ?? 'baralho',
        fonteRef: q.fonteRef ?? null,
        dificuldade: q.dificuldade,
        estrategia: q.estrategia ?? 'equilibrado',
        limite: q.limite,
        evitar: q.evitar,
        lang: q.lang ?? null,
        filtro: q.filtro,
      }),
    )
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
}

vocabRouter.get('/para-jogo', (req, res) => paraJogo(req, res, req.query))

/**
 * O MESMO pedido pelo CORPO. O filtro facetado vai como JSON num parâmetro; quando ele não cabe
 * numa URL (lista de ids de "difíceis"), o cliente manda os mesmos campos — as mesmas strings —
 * em JSON no corpo. Um schema só (`vocabParaJogoQuerySchema`) valida os dois caminhos.
 */
vocabRouter.post('/para-jogo', (req, res) => paraJogo(req, res, req.body ?? {}))

/** Página do catálogo (F5): busca, filtros e ordenação resolvidos no servidor. */
vocabRouter.get('/pagina', async (req, res) => {
  const q = parseOr400(vocabPaginaQuerySchema, req.query, res)
  if (!q) return
  try {
    res.json(
      await vocabRepo.listarPagina(req.userId, {
        limite: q.limite,
        cursor: q.cursorValor !== undefined && q.cursorId ? { valor: q.cursorValor, id: q.cursorId } : null,
        busca: q.q,
        niveis: q.niveis,
        origens: q.origens,
        desde: q.desde,
        ate: q.ate,
        ordem: q.ordem ?? 'recentes',
      }),
    )
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Z3: instrumentação da distribuição por faixa — o drift precisa ser um número observável. */
vocabRouter.get('/distribuicao-dificuldade', async (req, res) => {
  try {
    const d = await vocabRepo.distribuicaoDeDificuldade(req.userId)
    // Log estruturado: é assim que a concentração vira métrica em produção, não reclamação.
    log('info', {
      event: 'dificuldade_distribuicao',
      requestId: req.requestId,
      maiorFaixaPct: d.maiorFaixaPct,
      tipoDeCorte: d.cortes.tipo,
      total: d.total,
    })
    res.json(d)
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Z2: quando a contagem de ocorrências começou a valer, para a tela poder declarar. */
vocabRouter.get('/inicio-da-contagem', async (req, res) => {
  try {
    res.json(await vocabRepo.inicioDaContagem(req.userId))
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** "Na sua memória" (gaveta da palavra): revisões e acertos do cartão. */
vocabRouter.get('/:id/memoria', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const m = await vocabRepo.memoria(req.userId, p.id)
    if (!m) return res.status(404).json({ error: 'card não encontrado' })
    res.json(m)
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Ocorrências de um cartão (F5): linha do tempo, origens e contextos. */
vocabRouter.get('/:id/ocorrencias', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    res.json(await vocabRepo.ocorrencias(req.userId, p.id))
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.post('/bulk-add', async (req, res) => {
  const payload = parseOr400(bulkAddCardsSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await vocabRepo.bulkAdd(req.userId, payload.cards))
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * Reetiquetagem de idioma (Auditoria). Recebe SÓ o que o usuário confirmou na tela — o servidor não
 * classifica nem deduz nada aqui; a decisão foi dele.
 */
vocabRouter.post('/relabel', async (req, res) => {
  // P2-1: array sem teto virava um UPDATE por item num laço.
  const payload = parseOr400(relabelVocabSchema, req.body, res)
  if (!payload) return
  try {
    res.json({ changed: await vocabRepo.relabel(req.userId, payload.items) })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * Edição de um cartão pela curadoria: tradução e presença no baralho.
 * Só estes dois campos — o resto do cartão (agendamento, idioma, frase) tem donos próprios.
 */
vocabRouter.patch('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(patchVocabSchema, req.body, res)
  if (!body) return
  try {
    const patch: { back?: string; inDeck?: boolean; sentence?: string; cefrLevel?: string | null } = {}
    if (body.back !== undefined) patch.back = body.back
    if (body.inDeck !== undefined) patch.inDeck = body.inDeck
    if (body.sentence !== undefined) patch.sentence = body.sentence
    if (body.cefrLevel !== undefined) patch.cefrLevel = body.cefrLevel
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nada a alterar' })
    const card = await vocabRepo.patch(req.userId, p.id, patch)
    if (!card) return res.status(404).json({ error: 'card não encontrado' })
    /* MESMA FORMA DE `GET /api/vocab`. Devolver a linha crua fazia a procedência do cartão sumir
       na tela assim que alguém editasse a tradução (achado A20). */
    res.json({ ...card, ...(await vocabRepo.procedenciaDe(req.userId, p.id)) })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.post('/:id/review', async (req, res) => {
  // P2-1: era `(req.body?.grade ?? 3) as Grade` — cast sem checagem, e o valor entrava no
  // FSRS e era persistido em `review_logs.grade`, corrompendo o histórico do usuário.
  const payload = parseOr400(reviewGradeSchema, req.body, res)
  if (!payload) return
  // Fase 4: o `:id` ia cru para o repositório — a nota tinha schema, o identificador não. É o
  // mesmo `idParamSchema` que o `DELETE /:id` logo abaixo já usava.
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const atualizado = await vocabRepo.review(req.userId, p.id, payload.grade as Grade, payload.retencao)
    res.json({ ...atualizado, ...(await vocabRepo.procedenciaDe(req.userId, p.id)) })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Desfaz a última revisão do cartão (Revisão, tecla Z). */
vocabRouter.post('/:id/desfazer', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const antes = parseOr400(desfazerRevisaoSchema, req.body, res)
  if (!antes) return
  try {
    const card = await vocabRepo.desfazerRevisao(req.userId, p.id, {
      box: antes.box,
      dueAt: antes.dueAt,
      stability: antes.stability ?? null,
      difficulty: antes.difficulty ?? null,
      reps: antes.reps ?? null,
      lapses: antes.lapses ?? null,
      lastReview: antes.lastReview ?? null,
    })
    if (!card) return res.status(404).json({ error: 'card não encontrado' })
    res.json({ ...card, ...(await vocabRepo.procedenciaDe(req.userId, p.id)) })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.delete('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  await vocabRepo.remove(req.userId, p.id)
  res.json({ ok: true })
})
