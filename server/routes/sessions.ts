/** Rotas de sessões (montadas em `/api/sessions`). */
import { Router, raw } from 'express'
import path from 'node:path'
import { sessionsRepo } from '../db/repositories/sessions'
import { utterancesRepo } from '../db/repositories/utterances'
import { createSessionSchema, replaceUtterancesSchema, parseOr400, isSafeImageUrl, patchUtteranceSchema, patchSessionSchema, relabelUtterancesSchema, patchMetaSchema, idParamSchema } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { aliviarListagem, lerCapaEmbutida } from '../lib/capaDeSessao'
import { reservarArmazenamento, liberarArmazenamento, corpoDeRecusa } from '../lib/storageQuota'
import { armazenamentoDoAmbiente } from '../lib/armazenamento'
import { detectarAudio, FORMATOS_DE_AUDIO_ACEITOS } from '../lib/tipoDeArquivo'
import { log } from '../lib/logger'

export const sessionsRouter = Router()

/**
 * Diretório de áudios gravados das sessões (fora do git; ver /data no .gitignore).
 * Exportado para o router de importação gravar o áudio baixado (YouTube) no MESMO store.
 *
 * P0-3 da auditoria: era fixo em `process.cwd()`, então o arquivo ficava preso ao disco da
 * réplica que recebeu o upload — outra réplica respondia `404 arquivo ausente` (a linha do
 * banco replica, o arquivo não). Com `AUDIO_DIR` no env, todas as réplicas apontam para o
 * MESMO volume compartilhado.
 *
 * O default preserva o comportamento do self-host: quem não define nada não muda de lugar.
 *
 * LIMITE: um volume compartilhado resolve multi-réplica no mesmo storage. Para múltiplos
 * hosts sem storage comum, o certo continua sendo object store (S3/R2) — ver 04-scalability §4.
 */
/**
 * Resolve o diretorio de audio a partir do ambiente. PURA, e isso conserta um teste instavel.
 *
 * `AUDIO_DIR` continua sendo resolvida UMA vez no carregamento do modulo (logo abaixo) — esse e o
 * padrao correto e nao mudou. O que mudou e existir uma forma de verificar a REGRA sem reimportar
 * o modulo: `tests/integration/audio-dir-config.test.ts` usava `vi.resetModules()` + `await
 * import(...)`, e este modulo puxa a pilha inteira do banco. Sob carga da maquina, a importacao
 * estourava o prazo e o teste falhava — observado duas vezes durante a auditoria (uma com duas
 * varreduras Docker em curso, outra logo apos a matriz de capacidade), passando sempre com a
 * maquina ociosa. Teste que depende da carga da maquina nao distingue regressao de ruido.
 */
export function resolverAudioDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUDIO_DIR ? path.resolve(env.AUDIO_DIR) : path.join(process.cwd(), 'data', 'audio')
}

export const AUDIO_DIR = resolverAudioDir()

/**
 * F5-02 — a mídia passa a sair por UM seam. O filesystem continua sendo o padrão; com as quatro
 * `S3_*` no ambiente, as MESMAS chamadas vão para object storage sem tocar nas rotas.
 * Exportado porque `me.ts` apaga a mídia do titular pelo mesmo store (uma instância só).
 */
export const armazenamentoDeMidia = armazenamentoDoAmbiente(AUDIO_DIR)

/**
 * S-14: resolve um nome de arquivo DENTRO de `AUDIO_DIR` e recusa qualquer coisa que ESCAPE do
 * diretório (`../…`). Hoje os nomes são UUIDs gerados pelo servidor — isto é defesa em profundidade:
 * um único ponto que aceite nome externo não vira leitura/escrita de arquivo arbitrária.
 *
 * Continua valendo com o seam ligado: é uma checagem SINTÁTICA do nome, feita antes de ele chegar ao
 * store, e é o que distingue "nome inválido" (400) de "objeto ausente" (404).
 */
export function resolveInAudioDir(name: string): string {
  const base = path.resolve(AUDIO_DIR)
  const resolved = path.resolve(base, name)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('caminho de áudio fora do diretório permitido')
  }
  return resolved
}

function readMeta(metaStr: string | null): Record<string, any> {
  try { return metaStr ? JSON.parse(metaStr) : {} } catch { return {} }
}

/**
 * C7 — a listagem devolve a capa como URL, nunca embutida.
 * Medido antes: 1.045 dos 1.074 KiB desta resposta eram data-URI de imagem, de apenas DUAS das
 * 70 sessões, retransmitidos a cada carga de página. Ver `server/lib/capaDeSessao.ts`.
 */
