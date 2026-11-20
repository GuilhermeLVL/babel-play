/**
 * A conferência somente-leitura da produção (`scripts/producao/conferir-producao.mjs`): as decisões puras de
 * `scripts/producao/conferencia.mjs` e a ordem/quantidade das requisições, com a rede SIMULADA (nada sai daqui).
 */
import { describe, expect, it } from 'vitest'

import {
  ARQUIVO_DE_VOZ,
  avaliarAbertura,
  avaliarAdsTxt,
  avaliarCabecalhos,
  avaliarFlags,
  avaliarHealth,
  avaliarModelo,
  avaliarOrigemDireta,
  avaliarPagina,
  avaliarReady,
  avaliarRobots,
  avaliarSitemap,
  ehFlagDeRisco,
  flagsLigadas,
  lerArgumentos,
  resumir,
} from '../scripts/producao/conferencia.mjs'
import { conferir } from '../scripts/producao/conferir-producao.mjs'
import { ARQUIVOS_DO_SUPERTONIC } from '../src/core/voz/supertonic'

const estados = (itens: Array<{ estado: string }>) => itens.map((i) => i.estado)

const CABECALHOS_BONS = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless',
  'document-isolation-policy': 'isolate-and-credentialless',
}

describe('avaliarHealth', () => {
  it('ok com status ok, db up e versão', () => {
    const [i] = avaliarHealth(200, { status: 'ok', db: 'up', banco: 'postgres', versao: '0.1.0+abc1234' })
    expect(i.estado).toBe('ok')
    expect(i.detalhe).toContain('0.1.0+abc1234')
  })
  it('falha com db down, status degraded, sem JSON ou 503', () => {
    expect(estados(avaliarHealth(200, { status: 'ok', db: 'down' }))).toEqual(['falha'])
    expect(estados(avaliarHealth(200, { status: 'degraded', db: 'up' }))).toEqual(['falha'])
    expect(estados(avaliarHealth(200, null))).toEqual(['falha'])
    expect(estados(avaliarHealth(503, {}))).toEqual(['falha'])
  })
  it('avisa sem versão', () => {
    expect(estados(avaliarHealth(200, { status: 'ok', db: 'up' }))).toEqual(['aviso'])
  })
  it('429 diz para não repetir', () => {
    expect(avaliarHealth(429, null)[0].detalhe).toMatch(/NÃO repita/)
  })
})

describe('avaliarReady', () => {
  it('200 ok; degradado avisa; 503 falha', () => {
    expect(estados(avaliarReady(200, { status: 'ok' }))).toEqual(['ok'])
    expect(estados(avaliarReady(200, { status: 'degradado', armazenamento: 'indisponivel' }))).toEqual(['aviso'])
    expect(estados(avaliarReady(503, {}))).toEqual(['falha'])
  })
})

describe('avaliarAbertura', () => {
  const fechado = { cadastro: false, checkout: false, anual: false }
  it('sem --esperar-fechado só informa', () => {
    expect(estados(avaliarAbertura(200, { cadastro: true, checkout: true, anual: false }))).toEqual(['ok'])
  })
  it('com --esperar-fechado reprova qualquer porta aberta ou indefinida', () => {
    expect(estados(avaliarAbertura(200, fechado, { esperarFechado: true }))).toEqual(['ok'])
    const aberto = avaliarAbertura(200, { ...fechado, checkout: true }, { esperarFechado: true })
    expect(aberto[0].estado).toBe('falha')
    expect(aberto[0].detalhe).toContain('checkout')
    expect(estados(avaliarAbertura(200, { cadastro: false }, { esperarFechado: true }))).toEqual(['falha'])
  })
})

describe('flags', () => {
  const corpo = {
    flags: {
      oferta_planos: { ligada: true },
      venda_planos_v4: { ligada: false },
      recompensas_v2: { ligada: true, payload: { x: 1 } },
    },
  }
  it('lista as ligadas em ordem', () => {
    expect(flagsLigadas(corpo)).toEqual(['oferta_planos', 'recompensas_v2'])
    expect(flagsLigadas({})).toBeNull()
  })
  it('classifica as de risco (venda, IA, anúncio, avatar)', () => {
    for (const k of [
      'venda_planos_v3',
      'vender_planos',
      'venda_familia',
      'ia_de_estudo',
      'nuvem_gratuita_alivio',
      'avatar_3d',
    ]) {
      expect(ehFlagDeRisco(k)).toBe(true)
    }
    for (const k of ['anuncios', 'stt_ao_vivo', 'voz_natural', 'assistente_ao_vivo', 'audiolivros_nuvem']) {
      expect(ehFlagDeRisco(k)).toBe(true)
    }
    for (const k of ['oferta_planos', 'recompensas_v2', 'voz_no_aparelho', 'stt_aparelho_primeiro']) {
      expect(ehFlagDeRisco(k)).toBe(false)
    }
  })
  it('com --esperar-fechado reprova flag de risco ligada; sem ela só lista', () => {
    expect(estados(avaliarFlags(200, corpo, { esperarFechado: true }))).toEqual(['ok'])
    const comVenda = { flags: { ...corpo.flags, venda_planos_v4: { ligada: true } } }
    const [f] = avaliarFlags(200, comVenda, { esperarFechado: true })
    expect(f.estado).toBe('falha')
    expect(f.detalhe).toContain('venda_planos_v4')
    expect(estados(avaliarFlags(200, comVenda))).toEqual(['ok'])
  })
  it('forma errada ou status ruim falham', () => {
    expect(estados(avaliarFlags(200, { coisa: 1 }))).toEqual(['falha'])
    expect(estados(avaliarFlags(503, null))).toEqual(['falha'])
  })
})

