import { describe, expect, it } from 'vitest'

import {
  atribuirVozes,
  chaveDoElencoComoTexto,
  CONFIANCA_MINIMA,
  hashDoTexto,
  marcarFrases,
  parametrosDaEmocao,
  validarMarcacaoDaIa,
  VERSAO_DO_MARCADOR,
  vozDaFrase,
} from '../src/core/avatar/elenco'

const pers = ['Ana', 'Bruno']

describe('marcarFrases: estrutura', () => {
  it('narração pura é narrador, neutro, confiante', () => {
    const [m] = marcarFrases(['A tarde caiu devagar sobre o vale.'], { idioma: 'pt', personagens: pers })
    expect(m).toMatchObject({ indice: 0, falante: { tipo: 'narrador' }, emocao: 'neutro' })
    expect(m.confianca).toBeGreaterThan(0.8)
  })

  it('atribui pelo nome da marca (antes e depois do verbo) e ignora o vocativo dentro da fala', () => {
    const r = marcarFrases(['"Bruno, venha cá", disse Ana.', 'Bruno respondeu: "Já vou."'], {
      idioma: 'pt',
      personagens: pers,
    })
    expect(r[0].falante).toEqual({ tipo: 'personagem', nome: 'Ana' })
    expect(r[1].falante).toEqual({ tipo: 'personagem', nome: 'Bruno' })
  })

  it('reconhece todos os tipos de aspas e o travessão', () => {
    const casos = [
      '"Oi", disse Ana.',
      '“Oi”, disse Ana.',
      '«Oi», disse Ana.',
      '‹Oi›, disse Ana.',
      '— Oi — disse Ana.',
      '– Oi – disse Ana.',
      '- Oi - disse Ana.',
    ]
    for (const c of casos) {
      const [m] = marcarFrases([c], { idioma: 'pt', personagens: pers })
      expect(m.falante, c).toEqual({ tipo: 'personagem', nome: 'Ana' })
    }
  })

  it('título entre aspas não é fala', () => {
    const [m] = marcarFrases(['Ana leu "Dom Casmurro" no verão.'], { idioma: 'pt', personagens: pers })
    expect(m.falante.tipo).toBe('narrador')
  })

  it('aspas retas num número ("5") e hífen em "-5" não viram diálogo', () => {
    const r = marcarFrases(['A temperatura foi de -5 graus.', 'Ela mediu 5" de largura.'], {
      idioma: 'pt',
      personagens: pers,
    })
    expect(r.every((x) => x.falante.tipo === 'narrador')).toBe(true)
  })

  it('marca órfã ("disse Ana.") preenche o falante da fala anterior', () => {
    const r = marcarFrases(['"Chega de conversa!"', 'disse Ana.'], { idioma: 'pt', personagens: pers })
    expect(r[0].falante).toEqual({ tipo: 'personagem', nome: 'Ana' })
    expect(r[1].falante.tipo).toBe('narrador')
  })

  it('alternância A/B/A/B só com travessões, com confiança baixa nas inferidas', () => {
    const r = marcarFrases(['— Oi — disse Ana.', '— Oi — disse Bruno.', '— Tudo bem?', '— Tudo.', '— Que bom.'], {
      idioma: 'pt',
      personagens: pers,
    })
    expect(r.slice(2).map((x) => x.falante.nome)).toEqual(['Ana', 'Bruno', 'Ana'])
    expect(r[2].confianca).toBeLessThan(0.7)
    expect(r[0].confianca).toBeGreaterThan(0.85)
  })

  it('fala sem ninguém conhecido é desconhecido, nunca um nome inventado', () => {
    const r = marcarFrases(['"Quem está aí?"', '"Sou eu", disse Carlos.'], { idioma: 'pt', personagens: pers })
    expect(r[0].falante).toEqual({ tipo: 'desconhecido' })
    expect(r[1].falante.nome).toBeUndefined()
    expect(r[1].falante.tipo).not.toBe('personagem')
  })

  it('nome em comum entre duas personagens é ambíguo: ninguém o leva', () => {
    const [m] = marcarFrases(['"Oi", disse Maria.'], { idioma: 'pt', personagens: ['Maria Clara', 'Maria José'] })
    expect(m.falante.tipo).not.toBe('personagem')
  })

  it('casa o sobrenome e ignora acentos e artigos', () => {
    const [m] = marcarFrases(['"Let us go", said Elisabeth.'], {
      idioma: 'en',
      personagens: ['Elizabeth Bennet', 'Elisabeth Smith'],
    })
    expect(m.falante.tipo).toBe('personagem')
    const [n] = marcarFrases(['"Vamos", disse Darcy.'], { idioma: 'pt', personagens: ['O Sr. Darcy', 'The Doctor'] })
    expect(n.falante.nome).toBe('O Sr. Darcy')
  })
})

