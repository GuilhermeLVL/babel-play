// @vitest-environment jsdom
/**
 * O BLOQUEADOR DE DEPLOY QUE ESTE MÓDULO FECHA.
 *
 * `/api/sessions/:id/audio` está atrás do `authMiddleware`, mas era consumida por `<audio src>` e
 * `fetch()` crus, que não mandam `Authorization`. Com login ligado, o player da sessão, a forma de
 * onda, o download e os dois minijogos de escuta recebiam 401 — e nada disso aparecia no self-host,
 * onde a rota é aberta. O defeito só existia no cenário para o qual o app está sendo preparado.
 *
 * O download em si é trivial. O que este arquivo protege é a CONTABILIDADE DE REFERÊNCIAS: sem
 * cache, três telas baixam o mesmo arquivo; sem `revokeObjectURL`, cada sessão aberta vaza o áudio
 * pelo resto da vida da aba. As duas falhas são invisíveis em uso normal — só aparecem como lentidão
 * e consumo de memória que ninguém liga à causa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../src/data/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const { urlDeAudio, liberar, caminhoDoAudio } = await import('../src/lib/audioDaSessao')

let criadas = 0
let revogadas: string[] = []

/**
 * Um id de sessão novo a cada uso.
 *
 * O cache de `audioDaSessao` é de MÓDULO — é isso que faz três telas compartilharem um download, e
 * é a propriedade sob teste. Reaproveitar `'s1'` entre casos faria o segundo encontrar a entrada do
 * primeiro e passar sem baixar nada, medindo o cache em vez do comportamento. Cada caso traz a sua
 * sessão; o cache continua real.
 */
let n = 0
const novaSessao = () => `sessao-${++n}`

beforeEach(() => {
  criadas = 0
  revogadas = []
  apiFetch.mockReset()
  apiFetch.mockImplementation(async () => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${++criadas}`)
  globalThis.URL.revokeObjectURL = vi.fn((u: string) => { revogadas.push(u) })
})

afterEach(() => { vi.restoreAllMocks() })

describe('o áudio é buscado pelo caminho autenticado', () => {
  it('usa apiFetch (que injeta o Bearer), nunca fetch cru', async () => {
    const id = novaSessao()
    await urlDeAudio(id)
    expect(apiFetch).toHaveBeenCalledOnce()
    expect(apiFetch.mock.calls[0][0]).toBe(caminhoDoAudio(id))
  })

  it('pede um teto de tempo maior que o padrão — áudio de sessão chega a 120 MB', async () => {
    await urlDeAudio(novaSessao())
    const opts = apiFetch.mock.calls[0][1] as { timeoutMs?: number }
    expect(opts?.timeoutMs ?? 0).toBeGreaterThan(30_000)
  })

  it('resposta de erro vira exceção legível, não uma URL de blob de um 401', async () => {
    apiFetch.mockResolvedValueOnce({ ok: false, status: 401, blob: async () => new Blob() })
    await expect(urlDeAudio(novaSessao())).rejects.toThrow(/401/)
  })
})

describe('contabilidade de referências', () => {
  it('duas telas da MESMA sessão compartilham um download só', async () => {
    const id = novaSessao()
    const [a, b] = await Promise.all([urlDeAudio(id), urlDeAudio(id)])

    expect(apiFetch).toHaveBeenCalledOnce()
    expect(a).toBe(b)
  })

  it('sessões diferentes baixam separado', async () => {
    const a = await urlDeAudio(novaSessao())
    const b = await urlDeAudio(novaSessao())

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(a).not.toBe(b)
  })

  it('a URL só é revogada na ÚLTIMA referência', async () => {
    const id = novaSessao()
    const url = await urlDeAudio(id)
    await urlDeAudio(id)          // segunda tela

    liberar(id)
    await Promise.resolve()
    expect(revogadas, 'revogou com uma tela ainda usando o áudio').toEqual([])

    liberar(id)
    await Promise.resolve()
    expect(revogadas).toEqual([url])
  })

  it('depois de revogada, a próxima abertura baixa de novo', async () => {
    const id = novaSessao()
    await urlDeAudio(id)
    liberar(id)
    await Promise.resolve()

    await urlDeAudio(id)
    expect(apiFetch, 'reusou uma URL já revogada — o áudio não tocaria').toHaveBeenCalledTimes(2)
  })

  it('liberar mais vezes que abriu não quebra nem revoga duas vezes', async () => {
    const id = novaSessao()
    const url = await urlDeAudio(id)
    liberar(id)
    liberar(id)
    liberar(id)
    await Promise.resolve()

    expect(revogadas).toEqual([url])
  })

  it('uma falha não fica grudada no cache — a segunda tentativa acontece', async () => {
    const id = novaSessao()
    apiFetch.mockResolvedValueOnce({ ok: false, status: 500, blob: async () => new Blob() })
    await expect(urlDeAudio(id)).rejects.toThrow()

    // Sem a limpeza no `catch`, a promessa rejeitada ficaria no cache e o áudio nunca voltaria.
    await expect(urlDeAudio(id)).resolves.toMatch(/^blob:/)
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
