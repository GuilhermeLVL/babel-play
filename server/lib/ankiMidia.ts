/**
 * MÍDIA DO ANKI (`openspec/changes/motor-anki-midia`) — funções puras + acesso ao storage.
 *
 * REUSA o seam de `armazenamento.ts` (filesystem | S3/R2) em vez de construir storage novo — é o
 * mesmo seam que já serve o áudio de sessão, endurecido pelo incidente P0-3 (arquivo preso ao
 * disco de uma réplica enquanto a linha do banco replicava). `AUDIO_DIR`/`sessions.ts` não é
 * reaproveitado como DIRETÓRIO porque mídia Anki tem seu próprio ciclo de vida (dedupe por
 * usuário, nome por hash) — mas o PADRÃO (env-var própria, resolvida uma vez no carregamento do
 * módulo, mesmo espírito de `AUDIO_DIR`) é o mesmo.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { armazenamentoDoAmbiente, type Armazenamento } from './armazenamento'
import { detectarTipoDeArquivo } from './tipoDeArquivo'

/** Espelha o padrão de `AUDIO_DIR` (`server/routes/sessions.ts`) — resolvida em CHAMADA para o
 *  teste poder trocar `env.ANKI_MEDIA_DIR` sem reimportar o módulo. */
function resolverDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ANKI_MEDIA_DIR ? path.resolve(env.ANKI_MEDIA_DIR) : path.join(process.cwd(), 'data', 'anki-media')
}

/** Instância padrão do storage, resolvida do ambiente — o que as rotas usam. */
export const armazenamentoDeMidiaAnki: Armazenamento = armazenamentoDoAmbiente(resolverDir())

/**
 * Caminho do objeto: `anki-media/<userId>/<sha256>`.
 *
 * O nome é derivado do HASH, NUNCA do nome original do arquivo (`palavra.mp3` dentro do `.apkg`)
 * — um nome original pode conter `../`, ser absurdamente longo, ou colidir por acaso entre dois
 * usuários; o hash não sofre nenhum desses problemas e já É a chave de dedupe por usuário.
 */
export function caminhoDeMidia(userId: string, sha256: string): string {
  return `anki-media/${userId}/${sha256}`
}

/**
 * DETECÇÃO DE IMAGEM por magic bytes.
 *
 * `tipoDeArquivo.ts` hoje só reconhece áudio + zip/pdf (o que o app recebia até aqui: gravação e
 * pacotes de importação). Mídia Anki é o primeiro caminho do app a aceitar IMAGEM, e esse arquivo
 * é propriedade de outra frente de trabalho neste momento — em vez de editá-lo por fora do escopo
 * desta tarefa, a checagem de imagem fica AQUI, pequena e isolada, no mesmo estilo (assinatura
 * exata nos primeiros bytes). Quando a detecção de imagem for útil em outro lugar do app, é
 * questão de mover isto para `tipoDeArquivo.ts` e apagar daqui.
 */
interface AssinaturaDeImagem { mime: string; ext: string }

