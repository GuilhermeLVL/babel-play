/**
 * O INVENTÁRIO DE CONFIGURAÇÃO É O ÚNICO LUGAR ONDE VARIÁVEL EXISTE (auditoria de 2026-09-07,
 * achado A60).
 *
 * `server/lib/config.ts` se apresenta como "o contrato": é ele que `/api/health` e o boot usam para
 * dizer o que falta. Só que ele era mantido à mão, e o código foi crescendo por fora: `S3_*`,
 * `ASAAS_*`, `LLM_RESERVA_*`, `*_STORAGE_MB` e `ANKI_MEDIA_DIR` eram lidas em produção e não
 * apareciam no inventário — um operador que seguisse o contrato subia um SaaS sem cobrança, sem
 * armazenamento de objetos e sem provedor de reserva, e nada avisava.
 *
 * Um documento que precisa de disciplina para não mentir mente. Este teste varre o código e falha
 * quando alguém lê uma variável que o inventário não declara, ou declara uma que ninguém lê.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { VARIAVEIS } from '../../server/lib/config'

/** Arquivos de servidor. `server.ts` entra porque é onde metade das leituras acontece. */
function arquivosDeServidor(dir = 'server', fora: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivosDeServidor(caminho, fora)
    else if (nome.endsWith('.ts')) fora.push(caminho)
  }
  return fora
}

/**
 * Comentários fora, e isto não é detalhe: o próprio `config.ts` explica o problema escrevendo
 * `process.env.X` na documentação, e sem esta limpeza o teste "descobriria" uma variável chamada X.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * As variáveis LIDAS pelo código, em três formas:
 *  - `process.env.NOME` e `process.env['NOME']` — a leitura direta;
 *  - `env.NOME` — pelo objeto que o próprio `config.ts` exporta;
 *  - `const { A, B } = env` — a desestruturação que `armazenamento.ts` usa para o S3.
 */
function variaveisLidas(): Map<string, string[]> {
  const achadas = new Map<string, string[]>()
  const anota = (nome: string, arquivo: string) => {
    const onde = achadas.get(nome) ?? []
    if (!onde.includes(arquivo)) onde.push(arquivo)
    achadas.set(nome, onde)
  }

  for (const arquivo of [...arquivosDeServidor(), 'server.ts']) {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'))
    for (const m of fonte.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) anota(m[1], arquivo)
    for (const m of fonte.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) anota(m[1], arquivo)
    for (const m of fonte.matchAll(/(?<![\w.])env\.([A-Z][A-Z0-9_]*)/g)) anota(m[1], arquivo)
    for (const m of fonte.matchAll(/const\s*\{([^}]+)\}\s*=\s*(?:process\.)?env\b/g)) {
      for (const bruto of m[1].split(',')) {
        const nome = bruto.split(':')[0].trim()
        if (/^[A-Z][A-Z0-9_]*$/.test(nome)) anota(nome, arquivo)
      }
    }
  }
  return achadas
}

/**
 * Nomes montados em tempo de execução, que varredura nenhuma acha: `capDeArmazenamento` lê
 * `${plano.toUpperCase()}_STORAGE_MB` e `usageQuota` faz o mesmo com as cotas mensais. Ficam aqui,
 * por extenso, porque a alternativa é o inventário mentir por omissão — que é o defeito original.
 */
const MONTADAS_EM_RUNTIME = [
  'PRO_STORAGE_MB', 'ESSENCIAL_STORAGE_MB',
  'PRO_MONTHLY_MANAGED_CALLS', 'ESSENCIAL_MONTHLY_MANAGED_CALLS',
  'PRO_MONTHLY_STT_SECONDS', 'ESSENCIAL_MONTHLY_STT_SECONDS',
]

const declaradas = new Set(VARIAVEIS.map((v) => v.nome))

describe('inventário de configuração', () => {

  it('toda variável lida pelo servidor está declarada', () => {
    const lidas = variaveisLidas()
    const faltando = [...lidas.entries()]
      .filter(([nome]) => !declaradas.has(nome))
      .map(([nome, onde]) => `${nome} (lida em ${onde.join(', ')})`)
    expect(faltando, 'declare em server/lib/config.ts: o inventário é o contrato do deploy').toEqual([])
  })

  it('toda variável declarada é lida em algum lugar', () => {
    const lidas = new Set(variaveisLidas().keys())
    const sobrando = [...declaradas].filter((n) => !lidas.has(n) && !MONTADAS_EM_RUNTIME.includes(n))
    expect(sobrando, 'declarada e nunca lida: ou o código sumiu, ou o nome está errado').toEqual([])
  })

  it('está em ordem alfabética — o diff de um contrato precisa ser legível', () => {
    const nomes = VARIAVEIS.map((v) => v.nome)
    expect(nomes).toEqual([...nomes].sort())
  })

  it('nenhuma declaração sem explicação de PARA QUÊ', () => {
    const mudas = VARIAVEIS.filter((v) => !v.paraQue || v.paraQue.trim().length < 10).map((v) => v.nome)
    expect(mudas).toEqual([])
  })
})

/**
 * `.env.example` é o que a pessoa copia para começar. Uma variável que impede o serviço e não
 * aparece lá é uma armadilha: o deploy sobe, responde 200 no health e falha no primeiro request
 * que precisa dela.
 */
describe('.env.example acompanha o inventário', () => {
  const exemplo = readFileSync('.env.example', 'utf8')
  const nomesNoExemplo = new Set(
    [...semComentarios(exemplo).matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
  )

  it('declara todas as que impedem o serviço', () => {
    const criticas = VARIAVEIS.filter((v) => v.criticidade === 'impede-servico').map((v) => v.nome)
    const ausentes = criticas.filter((n) => !nomesNoExemplo.has(n))
    expect(ausentes, 'sem isto o operador descobre a variável pelo erro em produção').toEqual([])
  })

  it('não inventa variável que o código não conhece', () => {
    const desconhecidas = [...nomesNoExemplo].filter((n) => !declaradas.has(n) && !n.startsWith('VITE_'))
    expect(desconhecidas, 'variável no exemplo que o servidor não lê: ou foi removida, ou está com outro nome').toEqual([])
  })
})
