/**
 * O PARAKEET NA CADEIA DE TRANSCRIÇÃO DO GATEWAY.
 *
 * Ele não está em perfil nenhum: entra quando a ROTA o escolhe (`setRoute` com o id dele), na frente
 * do `whisper-local`, que fica de reserva com o Whisper base. O que estes testes prendem:
 *   - sem a rota do Parakeet, o gateway nem carrega o módulo dele (nada muda para quem não liga a chave);
 *   - com a rota, a fala vai a ele, o `engine` diz `parakeet-local`, e a carga é a dele;
 *   - se ele não carregar ou recusar o trecho, a fala vai ao Whisper em vez de se perder;
 *   - o parcial NÃO passa por ele.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

/** O que o Parakeet falso faz; os testes trocam. */
const parakeet = vi.hoisted(() => ({
  importado: 0,
  disponivel: true,
  preload: vi.fn(async (_p?: unknown) => {}),
  transcribePcm: vi.fn(async (_pcm: Float32Array, _sr: number, _o?: unknown) => ({ text: 'do parakeet' })),
  liberar: vi.fn(),
  fila: 0,
}))
vi.mock('../src/gateway/adapters/parakeetLocal', () => {
  parakeet.importado++
  return {
    ParakeetLocalStt: class {
      readonly id = 'parakeet-local'
      readonly supportsBlob = true
      readonly supportsLiveMic = false
      isAvailable = () => parakeet.disponivel
      preload = parakeet.preload
      transcribePcm = parakeet.transcribePcm
      liberar = parakeet.liberar
      get queueDepth() {
        return parakeet.fila
      }
    },
  }
})

/** O Whisper local falso: guarda o modelo que o gateway lhe deu. */
const whisper = vi.hoisted(() => ({
  modelos: [] as Array<[string, unknown]>,
  preload: vi.fn(async (_p?: unknown) => {}),
  transcribePcm: vi.fn(async (pcm: Float32Array, _sr: number, _o?: unknown) => ({
    text: `do whisper (${pcm.length})`,
  })),
  transcribeIfIdle: vi.fn(async () => ({ text: 'parcial do whisper' })),
  liberar: vi.fn(),
}))
vi.mock('../src/gateway/adapters/whisperLocal', () => ({
  WhisperLocalStt: class {
    readonly id = 'whisper-local'
    readonly supportsBlob = true
    readonly supportsLiveMic = false
    readonly queueDepth = 7
    isAvailable = () => true
    setModel = (m: string, o?: unknown) => void whisper.modelos.push([m, o])
    preload = whisper.preload
    transcribePcm = whisper.transcribePcm
    transcribeIfIdle = whisper.transcribeIfIdle
    liberar = whisper.liberar
  },
}))

function perfil(stt: Array<{ adapterId: string }>) {
  return {
    id: 'teste',
    name: 'teste',
    builtin: true,
    economyMode: false,
    budget: { maxCloudRequests: 100, maxTokens: 100_000 },
    bindings: { stt },
  }
}

async function montar(
  stt: Array<{ adapterId: string }> = [{ adapterId: 'web-speech' }, { adapterId: 'whisper-local' }],
) {
  const { buildGateway } = await import('../src/gateway/index')
  const { capMetrics } = await import('../src/gateway/capture/captureMetrics')
  capMetrics.reset()
  return { gw: buildGateway({ profile: perfil(stt) as never, cloudConsent: () => true }), capMetrics }
}

const ROTA_DO_PARAKEET = { preferCloud: false, localModel: ID_DO_PARAKEET, device: 'wasm' as const }
const pcm = () => new Float32Array(1600).fill(0.1)

beforeEach(() => {
  vi.resetModules()
  parakeet.importado = 0
  parakeet.disponivel = true
  parakeet.fila = 0
  for (const f of [parakeet.preload, parakeet.transcribePcm, parakeet.liberar]) f.mockClear()
  parakeet.preload.mockImplementation(async () => {})
  parakeet.transcribePcm.mockImplementation(async () => ({ text: 'do parakeet' }))
  whisper.modelos = []
  for (const f of [whisper.preload, whisper.transcribePcm, whisper.transcribeIfIdle, whisper.liberar]) f.mockClear()
})

describe('sem a rota do Parakeet (chave desligada): nada muda', () => {
  it('rota do Whisper: o módulo do Parakeet nem é carregado, e o Whisper recebe a rota como sempre', async () => {
    const { gw } = await montar()
    gw.stt.setRoute({ preferCloud: false, localModel: WHISPER_MODELS.small, dtype: 'hybrid' })
    await gw.stt.preloadModel()
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })
    expect(r).toMatchObject({ text: 'do whisper (1600)', engine: 'whisper-local' })
    expect(whisper.modelos).toEqual([[WHISPER_MODELS.small, { dtype: 'hybrid', device: undefined }]])
    expect(gw.stt.pendingCount()).toBe(7)
    expect(parakeet.importado).toBe(0)
    expect(parakeet.preload).not.toHaveBeenCalled()
  })

  it('rota sem dtype nem device: o Whisper recebe o modelo SEM opções (mantém o dtype já roteado)', async () => {
    const { gw } = await montar()
    gw.stt.setRoute({ preferCloud: false, localModel: WHISPER_MODELS.base })
    expect(whisper.modelos).toEqual([[WHISPER_MODELS.base, undefined]])
  })
})