describe('avaliarCabecalhos', () => {
  it('tudo presente passa', () => {
    expect(estados(avaliarCabecalhos(200, CABECALHOS_BONS))).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
  })
  it('nomes sem caixa', () => {
    const maiusculos = Object.fromEntries(Object.entries(CABECALHOS_BONS).map(([k, v]) => [k.toUpperCase(), v]))
    expect(estados(avaliarCabecalhos(200, maiusculos))).not.toContain('falha')
  })
  it('CSP ausente ou só Report-Only falha', () => {
    const { 'content-security-policy': _csp, ...semCsp } = CABECALHOS_BONS
    expect(avaliarCabecalhos(200, semCsp)[1]).toMatchObject({ estado: 'falha', detalhe: 'ausente' })
    const reportOnly = { ...semCsp, 'content-security-policy-report-only': "default-src 'self'" }
    expect(avaliarCabecalhos(200, reportOnly)[1].detalhe).toMatch(/Report-Only/)
  })
  it('HSTS ausente falha, curto avisa; nosniff ausente falha', () => {
    const { 'strict-transport-security': _h, ...semHsts } = CABECALHOS_BONS
    expect(avaliarCabecalhos(200, semHsts)[2].estado).toBe('falha')
    expect(avaliarCabecalhos(200, { ...CABECALHOS_BONS, 'strict-transport-security': 'max-age=60' })[2].estado).toBe(
      'aviso',
    )
    const { 'x-content-type-options': _x, ...semX } = CABECALHOS_BONS
    expect(avaliarCabecalhos(200, semX)[3].estado).toBe('falha')
  })
  it('isolamento: o modo dip (só DIP) passa; sem COOP/COEP nem DIP falha', () => {
    const {
      'cross-origin-opener-policy': _a,
      'cross-origin-embedder-policy': _b,
      'document-isolation-policy': _c,
      ...semIsolamento
    } = CABECALHOS_BONS
    expect(avaliarCabecalhos(200, semIsolamento)[4].estado).toBe('falha')
    expect(
      avaliarCabecalhos(200, { ...semIsolamento, 'document-isolation-policy': 'isolate-and-credentialless' })[4].estado,
    ).toBe('ok')
  })
  it('home fora do ar é uma falha só', () => {
    expect(estados(avaliarCabecalhos(502, {}))).toEqual(['falha'])
  })
})

describe('páginas públicas', () => {
  it('robots: com sitemap ok; Disallow: / avisa; 404 falha', () => {
    expect(estados(avaliarRobots(200, 'User-agent: *\nAllow: /\nSitemap: https://x/sitemap.xml'))).toEqual(['ok'])
    expect(estados(avaliarRobots(200, 'User-agent: *\nDisallow: /\n'))).toEqual(['aviso'])
    expect(estados(avaliarRobots(200, 'User-agent: *\nDisallow: /app\n'))).toEqual(['aviso'])
    expect(estados(avaliarRobots(404, ''))).toEqual(['falha'])
  })
  it('sitemap conta as URLs e exige <urlset>', () => {
    expect(avaliarSitemap(200, '<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>')[0].detalhe).toBe(
      '2 URL(s)',
    )
    expect(estados(avaliarSitemap(200, '<html>'))).toEqual(['falha'])
  })
  it('ads.txt nunca reprova', () => {
    expect(estados(avaliarAdsTxt(404, ''))).toEqual(['aviso'])
    expect(estados(avaliarAdsTxt(200, 'google.com, pub-1, DIRECT'))).toEqual(['ok'])
  })
  it('página: 200 com HTML e o trecho', () => {
    expect(estados(avaliarPagina('/planos', 200, '<html>R$ 19,90</html>', { contem: 'R$' }))).toEqual(['ok'])
    expect(estados(avaliarPagina('/planos', 200, '<html>sem preço</html>', { contem: 'R$' }))).toEqual(['falha'])
    expect(estados(avaliarPagina('/app', 200, '{}'))).toEqual(['falha'])
    expect(estados(avaliarPagina('/app', 500, ''))).toEqual(['falha'])
  })
})

