/**
 * SONDA DO APARELHO — medida UMA vez por aparelho, guardada no localStorage, revalidada por versão
 * do app, por impressão dos sinais estáveis e a cada 30 dias (harness adaptativo §2,
 * `openspec/audits/2026-09-28-eficiencia-ia/harness-adaptativo.md`).
 *
 * Tudo aqui roda com globais FALSOS injetados (`escopo`) e um armazém em memória: nenhuma API nova
 * (Translator, SpeechRecognition.available, getBattery) existe no Node, e é exatamente o caso
 * "ausente" que mais importa — a sonda nunca pode lançar nem travar a captura.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InfoDoAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import type { PontuacaoDoBenchmark } from '../src/lib/dispositivo/benchmark'
import {
  benchmarkValido,
  CHAVE_DA_SONDA,
  comPrazo,
  type DependenciasDaSonda,
  disponibilidadeDoSttNoAparelho,
  disponibilidadeDoTradutor,
  ehIos,
  impressaoDoAparelho,
  lembrarWebSpeechComTrilha,
  lerRegistro,
  modeloProibido,
  obterSondaDoAparelho,
  proibirModelo,
  type RegistroDoAparelho,
  registroValido,
  sondaGuardada,
  sondarAparelho,
  sondarEMedir,
  temPonteNativa,
  TRINTA_DIAS_MS,
  webSpeechComTrilhaLembrada,
} from '../src/lib/dispositivo/sonda'

afterEach(() => {
  vi.useRealTimers()
})

function armazemFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial))
  return {
    dados,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  }
}

const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0'
const GPU: InfoDoAdaptadorWebGpu = {
  shaderF16: true,
  limites: { maxStorageBufferBindingSize: 2147483644, maxBufferSize: 4294967296 },
  fornecedor: 'amd',
  arquitetura: 'rdna-2',
}

/** Um Chrome desktop com as APIs novas todas respondendo. */
function escopoCompleto(extra: Record<string, unknown> = {}) {
  return {
    navigator: {
      userAgent: UA_WIN,
      deviceMemory: 8,
      hardwareConcurrency: 16,
      maxTouchPoints: 0,
      storage: { estimate: async () => ({ quota: 100 * 1048576, usage: 10 * 1048576 }) },
      getBattery: async () => ({}),
    },
    SpeechRecognition: {
      available: async ({ langs }: { langs: string[] }) => (langs[0] === 'en-US' ? 'available' : 'downloadable'),
    },
    Translator: {
      availability: async ({ sourceLanguage }: { sourceLanguage: string }) =>
        sourceLanguage === 'en' ? 'available' : 'downloadable',
    },
    PressureObserver: class {},
    ...extra,
  }
}

function dep(over: Partial<DependenciasDaSonda> = {}): DependenciasDaSonda {
  return {
    escopo: escopoCompleto(),
    armazem: armazemFalso(),
    agora: () => 1_000_000,
    versaoDoApp: '0.1.0+abc1234',
    prazoMs: 50,
    infoDoAdaptador: async () => GPU,
    ...over,
  }
}

describe('impressaoDoAparelho (pura)', () => {
  const sinais = { userAgent: UA_WIN, fornecedor: 'amd', arquitetura: 'rdna-2', memoriaGb: 8, nucleos: 16 }

  it('estável: os mesmos sinais dão a mesma impressão', () => {
    expect(impressaoDoAparelho(sinais)).toBe(impressaoDoAparelho({ ...sinais }))
    expect(impressaoDoAparelho(sinais)).toMatch(/^[0-9a-f]{8}$/)
  })

  it.each([
    ['UA', { userAgent: UA_WIN + ' Edg/150' }],
    ['fornecedor', { fornecedor: 'nvidia' }],
    ['arquitetura', { arquitetura: 'ampere' }],
    ['memória', { memoriaGb: 4 }],
    ['núcleos', { nucleos: 8 }],
  ])('muda quando muda o/a %s', (_n, troca) => {
    expect(impressaoDoAparelho({ ...sinais, ...troca })).not.toBe(impressaoDoAparelho(sinais))
  })
})