describe('com a rota do Parakeet', () => {
  it('a fala vai ao Parakeet, com o `engine` dele; o Whisper fica de reserva com o base, sem carregar', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    const progresso = vi.fn()
    await gw.stt.preloadModel(progresso)
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })
    expect(r).toMatchObject({ text: 'do parakeet', engine: 'parakeet-local' })
    expect(parakeet.preload).toHaveBeenCalledTimes(1)
    expect(parakeet.preload.mock.calls[0][0]).toBe(progresso)
    expect(whisper.modelos).toEqual([[WHISPER_MODELS.base, {}]])
    expect(whisper.preload).not.toHaveBeenCalled()
    expect(whisper.transcribePcm).not.toHaveBeenCalled()
  })

  it('a fila medida é a do Parakeet', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await gw.stt.preloadModel()
    parakeet.fila = 3
    expect(gw.stt.pendingCount()).toBe(3)
  })

  it('o PARCIAL não passa pelo Parakeet: continua vindo do Whisper local, como hoje', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await gw.stt.preloadModel()
    expect(await gw.stt.transcribePartial(pcm(), 16000, { languageHint: 'pt' })).toEqual({ text: 'parcial do whisper' })
    expect(parakeet.transcribePcm).not.toHaveBeenCalled()
  })

  it('o Parakeet recusa o trecho (idioma fora de pt/es): a MESMA fala vai ao Whisper, e a queda é contada', async () => {
    const { gw, capMetrics } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    parakeet.transcribePcm.mockRejectedValue(new Error('Parakeet só atende português e espanhol (pedido: en)'))
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'en' })
    expect(r).toMatchObject({ text: 'do whisper (1600)', engine: 'whisper-local' })
    expect(capMetrics.drenarTelemetria().fallbacks).toEqual({ 'stt:parakeet-local': 1 })
  })

  it('cancelado por quem pediu: AbortError sobe, o Whisper NÃO refaz o trabalho', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    parakeet.transcribePcm.mockRejectedValue(Object.assign(new Error('cancelada'), { name: 'AbortError' }))
    await expect(gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(whisper.transcribePcm).not.toHaveBeenCalled()
  })

  it('o Parakeet não carrega: a preparação NÃO falha, o Whisper de reserva carrega e passa a atender', async () => {
    const { gw, capMetrics } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    parakeet.preload.mockRejectedValue(new Error('Parakeet não carregou (integridade): encoder: sha256 não confere'))
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rotulos: Array<string | undefined> = []
    await gw.stt.preloadModel((_p, rotulo) => rotulos.push(rotulo))
    expect(whisper.preload).toHaveBeenCalledTimes(1)
    expect(rotulos).toEqual(['Trocando para o modelo de reserva (Whisper)…'])
    expect(aviso).toHaveBeenCalled()
    expect(capMetrics.drenarTelemetria().fallbacks).toEqual({ 'stt:parakeet-local': 1 })
    // Fora da cadeia até a próxima rota: a fala vai direto ao Whisper, sem tentar a carga a cada trecho.
    parakeet.preload.mockClear()
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })
    expect(r.engine).toBe('whisper-local')
    expect(parakeet.transcribePcm).not.toHaveBeenCalled()
    expect(parakeet.liberar).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('motor que já falhou neste aparelho (indisponível): a fala passa direto ao Whisper', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    parakeet.disponivel = false
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })
    expect(r.engine).toBe('whisper-local')
    expect(parakeet.transcribePcm).not.toHaveBeenCalled()
  })

  it('a rota volta ao Whisper: o Parakeet sai da cadeia e o worker dele é encerrado (devolve a memória)', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await gw.stt.preloadModel()
    gw.stt.setRoute({ preferCloud: false, localModel: WHISPER_MODELS.base, dtype: 'hybrid' })
    expect(parakeet.liberar).toHaveBeenCalledTimes(1)
    const r = await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })
    expect(r.engine).toBe('whisper-local')
    expect(parakeet.transcribePcm).not.toHaveBeenCalled()
  })

  it('o regulador desce para um Whisper: o Parakeet sai; se voltar ao Parakeet, ele reassume', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await gw.stt.preloadModel()
    gw.stt.trocarModeloLocal(WHISPER_MODELS.base)
    expect((await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })).engine).toBe('whisper-local')
    expect(whisper.modelos.at(-1)).toEqual([WHISPER_MODELS.base, undefined])
    gw.stt.trocarModeloLocal(ID_DO_PARAKEET)
    expect((await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })).engine).toBe('parakeet-local')
    // O id do Parakeet nunca é entregue ao Whisper como se fosse modelo dele.
    expect(whisper.modelos.map(([m]) => m)).not.toContain(ID_DO_PARAKEET)
  })

  it('`liberarModelo` (sair da captura) encerra o Parakeet também', async () => {
    const { gw } = await montar()
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await gw.stt.preloadModel()
    gw.stt.liberarModelo()
    expect(parakeet.liberar).toHaveBeenCalledTimes(1)
    expect(whisper.liberar).toHaveBeenCalledTimes(1)
  })

  it('perfil sem `whisper-local` não ganha transcrição no aparelho por causa da rota', async () => {
    const { gw } = await montar([{ adapterId: 'web-speech' }])
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    await expect(gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'pt' })).rejects.toThrow(/nenhum STT de blob/)
    expect(parakeet.transcribePcm).not.toHaveBeenCalled()
  })

  it('não pede consentimento de nuvem: roda no aparelho mesmo com o consentimento negado', async () => {
    const { buildGateway } = await import('../src/gateway/index')
    const gw = buildGateway({
      profile: perfil([{ adapterId: 'whisper-local' }]) as never,
      cloudConsent: () => false,
    })
    gw.stt.setRoute(ROTA_DO_PARAKEET)
    expect((await gw.stt.transcribePcm(pcm(), 16000, { languageHint: 'es' })).engine).toBe('parakeet-local')
  })
})
