/**
 * A PÁGINA `/desempenho` DO SITE PÚBLICO (openspec `latencia-publicada-por-aparelho`, tarefa 2.3): só existe com a flag na lista
 * do build, o `latencia.json` válido e fresco e ao menos uma célula `ok`; some do sitemap sem qualquer um deles.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { gerarSite, lerLatenciaDoBuild, opcoesDoAmbiente } from '../scripts/site/gerar'
import { agregarLatencia } from '../src/core/latencia/agregarLatencia'

const PASTA = path.resolve('content/guias')
const dir = mkdtempSync(path.join(tmpdir(), 'desempenho-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const HOJE = new Date()
const COM_DADOS = agregarLatencia(
  [
    { classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 100, 140, 0, 0, 0, 0, 0], falas: 250, falhas: 10 },
    { classe: 'quest', idioma: 'en', baldes: [0, 0, 50, 0, 0, 0, 0, 0, 0], falas: 50, falhas: 0 },
  ],
  HOJE,
)
const SEM_OK = agregarLatencia(
  [{ classe: 'quest', idioma: 'en', baldes: [0, 0, 50, 0, 0, 0, 0, 0, 0], falas: 50, falhas: 0 }],
  HOJE,
)

function arquivo(nome: string, conteudo: unknown): string {
  const p = path.join(dir, nome)
  writeFileSync(p, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo))
  return p
}

const site = (env: Record<string, string | undefined>) =>
  gerarSite(opcoesDoAmbiente({ VITE_PUBLIC_URL: 'https://frasy.exemplo.test', ...env }, PASTA, '5.3.0').opcoes)

describe('/desempenho no build', () => {
  const dados = arquivo('latencia.json', COM_DADOS)

  it('flag + arquivo válido: a página sai, com a tabela, a definição e as ressalvas, e entra no sitemap', () => {
    const s = site({ SITE_FLAGS_DE_VENDA: 'latencia_publicada', SITE_LATENCIA_ARQUIVO: dados })
    const html = s.get('desempenho.html')!
    expect(html).toContain('<link rel="canonical" href="https://frasy.exemplo.test/desempenho">')
    expect(html).toContain('Metade das legendas em até <strong>1,5 s</strong>')
    expect(html).toContain('Amostra ainda pequena para publicar')
    expect(html).toContain('Não é uma garantia')
    expect(html).toContain('adultos que aceitaram enviar métricas')
    expect(html).toContain('limite da faixa')
    expect(html).not.toMatch(/garantido|só hoje|mais rápido que/i)
    expect(s.get('sitemap.xml')!).toContain('https://frasy.exemplo.test/desempenho')
  })

  it('flag fora da lista, sem arquivo, arquivo inválido, velho ou sem célula ok: NÃO gera e fora do sitemap', () => {
    const casos: Record<string, string | undefined>[] = [
      { SITE_LATENCIA_ARQUIVO: dados },
      { SITE_FLAGS_DE_VENDA: 'latencia_publicada' },
      { SITE_FLAGS_DE_VENDA: 'latencia_publicada', SITE_LATENCIA_ARQUIVO: arquivo('lixo.json', '{nao é json') },
      {
        SITE_FLAGS_DE_VENDA: 'latencia_publicada',
        SITE_LATENCIA_ARQUIVO: arquivo('extra.json', { ...COM_DADOS, extra: 1 }),
      },
      {
        SITE_FLAGS_DE_VENDA: 'latencia_publicada',
        SITE_LATENCIA_ARQUIVO: arquivo('velho.json', { ...COM_DADOS, geradoEm: '2020-01-01' }),
      },
      { SITE_FLAGS_DE_VENDA: 'latencia_publicada', SITE_LATENCIA_ARQUIVO: arquivo('vazio.json', SEM_OK) },
    ]
    for (const env of casos) {
      const s = site(env)
      expect(s.has('desempenho.html')).toBe(false)
      expect(s.get('sitemap.xml')!).not.toContain('/desempenho')
    }
  })

  it('lerLatenciaDoBuild nunca derruba o build', () => {
    expect(lerLatenciaDoBuild(undefined)).toBeNull()
    expect(lerLatenciaDoBuild('/não/existe.json')).toBeNull()
    expect(lerLatenciaDoBuild(dados)).toEqual(COM_DADOS)
  })
})
