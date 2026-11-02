import { describe, expect, it } from 'vitest'

import {
  type IdiomaDeVoz,
  prepararTextoParaVoz,
  VERSAO_DO_PREPROCESSADOR,
} from '../src/core/leitura/prepararTextoParaVoz'

const pt = (t: string, o?: Parameters<typeof prepararTextoParaVoz>[2]) => prepararTextoParaVoz(t, 'pt', o)

describe('prepararTextoParaVoz: números', () => {
  it.each<[string, string]>([
    ['em 1889', 'em mil oitocentos e oitenta e nove'],
    ['1.234,56', 'mil duzentos e trinta e quatro vírgula cinquenta e seis'],
    ['0,05', 'zero vírgula zero cinco'],
    ['50%', 'cinquenta por cento'],
    ['12,5 %', 'doze vírgula cinco por cento'],
    ['R$ 1.234,56', 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    ['R$ 1', 'um real'],
    ['US$ 2,50', 'dois dólares e cinquenta centavos'],
    ['12/03/1889', 'doze de março de mil oitocentos e oitenta e nove'],
    ['01/05/1900', 'primeiro de maio de mil e novecentos'],
    ['31/02/2020', 'trinta e um de fevereiro de dois mil e vinte'],
    ['1º de maio', 'primeiro de maio'],
    ['2ª', 'segunda'],
    ['21º', 'vigésimo primeiro'],
    ['Comprou 3 livros.', 'Comprou três livros.'],
    ['mp3', 'mp3'],
    ['A4', 'A4'],
  ])('%s -> %s', (entrada, saida) => {
    expect(pt(entrada)).toBe(saida)
  })

  it('deixa passar números além do alcance de cardinalPt', () => {
    expect(pt('1234567890123456')).toBe('1234567890123456')
  })
})

describe('prepararTextoParaVoz: horas, unidades e faixas', () => {
  it.each<[string, string]>([
    ['às 10h30', 'às dez horas e trinta'],
    ['8h', 'oito horas'],
    ['1h', 'uma hora'],
    ['2h', 'duas horas'],
    ['15:30', 'quinze horas e trinta'],
    ['10h00', 'dez horas'],
    ['5kg', '5kg'],
    ['3D', '3D'],
    ['mp3', 'mp3'],
    ['A4', 'A4'],
    ['2.5', '2.5'],
    ['12.34', '12.34'],
    ['1.000.000', 'um milhão'],
    ['1914–1918', 'mil novecentos e catorze a mil novecentos e dezoito'],
  ])('%s -> %s', (entrada, saida) => {
    expect(pt(entrada)).toBe(saida)
  })

  it('normaliza CRLF', () => {
    expect(pt('Fim —\r\nOutra linha')).toBe('Fim\nOutra linha')
    expect(pt('Fim —\r\n')).toBe('Fim')
  })
})

describe('prepararTextoParaVoz: romanos', () => {
  it.each<[string, string]>([
    ['Capítulo IV', 'Capítulo quatro'],
    ['capítulo IV', 'capítulo quatro'],
    ['século XIX', 'século dezenove'],
    ['Parte II', 'Parte dois'],
    ['Pedro II', 'Pedro segundo'],
    ['Luís XIV', 'Luís catorze'],
    ['Dom João VI', 'Dom João sexto'],
    ['cap. IV', 'capítulo quatro'],
    ['MIL', 'MIL'],
    ['Vi o filme', 'Vi o filme'],
    ['Fulano DI', 'Fulano DI'],
    ['capítulo iv', 'capítulo iv'],
  ])('%s -> %s', (entrada, saida) => {
    expect(pt(entrada)).toBe(saida)
  })

  it('"I" em inglês nunca muda', () => {
    expect(prepararTextoParaVoz('I think Chapter IV is long, said Pedro II.', 'en')).toBe(
      'I think Chapter IV is long, said Pedro II.',
    )
  })
})

describe('prepararTextoParaVoz: siglas e abreviações', () => {
  it.each<[string, string]>([
    ['CPF', 'cê pê efe'],
    ['USP', 'u ésse pê'],
    ['IBGE', 'i bê gê é'],
    ['ONU', 'ONU'],
    ['NASA', 'NASA'],
    ['NÃO', 'NÃO'],
    ['Isto é BEM', 'Isto é BEM'],
    ['SOCORRO', 'SOCORRO'],
    ['PERIGO', 'PERIGO'],
    ['FOGO', 'FOGO'],
    ['SIM', 'SIM'],
    ['CNPJ', 'cê êne pê jota'],
    ['UFMG', 'u efe ême gê'],
    ['PUC', 'pê u cê'],
    ['INSS', 'i êne ésse ésse'],
    ['OAB', 'ó a bê'],
    ['PIB', 'pê i bê'],
    ['Sr. Silva', 'Senhor Silva'],
    ['Sra. Silva', 'Senhora Silva'],
    ['Dr. Souza', 'Doutor Souza'],
    ['pão, leite, etc. Depois', 'pão, leite, etcétera. Depois'],
    ['pão, leite, etc.', 'pão, leite, etcétera.'],
    ['ver cap. final', 'ver capítulo final'],
    ['nº 5', 'número cinco'],
  ])('%s -> %s', (entrada, saida) => {
    expect(pt(entrada)).toBe(saida)
  })
})

describe('prepararTextoParaVoz: travessão e reticências', () => {
  it.each<[string, string]>([
    ['--Bom dia, disse ele.', 'Bom dia, disse ele.'],
    ['—Vamos?', 'Vamos?'],
    ['- Vamos?', 'Vamos?'],
    ['Ela --a Capitu-- sorriu', 'Ela, a Capitu, sorriu'],
    ['guarda-chuva', 'guarda-chuva'],
    ['Ele chegou — tarde — e saiu', 'Ele chegou, tarde, e saiu'],
    ['Vamos? —disse ele', 'Vamos? disse ele'],
    ['Primeira linha\n— Segunda linha', 'Primeira linha\nSegunda linha'],
    ['Bem...', 'Bem…'],
    ['Não sei.... talvez', 'Não sei… talvez'],
    ['Pausa…', 'Pausa…'],
  ])('%s -> %s', (entrada, saida) => {
    expect(pt(entrada)).toBe(saida)
  })
})

describe('prepararTextoParaVoz: dicionário e ortografia', () => {
  it('troca palavra inteira preservando a maiúscula inicial', () => {
    const dicionario = { Capitu: 'Capitú' }
    expect(pt('Capitu sorriu', { dicionario })).toBe('Capitú sorriu')
    expect(pt('a capitu sorriu', { dicionario })).toBe('a capitú sorriu')
    expect(pt('Capitulo', { dicionario })).toBe('Capitulo')
  })

  it.each<[string, string]>([
    ['annos', 'anos'],
    ['Hontem', 'Ontem'],
    ['immenso', 'imenso'],
    ['tambem', 'também'],
  ])('modernizada: %s -> %s', (entrada, saida) => {
    expect(pt(entrada, { ortografia: 'modernizada' })).toBe(saida)
  })

  it('sem a opção (original) nada muda', () => {
    expect(pt('annos hontem immenso tambem')).toBe('annos hontem immenso tambem')
    expect(pt('annos', { ortografia: 'original' })).toBe('annos')
  })

  it('o dicionário vem antes da ortografia', () => {
    expect(pt('annos', { dicionario: { annos: 'ânus' }, ortografia: 'modernizada' })).toBe('ânus')
  })
})

describe('prepararTextoParaVoz: espaços e outros idiomas', () => {
  it('colapsa espaços e apara as pontas', () => {
    expect(pt('  um   dois \n  três  ')).toBe('um dois\ntrês')
  })

  it('vazio e só espaços viram ""', () => {
    expect(pt('')).toBe('')
    expect(pt('   \n  ')).toBe('')
  })

  it.each<[IdiomaDeVoz, string, string]>([
    ['en', 'In 1889, Dr. Smith...', 'In 1889, Dr. Smith…'],
    ['es', '—¿Vamos?  Año 1889.', '¿Vamos? Año 1889.'],
    ['en', '--Hello, she said.', 'Hello, she said.'],
  ])('%s só aplica regras neutras: %s', (idioma, entrada, saida) => {
    expect(prepararTextoParaVoz(entrada, idioma)).toBe(saida)
  })

  it('en/es ignoram a ortografia modernizada', () => {
    expect(prepararTextoParaVoz('annos', 'en', { ortografia: 'modernizada' })).toBe('annos')
  })

  it('expõe a versão do pré-processador', () => {
    expect(VERSAO_DO_PREPROCESSADOR).toBe('1')
  })
})

describe('prepararTextoParaVoz: idempotência', () => {
  it.each([
    'em 1889, o Sr. Silva pagou R$ 1.234,56 (50%).',
    'Capítulo IV: Pedro II e Luís XIV no século XIX',
    'O CPF e o IBGE falam da ONU em 12/03/1889.',
    '--Bom dia, disse ele...',
    'Ela --a Capitu-- sorriu',
    '1º de maio e 2ª feira, etc.',
    '- Vamos?\n— Vamos.',
    'MIL e DI e Vi',
    'Dr. Souza, nº 5, cap. 3',
    'annos hontem immenso tambem Capitu',
    'às 10h30 e 15:30, 5kg, 2.5 e 1914–1918',
    'Fim —\r\nIsto é BEM, diz a OAB',
    '8h, 1h e 1.000.000',
  ])('f(f(x)) === f(x): %s', (entrada) => {
    const opcoes = { ortografia: 'modernizada' as const, dicionario: { Capitu: 'Capitú' } }
    const uma = pt(entrada, opcoes)
    expect(pt(uma, opcoes)).toBe(uma)
    const semOpcoes = pt(entrada)
    expect(pt(semOpcoes)).toBe(semOpcoes)
  })
})
