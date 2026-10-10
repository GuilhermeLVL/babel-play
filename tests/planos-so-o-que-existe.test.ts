/**
 * AS TELAS DE PLANOS PROMETEM SÓ O QUE EXISTE (Fase 2 do lançamento).
 *
 * As telas de venda prometiam três coisas que o app hospedado não entrega:
 *   - "Importar do YouTube" no Pro — no modo hospedado a rota responde 403 (o yt-dlp roda no
 *     servidor, e só o self-host o libera);
 *   - "Nada para baixar: roda no servidor" — o Whisper e o tradutor locais continuam sendo a reserva
 *     quando a nuvem falha ou a cota acaba, e o app os prepara;
 *   - "Download menor" — o número não foi medido para o plano com transcrição de nuvem.
 * E não pode aparecer "ao vivo premium" (Soniox/Deepgram) enquanto isso não existir.
 *
 * O teste lê o TEXTO das telas (comentários fora, como em `precos-de-um-lugar-so.test.ts`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from '../src/core/planos'

const TELAS = [
  'src/components/views/Planos.tsx',
  'src/components/views/planos/dados.ts',
  'src/components/views/planos/Checkout.tsx',
  'src/components/views/planos/Cancelar.tsx',
  'src/components/views/planos/Assinado.tsx',
  'src/components/CardDePlanos.tsx',
]

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('nenhuma promessa que o app hospedado não cumpre', () => {
  for (const arquivo of TELAS) {
    it(arquivo.split('/').pop()!, () => {
      const texto = semComentarios(readFileSync(arquivo, 'utf8'))
      for (const proibida of [
        /ao vivo premium/i,
        /nada para baixar/i,
        /download menor/i,
        /youtube/i,
        /soniox|deepgram/i,
      ]) {
        expect(texto, `${arquivo} promete ${proibida}`).not.toMatch(proibida)
      }
    })
  }
})

describe('as horas de transcrição vêm da matriz', () => {
  it('Premium 20 h no mês e 2 h no dia (o uso justo); Essencial 5 h; Grátis nenhuma', () => {
    expect(horasDeTranscricao('premium')).toBe(20)
    expect(horasDeTranscricao('essencial')).toBe(5)
    expect(horasDeTranscricao('aovivo')).toBe(20)
    expect(horasDoUsoJusto('premium')).toBe(2)
    expect(horasDoUsoJusto('free')).toBeNull()
    expect(horasDeTranscricao('free')).toBe(0)
    expect(horasDeTranscricao('selfhost')).toBeNull()
  })

  it('a tela de planos escreve as horas pela função, não à mão', () => {
    const dados = semComentarios(readFileSync('src/components/views/planos/dados.ts', 'utf8'))
    expect(dados).toContain('horasDeTranscricao(')
    expect(dados).not.toMatch(/\b(2|5|10|20|40)\s*h\b/)
    expect(PLAN_MATRIX.premium.quotas.sttSegundosMes).toBe(72_000)
  })
})
