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
import { Router, raw, type ErrorRequestHandler } from 'express'
import path from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { AUDIO_DIR, armazenamentoDeMidia } from './sessions'
import { sessionsRepo } from '../db/repositories/sessions'
import { hasEntitlement } from '../lib/entitlements'
import { hasYtDlp, resolveYouTube, fetchCaptions, downloadAudio } from '../import/youtube'
import { extractArticle } from '../import/web'
import { extractDocument } from '../import/document'
import { lerApkg, lerTextoAnki } from '../import/anki'
// F11-04: schemas de corpo e de cabeçalho das rotas de importação.
import { parseOr400, ankiExportSchema, importUrlSchema, uploadHeadersSchema } from '../validation'
import { montarApkg } from '../import/ankiExport'
import { erroDeRota } from '../lib/erroDeRota'
import { ankiRepo } from '../db/repositories/anki'
import { avaliarCartao } from '../../src/core/learning/quality'
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
 * A rota GRAVA o acervo (motor-anki-acervo, §5.1): `criarOuAcharDeck` → `criarImport` →
 * `gravarNotas` → `marcarAusentes` → `atualizarImport(concluido)`. Isso substitui o caminho antigo
 * (só ler e o cliente chamar `/api/vocab/bulk-add`) porque o acervo precisa existir como registro
 * PRÓPRIO — rastreável, arquivável, reimportável sem duplicar — antes de qualquer nota virar
 * cartão jogável. A régua de qualidade (`avaliarCartao`, perfil `'curado'`) roda aqui por nota; o
 * que não serve fica no acervo com `motivoDescarte` gravado, não é descartado do banco.
 */
/**
 * `NotaAnki` (o parser, que não é meu para editar) não carrega `guid` — esse campo só existe no
 * SQLite interno do Anki e o parser hoje não o expõe. Sem ele não há como `gravarNotas` reconhecer
 * "já vi esta nota" num reimport. A saída é sintetizar um guid ESTÁVEL a partir do conteúdo
 * (notetype + frente + verso): mesmo conteúdo → mesmo guid → mesmo reimport não duplica; conteúdo
 * mudou → guid muda → a rota trata como nota "nova" (efeito colateral aceitável documentado no
 * relato: o acervo ganha uma linha extra em vez de atualizar a antiga quando o AUTOR do baralho
 * edita um campo, porque não temos o id estável real do Anki para amarrar as duas).
 */