describe('modelo de voz e origem direta', () => {
  it('o arquivo conhecido é o mesmo do código da voz', () => {
    expect(ARQUIVO_DE_VOZ).toEqual({
      caminho: ARQUIVOS_DO_SUPERTONIC[0].caminho,
      bytes: ARQUIVOS_DO_SUPERTONIC[0].bytes,
    })
  })
  it('tamanho certo e CORS da origem passam; tamanho errado falha; CORS ausente avisa', () => {
    const origem = 'https://frasy.com.br'
    const bom = { 'content-length': String(ARQUIVO_DE_VOZ.bytes), 'access-control-allow-origin': origem }
    expect(estados(avaliarModelo(200, bom, { origem }))).toEqual(['ok', 'ok'])
    expect(estados(avaliarModelo(200, { ...bom, 'content-length': '10' }, { origem }))).toEqual(['falha', 'ok'])
    expect(estados(avaliarModelo(200, { 'content-length': String(ARQUIVO_DE_VOZ.bytes) }, { origem }))).toEqual([
      'ok',
      'aviso',
    ])
    expect(estados(avaliarModelo(404, {}, { origem }))).toEqual(['falha'])
  })
  it('origem direta: 403 ok, 200 falha', () => {
    expect(estados(avaliarOrigemDireta(403))).toEqual(['ok'])
    expect(estados(avaliarOrigemDireta(200))).toEqual(['falha'])
    expect(estados(avaliarOrigemDireta(0))).toEqual(['aviso'])
  })
})

describe('resumir e lerArgumentos', () => {
  it('código 1 só com falha', () => {
    expect(resumir([{ nome: 'a', estado: 'ok', detalhe: '' }]).codigo).toBe(0)
    expect(resumir([{ nome: 'a', estado: 'aviso', detalhe: '' }]).codigo).toBe(0)
    const r = resumir([
      { nome: 'a', estado: 'ok', detalhe: 'x' },
      { nome: 'b', estado: 'falha', detalhe: 'y' },
    ])
    expect(r.codigo).toBe(1)
    expect(r.texto).toContain('❌')
    expect(r.texto).toContain('1 ok, 0 aviso(s), 1 falha(s)')
  })
  it('lê as opções e exige https', () => {
    expect(lerArgumentos(['--url', 'https://frasy.com.br/', '--esperar-fechado'])).toMatchObject({
      url: 'https://frasy.com.br',
      esperarFechado: true,
      origem: null,
    })
    expect(() => lerArgumentos([])).toThrow(/--url/)
    expect(() => lerArgumentos(['--url', 'http://frasy.com.br'])).toThrow(/https/)
    expect(() => lerArgumentos(['--url'])).toThrow(/valor/)
    expect(() => lerArgumentos(['--url', 'https://a', '--x'])).toThrow(/desconhecido/)
  })
})

describe('conferir (rede simulada)', () => {
  it('faz no máximo 12 pedidos, só GET/HEAD, sem rota autenticada, e passa com um ambiente fechado', async () => {
    const pedidos: Array<{ url: string; metodo: string }> = []
    const respostas: Record<string, { status: number; cabecalhos?: Record<string, string>; texto?: string }> = {
      '/api/health': { status: 200, texto: JSON.stringify({ status: 'ok', db: 'up', versao: '1+abc' }) },
      '/api/ready': { status: 200, texto: JSON.stringify({ status: 'ok' }) },
      '/api/abertura': { status: 200, texto: JSON.stringify({ cadastro: false, checkout: false, anual: false }) },
      '/api/flags': { status: 200, texto: JSON.stringify({ flags: { oferta_planos: { ligada: true } } }) },
      '/': { status: 200, cabecalhos: CABECALHOS_BONS, texto: '<html>' },
      '/app': { status: 200, texto: '<html>' },
      '/planos': { status: 200, texto: '<html>R$ 19,90' },
      '/robots.txt': { status: 200, texto: 'Sitemap: https://x/sitemap.xml' },
      '/sitemap.xml': { status: 200, texto: '<urlset><loc>a</loc></urlset>' },
      '/ads.txt': { status: 404, texto: '' },
    }
    const buscar = async (url: string, { metodo = 'GET' }: { metodo?: string } = {}) => {
      pedidos.push({ url, metodo })
      const u = new URL(url)
      if (u.hostname === 'modelos.exemplo') {
        return {
          status: 200,
          cabecalhos: { 'content-length': String(ARQUIVO_DE_VOZ.bytes), 'access-control-allow-origin': '*' },
          texto: '',
        }
      }
      if (u.hostname === 'direto.exemplo') return { status: 403, cabecalhos: {}, texto: '' }
      const r = respostas[u.pathname]
      return { cabecalhos: {}, texto: '', ...r }
    }
    const itens = await conferir(
      {
        url: 'https://app.exemplo',
        esperarFechado: true,
        modelos: 'https://modelos.exemplo/supertonic-3',
        origem: 'https://direto.exemplo',
      },
      buscar,
    )
    expect(pedidos.length).toBeLessThanOrEqual(12)
    expect(new Set(pedidos.map((p) => p.metodo))).toEqual(new Set(['GET', 'HEAD']))
    expect(pedidos.map((p) => new URL(p.url).pathname)).not.toContain('/api/billing/status')
    expect(pedidos.find((p) => p.metodo === 'HEAD')?.url).toBe('https://modelos.exemplo/supertonic-3/onnx/tts.json')
    expect(resumir(itens).codigo).toBe(0)
  })
})
