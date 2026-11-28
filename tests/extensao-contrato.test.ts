/**
 * O CONTRATO DA EXTENSÃO (`extensao/contrato.js`) e os invariantes de privacidade do manifesto.
 * Sem `chrome`: o contrato é puro; o manifesto é lido como dado.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AMOSTRAS_POR_QUADRO,
  decodificarPcm,
  FONTE_APP,
  FONTE_EXTENSAO,
  mensagemDoApp,
  mensagemErro,
  mensagemParou,
  mensagemPcm,
  mensagemPronta,
  paraFloat32,
  paraInt16,
  TAXA_DE_AMOSTRAS,
  validarDaExtensao,
  validarDoApp,
  VERSAO,
} from '../extensao/contrato.js'

describe('contrato: PCM', () => {
  it('Int16 -> base64 -> Int16 sem perda, num quadro inteiro', () => {
    const q = new Int16Array(AMOSTRAS_POR_QUADRO).map((_, i) => ((i * 37) % 65535) - 32768)
    const m = mensagemPcm(q, 1, 100)
    expect(Array.from(decodificarPcm(m.pcm))).toEqual(Array.from(q))
    expect(m.sr).toBe(TAXA_DE_AMOSTRAS)
  })

  it('Float32 <-> Int16 respeita o limite do pico', () => {
    const i = paraInt16(new Float32Array([0, 1, -1, 2, -2, 0.5]))
    expect(i[1]).toBe(32767)
    expect(i[2]).toBe(-32768)
    expect(i[3]).toBe(32767)
    expect(i[4]).toBe(-32768)
    expect(paraFloat32(i)[5]).toBeCloseTo(0.5, 3)
  })
})

describe('contrato: validação', () => {
  const q = new Int16Array(AMOSTRAS_POR_QUADRO)
  it('aceita as quatro mensagens da extensão', () => {
    for (const m of [mensagemPronta(), mensagemPcm(q, 1, 0), mensagemParou(), mensagemErro('NotAllowedError')]) {
      expect(validarDaExtensao(m).ok).toBe(true)
    }
  })

  it('recusa fonte, versão e tipo errados, e quadro mal formado', () => {
    expect(validarDaExtensao(null).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPronta(), fonte: 'outro' }).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPronta(), versao: VERSAO + 1 }).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPronta(), tipo: 'executar' }).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPcm(q, 1, 0), sr: 44100 }).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPcm(q, 1, 0), seq: -1 }).ok).toBe(false)
    expect(validarDaExtensao({ ...mensagemPcm(q, 1, 0), pcm: 'x'.repeat(20000) }).ok).toBe(false)
  })

  it('da página, só pedir e parar passam (nada de mandar a extensão fazer outra coisa)', () => {
    expect(validarDoApp(mensagemDoApp('pedir')).ok).toBe(true)
    expect(validarDoApp(mensagemDoApp('parar')).ok).toBe(true)
    expect(validarDoApp({ ...mensagemDoApp('pedir'), tipo: 'iniciar' }).ok).toBe(false)
    expect(validarDoApp({ ...mensagemDoApp('pedir'), fonte: FONTE_EXTENSAO }).ok).toBe(false)
    // uma mensagem da extensão não vale como pedido do app (a ponte ouve a própria saída sem se confundir)
    expect(validarDoApp(mensagemPronta()).ok).toBe(false)
    expect(mensagemDoApp('pedir').fonte).toBe(FONTE_APP)
  })
})

describe('manifesto: permissões mínimas e privacidade', () => {
  const manifesto = JSON.parse(readFileSync('extensao/manifest.json', 'utf8'))

  it('é MV3 e pede só o que a captura exige', () => {
    expect(manifesto.manifest_version).toBe(3)
    expect([...manifesto.permissions].sort()).toEqual(['activeTab', 'offscreen', 'tabCapture'])
    expect(manifesto.host_permissions).toBeUndefined()
    expect(manifesto.optional_host_permissions).toBeUndefined()
    expect(manifesto.externally_connectable).toBeUndefined()
  })

  it('a ponte só roda nas origens do app, nunca em todos os sites', () => {
    const todas = JSON.stringify(manifesto)
    expect(todas).not.toMatch(/<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*/)
    for (const c of manifesto.content_scripts) {
      for (const m of c.matches) expect(m).toMatch(/^https?:\/\/(localhost|[a-z0-9.-]+)\/(app\/)?\*$/)
    }
  })

  it('a origem de produção é a mesma no manifesto, nos recursos acessíveis e no URL_DO_APP, e a ponte só roda em /app', () => {
    const origem = 'https://frasy.com.br'
    const sw = readFileSync('extensao/service-worker.js', 'utf8')
    const url = /^const URL_DO_APP = '([^']+)'/m.exec(sw)?.[1] ?? ''
    expect(new URL(url).origin).toBe(origem)
    expect(new URL(url).pathname).toBe('/app/capturar')
    expect(new URL(url).searchParams.get('fonte')).toBe('extensao')
    expect(manifesto.content_scripts[0].matches).toContain(`${origem}/app/*`)
    expect(manifesto.web_accessible_resources[0].matches).toContain(`${origem}/*`)
    // nenhum outro host além do dev (localhost) e da produção
    const hosts = new Set<string>(
      [...manifesto.content_scripts[0].matches, ...manifesto.web_accessible_resources[0].matches].map(
        (m: string) => new URL(m.replace('*', 'x')).host,
      ),
    )
    expect([...hosts].sort()).toEqual(['frasy.com.br', 'localhost'])
    // a produção é a mesma que o Worker declara
    expect(readFileSync('wrangler.jsonc', 'utf8')).toContain('"HOST_DE_PRODUCAO": "frasy.com.br"')
  })

  it('nenhum arquivo da extensão faz requisição de rede', () => {
    for (const f of ['service-worker.js', 'offscreen.js', 'ponte.js', 'popup.js', 'contrato.js']) {
      const src = readFileSync(`extensao/${f}`, 'utf8')
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|chrome\.storage/)
    }
  })
})
