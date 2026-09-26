/**
 * PERFIL DO DISPOSITIVO POR CAPACIDADE — nunca pelo UA sozinho.
 *
 * O Meta Quest Browser, no modo padrão, anuncia `X11; Linux x86_64` e ignora o viewport
 * (browser-specs da Meta, 2026-07-21): uma regra "é celular?" por UA ou por `pointer: coarse` o
 * trataria como desktop e ofereceria o áudio do sistema, que ali não existe. Os casos abaixo
 * montam os SINAIS que cada aparelho entrega e conferem a classificação.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  classificarDispositivo,
  lerSinaisDoDispositivo,
  marcarDispositivoNoDocumento,
  REDUZIR_EFEITOS_KEY,
  reduzirEfeitos,
  type SinaisDoDispositivo,
} from '../src/lib/dispositivo/perfil'

const UA_QUEST =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/40.0 Chrome/150.0.0.0 Safari/537.36'
const UA_PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const UA_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

/** Um desktop Chrome comum: getDisplayMedia, mouse, isolado, 8 GB. */
const desktop: SinaisDoDispositivo = {
  userAgent: UA_WIN,
  nucleos: 16,
  memoriaGb: 8,
  isolado: true,
  capturaDeTela: true,
  ponteiroGrosso: false,
  toques: 0,
  temXr: false,
  economiaDeDados: false,
  tipoDeRede: '4g',
  movimentoReduzido: false,
  memoriaDaAbaMb: 4096,
  webGpu: true,
}

describe('classificarDispositivo — os cinco perfis', () => {
  it('desktop com adaptador WebGPU', () => {
    const p = classificarDispositivo(desktop)
    expect(p.tipo).toBe('desktop-com-gpu')
    expect(p.leve).toBe(false)
    expect(p.poucaMemoria).toBe(false)
    expect(p.permiteSmall).toBe(true)
    expect(p.capturaDoSistema).toBe(true)
  })

  it('desktop sem adaptador (headless, GPU bloqueada) não permite o small', () => {
    const p = classificarDispositivo({ ...desktop, webGpu: false })
    expect(p.tipo).toBe('desktop-sem-gpu')
    expect(p.permiteSmall).toBe(false)
    expect(p.leve).toBe(false)
  })

  it('desktop sem GPU e com 2 núcleos liga o modo leve', () => {
    expect(classificarDispositivo({ ...desktop, webGpu: false, nucleos: 2 }).leve).toBe(true)
  })

  it('Quest pelo UA do Oculus Browser, mesmo anunciando X11/Linux', () => {
    const p = classificarDispositivo({
      ...desktop,
      userAgent: UA_QUEST,
      capturaDeTela: false,
      temXr: true,
      webGpu: false,
      memoriaGb: 8,
      nucleos: 6,
    })
    expect(p.tipo).toBe('quest')
    expect(p.leve).toBe(true)
    expect(p.poucaMemoria).toBe(true)
    expect(p.capturaDoSistema).toBe(false)
    expect(p.alvoMinimoPx).toBe(56)
    expect(p.motivos.join(' ')).toMatch(/OculusBrowser/)
  })

  it('Quest por CAPACIDADE, sem o UA revelar: XR + sem getDisplayMedia + sem toque', () => {
    const p = classificarDispositivo({
      ...desktop,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/150.0.0.0 Safari/537.36',
      capturaDeTela: false,
      temXr: true,
      webGpu: false,
    })
    expect(p.tipo).toBe('quest')
  })

  it('Pixel com WebGPU e 8 GB é celular bom; sem getDisplayMedia não há áudio do sistema', () => {
    const p = classificarDispositivo({
      ...desktop,
      userAgent: UA_PIXEL,
      capturaDeTela: false,
      ponteiroGrosso: true,
      toques: 5,
      temXr: true,
      nucleos: 8,
      memoriaGb: 8,
    })
    expect(p.tipo).toBe('celular-bom')
    expect(p.capturaDoSistema).toBe(false)
    expect(p.permiteSmall).toBe(false)
    expect(p.poucaMemoria).toBe(true)
    expect(p.alvoMinimoPx).toBe(48)
  })

  it('Android com deviceMemory ≤ 2 é celular fraco, mesmo com WebGPU', () => {
    const p = classificarDispositivo({
      ...desktop,
      userAgent: UA_PIXEL,
      capturaDeTela: false,
      ponteiroGrosso: true,
      toques: 5,
      memoriaGb: 2,
    })
    expect(p.tipo).toBe('celular-fraco')
    expect(p.leve).toBe(true)
  })

  it('iPhone sem WebGPU (e sem deviceMemory) é celular fraco até provar o contrário', () => {
    const p = classificarDispositivo({
      ...desktop,
      userAgent: UA_IPHONE,
      capturaDeTela: false,
      ponteiroGrosso: true,
      toques: 5,
      memoriaGb: null,
      nucleos: 4,
      webGpu: false,
      isolado: false,
      tipoDeRede: null,
    })
    expect(p.tipo).toBe('celular-fraco')
  })

  it('celular com toque mas COM getDisplayMedia (tablet em modo desktop) segue celular pelo ponteiro', () => {
    const p = classificarDispositivo({ ...desktop, ponteiroGrosso: true, toques: 10, userAgent: UA_PIXEL })
    expect(p.tipo.startsWith('celular')).toBe(true)
  })
})

