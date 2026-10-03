/**
 * EXPORTAR A CONVERSA DO INTÉRPRETE (Intérprete v3, Fase 1): o Markdown da conversa, puro.
 *   - uma entrada por fala final, na ordem, com quem falou, o original e a tradução;
 *   - a fala corrigida já vem com o texto corrigido (a lista guarda o texto de agora);
 *   - parcial e fala sem lado ficam de fora;
 *   - o nome do arquivo não leva caractere que o sistema recusa.
 */
import { describe, expect, it } from 'vitest'

import { conversaEmMarkdown, nomeDoArquivoDaConversa } from '../src/lib/captura/exportarConversa'

const rotulos = { meu: 'Você', outro: 'A outra pessoa' }
const idiomas = { meu: 'Português', outro: 'English' }

describe('conversaEmMarkdown', () => {
  it('escreve uma entrada por fala final, na ordem, com original e tradução', () => {
    const md = conversaEmMarkdown(
      [
        { id: '1', lado: 'outro', originalText: 'I want rice', translatedText: 'Eu quero arroz', timestamp: '00:04' },
        { id: '2', lado: 'meu', originalText: 'Quanto custa?', translatedText: 'How much?', timestamp: '00:09' },
      ],
      { titulo: 'Conversa de 02/10/2026', rotulos, idiomas },
    )
    expect(md.startsWith('# Conversa de 02/10/2026\n')).toBe(true)
    const iOutro = md.indexOf('A outra pessoa')
    const iMeu = md.indexOf('**Você**')
    expect(iOutro).toBeGreaterThan(-1)
    expect(iMeu).toBeGreaterThan(iOutro)
    expect(md).toContain('I want rice')
    expect(md).toContain('> Eu quero arroz')
    expect(md).toContain('Quanto custa?')
    expect(md).toContain('> How much?')
    expect(md).toContain('00:04')
  })

  it('deixa de fora o parcial, a fala sem lado e a fala vazia', () => {
    const md = conversaEmMarkdown(
      [
        { id: '1', lado: 'meu', originalText: 'em andamento', translatedText: '', isPartial: true },
        { id: '2', originalText: 'sem lado', translatedText: 'x' },
        { id: '3', lado: 'meu', originalText: '   ', translatedText: 'x' },
        { id: '4', lado: 'meu', originalText: 'ficou', translatedText: 'stayed' },
      ],
      { titulo: 'T', rotulos, idiomas },
    )
    expect(md).toContain('ficou')
    expect(md).not.toContain('em andamento')
    expect(md).not.toContain('sem lado')
  })

  it('a tradução que não veio fica sem a linha de citação', () => {
    const md = conversaEmMarkdown([{ id: '1', lado: 'outro', originalText: 'Hi', translatedText: '…' }], {
      titulo: 'T',
      rotulos,
      idiomas,
    })
    expect(md).toContain('Hi')
    expect(md).not.toContain('> …')
  })

  it('sem falas, o arquivo diz que a conversa está vazia', () => {
    expect(conversaEmMarkdown([], { titulo: 'T', rotulos, idiomas })).toContain('Nenhuma fala')
  })
})

describe('nomeDoArquivoDaConversa', () => {
  it('troca o que o sistema recusa e termina em .md', () => {
    expect(nomeDoArquivoDaConversa('Conversa: 02/10/2026 *teste*')).toBe('Conversa- 02-10-2026 -teste-.md')
  })
})
