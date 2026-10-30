// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ protegido: true }))
vi.mock('../src/lib/avatar/protegido', () => ({
  protegidoParaAvatar: () => estado.protegido,
  useProtegidoParaAvatar: () => estado.protegido,
}))

import { mensagemDeInicio, mensagemDeTexto } from '../src/core/libras/vlibras'
import {
  aceitarVLibras,
  CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS,
  consentimentoDoVLibras,
  criarPonteDoVLibras,
  enviarParaAPonte,
  ouvirAPonte,
  podeUsarAPonte,
  revogarVLibras,
} from '../src/lib/libras/vlibras'

beforeEach(() => {
  localStorage.clear()
  estado.protegido = true
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** O aperto de mão como a ponte o faz: um `message` da janela do iframe, com `pronta` e a porta anexada. */
function apertoDeMao(f: HTMLIFrameElement, source: unknown = f.contentWindow) {
  const canal = new MessageChannel()
  const evento = new MessageEvent('message', {
    source: source as MessageEventSource,
    data: { frasy: 'vlibras-ponte', tipo: 'pronta' },
  })
  Object.defineProperty(evento, 'ports', { value: [canal.port2] })
  window.dispatchEvent(evento)
  return canal
}
const proximaMensagem = (porta: MessagePort) =>
  new Promise<unknown>((ok) => {
    porta.onmessage = (e) => ok(e.data)
  })

describe('a ponte do VLibras: o portão antes de qualquer iframe', () => {
  it('flag desligada, mesmo com adulto e aceite: não cria o iframe', () => {
    estado.protegido = false
    aceitarVLibras()
    expect(criarPonteDoVLibras(false)).toBeNull()
    expect(podeUsarAPonte(false)).toBe(false)
  })

  it('menor (perfil protegido) nunca cria a ponte, mesmo com flag e aceite guardado', () => {
    estado.protegido = true
    aceitarVLibras()
    expect(criarPonteDoVLibras(true)).toBeNull()
  })

  it('sem idade conhecida o app diz "protegido" e nada é criado', () => {
    // `protegidoParaAvatar()` é true quando a idade não foi declarada: é o estado inicial do mock.
    aceitarVLibras()
    expect(criarPonteDoVLibras(true)).toBeNull()
  })

  it('adulto sem aceite: não cria a ponte', () => {
    estado.protegido = false
    expect(criarPonteDoVLibras(true)).toBeNull()
  })

  it('aceite de versão antiga ou lixo no armazenamento não vale', () => {
    estado.protegido = false
    for (const v of ['1', 'true', '{"v":0,"aceitoEm":1}', '{"v":1}']) {
      localStorage.setItem(CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS, v)
      expect(consentimentoDoVLibras()).toBe(false)
      expect(criarPonteDoVLibras(true)).toBeNull()
    }
  })

  it('adulto + flag + aceite: o iframe nasce com sandbox="allow-scripts" e SEM allow-same-origin', () => {
    estado.protegido = false
    expect(aceitarVLibras()).toBe(true)
    const f = criarPonteDoVLibras(true)!
    expect(f).not.toBeNull()
    expect(f.getAttribute('sandbox')).toBe('allow-scripts')
    expect(f.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(f.getAttribute('src')).toBe('/vlibras-ponte.html')
    expect(f.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(f.getAttribute('allow')).toBe('')
  })

  it('o script do governo nunca é injetado no documento do app', () => {
    estado.protegido = false
    aceitarVLibras()
    document.body.appendChild(criarPonteDoVLibras(true)!)
    expect(document.querySelectorAll('script[src*="vlibras"]')).toHaveLength(0)
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })

  it('armazenamento bloqueado: não há aceite e nada é criado', () => {
    estado.protegido = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(aceitarVLibras()).toBe(false)
    expect(criarPonteDoVLibras(true)).toBeNull()
  })

  it('revogar apaga o aceite: depois disso nada é criado nem enviado', async () => {
    estado.protegido = false
    aceitarVLibras()
    const f = criarPonteDoVLibras(true)!
    document.body.appendChild(f)
    const janela = vi.spyOn(f.contentWindow!, 'postMessage')
    const parar = ouvirAPonte(f, () => {})
    const canal = apertoDeMao(f)
    const chegou = proximaMensagem(canal.port1)
    expect(enviarParaAPonte(f, true, mensagemDeInicio())).toBe(true)
    expect(await chegou).toEqual(mensagemDeInicio())
    revogarVLibras()
    expect(consentimentoDoVLibras()).toBe(false)
    expect(enviarParaAPonte(f, true, mensagemDeInicio())).toBe(false)
    expect(criarPonteDoVLibras(true)).toBeNull()
    // nada foi para a janela do iframe: nem uma vez, e portanto nunca com `targetOrigin '*'`
    expect(janela).not.toHaveBeenCalled()
    parar()
    canal.port1.close()
  })

  it('sem o aperto de mão (a ponte ainda não entregou a porta) nada é enviado', () => {
    estado.protegido = false
    aceitarVLibras()
    const f = criarPonteDoVLibras(true)!
    document.body.appendChild(f)
    const janela = vi.spyOn(f.contentWindow!, 'postMessage')
    ouvirAPonte(f, () => {})
    expect(enviarParaAPonte(f, true, mensagemDeInicio())).toBe(false)
    expect(janela).not.toHaveBeenCalled()
  })
})

describe('mensagens da ponte: esquema estrito e só do iframe', () => {
  function ponteAtiva() {
    estado.protegido = false
    aceitarVLibras()
    const f = criarPonteDoVLibras(true)!
    document.body.appendChild(f)
    return f
  }
  const disparar = (source: unknown, data: unknown) =>
    window.dispatchEvent(new MessageEvent('message', { source: source as MessageEventSource, data }))

  it('o `pronta` com a porta abre o canal; iniciado/erro chegam PELA PORTA', async () => {
    const f = ponteAtiva()
    const recebidas: string[] = []
    const parar = ouvirAPonte(f, (t) => recebidas.push(t))
    const canal = apertoDeMao(f)
    expect(recebidas).toEqual(['pronta'])
    for (const tipo of ['iniciado', 'erro']) canal.port1.postMessage({ frasy: 'vlibras-ponte', tipo })
    await vi.waitFor(() => expect(recebidas).toEqual(['pronta', 'iniciado', 'erro']))
    parar()
    canal.port1.close()
  })

  it('ignora `pronta` sem porta, de outra janela, e iniciado/erro soltos na janela (só a porta vale)', () => {
    const f = ponteAtiva()
    const recebidas: string[] = []
    ouvirAPonte(f, (t) => recebidas.push(t))
    apertoDeMao(f, window) // não é o iframe
    apertoDeMao(f, null)
    disparar(f.contentWindow, { frasy: 'vlibras-ponte', tipo: 'pronta' }) // é o iframe, mas sem porta
    for (const tipo of ['iniciado', 'erro']) disparar(f.contentWindow, { frasy: 'vlibras-ponte', tipo })
    for (const ruim of [
      'pronta',
      null,
      [],
      { tipo: 'pronta' },
      { frasy: 'outra', tipo: 'pronta' },
      { frasy: 'vlibras-ponte', tipo: 'texto' },
      { frasy: 'vlibras-ponte', tipo: 'pronta', extra: '<img onerror=x>' },
    ])
      disparar(f.contentWindow, ruim)
    expect(recebidas).toEqual([])
    expect(enviarParaAPonte(f, true, mensagemDeInicio())).toBe(false)
  })

  it('formato errado ou carga extra pela porta é ignorado; parar a escuta fecha a porta', async () => {
    const f = ponteAtiva()
    const recebidas: string[] = []
    const parar = ouvirAPonte(f, (t) => recebidas.push(t))
    const canal = apertoDeMao(f)
    for (const ruim of [
      'erro',
      null,
      { tipo: 'erro' },
      { frasy: 'vlibras-ponte', tipo: 'texto' },
      { frasy: 'vlibras-ponte', tipo: 'erro', extra: 1 },
    ])
      canal.port1.postMessage(ruim)
    canal.port1.postMessage({ frasy: 'vlibras-ponte', tipo: 'iniciado' })
    await vi.waitFor(() => expect(recebidas).toEqual(['pronta', 'iniciado']))
    parar()
    expect(enviarParaAPonte(f, true, mensagemDeInicio())).toBe(false)
    canal.port1.close()
  })

  it('o texto enviado é aparado, tem teto e some se for vazio', () => {
    expect(mensagemDeTexto('  Bom   dia\n')).toEqual({ frasy: 'vlibras-ponte', tipo: 'texto', texto: 'Bom dia' })
    expect(mensagemDeTexto('   ')).toBeNull()
    expect(mensagemDeTexto(42)).toBeNull()
    const longo = mensagemDeTexto('a'.repeat(5000))
    expect(longo && 'texto' in longo ? longo.texto.length : 0).toBe(2000)
  })
})
