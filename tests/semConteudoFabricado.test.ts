/**
 * C1 — NENHUMA TELA PODE APRESENTAR CONTEÚDO CRAVADO COMO DADO DO USUÁRIO.
 *
 * `openspec/project.md` estabelece que "a UI não exibe falsa precisão", e a auditoria elegeu a
 * honestidade estatística como a identidade do produto. Mesmo assim, a aba de Sessão trazia uma
 * tabela inteira — "Termo / Expressão · Tradução Contextual · Categoria · Ocorrências" — com
 * `heuristics 2×`, `leverage 5×` e `bottleneck 3×` cravados no JSX, idênticos para toda sessão de
 * todo usuário, incluindo contagens de ocorrência inventadas.
 *
 * DUAS COISAS TORNAM ISTO PIOR QUE UM BUG COMUM:
 *
 * Primeira: eu relatei ter removido o conteúdo fabricado. Removi as 4 "Dicas de Vocabulário" e
 * não vi a tabela. Quem encontrou foi a verificação executável da reauditoria, não a leitura —
 * e é exatamente por isso que este teste existe em vez de uma promessa de atenção.
 *
 * Segunda: o dado falso era PLAUSÍVEL. Uma sessão sobre tecnologia bem que poderia conter
 * "leverage" e "bottleneck". Conteúdo fabricado que parece certo não é descoberto por olhar.
 *
 * O teste varre o JSX ignorando comentários — este repositório documenta densamente o que foi
 * removido, e a armadilha está registrada em `docs/ux-audit/PROTOCOLO.md`: ler comentário produz
 * falso-negativo aqui e produziria falso-POSITIVO no caso simétrico.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Remove comentários de bloco, de linha e os JSX `{/* … *\/}`. */
const semComentarios = (txt: string) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * As palavras do painel de demonstração original. Não é lista de palavras proibidas — é a
 * assinatura daquele conteúdo específico, e serve de canário: se voltarem ao JSX, voltou o
 * mesmo padrão de fabricar dado que parece medido.
 */
const CANARIOS = ['basically', 'leverage', 'heuristics', 'synergy', 'bottleneck', 'volatility']

const TELAS = [
  'src/components/views/Analysis.tsx',
  'src/components/views/Metrics.tsx',
  'src/components/views/Reading.tsx',
]

describe('nenhuma palavra de demonstração sobrevive no código de tela', () => {
  for (const rel of TELAS) {
    it(rel, () => {
      const vivo = semComentarios(readFileSync(path.join(process.cwd(), rel), 'utf8'))
      const achadas = CANARIOS.filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(vivo))
      expect(achadas).toEqual([])
    })
  }
})

describe('a alternativa honesta continua disponível', () => {
  it('Analysis usa a primitiva <SemDado> em vez de preencher o vazio', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/components/views/Analysis.tsx'), 'utf8')
    expect(semComentarios(src)).toMatch(/<SemDado/)
  })

  it('o painel de topologia lexical continua vivo — ele usa dado REAL do deck', () => {
    // Guarda contra a correção exagerada: `selectedLexicalWord` e o ScatterChart são alimentados
    // por `vocabCards`, e apagá-los junto com a tabela falsa perderia informação verdadeira.
    const vivo = semComentarios(readFileSync(path.join(process.cwd(), 'src/components/views/Analysis.tsx'), 'utf8'))
    expect(vivo).toMatch(/ScatterChart/)
    expect(vivo).toMatch(/setSelectedLexicalWord/)
  })
})