sessionsRouter.get('/', async (req, res) => {
  res.json(aliviarListagem(await sessionsRepo.list(req.userId)))
})

/**
 * A CAPA, servida como imagem de verdade — com cache, que data-URI não tem.
 * `immutable` é seguro porque trocar a capa reescreve o `meta` e o card volta a apontar para a
 * mesma URL com conteúdo novo apenas após um reload; o ganho de não rebaixar 1 MB por navegação
 * supera com folga o custo dessa janela.
 */
sessionsRouter.get('/:id/capa', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const linha = await sessionsRepo.get(req.userId, p.id)
    if (!linha) return res.status(404).json({ error: 'sessão não encontrada' })
    let meta: Record<string, unknown> = {}
    try { meta = linha.meta ? JSON.parse(linha.meta) as Record<string, unknown> : {} } catch { meta = {} }
    const capa = lerCapaEmbutida(meta.imageUrl)
    if (!capa) return res.status(404).json({ error: 'esta sessão não tem capa embutida' })
    res.setHeader('Content-Type', capa.mime)
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.send(capa.bytes)
  } catch (err) {
    return res.status(500).json({ error: erroDeRota(err, { event: 'session_cover_error', route: req.path, requestId: req.requestId }) })
  }
})

// Auditoria de idioma — todas as falas de uma vez. Registrado ANTES de `/:id` (que casa um único
// segmento) para não ser capturado por ele; ainda assim `/utterances/all` tem dois segmentos e não
// colidiria. Espelha `GET /api/vocab`.
sessionsRouter.get('/utterances/all', async (req, res) => {
  res.json(await utterancesRepo.listAll(req.userId))
})

