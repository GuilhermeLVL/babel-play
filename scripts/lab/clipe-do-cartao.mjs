#!/usr/bin/env node
/**
 * SIMULAÇÃO OFFLINE do clipe do cartão (openspec cartao-com-audio-do-trecho, tarefa 1.1).
 *
 * Lê as falas de `tests/fixtures/interprete/falas/*.wav`, codifica em Ogg Opus (libopus do ffmpeg) a 16, 24 e 32 kbps e
 * em WAV 16 kHz/16 bits, e imprime bytes por segundo e tempo de codificação. NÃO substitui a medição no aparelho: o tempo
 * aqui é do ffmpeg em Node (inclui subir o processo), não do WebCodecs no Safari/Android (tarefa 1.3 [R]).
 *
 * Uso: node scripts/lab/clipe-do-cartao.mjs [--escrever]   (--escrever grava docs/auditoria/AAAA-MM-DD-clipe-do-cartao.md)
 * Sem ffmpeg, o Opus sai da conta teórica (bitrate/8, sem o ~2% do Ogg) e o WAV segue exato.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DIR = 'tests/fixtures/interprete/falas'
const BITRATES = [16, 24, 32]
const TETO_24K_BYTES_POR_S = 4 * 1024

const temFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
const arquivos = readdirSync(DIR)
  .filter((n) => n.endsWith('.wav'))
  .sort()
const tmp = mkdtempSync(path.join(tmpdir(), 'clipe-'))

/** Duração em segundos de um WAV PCM (percorre os chunks até o `data`). */
function duracaoDoWav(buf) {
  const sr = buf.readUInt32LE(24)
  const canais = buf.readUInt16LE(22)
  const bits = buf.readUInt16LE(34)
  let pos = 12
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    if (id === 'data') return Math.min(tam, buf.length - pos - 8) / (sr * canais * (bits / 8))
    pos += 8 + tam + (tam % 2)
  }
  throw new Error('WAV sem chunk data')
}

const total = { seg: 0, wav: 0 }
for (const b of BITRATES) {
  total[`o${b}`] = 0
  total[`t${b}`] = 0
}
for (const nome of arquivos) {
  const origem = path.join(DIR, nome)
  const seg = duracaoDoWav(readFileSync(origem))
  total.seg += seg
  total.wav += Math.round(seg * 16000 * 2) + 44
  for (const b of BITRATES) {
    if (!temFfmpeg) {
      total[`o${b}`] += Math.round((seg * b * 1000) / 8)
      continue
    }
    const saida = path.join(tmp, `${nome}.${b}.ogg`)
    const t0 = process.hrtime.bigint()
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      origem,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      `${b}k`,
      '-application',
      'voip',
      saida,
    ])
    total[`t${b}`] += Number(process.hrtime.bigint() - t0) / 1e6
    total[`o${b}`] += statSync(saida).size
  }
}

const bps = (bytes) => Math.round(bytes / total.seg)
const hoje = new Date().toISOString().slice(0, 10)
const out = []
out.push('# Clipe do cartão: bytes por segundo (simulação offline)')
out.push('')
out.push(`Data: ${hoje}. Fixtures: ${arquivos.length} falas em \`${DIR}\`, ${total.seg.toFixed(1)} s no total.`)
out.push(
  `Codificador: ${temFfmpeg ? 'libopus (ffmpeg), mono 16 kHz, voip' : 'ffmpeg ausente: Opus pela conta teórica (bitrate/8)'}. Tempo = ffmpeg em Node (inclui subir o processo); NÃO é o WebCodecs no aparelho (tarefa 1.3 [R]).`,
)
out.push('')
out.push('| Formato | Bytes/s | Tempo médio por clipe (ms) | Clipe de 3 s (KB) |')
out.push('| --- | ---: | ---: | ---: |')
out.push(`| WAV 16 kHz/16 bits | ${bps(total.wav)} | n/a | ${((bps(total.wav) * 3) / 1024).toFixed(1)} |`)
for (const b of BITRATES) {
  const tempo = temFfmpeg ? (total[`t${b}`] / arquivos.length).toFixed(0) : 'n/a'
  out.push(`| Opus ${b} kbps | ${bps(total[`o${b}`])} | ${tempo} | ${((bps(total[`o${b}`]) * 3) / 1024).toFixed(1)} |`)
}
out.push('')
const ok24 = bps(total.o24) <= TETO_24K_BYTES_POR_S
out.push(
  `Critério da tarefa 1.1: Opus 24 kbps <= 4 KB/s: ${ok24 ? 'ATENDIDO' : 'NÃO ATENDIDO'} (${bps(total.o24)} B/s).`,
)
out.push('')
out.push('## Linha de base de "bytes baixados para tocar a fala original"')
out.push('')
out.push(
  'Hoje (`lib/audioDaSessao.ts`) tocar 3 s baixa o áudio INTEIRO da sessão. Estimativa pela proposta, NÃO medida em produção:',
)
out.push(
  'uma reunião de 40 min em Ogg Opus a ~32 kbps (~4 KB/s) pesa ~9,6 MB, baixados uma vez para os cartões da reunião.',
)
out.push(
  `Com clipes de 24 kbps, 20 cartões de ~3,3 s pesam ~${((bps(total.o24) * 3.3 * 20) / 1024 / 1024).toFixed(2)} MB.`,
)
out.push('A linha de base real (bytes por toque, em sessão de produção) fica para a sessão de bancada [B].')
const texto = out.join('\n') + '\n'
console.log(texto)
if (process.argv.includes('--escrever')) {
  const alvo = `docs/auditoria/${hoje}-clipe-do-cartao.md`
  writeFileSync(alvo, texto)
  console.log(`escrito: ${alvo}`)
}
if (!ok24) process.exit(1)
