/**
 * O MODO SEM CONTA E O SERVIDOR PRECISAM CONCORDAR SOBRE O QUE É A MESMA PALAVRA
 * (auditoria de 2026-09-07, achado A24).
 *
 * Havia duas implementações de `chaveDedup`, e o comentário de uma delas afirmava ser "a mesma
 * chave do servidor". Não era, em três pontos: ordem dos campos invertida, pontuação não removida,
 * e locale inteiro no lugar do idioma base.
 *
 * Onde isso aparece é a MIGRAÇÃO — o pior lugar possível. Quem estuda sem conta acumula o acervo
 * no navegador; ao criar a conta, ele sobe. Com chaves diferentes, "Água!" era uma carta de um
 * lado e outra do outro, e a pessoa via o próprio acervo duplicar palavras que já tinha.
 *
 * Comentário que afirma paridade sem teste que a prove envelhece para mentira. Este é o teste.
 */
import { describe, it, expect } from 'vitest'
import { chaveDedup, chaveDaPalavra } from '../src/core/texto/palavra'

/** Palavras com acento, caixa, pontuação e espaços — o que uma captura real produz. */
const PALAVRAS = [
  'Água', 'agua', 'ÁGUA!', ' água ', 'água,',
  'coração', 'CORAÇÃO?', 'não', 'Não.', 'não!',
  'hello', 'Hello,', 'HELLO', "don't", 'Don\'t!',
  '日本語', '日本語。', 'naïve', 'NAÏVE', 'café',
]

describe('a chave de deduplicação é uma só', () => {
  it('acento, caixa e pontuação não fazem palavras diferentes', () => {
    expect(chaveDedup('Água!', 'pt-BR')).toBe(chaveDedup('agua', 'pt'))
    expect(chaveDedup('CORAÇÃO?', 'pt')).toBe(chaveDedup(' coracao ', 'pt-PT'))
    expect(chaveDedup("Don't!", 'en-US')).toBe(chaveDedup('dont', 'en'))
  })

  it('o IDIOMA faz — a mesma grafia em dois idiomas são duas palavras', () => {
    // "casa" existe em português e em espanhol e quer dizer coisas diferentes.
    expect(chaveDedup('casa', 'pt')).not.toBe(chaveDedup('casa', 'es'))
  })

  it('o locale não separa o que o idioma une', () => {
    // `pt-BR` e `pt-PT` são o mesmo idioma para efeito de baralho.
    expect(chaveDedup('palavra', 'pt-BR')).toBe(chaveDedup('palavra', 'pt-PT'))
  })

  it('a ordem é `idioma|palavra` — a que já está gravada em `vocab_cards.norm_key`', () => {
    expect(chaveDedup('agua', 'pt')).toBe('pt|agua')
  })

  it('sem idioma, a chave ainda é estável e não colide com um idioma real', () => {
    expect(chaveDedup('agua', null)).toBe('|agua')
    expect(chaveDedup('agua', null)).not.toBe(chaveDedup('agua', 'pt'))
  })

  /**
   * O INVARIANTE QUE FECHA O CASO: para o mesmo par (palavra, idioma), as duas pontas produzem a
   * MESMA chave — porque agora é a mesma função. O teste percorre as 20 palavras acima nos dois
   * módulos que a consomem, em vez de afirmar sobre uma delas.
   */
  it('as duas pontas produzem a mesma chave para 20 palavras reais', async () => {
    const { chaveDedup: doEfemero } = await import('../src/data/efemero/servidor')
    for (const p of PALAVRAS) {
      for (const lang of ['pt-BR', 'en-US', 'ja', null]) {
        expect(doEfemero(p, lang), `"${p}" em ${lang}`).toBe(chaveDedup(p, lang))
      }
    }
  })

  it('a chave sem idioma é a mesma normalização de palavra que o resto do app usa', () => {
    for (const p of PALAVRAS) {
      expect(chaveDedup(p, 'pt')).toBe(`pt|${chaveDaPalavra(p)}`)
    }
  })
})
