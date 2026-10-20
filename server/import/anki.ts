import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import { createClient } from '@libsql/client'
import JSZip from 'jszip'

import { type LeituraAnki, montarNota, type NotaAnki, TETO_DE_NOTAS } from '../../src/core/anki'

/* Reexportado só até a Task 6 (o leitor passa a viver no navegador): quem ainda importa daqui
   (scripts, testes de segurança) segue funcionando sem mudar o caminho. */
export type { Lacuna, LeituraAnki, NotaAnki, RefsDeMidia } from '../../src/core/anki'
export { lerTextoAnki, limparCampo } from '../../src/core/anki'

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
export async function descompactarComTeto(
  arquivo: JSZip.JSZipObject,
  nome: string,
  teto: number = TETO_DE_EXPANSAO,
): Promise<Buffer> {
  const declarado = (arquivo as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof declarado === 'number' && declarado > teto) {
    throw new Error(
      `${nome} declara ${Math.round(declarado / 1048576)} MB descompactados; o teto é ${teto / 1048576} MB`,
    )
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
        if (total > teto) {
          abortado = true
          // Solta o que já foi acumulado antes de rejeitar — sem isto, o pico de memória que
          // estamos evitando aconteceria mesmo assim, só que na hora do erro.
          pedacos.length = 0
          reject(new Error(`${nome} passou de ${teto / 1048576} MB ao descompactar; arquivo recusado`))
          return
        }
        pedacos.push(Buffer.from(pedaco))
      })
      .on('error', reject)
      .on('end', () => {
        if (!abortado) resolve(Buffer.concat(pedacos))
      })
      .resume()
  })
}

/** Descompacta o `.apkg` e devolve o SQLite bruto + o nome do arquivo interno + o zip aberto. */
async function extrairColecao(apkg: Buffer): Promise<{ db: Buffer; formato: string; temMidia: boolean; zip: JSZip }> {
  const zip = await JSZip.loadAsync(apkg)
  const nomes = Object.keys(zip.files)
  const temMidia = nomes.some((n) => /^\d+$/.test(n))

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
    } catch {
      /* baralho antigo: a tabela não existe */
    }

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
      } catch {
        /* sem nomes: cai no posicional */
      }
    }

    // ── Nome do note type, por modelo ───────────────────────────────────
    const nomePorModelo = new Map<string, string>()
    try {
      const r = await cliente.execute('SELECT id, name FROM notetypes')
      for (const linha of r.rows) nomePorModelo.set(String(linha.id), String(linha.name ?? ''))
    } catch {
      /* baralho antigo: a tabela não existe */
    }
    if (!nomePorModelo.size) {
      try {
        const r = await cliente.execute('SELECT models FROM col LIMIT 1')
        const bruto = String(r.rows[0]?.models ?? '')
        if (bruto) {
          const modelos = JSON.parse(bruto) as Record<string, { name?: string }>
          for (const [mid, m] of Object.entries(modelos)) nomePorModelo.set(mid, String(m.name ?? ''))
        }
      } catch {
        /* sem nome: nota fica sem notetype */
      }
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
    } catch {
      /* baralho antigo: a tabela não existe */
    }
    if (!nomePorBaralho.size) {
      try {
        const r = await cliente.execute('SELECT decks FROM col LIMIT 1')
        const bruto = String(r.rows[0]?.decks ?? '')
        if (bruto) {
          const decks = JSON.parse(bruto) as Record<string, { name?: string }>
          for (const [did, d] of Object.entries(decks))
            nomePorBaralho.set(did, normalizarNomeBaralho(String(d.name ?? '')))
        }
      } catch {
        /* sem nome: nota fica sem baralho */
      }
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
    } catch {
      /* sem cards: notas ficam sem baralho */
    }

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
    const r = await cliente
      .execute({
        sql: 'SELECT id, guid, mid, flds, tags FROM notes LIMIT ?',
        args: [TETO_DE_NOTAS],
      })
      .catch(async (e: unknown) => {
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
      const nomes = camposPorModelo.get(String(linha.mid)) ?? []
      if (nomes.length && !camposVistos.length) camposVistos = nomes.filter(Boolean)

      const baralhoId = baralhoIdPorNota.get(String(linha.id))
      const baralho = baralhoId ? nomePorBaralho.get(baralhoId) : undefined

      const nota = montarNota({
        guid: String(linha.guid ?? ''),
        flds: String(linha.flds ?? ''),
        tags: String(linha.tags ?? ''),
        nomesDosCampos: nomes,
        notetype: nomePorModelo.get(String(linha.mid)),
        baralho,
      })
      if (!nota) {
        descartadas++
        continue
      }
      if (baralho) baralhosVistos.add(baralho)
      notas.push(nota)
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
    }
  } finally {
    cliente.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* temporário: some com o SO */
    })
  }
}

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
function decodificarMediaEntry(buf: Buffer): {
  nome: string
  bytes?: number
  sha1?: string
  legacyZipFilename?: number
} {
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
function decodificarMediaEntries(
  buf: Buffer,
): Array<{ nome: string; bytes?: number; sha1?: string; legacyZipFilename?: number }> {
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
