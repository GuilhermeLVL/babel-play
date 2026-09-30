/**
 * OS PROVEDORES DA VOZ NATURAL (E4 da Fase E): o pedido de cada modelo, a leitura do áudio de volta, o
 * registro que declara a função `tts` e o preço por caractere.
 *
 * E A GARANTIA DE QUE NÃO HÁ CLONAGEM DE VOZ: os três modelos aceitam uma amostra de áudio para
 * imitar alguém. Nenhum pedido que sai daqui leva um campo de áudio de referência ou de voz criada —
 * nem quando a "voz" pedida é um nome qualquer, nem quando alguém tenta enfiar um campo a mais.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  CAMPOS_DE_CLONAGEM,
  CHAVES_PERMITIDAS,
  conferirSemClonagem,
  corpoDoPedidoDeVoz,
  falaOIdioma,
  lerAudioDaVoz,
  MODELO_DE_VOZ_PADRAO,
  MODELOS_DE_VOZ,
  montarPedidoDeVoz,
  pernasDeVoz,
  TETO_DE_BYTES_DA_VOZ,
} from '../server/ai/provedoresDeVoz'
import { esquecerRegistro, type Provedor, validarRegistro } from '../server/ai/registroDeProvedores'
import { custoDeTts } from '../server/lib/orcamentoDeIa'

const deepinfra = (model: string): Provedor => ({
  rotulo: 'tts-primario',
  base: 'https://api.deepinfra.com/v1/openai',
  apiKey: 'chave-falsa',
  model,
  fornecedor: 'deepinfra',
  formato: 'openai',
})
const google: Provedor = {
  rotulo: 'tts-reserva',
  base: 'https://texttospeech.googleapis.com/v1',
  apiKey: 'chave-google-falsa',
  model: 'chirp3-hd',
  fornecedor: 'google-tts',
  formato: 'google-tts',
}
const PEDIDO = { texto: 'Onde fica a estação?', idioma: 'pt', bcp47: 'pt-BR' }

/** Todas as chaves de um objeto, em qualquer nível. */
function chaves(v: unknown): string[] {
  if (!v || typeof v !== 'object') return []
  return Object.entries(v as Record<string, unknown>).flatMap(([k, filho]) => [k, ...chaves(filho)])
}

afterEach(() => {
  delete process.env.IA_PROVEDORES
  delete process.env.DEEPINFRA_API_KEY
  delete process.env.GOOGLE_TTS_API_KEY
  esquecerRegistro()
})

describe('o pedido de cada modelo', () => {
  it('Chatterbox (o padrão): /audio/speech da DeepInfra, mp3, o idioma no extra_body e SEM campo de voz', () => {
    const { url, init } = montarPedidoDeVoz(deepinfra(MODELO_DE_VOZ_PADRAO), {
      ...PEDIDO,
      voz: 'Vivian',
      velocidade: 1.2,
    })
    expect(url).toBe('https://api.deepinfra.com/v1/openai/audio/speech')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave-falsa')
    expect(init.redirect).toBe('manual')
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'ResembleAI/chatterbox-multilingual',
      input: 'Onde fica a estação?',
      response_format: 'mp3',
      extra_body: { language: 'pt' },
    })
  })

  it('Qwen3-TTS (opção): uma voz PRONTA da lista, a velocidade, o idioma detectado pelo modelo', () => {
    const corpo = corpoDoPedidoDeVoz(deepinfra('Qwen/Qwen3-TTS'), { ...PEDIDO, voz: 'Serena', velocidade: 1.25 })
    expect(corpo).toEqual({
      model: 'Qwen/Qwen3-TTS',
      input: 'Onde fica a estação?',
      response_format: 'mp3',
      voice: 'Serena',
      speed: 1.25,
    })
    // Voz fora da lista: a padrão do modelo — nunca o texto pedido.
    expect(corpoDoPedidoDeVoz(deepinfra('Qwen/Qwen3-TTS'), { ...PEDIDO, voz: 'minha_voz' })).toMatchObject({
      voice: 'Vivian',
    })
  })

  it('Chirp 3 HD (opção): text:synthesize do Google, a chave no cabeçalho, o nome da voz com a região', () => {
    const { url, init } = montarPedidoDeVoz(google, { ...PEDIDO, voz: 'Charon' })
    expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize')
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('chave-google-falsa')
    expect(url).not.toContain('chave')
    expect(JSON.parse(String(init.body))).toEqual({
      input: { text: 'Onde fica a estação?' },
      voice: { languageCode: 'pt-BR', name: 'pt-BR-Chirp3-HD-Charon' },
      audioConfig: { audioEncoding: 'MP3' },
    })
  })

  it('modelo fora do catálogo: o pedido mínimo do formato, sem voz nem idioma inventados', () => {
    expect(corpoDoPedidoDeVoz(deepinfra('outro/modelo-tts'), { ...PEDIDO, voz: 'Kore' })).toEqual({
      model: 'outro/modelo-tts',
      input: 'Onde fica a estação?',
      response_format: 'mp3',
    })
  })

  it('o idioma: o catálogo diz quem fala o quê; modelo desconhecido fica com o registro', () => {
    expect(falaOIdioma(deepinfra(MODELO_DE_VOZ_PADRAO), 'pt')).toBe(true)
    expect(falaOIdioma(deepinfra('Qwen/Qwen3-TTS'), 'ar')).toBe(false)
    expect(falaOIdioma(deepinfra('outro/modelo-tts'), 'xx')).toBe(true)
  })
})

