/**
 * Tipo de arquivo pelo CONTEÚDO (F4-04).
 *
 * O `Content-Type` do upload é escolhido pelo cliente: é declaração, não evidência. Aqui o tipo sai
 * dos MAGIC BYTES, sem dependência nova. A lista cobre o que o app realmente recebe — áudio do
 * MediaRecorder/yt-dlp e os pacotes da importação (ZIP cobre `.apkg` e `.docx`).
 */

export interface TipoDeArquivo {
  mime: string
  ext: string
  categoria: 'audio' | 'documento'
}

function casa(b: Buffer, offset: number, sig: readonly number[]): boolean {
  if (b.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false
  return true
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

/**
 * Ordem importa: o frame sync do MP3 são 11 bits e casaria com bytes soltos, então fica por último,
 * depois de todas as assinaturas exatas.
 */
const ASSINATURAS: Array<{ tipo: TipoDeArquivo; testar: (b: Buffer) => boolean }> = [
  // WebM/Matroska — EBML.
  { tipo: { mime: 'audio/webm', ext: 'webm', categoria: 'audio' }, testar: (b) => casa(b, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  { tipo: { mime: 'audio/ogg', ext: 'ogg', categoria: 'audio' }, testar: (b) => casa(b, 0, ascii('OggS')) },
  // MP4/M4A: o `ftyp` fica no offset 4, depois do tamanho do box.
  { tipo: { mime: 'audio/mp4', ext: 'mp4', categoria: 'audio' }, testar: (b) => casa(b, 4, ascii('ftyp')) },
  { tipo: { mime: 'audio/wav', ext: 'wav', categoria: 'audio' }, testar: (b) => casa(b, 0, ascii('RIFF')) && casa(b, 8, ascii('WAVE')) },
  { tipo: { mime: 'audio/mpeg', ext: 'mp3', categoria: 'audio' }, testar: (b) => casa(b, 0, ascii('ID3')) },
  { tipo: { mime: 'application/zip', ext: 'zip', categoria: 'documento' }, testar: (b) => casa(b, 0, [0x50, 0x4b, 0x03, 0x04]) },
  { tipo: { mime: 'application/pdf', ext: 'pdf', categoria: 'documento' }, testar: (b) => casa(b, 0, ascii('%PDF-')) },
  // MP3 sem ID3: frame sync de 11 bits (FF Ex / FF Fx).
  { tipo: { mime: 'audio/mpeg', ext: 'mp3', categoria: 'audio' }, testar: (b) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 },
]

/** O tipo detectado, ou `null` quando nenhuma assinatura conhecida casa. */
export function detectarTipoDeArquivo(bytes: Buffer): TipoDeArquivo | null {
  if (!bytes || bytes.length < 2) return null
  for (const a of ASSINATURAS) if (a.testar(bytes)) return a.tipo
  return null
}

/** Só áudio: um ZIP renomeado para `.webm` devolve `null` aqui, não o tipo do ZIP. */
export function detectarAudio(bytes: Buffer): TipoDeArquivo | null {
  const t = detectarTipoDeArquivo(bytes)
  return t && t.categoria === 'audio' ? t : null
}

/** Para a mensagem de recusa não virar adivinhação do lado do cliente. */
export const FORMATOS_DE_AUDIO_ACEITOS = 'webm, ogg, mp4/m4a, wav, mp3'