// Reetiquetagem de idioma das falas (Auditoria). Recebe SÓ o que o usuário confirmou; o servidor não
// classifica nem deduz. Espelho de `POST /api/vocab/relabel`.
sessionsRouter.post('/utterances/relabel', async (req, res) => {
  // P2-1: array sem teto virava um UPDATE por item num laço.
  const payload = parseOr400(relabelUtterancesSchema, req.body, res)
  if (!payload) return
  try {
    res.json({ changed: await utterancesRepo.relabel(req.userId, payload.items) })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

sessionsRouter.get('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const result = await sessionsRepo.getWithUtterances(req.userId, p.id)
  if (!result) {
    res.status(404).json({ error: 'sessão não encontrada' })
    return
  }
  res.json(result)
})

sessionsRouter.post('/', async (req, res) => {
  const payload = parseOr400(createSessionSchema, req.body, res)
  if (!payload) return
  try {
    const { utterances = [], ...session } = payload
    // Com `origemLocalId` a criação é idempotente: reenviar devolve 200 com `jaExistia: true`.
    const { session: created, jaExistia } = await sessionsRepo.criarOuReusar(req.userId, session, utterances)
    res.json(jaExistia ? { ...created, jaExistia: true } : created)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

// Upload do áudio gravado da sessão (corpo binário cru — o cliente manda o Blob do MediaRecorder).
sessionsRouter.post(
  '/:id/audio',
  raw({ type: ['audio/*', 'application/octet-stream'], limit: '120mb' }),
  async (req, res) => {
    const p = parseOr400(idParamSchema, req.params, res)
    if (!p) return
    try {
      const session = await sessionsRepo.get(req.userId, p.id)
      if (!session) { res.status(404).json({ error: 'sessão não encontrada' }); return }
      const buf = req.body as Buffer
      if (!buf || !buf.length) { res.status(400).json({ error: 'corpo de áudio vazio' }); return }

      /*
       * F4-04: o tipo sai dos MAGIC BYTES, não do `Content-Type` (que o cliente escolhe). O que é
       * gravado em `sessions.meta` — e devolvido no GET — é o tipo DETECTADO; um ZIP anunciado como
       * `audio/webm` não chega ao disco nem volta como áudio.
       */
      const detectado = detectarAudio(buf)
      if (!detectado) {
        log('warn', { event: 'audio_upload_tipo_invalido', route: req.path, status: 400, requestId: req.requestId })
        res.status(400).json({
          error: `o conteúdo enviado não é um áudio reconhecido (${FORMATOS_DE_AUDIO_ACEITOS})`,
          code: 'audio_content_invalid',
        })
        return
      }
      const contentType = detectado.mime
      const file = `${p.id}.${detectado.ext}`

      /*
       * F4-03: o teto de 120 MB é POR REQUISIÇÃO — 86 uploads no teto enchiam 10 GB, no mesmo
       * volume do banco. A cota é decidida ANTES de o arquivo tocar o disco. Reupload conta só o
       * DELTA: o arquivo é sobrescrito, não somado.
       */
      const anterior = String(readMeta(session.meta).audioFile || '')
      const bytesAnteriores = anterior ? (await armazenamentoDeMidia.tamanho(anterior)) ?? 0 : 0
      const delta = buf.length - bytesAnteriores
      const cota = await reservarArmazenamento(req.userId, delta)
      if (!cota.ok) {
        const r = corpoDeRecusa(cota)
        log('warn', { event: 'storage_quota_denied', route: req.path, status: r.status, requestId: req.requestId })
        res.status(r.status).json(r.body)
        return
      }

      try {
        await armazenamentoDeMidia.gravar(file, buf, contentType)
      } catch (err) {
        await liberarArmazenamento(req.userId, delta) // reserva sem arquivo é cota perdida
        throw err
      }
      // Outra extensão que a anterior: sem isto o arquivo antigo fica órfão e o delta mente.
      if (anterior && anterior !== file) {
        try { await armazenamentoDeMidia.remover(anterior) } catch { /* órfão; a reconciliação corrige */ }
      }
      await sessionsRepo.setAudio(req.userId, p.id, file, contentType)
      res.json({ ok: true, audioUrl: `/api/sessions/${p.id}/audio` })
    } catch (err) {
      res.status(500).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
    }
  }
)

/**
 * Serve o áudio gravado com suporte a Range (é o que faz o seek do `<audio>` funcionar — D1).
 *
 * A faixa é decidida AQUI (limites, 416, `Content-Range`) e só o transporte vai para o seam:
 * filesystem abre o arquivo já posicionado, S3 repassa o `Range` ao objeto. Os dois devolvem um
 * `Readable`, então a rota é a mesma nos dois back-ends.
 */
sessionsRouter.get('/:id/audio', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const session = await sessionsRepo.get(req.userId, p.id)
  if (!session) { res.status(404).end(); return }
  const meta = readMeta(session.meta)
  if (!meta.audioFile) { res.status(404).json({ error: 'sessão sem áudio' }); return }
  const nome = String(meta.audioFile)
  try { resolveInAudioDir(nome) } catch { res.status(400).json({ error: 'caminho de áudio inválido' }); return }
  const size = await armazenamentoDeMidia.tamanho(nome)
  if (size === null) { res.status(404).json({ error: 'arquivo ausente' }); return }
  const type = String(meta.audioType || 'audio/webm')
  const range = req.headers.range

  let start = 0
  let end = size - 1
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    start = m && m[1] ? parseInt(m[1], 10) : 0
    end = m && m[2] ? parseInt(m[2], 10) : size - 1
    if (start >= size || end >= size) { res.status(416).setHeader('Content-Range', `bytes */${size}`); res.end(); return }
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Length', end - start + 1)
  res.setHeader('Content-Type', type)

  try {
    (await armazenamentoDeMidia.lerFaixa(nome, start, end)).pipe(res)
  } catch (err) {
    log('error', { event: 'audio_leitura_falhou', route: req.path, status: 500, error: String((err as Error)?.message || err).slice(0, 120), requestId: req.requestId })
    if (!res.headersSent) res.status(500).json({ error: 'falha ao ler o áudio' })
    else res.end()
  }
})

// Atualiza campos escalares da sessão (renomear, ajustar duração/contagem).
sessionsRouter.patch('/:id', async (req, res) => {
  // P2-1: `kind`/`status` sem teto e números negativos passavam direto para o banco.
  const b = parseOr400(patchSessionSchema, req.body, res)
  if (!b) return
  try {
    const patch: Record<string, unknown> = {}
    if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 200)
    if (typeof b.kind === 'string') patch.kind = b.kind
    if (typeof b.status === 'string') patch.status = b.status
    if (typeof b.durationMs === 'number') patch.durationMs = b.durationMs
    if (typeof b.wordCount === 'number') patch.wordCount = b.wordCount
    const updated = await sessionsRepo.update(req.userId, req.params.id, patch)
    if (!updated) { res.status(404).json({ error: 'sessão não encontrada' }); return }
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

// Substitui TODAS as falas da sessão (fluxo "retomar captura"). Recalcula `wordCount`.
sessionsRouter.put('/:id/utterances', async (req, res) => {
  // Aceita tanto `{ utterances: [...] }` (contrato do cliente) quanto um array cru (legado).
  const normalized = Array.isArray(req.body) ? { utterances: req.body } : req.body
  const payload = parseOr400(replaceUtterancesSchema, normalized, res)
  if (!payload) return
  try {
    const updated = await sessionsRepo.replaceUtterances(req.userId, req.params.id, payload.utterances)
    if (!updated) { res.status(404).json({ error: 'sessão não encontrada' }); return }
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

// Edição pontual de uma fala: corrigir o que o STT ouviu errado ou a tradução.
sessionsRouter.patch('/utterances/:uid', async (req, res) => {
  // P2-1: o POST limitava a 10.000/120 via `utteranceSchema`; o PATCH não tinha teto algum.
  const b = parseOr400(patchUtteranceSchema, req.body, res)
  if (!b) return
  try {
    const patch: Record<string, string> = {}
    for (const k of ['sourceText', 'translatedText', 'speakerName'] as const) {
      if (typeof b[k] === 'string') patch[k] = b[k] as string
    }
    if (!Object.keys(patch).length) { res.status(400).json({ error: 'nada para atualizar' }); return }
    const updated = await utterancesRepo.update(req.userId, req.params.uid, patch)
    if (!updated) { res.status(404).json({ error: 'fala não encontrada' }); return }
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

// Mescla campos no `meta` da sessão (pin/capa da Biblioteca). Só aceita chaves conhecidas.
// `imageUrl: null` ou string vazia limpa a capa; `pinned` vira booleano.
sessionsRouter.patch('/:id/meta', async (req, res) => {
  // P2-N5 / resto do P2-1: era `req.body` cru. `isSafeImageUrl` aceitava `data:image/` de
  // qualquer tamanho, então até ~5mb de base64 iam para a coluna `meta` de cada sessão.
  const body = parseOr400(patchMetaSchema, req.body, res)
  if (!body) return
  try {
    const patch: Record<string, unknown> = {}
    if (body.pinned !== undefined) patch.pinned = !!body.pinned
    if (body.imageUrl !== undefined) {
      const raw = body.imageUrl ? String(body.imageUrl) : null
      // S-13: rejeita esquema não permitido em vez de gravar uma URL de saída arbitrária.
      if (raw && !isSafeImageUrl(raw)) {
        res.status(400).json({ error: 'imageUrl inválida — só https: ou data:image/' }); return
      }
      patch.imageUrl = raw
    }
    const updated = await sessionsRepo.patchMeta(req.userId, req.params.id, patch)
    if (!updated) { res.status(404).json({ error: 'sessão não encontrada' }); return }
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'sessions_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * Soft delete da sessão + remoção do arquivo de áudio real.
 *
 * P1-9: havia duplo swallow (`.catch(() => {})` E `catch {}`) e a resposta era `{ok:true}`
 * de qualquer jeito — o arquivo ficava órfão no disco enquanto o usuário via "apagado". Para
 * um pedido de exclusão (LGPD/GDPR), confirmar o que não aconteceu é o pior dos mundos.
 *
 * A linha SEMPRE sai (é o dado principal, e o usuário pediu); o que muda é que a falha do
 * arquivo passa a ser REPORTADA, para o cliente poder repetir e o operador investigar.
 */
sessionsRouter.delete('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  // Apaga o áudio ANTES do soft delete (depois o `get` filtra por deletedAt e some).
  const session = await sessionsRepo.get(req.userId, p.id)
  let audioErro: string | null = null
  if (session) {
    const meta = readMeta(session.meta)
    if (meta.audioFile) {
      try {
        // O store já ignora "objeto não existe" — chegar ao catch é falha real
        // (permissão, lock do antivírus/OneDrive) ou caminho inválido.
        const nome = String(meta.audioFile)
        const bytes = (await armazenamentoDeMidia.tamanho(nome)) ?? 0
        await armazenamentoDeMidia.remover(nome)
        await liberarArmazenamento(req.userId, bytes) // F4-03: só libera cota se o arquivo saiu
      } catch (err) {
        audioErro = String((err as Error)?.message || err).slice(0, 160)
      }
    }
  }
  await sessionsRepo.remove(req.userId, p.id)
  if (audioErro) {
    res.status(500).json({ ok: false, error: `sessão removida, mas o áudio não pôde ser apagado: ${audioErro}` })
    return
  }
  res.json({ ok: true })
})
