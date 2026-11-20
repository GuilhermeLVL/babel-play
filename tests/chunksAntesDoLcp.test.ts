/**
 * O QUE CHEGA ANTES DO LCP (carga-rapida-no-celular, 1.2 e 2.5): a leitura do JSON do Lighthouse e o veredito
 * contra a meta do `/app` no celular (`slo.json` → `frontend.appMobile`).
 */
import { describe, expect, it } from 'vitest'

import { analisar, avaliarAppMobile, nomeDoPedaco } from '../scripts/perf/chunks-antes-do-lcp.mjs'
import { carregarSlo } from '../scripts/perf/suite/slo.mjs'

const pedido = (url: string, fim: number, kb: number, tipo = 'Script') => ({
  url: `https://frasy.com.br${url}`,
  networkRequestTime: 600,
  networkEndTime: fim,
  transferSize: kb * 1024,
  resourceType: tipo,
})

const relatorio = {
  finalDisplayedUrl: 'https://frasy.com.br/app',
  configSettings: { throttlingMethod: 'devtools' },
  audits: {
    'largest-contentful-paint': { numericValue: 3000 },
    'first-contentful-paint': { numericValue: 2000 },
    'network-requests': {
      details: {
        items: [
          pedido('/app', 600, 2, 'Document'),
          pedido('/assets/index-AbC123de.js', 2500, 90),
          pedido('/assets/vendor-supabase-DGhDXxpu.js', 2900, 61),
          pedido('/assets/IChat-Cg59B6i8.js', 4000, 18),
        ],
      },
    },
  },
}

describe('chunks antes do LCP', () => {
  it('soma só o JS que terminou antes do LCP e marca os pedaços vigiados', () => {
    const r = analisar(relatorio)
    expect(r.lcp).toBe(3000)
    expect(r.jsAteLcpKB).toBe(151)
    expect(r.jsTotalKB).toBe(169)
    expect(r.vigiadosAntes).toEqual(['vendor-supabase'])
  })

  it('tira o hash do Vite do nome', () => {
    expect(nomeDoPedaco('/assets/vendor-supabase-DGhDXxpu.js')).toBe('vendor-supabase')
    expect(nomeDoPedaco('/assets/TrilhoDoQuest-dLurVnZj.js?x=1')).toBe('TrilhoDoQuest')
  })

  it('o veredito usa as metas do slo.json (LCP 2500 ms e 300 KB)', () => {
    const metas = carregarSlo().frontend.appMobile
    expect(metas).toMatchObject({ rota: '/app', lcpMaxMs: 2500, jsAteLcpMaxKB: 300 })
    expect(avaliarAppMobile({ lcp: 2400, jsAteLcpKB: 150 }, metas)).toEqual([])
    expect(avaliarAppMobile({ lcp: 7442, jsAteLcpKB: 553 }, metas)).toHaveLength(2)
  })
})
