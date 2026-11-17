import { describe, expect, it } from 'vitest'

import {
  classificarFalha,
  comMarcaDeFalha,
  erroDoDetectorDeFala,
  mensagemDaFalha,
  mensagemDeFalha,
  mostraDetalheTecnico,
  semMarcaDeFalha,
  TIPOS_DE_FALHA,
} from '../src/core/falhas/mensagemDeFalha'

/** O regex da spec (`falhas-visiveis-e-contadas`): nada disto pode chegar à tela de produção. */
const TECNICO = /Failed to fetch|Worker error|protobuf|ERROR_CODE|Can't create|npm install|Erro na captura do sistema/

describe('classificarFalha', () => {
  it('TypeError de fetch (Chromium, Safari, Firefox) é download interrompido', () => {
    expect(classificarFalha(new TypeError('Failed to fetch'))).toBe('download-interrompido')
    expect(classificarFalha(new TypeError('Load failed'))).toBe('download-interrompido')
    expect(classificarFalha(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      'download-interrompido',
    )
  })

  it('sem rede, a falha de fetch vira "sem internet"', () => {
    expect(classificarFalha(new TypeError('Failed to fetch'), { online: false })).toBe('sem-internet')
  })

  it('sessão ONNX que não abre é modelo corrompido', () => {
    expect(
      classificarFalha(new Error("Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: protobuf parsing failed.")),
    ).toBe('modelo-corrompido')
    expect(classificarFalha('Deserialize tensor onnx::MatMul failed')).toBe('modelo-corrompido')
  })

  it('worker que não sobe', () => {
    expect(classificarFalha(new Error('Worker error'))).toBe('worker-indisponivel')
    expect(classificarFalha(new Error('Failed to load worker script'))).toBe('worker-indisponivel')
  })

  it('detector de fala (VAD)', () => {
    expect(classificarFalha(new Error('O detector de fala não pôde ser carregado'))).toBe('detector-de-fala')
  })

  it('compartilhamento negado (NotAllowedError ou a mensagem traduzida pela captura)', () => {
    const e = new Error('Permission denied')
    e.name = 'NotAllowedError'
    expect(classificarFalha(e)).toBe('compartilhamento-negado')
    expect(
      classificarFalha(
        new Error('Compartilhamento cancelado ou bloqueado. Clique novamente e escolha uma ABA/TELA com áudio.'),
      ),
    ).toBe('compartilhamento-negado')
  })

  it('a marca que o worker põe na mensagem vence o texto', () => {
    expect(classificarFalha(new Error(comMarcaDeFalha('download-interrompido', 'protobuf parsing failed')))).toBe(
      'download-interrompido',
    )
    expect(classificarFalha(comMarcaDeFalha('modelo-corrompido', 'qualquer'))).toBe('modelo-corrompido')
  })

  it('o desconhecido recebe a genérica', () => {
    expect(classificarFalha(new Error('xyz'))).toBe('desconhecida')
    expect(classificarFalha(undefined)).toBe('desconhecida')
  })
})

describe('mensagemDeFalha', () => {
  it('cada classe tem texto em pt-BR e uma ação, sem nada técnico', () => {
    for (const tipo of [...TIPOS_DE_FALHA, 'desconhecida' as const]) {
      const m = mensagemDeFalha(tipo)
      expect(m.texto.length).toBeGreaterThan(10)
      expect(m.acao.rotulo.length).toBeGreaterThan(3)
      expect(m.texto + m.acao.rotulo).not.toMatch(TECNICO)
    }
  })

  it('os textos combinados no design', () => {
    expect(mensagemDeFalha('download-interrompido')).toMatchObject({
      texto: 'A conexão caiu enquanto baixávamos o modelo.',
      acao: { tipo: 'baixar-de-novo', rotulo: 'Baixar de novo' },
    })
    expect(mensagemDeFalha('modelo-corrompido').texto).toBe('O modelo baixado veio com defeito. Já apagamos a cópia.')
    expect(mensagemDeFalha('sem-internet').texto).toBe(
      'Sem internet. Para legendar sem rede, abra a legenda uma vez com internet.',
    )
    expect(mensagemDeFalha('worker-indisponivel').acao.tipo).toBe('recarregar')
    expect(mensagemDeFalha('compartilhamento-negado').acao.rotulo).toBe('Escolher de novo')
    expect(mensagemDeFalha('desconhecida').texto).toBe('Algo deu errado ao preparar a legenda.')
  })

  it('mensagemDaFalha classifica e devolve o tipo junto', () => {
    const m = mensagemDaFalha(new Error('Worker error'))
    expect(m.tipo).toBe('worker-indisponivel')
    expect(m.texto).not.toMatch(TECNICO)
  })
})

describe('detalhe técnico (npm install) só em dev e self-host', () => {
  it('produção: sem detalhe, e o erro do VAD não fala de npm', () => {
    const prod = { DEV: false, VITE_AUTH_REQUIRED: '1' }
    expect(mostraDetalheTecnico(prod)).toBe(false)
    const msg = erroDoDetectorDeFala(mostraDetalheTecnico(prod))
    expect(msg).not.toMatch(/npm install/)
    expect(classificarFalha(msg)).toBe('detector-de-fala')
  })

  it('dev e self-host: a instrução continua', () => {
    expect(mostraDetalheTecnico({ DEV: true, VITE_AUTH_REQUIRED: '1' })).toBe(true)
    expect(mostraDetalheTecnico({ DEV: false })).toBe(true)
    expect(erroDoDetectorDeFala(true)).toMatch(/npm install/)
    expect(semMarcaDeFalha(erroDoDetectorDeFala(true))).toMatch(/^O detector de fala/)
  })
})