describe('registroValido (revalidação)', () => {
  const reg = {
    esquema: 1,
    versaoDoApp: 'v1',
    impressao: 'abcd0123',
    medidaEm: 0,
    sinais: {} as never,
    benchmark: null,
    modelosProibidos: [],
    motivosDaProibicao: {},
  } as RegistroDoAparelho
  const crit = { versaoDoApp: 'v1', impressao: 'abcd0123', agora: 1000 }

  it('mesma versão, mesma impressão, dentro de 30 dias: válido', () => {
    expect(registroValido(reg, crit)).toBe(true)
  })
  it('versão nova do app: revalida', () => {
    expect(registroValido(reg, { ...crit, versaoDoApp: 'v2' })).toBe(false)
  })
  it('outra impressão (navegador atualizado, outra GPU): revalida', () => {
    expect(registroValido(reg, { ...crit, impressao: 'ffff0000' })).toBe(false)
  })
  it('30 dias depois: revalida', () => {
    expect(registroValido(reg, { ...crit, agora: TRINTA_DIAS_MS })).toBe(false)
    expect(registroValido(reg, { ...crit, agora: TRINTA_DIAS_MS - 1 })).toBe(true)
  })
  it('relógio que voltou no tempo: revalida (não confia no futuro)', () => {
    expect(registroValido({ ...reg, medidaEm: 5000 }, crit)).toBe(false)
  })
  it('registro só de proibições (sem sinais): revalida', () => {
    expect(registroValido({ ...reg, sinais: null }, crit)).toBe(false)
  })
})

describe('lerRegistro (armazém)', () => {
  it('JSON quebrado, forma errada ou armazém que lança: null, sem propagar', () => {
    expect(lerRegistro(armazemFalso({ [CHAVE_DA_SONDA]: '{' }))).toBeNull()
    expect(lerRegistro(armazemFalso({ [CHAVE_DA_SONDA]: '{"esquema":99}' }))).toBeNull()
    const quebrado = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => undefined,
    }
    expect(lerRegistro(quebrado)).toBeNull()
    expect(lerRegistro(null)).toBeNull()
  })
})

describe('detecção de recurso com globais falsos', () => {
  it('SpeechRecognition.available ausente (Firefox, Chrome antigo): null', async () => {
    expect(await disponibilidadeDoSttNoAparelho('pt-BR', {}, 50)).toBeNull()
    expect(await disponibilidadeDoSttNoAparelho('pt-BR', { SpeechRecognition: function () {} }, 50)).toBeNull()
  })

  it('pede processLocally e o idioma certo; aceita o prefixo webkit', async () => {
    const available = vi.fn(async () => 'available')
    const r = await disponibilidadeDoSttNoAparelho('pt-BR', { webkitSpeechRecognition: { available } }, 50)
    expect(r).toBe('available')
    expect(available).toHaveBeenCalledWith({ langs: ['pt-BR'], processLocally: true })
  })

  it('navegador sob automação (navigator.webdriver): não pergunta — o Chromium headless cai', async () => {
    const available = vi.fn(async () => 'available')
    const escopo = { SpeechRecognition: { available }, navigator: { webdriver: true } }
    expect(await disponibilidadeDoSttNoAparelho('pt-BR', escopo, 50)).toBeNull()
    expect(available).not.toHaveBeenCalled()
  })

  it('available que lança ou devolve lixo: null', async () => {
    const lanca = {
      SpeechRecognition: {
        available: () => {
          throw new Error('x')
        },
      },
    }
    expect(await disponibilidadeDoSttNoAparelho('en-US', lanca, 50)).toBeNull()
    expect(
      await disponibilidadeDoSttNoAparelho('en-US', { SpeechRecognition: { available: async () => 'talvez' } }, 50),
    ).toBeNull()
  })

  it('available que não responde: null no prazo', async () => {
    vi.useFakeTimers()
    const r = disponibilidadeDoSttNoAparelho(
      'en-US',
      { SpeechRecognition: { available: () => new Promise(() => {}) } },
      300,
    )
    await vi.advanceTimersByTimeAsync(301)
    expect(await r).toBeNull()
  })

  it('Translator ausente: null; presente: pergunta en→pt com os nomes da API', async () => {
    expect(await disponibilidadeDoTradutor('en', 'pt', {}, 50)).toBeNull()
    const availability = vi.fn(async () => 'downloadable')
    expect(await disponibilidadeDoTradutor('en', 'pt', { Translator: { availability } }, 50)).toBe('downloadable')
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'pt' })
  })

  it('Translator que rejeita: null', async () => {
    const t = { Translator: { availability: async () => Promise.reject(new Error('NotAllowed')) } }
    expect(await disponibilidadeDoTradutor('pt', 'en', t, 50)).toBeNull()
  })

  it('comPrazo: nunca lança, nunca espera além do prazo', async () => {
    expect(await comPrazo(() => 7, 50)).toBe(7)
    expect(
      await comPrazo(() => {
        throw new Error('x')
      }, 50),
    ).toBeNull()
  })

  it('iOS: iPhone/iPad pelo UA e o iPad que se diz Mac (toque > 1)', () => {
    expect(ehIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
    expect(ehIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(ehIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(ehIos(UA_WIN, 0)).toBe(false)
  })

  it('ponte nativa: só quando o Capacitor diz que é nativo; getter que lança não derruba', () => {
    expect(temPonteNativa({})).toBe(false)
    expect(temPonteNativa({ Capacitor: { isNativePlatform: () => true } })).toBe(true)
    expect(temPonteNativa({ Capacitor: { isNativePlatform: () => false } })).toBe(false)
    expect(
      temPonteNativa({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error('x')
          },
        },
      }),
    ).toBe(false)
  })
})

