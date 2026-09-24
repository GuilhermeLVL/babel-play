// @vitest-environment jsdom
/**
 * AS SUB-TELAS DE PLANOS NA URL — assinar, assinado, cancelar e a aba "Sua assinatura".
 *
 * O protótipo aprovado tem três telas de pagamento (checkout, confirmação, cancelamento) que
 * vivem "dentro" de Planos: o menu continua aceso em Planos e o "voltar" leva a Planos. No app
 * elas ganham endereço próprio (`/plano/<tela>`) sem virar views novas do App — a sub-rota é da
 * tela de Planos, do mesmo jeito que a query do filtro é da tela de Jogar.
 *
 * O contrato que importa: o App, ao espelhar "estou em Planos", NÃO apaga a sub-rota que a tela
 * escreveu. Sem isso, recarregar `/plano/assinado` (a volta do pagamento) cairia em `/plano`.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  estadoParaUrl,
  EVENTO_SUBTELA_DE_PLANOS,
  irParaSubTelaDePlanos,
  publicarUrl,
  urlParaEstado,
} from '../src/lib/rotas'

afterEach(() => window.history.replaceState({}, '', '/'))

describe('sub-telas de Planos', () => {
  it('cada sub-tela tem endereço próprio e faz a ida e volta', () => {
    for (const planosTela of ['assinar', 'assinado', 'cancelar', 'assinatura'] as const) {
      const url = estadoParaUrl({ view: 'planos', planosTela })
      expect(url).toBe(`/plano/${planosTela}`)
      expect(urlParaEstado(url)).toEqual({ view: 'planos', planosTela })
    }
  })

  it('o plural também abre a sub-tela', () => {
    expect(urlParaEstado('/planos/assinar')).toEqual({ view: 'planos', planosTela: 'assinar' })
  })

  it('sub-tela desconhecida degrada para Planos, nunca para o 404', () => {
    expect(urlParaEstado('/plano/qualquer-coisa')).toEqual({ view: 'planos' })
  })

  it('Planos sem sub-tela continua em /plano', () => {
    expect(estadoParaUrl({ view: 'planos' })).toBe('/plano')
    expect(urlParaEstado('/plano')).toEqual({ view: 'planos' })
  })

  it('espelhar "estou em Planos" não apaga a sub-rota que a tela escreveu', () => {
    window.history.replaceState({}, '', '/plano/assinado')
    publicarUrl({ view: 'planos' })
    expect(window.location.pathname).toBe('/plano/assinado')
  })

  it('o "Planos" do menu, numa sub-tela, volta à tela principal e avisa a tela', () => {
    window.history.replaceState({}, '', '/plano/assinar')
    let avisos = 0
    const contar = () => avisos++
    window.addEventListener(EVENTO_SUBTELA_DE_PLANOS, contar)
    irParaSubTelaDePlanos(null)
    window.removeEventListener(EVENTO_SUBTELA_DE_PLANOS, contar)
    expect(window.location.pathname).toBe('/plano')
    expect(avisos).toBe(1)
  })

  it('sair de Planos troca o endereço normalmente', () => {
    window.history.replaceState({}, '', '/plano/cancelar')
    publicarUrl({ view: 'hub' })
    expect(window.location.pathname).toBe('/')
  })
})
