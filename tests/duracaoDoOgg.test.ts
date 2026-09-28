/**
 * DURAÇÃO DO OGG OPUS NO SERVIDOR — o STT de nuvem passou a receber Opus (~24 kbps) em vez de WAV
 * de 16 bits (~256 kbps), e a duração que vira COTA e CUSTO continua medida AQUI, nunca declarada
 * pelo cliente.
 *
 * O que estes testes prendem:
 *  - a duração sai do granule final menos o pre-skip, sobre bytes Opus DE VERDADE (fixture gerada
 *    pelo libopus) e sobre o que o nosso empacotador produz;
 *  - o granule é escrito pelo cliente, então ele é CONFERIDO contra a soma das amostras que os
 *    pacotes carregam (o TOC de cada pacote, RFC 6716 §3.1): 30 s de pacotes com granule de 1 s é
 *    mentira, e mentira em número que vira cobrança é 415 — a mesma regra do `byteRate` do WAV;
 *  - WAV e Ogg da MESMA duração custam o mesmo na cota do assinante e no orçamento do dono;
 *  - contêiner malformado (magic, OpusHead, OpusTags, CRC, lixo no fim, dois fluxos) é recusado.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  arquivoDoAudio,
  avaliarAudioFaturavel,
  duracaoDoAudio,
  duracaoDoOggOpus,
  segundosDeAudioDoUsuario,
  segundosFaturaveis,
  TETO_DE_DURACAO_S,
} from '../server/lib/duracaoDeAudio'
import { comGranuleFinal, oggOpus, paginasDe, PRE_SKIP, recalcularCrc } from './harness/ogg'
import { wavPcm } from './harness/wav'

/**
 * 3,5 s de tom a 440 Hz, 16 kHz mono, libopus 24 kbps, 15 KB. Fora de `fixtures/audio/` (o corpus de
 * avaliação, ignorado pelo git). Gerado com:
 *   ffmpeg -f lavfi -i "sine=frequency=440:sample_rate=16000:duration=3.5" -ac 1 -c:a libopus \
 *     -b:a 24k -map_metadata -1 -fflags +bitexact -flags:a +bitexact tom-3500ms-24kbps.ogg
 */
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'ogg', 'tom-3500ms-24kbps.ogg'))

describe('duracaoDoOggOpus — bytes Opus reais', () => {
  it('fixture do libopus: 3,5 s pelo granule final menos o pre-skip', () => {
    expect(FIXTURE.subarray(0, 4).toString('ascii')).toBe('OggS')
    expect(duracaoDoOggOpus(FIXTURE)).toBeCloseTo(3.5, 3)
    expect(duracaoDoAudio(FIXTURE)).toBeCloseTo(3.5, 3)
  })

  it('o que o nosso empacotador produz (pacotes de 20 ms, granule final aparado)', () => {
    expect(duracaoDoOggOpus(oggOpus(6))).toBeCloseTo(6, 6)
    expect(duracaoDoOggOpus(oggOpus(12.31))).toBeCloseTo(12.31, 6)
    // O fim aparado no meio do último quadro (enchimento do codificador) continua coerente.
    expect(duracaoDoOggOpus(oggOpus(0.305))).toBeCloseTo(0.305, 6)
  })

  it('WAV não é Ogg, e vice-versa: cada leitor recusa o formato do outro', () => {
    expect(duracaoDoOggOpus(wavPcm(2))).toBeNull()
    expect(duracaoDoAudio(wavPcm(2))).toBeCloseTo(2, 3)
  })
})

describe('duracaoDoOggOpus — o granule é do cliente, então é CONFERIDO', () => {
  it('granule encolhido (30 s de pacotes declarados como 1 s) → null', () => {
    expect(duracaoDoOggOpus(oggOpus(30, { totalAmostras48k: 48_000 }))).toBeNull()
  })

  it('granule inflado além dos pacotes → null', () => {
    const b = oggOpus(2)
    expect(duracaoDoOggOpus(comGranuleFinal(b, BigInt(PRE_SKIP + 10 * 48_000)))).toBeNull()
  })

  it('granule abaixo do pre-skip (duração negativa) → null', () => {
    expect(duracaoDoOggOpus(comGranuleFinal(oggOpus(1), 100n))).toBeNull()
  })

  it('pacote com TOC de 120 ms não passa como 20 ms: a soma é pelo TOC, não pela contagem', () => {
    // config 3 = SILK 60 ms, código 1 (dois quadros) → 120 ms por pacote; 50 pacotes = 6 s, mas o
    // granule diz 1 s (o que valeria se fossem 20 ms cada).
    const pacotes120 = oggOpus(1, { toc: (3 << 3) | 1 })
    expect(duracaoDoOggOpus(pacotes120)).toBeNull()
  })
})