describe('sondarAparelho', () => {
  it('junta todos os sinais de um Chrome desktop completo', async () => {
    const s = await sondarAparelho(dep())
    expect(s.sinais).toEqual({
      webGpu: GPU,
      sttNoAparelho: { ptBR: 'downloadable', en: 'available' },
      tradutorNativo: { enPt: 'available', ptEn: 'downloadable' },
      armazenamento: { cotaMb: 100, usoMb: 10 },
      nativo: false,
      iOS: false,
      bateria: true,
      pressao: true,
    })
    expect(s.versaoDoApp).toBe('0.1.0+abc1234')
    expect(s.medidaEm).toBe(1_000_000)
    expect(s.modelosProibidos).toEqual([])
  })

  it('navegador sem nenhuma API nova: tudo null/false, sem lançar', async () => {
    const s = await sondarAparelho(
      dep({ escopo: { navigator: { userAgent: 'x' } }, infoDoAdaptador: async () => null }),
    )
    expect(s.sinais).toEqual({
      webGpu: null,
      sttNoAparelho: { ptBR: null, en: null },
      tradutorNativo: { enPt: null, ptEn: null },
      armazenamento: null,
      nativo: false,
      iOS: false,
      bateria: false,
      pressao: false,
    })
  })
})

describe('obterSondaDoAparelho (persistência)', () => {
  it('primeira vez: mede e grava; segunda: lê sem medir de novo', async () => {
    const d = dep()
    const available = vi.fn(async () => 'available')
    ;(d.escopo as { SpeechRecognition: unknown }).SpeechRecognition = { available }
    const a = await obterSondaDoAparelho(d)
    expect(d.armazem!.getItem(CHAVE_DA_SONDA)).not.toBeNull()
    const b = await obterSondaDoAparelho(d)
    expect(b).toEqual(a)
    expect(available).toHaveBeenCalledTimes(2) // pt-BR e en-US, só na primeira
  })

  it('versão nova: mede de novo, mas MANTÉM as proibições e o benchmark do mesmo aparelho', async () => {
    const armazem = armazemFalso()
    const bench: PontuacaoDoBenchmark = {
      pontuacaoWasm: 1,
      pontuacaoWebgpu: 9,
      melhor: 'webgpu',
      medidoEm: 1_000_000,
      duracaoMs: 900,
    }
    await obterSondaDoAparelho(dep({ armazem }))
    await proibirModelo('whisper-small', 'OOM no WebGPU', dep({ armazem }))
    const reg = JSON.parse(armazem.getItem(CHAVE_DA_SONDA)!)
    armazem.setItem(CHAVE_DA_SONDA, JSON.stringify({ ...reg, benchmark: bench }))
    const nova = await obterSondaDoAparelho(dep({ armazem, versaoDoApp: '0.2.0' }))
    expect(nova.versaoDoApp).toBe('0.2.0')
    expect(nova.modelosProibidos).toEqual(['whisper-small'])
    expect(nova.motivosDaProibicao['whisper-small']).toBe('OOM no WebGPU')
    expect(nova.benchmark).toEqual(bench)
  })

  it('outro aparelho (outra GPU): começa do zero', async () => {
    const armazem = armazemFalso()
    await proibirModelo('whisper-small', 'OOM', dep({ armazem }))
    const outra = await obterSondaDoAparelho(
      dep({ armazem, infoDoAdaptador: async () => ({ ...GPU, fornecedor: 'nvidia' }) }),
    )
    expect(outra.modelosProibidos).toEqual([])
  })

  it('armazém que lança na escrita: devolve a medida mesmo assim', async () => {
    const armazem = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const s = await obterSondaDoAparelho(dep({ armazem }))
    expect(s.sinais.iOS).toBe(false)
  })
})