describe('sem clonagem de voz', () => {
  const vozesHostis = [undefined, 'voice_id', 'audio_prompt', 'clone', 'x'.repeat(40), 'Vivian', 'Kore']

  it('nenhum pedido de nenhum modelo do catálogo leva campo de clonagem, qualquer que seja a voz pedida', () => {
    const pernas = [
      ...Object.keys(MODELOS_DE_VOZ)
        .filter((m) => m !== 'chirp3-hd')
        .map(deepinfra),
      google,
    ]
    for (const perna of pernas) {
      for (const voz of vozesHostis) {
        const { init } = montarPedidoDeVoz(perna, { ...PEDIDO, ...(voz ? { voz } : {}) })
        const todas = chaves(JSON.parse(String(init.body)))
        expect(
          todas.filter((k) => CAMPOS_DE_CLONAGEM.includes(k)),
          `${perna.model} com voz ${voz}`,
        ).toEqual([])
      }
    }
  })

  it('a conferência recusa campo de clonagem e qualquer campo fora da forma do formato', () => {
    expect(() =>
      conferirSemClonagem({ model: 'm', input: 'x', audio_prompt: 'data:…' }, CHAVES_PERMITIDAS.openai),
    ).toThrow(/clonagem/)
    expect(() =>
      conferirSemClonagem(
        { model: 'm', extra_body: { language: 'pt', reference_audio: 'x' } },
        CHAVES_PERMITIDAS.openai,
      ),
    ).toThrow(/clonagem/)
    expect(() => conferirSemClonagem({ model: 'm', exaggeration: 0.5 }, CHAVES_PERMITIDAS.openai)).toThrow(/fora/)
    expect(() =>
      conferirSemClonagem({ voice: { languageCode: 'pt-BR', voiceClone: {} } }, CHAVES_PERMITIDAS['google-tts']),
    ).toThrow(/fora/)
  })
})

describe('o áudio de volta', () => {
  const resposta = (corpo: BodyInit, tipo: string) =>
    new Response(corpo, { status: 200, headers: { 'content-type': tipo } })

  it('bytes crus (audio/mpeg) da DeepInfra', async () => {
    const a = await lerAudioDaVoz({ formato: 'openai' }, resposta(new Uint8Array([1, 2, 3]), 'audio/mpeg'))
    expect(a).toEqual({ bytes: Buffer.from([1, 2, 3]), tipo: 'audio/mpeg' })
  })

  it('JSON com o áudio em base64 (a rota nativa embrulha assim) também serve', async () => {
    const b64 = Buffer.from([9, 8, 7]).toString('base64')
    const a = await lerAudioDaVoz(
      { formato: 'openai' },
      resposta(JSON.stringify({ audio: `data:audio/wav;base64,${b64}` }), 'application/json'),
    )
    expect(a).toEqual({ bytes: Buffer.from([9, 8, 7]), tipo: 'audio/wav' })
  })

  it('Google: audioContent em base64', async () => {
    const b64 = Buffer.from([5, 5]).toString('base64')
    const a = await lerAudioDaVoz(
      { formato: 'google-tts' },
      resposta(JSON.stringify({ audioContent: b64 }), 'application/json'),
    )
    expect(a).toEqual({ bytes: Buffer.from([5, 5]), tipo: 'audio/mpeg' })
  })

  it('sem áudio, ou áudio grande demais: null', async () => {
    expect(await lerAudioDaVoz({ formato: 'openai' }, resposta('{"erro":1}', 'application/json'))).toBeNull()
    expect(await lerAudioDaVoz({ formato: 'openai' }, resposta('<html>', 'text/html'))).toBeNull()
    const grande = new Uint8Array(TETO_DE_BYTES_DA_VOZ + 1)
    expect(await lerAudioDaVoz({ formato: 'openai' }, resposta(grande, 'audio/mpeg'))).toBeNull()
  })
})

