import { createHash } from 'node:crypto'
import { mkdtemp, rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import { createClient } from '@libsql/client'
import JSZip from 'jszip'

/**
 * LER UM BARALHO DO ANKI.
 *
 * POR QUE ISTO É MAIS ENVOLVIDO DO QUE PARECE. Um `.apkg` é um ZIP, e dentro dele mora um banco
 * SQLite — mas em três formatos diferentes, dependendo da versão do Anki que exportou:
 *
 *   · `collection.anki2`   — antigo, SQLite cru;
 *   · `collection.anki21`  — idem, esquema mais novo;
 *   · `collection.anki21b` — Anki ≥ 2.1.50 (abril/2022), SQLite comprimido com **Zstandard**.
 *
 * O terceiro é o formato dos baralhos que se baixa do AnkiWeb hoje, ou seja, o caso principal. E
 * ele é justamente o que a maioria das bibliotecas de terceiros não lê. Aqui sai de graça: o
 * Node 24 deste projeto descomprime zstd nativamente (`zlib.zstdDecompressSync`).
 *
 * OS NOMES DOS CAMPOS também mudaram de lugar entre as versões: antes ficavam num JSON na coluna
 * `col.models`; agora, nas tabelas `notetypes`/`fields`. Tentamos as duas, e se nenhuma
 * responder caímos na ordem posicional — que é o padrão de fato de todo baralho de idioma
 * (campo 0 = frente, campo 1 = verso).
 *
 * O QUE NÃO IMPORTAMOS, e é dito na tela: mídia (áudio e imagem) e o histórico de revisão. O
 * agendamento aqui é FSRS-5 próprio; misturar com o estado de outro agendador produziria datas
 * de revisão erradas, o que é pior que começar do zero.
 */

/** Separador de campos de uma nota do Anki. */
const SEP = '\x1f'

/** Referências de mídia que um campo cita — o ARQUIVO não é importado, só o nome sobrevive. */
export interface RefsDeMidia {
  sons: string[]
  imagens: string[]
}

/** Uma lacuna de cloze (`{{c1::resposta::dica}}`) — um ordinal vira um cartão no Anki. */
export interface Lacuna {
  ordinal: number
  resposta: string
  dica?: string
}

export interface NotaAnki {
  /** Id ESTÁVEL da nota no Anki (`notes.guid`) — é o que faz reimportar atualizar em vez de
   *  duplicar. Vazio nas leituras de texto (`.txt/.csv/.tsv`), que não têm identidade própria. */
  guid: string
  /** Todos os campos da nota, por NOME e ainda BRUTOS (com HTML). É o que permite refazer o
   *  mapeamento depois sem pedir o arquivo de novo. */
  camposBrutos?: Record<string, string>
  frente: string
  verso: string
  /** Frase de exemplo, quando o baralho tiver um campo com essa cara. */
  exemplo?: string
  tags: string[]
  /** Refs de mídia agregadas de TODOS os campos da nota, sem duplicatas, na ordem de aparição. */
  midia?: RefsDeMidia
  /** Lacunas de cloze agregadas de todos os campos, ordenadas por ordinal. */
  lacunas?: Lacuna[]
  /** Nome do baralho de origem (primeiro cartão da nota), hierarquia com `::`. */
  baralho?: string
  /** Nome do note type (modelo) da nota. */
  notetype?: string
  /** sha256[:16] dos nomes de campo normalizados, na ordem — reconhece "já vi este tipo". */
  estruturaHash?: string
}

export interface LeituraAnki {
  notas: NotaAnki[]
  /** Nome do arquivo interno que foi lido — a tela mostra, é a procedência. */
  formato: string
  /** Nomes dos campos como estavam no baralho, para a tela poder dizer o que virou o quê. */
  campos: string[]
  /** Notas descartadas na leitura (frente vazia, sem verso). */
  descartadas: number
  /** O baralho tinha mídia? Não importamos, e é preciso dizer. */
  temMidia: boolean
  /** Nomes de baralho distintos encontrados, ordenados. */
  baralhos?: string[]
  /** true quando o arquivo tem mais notas que `TETO_DE_NOTAS` — a leitura foi cortada. */
  truncado?: boolean
  /** `SELECT count(*)` real de `notes`, mesmo quando a leitura foi cortada. */
  totalNoArquivo?: number
  /**
   * Mapa numérico-no-zip → entrada de mídia, quando o `.apkg` tem mídia (`temMidia`). Quem
   * precisa resolver a referência de UMA nota (nome real, de `NotaAnki.midia`) usa
   * `indiceInversoDeMidia` sobre este mapa. `undefined` quando não há arquivo `media` no zip.
   */
  mapaDeMidia?: Map<string, EntradaDeMidia>
}

/**
 * ENTIDADES NOMEADAS COMUNS DE DECK (S10) — tabela PEQUENA e deliberada, não uma lib inteira.
 *
 * `limparCampo` só desfazia `&nbsp; &amp; &lt; &gt; &quot; &#39;` — as seis que apareciam nos
 * decks de teste. Qualquer baralho exportado de uma ferramenta que escapa acento (comum em CSV/
 * Anki-desktop antigo em certas locales) sobrevivia com `&eacute;`, `&rsquo;` etc. no meio da
 * palavra, e a régua de qualidade reprovava por ruído — de novo, culpando o dado pelo nosso
 * descuido. A lista é a de entidades NOMEADAS que decks de idioma realmente usam; o resto (a
 * imensa maioria dos acentos) já cai na decodificação NUMÉRICA genérica abaixo.
 */
const ENTIDADES_NOMEADAS: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…',
  eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç',
  ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ntilde: 'ñ',
  aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú',
}

/**
 * Decodifica entidades HTML de um campo: NUMÉRICAS (`&#39;`, `&#x27;`) de forma genérica, mais a
 * tabela pequena de NOMEADAS acima — inclusive as seis que `limparCampo` tratava uma a uma antes
 * (`nbsp amp lt gt quot #39`), agora cobertas por esta função só.
 */
function decodificarEntidadesDoCampo(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (all, nome: string) => ENTIDADES_NOMEADAS[nome.toLowerCase()] ?? all)
}