describe('marcarFrases: emoção conservadora', () => {
  const em = (t: string, idioma = 'pt') => marcarFrases([t], { idioma, personagens: pers })[0].emocao
  it('pontos de exclamação/interrogação sozinhos não bastam', () => {
    expect(em('"Vamos embora!", disse Ana.')).toBe('neutro')
    expect(em('"Você vem?", perguntou Ana.')).toBe('neutro')
  })
  it('pista forte vira emoção', () => {
    expect(em('"NÃO ME TOQUE!", gritou Ana.')).toBe('bravo')
    expect(em('"Sinto muito", disse Ana.')).toBe('triste')
    expect(em('"I hate you!", shouted Ana.', 'en')).toBe('bravo')
    expect(em('"¡Dios mío!", dijo Ana.', 'es')).toBe('surpreso')
  })
  it('narração nunca ganha emoção', () => {
    expect(em('Ana chorou sozinha, muito triste.')).toBe('neutro')
  })
  it('idioma desconhecido: sem palavras de emoção, só estrutura', () => {
    const [m] = marcarFrases(['«Ich hasse dich!», sagte Ana.'], { idioma: 'de', personagens: pers })
    expect(m.falante.nome).toBe('Ana')
    expect(m.emocao).toBe('neutro')
  })
})

describe('marcarFrases: entrada hostil', () => {
  it('frase > 600 é partida como frasesDoTexto (no último sinal de pausa), com índices sequenciais', () => {
    const longa = `"${'Palavra, '.repeat(120)}fim", disse Ana.`
    const r = marcarFrases(['Antes.', longa, 'Depois.'], { idioma: 'pt', personagens: pers })
    expect(r.length).toBeGreaterThan(3)
    expect(r.every((x) => x.texto.length <= 600)).toBe(true)
    expect(r.map((x) => x.indice)).toEqual(r.map((_, i) => i))
    expect(r.at(-1)?.texto).toBe('Depois.')
  })

  it('10 mil frases em tempo curto', () => {
    const frases = Array.from({ length: 10_000 }, (_, i) =>
      i % 3 ? `— Fala número ${i} — disse Ana.` : `"Oi ${i}", respondeu Bruno.`,
    )
    const t = Date.now()
    const r = marcarFrases(frases, { idioma: 'pt', personagens: pers })
    expect(r).toHaveLength(10_000)
    expect(Date.now() - t).toBeLessThan(1500)
  })

  it('teto de tempo: estoura o orçamento e o resto sai narrador/neutro com confiança 0, sem lançar', () => {
    const frases = Array.from({ length: 5000 }, () => '"Oi", disse Ana.')
    const r = marcarFrases(frases, { idioma: 'pt', personagens: pers, orcamentoMs: 0 })
    expect(r).toHaveLength(5000)
    expect(r.at(-1)).toMatchObject({ falante: { tipo: 'narrador' }, confianca: 0 })
  })

  it('aspas desbalanceadas, só pontuação, emoji, RTL e vazio não travam nem inventam', () => {
    const lixo = [
      '"',
      '““““',
      '»»»»',
      '«',
      '— — — —',
      '...',
      '!!!???',
      '😀😀😀',
      '"😀',
      'مرحبا يا أنا، كيف حالك؟',
      '«مرحبا» قالت أنا',
      '',
      '   ',
      '‮"abc',
      '-',
      '–',
    ]
    const t = Date.now()
    const r = marcarFrases(lixo, { idioma: 'ar', personagens: ['أنا', 'Ana'] })
    expect(Date.now() - t).toBeLessThan(500)
    expect(r).toHaveLength(lixo.length)
    for (const x of r) {
      expect(x.confianca).toBeGreaterThanOrEqual(0)
      expect(x.confianca).toBeLessThanOrEqual(1)
      if (x.falante.tipo === 'personagem') expect(['أنا', 'Ana']).toContain(x.falante.nome)
    }
  })

  it('entrada fora do contrato (null, número, sem texto, personagens inválidas) não lança', () => {
    const r = marcarFrases([null, 42, {}, { texto: 7 }, { texto: '"Oi", disse Ana.' }] as never, {
      idioma: undefined,
      personagens: [null, 3, '', 'Ana', 'x'.repeat(500)] as never,
    })
    expect(r).toHaveLength(5)
    expect(r[4].falante.nome).toBe('Ana')
    expect(() => marcarFrases([], { personagens: undefined as never })).not.toThrow()
  })

  it('frase patológica sem espaços (200 mil caracteres, aspas e travessões) termina rápido', () => {
    const s = `"${'—a'.repeat(100_000)}`
    const t = Date.now()
    marcarFrases([s, `${'«'.repeat(100_000)}`], { idioma: 'pt', personagens: pers })
    expect(Date.now() - t).toBeLessThan(1500)
  })
})

