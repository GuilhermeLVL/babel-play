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
import { lerApkg, lerTextoAnki, escritaDominante, contagemDeEscritas, type EscritaDominante } from '../import/anki'
// F11-04: schemas de corpo e de cabeçalho das rotas de importação.
import { parseOr400, ankiExportSchema, importUrlSchema, uploadHeadersSchema } from '../validation'
import { montarApkg } from '../import/ankiExport'
import { erroDeRota } from '../lib/erroDeRota'
import { ankiRepo } from '../db/repositories/anki'
import { avaliarCartao } from '../../src/core/learning/quality'
import { vocabRepo } from '../db/repositories/vocab'
import { vazaResposta } from '../../src/core/learning/pistaDeJogo'
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
 * A IDENTIDADE DA NOTA — de onde vem, e por que a diferença importa.
 *
 * O `.apkg` traz `notes.guid`, o id estável do Anki: o mesmo entre exportações e entre máquinas. É
 * ele que faz um reimport ATUALIZAR a nota em vez de criar outra, inclusive quando o autor do
 * baralho corrigiu uma tradução. Esse é o caso que importa, e é justamente onde uma chave derivada
 * do conteúdo falha: o conteúdo mudou, a chave mudou, e a nota corrigida entraria como uma segunda
 * nota, ao lado da antiga.
 *
 * Arquivo de TEXTO (`.txt/.csv/.tsv`) não tem identidade nenhuma — quem o gerou não guardou id. Aí
 * sim resta derivar do conteúdo, e a limitação é real e declarada: editar a linha cria uma nota
 * nova. Preferimos isso a inventar um id que fingiria uma estabilidade que o formato não tem.
 */
function guidDaNota(n: { guid?: string; notetype?: string | null; frente: string; verso: string }): string {
  if (n.guid) return n.guid
  return guidDerivadoDoConteudo(n)
}