describe('proibirModelo / modeloProibido', () => {
  it('proíbe por aparelho, sem duplicar, antes mesmo de existir sonda', async () => {
    const armazem = armazemFalso()
    expect(await modeloProibido('whisper-small', dep({ armazem }))).toBe(false)
    await proibirModelo('whisper-small', 'OOM', dep({ armazem }))
    await proibirModelo('whisper-small', 'OOM de novo', dep({ armazem }))
    expect(await modeloProibido('whisper-small', dep({ armazem }))).toBe(true)
    expect(await modeloProibido('whisper-base', dep({ armazem }))).toBe(false)
    const reg = lerRegistro(armazem)!
    expect(reg.modelosProibidos).toEqual(['whisper-small'])
    expect(reg.motivosDaProibicao['whisper-small']).toBe('OOM de novo')
  })

  it('em outro aparelho a proibição não vale', async () => {
    const armazem = armazemFalso()
    await proibirModelo('whisper-small', 'OOM', dep({ armazem }))
    expect(await modeloProibido('whisper-small', dep({ armazem, infoDoAdaptador: async () => null }))).toBe(false)
  })
})

/*
 * A WEB SPEECH COM TRILHA (`start(track)` + `processLocally`) — não documentado se as duas combinam;
 * a captura testa em execução e LEMBRA o resultado por aparelho, para não repetir o teste (e a legenda
 * perdida dos primeiros segundos) a cada sessão. Outro Chrome (outra UA = outra impressão) testa de novo.
 */
