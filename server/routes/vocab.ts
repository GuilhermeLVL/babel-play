/** Rotas de vocabulário/SRS (montadas em `/api/vocab`). */
import { Router } from 'express'

import { DIAS_DO_CALENDARIO } from '../../src/core/learning/resumoDosCartoes'
import type { Grade } from '../../src/core/learning/scheduler'
import { FLAG_ESTUDO_PALAVRAS_V2 } from '../../src/core/planos'
import { chaveDaPalavraNaVersao } from '../../src/core/texto/palavra'
import { MAX_ETIQUETAS, normalizarEtiqueta, normalizarEtiquetas } from '../../src/core/vocabulario/etiquetasDoUsuario'
import { TETO_DE_MARCADAS } from '../../src/core/vocabulario/marcadas'
import { contagensDeConteudo, versaoDosBaralhos } from '../db/repositories/contagensDeConteudo'
import { memoriaPorBaralho } from '../db/repositories/memoriaPorBaralho'
import { sequenciaDosDias } from '../db/repositories/metrics'
import { opcoesDaRevisaoRepo } from '../db/repositories/opcoesDaRevisao'
import { palavrasMarcadasRepo } from '../db/repositories/palavrasMarcadas'
import { palavrasVistasRepo } from '../db/repositories/palavrasVistas'
import { resumoDosCartoes, tempoPorCartao } from '../db/repositories/resumoDosCartoes'
import { versoesRepo } from '../db/repositories/versoes'
import { vocabRepo } from '../db/repositories/vocab'
import { CachePorVersao } from '../lib/cachePorVersao'
import { erroDeRota } from '../lib/erroDeRota'
import { casaComIfNoneMatch, etagPorVersao } from '../lib/etagPorVersao'
import { flagLigada } from '../lib/flags'
import { log } from '../lib/logger'
import { versaoDaChaveDedup } from '../lib/versaoDaChaveDedup'
import {
  bulkAddCardsSchema,
  desfazerRevisaoSchema,
  etiquetasDoCartaoSchema,
  idParamSchema,
  loteDeCartoesSchema,
  loteDeMarcadasSchema,
  marcarPalavraSchema,
  notaDoCartaoSchema,
  opcoesDaRevisaoSchema,
  palavraQuerySchema,
  palavrasMarcadasQuerySchema,
  palavrasVistasQuerySchema,
  parseOr400,
  patchVocabSchema,
  relabelVocabSchema,
  reviewGradeSchema,
  vocabConteudoQuerySchema,
  vocabPaginaQuerySchema,
  vocabParaJogoQuerySchema,
  vocabResumoQuerySchema,
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
 * O ETag carrega também um resumo do usuário e a ÉPOCA do processo: o porquê está em
 * `server/lib/etagPorVersao.ts`, de onde ele sai desde que `GET /api/exercises/historico` e
 * `GET /api/metrics/profile` passaram a usar o mesmo desenho.
 */
/* Teto de ~64 MB, contando 2 bytes por caractere (o pior caso do V8, texto com acento): ~13
   baralhos grandes (2,3 MB cada) ou centenas de pequenos. Quem não cabe continua sendo servido —
   só não fica. Medido: com 24 MB, dez usuários pesados alternando já não cabiam e toda leitura
   voltava ao banco. */
const baralhosServidos = new CachePorVersao<string>(512, 64 * 1024 * 1024)

const etagDoBaralho = (userId: string, versao: number) => etagPorVersao('vocab', userId, versao)

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
  const validas = q.etiquetas?.map(normalizarEtiqueta).filter((e): e is string => e !== null)
  /* Filtro pedido mas nenhuma etiqueta válida (ex.: `?etiquetas=%23%23`): nenhum cartão casa, em vez de cair no
     acervo inteiro (lista vazia = "sem filtro" no repositório). O `#` nunca sobrevive à normalização (cai no começo e fora da classe de letras), então não
     existe etiqueta gravada com ele, e a resposta mantém o formato (contagens `porOrigem` incluídas). */
  const etiquetas = q.etiquetas?.length && !validas?.length ? ['#'] : validas
  try {
    res.json(
      await vocabRepo.listarPagina(req.userId, {
        limite: q.limite,
        cursor: q.cursorValor !== undefined && q.cursorId ? { valor: q.cursorValor, id: q.cursorId } : null,
        busca: q.q,
        niveis: q.niveis,
        origens: q.origens,
        etiquetas,
        forcas: q.forcas,
        /* O filtro por estado é da flag: desligada, o parâmetro é ignorado e a página é a de sempre. */
        estados: q.estados?.length && (await flagLigada(req, FLAG_ESTUDO_PALAVRAS_V2)) ? q.estados : undefined,
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

/**
 * O RESUMO DOS CARTÕES: as contagens da tela Cartões, no lugar do baralho inteiro (2 MB só para
 * contar). O contrato é `src/core/learning/resumoDosCartoes.ts`.
 *
 * ETag pela versão, como o `GET /` acima, com duas diferenças:
 *   · o resumo depende de `vocab_cards`, `vocab_occurrences` E `review_logs`, e nenhum contador da
 *     migração 0032 cobre os três (`vocab` não vê revisão apagada ou desfeita; `atividade` não vê
 *     ocorrência). Os dois entram juntos na versão;
 *   · "vence agora" depende do relógio. O `agora` é o fim do minuto do pedido, e ele e o começo do dia de
 *     quem pediu entram como variante: a resposta é a mesma para (versão, dia, minuto), e o ETag
 *     de um minuto não vale no seguinte.
 * If-None-Match igual → 304 com UMA consulta de chave primária, sem tocar nas três tabelas.
 */
vocabRouter.get('/resumo', async (req, res) => {
  const q = parseOr400(vocabResumoQuerySchema, req.query, res)
  if (!q) return
  try {
    /* O FIM do minuto do pedido, e não o começo: a palavra que a pessoa acabou de guardar nasce
       vencendo "agora" (`due_at = now`), e com o começo do minuto ela ficava até 59 s fora da contagem
       de "Hoje". Continua determinístico por (versão, minuto), que é o que o ETag promete. */
    const agora = Math.ceil(Date.now() / 60_000) * 60_000
    // A versão ANTES das tabelas — ver `CachePorVersao` para o porquê da ordem.
    const { vocab, atividade } = await versoesRepo.de(req.userId)
    const etag = etagPorVersao(
      'resumo-cartoes',
      req.userId,
      `${vocab}.${atividade}`,
      `${q.inicioDoDia}|${agora}${q.v2 ? '|v2' : ''}`,
    )
    res.setHeader('ETag', etag)
    if (casaComIfNoneMatch(req.headers['if-none-match'], etag)) {
      res.status(304).end()
      return
    }
    const resumo = await resumoDosCartoes(req.userId, { agora, inicioDoDia: q.inicioDoDia })
    /* REVISÃO V2 (flag `estudo_revisao_v2`): o cliente só pede com a flag ligada, então sem o pedido a resposta é a de
       sempre. Tudo da própria conta (`req.userId`). */
    if (q.v2) {
      const [tempo, sequencia] = await Promise.all([
        tempoPorCartao(req.userId, agora),
        sequenciaDosDias(req.userId, DIAS_DO_CALENDARIO),
      ])
      res.json({ ...resumo, tempo, sequencia })
      return
    }
    res.json(resumo)
  } catch (err) {
    /* 500, e não o 400 das vizinhas: a entrada já passou pelo schema, então o que estoura aqui é
       do servidor. Sem o ETag, para um erro não ser revalidado como se fosse o resumo. */
    res.removeHeader('ETag')
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * AS CONTAGENS POR FONTE: o que o seletor de conteúdo mostra (Tudo, Difíceis, cada sessão com cartões,
 * cada baralho do Anki, a Trilha), no idioma pedido. O contrato, com a definição de cada número, é
 * `src/core/learning/contagensDeConteudo.ts`.
 *
 * O mesmo desenho do resumo, logo acima: ETag pela versão dos dados, com o minuto do pedido e o idioma
 * como variante ("para hoje" depende do relógio). A versão junta `vocab` (cartões e ocorrências),
 * `atividade` (o título de uma sessão) e a dos baralhos do Anki, que nenhum contador cobre.
 *   · If-None-Match igual → 304 com duas consultas de chave/índice, sem tocar nos cartões;
 *   · mesma versão, mesmo minuto e mesmo idioma → o corpo já serializado (`conteudosServidos`);
 *   · senão → lê, conta e guarda.
 */
const conteudosServidos = new CachePorVersao<string>(512, 8 * 1024 * 1024)

vocabRouter.get('/conteudo', async (req, res) => {
  const q = parseOr400(vocabConteudoQuerySchema, req.query, res)
  if (!q) return
  try {
    const idioma = (q.idioma ?? '').toLowerCase().slice(0, 2)
    const agora = Math.ceil(Date.now() / 60_000) * 60_000
    // A versão ANTES das tabelas — ver `CachePorVersao` para o porquê da ordem.
    const [{ vocab, atividade }, baralhos] = await Promise.all([
      versoesRepo.de(req.userId),
      versaoDosBaralhos(req.userId),
    ])
    const versao = `${vocab}.${atividade}.${baralhos}`
    const etag = etagPorVersao('conteudo', req.userId, versao, `${idioma}|${agora}`)
    res.setHeader('ETag', etag)
    if (casaComIfNoneMatch(req.headers['if-none-match'], etag)) {
      res.status(304).end()
      return
    }
    const chave = `${req.userId}|${idioma}`
    let corpo = conteudosServidos.obter(chave, `${versao}|${agora}`)
    if (corpo === undefined) {
      corpo = JSON.stringify(await contagensDeConteudo(req.userId, { agora, idioma }))
      conteudosServidos.guardar(chave, `${versao}|${agora}`, corpo, corpo.length)
    }
    res.type('application/json').send(corpo)
  } catch (err) {
    res.removeHeader('ETag')
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * ETIQUETAS DE PALAVRAS: as chaves das palavras que a pessoa já viu nas sessões dela, num idioma (base) —
 * a legenda marca "já vi" sem pedir palavra por palavra. A chave é a de `src/core/texto/palavrasVistas.ts`.
 *
 * ETag pela versão `palavras` (`versoes_de_dados`), que sobe só quando o CONJUNTO de chaves pode ter
 * mudado (linha nova ou que zerou no índice, reconstrução, sessão removida) — o lote da captura que só soma
 * ocorrência, a tradução, o título e o polimento não invalidam. O idioma entra como variante.
 * If-None-Match igual → 304 com UMA consulta de chave primária. Teto de `TETO_DE_CHAVES_VISTAS` chaves, das
 * mais vistas: acima dele, `truncado: true`.
 *
 * PARA O CLIENTE: pedir ao abrir a tela e ao FIM da captura, nunca durante ela — durante a captura a legenda
 * marca as palavras novas pelo que acabou de ouvir (as falas que ela mesma mostra).
 */
vocabRouter.get('/vistas', async (req, res) => {
  const q = parseOr400(palavrasVistasQuerySchema, req.query, res)
  if (!q) return
  try {
    const lang = q.lang.toLowerCase().split('-')[0]
    const { palavras } = await versoesRepo.de(req.userId)
    const etag = etagPorVersao('palavras-vistas', req.userId, palavras, lang)
    res.setHeader('ETag', etag)
    if (casaComIfNoneMatch(req.headers['if-none-match'], etag)) {
      res.status(304).end()
      return
    }
    res.json(await palavrasVistasRepo.chavesVistas(req.userId, lang))
  } catch (err) {
    res.removeHeader('ETag')
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * O HISTÓRICO DE UMA PALAVRA (a gaveta da etiqueta): o cartão, se houver (estado na régua de
 * `core/learning/estadoDoCartao.ts`), quantas vezes e em quantas sessões ela apareceu, até 10 sessões com a
 * frase de exemplo, os jogos e a nota. Palavra nunca vista nem salva: 200 com tudo zerado.
 */
vocabRouter.get('/palavra', async (req, res) => {
  const q = parseOr400(palavraQuerySchema, req.query, res)
  if (!q) return
  try {
    res.json(await palavrasVistasRepo.historico(req.userId, q.lang, q.chave))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * AS OPÇÕES DA REVISÃO NA CONTA E O LIMITE DIÁRIO (openspec `cartoes`, 2.1 e 2.2). Antes de `/:id`.
 *
 *   GET /opcoes-da-revisao → `{ opcoes, naConta, hoje: { novas, revisoes, restamNovas, restamRevisoes } }`
 *                            (`hoje` é o feito no dia da pessoa, no fuso gravado da conta; sem linha, o padrão)
 *   PUT /opcoes-da-revisao → corpo PARCIAL (só o que mudou), fora da faixa é 400 → mesmo formato do GET
 *
 * O limite é preferência de estudo da pessoa, não cota de plano: nenhum teto por plano passa por aqui.
 */
vocabRouter.get('/opcoes-da-revisao', async (req, res) => {
  try {
    res.json(await opcoesDaRevisaoRepo.comHoje(req.userId))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.put('/opcoes-da-revisao', async (req, res) => {
  const corpo = parseOr400(opcoesDaRevisaoSchema, req.body, res)
  if (!corpo) return
  try {
    await opcoesDaRevisaoRepo.gravar(req.userId, corpo)
    res.json(await opcoesDaRevisaoRepo.comHoje(req.userId))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * AS PALAVRAS MARCADAS SEM CARTÃO — "Já sei" (`conhecida`) e "Ignorar" (`ignorada`), openspec
 * `vocab-conhecidas-e-ignoradas`. Registradas ANTES de `/:id`: `DELETE /marcadas` não pode cair em "apagar o cartão
 * de id `marcadas`".
 *
 *   GET    /marcadas?lang=xx        → `{ marcadas: [{ lang, chave, estado, atualizadoEm }], truncado }` (sem `lang`: todas)
 *   PUT    /marcadas                → `{ lang, chave, estado }` (upsert) → 200 `{ marcada }`; teto: 409 `marcadas_cheio`
 *   DELETE /marcadas?lang=xx&chave=yy → 204 (idempotente)
 *   PUT /marcadas/lote e POST /marcadas/lote/desfazer: ver abaixo
 *
 * O servidor reduz o idioma à base e a chave com `chaveDaPalavraNaVersao` (v1 = `chaveDaPalavra`, v2 com a flag `chave_dedup_v2`) (o cliente não é confiável); chave que não sobra
 * nada (só pontuação) é 400.
 */
const idiomaBaseDe = (lang: string) => lang.toLowerCase().split('-')[0]

vocabRouter.get('/marcadas', async (req, res) => {
  const q = parseOr400(palavrasMarcadasQuerySchema, req.query, res)
  if (!q) return
  try {
    const lista = await palavrasMarcadasRepo.listar(
      req.userId,
      q.lang ? idiomaBaseDe(q.lang) : undefined,
      TETO_DE_MARCADAS + 1,
    )
    res.json({ marcadas: lista.slice(0, TETO_DE_MARCADAS), truncado: lista.length > TETO_DE_MARCADAS })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.put('/marcadas', async (req, res) => {
  const body = parseOr400(marcarPalavraSchema, req.body, res)
  if (!body) return
  const chave = chaveDaPalavraNaVersao(body.chave, body.lang, versaoDaChaveDedup())
  if (!chave) return res.status(400).json({ error: 'chave sem letras', code: 'chave_invalida' })
  try {
    const r = await palavrasMarcadasRepo.marcar(
      req.userId,
      { lang: idiomaBaseDe(body.lang), chave, estado: body.estado },
      TETO_DE_MARCADAS,
    )
    if (r.ok === false) {
      return res.status(409).json({
        error: `cada conta guarda até ${TETO_DE_MARCADAS} palavras marcadas; desmarque alguma para marcar outra`,
        code: 'marcadas_cheio',
        limite: TETO_DE_MARCADAS,
      })
    }
    res.json({ marcada: r.marcada })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * MARCAÇÃO EM LOTE (openspec `teste-de-vocabulario`): o teste rápido semeia "Já sei" de uma vez.
 *   PUT  /marcadas/lote          → `{ lang, chaves: [até 3.000] }` → 200 `{ criadas, jaConhecidas, ignoradas, comCartao }`;
 *                                  só `conhecida`; atômico no teto (409 `marcadas_cheio`, nada gravado).
 *   POST /marcadas/lote/desfazer → `{ lang, chaves }` → 200 `{ removidas }` (só apaga `conhecida`).
 * Registradas ANTES de `DELETE /marcadas` e de `/:id`.
 */
function chavesDoLote(lang: string, brutas: string[]) {
  return {
    idioma: idiomaBaseDe(lang),
    chaves: [...new Set(brutas.map((c) => chaveDaPalavraNaVersao(c, lang, versaoDaChaveDedup())).filter(Boolean))],
  }
}

vocabRouter.put('/marcadas/lote', async (req, res) => {
  const body = parseOr400(loteDeMarcadasSchema, req.body, res)
  if (!body) return
  const { idioma, chaves } = chavesDoLote(body.lang, body.chaves)
  if (!chaves.length) return res.status(400).json({ error: 'nenhuma chave com letras', code: 'chave_invalida' })
  try {
    const r = await palavrasMarcadasRepo.marcarEmLote(req.userId, idioma, chaves, TETO_DE_MARCADAS)
    if (r.ok === false) {
      return res.status(409).json({
        error: `cada conta guarda até ${TETO_DE_MARCADAS} palavras marcadas; desmarque alguma para marcar outras`,
        code: 'marcadas_cheio',
        limite: TETO_DE_MARCADAS,
      })
    }
    const { ok: _ok, ...resumo } = r
    res.json(resumo)
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.post('/marcadas/lote/desfazer', async (req, res) => {
  const body = parseOr400(loteDeMarcadasSchema, req.body, res)
  if (!body) return
  const { idioma, chaves } = chavesDoLote(body.lang, body.chaves)
  if (!chaves.length) return res.status(400).json({ error: 'nenhuma chave com letras', code: 'chave_invalida' })
  try {
    res.json({ removidas: await palavrasMarcadasRepo.desfazerLote(req.userId, idioma, chaves) })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

vocabRouter.delete('/marcadas', async (req, res) => {
  // A mesma forma de `GET /palavra`: `lang` e `chave`.
  const q = parseOr400(palavraQuerySchema, req.query, res)
  if (!q) return
  const chave = chaveDaPalavraNaVersao(q.chave, q.lang, versaoDaChaveDedup())
  if (!chave) return res.status(400).json({ error: 'chave sem letras', code: 'chave_invalida' })
  try {
    await palavrasMarcadasRepo.desmarcar(req.userId, idiomaBaseDe(q.lang), chave)
    res.status(204).end()
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
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
 * Edição de um cartão pela curadoria: tradução, frase, nível e presença no baralho; e, pela revisão,
 * `adiarAte` ("Deixar para amanhã", "Descansar 30 dias"): só a data em que o cartão volta a vencer.
 * A memória do cartão (estabilidade, dificuldade, erros) e o idioma têm donos próprios.
 */
vocabRouter.patch('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(patchVocabSchema, req.body, res)
  if (!body) return
  try {
    const patch: {
      back?: string
      inDeck?: boolean
      sentence?: string
      cefrLevel?: string | null
      adiarAte?: number
    } = {}
    if (body.back !== undefined) patch.back = body.back
    if (body.inDeck !== undefined) patch.inDeck = body.inDeck
    if (body.sentence !== undefined) patch.sentence = body.sentence
    if (body.cefrLevel !== undefined) patch.cefrLevel = body.cefrLevel
    if (body.adiarAte !== undefined) patch.adiarAte = body.adiarAte
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

/** A nota pessoal do cartão (até 500 caracteres; `''` limpa). Cartão que não é seu: 404. */
vocabRouter.put('/:id/nota', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(notaDoCartaoSchema, req.body, res)
  if (!body) return
  try {
    const salvo = await vocabRepo.salvarNota(req.userId, p.id, body.nota)
    if (!salvo) return res.status(404).json({ error: 'card não encontrado' })
    res.json(salvo)
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * As etiquetas do usuário no cartão: a lista inteira (substitui; `[]` limpa), normalizada aqui (minúsculas, até 10
 * de até 32 caracteres, sem repetidas). Etiqueta inválida ou lista longa demais: 400 com o motivo. Cartão que não é
 * seu: 404.
 */
vocabRouter.put('/:id/etiquetas', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(etiquetasDoCartaoSchema, req.body, res)
  if (!body) return
  const norm = normalizarEtiquetas(body.etiquetas)
  if ('motivo' in norm) {
    return res.status(400).json({
      error:
        norm.motivo === 'muitas' ? `no máximo ${MAX_ETIQUETAS} etiquetas` : 'etiqueta inválida (vazia ou longa demais)',
    })
  }
  try {
    const salvo = await vocabRepo.salvarEtiquetas(req.userId, p.id, norm.etiquetas)
    if (!salvo) return res.status(404).json({ error: 'card não encontrado' })
    res.json(salvo)
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * A MEMÓRIA POR BARALHO (openspec `cartoes` 4.2), atrás da flag `estudo_palavras_v2` (desligada: 404). Retenção dos últimos
 * 90 dias e próxima revisão de cada idioma, sessão, baralho do Anki e da Trilha da conta. A regra dos 20 é do cliente
 * (`retencaoDoBaralho`): o servidor manda as contagens cruas.
 */
vocabRouter.get('/memoria-por-baralho', async (req, res) => {
  if (!(await flagLigada(req, FLAG_ESTUDO_PALAVRAS_V2))) return res.status(404).json({ error: 'não encontrado' })
  try {
    res.set('Cache-Control', 'private, no-store')
    res.json(await memoriaPorBaralho(req.userId, Date.now()))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * A SELEÇÃO EM MASSA (openspec `cartoes` 6.2b), atrás da flag `estudo_palavras_v2` (desligada: 404, como se a rota não
 * existisse). Até 50 ids: suspender, retomar ou etiquetar. Posse por `user_id` no repositório; id de outra conta e id que não
 * existe dão o MESMO 404, e nada muda (tudo ou nada).
 */
vocabRouter.post('/lote', async (req, res) => {
  if (!(await flagLigada(req, FLAG_ESTUDO_PALAVRAS_V2))) return res.status(404).json({ error: 'não encontrado' })
  const body = parseOr400(loteDeCartoesSchema, req.body, res)
  if (!body) return
  try {
    const r = await vocabRepo.aplicarLote(req.userId, body.ids, body)
    if (!r) return res.status(404).json({ error: 'card não encontrado' })
    if ('erro' in r) return res.status(400).json({ error: 'etiqueta inválida ou mais de 10 etiquetas num cartão' })
    res.json(r)
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** As etiquetas em uso na conta, com a contagem de cartões: a sugestão do detalhe e o filtro do catálogo. */
vocabRouter.get('/etiquetas', async (req, res) => {
  try {
    res.json({ etiquetas: await vocabRepo.etiquetasEmUso(req.userId) })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'vocab_route_error', route: req.path, requestId: req.requestId }),
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
    const atualizado = await vocabRepo.review(req.userId, p.id, payload.grade as Grade, payload.retencao, {
      origem: payload.origem,
      formato: payload.formato,
      respostaMs: payload.respostaMs,
    })
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
