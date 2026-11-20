// @vitest-environment jsdom
/**
 * O ACABAMENTO DA DEMONSTRAÇÃO (R38), achado no staging: a âncora do celular mostrava o MESMO anunciante da linha
 * patrocinada da tela onde ela mora (Estatísticas: "Fones Cochicho" duas vezes). A âncora usa outra marca que a das
 * linhas das telas que a montam (Estatísticas e Biblioteca).
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import EspacoDeDemonstracao from '../src/components/anuncios/demonstracao/EspacoDeDemonstracao'
import type { EspacoDeAnuncio, FormatoDeAnuncio } from '../src/core/anuncios/politicaDeAnuncio'

const nada = () => undefined

function marcaDe(espaco: EspacoDeAnuncio, formato: FormatoDeAnuncio = 'nativo'): string | null {
  const { container, unmount } = render(
    <EspacoDeDemonstracao espaco={espaco} formato={formato} aoSemAnuncios={nada} aoFechar={nada} />,
  )
  const marca = container.querySelector('[data-ad-cta]')?.getAttribute('data-ad-cta') ?? null
  unmount()
  return marca
}

afterEach(cleanup)

describe('demonstração: a âncora não repete o anunciante da tela', () => {
  it('a marca da âncora é outra que a da linha das Estatísticas e a da Biblioteca', () => {
    const ancora = marcaDe('ancora')
    expect(ancora).toBeTruthy()
    expect(ancora).not.toBe(marcaDe('estat-faixa'))
    expect(ancora).not.toBe(marcaDe('bib-infeed'))
  })

  it('a âncora traz a porta "Sem anúncios" sob o texto (não numa coluna que espremia o título)', () => {
    const { container } = render(
      <EspacoDeDemonstracao espaco="ancora" formato="nativo" aoSemAnuncios={nada} aoFechar={nada} />,
    )
    expect(container.querySelector('.ad-ancora-texto .ad-sem')).not.toBeNull()
  })
})
