/**
 * A SUÍTE DE CARGA (Fase 4) — as regras que decidem, sem subir servidor: o `slo.json` é válido e é
 * a fonte do CI, o veredito de nível, a classificação ok/degradação/erro, a mistura ponderada, o WAV
 * que o STT aceita e a janela de 429 do provedor falso. A carga de verdade roda no job `carga`.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { padroesDoSlo } from '../scripts/perf/ci-carga.mjs'
import {
  arquivosIniciais,
  avaliarOrcamento,
  casaCuringa as casaCuringaDoOrcamento,
} from '../scripts/perf/orcamento-bundle.mjs'
import { classificar, escolherPonderado, MISTURA_DE_ESTUDO, rng, wav } from '../scripts/perf/suite/cenarios.mjs'
import { criarLimitador, seguradoPeloProvedor } from '../scripts/perf/suite/provedor-falso.mjs'
import { avaliarNivel, carregarSlo, percentil, resumir, tetoP95 } from '../scripts/perf/suite/slo.mjs'
import { casaCuringa, FORA_DO_DIST, precomprimirDiretorio } from '../scripts/vite/precomprimir'

describe('slo.json — uma fonte para a suíte e para o CI', () => {
  const slo = carregarSlo()

  it('tem os números que docs/slo.md promete', () => {
    expect(tetoP95(slo, 'leitura')).toBeGreaterThan(0)
    expect(tetoP95(slo, 'gravacao')).toBeGreaterThanOrEqual(tetoP95(slo, 'leitura'))
    expect(tetoP95(slo, 'ia')).toBeGreaterThan(0)
    expect(slo.erroMaxPct).toBeLessThanOrEqual(slo.quebra.erroPct)
  })

  it('o CI lê o teto da classe declarada, não um número próprio', () => {
    const p = padroesDoSlo(slo)
    expect(p.p95Max).toBe(tetoP95(slo, slo.ci.classe))
    expect(p.conexoes).toBe(slo.ci.conexoes)
    expect(p.rotas).toEqual(slo.ci.rotas)
  })

  it('recusa um slo.json sem número ou com a classe do CI inexistente', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'slo-'))
    const escrever = (o: unknown) => {
      const f = path.join(dir, `${Math.random()}.json`)
      writeFileSync(f, JSON.stringify(o))
      return f
    }
    expect(() => carregarSlo(escrever({ ...slo, erroMaxPct: 0 }))).toThrow(/erroMaxPct/)
    expect(() => carregarSlo(escrever({ ...slo, ci: { ...slo.ci, classe: 'nenhuma' } }))).toThrow(/ci.classe/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('veredito de um nível', () => {
  const slo = carregarSlo()
  const dentro = {
    leitura: { n: 10, p95: 50 },
    gravacao: { n: 10, p95: 100 },
    upload: { n: 1, p95: 20 },
    ia: { n: 5, p95: 10 },
  }

  it('dentro do SLO', () => {
    expect(avaliarNivel({ porClasse: dentro, erroPct: 0 }, slo)).toEqual({
      dentroDoSlo: true,
      quebrou: false,
      falhas: [],
    })
  })

  it('p95 acima do SLO de uma classe QUEBRA e diz qual', () => {
    const v = avaliarNivel(
      { porClasse: { ...dentro, leitura: { n: 10, p95: tetoP95(slo, 'leitura') + 1 } }, erroPct: 0 },
      slo,
    )
    expect(v.quebrou).toBe(true)
    expect(v.falhas[0]).toMatch(/^leitura: p95/)
  })

  it('erro entre o SLO e o limiar de quebra: fora do SLO, mas não quebrou', () => {
    const meio = (slo.erroMaxPct + slo.quebra.erroPct) / 2
    const v = avaliarNivel({ porClasse: dentro, erroPct: meio }, slo)
    expect(v).toMatchObject({ dentroDoSlo: false, quebrou: false })
  })

  it('classe sem amostra não reprova', () => {
    expect(avaliarNivel({ porClasse: { upload: { n: 0, p95: null } }, erroPct: 0 }, slo).dentroDoSlo).toBe(true)
  })

  it('percentil nearest-rank e resumo', () => {
    const l = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentil(l, 95)).toBe(95)
    expect(percentil([], 95)).toBeNull()
    expect(resumir([3, 1, 2])).toEqual({ n: 3, p50: 2, p95: 3, p99: 3, max: 3 })
  })
})

describe('cenários', () => {
  it('429/503 da nuvem e do semáforo são degradação; outro 429 e 5xx são erro', () => {
    expect(classificar('vocab', 304, null)).toBe('ok')
    expect(classificar('stt', 429, 'nuvem_ocupada')).toBe('degradacao')
    expect(classificar('audio', 429, 'upload_ocupado')).toBe('degradacao')
    expect(classificar('settings', 429, 'rate_limited')).toBe('erro')
    expect(classificar('gastar', 402, 'saldo_insuficiente')).toBe('erro')
    expect(classificar('review', 500, null)).toBe('erro')
    expect(classificar('review', 0, null)).toBe('erro')
  })

  it('a mistura ponderada respeita os pesos', () => {
    const r = rng(42)
    const conta: Record<string, number> = {}
    for (let i = 0; i < 20_000; i++) {
      const f = escolherPonderado(MISTURA_DE_ESTUDO, r())
      conta[f] = (conta[f] ?? 0) + 1
    }
    const total = MISTURA_DE_ESTUDO.reduce((a, [, p]) => a + Number(p), 0)
    for (const [nome, peso] of MISTURA_DE_ESTUDO)
      expect(Math.abs(conta[nome] / 20_000 - Number(peso) / total)).toBeLessThan(0.02)
  })

  it('o WAV é PCM 16 bits mono coerente (o STT recusa o incoerente com 415)', () => {
    const b = wav(4)
    expect(b.toString('ascii', 0, 4)).toBe('RIFF')
    expect(b.readUInt16LE(20)).toBe(1)
    expect(b.readUInt16LE(22)).toBe(1)
    expect(b.readUInt32LE(28)).toBe(b.readUInt32LE(24) * 2)
    expect(b.readUInt32LE(40)).toBe(4 * 16_000 * 2)
  })
})

describe('provedor falso', () => {
  it('429 acima do RPM na janela deslizante, com Retry-After até o mais antigo sair', () => {
    let t = 0
    const limitar = criarLimitador(3, () => t)
    expect([limitar('stt'), limitar('stt'), limitar('stt')].every((x) => x.ok)).toBe(true)
    t = 10_000
    expect(limitar('stt')).toEqual({ ok: false, retryAfterS: 50 })
    expect(limitar('mt').ok).toBe(true)
    t = 60_001
    expect(limitar('stt').ok).toBe(true)
  })

  it('o tempo segurado viaja no texto', () => {
    expect(seguradoPeloProvedor('olá ⟨falso:412⟩')).toBe(412)
    expect(seguradoPeloProvedor('sem marca')).toBeNull()
  })
})

describe('orçamento do bundle e pré-compressão (frontend)', () => {
  it('lê do index.html a entrada, os modulepreload e o CSS', () => {
    const html = `<script type="module" crossorigin src="/assets/index-A.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-react-B.js">
      <link rel="stylesheet" crossorigin href="/assets/index-C.css">`
    expect(arquivosIniciais(html)).toEqual({
      js: ['/assets/index-A.js', '/assets/vendor-react-B.js'],
      css: ['/assets/index-C.css'],
    })
  })

  it('folha de outra origem (as fontes do Google no index.html) não é do bundle e fica fora da conta', () => {
    const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap" />
      <script type="module" crossorigin src="/assets/index-A.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-C.css">`
    expect(arquivosIniciais(html)).toEqual({ js: ['/assets/index-A.js'], css: ['/assets/index-C.css'] })
  })

  it('reprova acima do teto e com arquivo proibido, dizendo o quê', () => {
    const { frontend } = carregarSlo()
    expect(
      avaliarOrcamento({ jsGzipKB: frontend.jsInicialGzipMaxKB, cssGzipKB: 1, proibidosEncontrados: [] }, frontend),
    ).toEqual([])
    const f = avaliarOrcamento(
      {
        jsGzipKB: frontend.jsInicialGzipMaxKB + 1,
        cssGzipKB: frontend.cssInicialGzipMaxKB + 1,
        proibidosEncontrados: ['prototipo-consistencia.html'],
      },
      frontend,
    )
    expect(f).toHaveLength(3)
    expect(f[2]).toMatch(/prototipo-consistencia/)
  })

  it('o plugin do build e o orçamento proíbem os MESMOS arquivos', () => {
    expect(FORA_DO_DIST).toEqual(carregarSlo().frontend.proibidosNoDist)
    expect(casaCuringa('prototipo-*.html', 'prototipo-consistencia.html')).toBe(true)
    expect(casaCuringaDoOrcamento('prototipo-*.html', 'prototipo.html')).toBe(false)
    expect(casaCuringa('lucide.min.js', 'lucide.min.jsx')).toBe(false)
  })

  it('pré-comprime o que encolhe, pula o pequeno e o já comprimido, e tira o proibido', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'precomp-'))
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'assets', 'a.js'), 'const x = 1;\n'.repeat(500))
    writeFileSync(path.join(dir, 'assets', 'mini.js'), 'x')
    writeFileSync(path.join(dir, 'og.png'), Buffer.alloc(5000, 7))
    writeFileSync(path.join(dir, 'prototipo-consistencia.html'), '<p>proto</p>')
    writeFileSync(path.join(dir, 'lucide.min.js'), 'x'.repeat(5000))
    const r = precomprimirDiretorio(dir)
    expect(r.removidos.sort()).toEqual(['lucide.min.js', 'prototipo-consistencia.html'])
    expect(r.comprimidos).toBe(1)
    expect(existsSync(path.join(dir, 'assets', 'a.js.br'))).toBe(true)
    expect(existsSync(path.join(dir, 'assets', 'a.js.gz'))).toBe(true)
    expect(existsSync(path.join(dir, 'assets', 'mini.js.br'))).toBe(false)
    expect(existsSync(path.join(dir, 'og.png.br'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
