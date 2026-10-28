/**
 * HARNESS DO AVATAR (só desenvolvimento): monta o `AvatarCanvas` fora do app, para o E2E.
 *
 * Abrir: `/tests/e2e/avatar-harness/index.html?fonte=/avatares/dev/milk.vrm&tier=medio&tamanho=256`.
 * `window.__avatarHarness` deixa o teste trocar estado e emoção, desmontar e ler os erros reportados.
 * Não é uma tela do produto: nada daqui entra no build (`index.html` do app é a única entrada do Vite).
 */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import AvatarCanvas from '../../../src/components/avatar/AvatarCanvas'
import { type EmocaoDoAvatar, EMOCOES_DO_AVATAR, type EstadoDoAvatar } from '../../../src/core/avatar/estados'
import { validarReceita } from '../../../src/core/avatar/receita'
import type { TierDoAvatar } from '../../../src/core/avatar/tiers'

const q = new URLSearchParams(location.search)
const fonte = q.get('fonte') ?? '/avatares/dev/milk.vrm'
const tier = (q.get('tier') ?? 'medio') as TierDoAvatar
const tamanho = Number(q.get('tamanho') ?? 256)

const r = validarReceita({
  versao: 1,
  base: { origem: 'colecao', id: 'milk' },
  paleta: { pele: 'pele-3', cabelo: 'cabelo-1', olhos: 'olhos-2' },
  pecas: [],
  ajustes: {},
  meta: { nome: q.get('nome') ?? 'Ana Souza', criadoEm: 1_790_000_000_000 },
})
if (!('receita' in r)) throw new Error(r.erros.join('; '))
const receita = r.receita

interface Ponte {
  mudar(estado: EstadoDoAvatar, emocao: EmocaoDoAvatar): void
  desmontar(): void
  erros: string[]
  emocoes: readonly string[]
}
declare global {
  interface Window {
    __avatarHarness?: Ponte
  }
}

function Harness() {
  const [estado, setEstado] = useState<EstadoDoAvatar>('parado')
  const [emocao, setEmocao] = useState<EmocaoDoAvatar>('neutro')
  const [montado, setMontado] = useState(true)
  useEffect(() => {
    window.__avatarHarness = {
      mudar: (e, em) => {
        setEstado(e)
        setEmocao(em)
      },
      desmontar: () => setMontado(false),
      erros: window.__avatarHarness?.erros ?? [],
      emocoes: EMOCOES_DO_AVATAR,
    }
  }, [])
  if (!montado) return <p id="desmontado">desmontado</p>
  return (
    <AvatarCanvas
      receita={receita}
      estado={estado}
      emocao={emocao}
      tier={tier}
      tamanho={tamanho}
      fonte={fonte}
      aoErro={(m) => window.__avatarHarness?.erros.push(m)}
    />
  )
}

window.__avatarHarness = { mudar: () => undefined, desmontar: () => undefined, erros: [], emocoes: EMOCOES_DO_AVATAR }
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
