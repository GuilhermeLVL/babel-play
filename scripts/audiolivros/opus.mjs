/**
 * WAV → Opus (WebM, mono) pelo `ffmpeg` do sistema com `libopus`. Só no lote, na máquina de quem gera: o
 * `ffmpeg` não é distribuído nem é dependência do app.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

/**
 * @param {Uint8Array} wav WAV PCM 16-bit mono
 * @param {number} kbps
 * @param {{ ffmpeg?: string }} [o]
 * @returns {Promise<{ bytes: Uint8Array, sha256: string }>}
 */
export function codificarOpus(wav, kbps, o = {}) {
  if (!Number.isInteger(kbps) || kbps <= 0)
    return Promise.reject(new RangeError(`codificarOpus: kbps inválido (${kbps})`))
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0']
  args.push('-c:a', 'libopus', '-b:a', `${kbps}k`, '-ac', '1', '-f', 'webm', 'pipe:1')
  return new Promise((resolve, reject) => {
    const p = spawn(o.ffmpeg ?? 'ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const saida = []
    let erro = ''
    p.stdout.on('data', (b) => saida.push(b))
    p.stderr.on('data', (b) => (erro += b))
    p.on('error', reject)
    p.on('close', (codigo) => {
      if (codigo !== 0) return reject(new Error(`ffmpeg saiu com ${codigo}: ${erro.trim().slice(0, 500)}`))
      const bytes = new Uint8Array(Buffer.concat(saida))
      resolve({ bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
    })
    p.stdin.on('error', reject)
    p.stdin.end(wav)
  })
}
