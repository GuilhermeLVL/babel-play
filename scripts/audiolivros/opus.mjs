/**
 * WAV → Opus (WebM, mono) pelo `ffmpeg` do sistema com `libopus`. Só no lote, na máquina de quem gera: o
 * `ffmpeg` não é distribuído nem é dependência do app.
 *
 * A saída vai para um ARQUIVO temporário, não para o pipe: no pipe (não pesquisável) o muxer WebM não volta
 * para gravar a duração nem os cues, e o `<audio>` não acha o tempo total nem busca bem.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * @param {Uint8Array} wav WAV PCM 16-bit mono
 * @param {number} kbps
 * @param {{ ffmpeg?: string }} [o]
 * @returns {Promise<{ bytes: Uint8Array, sha256: string }>}
 */
export function codificarOpus(wav, kbps, o = {}) {
  if (!Number.isInteger(kbps) || kbps <= 0)
    return Promise.reject(new RangeError(`codificarOpus: kbps inválido (${kbps})`))
  const pasta = mkdtempSync(path.join(tmpdir(), 'opus-'))
  const destino = path.join(pasta, 'saida.webm')
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0']
  args.push('-c:a', 'libopus', '-b:a', `${kbps}k`, '-ac', '1', '-f', 'webm', destino)
  return new Promise((resolve, reject) => {
    const p = spawn(o.ffmpeg ?? 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let erro = ''
    const fim = (f) => {
      rmSync(pasta, { recursive: true, force: true })
      f()
    }
    p.stderr.on('data', (b) => (erro += b))
    p.on('error', (e) => fim(() => reject(e)))
    p.on('close', (codigo) => {
      if (codigo !== 0) return fim(() => reject(new Error(`ffmpeg saiu com ${codigo}: ${erro.trim().slice(0, 500)}`)))
      const bytes = new Uint8Array(readFileSync(destino))
      fim(() => resolve({ bytes, sha256: createHash('sha256').update(bytes).digest('hex') }))
    })
    p.stdin.on('error', reject)
    p.stdin.end(wav)
  })
}
