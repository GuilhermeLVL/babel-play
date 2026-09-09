/**
 * AS TRÊS NORMALIZAÇÕES SÃO TRÊS PERGUNTAS DIFERENTES — e este teste fixa a diferença.
 *
 * A auditoria contou "15 cópias de `normalize('NFD')`" e a leitura natural seria unificar as
 * quinze. Seria um erro: elas respondem a três perguntas que exigem respostas diferentes, e o
 * ADR 0004 (`docs/adr/0004-tres-normalizacoes-de-texto-nomeadas.md`) explica por quê.
 *
 * Os casos abaixo são justamente os que as distinguem. Se alguém "simplificar" as três numa só,
 * é aqui que a simplificação falha.
 */
import { describe, expect,it } from 'vitest'

import { chaveDaPalavra, chaveDedup, comBaseLatina,dobrarTexto } from '../src/core/texto/palavra'

describe('1. estas duas PALAVRAS são a mesma?', () => {
  it('ignora acento e caixa', () => {
    expect(chaveDaPalavra('Água')).toBe(chaveDaPalavra('agua'))
  })

  it('remove o espaço — a chave é de UMA palavra', () => {
    // É esta linha que impede unificar com `dobrarTexto`: aqui o espaço some de propósito.
    expect(chaveDaPalavra('água doce')).toBe('aguadoce')
  })

  it('remove pontuação em qualquer posição', () => {
    expect(chaveDaPalavra('Ação!')).toBe('acao')
    expect(chaveDaPalavra('co-operar')).toBe('cooperar')
  })

  it('a chave de dedup carrega o idioma BASE, e nessa ordem', () => {
    // A ordem `lang|palavra` é a que já está gravada em `vocab_cards.norm_key`.
    expect(chaveDedup('Água', 'pt-BR')).toBe('pt|agua')
    expect(chaveDedup('Água', 'pt')).toBe(chaveDedup('agua', 'pt-BR'))
  })
})

describe('2. estes dois TEXTOS são o mesmo?', () => {
  it('preserva o espaço — sem ele, a comparação de frase não existe', () => {
    expect(dobrarTexto('Água Doce', { espacos: 'preservar' })).toBe('agua doce')
  })

  it('`preservar` não toca nas bordas nem nos espaços internos repetidos', () => {
    expect(dobrarTexto('  Água   Doce  ', { espacos: 'preservar' })).toBe('  agua   doce  ')
  })

  it('`aparar` tira só as bordas', () => {
    expect(dobrarTexto('  Água   Doce  ', { espacos: 'aparar' })).toBe('agua   doce')
  })

  it('`colapsar` reduz os internos e apara as bordas', () => {
    expect(dobrarTexto('  Água   Doce  ', { espacos: 'colapsar' })).toBe('agua doce')
  })

  it('as três opções concordam quando não há espaço sobrando', () => {
    for (const espacos of ['preservar', 'aparar', 'colapsar'] as const) {
      expect(dobrarTexto('Japonês', { espacos })).toBe('japones')
    }
  })

  it('texto vazio, nulo e indefinido devolvem string vazia', () => {
    for (const espacos of ['preservar', 'aparar', 'colapsar'] as const) {
      expect(dobrarTexto(undefined, { espacos })).toBe('')
      expect(dobrarTexto(null, { espacos })).toBe('')
    }
  })
})

describe('3. esta letra cabe na grade?', () => {
  it('a base latina resolve o que o NFD não decompõe', () => {
    // `normalize('NFD')` separa `á`, mas não mexe em `ł`, `ø`, `đ`, `æ` — o traço é parte do glifo,
    // e sem `comBaseLatina` a letra SUMIA: `łatwy` virava `atwy`.
    expect(comBaseLatina('łatwy')).toBe('latwy')
    expect(comBaseLatina('øre')).toBe('ore')
  })

  it('a chave de palavra PRESERVA o `l` cortado — quem o perdia era a grade, restrita a A-Z', () => {
    /* Medido, e corrige a leitura fácil do achado: `ł` é letra (`\p{L}`), então `chaveDaPalavra` o
       mantém. Quem o apagava era a normalização da GRADE, que sobe para maiúscula e fica só com
       A-Z — sem `comBaseLatina` antes, `łatwy` virava `ATWY`, e quem digitava a palavra certa
       errava. É por isso que a pergunta 3 existe separada. */
    expect(chaveDaPalavra('łatwy')).toBe('łatwy')
    expect(chaveDaPalavra('łatwy').toUpperCase().replace(/[^A-Z]/g, ''), 'a grade sem base latina').toBe('ATWY')
    expect(comBaseLatina('łatwy').toUpperCase().replace(/[^A-Z]/g, ''), 'a grade COM base latina').toBe('LATWY')
  })
})

describe('as três não são intercambiáveis', () => {
  it('a mesma entrada produz três saídas diferentes', () => {
    const entrada = 'Água   Doce!'
    expect(chaveDaPalavra(entrada), 'pergunta 1: sem espaço, sem pontuação').toBe('aguadoce')
    expect(dobrarTexto(entrada, { espacos: 'colapsar' }), 'pergunta 2: com espaço e pontuação').toBe('agua doce!')
    /* Pergunta 3: `comBaseLatina` NÃO tira acento nem caixa — ela só resolve as letras que o NFD
       não decompõe. A remoção de acento vem do NFD, que a grade aplica depois. */
    expect(comBaseLatina(entrada), 'base latina preserva acento e caixa').toBe('Água   Doce!')
    expect(comBaseLatina(entrada).normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase(),
      'pergunta 3: só A-Z, maiúsculo').toBe('AGUADOCE')
  })
})