describe('duracaoDoOggOpus — contêiner malformado', () => {
  it('sem o magic OggS → null', () => {
    const b = Buffer.from(oggOpus(1))
    b.write('OggX', 0, 'ascii')
    expect(duracaoDoOggOpus(b)).toBeNull()
    expect(duracaoDoOggOpus(Buffer.from('OggS mas nada depois disso'))).toBeNull()
    expect(duracaoDoOggOpus(Buffer.alloc(10))).toBeNull()
  })

  it('primeiro pacote não é OpusHead (ex.: Ogg Vorbis) → null', () => {
    const b = Buffer.from(oggOpus(1))
    b.write('VorbHead', 28, 'ascii') // 27 de cabeçalho + 1 segmento
    recalcularCrc(b, 0)
    expect(duracaoDoOggOpus(b)).toBeNull()
  })

  it('OpusHead com canais fora de 1–2 → null', () => {
    expect(duracaoDoOggOpus(oggOpus(1, { canais: 0 }))).toBeNull()
    expect(duracaoDoOggOpus(oggOpus(1, { canais: 6 }))).toBeNull()
  })

  it('sem OpusTags na segunda página → null', () => {
    const b = Buffer.from(oggOpus(1))
    const [, segunda] = paginasDe(b)
    b.write('OpusTagz', segunda + 28, 'ascii')
    recalcularCrc(b, segunda)
    expect(duracaoDoOggOpus(b)).toBeNull()
  })

  it('CRC que não bate (um byte do áudio trocado) → null', () => {
    const b = Buffer.from(oggOpus(1))
    b[b.length - 2] ^= 0xff
    expect(duracaoDoOggOpus(b)).toBeNull()
  })

  it('lixo depois da última página → null (o provedor recebe o arquivo inteiro)', () => {
    expect(duracaoDoOggOpus(Buffer.concat([oggOpus(1), Buffer.alloc(4096, 1)]))).toBeNull()
  })

  it('arquivo cortado no meio de uma página → null', () => {
    const b = oggOpus(2)
    expect(duracaoDoOggOpus(b.subarray(0, b.length - 10))).toBeNull()
  })

  it('dois fluxos lógicos encadeados (duas séries) → null', () => {
    expect(duracaoDoOggOpus(Buffer.concat([oggOpus(1, { serie: 1 }), oggOpus(20, { serie: 2 })]))).toBeNull()
  })

  it('só os cabeçalhos, nenhum pacote de áudio → null', () => {
    expect(duracaoDoOggOpus(oggOpus(0))).toBeNull()
  })
})

describe('cobrança: WAV e Ogg da mesma duração custam o mesmo', () => {
  it.each([0.4, 3.5, 6, 12.3, 30, 60])('%s s', (s) => {
    const wav = wavPcm(s)
    const ogg = oggOpus(s)
    expect(segundosDeAudioDoUsuario(ogg)).toBe(segundosDeAudioDoUsuario(wav))
    expect(segundosFaturaveis(ogg)).toBe(segundosFaturaveis(wav))
    expect(avaliarAudioFaturavel(ogg)).toEqual(avaliarAudioFaturavel(wav))
  })

  it('fixture real: 4 s na cota (arredonda para cima), 10 s no custo do dono (mínimo da Groq)', () => {
    expect(avaliarAudioFaturavel(FIXTURE)).toEqual({ ok: true, segundosDoUsuario: 4 })
    expect(segundosFaturaveis(FIXTURE)).toBe(10)
  })

  it('o teto por requisição vale para o Ogg também', () => {
    expect(avaliarAudioFaturavel(oggOpus(TETO_DE_DURACAO_S + 1))).toMatchObject({
      ok: false,
      status: 413,
      code: 'audio_longo_demais',
    })
  })

  it('Ogg forjado é 415 audio_ilegivel, como o WAV forjado', () => {
    expect(avaliarAudioFaturavel(oggOpus(30, { totalAmostras48k: 48_000 }))).toMatchObject({
      ok: false,
      status: 415,
      code: 'audio_ilegivel',
    })
  })
})

describe('arquivoDoAudio — o que vai no multipart do provedor', () => {
  it('Ogg vai como audio/ogg + audio.ogg; WAV (e o resto, no BYOK) como antes', () => {
    expect(arquivoDoAudio(FIXTURE)).toEqual({ tipo: 'audio/ogg', nome: 'audio.ogg' })
    expect(arquivoDoAudio(wavPcm(1))).toEqual({ tipo: 'audio/wav', nome: 'audio.wav' })
    expect(arquivoDoAudio(Buffer.from('qualquer coisa'))).toEqual({ tipo: 'audio/wav', nome: 'audio.wav' })
  })
})