/**
 * Limpa o HTML que o Anki guarda no campo.
 *
 * Os campos vêm com marcação de verdade (`<b>`, `<br>`, `<div>`, `[sound:...]`, `<img>`). Jogar
 * isso num cartão de vocabulário produziria uma "palavra" com tags no meio — e a régua de
 * qualidade depois a reprovaria por ruído, o que seria culpar o dado pelo nosso descuido.
 */
export function limparCampo(bruto: string): string {
  const semTagsNemLacunas = (bruto ?? '')
    // Referências de mídia viram nada: não importamos os arquivos, então o marcador só atrapalha.
    .replace(/\[sound:[^\]]*\]/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    // Quebras viram espaço ANTES de as tags sumirem, senão "luz<br>claridade" vira "luzclaridade".
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    /*
     * FURIGANA (S10): `漢字[かんじ]` é a notação padrão de decks de japonês — o Anki a exibe com
     * ruby text, mas em texto puro os colchetes sobram. `漢字[かんじ]` precisa virar `漢字`.
     *
     * A REGRA PRECISA DE ESCOPO: um colchete comum, tipo definição informal `"[informal]"` ou
     * gramática `"to run [away]"`, NÃO é furigana e não pode ser comido — cortaria conteúdo
     * legítimo do baralho. O que distingue os dois casos é o caractere IMEDIATAMENTE ANTES do `[`:
     * furigana sempre segue um caractere Han/Hiragana/Katakana (a "palavra base" que a leitura
     * anota); colchete de definição segue espaço, letra latina ou pontuação. Por isso o `$1` no
     * replace: o caractere-gatilho é capturado e devolvido, só o `[...]` some.
     *
     * Roda DEPOIS de `[sound:...]` já ter sido tratado acima — senão um som citado logo após um
     * caractere CJK (`猫[sound:cat.mp3]`) seria mordido por este regex também.
     */
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\[[^\]]*\]/gu, '$1')

  /*
   * ENTIDADES POR ÚLTIMO, depois das tags terem sumido — não antes. Se `&lt;div&gt;` (HTML
   * ESCAPADO, texto literal que a nota queria mostrar) fosse decodificado ANTES da remoção de
   * tags, o `<div>` resultante seria confundido com uma tag de verdade e apagado pelo
   * `.replace(/<[^>]+>/g, '')` acima — corrompendo conteúdo que o próprio Anki preservava como
   * texto. `decodificarEntidadesDoCampo` cobre as numéricas (`&#39;`, `&#x27;`) e a tabela pequena
   * de nomeadas (ver `ENTIDADES_NOMEADAS`); ela sozinha já cobre as seis entidades que o código
   * tratava antes uma a uma.
   */
  return decodificarEntidadesDoCampo(semTagsNemLacunas)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Desfaz as entidades HTML mais comuns num nome de arquivo de mídia. */
function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

/**
 * EXTRAI as referências de mídia ANTES de `limparCampo` apagar o marcador.
 *
 * O DEFEITO QUE ISTO CONSERTA: `limparCampo` some com `[sound:x.mp3]` e `<img src=...>` porque o
 * ARQUIVO não é importado — mas o NOME sobrevivia em lugar nenhum. Um baralho de pronúncia que só
 * tem áudio nos campos (frente = palavra, verso = tradução, som só no campo `Audio`) perdia essa
 * referência silenciosamente: a nota virava texto puro sem ninguém saber que existia um arquivo.
 *
 * `<img>` aceita aspas simples, duplas e sem aspas — os três são HTML válido, e o Anki gera os
 * três dependendo da versão/plugin que escreveu o campo.
 */
export function extrairMidia(bruto: string): RefsDeMidia {
  const texto = bruto ?? ''
  const sons: string[] = []
  const imagens: string[] = []

  const reSom = /\[sound:([^\]]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = reSom.exec(texto))) {
    const nome = decodificarEntidades(m[1].trim())
    if (nome && !sons.includes(nome)) sons.push(nome)
  }

  const reImg = /<img[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi
  while ((m = reImg.exec(texto))) {
    const nome = decodificarEntidades((m[1] ?? m[2] ?? m[3] ?? '').trim())
    if (nome && !imagens.includes(nome)) imagens.push(nome)
  }

  return { sons, imagens }
}

/**
 * EXTRAI as lacunas de cloze e devolve o texto com elas substituídas pela resposta.
 *
 * `{{c1::resposta}}` ou `{{c1::resposta::dica}}` — a dica é o SEGUNDO `::`, não qualquer `::` no
 * meio da resposta, daí procurar só o primeiro `indexOf('::')` dentro do conteúdo já isolado por
 * `}}`, em vez de um regex com dois grupos opcionais (que teria uma ambiguidade de mínimo/máximo
 * bem mais fácil de acertar errado do que este split direto).
 *
 * SE ISTO NÃO RODASSE antes de `limparCampo`, `{{c1::...}}` cru vazaria para a tela: o campo
 * limpo hoje só tira HTML e `[sound:]`/`<img>`, não marcação de cloze.
 */
export function extrairCloze(bruto: string): { texto: string; lacunas: Lacuna[] } {
  const lacunas: Lacuna[] = []
  const re = /\{\{c(\d+)::([\s\S]*?)\}\}/g
  const texto = (bruto ?? '').replace(re, (_all, ord: string, conteudo: string) => {
    const i = conteudo.indexOf('::')
    const resposta = i >= 0 ? conteudo.slice(0, i) : conteudo
    const dica = i >= 0 ? conteudo.slice(i + 2) : undefined
    lacunas.push({ ordinal: Number(ord), resposta, dica })
    return resposta
  })
  lacunas.sort((a, b) => a.ordinal - b.ordinal)
  return { texto, lacunas }
}

/** Limpa o campo já COM as lacunas de cloze resolvidas — a ordem importa (ver `extrairCloze`). */
function limparELacunas(bruto: string): { texto: string; lacunas: Lacuna[] } {
  const { texto, lacunas } = extrairCloze(bruto ?? '')
  return { texto: limparCampo(texto), lacunas }
}