describe('o registro declara a voz', () => {
  const provedor = (extra: Record<string, unknown>) => ({
    provedores: [
      {
        id: 'deepinfra',
        formato: 'openai',
        base: 'https://api.deepinfra.com/v1/openai',
        chave: 'DEEPINFRA_API_KEY',
        retencao: 'zdr',
        modelos: [{ id: MODELO_DE_VOZ_PADRAO, funcoes: ['tts'], preco: { milhaoDeCaracteres: 1 } }],
        ...extra,
      },
    ],
  })

  it('a função tts e o preço por caractere são aceitos; a perna sai na ordem do registro', () => {
    expect(validarRegistro(provedor({}), { producao: true }).ok).toBe(true)
    process.env.IA_PROVEDORES = JSON.stringify(provedor({}))
    process.env.DEEPINFRA_API_KEY = 'k'
    expect(pernasDeVoz().map((p) => [p.rotulo, p.model, p.preco])).toEqual([
      ['tts-primario', MODELO_DE_VOZ_PADRAO, { milhaoDeCaracteres: 1 }],
    ])
  })

  it('sem a chave no ambiente, nenhuma perna (a rota responde 501)', () => {
    process.env.IA_PROVEDORES = JSON.stringify(provedor({}))
    expect(pernasDeVoz()).toEqual([])
  })

  it('recusas: voz no formato cloudflare, google-tts fazendo tradução, nível na voz', () => {
    const cloudflare = validarRegistro(
      provedor({
        formato: 'cloudflare',
        base: undefined,
        conta: 'CLOUDFLARE_ACCOUNT_ID',
        chave: 'CLOUDFLARE_API_TOKEN',
      }),
      { producao: false },
    )
    expect(cloudflare.ok).toBe(false)
    const googleTraduz = validarRegistro(
      {
        provedores: [
          {
            id: 'google-tts',
            formato: 'google-tts',
            base: 'https://texttospeech.googleapis.com/v1',
            chave: 'GOOGLE_TTS_API_KEY',
            retencao: 'desconhecida',
            modelos: [{ id: 'chirp3-hd', funcoes: ['tts', 'traducao'] }],
          },
        ],
      },
      { producao: false },
    )
    expect(googleTraduz.ok === false && googleTraduz.erros.join(' ')).toMatch(/google-tts só atende a voz/)
    const nivel = validarRegistro(
      provedor({ modelos: [{ id: MODELO_DE_VOZ_PADRAO, funcoes: ['tts'], niveis: ['nuance'] }] }),
      { producao: false },
    )
    expect(nivel.ok).toBe(false)
  })

  it('em produção, a voz sem retenção zero declarada é recusada como qualquer provedor', () => {
    expect(validarRegistro(provedor({ retencao: 'desconhecida' }), { producao: true }).ok).toBe(false)
  })
})

describe('o custo da voz', () => {
  it('por caractere: 600 caracteres no Chatterbox = US$ 0,0006; sem preço, o da voz mais cara', () => {
    expect(custoDeTts(MODELO_DE_VOZ_PADRAO, 600, { fornecedor: 'deepinfra' })).toBeCloseTo(0.0006, 10)
    expect(custoDeTts('Qwen/Qwen3-TTS', 1_000_000, { fornecedor: 'deepinfra' })).toBeCloseTo(20, 6)
    expect(custoDeTts('modelo-sem-preco', 1_000_000)).toBeCloseTo(30, 6)
    expect(custoDeTts('x', 100, { preco: { milhaoDeCaracteres: 2 } })).toBeCloseTo(0.0002, 10)
  })
})