function guidDerivadoDoConteudo(n: { notetype?: string | null; frente: string; verso: string }): string {
  return createHash('sha256')
    .update(`${n.notetype ?? ''}\x1f${n.frente}\x1f${n.verso}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/**
 * CÓDIGOS DE IDIOMA DE ESCRITA LATINA reconhecidos no `X-Src-Lang` — a lista dos que a tela do
 * lobby oferece hoje e cuja escrita nativa É o alfabeto latino. Não precisa ser exaustiva: o pior
 * caso de faltar um código aqui é o mesmo de hoje (carimba sem checar), não um dado novo.
 */
const LANGS_ESCRITA_LATINA = new Set([
  'en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'sv', 'no', 'nb', 'nn', 'da', 'fi', 'pl', 'cs', 'sk',
  'hu', 'ro', 'hr', 'tr', 'id', 'vi', 'af', 'ca', 'et', 'lv', 'lt', 'sl', 'is',
])

/** ESCRITAS que o `escritaDominante` pode devolver e que NÃO são latinas. */
const ESCRITAS_NAO_LATINAS = new Set<EscritaDominante>([
  'cjk', 'kana', 'hangul', 'cirilico', 'arabe', 'hebraico', 'grego', 'devanagari', 'thai',
])

/**
 * DECIDE se carimba `idiomaOrigem` do cabeçalho — ou recusa, honestamente, quando o cabeçalho e a
 * escrita real do baralho se contradizem (ver S11 no comentário de topo da rota `/anki`).
 *
 * SEM CONFLITO (a maioria dos casos: baralho de inglês com lobby em inglês) → o cabeçalho vale,
 * exatamente como antes.
 *
 * COM CONFLITO, só DUAS escritas dão um idioma INEQUÍVOCO para carimbar no lugar do cabeçalho:
 * kana → 'ja' e hangul → 'ko' (nenhuma outra língua viva usa essas escritas como principal).
 * `cjk` puro (sem kana — pode ser chinês) e `cirilico`/`arabe`/`hebraico`/`grego` (cada um serve
 * VÁRIAS línguas — cirílico é ru/uk/bg/sr/…, por exemplo) são ambíguos: carimbar um palpite seria
 * trocar "errado por carimbo alheio" por "errado por palpite nosso", igualmente ruim. A resposta
 * honesta ali é `null` — o cartão cai em 'idioma-incerto' na triagem, o que é dito na tela via
 * `avisoIdioma`, em vez de mentir silenciosamente como o comportamento antigo.
 */
function versoEhDefinicao(notas: Array<{ frente: string; verso?: string | null }>): boolean {
  const comVerso = notas.filter((n) => (n.verso ?? '').trim())
  if (comVerso.length < 5) return false
  const repetem = comVerso.filter((n) => vazaResposta(n.verso ?? '', n.frente)).length
  return repetem / comVerso.length >= 0.7
}

function decidirIdiomaOrigem(
  cabecalho: string | null,
  frentes: string[],
): { idiomaOrigem: string | null; avisoIdioma?: string } {
  if (!cabecalho) return { idiomaOrigem: null }

  const escrita = escritaDominante(frentes)
  if (escrita === 'desconhecido') return { idiomaOrigem: cabecalho } // amostra sem letra: nada para contradizer

  const codigoBase = cabecalho.split('-')[0].toLowerCase()
  const headerEhLatino = LANGS_ESCRITA_LATINA.has(codigoBase)
  const conteudoEhLatino = escrita === 'latino'
  const conteudoEhNaoLatino = ESCRITAS_NAO_LATINAS.has(escrita)

  const conflito = (headerEhLatino && conteudoEhNaoLatino) || (!headerEhLatino && conteudoEhLatino)
  if (!conflito) return { idiomaOrigem: cabecalho }

  /* A DOMINÂNCIA é o critério errado para o japonês, e é justamente o caso-bandeira do defeito:
     um baralho de vocabulário japonês típico (Core 2k, Kaishi) é majoritariamente KANJI, com kana
     minoritário — pela dominância cairia em `cjk` ambíguo e o baralho inteiro ficaria sem idioma.
     Mas kana é assinatura EXCLUSIVA do japonês: chinês nunca o mistura. Então a PRESENÇA de kana
     (com um piso mínimo contra ruído — uma citação solta num deck chinês) decide 'ja' mesmo com
     Han dominante; o mesmo vale para hangul → 'ko' (coreano mistura Han, chinês não mistura
     hangul). Só o que sobra sem nenhuma dessas assinaturas fica ambíguo de verdade. */
  const { contagem, totalDeLetras } = contagemDeEscritas(frentes)
  /* O piso tem duas pernas com papéis diferentes: o RELATIVO (2%) protege amostras grandes — uma
     citação japonesa solta num deck chinês de 200 frentes fica em ~0,4% e não dispara — e o
     ABSOLUTO (2) protege amostras pequenas, onde 2% de 14 letras arredondaria para zero e qualquer
     ruído de um caractere decidiria o idioma do baralho. */
  const presenca = (e: string) => (contagem[e] ?? 0) >= Math.max(2, totalDeLetras * 0.02)
  if (escrita === 'kana' || (escrita === 'cjk' && presenca('kana'))) {
    return {
      idiomaOrigem: 'ja',
      avisoIdioma: `o cabeçalho dizia "${cabecalho}", mas o baralho é escrito em japonês (kanji + kana) — idioma corrigido para "ja".`,
    }
  }
  if (escrita === 'hangul' || (escrita === 'cjk' && presenca('hangul'))) {
    return {
      idiomaOrigem: 'ko',
      avisoIdioma: `o cabeçalho dizia "${cabecalho}", mas o baralho é escrito em coreano — idioma corrigido para "ko".`,
    }
  }

  return {
    idiomaOrigem: null,
    avisoIdioma: `o cabeçalho dizia "${cabecalho}", mas o conteúdo do baralho é predominantemente ${escrita} — `
      + 'como esse script serve mais de um idioma, o idioma do baralho ficou em branco em vez de arriscar um palpite errado.',
  }
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
    /**
     * O IDIOMA DO BARALHO VEM DO CLIENTE, e sem ele o baralho entra e não chega a jogo nenhum.
     *
     * Medido importando 3.600 notas reais: todos os cartões projetados nasciam com `src_lang` NULL,
     * porque o baralho não guardava idioma e `ativarLote` só repassa o que o baralho tem. Cartão
     * sem idioma é `idioma-incerto` na triagem e vai para a pilha `fora` assim que existe um idioma
     * selecionado no lobby — ou seja, o acervo enchia e a tela continuava dizendo "3 palavras".
     *
     * O `.apkg` não declara idioma de forma confiável (o campo é livre e quase ninguém preenche),
     * então quem sabe é a tela: ela já tem o idioma que a pessoa está praticando e o nativo dela.
     * Ausente, fica NULL — e aí o cartão vale para "sem filtro", que é o comportamento antigo.
     *
     * S11 (auditoria) — MAS o cabeçalho `X-Src-Lang` vem do LOBBY, não do baralho: é o idioma que a
     * PESSOA está praticando na tela, preenchido pelo cliente sem nunca olhar o conteúdo do
     * arquivo. Importar um deck JAPONÊS com o lobby aberto em inglês carimbava `srcLang='en'` em
     * milhares de cartões, silenciosamente — envenenando o filtro de idioma para sempre (um
     * cartão japonês rotulado 'en' nunca mais aparece corretamente etiquetado). A checagem abaixo
     * confere o cabeçalho contra a ESCRITA de verdade das frentes antes de carimbar.
     */
    const idioma = decidirIdiomaOrigem(cab['x-src-lang'] ?? null, r.notas.slice(0, 200).map((n) => n.frente))

    /* Verso que repete a frente é definição monolíngue, não tradução — carimbar um idioma-alvo
       ali seria mentir sobre o conteúdo. Medido: 100% num baralho de dicionário de aprendiz. */
    const monolingue = versoEhDefinicao(r.notas.slice(0, 200))
    const deck = await ankiRepo.criarOuAcharDeck(req.userId, {
      nome: nomeDoDeck,
      nomeNoArquivo: r.baralhos?.[0] ?? null,
      arquivoOrigem: nome,
      idiomaOrigem: idioma.idiomaOrigem,
      idiomaAlvo: monolingue ? idioma.idiomaOrigem : (cab['x-tgt-lang'] ?? null),
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
        guid: guidDaNota(n),
        notetype: n.notetype ?? null,
        estruturaHash: n.estruturaHash ?? null,
        /* OS CAMPOS ORIGINAIS, por nome — é o que sustenta "trocar o mapeamento sem reimportar".
           Guardar aqui só mídia e lacunas, como esta linha fazia, jogava fora exatamente o que a
           reclassificação precisa ler: o valor bruto de cada campo do baralho. Sem eles, corrigir
           um campo mal mapeado exigiria o arquivo de novo — 214 MB, no baralho que medimos. */
        camposBrutos: JSON.stringify({ campos: n.camposBrutos ?? {}, midia: n.midia, lacunas: n.lacunas }),
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

    /* Importar tem de ENTREGAR algo jogável. Antes toda nota nascia arquivada e a tela de jogar
       continuava igual: quem importou concluía que o app não fez nada (G0, defeito 2). Um lote
       entra na hora; o resto continua atrás de "Ativar mais", que é o controle de volume. */
    const ativadasNoImport = await vocabRepo.ativarLote(req.userId, deck.id).catch(() => ({ ativadas: 0 }))

    const trunc = (s: string | null | undefined) => (s ?? '').slice(0, 80)
    const amostra = r.notas.slice(0, 4).map((n) => ({
      frente: trunc(n.frente), verso: trunc(n.verso), exemplo: trunc(n.exemplo),
    }))

    res.json({
      importId: imp.id,
      deckId: deck.id,
      resumo: {
        ativadas: ativadasNoImport.ativadas ?? 0,
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
      // S11: presente só quando o cabeçalho e a escrita real do baralho se contradisseram — a
      // tela mostra, e o cartão sem idioma cai em 'idioma-incerto' na triagem (honesto).
      avisoIdioma: idioma.avisoIdioma,
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