describe('lembrarWebSpeechComTrilha / webSpeechComTrilhaLembrada', () => {
  it('sem registro: não sabe (null); lembra ok/falhou antes mesmo de existir sonda', async () => {
    const armazem = armazemFalso()
    expect(await webSpeechComTrilhaLembrada(dep({ armazem }))).toBeNull()
    await lembrarWebSpeechComTrilha('falhou', dep({ armazem }))
    expect(await webSpeechComTrilhaLembrada(dep({ armazem }))).toBe('falhou')
    await lembrarWebSpeechComTrilha('ok', dep({ armazem }))
    expect(await webSpeechComTrilhaLembrada(dep({ armazem }))).toBe('ok')
  })

  it('não apaga as proibições nem a sonda já guardada', async () => {
    const armazem = armazemFalso()
    const s = await obterSondaDoAparelho(dep({ armazem }))
    await proibirModelo('whisper-small', 'OOM', dep({ armazem }))
    await lembrarWebSpeechComTrilha('ok', dep({ armazem }))
    const reg = lerRegistro(armazem)!
    expect(reg.modelosProibidos).toEqual(['whisper-small'])
    expect(reg.sinais).toEqual(s.sinais)
  })

  it('atravessa a revalidação no MESMO aparelho; em outro (Chrome atualizado) testa de novo', async () => {
    const armazem = armazemFalso()
    await obterSondaDoAparelho(dep({ armazem }))
    await lembrarWebSpeechComTrilha('falhou', dep({ armazem }))
    const nova = await obterSondaDoAparelho(dep({ armazem, versaoDoApp: '0.2.0' }))
    expect(nova.webSpeechComTrilha).toBe('falhou')
    const outroUa = escopoCompleto({ navigator: { userAgent: UA_WIN + ' Chrome/151' } })
    expect(await webSpeechComTrilhaLembrada(dep({ armazem, escopo: outroUa }))).toBeNull()
  })

  it('o benchmark que grava depois não apaga a memória', async () => {
    const armazem = armazemFalso()
    await obterSondaDoAparelho(dep({ armazem }))
    await lembrarWebSpeechComTrilha('ok', dep({ armazem }))
    const bench: PontuacaoDoBenchmark = {
      pontuacaoWasm: 1,
      pontuacaoWebgpu: 2,
      melhor: 'webgpu',
      medidoEm: 1_000_000,
      duracaoMs: 10,
    }
    await sondarEMedir(dep({ armazem, medirBenchmark: async () => bench }))
    expect(lerRegistro(armazem)!.webSpeechComTrilha).toBe('ok')
  })

  it('armazém que lança: não lança, e não lembra', async () => {
    const armazem = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    }
    await expect(lembrarWebSpeechComTrilha('ok', dep({ armazem }))).resolves.toBeUndefined()
    expect(await webSpeechComTrilhaLembrada(dep({ armazem }))).toBeNull()
  })
})

describe('sondarEMedir (benchmark preguiçoso) e sondaGuardada', () => {
  const bench: PontuacaoDoBenchmark = {
    pontuacaoWasm: 2,
    pontuacaoWebgpu: 20,
    melhor: 'webgpu',
    medidoEm: 1_000_000,
    duracaoMs: 2500,
  }

  it('mede o benchmark UMA vez e guarda na sonda', async () => {
    const armazem = armazemFalso()
    const medir = vi.fn(async () => bench)
    const a = await sondarEMedir(dep({ armazem, medirBenchmark: medir }))
    const b = await sondarEMedir(dep({ armazem, medirBenchmark: medir }))
    expect(a.benchmark).toEqual(bench)
    expect(b.benchmark).toEqual(bench)
    expect(medir).toHaveBeenCalledTimes(1)
  })

  it('benchmark vencido (30 dias) é refeito; abortado não mede', async () => {
    expect(benchmarkValido(bench, 1_000_000 + TRINTA_DIAS_MS)).toBe(false)
    expect(benchmarkValido(bench, 1_000_001)).toBe(true)
    expect(benchmarkValido(null, 0)).toBe(false)
    const ctl = new AbortController()
    ctl.abort()
    const medir = vi.fn(async () => bench)
    const s = await sondarEMedir(dep({ medirBenchmark: medir }), ctl.signal)
    expect(medir).not.toHaveBeenCalled()
    expect(s.benchmark).toBeNull()
  })

  it('benchmark que rejeita: sonda sem pontuação, sem lançar', async () => {
    const s = await sondarEMedir(dep({ medirBenchmark: async () => Promise.reject(new Error('x')) }))
    expect(s.benchmark).toBeNull()
  })

  it('sondaGuardada: nunca mede; null sem registro válido', async () => {
    const armazem = armazemFalso()
    expect(await sondaGuardada(dep({ armazem }))).toBeNull()
    const s = await obterSondaDoAparelho(dep({ armazem }))
    expect(await sondaGuardada(dep({ armazem }))).toEqual(s)
    expect(await sondaGuardada(dep({ armazem, versaoDoApp: 'outra' }))).toBeNull()
  })
})
