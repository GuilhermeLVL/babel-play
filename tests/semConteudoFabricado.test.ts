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
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/** Remove comentários de bloco, de linha e os JSX `{/* … *\/}`. */
const semComentarios = (txt: string) => txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

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
  it('Analysis diz que o dado falta em vez de preencher o vazio', () => {
    /* A Visão geral seguiu o protótipo aprovado (cartões de número e "Ritmo por falante"): sem o tempo
       das falas, o número mostra "—" (quem monta é a Análise) e o cartão do ritmo diz o motivo (quem
       desenha é `VisaoGeralDoQuest`), em vez de um número. */
    const vivo = semComentarios(readFileSync(path.join(process.cwd(), 'src/components/views/Analysis.tsx'), 'utf8'))
    const visao = semComentarios(
      readFileSync(path.join(process.cwd(), 'src/components/views/analise/quest/VisaoGeralDoQuest.tsx'), 'utf8'),
    )
    expect(visao).toMatch(/fluencia\.ritmo\.length \?/)
    expect(visao).toMatch(/Requer o tempo de cada fala/)
    expect(vivo).toMatch(/realSilencio != null \? .* : '—'/)
    expect(vivo).toMatch(/realLongPauses != null \? .* : '—'/)
    expect(vivo).toMatch(/realVicios\.palavras > 0 \? .* : '—'/)
  })

  it('a topologia lexical continua sobre dado REAL do deck e da transcrição', () => {
    // "Palavras novas" conta os cartões da sessão; os microdados contam as vezes em que a palavra
    // aparece nas falas de verdade (`parsedSentences`).
    const vivo = semComentarios(readFileSync(path.join(process.cwd(), 'src/components/views/Analysis.tsx'), 'utf8'))
    expect(vivo).toMatch(/palavrasDaSessao\.length/)
    expect(vivo).toMatch(/vezes: vezesNaSessao\(palavra\)/)
    expect(vivo).toMatch(/const vezesNaSessao = [\s\S]{0,400}parsedSentences\.reduce/)
  })
})