function guidSintetico(n: { notetype?: string | null; frente: string; verso: string }): string {
  return createHash('sha256')
    .update(`${n.notetype ?? ''}\x1f${n.frente}\x1f${n.verso}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}
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

/**
 * O ESTOURO DE TAMANHO PRECISA DIZER O QUE HOUVE.
 *
 * `raw({ limit })` rejeita ANTES do handler, então o `try/catch` de lá nunca vê o erro: ele caía
 * no tratador global e virava um 500 "erro interno". Medido subindo um `.apkg` de 214 MB: meio
 * segundo, 500, e nenhuma pista — nem o tamanho, nem o limite, nem o que fazer.
 *
 * O cliente agora manda só a coleção (ver `soAColecao` em `BaralhoAnki`), então este caminho é
 * rede de segurança: vale para quem chama a rota direto e para um `.apkg` que não abra no
 * navegador. Mas rede de segurança que mente não segura ninguém.
 */
const erroDeTamanho: ErrorRequestHandler = (err, _req, res, next) => {
  const e = err as { type?: string; status?: number; length?: number; limit?: number }
  if (e?.type !== 'entity.too.large') return next(err)
  const mb = (n?: number) => (n ? `${(n / 1_048_576).toFixed(0)} MB` : '?')
  res.status(413).json({
    error: `este arquivo tem ${mb(e.length)} e o limite é ${mb(e.limit)}. `
      + 'Num .apkg quase todo o tamanho é áudio e imagem, que não são importados: '
      + 'exporte o baralho no Anki SEM mídia, ou tente pelo navegador (ele já manda só a lista de palavras).',
  })
}

importRouter.post('/anki', raw({ type: () => true, limit: '200mb' }), erroDeTamanho, async (req, res) => {
  const cab = parseOr400(uploadHeadersSchema, req.headers, res)
  if (!cab) return
  const buf = req.body as Buffer
  if (!buf?.length) { res.status(400).json({ error: 'arquivo vazio' }); return }
  const nome = decodeURIComponent(cab['x-filename'] || 'baralho')

  // Leitura: se o ARQUIVO não abre (zip corrompido, formato desconhecido), nada foi criado ainda
  // no acervo — é só um 400, igual ao comportamento antigo.
  let r: Awaited<ReturnType<typeof lerApkg>>
  try {
    const ehTexto = /\.(txt|csv|tsv)$/i.test(nome)
    r = ehTexto ? lerTextoAnki(buf.toString('utf8')) : await lerApkg(buf)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'import_route_error' }) })
    return
  }

  // Nome do baralho: o primeiro baralho visto no arquivo, ou o nome do arquivo sem extensão.
  const nomeDoDeck = r.baralhos?.[0] || nome.replace(/\.[^.]+$/, '') || 'baralho'
  let importId: string | undefined
  try {
    const deck = await ankiRepo.criarOuAcharDeck(req.userId, {
      nome: nomeDoDeck,
      nomeNoArquivo: r.baralhos?.[0] ?? null,
      arquivoOrigem: nome,
    })
    const imp = await ankiRepo.criarImport(req.userId, { deckId: deck.id, arquivo: nome, bytes: buf.length })
    importId = imp.id
    await ankiRepo.atualizarImport(imp.id, { estado: 'gravando' })

    // Qualidade por nota (Decisão 6 do design: perfil 'curado', não 'captura') — a nota que não
    // serve continua no acervo com o motivo anotado; quem filtra depois é a ativação.
    const porMotivo: Record<string, number> = {}
    const notasParaGravar = r.notas.map((n) => {
      const veredito = avaliarCartao(
        { word: n.frente, translation: n.verso, sentence: n.exemplo ?? '', srcLang: undefined } as never,
        { origem: 'curado' },
      )
      const motivoDescarte = veredito.serve ? null : (veredito.motivo ?? 'descartada')
      if (motivoDescarte) porMotivo[motivoDescarte] = (porMotivo[motivoDescarte] ?? 0) + 1
      return {
        guid: guidSintetico(n),
        notetype: n.notetype ?? null,
        estruturaHash: n.estruturaHash ?? null,
        camposBrutos: n.midia || n.lacunas ? JSON.stringify({ midia: n.midia, lacunas: n.lacunas }) : null,
        frente: n.frente,
        verso: n.verso,
        exemplo: n.exemplo ?? null,
        tags: n.tags?.length ? n.tags.join(' ') : null,
        motivoDescarte,
      }
    })

    const resultado = await ankiRepo.gravarNotas(req.userId, deck.id, imp.id, notasParaGravar)
    await ankiRepo.marcarAusentes(req.userId, deck.id, notasParaGravar.map((n) => n.guid))

    const notasDescartadas = Object.values(porMotivo).reduce((a, b) => a + b, 0)
    await ankiRepo.atualizarImport(imp.id, {
      estado: 'concluido',
      notasLidas: r.notas.length,
      notasNovas: resultado.novas,
      notasAtualizadas: resultado.atualizadas,
      notasDescartadas,
      porMotivo,
    })

    const trunc = (s: string | null | undefined) => (s ?? '').slice(0, 80)
    const amostra = r.notas.slice(0, 4).map((n) => ({
      frente: trunc(n.frente), verso: trunc(n.verso), exemplo: trunc(n.exemplo),
    }))

    res.json({
      importId: imp.id,
      deckId: deck.id,
      resumo: {
        notas: r.notas.length,
        novas: resultado.novas,
        atualizadas: resultado.atualizadas,
        iguais: resultado.iguais,
        descartadas: notasDescartadas,
        porMotivo,
      },
      campos: r.campos,
      notetype: r.notas[0]?.notetype ?? null,
      estruturaHash: r.notas[0]?.estruturaHash ?? null,
      baralhos: r.baralhos,
      formato: r.formato,
      truncado: r.truncado,
      totalNoArquivo: r.totalNoArquivo,
      amostra,
    })
  } catch (err) {
    // O que já entrou no acervo PERMANECE — só o ledger registra que esta fatia falhou.
    const msg = erroDeRota(err, { event: 'import_route_error' })
    if (importId) await ankiRepo.atualizarImport(importId, { estado: 'falhou', erro: msg }).catch(() => {})
    res.status(400).json({ error: msg })
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

  /**
   * O GATE QUE SÓ EXISTIA NO CLIENTE (auditoria de 01/09).
   *
   * `Library.tsx:621` desenhava o selo "Pro" e recusava o clique — e esta rota não checava
   * entitlement nenhum. Quem chamasse direto importava do YouTube no plano Grátis, e o download
   * roda no NOSSO servidor (yt-dlp): é custo real, não cosmético. `managedCloudStt` e
   * `managedCloudLlm` já eram conferidos aqui do lado; este ficou de fora.
   *
   * FAIL-CLOSED como os irmãos: erro ao checar o plano vira 502, nunca "passa direto".
   */
  try {
    if (!(await hasEntitlement(req.userId, 'youtubeImport'))) {
      res.status(402).json({ error: 'importar do YouTube requer plano Pro', entitlement: 'youtubeImport' })
      return
    }
  } catch (err) {
    res.status(502).json({ error: erroDeRota(err, { event: 'import_entitlement_error', route: req.path, requestId: req.requestId }) })
    return
  }

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