/**
 * HASH DA ESTRUTURA do note type — reconhece "já vi este tipo de nota antes" para reaplicar um
 * mapeamento de campos salvo, sem depender do NOME do modelo (que a pessoa pode ter renomeado).
 *
 * Normaliza antes de gerar o hash: minúsculas, sem acento, espaços/hífen/underscore colapsados —
 * senão `Front-Text` e `front_text` (mesmo campo, grafias diferentes) virariam tipos "novos" a
 * cada exportação. A ORDEM entra no hash de propósito: campos iguais em ordem diferente mapeiam
 * para frente/verso diferentes, então são estruturas distintas de verdade.
 */
export function hashDaEstrutura(campos: string[]): string {
  const normalizados = (campos ?? []).map(c =>
    (c ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[\s_-]+/g, ' ')
  )
  return createHash('sha256').update(normalizados.join('|'), 'utf8').digest('hex').slice(0, 16)
}

/**
 * TETO DE NOTAS lidas de um único `.apkg` — o conserto para o baralho de 300k notas que hoje
 * carrega tudo em memória de uma vez porque `SELECT ... FROM notes` não tem LIMIT.
 *
 * 50 mil é folgado para todo baralho de idioma real (o maior do AnkiWeb fica na casa dos
 * milhares) e ainda cabe num array em memória sem risco de repetir o F4-01 por outra porta.
 */
export const TETO_DE_NOTAS = 50_000

/** Qual campo é a frase de exemplo? Pelo NOME, quando o baralho nomeia os campos. */
function indiceDoExemplo(campos: string[]): number {
  const alvo = /(example|exemplo|sentence|frase|context|contexto|usage)/i
  return campos.findIndex(c => alvo.test(c))
}

/**
 * QUAL CAMPO É A PALAVRA E QUAL É O SENTIDO — pelo NOME, e não pela posição.
 *
 * O DEFEITO QUE ISTO CONSERTA, medido com o baralho "4000 Essential English Words" do AnkiWeb
 * (3.871 notas): a frente vinha de `flds[0]` e o verso de `flds[1]`, fixos. Naquele baralho os
 * dois primeiros campos do tipo de nota principal são `№` e `IMG` — um número de ordem e uma tag
 * `<img>`. Depois de `limparCampo` a imagem vira string vazia, o par nasce sem verso, e as 3.871
 * notas caíam todas no `descartadas++`: o importador dizia "0 notas lidas" sobre um baralho
 * perfeitamente válido, e não havia como a pessoa descobrir por quê.
 *
 * O parser JÁ LIA os nomes dos campos (`camposPorModelo`) e já os usava para achar o exemplo —
 * só nunca os usou para os dois campos que decidem se a nota existe. Era a peça que estava na
 * mesa e não tinha sido ligada.
 *
 * A PRIORIDADE É POR PADRÃO, não por posição no baralho: `Word` vence `Front` quando o baralho
 * tem os dois, porque `Word` é o conteúdo e `Front` costuma ser o template do cartão. Isso exige
 * varrer os padrões em ordem — um `findIndex` sozinho varreria o ARRAY e devolveria o que viesse
 * primeiro nele, que é o contrário do pretendido (foi o que um teste pegou).
 *
 * Sem nomes reconhecíveis, volta ao posicional — que é o certo para o baralho de dois campos sem
 * nome, ainda o caso mais comum.
 */
export const PADRAO_FRENTE: RegExp[] = [
  /^(word|palavra|term|termo|expression|expressão|vocab\w*|english|inglês)$/i,
  /^(front|frente|question|pergunta)$/i,
]
export const PADRAO_VERSO: RegExp[] = [
  /^(meaning|significado|sentido|definition|definição|translation|tradução|portuguese|português)$/i,
  /^(back|verso|answer|resposta)$/i,
]

/**
 * Acha o campo pelo nome: TODOS os padrões por igualdade primeiro, e só então por conter.
 *
 * A igualdade vem antes porque `Sound_Meaning` CONTÉM "meaning" e é um ÁUDIO: num baralho com
 * `Meaning` e `Sound_Meaning`, casar por conteúdo primeiro poria um marcador de som no verso.
 */
export function indicePorNome(campos: string[], padroes: RegExp[]): number {
  const limpos = campos.map(c => (c ?? '').trim())
  for (const padrao of padroes) {
    const exato = limpos.findIndex(c => padrao.test(c))
    if (exato >= 0) return exato
  }
  for (const padrao of padroes) {
    const solto = new RegExp(padrao.source.replace(/^\^|\$$/g, ''), 'i')
    const i = limpos.findIndex(c => solto.test(c))
    if (i >= 0) return i
  }
  return -1
}

/**
 * TETO DE EXPANSÃO — o conserto do achado F4-01 da auditoria (P0).
 *
 * O que havia antes: `arquivo.async('uint8array')` descompactava a entrada INTEIRA em memória,
 * sem teto. Medido em `audit/scripts/midia.mjs`: 203.972 bytes de zip viraram 209.715.200 em
 * 587 ms — razão **1028:1** — e o RSS do processo foi de 47 MB para 663 MB. A rota aceita 200 MB
 * de corpo e `docker-compose.yml` limita o container a 1 GB. Uma requisição de um usuário
 * autenticado derrubava o serviço para todos.
 *
 * 300 MB é folgado para um baralho real (o maior do AnkiWeb não chega perto) e cabe no container
 * mesmo com outra requisição em voo.
 */
const TETO_DE_EXPANSAO = 300 * 1024 * 1024

/** O fluxo de leitura por pedaços do JSZip, na forma mínima que usamos. */
interface FluxoDaEntrada {
  on(evento: 'data', fn: (pedaco: Uint8Array) => void): FluxoDaEntrada
  on(evento: 'error', fn: (erro: Error) => void): FluxoDaEntrada
  on(evento: 'end', fn: () => void): FluxoDaEntrada
  resume(): void
}

/**
 * `internalStream` EXISTE no JSZip 3 e é o único jeito de ler a entrada em PEDAÇOS — mas não está
 * nos tipos publicados. O cast fica isolado aqui, num ponto só, em vez de espalhar `any` pelo
 * corpo da função. E a checagem em runtime não é cerimônia: se uma versão futura remover o
 * método, isto denuncia com mensagem legível em vez de estourar "is not a function" — e, mais
 * importante, RECUSA o arquivo em vez de cair silenciosamente num caminho sem teto.
 */