describe('threads do WASM', () => {
  it('sem isolamento (sem SharedArrayBuffer) = 1 thread, em qualquer perfil', () => {
    expect(classificarDispositivo({ ...desktop, isolado: false }).threadsWasm).toBe(1)
  })

  it('isolado: até 4 no desktop, 2 no celular fraco', () => {
    expect(classificarDispositivo(desktop).threadsWasm).toBe(4)
    const fraco = classificarDispositivo({
      ...desktop,
      userAgent: UA_PIXEL,
      capturaDeTela: false,
      ponteiroGrosso: true,
      toques: 5,
      memoriaGb: 2,
    })
    expect(fraco.threadsWasm).toBe(2)
  })

  it('nunca passa do número de núcleos', () => {
    expect(classificarDispositivo({ ...desktop, nucleos: 2 }).threadsWasm).toBe(2)
  })
})

describe('aviso de download', () => {
  it('desktop em rede boa não pede confirmação', () => {
    expect(classificarDispositivo(desktop).confirmarDownloadAcimaDeMb).toBeNull()
  })

  it('saveData: confirma qualquer download', () => {
    expect(classificarDispositivo({ ...desktop, economiaDeDados: true }).confirmarDownloadAcimaDeMb).toBe(0)
  })

  it('rede 3g: confirma qualquer download', () => {
    expect(classificarDispositivo({ ...desktop, tipoDeRede: '3g' }).confirmarDownloadAcimaDeMb).toBe(0)
  })

  it('celular/Quest em rede boa: confirma acima de 100 MB', () => {
    const q = classificarDispositivo({ ...desktop, userAgent: UA_QUEST, capturaDeTela: false, temXr: true })
    expect(q.confirmarDownloadAcimaDeMb).toBe(100)
  })
})

describe('memória da aba', () => {
  it('jsHeapSizeLimit abaixo de 1 GB marca pouca memória num desktop', () => {
    expect(classificarDispositivo({ ...desktop, memoriaDaAbaMb: 512 }).poucaMemoria).toBe(true)
  })
})

describe('lerSinaisDoDispositivo — com mocks do navegador', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lê os sinais do Quest e tolera APIs ausentes', () => {
    vi.stubGlobal('navigator', {
      userAgent: UA_QUEST,
      hardwareConcurrency: 6,
      maxTouchPoints: 0,
      xr: {},
      mediaDevices: { getUserMedia: () => undefined },
    })
    vi.stubGlobal('crossOriginIsolated', true)
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion') ? false : false }))
    const s = lerSinaisDoDispositivo(false)
    expect(s).toMatchObject({
      nucleos: 6,
      memoriaGb: null,
      isolado: true,
      capturaDeTela: false,
      temXr: true,
      toques: 0,
      economiaDeDados: false,
      tipoDeRede: null,
      webGpu: false,
    })
  })

  it('lê saveData, effectiveType, deviceMemory e getDisplayMedia', () => {
    vi.stubGlobal('navigator', {
      userAgent: UA_PIXEL,
      hardwareConcurrency: 8,
      deviceMemory: 4,
      maxTouchPoints: 5,
      connection: { saveData: true, effectiveType: '3g' },
      mediaDevices: { getDisplayMedia: () => undefined },
    })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') }))
    const s = lerSinaisDoDispositivo(true)
    expect(s).toMatchObject({
      memoriaGb: 4,
      capturaDeTela: true,
      ponteiroGrosso: true,
      economiaDeDados: true,
      tipoDeRede: '3g',
      webGpu: true,
    })
  })

  it('sem navigator nenhum (SSR/worker estranho) não lança', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => lerSinaisDoDispositivo(false)).not.toThrow()
  })
})

describe('reduzirEfeitos — o sinal único do modo leve', () => {
  const armazenamento = new Map<string, string>()
  const stubLocalStorage = () =>
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => armazenamento.get(k) ?? null,
      setItem: (k: string, v: string) => void armazenamento.set(k, v),
      removeItem: (k: string) => void armazenamento.delete(k),
    })
  afterEach(() => {
    armazenamento.clear()
    vi.unstubAllGlobals()
  })

  it('escolha manual "true" vence tudo', () => {
    stubLocalStorage()
    armazenamento.set(REDUZIR_EFEITOS_KEY, 'true')
    expect(reduzirEfeitos({ ...desktop })).toBe(true)
  })

  it('escolha manual "false" vence até o Quest', () => {
    stubLocalStorage()
    armazenamento.set(REDUZIR_EFEITOS_KEY, 'false')
    expect(reduzirEfeitos({ ...desktop, userAgent: UA_QUEST, capturaDeTela: false, temXr: true })).toBe(false)
  })

  it('sem escolha: liga no Quest, no celular fraco e com prefers-reduced-motion', () => {
    stubLocalStorage()
    expect(reduzirEfeitos(desktop)).toBe(false)
    expect(reduzirEfeitos({ ...desktop, userAgent: UA_QUEST, capturaDeTela: false, temXr: true })).toBe(true)
    expect(reduzirEfeitos({ ...desktop, movimentoReduzido: true })).toBe(true)
  })
})

describe('marcarDispositivoNoDocumento', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('marca o tipo e o modo leve na raiz (Quest pelo UA, sem escolha manual)', () => {
    vi.stubGlobal('navigator', { userAgent: UA_QUEST, maxTouchPoints: 0, xr: {} })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
    const raiz = { dataset: {} as DOMStringMap }
    const p = marcarDispositivoNoDocumento(raiz)
    expect(p.tipo).toBe('quest')
    expect(raiz.dataset).toMatchObject({ dispositivo: 'quest', modoLeve: 'true' })
  })
})