function detectarImagem(bytes: Buffer): AssinaturaDeImagem | null {
  if (!bytes || bytes.length < 4) return null
  const casa = (offset: number, sig: readonly number[]) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b)

  if (casa(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' }
  if (casa(0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' }
  if (casa(0, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', ext: 'gif' }
  // WEBP: RIFF....WEBP — "RIFF" em 0, "WEBP" em 8 (mesmo formato de contêiner do WAV, mas com
  // fourcc diferente em 8; testado DEPOIS de WAV não colidir aqui porque `tipoDeArquivo.ts`
  // decide áudio separadamente e nós só chamamos este helper quando aquele já disse "não é áudio").
  if (casa(0, [0x52, 0x49, 0x46, 0x46]) && casa(8, [0x57, 0x45, 0x42, 0x50])) return { mime: 'image/webp', ext: 'webp' }
  return null
}

/**
 * Detecta áudio OU imagem por conteúdo. `categoria` do retorno é sempre a real ('audio' vem de
 * `tipoDeArquivo.ts`; imagem é anotada como `'imagem'` aqui, fora da união estreita daquele
 * módulo — ver `TipoDeMidiaAnki`).
 */
export interface TipoDeMidiaAnki {
  mime: string
  ext: string
  categoria: 'audio' | 'imagem'
}

export function detectarTipoDeMidia(bytes: Buffer): TipoDeMidiaAnki | null {
  const audio = detectarTipoDeArquivo(bytes)
  if (audio && audio.categoria === 'audio') return { mime: audio.mime, ext: audio.ext, categoria: 'audio' }
  const imagem = detectarImagem(bytes)
  if (imagem) return { mime: imagem.mime, ext: imagem.ext, categoria: 'imagem' }
  return null
}

export interface ResultadoDeGravacao {
  sha256: string
  bytes: number
  contentType: string
  /** true quando o objeto já existia no storage para este usuário — dedupe, nada foi regravado. */
  jaExistia: boolean
}

/**
 * Grava mídia Anki para um usuário.
 *
 * O SHA-256 É CALCULADO AQUI, sempre — nunca aceito do cliente, mesmo quando o próprio `.apkg`
 * já traz um sha1 por arquivo (`EntradaDeMidia.sha1` em `server/import/anki.ts`): aquele valor é
 * declaração de um terceiro sobre um conteúdo que nós ainda não vimos, e sha1 não é sequer o
 * algoritmo que este módulo usa para nomear o objeto. Hash do cliente nunca é autoridade.
 *
 * COTA: esta função NÃO reserva/ajusta cota — é ponto de extensão deliberado, não esquecimento.
 * O design (Decisão 3) exige que a reserva seja ATÔMICA e aconteça ANTES da escrita, com 507
 * quando cheia — isso pertence à ROTA que orquestra a negociação de mídia (fora do escopo desta
 * tarefa: `server/routes/`, dono de outra frente). O ponto de chamada óbvio é logo ANTES de
 * `gravarMidia`: `await reservarArmazenamento(userId, buffer.length)` e, se `!ok`, responder 507
 * sem sequer chamar esta função. Ver `server/lib/storageQuota.ts:reservarArmazenamento`.
 */
export async function gravarMidia(
  userId: string,
  buffer: Buffer,
  armazenamento: Armazenamento = armazenamentoDeMidiaAnki,
): Promise<ResultadoDeGravacao> {
  const tipo = detectarTipoDeMidia(buffer)
  if (!tipo) throw new Error('mídia recusada: não é áudio nem imagem reconhecível pelo conteúdo')

  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const nome = caminhoDeMidia(userId, sha256)

  // Dedupe por usuário: se o objeto já existe, não regrava (é o mesmo conteúdo, mesmo nome — o
  // nome É o hash). `tamanho` devolve `null` quando o objeto não existe, em ambas as pontas do seam.
  const existente = await armazenamento.tamanho(nome)
  const jaExistia = existente !== null
  if (!jaExistia) {
    await armazenamento.gravar(nome, buffer, tipo.mime)
  }

  return { sha256, bytes: buffer.length, contentType: tipo.mime, jaExistia }
}

/**
 * Lê mídia gravada. `faixa` opcional pede um recorte `[inicio, fim]` fechado (sustenta `Range` no
 * `<audio>`/`<img>`, mesmo raciocínio de `sessions.ts`); sem faixa, lê o objeto inteiro.
 */
export async function lerMidia(
  userId: string,
  sha256: string,
  faixa?: { inicio: number; fim: number },
  armazenamento: Armazenamento = armazenamentoDeMidiaAnki,
): Promise<Buffer | Readable> {
  const nome = caminhoDeMidia(userId, sha256)
  if (faixa) return armazenamento.lerFaixa(nome, faixa.inicio, faixa.fim)
  return armazenamento.ler(nome)
}
