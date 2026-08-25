import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import JSZip from 'jszip'
import { createClient } from '@libsql/client'

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

export interface NotaAnki {
  frente: string
  verso: string
  /** Frase de exemplo, quando o baralho tiver um campo com essa cara. */
  exemplo?: string
  tags: string[]
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
}

/**
 * Limpa o HTML que o Anki guarda no campo.
 *
 * Os campos vêm com marcação de verdade (`<b>`, `<br>`, `<div>`, `[sound:...]`, `<img>`). Jogar
 * isso num cartão de vocabulário produziria uma "palavra" com tags no meio — e a régua de
 * qualidade depois a reprovaria por ruído, o que seria culpar o dado pelo nosso descuido.
 */
export function limparCampo(bruto: string): string {
  return (bruto ?? '')
    // Referências de mídia viram nada: não importamos os arquivos, então o marcador só atrapalha.
    .replace(/\[sound:[^\]]*\]/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    // Quebras viram espaço ANTES de as tags sumirem, senão "luz<br>claridade" vira "luzclaridade".
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Qual campo é a frase de exemplo? Pelo NOME, quando o baralho nomeia os campos. */
function indiceDoExemplo(campos: string[]): number {
  const alvo = /(example|exemplo|sentence|frase|context|contexto|usage)/i
  return campos.findIndex(c => alvo.test(c))
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

/** Descompacta o `.apkg` e devolve o SQLite bruto + o nome do arquivo interno. */
async function extrairColecao(apkg: Buffer): Promise<{ db: Buffer; formato: string; temMidia: boolean }> {
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
      }
    }
    return { db: bruto, formato: nome, temMidia }
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
  const { db, formato, temMidia } = await extrairColecao(apkg)
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

    // ── As notas ────────────────────────────────────────────────────────
    const r = await cliente.execute('SELECT mid, flds, tags FROM notes')
    const notas: NotaAnki[] = []
    let descartadas = 0
    let camposVistos: string[] = []

    for (const linha of r.rows) {
      const partes = String(linha.flds ?? '').split(SEP)
      const nomes = camposPorModelo.get(String(linha.mid)) ?? []
      if (nomes.length && !camposVistos.length) camposVistos = nomes.filter(Boolean)

      const frente = limparCampo(partes[0] ?? '')
      const verso = limparCampo(partes[1] ?? '')
      // Sem frente OU sem verso não há cartão: um dos dois lados seria inventado.
      if (!frente || !verso) { descartadas++; continue }

      const iExemplo = indiceDoExemplo(nomes)
      const exemplo = iExemplo > 1 ? limparCampo(partes[iExemplo] ?? '') : limparCampo(partes[2] ?? '')

      notas.push({
        frente,
        verso,
        exemplo: exemplo || undefined,
        tags: String(linha.tags ?? '').split(/\s+/).filter(Boolean),
      })
    }

    return { notas, formato, campos: camposVistos, descartadas, temMidia }
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
    notas.push({ frente, verso, exemplo: exemplo || undefined, tags: [] })
  })

  return { notas, formato: `texto (separado por ${sep === '\t' ? 'tabulação' : sep})`, campos, descartadas, temMidia: false }
}
