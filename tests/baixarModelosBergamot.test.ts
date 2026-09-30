/**
 * O SCRIPT DE BUILD DO BERGAMOT (`scripts/baixar-modelos-bergamot.mjs`) — o que chega ao `public/`.
 *
 * O bucket da Mozilla não manda CORS para a nossa origem, então o navegador não pode baixar de lá: o
 * build baixa os três `.gz` do pt→en, confere o sha256 de CADA um e os serve do próprio domínio.
 * Estes testes prendem a conferência (nada entra sem o hash certo, e nada fica pela metade), a
 * idempotência (arquivo certo não baixa de novo), a instalação sem rede (avisa, não derruba) e a
 * cola do motor como módulo ES — com o remendo de UMA linha, conferido contra o pacote instalado.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  arquivoConfere,
  bergamotNoPublic,
  colaComoModulo,
  garantirArquivo,
  garantirBergamot,
  limparVersoesAntigas,
} from '../scripts/baixar-modelos-bergamot.mjs'
import modelos from '../src/gateway/adapters/modelosDoBergamot.json'

const hex = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex')
const resp = (b: Uint8Array | string, status = 200) => new Response(b as BodyInit, { status })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bergamot-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('garantirArquivo — o sha256 decide o que entra', () => {
  const CONTEUDO = new TextEncoder().encode('pesos de mentira do modelo')
  const alvo = () => ({
    url: 'https://gcs/x.gz',
    destino: join(dir, 'x.gz'),
    bytes: CONTEUDO.length,
    sha256: hex(CONTEUDO),
  })

  it('hash certo: grava e diz "baixado"', async () => {
    const buscar = vi.fn(async () => resp(CONTEUDO))
    const r = await garantirArquivo({ ...alvo(), buscar })
    expect(r.estado).toBe('baixado')
    expect(hex(readFileSync(alvo().destino))).toBe(alvo().sha256)
  })

  it('hash errado: NÃO grava, não deixa `.parcial`, e diz por quê', async () => {
    const buscar = vi.fn(async () => resp('outro conteúdo, mesmo tamanho!!'))
    const r = await garantirArquivo({ ...alvo(), bytes: 32, buscar })
    expect(r).toMatchObject({ estado: 'falhou' })
    expect(r.motivo).toMatch(/sha256|tamanho/)
    expect(readdirSync(dir)).toEqual([])
  })

  it('arquivo já no lugar com o hash certo: nem pergunta à rede (idempotente)', async () => {
    writeFileSync(alvo().destino, CONTEUDO)
    const buscar = vi.fn(async () => resp(CONTEUDO))
    expect((await garantirArquivo({ ...alvo(), buscar })).estado).toBe('ja-existia')
    expect(buscar).not.toHaveBeenCalled()
  })

  it('arquivo no lugar com conteúdo errado (download antigo pela metade): baixa de novo e troca', async () => {
    writeFileSync(alvo().destino, 'lixo')
    const buscar = vi.fn(async () => resp(CONTEUDO))
    expect((await garantirArquivo({ ...alvo(), buscar })).estado).toBe('baixado')
    expect(hex(readFileSync(alvo().destino))).toBe(alvo().sha256)
  })

  it('conteúdo errado no lugar E download com hash errado: o errado SAI (não vai para o dist)', async () => {
    writeFileSync(alvo().destino, 'lixo')
    const r = await garantirArquivo({ ...alvo(), buscar: async () => resp('também errado') })
    expect(r.estado).toBe('falhou')
    expect(existsSync(alvo().destino)).toBe(false)
  })

  it('sem rede: não lança (a instalação segue), diz "falhou"', async () => {
    const r = await garantirArquivo({
      ...alvo(),
      buscar: async () => {
        throw new TypeError('fetch failed')
      },
    })
    expect(r).toMatchObject({ estado: 'falhou' })
    expect(r.motivo).toMatch(/fetch failed/)
  })

  it('HTTP 403/500: "falhou" com o status', async () => {
    const r = await garantirArquivo({ ...alvo(), buscar: async () => resp('negado', 403) })
    expect(r).toMatchObject({ estado: 'falhou' })
    expect(r.motivo).toMatch(/403/)
  })

  it('arquivoConfere olha tamanho E hash', () => {
    writeFileSync(alvo().destino, CONTEUDO)
    expect(arquivoConfere(alvo().destino, alvo())).toBe(true)
    expect(arquivoConfere(alvo().destino, { ...alvo(), sha256: 'f'.repeat(64) })).toBe(false)
    expect(arquivoConfere(join(dir, 'nao-existe'), alvo())).toBe(false)
  })
})

describe('a cola do motor como módulo ES', () => {
  it('troca `this` por `globalThis` UMA vez e embrulha num export default', () => {
    const m = colaComoModulo(
      'var a = 1;\nvar global_object = this;\nvar Module = typeof Module != "undefined" ? Module : {};\n',
    )!
    expect(m).toContain('var global_object = globalThis;')
    expect(m).not.toContain('var global_object = this;')
    expect(m).toMatch(/export default function montarModulo\(Module\) \{/)
    expect(m.trimEnd().endsWith('}')).toBe(true)
    // O aviso da MPL-2.0 vai junto: o arquivo servido é código-fonte do pacote, modificado.
    expect(m).toMatch(/Mozilla Public License/)
  })

  it('sem o ponto do remendo (outra versão do pacote): recusa em vez de gerar algo que não roda', () => {
    expect(colaComoModulo('var nada = 1;')).toBeNull()
    expect(colaComoModulo('var global_object = this;\nvar global_object = this;')).toBeNull()
  })

  it('o pacote INSTALADO é o medido: sha256 da cola e do wasm conferem, e o remendo se aplica', () => {
    const require = createRequire(import.meta.url)
    const cola = readFileSync(require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.js'))
    const wasm = readFileSync(require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.wasm'))
    expect(hex(cola)).toBe(modelos.motor.cola.sha256)
    expect(hex(wasm)).toBe(modelos.motor.wasm.sha256)
    expect(colaComoModulo(cola.toString('utf8'))).not.toBeNull()
    const pacote = JSON.parse(readFileSync(require.resolve('@browsermt/bergamot-translator/package.json'), 'utf8'))
    expect(pacote.version).toBe(modelos.motor.versao)
  })
})

describe('modelosDoBergamot.json — a fonte única', () => {
  it('o caminho na origem é o da execução fixada, e os hashes são sha256', () => {
    for (const par of Object.values(modelos.pares)) {
      expect(par.caminhoNaOrigem).toContain(par.execucao)
      for (const a of Object.values(par.arquivos)) {
        expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(a.sha256Descomprimido).toMatch(/^[0-9a-f]{64}$/)
        expect(a.nome.endsWith('.gz')).toBe(true)
        // O limite por arquivo do Cloudflare Pages é 25 MiB: o `.gz` cabe; o descomprimido não caberia.
        expect(a.bytes).toBeLessThan(25 * 1024 * 1024)
      }
    }
  })

  it('o hash do modelo descomprimido é o que a bancada mediu (scripts/eval-fala/bancada/bergamot.mjs)', () => {
    expect(modelos.pares['pt-en'].arquivos.modelo.sha256Descomprimido).toBe(
      '7b854f1ec5a485dd33efd7c1bc01dd7d5a57f566957c5e47722af333f0ce9157',
    )
  })
})

describe('garantirBergamot — o public/ inteiro', () => {
  /** Um par de mentira com conteúdo pequeno: o fluxo é o mesmo, sem 25 MB no teste. */
  const arquivos = { modelo: 'M'.repeat(300), lex: 'L'.repeat(100), vocab: 'V'.repeat(50) }
  const config = {
    ...modelos,
    pares: {
      'pt-en': {
        execucao: 'run_teste',
        caminhoNaOrigem: 'models/pt-en/run_teste/exported/',
        arquivos: Object.fromEntries(
          Object.entries(arquivos).map(([k, v]) => [
            k,
            { nome: `${k}.gz`, bytes: v.length, sha256: hex(v), sha256Descomprimido: hex(v), alinhamento: 64 },
          ]),
        ),
      },
    },
  }
  const fonteDoMotor = () => {
    const d = join(dir, 'pacote')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'w.wasm'), 'wasm')
    writeFileSync(join(d, 'w.js'), 'var global_object = this;')
    return {
      wasm: join(d, 'w.wasm'),
      cola: join(d, 'w.js'),
      sha256Wasm: hex('wasm'),
      sha256Cola: hex('var global_object = this;'),
    }
  }
  const servir = (url: string) => {
    const chave = Object.keys(arquivos).find((k) => url.endsWith(`/${k}.gz`)) as keyof typeof arquivos | undefined
    return chave ? resp(arquivos[chave]) : resp('não', 404)
  }

  it('baixa os três, copia o motor, gera a cola e o LEIA-ME; o build pode oferecer o Bergamot', async () => {
    const raiz = join(dir, 'public', 'modelos', 'bergamot')
    const buscar = vi.fn(async (url: string) => servir(url))
    const r = await garantirBergamot({ raiz, config, motor: fonteDoMotor(), buscar })
    expect(r).toEqual({ modelos: true, motor: true })
    expect(buscar).toHaveBeenCalledWith(`${config.origem}models/pt-en/run_teste/exported/modelo.gz`, expect.anything())
    expect(existsSync(join(raiz, 'pt-en', 'run_teste', 'modelo.gz'))).toBe(true)
    const motor = join(raiz, `motor-${config.motor.versao}`)
    expect(readFileSync(join(motor, 'bergamot-translator-worker.mjs'), 'utf8')).toContain('globalThis')
    expect(existsSync(join(motor, 'bergamot-translator-worker.wasm'))).toBe(true)
    expect(readFileSync(join(raiz, 'LEIA-ME.txt'), 'utf8')).toMatch(/MPL-2\.0/)
    expect(bergamotNoPublic({ raiz, config })).toBe(true)
  })

  it('sem rede: o motor vai, os modelos não — e o build NÃO oferece o Bergamot (a menos que haja CDN)', async () => {
    const raiz = join(dir, 'public', 'modelos', 'bergamot')
    const r = await garantirBergamot({
      raiz,
      config,
      motor: fonteDoMotor(),
      buscar: async () => {
        throw new TypeError('getaddrinfo ENOTFOUND')
      },
    })
    expect(r).toEqual({ modelos: false, motor: true })
    expect(bergamotNoPublic({ raiz, config })).toBe(false)
    expect(bergamotNoPublic({ raiz, config, exigirModelos: false })).toBe(true)
  })

  it('pacote diferente do medido (hash da cola): o motor não é gerado', async () => {
    const raiz = join(dir, 'public', 'modelos', 'bergamot')
    const r = await garantirBergamot({
      raiz,
      config,
      motor: { ...fonteDoMotor(), sha256Cola: 'f'.repeat(64) },
      buscar: async (url: string) => servir(url),
    })
    expect(r.motor).toBe(false)
    expect(bergamotNoPublic({ raiz, config })).toBe(false)
  })

  it('segunda execução: nada é baixado de novo', async () => {
    const raiz = join(dir, 'public', 'modelos', 'bergamot')
    await garantirBergamot({ raiz, config, motor: fonteDoMotor(), buscar: async (url: string) => servir(url) })
    const buscar = vi.fn(async (url: string) => servir(url))
    await garantirBergamot({ raiz, config, motor: fonteDoMotor(), buscar })
    expect(buscar).not.toHaveBeenCalled()
  })

  it('execução de treino e motor antigos saem do public/ (não iriam para o dist à toa)', () => {
    const raiz = join(dir, 'b')
    for (const d of [
      'pt-en/run_velho',
      'pt-en/run_teste',
      'motor-0.0.1',
      `motor-${config.motor.versao}`,
      'en-pt/run_x',
    ])
      mkdirSync(join(raiz, d), { recursive: true })
    limparVersoesAntigas({ raiz, config })
    expect(readdirSync(raiz).sort()).toEqual([`motor-${config.motor.versao}`, 'pt-en'].sort())
    expect(readdirSync(join(raiz, 'pt-en'))).toEqual(['run_teste'])
  })
})
