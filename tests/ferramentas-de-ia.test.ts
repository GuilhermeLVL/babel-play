import { describe, expect, it } from 'vitest'

import {
  estadoDaFerramenta,
  estadoDasFerramentas,
  type FatosDasFerramentas,
  FERRAMENTAS_DE_IA,
  janelaDaFalha,
  livroParaOParceiro,
} from '../src/core/leitura/ferramentasDeIa'

const PAGO: FatosDasFerramentas = {
  iaDeEstudoLigada: true,
  parceiroLigado: true,
  temConta: true,
  planoGratis: false,
  explicacoesMes: 300,
  parceiroDia: 40,
  nuvemRestritaPelaIdade: false,
  online: true,
}
const com = (p: Partial<FatosDasFerramentas>): FatosDasFerramentas => ({ ...PAGO, ...p })

describe('estadoDaFerramenta', () => {
  it('a tradução roda no aparelho: sempre disponível, mesmo sem flag, conta, plano ou internet', () => {
    const nada = com({
      iaDeEstudoLigada: false,
      parceiroLigado: false,
      temConta: false,
      explicacoesMes: 0,
      parceiroDia: 0,
      nuvemRestritaPelaIdade: true,
      online: false,
    })
    expect(estadoDaFerramenta('traduzir-trecho', nada)).toEqual({ disponivel: true })
    expect(estadoDaFerramenta('traduzir-capitulo', nada)).toEqual({ disponivel: true })
  })

  const tabela: Array<[string, 'explicar' | 'parceiro', Partial<FatosDasFerramentas>, object]> = [
    ['plano pago com tudo', 'explicar', {}, { disponivel: true }],
    ['plano pago com tudo', 'parceiro', {}, { disponivel: true }],
    ['flag de estudo desligada', 'explicar', { iaDeEstudoLigada: false }, { disponivel: false, motivo: 'em-breve' }],
    ['flag do parceiro desligada', 'parceiro', { parceiroLigado: false }, { disponivel: false, motivo: 'em-breve' }],
    ['a flag de um não afeta o outro', 'parceiro', { iaDeEstudoLigada: false }, { disponivel: true }],
    ['sem conta', 'explicar', { temConta: false }, { disponivel: false, motivo: 'entrar' }],
    ['sem conta', 'parceiro', { temConta: false }, { disponivel: false, motivo: 'entrar' }],
    ['idade restrita', 'explicar', { nuvemRestritaPelaIdade: true }, { disponivel: false, motivo: 'idade' }],
    ['idade restrita', 'parceiro', { nuvemRestritaPelaIdade: true }, { disponivel: false, motivo: 'idade' }],
    ['Grátis explica (amostra)', 'explicar', { planoGratis: true, explicacoesMes: 0 }, { disponivel: true }],
    ['Grátis sem parceiro', 'parceiro', { planoGratis: true, parceiroDia: 0 }, { disponivel: false, motivo: 'plano' }],
    ['plano sem explicações', 'explicar', { explicacoesMes: 0 }, { disponivel: false, motivo: 'plano' }],
    ['self-host sem teto', 'parceiro', { parceiroDia: null }, { disponivel: true }],
    ['self-host sem teto', 'explicar', { explicacoesMes: null }, { disponivel: true }],
    [
      'cota do dia esgotada',
      'parceiro',
      { cotaEsgotada: { parceiro: 'dia' } },
      { disponivel: false, motivo: 'cota', janela: 'dia' },
    ],
    [
      'cota do mês esgotada',
      'explicar',
      { cotaEsgotada: { explicar: 'mes' } },
      { disponivel: false, motivo: 'cota', janela: 'mes' },
    ],
    ['cota de outra ferramenta', 'explicar', { cotaEsgotada: { parceiro: 'dia' } }, { disponivel: true }],
    ['sem internet', 'parceiro', { online: false }, { disponivel: false, motivo: 'sem-conexao' }],
    [
      'flag antes de conta',
      'parceiro',
      { parceiroLigado: false, temConta: false },
      { disponivel: false, motivo: 'em-breve' },
    ],
    [
      'conta antes de idade',
      'parceiro',
      { temConta: false, nuvemRestritaPelaIdade: true },
      { disponivel: false, motivo: 'entrar' },
    ],
    [
      'idade antes de plano',
      'parceiro',
      { nuvemRestritaPelaIdade: true, parceiroDia: 0 },
      { disponivel: false, motivo: 'idade' },
    ],
    [
      'plano antes de cota',
      'parceiro',
      { parceiroDia: 0, cotaEsgotada: { parceiro: 'dia' } },
      { disponivel: false, motivo: 'plano' },
    ],
    [
      'cota antes de conexão',
      'parceiro',
      { cotaEsgotada: { parceiro: 'dia' }, online: false },
      { disponivel: false, motivo: 'cota', janela: 'dia' },
    ],
  ]
  it.each(tabela)('%s (%s)', (_nome, ferramenta, fatos, esperado) => {
    expect(estadoDaFerramenta(ferramenta, com(fatos))).toEqual(esperado)
  })

  it('estadoDasFerramentas devolve todas, na ordem', () => {
    expect(Object.keys(estadoDasFerramentas(PAGO))).toEqual([...FERRAMENTAS_DE_IA])
  })
})

describe('livroParaOParceiro', () => {
  it('o do catálogo vai pelo id do catálogo (sem o `cat:` que o aparelho guarda)', () => {
    expect(livroParaOParceiro('cat:se-jane-austen-emma', 'catalogo')).toEqual({
      origem: 'catalogo',
      id: 'se-jane-austen-emma',
    })
  })
  it('o trazido pela pessoa vai sem id, mesmo que o id pareça de catálogo', () => {
    expect(livroParaOParceiro('arq:abc', 'usuario')).toEqual({ origem: 'proprio' })
    expect(livroParaOParceiro('cat:se-x', 'usuario')).toEqual({ origem: 'proprio' })
    expect(livroParaOParceiro('meu-123', undefined)).toEqual({ origem: 'proprio' })
    expect(livroParaOParceiro('cat:', 'catalogo')).toEqual({ origem: 'proprio' })
  })
})

describe('janelaDaFalha', () => {
  it('uso justo = hoje; cota do mês = mês; o resto não é cota', () => {
    expect(janelaDaFalha('uso_justo')).toBe('dia')
    expect(janelaDaFalha('cota_do_mes')).toBe('mes')
    expect(janelaDaFalha('nuvem_ocupada')).toBeNull()
    expect(janelaDaFalha('sem_plano')).toBeNull()
  })
})
