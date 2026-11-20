/**
 * HARNESS DO ESTÚDIO DO AVATAR (só desenvolvimento): monta o `EstudioDoAvatar` fora do app, para o E2E e para as
 * capturas. Abrir: `/tests/e2e/avatar-harness/estudio.html?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=280`.
 *
 * Parâmetros: `fonte`, `tier` (fraco|medio|forte), `tamanho`, `pecas=a,b` (ids ligados de início), `posse=a,b` (itens da
 * loja que a pessoa já tem), `seeds=N`. `window.__estudioHarness` deixa o teste ler a receita e o relatório das peças.
 * Não é uma tela do produto: nada daqui entra no build (a única entrada do Vite é o `index.html` do app).
 */
import '../../../src/index.css'
import '../../../src/styles/quest.css'

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import EstudioDoAvatar from '../../../src/components/avatar/EstudioDoAvatar'
import { receitaNova } from '../../../src/core/avatar/edicao'
import { ligarPeca } from '../../../src/core/avatar/estudio'
import type { ReceitaDeAvatar } from '../../../src/core/avatar/receita'
import type { TierDoAvatar } from '../../../src/core/avatar/tiers'
import type { RelatorioDePecas } from '../../../src/lib/avatar/pecas3d'
import { hidratarPosse } from '../../../src/lib/loja'

const q = new URLSearchParams(location.search)
const fonte = q.get('fonte') ?? '/avatares/dev/milk.vrm'
const tier = (q.get('tier') ?? 'medio') as TierDoAvatar
const tamanho = Number(q.get('tamanho') ?? 280)
const lista = (nome: string) => (q.get(nome) ?? '').split(',').filter(Boolean)

hidratarPosse(lista('posse').map((alvo) => `avatar-${alvo}`))

let inicial: ReceitaDeAvatar = receitaNova(
  { origem: 'colecao', id: 'milk' },
  q.get('nome') ?? 'Ana Souza',
  1_790_000_000_000,
)
for (const id of lista('pecas')) inicial = ligarPeca(inicial, id).receita

interface Ponte {
  receita(): ReceitaDeAvatar
  relatorio(): RelatorioDePecas | null
  miniaturas(): string[]
  requisicoes(): string[]
}
declare global {
  interface Window {
    __estudioHarness?: Ponte
  }
}

let atual = inicial
let relatorio: RelatorioDePecas | null = null
const miniaturas: string[] = []
window.__estudioHarness = {
  receita: () => atual,
  relatorio: () => relatorio,
  miniaturas: () => miniaturas.slice(),
  requisicoes: () =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => new URL(u, location.href).origin !== location.origin),
}

function Harness() {
  const [receita, setReceita] = useState(inicial)
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto' }}>
      <EstudioDoAvatar
        receita={receita}
        aoMudar={(r) => {
          atual = r
          setReceita(r)
        }}
        tier={tier}
        fonte={fonte}
        tamanho={tamanho}
        nivel={1}
        saldoSeeds={Number(q.get('seeds') ?? 0)}
        aoMiniatura={(u) => miniaturas.push(u)}
        aoPecas={(r) => {
          relatorio = r
        }}
      />
    </main>
  )
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