function abrirFluxo(arquivo: JSZip.JSZipObject): FluxoDaEntrada {
  const bruto = arquivo as unknown as { internalStream?: (tipo: 'uint8array') => FluxoDaEntrada }
  if (typeof bruto.internalStream !== 'function') {
    throw new Error('esta versão do JSZip não expõe internalStream; o teto de expansão não pode ser garantido')
  }
  return bruto.internalStream('uint8array')
}

/**
 * Descompacta UMA entrada com teto, contando os bytes conforme eles saem.
 *
 * NÃO CONFIA NO CABEÇALHO. O `uncompressedSize` declarado no ZIP é escrito por quem gerou o
 * arquivo e um zip malicioso mente. Ele serve para recusar CEDO e barato; o que garante é a
 * contagem durante o fluxo, que não tem como ser falsificada.
 */
export async function descompactarComTeto(arquivo: JSZip.JSZipObject, nome: string): Promise<Buffer> {
  const declarado = (arquivo as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof declarado === 'number' && declarado > TETO_DE_EXPANSAO) {
    throw new Error(`${nome} declara ${Math.round(declarado / 1048576)} MB descompactados; o teto é ${TETO_DE_EXPANSAO / 1048576} MB`)
  }

  const fluxo = abrirFluxo(arquivo)

  return new Promise<Buffer>((resolve, reject) => {
    const pedacos: Buffer[] = []
    let total = 0
    let abortado = false
    fluxo
      .on('data', (pedaco: Uint8Array) => {
        if (abortado) return
        total += pedaco.length
        if (total > TETO_DE_EXPANSAO) {
          abortado = true
          // Solta o que já foi acumulado antes de rejeitar — sem isto, o pico de memória que
          // estamos evitando aconteceria mesmo assim, só que na hora do erro.
          pedacos.length = 0
          reject(new Error(`${nome} passou de ${TETO_DE_EXPANSAO / 1048576} MB ao descompactar; arquivo recusado`))
          return
        }
        pedacos.push(Buffer.from(pedaco))
      })
      .on('error', reject)
      .on('end', () => { if (!abortado) resolve(Buffer.concat(pedacos)) })
      .resume()
  })
}

/** Descompacta o `.apkg` e devolve o SQLite bruto + o nome do arquivo interno + o zip aberto. */
async function extrairColecao(apkg: Buffer): Promise<{ db: Buffer; formato: string; temMidia: boolean; zip: JSZip }> {
  const zip = await JSZip.loadAsync(apkg)
  const nomes = Object.keys(zip.files)
  const temMidia = nomes.some(n => /^\d+$/.test(n))

  // Ordem de preferência: o mais novo primeiro, porque é o que traz o baralho completo.
  for (const nome of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    const arquivo = zip.file(nome)
    if (!arquivo) continue
    const bruto = await descompactarComTeto(arquivo, nome)
    if (nome.endsWith('b')) {
      // Zstandard. Node < 23.8 não tem esta função — daí a mensagem explícita em vez de um
      // "undefined is not a function" que ninguém consegue interpretar.
      if (typeof zstdDecompressSync !== 'function') {
        throw new Error('este .apkg usa compressão zstd e esta versão do Node não a suporta')
      }
      /*
       * SEGUNDA EXPANSÃO, SEGUNDO TETO. O `.anki21b` é zstd DENTRO do zip, então o teto do
       * fluxo acima limita o payload comprimido, não o resultado. Zstd chega a razões ainda
       * maiores que deflate — sem `maxOutputLength` isto reabriria o F4-01 pelo formato que é
       * justamente o mais comum hoje (todo baralho baixado do AnkiWeb).
       */
      return {
        db: Buffer.from(zstdDecompressSync(bruto, { maxOutputLength: TETO_DE_EXPANSAO })),
        formato: nome,
        temMidia,
        zip,
      }
    }
    return { db: bruto, formato: nome, temMidia, zip }
  }
  throw new Error('não encontrei a coleção dentro do .apkg (collection.anki2/21/21b)')
}

/**
 * Lê as notas de um `.apkg`.
 *
 * O SQLite é escrito num arquivo temporário porque o driver do projeto (`@libsql/client`, o mesmo
 * do banco da aplicação) abre por caminho, não por buffer. O temporário é apagado sempre, mesmo
 * em caso de erro.
 */
