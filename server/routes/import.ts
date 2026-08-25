/**
 * Rotas de IMPORTAÇÃO (montadas em `/api/import`). Cada importação produz uma SESSÃO no formato
 * canônico (sessions + utterances [+ áudio]), então todo o downstream (Análise, vocabulário,
 * exercícios, player sincronizado) funciona sem tela nova.
 *
 *  - POST /youtube  { url }            → baixa áudio + legenda (ou marca needsClientStt p/ o Whisper)
 *  - POST /web      { url }            → extrai o artigo (cliente monta a sessão-documento)
 *  - POST /document (corpo binário)    → extrai o texto do arquivo (cliente monta a sessão-documento)
 *  - POST /anki     (corpo binário)    → lê um baralho .apkg/.txt e devolve as notas (NÃO grava)
 *  - POST /anki/export { cartoes }     → devolve um .apkg pronto para o Anki
 */
import { Router, raw } from 'express'
import path from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { AUDIO_DIR, armazenamentoDeMidia } from './sessions'
import { sessionsRepo } from '../db/repositories/sessions'
import { hasYtDlp, resolveYouTube, fetchCaptions, downloadAudio } from '../import/youtube'
import { extractArticle } from '../import/web'
import { extractDocument } from '../import/document'
import { lerApkg, lerTextoAnki } from '../import/anki'
// F11-04: schemas de corpo e de cabeçalho das rotas de importação.
import { parseOr400, ankiExportSchema, importUrlSchema, uploadHeadersSchema } from '../validation'
import { montarApkg } from '../import/ankiExport'
import { erroDeRota } from '../lib/erroDeRota'
import {
  reservarArmazenamento,
  liberarArmazenamento,
  ajustarArmazenamento,
  estimarBytesDeAudio,
  tamanhoNoDisco,
  corpoDeRecusa,
} from '../lib/storageQuota'

export const importRouter = Router()

/*
 * F4-03 — só ESTA rota grava arquivo. `/document` (30 MB) e `/anki` (200 MB) leem o corpo em
 * memória e devolvem o texto/as notas; nada delas chega ao disco, então não consomem cota.
 */

/**
 * BARALHO DO ANKI. Mesmo padrão do `/document`: corpo binário cru com o nome no cabeçalho — o
 * projeto não usa multer e não precisa.
 *
 * A rota só LÊ e devolve as notas; quem grava é o cliente, chamando `/api/vocab/bulk-add`. Isso é
 * de propósito: assim o baralho importado passa pela MESMA régua de qualidade e pela MESMA
 * deduplicação de tudo que entra no vocabulário, em vez de ter um caminho paralelo por onde o
 * lixo voltaria a entrar.
 */
/**
 * Gera um `.apkg` a partir dos cartões enviados.
 *
 * Fica no servidor porque montar um SQLite exige sistema de arquivos — e porque é o mesmo driver
 * (`@libsql/client`) que o app já usa, em vez de trazer uma segunda implementação de SQLite só
 * para o navegador.
 */
importRouter.post('/anki/export', async (req, res) => {
  const body = parseOr400(ankiExportSchema, req.body, res)
  if (!body) return
  try {
    const nome = body.nome || 'Babel Play'
    const apkg = await montarApkg(body.cartoes, nome)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\w.-]/g, '_')}.apkg"`)
    res.send(apkg)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
  }
})

importRouter.post('/anki', raw({ type: () => true, limit: '200mb' }), async (req, res) => {
  const cab = parseOr400(uploadHeadersSchema, req.headers, res)
  if (!cab) return
  try {
    const buf = req.body as Buffer
    if (!buf?.length) { res.status(400).json({ error: 'arquivo vazio' }); return }
    const nome = decodeURIComponent(cab['x-filename'] || 'baralho')
    const ehTexto = /\.(txt|csv|tsv)$/i.test(nome)
    const r = ehTexto ? lerTextoAnki(buf.toString('utf8')) : await lerApkg(buf)
    res.json(r)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
  }
})

const isYouTube = (u: string) =>
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/i.test(u)