describe('atribuirVozes', () => {
  const vozes = ['v-e', 'v-a', 'v-d', 'v-b', 'v-c'].map((id) => ({ id, idioma: 'pt-BR' }))
  it('determinístico, independente da ordem de entrada, narrador na principal', () => {
    const a = atribuirVozes(['Ana', 'Bruno', 'Clara'], vozes, { idioma: 'pt', vozPrincipal: 'v-c' })
    const b = atribuirVozes(['Clara', 'Ana', 'Bruno'], [...vozes].reverse(), { idioma: 'pt', vozPrincipal: 'v-c' })
    expect(a).toEqual(b)
    expect(a.narrador).toBe('v-c')
    expect(Object.values(a.personagens)).not.toContain('v-c')
  })
  it('sem voz repetida na cena quando há vozes suficientes', () => {
    const nomes = ['Ana', 'Bruno', 'Clara', 'Davi']
    const r = atribuirVozes(nomes, vozes, { idioma: 'pt' })
    expect(new Set(Object.values(r.personagens)).size).toBe(4)
    expect(r.repetidas).toEqual([])
  })
  it('mais personagens que vozes: reaproveita e informa quem divide', () => {
    const r = atribuirVozes(['A1', 'B2', 'C3', 'D4', 'E5', 'F6'], vozes, { idioma: 'pt' })
    expect(Object.keys(r.personagens)).toHaveLength(6)
    expect(r.repetidas.length).toBeGreaterThan(0)
  })
  it('o gosto da pessoa vence o hash; voz de outro idioma só entra se não houver do idioma', () => {
    const r = atribuirVozes(['Ana', 'Bruno'], vozes, { idioma: 'pt', vozPrincipal: 'v-a', gostos: { Ana: 'v-e' } })
    expect(r.personagens.Ana).toBe('v-e')
    const so = atribuirVozes(['Ana'], [{ id: 'x', idioma: 'en-US' }], { idioma: 'pt' })
    expect(so.narrador).toBe('x')
  })
  it('um só voz: todos usam a mesma; nenhuma voz: nada', () => {
    expect(atribuirVozes(['Ana'], [{ id: 'u' }]).personagens.Ana).toBe('u')
    expect(atribuirVozes(['Ana'], [])).toEqual({ narrador: null, personagens: {}, repetidas: [] })
  })
  it('não infere gênero: o nome não muda a faixa de escolha (mesma piscina para qualquer nome)', () => {
    const r = atribuirVozes(['Maria', 'João'], vozes, { idioma: 'pt' })
    expect(Object.values(r.personagens).every((v) => vozes.some((x) => x.id === v))).toBe(true)
  })
  it('vozDaFrase: personagem só com confiança; senão o narrador', () => {
    const d = atribuirVozes(['Ana'], vozes, { idioma: 'pt' })
    const base = { indice: 0, texto: 'x', emocao: 'neutro' as const }
    expect(vozDaFrase({ ...base, falante: { tipo: 'personagem', nome: 'Ana' }, confianca: 0.9 }, d)).toBe(
      d.personagens.Ana,
    )
    expect(vozDaFrase({ ...base, falante: { tipo: 'personagem', nome: 'Ana' }, confianca: 0.3 }, d)).toBe(d.narrador)
    expect(vozDaFrase({ ...base, falante: { tipo: 'narrador' }, confianca: 0.9 }, d)).toBe(d.narrador)
  })
})