export async function lerApkg(apkg: Buffer): Promise<LeituraAnki> {
  const { db, formato, temMidia, zip } = await extrairColecao(apkg)
  // Lido aqui, junto com a coleção, para devolver tudo numa leitura só — quem ativa uma nota
  // depois não precisa reabrir o zip para achar o mapa.
  const mapaDeMidia = temMidia ? await lerMapaDeMidia(zip) : undefined
  const dir = await mkdtemp(join(tmpdir(), 'babel-anki-'))
  const caminho = join(dir, 'collection.sqlite')
  await writeFile(caminho, db)

  const cliente = createClient({ url: `file:${caminho}` })
  try {
    // ── Nomes dos campos, por modelo de nota ────────────────────────────
    const camposPorModelo = new Map<string, string[]>()

    // Formato novo: tabelas próprias.
    try {
      const r = await cliente.execute('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')
      for (const linha of r.rows) {
        const mid = String(linha.ntid)
        const lista = camposPorModelo.get(mid) ?? []
        lista[Number(linha.ord)] = String(linha.name ?? '')
        camposPorModelo.set(mid, lista)
      }
    } catch { /* baralho antigo: a tabela não existe */ }

    // Formato antigo: JSON em `col.models`.
    if (!camposPorModelo.size) {
      try {
        const r = await cliente.execute('SELECT models FROM col LIMIT 1')
        const bruto = String(r.rows[0]?.models ?? '')
        if (bruto) {
          const modelos = JSON.parse(bruto) as Record<string, { flds?: Array<{ name?: string; ord?: number }> }>
          for (const [mid, m] of Object.entries(modelos)) {
            const lista: string[] = []
            for (const f of m.flds ?? []) lista[f.ord ?? lista.length] = String(f.name ?? '')
            camposPorModelo.set(mid, lista)
          }
        }
      } catch { /* sem nomes: cai no posicional */ }
    }

    // ── Nome do note type, por modelo ───────────────────────────────────
    const nomePorModelo = new Map<string, string>()
    try {
      const r = await cliente.execute('SELECT id, name FROM notetypes')
      for (const linha of r.rows) nomePorModelo.set(String(linha.id), String(linha.name ?? ''))
    } catch { /* baralho antigo: a tabela não existe */ }
    if (!nomePorModelo.size) {
      try {
        const r = await cliente.execute('SELECT models FROM col LIMIT 1')
        const bruto = String(r.rows[0]?.models ?? '')
        if (bruto) {
          const modelos = JSON.parse(bruto) as Record<string, { name?: string }>
          for (const [mid, m] of Object.entries(modelos)) nomePorModelo.set(mid, String(m.name ?? ''))
        }
      } catch { /* sem nome: nota fica sem notetype */ }
    }

    /* O ESQUEMA NOVO às vezes guarda a hierarquia do baralho com `\x1f` em vez de `::` — os dois
       precisam virar `::`, senão "Idiomas::Inglês" e "Idiomas\x1fInglês" pareceriam baralhos
       diferentes quando são o mesmo, só escrito por versões diferentes do Anki. */
    const normalizarNomeBaralho = (s: string) => s.split(SEP).join('::')

    // ── Nome do baralho, por id ──────────────────────────────────────────
    const nomePorBaralho = new Map<string, string>()
    try {
      const r = await cliente.execute('SELECT id, name FROM decks')
      for (const linha of r.rows) nomePorBaralho.set(String(linha.id), normalizarNomeBaralho(String(linha.name ?? '')))
    } catch { /* baralho antigo: a tabela não existe */ }
    if (!nomePorBaralho.size) {
      try {
        const r = await cliente.execute('SELECT decks FROM col LIMIT 1')
        const bruto = String(r.rows[0]?.decks ?? '')
        if (bruto) {
          const decks = JSON.parse(bruto) as Record<string, { name?: string }>
          for (const [did, d] of Object.entries(decks)) nomePorBaralho.set(did, normalizarNomeBaralho(String(d.name ?? '')))
        }
      } catch { /* sem nome: nota fica sem baralho */ }
    }

    /* Nota → baralho pelo PRIMEIRO cartão (menor `ord`): a mesma nota pode ter cartões em decks
       diferentes (cloze com override de deck por cartão, por exemplo), e um só precisa vencer. */
    const baralhoIdPorNota = new Map<string, string>()
    try {
      const r = await cliente.execute('SELECT nid, did FROM cards ORDER BY nid, ord')
      for (const linha of r.rows) {
        const nid = String(linha.nid)
        if (!baralhoIdPorNota.has(nid)) baralhoIdPorNota.set(nid, String(linha.did))
      }
    } catch { /* sem cards: notas ficam sem baralho */ }

    // ── As notas, com TETO — sem isto um baralho de centenas de milhares de notas carrega tudo
    // de uma vez em memória (ver `TETO_DE_NOTAS`). O count separado é o que permite avisar
    // "truncado" mesmo depois de cortar a leitura.
    const contagem = await cliente.execute('SELECT count(*) c FROM notes')
    const totalNoArquivo = Number(contagem.rows[0]?.c ?? 0)
    const truncado = totalNoArquivo > TETO_DE_NOTAS

    /* `guid` É O ID ESTÁVEL DA NOTA no Anki — o mesmo entre exportações e entre máquinas — e é o
       que permite um reimport ATUALIZAR em vez de duplicar. Sem ele só resta sintetizar uma chave
       a partir do conteúdo, e aí o dedupe morre exatamente no caso que importa: o autor do baralho
       corrige uma tradução, o conteúdo muda, a chave muda, e a nota corrigida entra como se fosse
       uma segunda nota. Custa uma coluna no SELECT. */
    /* A COLUNA PODE NÃO EXISTIR num arquivo gerado por ferramenta de terceiro (o Anki sempre a
       tem; geradores caseiros nem sempre). Sem esta rede, o import inteiro morreria com
       "no such column: guid" — um erro que não diz nada a quem só quer subir um baralho. Sem guid,
       a nota sai com identidade vazia e quem grava decide o que fazer (hoje, derivar do conteúdo). */
    const r = await cliente.execute({
      sql: 'SELECT id, guid, mid, flds, tags FROM notes LIMIT ?',
      args: [TETO_DE_NOTAS],
    }).catch(async (e: unknown) => {
      if (!/no such column: guid/i.test(String(e))) throw e
      return cliente.execute({
        sql: "SELECT id, '' AS guid, mid, flds, tags FROM notes LIMIT ?",
        args: [TETO_DE_NOTAS],
      })
    })
    const notas: NotaAnki[] = []
    let descartadas = 0
    let camposVistos: string[] = []
    const baralhosVistos = new Set<string>()

    for (const linha of r.rows) {
      const partes = String(linha.flds ?? '').split(SEP)
      const nomes = camposPorModelo.get(String(linha.mid)) ?? []
      if (nomes.length && !camposVistos.length) camposVistos = nomes.filter(Boolean)

      // Mídia é extraída do campo BRUTO — depois de `limparCampo` a referência já não existe.
      const sons: string[] = []
      const imagens: string[] = []
      for (const parte of partes) {
        const m = extrairMidia(parte ?? '')
        for (const s of m.sons) if (!sons.includes(s)) sons.push(s)
        for (const im of m.imagens) if (!imagens.includes(im)) imagens.push(im)
      }
      const midia = sons.length || imagens.length ? { sons, imagens } : undefined

      // Cloze resolvido ANTES de limpar (ver `limparELacunas`), campo a campo.
      const camposLimpos = partes.map(p => limparELacunas(p ?? ''))
      const lacunasDaNota = camposLimpos.flatMap(c => c.lacunas).sort((a, b) => a.ordinal - b.ordinal)

      /* Pelo NOME quando o baralho os nomeia; posicional quando não (ver `indicePorNome`). O
         índice só vale se o campo tiver conteúdo depois de limpo — um `Meaning` vazio não é
         melhor que o `flds[1]` que ele substituiria. */
      const porNomeOuPosicao = (padroes: RegExp[], posicao: number) => {
        const i = indicePorNome(nomes, padroes)
        return (i >= 0 ? camposLimpos[i]?.texto : '') || camposLimpos[posicao]?.texto || ''
      }
      const frente = porNomeOuPosicao(PADRAO_FRENTE, 0)
      const verso = porNomeOuPosicao(PADRAO_VERSO, 1)
      // Sem frente OU sem verso não há cartão: um dos dois lados seria inventado.
      if (!frente || !verso) { descartadas++; continue }

      const iExemplo = indiceDoExemplo(nomes)
      const cru = iExemplo >= 0 ? camposLimpos[iExemplo]?.texto ?? '' : camposLimpos[2]?.texto ?? ''
      /* O exemplo não pode ser a própria palavra nem a própria tradução: onde o posicional cai em
         cima de um dos dois, a frase "de contexto" seria a resposta repetida. */
      const exemplo = cru && cru !== frente && cru !== verso ? cru : ''

      const baralhoId = baralhoIdPorNota.get(String(linha.id))
      const baralho = baralhoId ? nomePorBaralho.get(baralhoId) : undefined
      if (baralho) baralhosVistos.add(baralho)

      /* OS CAMPOS ORIGINAIS, POR NOME — a promessa de "reclassificar sem reimportar" mora aqui.
         Quem só guardasse frente/verso/exemplo estaria jogando fora o resto da nota (leitura,
         pitch accent, frequência, o campo que o mapeamento automático não reconheceu), e trocar o
         mapeamento depois exigiria o arquivo de novo — 214 MB, no baralho que medimos. Guardamos o
         BRUTO, não o limpo: a limpeza é uma decisão nossa e precisa poder ser refeita. Campo sem
         nome (baralho antigo, sem `fields`) entra pela posição, que é a identidade que ele tem. */
      const camposBrutos: Record<string, string> = {}
      partes.forEach((valor, i) => { camposBrutos[nomes[i] || `campo${i}`] = valor ?? '' })

      notas.push({
        guid: String(linha.guid ?? ''),
        frente,
        verso,
        exemplo: exemplo || undefined,
        tags: String(linha.tags ?? '').split(/\s+/).filter(Boolean),
        camposBrutos,
        midia,
        lacunas: lacunasDaNota.length ? lacunasDaNota : undefined,
        baralho,
        notetype: nomePorModelo.get(String(linha.mid)) || undefined,
        estruturaHash: nomes.length ? hashDaEstrutura(nomes) : undefined,
      })
    }

    return {
      notas,
      formato,
      campos: camposVistos,
      descartadas,
      temMidia,
      baralhos: baralhosVistos.size ? [...baralhosVistos].sort() : undefined,
      truncado,
      totalNoArquivo,
      mapaDeMidia,
    }
  } finally {
    cliente.close()
    await rm(dir, { recursive: true, force: true }).catch(() => { /* temporário: some com o SO */ })
  }
}