// YouTube: legenda-primeiro (timestamps reais) + download do áudio; sem legenda → Whisper no cliente.
importRouter.post('/youtube', async (req, res) => {
  // Bytes reservados que ainda não têm arquivo correspondente — todo caminho que não entrega
  // áudio precisa devolvê-los, senão uma falha do yt-dlp consome a cota sem gravar nada.
  let reservaPendente = 0
  const corpo = parseOr400(importUrlSchema, req.body, res)
  if (!corpo) return
  try {
    const url = corpo.url.trim()
    if (!isYouTube(url)) { res.status(400).json({ error: 'Informe um link de vídeo do YouTube.' }); return }
    if (!(await hasYtDlp())) {
      res.status(501).json({
        error: 'yt-dlp não encontrado. Instale o yt-dlp e coloque-o no PATH (ou defina a variável de ambiente YTDLP_PATH) para importar do YouTube.',
      })
      return
    }

    const info = await resolveYouTube(url)

    /*
     * F4-03: reserva ANTES de baixar. O yt-dlp não informa o tamanho de antemão, então a reserva é
     * uma ESTIMATIVA pela duração, ajustada para o tamanho REAL logo após o download. Sem cota, o
     * arquivo não chega a existir — nem gastamos a banda.
     */
    const estimativa = estimarBytesDeAudio(info.durationMs)
    const cota = await reservarArmazenamento(req.userId, estimativa)
    if (!cota.ok) {
      const r = corpoDeRecusa(cota)
      res.status(r.status).json(r.body)
      return
    }
    reservaPendente = estimativa

    // P2-6: "não tem legenda" (null) e "falhou ao buscar a legenda" (throw) são coisas
    // diferentes. O segundo caso é reportado como `captionErro` em vez de virar silenciosamente
    // uma sessão vazia com `needsClientStt` — o usuário saberia por que precisa transcrever.
    let caps: Awaited<ReturnType<typeof fetchCaptions>> = null
    let captionErro: string | null = null
    try {
      caps = await fetchCaptions(info)
    } catch (err) {
      captionErro = erroDeRota(err, { event: 'import_route_error' })
    }
    const sourceLang = caps?.lang || info.lang || undefined
    const utts = caps
      ? caps.cues.map((c, i) => ({
          idx: i,
          source: 'tab',
          sourceLang,
          sourceText: c.text,
          tStartMs: c.startMs,
          tEndMs: c.endMs,
          engine: `youtube-caption-${caps.kind}`, // selo de procedência (manual | auto)
        }))
      : []

    const session = await sessionsRepo.createWithUtterances(
      req.userId,
      { kind: 'video', title: info.title, sourceLang, status: 'ready', durationMs: info.durationMs },
      utts
    )

    /*
     * O yt-dlp é um SUBPROCESSO: ele só sabe escrever em disco, então baixa sempre local. Com
     * `S3_*` configurado, o store das sessões não é o disco — e sem o passo abaixo o áudio ficaria
     * em `AUDIO_DIR` enquanto o `GET /:id/audio` o procuraria no bucket, dando 404.
     */
    const audio = await downloadAudio(url, session.id, AUDIO_DIR)
    const local = path.join(AUDIO_DIR, audio.file)
    const bytes = tamanhoNoDisco(local)

    if (armazenamentoDeMidia.tipo !== 'arquivos') {
      await armazenamentoDeMidia.gravar(audio.file, await readFile(local), audio.contentType)
      await rm(local, { force: true })
    }

    // O arquivo existe: a estimativa vira o tamanho medido e a reserva deixa de ser pendente.
    await ajustarArmazenamento(req.userId, bytes - estimativa)
    reservaPendente = 0
    await sessionsRepo.setAudio(req.userId, session.id, audio.file, audio.contentType)

    res.json({
      id: session.id,
      needsClientStt: !caps,
      sourceLang,
      captionKind: caps?.kind ?? null,
      // null = o vídeo não tem legenda; string = tinha, mas a busca falhou (vale repetir).
      captionErro,
    })
  } catch (err) {
    if (reservaPendente) await liberarArmazenamento(req.userId, reservaPendente)
    res.status(500).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
  }
})

// Artigo web: servidor busca o HTML e devolve o texto principal (o cliente monta a sessão).
importRouter.post('/web', async (req, res) => {
  const corpo = parseOr400(importUrlSchema, req.body, res)
  if (!corpo) return
  try {
    const url = corpo.url.trim()
    if (!url) { res.status(400).json({ error: 'Informe uma URL.' }); return }
    res.json(await extractArticle(url))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
  }
})

// Documento: corpo binário cru + nome no header X-Filename (mesmo padrão do upload de áudio).
importRouter.post('/document', raw({ type: () => true, limit: '30mb' }), async (req, res) => {
  const cab = parseOr400(uploadHeadersSchema, req.headers, res)
  if (!cab) return
  try {
    const buf = req.body as Buffer
    if (!buf || !buf.length) { res.status(400).json({ error: 'Arquivo vazio.' }); return }
    const filename = decodeURIComponent(cab['x-filename'] || 'documento')
    const mime = cab['content-type'] || ''
    res.json(await extractDocument(buf, filename, mime))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
  }
})