describe('parametrosDaEmocao', () => {
  it('reaproveita o M3 e cai para neutro com pouca confiança', () => {
    const alta = parametrosDaEmocao({ emocao: 'triste', confianca: 0.9 }, { rate: 1, pitch: 1 })
    expect(alta.rate).toBeLessThan(1)
    const baixa = parametrosDaEmocao({ emocao: 'triste', confianca: CONFIANCA_MINIMA - 0.01 }, { rate: 1, pitch: 1 })
    expect(baixa).toEqual({ rate: 1, pitch: 1 })
    expect(parametrosDaEmocao({ emocao: 'feliz', confianca: 1 }, {}, false).pitch).toBeUndefined()
  })
})

describe('validarMarcacaoDaIa e chave do cache', () => {
  const textos = ['a', 'b', 'c']
  it('aceita o válido, derruba personagem inventada e conta o resto', () => {
    const r = validarMarcacaoDaIa(
      {
        frases: [
          { indice: 0, falante: 'personagem', nome: 'Ana', emocao: 'feliz', confianca: 0.8 },
          { indice: 1, falante: 'personagem', nome: 'Zé', emocao: 'raiva' },
          { indice: 1, falante: 'narrador', emocao: 'neutro' },
          { indice: 9, falante: 'narrador', emocao: 'neutro' },
          { indice: 2, falante: 'deus', emocao: 'neutro' },
        ],
      },
      textos,
      ['Ana'],
    )
    expect(r.marcadas[0]).toMatchObject({ falante: { tipo: 'personagem', nome: 'Ana' }, emocao: 'feliz' })
    expect(r.marcadas[1]).toMatchObject({ falante: { tipo: 'desconhecido' }, emocao: 'neutro' })
    expect(r.marcadas[1]!.confianca).toBeLessThanOrEqual(0.3)
    expect(r.marcadas[2]).toBeNull()
    expect(r).toMatchObject({ inventadas: 1, invalidas: 3, faltantes: 1 })
  })
  it('lixo não lança', () => {
    for (const x of [null, 3, 'x', {}, { frases: 'x' }, [null, 1]]) {
      expect(validarMarcacaoDaIa(x, textos, []).marcadas).toHaveLength(3)
    }
  })
  it('a chave muda com livro, capítulo, versão e texto', () => {
    const base = {
      livroId: 'l',
      capituloId: 'c1',
      versaoDoMarcador: VERSAO_DO_MARCADOR,
      hashDoTexto: hashDoTexto('texto'),
    }
    const k = chaveDoElencoComoTexto(base)
    expect(chaveDoElencoComoTexto({ ...base, capituloId: 'c2' })).not.toBe(k)
    expect(chaveDoElencoComoTexto({ ...base, versaoDoMarcador: 2 })).not.toBe(k)
    expect(chaveDoElencoComoTexto({ ...base, hashDoTexto: hashDoTexto('texto2') })).not.toBe(k)
    expect(hashDoTexto('texto')).toBe(hashDoTexto('texto'))
  })
})