/**
 * Lê o formato TEXTO que o Anki exporta e importa nativamente.
 *
 * Vale a pena aceitar porque é o que sai de planilha, e porque quem já tem um baralho em CSV não
 * precisa abrir o Anki só para converter. Separador detectado por frequência: tabulação primeiro
 * (é o padrão do Anki), depois ponto-e-vírgula, depois vírgula.
 */
/* ═══════════════════════════ MÍDIA (motor-anki-midia) ═══════════════════════════ */

/**
 * TETO DE MÍDIA POR ARQUIVO — mesmo espírito do `TETO_DE_EXPANSAO`: conteúdo de terceiros é
 * hostil até prova em contrário. 25 MB é folgado para áudio/imagem de nota de idioma (o app já
 * usa a mesma ordem de grandeza como tamanho de lote no design da negociação de mídia) e recusa
 * cedo um arquivo absurdo antes de ele consumir memória ou cota.
 */
export const TETO_DE_MIDIA_POR_ARQUIVO = 25 * 1024 * 1024

/** Uma entrada do mapa de mídia: nome REAL do arquivo, e o que o `.apkg` sabia sobre ele. */
export interface EntradaDeMidia {
  nome: string
  bytes?: number
  sha1?: string
}

/**
 * DECODIFICADOR PROTOBUF MÍNIMO para `MediaEntries` (formato Latest, `collection.anki21b`).
 *
 * POR QUE NÃO UMA DEPENDÊNCIA (`protobufjs`, `@bufbuild/protobuf`, …): a superfície que
 * precisamos é ínfima — UMA mensagem, com UM campo repetido, e dentro dela só 3 campos (mais um
 * quinto que quase nunca aparece). Isso é varint + length-delimited + leitura de bytes crus, o
 * que cabe em ~40 linhas sem gerar código nem carregar um runtime de reflection para decodificar
 * um arquivo que o próprio Anki não versiona com `.proto` publicado formalmente (foi obtido da
 * fonte oficial do projeto). Trazer uma lib inteira para isto seria peso permanente no bundle por
 * um decodificador que não muda.
 *
 * Wire format do protobuf, o mínimo necessário:
 *   - cada campo é `(field_number << 3) | wire_type`, como varint;
 *   - wire_type 0 = varint (uint32/uint64/bool/enum);
 *   - wire_type 2 = length-delimited (bytes/string/mensagem aninhada/repeated).
 */
function lerVarint(buf: Buffer, offset: number): { valor: number; proximo: number } {
  let resultado = 0
  let deslocamento = 0
  let i = offset
  for (;;) {
    if (i >= buf.length) throw new Error('protobuf de mídia truncado (varint sem fim)')
    const byte = buf[i]
    resultado += (byte & 0x7f) * Math.pow(2, deslocamento)
    i++
    if ((byte & 0x80) === 0) break
    deslocamento += 7
  }
  return { valor: resultado, proximo: i }
}

