/**
 * Rotas de IMPORTAÇÃO (montadas em `/api/import`). Cada importação produz uma SESSÃO no formato
 * canônico (sessions + utterances [+ áudio]), então todo o downstream (Análise, vocabulário,
 * exercícios, player sincronizado) funciona sem tela nova.
 *
 *  - POST /youtube                     → 410 rota_removida (o yt-dlp saiu; ver o comentário da rota)
 *  - POST /web      { url }            → extrai o artigo (cliente monta a sessão-documento)
 *  - POST /document (corpo binário)    → extrai o texto do arquivo (cliente monta a sessão-documento)
 */
import { Router } from 'express'

import { extractDocument } from '../import/document'
import { extractArticle } from '../import/web'
import {
  CorpoGrandeDemais,
  CorpoInterrompido,
  descartarRestoDoCorpo,
  lerCorpoViaArquivo,
  tamanhoDeclarado,
} from '../lib/corpoRecebido'
import { vagaDeCorpoGrande } from '../lib/corposGrandes'
import { erroDeRota } from '../lib/erroDeRota'
import { envelopeDeErro, responderErro } from '../lib/respostaDeErro'
import { ehWorker } from '../lib/runtime'
// F11-04: schemas de corpo e de cabeçalho das rotas de importação.
import { importUrlSchema, parseOr400, uploadHeadersSchema } from '../validation'

export const importRouter = Router()

/* IMPORTAÇÃO PESADA SÓ NO NODE até a Fase 3 (decisão 6 do plano da Fase 2): PDF/DOCX e link web
   precisam de disco temporário, jsdom, pdfjs e mammoth, que no bundle do Worker são stubs. Lá estas rotas
   respondem 503 `indisponivel_neste_runtime` antes de ler o corpo. O Anki saiu daqui: o `.apkg` é lido no
   navegador e as notas chegam pelo protocolo em lotes (`server/routes/ankiImports.ts`). */
importRouter.use(['/document', '/web'], (req, res, next) => {
  if (!ehWorker()) return next()
  descartarRestoDoCorpo(req)
  responderErro(res, 503, 'importação indisponível neste servidor', 'indisponivel_neste_runtime')
})

/** O nome do arquivo vem codificado no cabeçalho; um `%` malformado é 400 do cliente, não um 500 nosso. */
function nomeDoCabecalho(valor: string | undefined, padrao: string): string {
  try {
    return decodeURIComponent(valor || padrao)
  } catch {
    return padrao
  }
}

/**
 * YouTube: APOSENTADO (Task 10 da Fase 2). Rodava o yt-dlp como subprocesso no servidor, o que não existe
 * num Worker (e já respondia 403 em produção). A rota fica registrada para quem ainda a chama receber uma
 * resposta explícita — 410, não um 404 que parece defeito —, sem validar corpo nem checar plano.
 */
importRouter.post('/youtube', (_req, res) => {
  responderErro(res, 410, 'a importação de vídeos do YouTube foi removida', 'rota_removida')
})

// Artigo web: servidor busca o HTML e devolve o texto principal (o cliente monta a sessão).
importRouter.post('/web', async (req, res) => {
  const corpo = parseOr400(importUrlSchema, req.body, res)
  if (!corpo) return
  try {
    const url = corpo.url.trim()
    if (!url) {
      res.status(400).json({ error: 'Informe uma URL.' })
      return
    }
    res.json(await extractArticle(url))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'import_route_error' }) })
  }
})

/**
 * Documento: corpo binário cru + nome no header X-Filename (mesmo padrão do upload de áudio).
 *
 * 30 MB passa do teto de 5 MB do ADR 0009 para `express.raw`: entra no semáforo de corpos grandes
 * e chega pelo disco. O extrator (pdf/docx) exige Buffer, então o corpo ainda fica 1× na memória
 * enquanto ele roda — o limite remanescente é esse, e o semáforo é que impede que ele se multiplique.
 */
const LIMITE_DO_DOCUMENTO = 30 * 1024 * 1024

importRouter.post('/document', vagaDeCorpoGrande(), async (req, res) => {
  const cab = parseOr400(uploadHeadersSchema, req.headers, res)
  if (!cab) return
  const declarado = tamanhoDeclarado(req)
  const grandeDemais = () => {
    descartarRestoDoCorpo(req)
    res.status(413).json(envelopeDeErro('o documento passa do limite de 30 MB', 'corpo_grande_demais'))
  }
  if (declarado !== null && declarado > LIMITE_DO_DOCUMENTO) return grandeDemais()
  try {
    let buf: Buffer
    try {
      buf = await lerCorpoViaArquivo(req, LIMITE_DO_DOCUMENTO)
    } catch (err) {
      if (err instanceof CorpoGrandeDemais) return grandeDemais()
      if (err instanceof CorpoInterrompido) return
      throw err
    }
    if (!buf.length) {
      res.status(400).json({ error: 'Arquivo vazio.' })
      return
    }
    const filename = nomeDoCabecalho(cab['x-filename'], 'documento')
    const mime = cab['content-type'] || ''
    res.json(await extractDocument(buf, filename, mime))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'import_route_error' }) })
  }
})