/** Decodifica uma `MediaEntry` (bytes de uma entrada da lista `entries`). */
function decodificarMediaEntry(buf: Buffer): { nome: string; bytes?: number; sha1?: string; legacyZipFilename?: number } {
  let i = 0
  let nome = ''
  let bytesTam: number | undefined
  let sha1: string | undefined
  let legacyZipFilename: number | undefined

  while (i < buf.length) {
    const tag = lerVarint(buf, i)
    i = tag.proximo
    const campo = tag.valor >>> 3
    const wireType = tag.valor & 0x7

    if (wireType === 0) {
      const v = lerVarint(buf, i)
      i = v.proximo
      if (campo === 2) bytesTam = v.valor
      if (campo === 255) legacyZipFilename = v.valor
      continue
    }
    if (wireType === 2) {
      const tam = lerVarint(buf, i)
      i = tam.proximo
      const fim = i + tam.valor
      if (fim > buf.length) throw new Error('protobuf de mídia truncado (bytes length-delimited)')
      const trecho = buf.subarray(i, fim)
      if (campo === 1) nome = trecho.toString('utf8')
      if (campo === 3) sha1 = trecho.toString('hex')
      i = fim
      continue
    }
    throw new Error(`protobuf de mídia: wire type ${wireType} não suportado (campo ${campo})`)
  }

  return { nome, bytes: bytesTam, sha1, legacyZipFilename }
}

/** Decodifica a mensagem raiz `MediaEntries` (campo 1 repetido = `entries`). */
function decodificarMediaEntries(buf: Buffer): Array<{ nome: string; bytes?: number; sha1?: string; legacyZipFilename?: number }> {
  const entradas: Array<{ nome: string; bytes?: number; sha1?: string; legacyZipFilename?: number }> = []
  let i = 0
  while (i < buf.length) {
    const tag = lerVarint(buf, i)
    i = tag.proximo
    const campo = tag.valor >>> 3
    const wireType = tag.valor & 0x7
    if (wireType !== 2) throw new Error(`MediaEntries: wire type ${wireType} inesperado no campo ${campo}`)
    const tam = lerVarint(buf, i)
    i = tam.proximo
    const fim = i + tam.valor
    if (fim > buf.length) throw new Error('protobuf de mídia truncado (entries)')
    if (campo === 1) entradas.push(decodificarMediaEntry(buf.subarray(i, fim)))
    i = fim
  }
  return entradas
}

/**
 * LÊ O MAPA `media` do zip, nas DUAS formas possíveis (ver comentário de topo do arquivo):
 *
 *   - Legacy 1/2: JSON `{"0":"palavra.mp3","1":"foto.jpg"}` — chave = nome numérico no zip;
 *   - Latest: protobuf `MediaEntries` — o ÍNDICE da entrada na lista é o nome numérico, salvo
 *     quando `legacy_zip_filename` está presente, que então manda (ver design.md/spec do Anki).
 *
 * Detecção: tenta JSON primeiro só quando o conteúdo COMEÇA com `{` (o protobuf começaria com um
 * byte de tag, que é lixo como JSON e falharia o `JSON.parse` de qualquer forma — mas checar o
 * primeiro byte evita gastar um try/catch caro em decodificação binária malformada).
 *
 * Devolve `undefined` quando o `.apkg` não tem arquivo `media` (baralho sem mídia nenhuma).
 */
export async function lerMapaDeMidia(zip: JSZip): Promise<Map<string, EntradaDeMidia> | undefined> {
  const arquivo = zip.file('media')
  if (!arquivo) return undefined

  const bruto = await descompactarComTeto(arquivo, 'media')
  const mapa = new Map<string, EntradaDeMidia>()

  if (bruto.length && bruto[0] === '{'.charCodeAt(0)) {
    const json = JSON.parse(bruto.toString('utf8')) as Record<string, string>
    for (const [numerico, nome] of Object.entries(json)) mapa.set(numerico, { nome })
    return mapa
  }

  const entradas = decodificarMediaEntries(bruto)
  entradas.forEach((entrada, indice) => {
    const numerico = String(entrada.legacyZipFilename ?? indice)
    mapa.set(numerico, { nome: entrada.nome, bytes: entrada.bytes, sha1: entrada.sha1 })
  })
  return mapa
}

/**
 * EXTRAI o Buffer de um arquivo de mídia pelo nome NUMÉRICO no zip.
 *
 * Latest comprime cada arquivo numerado individualmente com zstd (não é só a coleção); as outras
 * duas variantes gravam o arquivo cru. `variante` vem do `formato` que `lerApkg`/`extrairColecao`
 * já detectou (`collection.anki21b` ⇒ Latest).
 *
 * TETOS: por arquivo (`TETO_DE_MIDIA_POR_ARQUIVO`) e acumulado da CHAMADA (`orcamentoRestante`,
 * quando informado) — o mesmo espírito do `TETO_DE_EXPANSAO`, contado durante o fluxo, não
 * confiando no tamanho declarado.
 */
export async function extrairArquivoDeMidia(
  zip: JSZip,
  numerico: string,
  variante: string,
  orcamentoRestante?: number,
): Promise<Buffer> {
  const arquivo = zip.file(numerico)
  if (!arquivo) throw new Error(`arquivo de mídia "${numerico}" não existe dentro do .apkg`)

  const teto = Math.min(TETO_DE_MIDIA_POR_ARQUIVO, orcamentoRestante ?? TETO_DE_MIDIA_POR_ARQUIVO)
  // `descompactarComTeto` conta bytes DESCOMPACTADOS DO ZIP — para a variante Latest isso ainda é
  // o payload comprimido em zstd, então o teto real do arquivo final é aplicado depois do zstd.
  const cru = await descompactarComTeto(arquivo, `mídia ${numerico}`)

  if (variante !== 'collection.anki21b') {
    if (cru.length > teto) {
      throw new Error(`mídia ${numerico} tem ${Math.round(cru.length / 1048576)} MB; o teto é ${teto / 1048576} MB`)
    }
    return cru
  }

  if (typeof zstdDecompressSync !== 'function') {
    throw new Error('este .apkg usa compressão zstd e esta versão do Node não a suporta')
  }
  const bytes = Buffer.from(zstdDecompressSync(cru, { maxOutputLength: teto }))
  return bytes
}

/**
 * ÍNDICE INVERSO nome-real → numérico-no-zip.
 *
 * `extrairMidia` devolve o nome REAL (`palavra.mp3`, o que a nota referencia em `[sound:...]`);
 * `lerMapaDeMidia` devolve numérico→real (a forma que o `.apkg` grava). Quem consome — resolver a
 * mídia de UMA nota — precisa do sentido contrário, e refazer essa inversão em cada chamador
 * seria repetir a mesma volta em todo lugar que precisa dela.
 *
 * Em caso de nome duplicado (mais de um numérico mapeando para o mesmo nome real — não deveria
 * acontecer num `.apkg` bem formado, mas conteúdo de terceiros não se confia), o ÚLTIMO vence,
 * documentado aqui em vez de escondido.
 */
export function indiceInversoDeMidia(mapa: Map<string, EntradaDeMidia>): Map<string, string> {
  const inverso = new Map<string, string>()
  for (const [numerico, entrada] of mapa) inverso.set(entrada.nome, numerico)
  return inverso
}

/* ═══════════════════════════ IDIOMA (S11 — motor-anki-acervo) ═══════════════════════════ */

/**
 * ESCRITA DOMINANTE de uma amostra de texto — a base do conserto do S11.
 *
 * O CENÁRIO QUE ISTO EVITA: a rota de import grava `idiomaOrigem` a partir do cabeçalho
 * `X-Src-Lang`, que o CLIENTE preenche com o idioma do LOBBY (a tela que a pessoa está usando),
 * não com o idioma do baralho. Importar um deck JAPONÊS com o lobby em inglês carimbava
 * `srcLang='en'` em milhares de cartões, silenciosamente — envenenando o filtro de idioma para
 * sempre, porque nada nessa cadeia jamais olhava o CONTEÚDO do baralho para conferir.
 *
 * Aqui a conferência: conta caracteres por FAIXA UNICODE (script) sobre uma amostra de frentes, e
 * decide a escrita dominante por MAIORIA das letras (>50%) — não da amostra inteira, porque
 * dígitos/pontuação/espaço não dizem nada sobre o idioma e diluiriam a contagem à toa. Sem letra
 * nenhuma na amostra, a resposta honesta é 'desconhecido', não um palpite.
 */
export type EscritaDominante =
  | 'latino' | 'cjk' | 'kana' | 'hangul' | 'cirilico' | 'arabe' | 'hebraico' | 'grego'
  | 'devanagari' | 'thai' | 'desconhecido'

/* Ordem de checagem importa: kana ANTES de han, porque uma frente japonesa mistura os dois
   (漢字 + かな) e cada caractere só é contado numa faixa — checar han primeiro classificaria
   caracteres kana como han incorretamente só se as faixas se sobrepusessem (não se sobrepõem,
   mas a ordem abaixo documenta a intenção de qualquer forma: kana é o sinal mais forte de 'ja'). */
const FAIXAS: Array<{ escrita: Exclude<EscritaDominante, 'desconhecido'>; regex: RegExp }> = [
  { escrita: 'kana', regex: /[\p{Script=Hiragana}\p{Script=Katakana}]/u },
  { escrita: 'hangul', regex: /\p{Script=Hangul}/u },
  { escrita: 'cjk', regex: /\p{Script=Han}/u },
  { escrita: 'cirilico', regex: /\p{Script=Cyrillic}/u },
  { escrita: 'arabe', regex: /\p{Script=Arabic}/u },
  { escrita: 'hebraico', regex: /\p{Script=Hebrew}/u },
  { escrita: 'grego', regex: /\p{Script=Greek}/u },
  { escrita: 'devanagari', regex: /\p{Script=Devanagari}/u },
  { escrita: 'thai', regex: /\p{Script=Thai}/u },
  { escrita: 'latino', regex: /\p{Script=Latin}/u },
]

/**
 * Contagem de LETRAS por escrita numa amostra — a matéria-prima de `escritaDominante` e da
 * decisão de idioma da rota de import. Exposta separada porque a DOMINÂNCIA não basta para
 * japonês: um baralho de vocabulário típico é majoritariamente kanji (Han) com kana minoritário,
 * e só a contagem bruta permite a regra "presença de kana prova japonês" (ver a rota).
 */
export function contagemDeEscritas(amostras: string[]): { contagem: Record<string, number>; totalDeLetras: number } {
  const contagem: Record<string, number> = {}
  let totalDeLetras = 0
  for (const linha of amostras) {
    for (const ch of linha ?? '') {
      const faixa = FAIXAS.find((f) => f.regex.test(ch))
      if (!faixa) continue // dígito, pontuação, espaço, emoji — não é letra de nenhuma escrita
      contagem[faixa.escrita] = (contagem[faixa.escrita] ?? 0) + 1
      totalDeLetras++
    }
  }
  return { contagem, totalDeLetras }
}

export function escritaDominante(amostras: string[]): EscritaDominante {
  const { contagem, totalDeLetras } = contagemDeEscritas(amostras)
  if (!totalDeLetras) return 'desconhecido'
  const [escritaTop, qtd] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]
  return qtd / totalDeLetras > 0.5 ? (escritaTop as EscritaDominante) : 'desconhecido'
}

export function lerTextoAnki(texto: string): LeituraAnki {
  const linhas = (texto ?? '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
  if (!linhas.length) return { notas: [], formato: 'texto', campos: [], descartadas: 0, temMidia: false }

  const candidatos = ['\t', ';', ','] as const
  const sep = candidatos.find(s => linhas[0].includes(s)) ?? '\t'

  const notas: NotaAnki[] = []
  let descartadas = 0
  let campos: string[] = []

  linhas.forEach((linha, i) => {
    const partes = linha.split(sep).map(p => limparCampo(p.replace(/^"|"$/g, '')))
    // Cabeçalho: primeira linha cujos dois primeiros campos parecem rótulos, não conteúdo.
    if (i === 0 && /^(front|frente|word|palavra|term)$/i.test(partes[0] ?? '')) {
      campos = partes.filter(Boolean)
      return
    }
    const [frente, verso, exemplo] = partes
    if (!frente || !verso) { descartadas++; return }
    /* Texto puro não tem identidade estável: quem gerou o arquivo não guardou id nenhum. Guid
       vazio é a resposta honesta — quem grava decide o que fazer com isso (hoje, sintetizar). */
    notas.push({ guid: '', frente, verso, exemplo: exemplo || undefined, tags: [] })
  })

  return { notas, formato: `texto (separado por ${sep === '\t' ? 'tabulação' : sep})`, campos, descartadas, temMidia: false }
}
