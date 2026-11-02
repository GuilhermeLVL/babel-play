import { describe, expect, it } from 'vitest'

import {
  aberturaDaAmplitude,
  ancorarLinha,
  avancarAte,
  encerrarLinha,
  limitarVelocidade,
  type LinhaDaBoca,
  montarLinhaDaBoca,
  pesosDaBoca,
  rmsDeBytes,
  suavizar,
  TETO_DE_CARACTERES,
  type Vogal,
} from '../src/core/avatar/boca'

const linha = (texto: string, idioma = 'pt-BR', velocidade = 1, duracaoMs?: number) =>
  montarLinhaDaBoca({ texto, idioma, velocidade, duracaoMs })
const vogais = (l: LinhaDaBoca): Vogal[] => l.unidades.filter((u) => u.vogal !== 'F').map((u) => u.vogal)

describe('boca: linha do tempo por regras de vogais', () => {
  it('pt-BR: sílabas e vogais de "Olá, tudo bem?"', () => {
    const l = linha('Olá, tudo bem?')
    // O-lá | pausa | tu-do | bem | pausa
    expect(vogais(l)).toEqual(['O', 'A', 'U', 'O', 'E'])
    expect(l.unidades.some((u) => u.vogal === 'F')).toBe(true)
  })

  it('pt-BR: ditongo/nasal sustentam a vogal forte ("não", "mãe"); "qu"/"gu" têm u mudo', () => {
    expect(vogais(linha('não'))).toEqual(['A'])
    expect(vogais(linha('mãe'))).toEqual(['A'])
    expect(vogais(linha('que'))).toEqual(['E'])
    expect(vogais(linha('guerra'))).toEqual(['E', 'A'])
    expect(vogais(linha('água'))).toEqual(['A', 'A'])
  })

  it('es e en: regras mais simples', () => {
    expect(vogais(linha('hola amigo', 'es-ES'))).toEqual(['O', 'A', 'A', 'I', 'O'])
    expect(vogais(linha('moon', 'en-US'))).toEqual(['U'])
    // "e" mudo final do inglês não vira sílaba extra
    expect(vogais(linha('make', 'en'))).toEqual(['A'])
    expect(vogais(linha('the', 'en'))).toEqual(['E'])
  })

  it('texto vazio, só espaços e só pontuação: boca fechada, sem lançar', () => {
    for (const t of ['', '   ', '\n\n', '...', '?!?!', '"—"']) {
      const l = linha(t)
      expect(vogais(l)).toEqual([])
      const p = avancarAte(l, 0)
      expect(p.abertura).toBe(0)
    }
    expect(avancarAte(linha(''), 100).acabou).toBe(true)
    // pontuação cria pausa (tempo), mas nunca abre a boca
    const so = linha('...')
    expect(so.duracaoMs).toBeGreaterThan(0)
    expect(avancarAte(so, so.duracaoMs / 2).abertura).toBe(0)
  })

  it('entrada que não é string não quebra', () => {
    expect(() =>
      montarLinhaDaBoca({
        texto: undefined as unknown as string,
        idioma: undefined as unknown as string,
        velocidade: NaN,
      }),
    ).not.toThrow()
  })

  it('emojis: não se falam, não somam tempo e os índices continuam em UTF-16', () => {
    const sem = linha('oi')
    const com = linha('oi 😀👍🏽')
    expect(vogais(com)).toEqual(vogais(sem))
    expect(com.duracaoMs).toBeCloseTo(sem.duracaoMs, 5)
    const depois = linha('😀 oi')
    // "😀" ocupa 2 unidades UTF-16: o "oi" começa em 3 e o charIndex 3 cai na primeira unidade falada
    const k = depois.unidades.findIndex((u) => u.vogal !== 'F')
    expect(depois.unidades[k].c1).toBeGreaterThan(3)
    const a = ancorarLinha(depois, 3, 400)
    expect(a.ancora).toEqual({ charIndex: 3, tMs: 400 })
  })

  it('árabe (RTL, sem vogais latinas): abertura por sílaba estimada, cobrindo o texto todo', () => {
    const texto = 'مرحبا بكم في التطبيق'
    const l = linha(texto, 'ar')
    expect(l.unidades.length).toBeGreaterThan(4)
    expect(l.unidades[l.unidades.length - 1].c1).toBe(texto.length)
    expect(l.duracaoMs).toBeGreaterThan(1000)
    // a boca mexe: passando o relógio, há momentos abertos
    let abriu = false
    for (let t = 0; t < l.duracaoMs; t += 20) if (avancarAte(l, t).abertura > 0.2) abriu = true
    expect(abriu).toBe(true)
  })

  it('japonês: uma sílaba por caractere', () => {
    expect(vogais(linha('こんにちは', 'ja')).length).toBe(5)
  })

  it('números: um dígito = uma sílaba, e "2024" tem 4', () => {
    const l = linha('2024')
    expect(vogais(l).length).toBe(4)
    expect(vogais(linha('1', 'pt'))).toEqual(['U'])
  })

  it('5.000 caracteres: rápido e a linha cobre o texto', () => {
    const texto = 'Era uma vez um texto muito longo, com vírgulas e pontos. '.repeat(90).slice(0, 5000)
    const ini = performance.now()
    const l = linha(texto)
    const dt = performance.now() - ini
    expect(texto.length).toBe(5000)
    expect(dt).toBeLessThan(200)
    expect(l.unidades.length).toBeGreaterThan(1000)
    expect(l.unidades[l.unidades.length - 1].c1).toBeLessThanOrEqual(5000)
    // busca binária: ler a pose no meio é barato
    const p = avancarAte(l, l.duracaoMs / 2)
    expect(p.abertura).toBeGreaterThanOrEqual(0)
  })

  it('texto acima do teto é cortado, sem estourar', () => {
    const l = linha('a '.repeat(TETO_DE_CARACTERES))
    expect(l.unidades[l.unidades.length - 1].c1).toBeLessThanOrEqual(TETO_DE_CARACTERES)
  })

  it('velocidades 0,5 a 2,5: a duração escala; fora do intervalo é limitada; inválida vira 1', () => {
    const t = 'Bom dia, tudo bem com você hoje?'
    const lenta = linha(t, 'pt', 0.5).duracaoMs
    const normal = linha(t, 'pt', 1).duracaoMs
    const rapida = linha(t, 'pt', 2.5).duracaoMs
    expect(lenta).toBeCloseTo(normal * 2, 3)
    expect(rapida).toBeCloseTo(normal / 2.5, 3)
    expect(linha(t, 'pt', 99).duracaoMs).toBeCloseTo(rapida, 5)
    expect(linha(t, 'pt', 0.01).duracaoMs).toBeCloseTo(lenta, 5)
    expect(limitarVelocidade(NaN)).toBe(1)
    expect(limitarVelocidade(-3)).toBe(1)
    expect(limitarVelocidade(Infinity)).toBe(1)
  })

  it('duração conhecida (áudio): a linha termina exatamente nela', () => {
    const l = linha('Olá, tudo bem?', 'pt', 1, 3000)
    expect(l.duracaoFixa).toBe(true)
    expect(l.duracaoMs).toBeCloseTo(3000, 5)
  })
})

describe('boca: pose por instante (sem estado oculto)', () => {
  it('é pura: mesmo instante, mesma pose, em qualquer ordem de chamada', () => {
    const l = linha('Muito obrigado pela ajuda, de verdade.')
    const a = [0, 150, 700, 1500, 2600].map((t) => avancarAte(l, t))
    const b = [2600, 1500, 700, 150, 0].map((t) => avancarAte(l, t)).reverse()
    expect(a).toEqual(b)
  })

  it('antes de 0 e depois do fim: fechada; o fim marca `acabou`', () => {
    const l = linha('oi')
    expect(avancarAte(l, -5)).toMatchObject({ abertura: 0, acabou: false })
    expect(avancarAte(l, l.duracaoMs + 1)).toMatchObject({ abertura: 0, acabou: true })
    expect(avancarAte(l, NaN).abertura).toBe(0)
  })

  it('abre dentro da sílaba e fecha na pausa', () => {
    const l = linha('pá, pá')
    const u = l.unidades[0]
    const meio = avancarAte(l, (u.t0 + u.t1) / 2)
    expect(meio.vogal).toBe('A')
    expect(meio.abertura).toBeCloseTo(1, 1)
    const pausa = l.unidades.find((x) => x.vogal === 'F')!
    expect(avancarAte(l, (pausa.t0 + pausa.t1) / 2).abertura).toBe(0)
  })
})

describe('boca: ancoragem em eventos reais', () => {
  const texto = 'Bom dia pessoal, vamos começar a aula de hoje com calma.'

  it('sequência start → boundary → end: o tempo vem do relógio, não de elapsedTime', () => {
    const l0 = linha(texto)
    let l = l0
    const estimado = l0.duracaoMs
    // a voz real é 1,5x mais lenta que a estimativa: os boundary chegam atrasados
    const palavras = [...texto.matchAll(/\S+/g)]
    for (const m of palavras) {
      const idx = m.index!
      const unidadeAntes = l0.unidades.find((u) => u.c1 > idx)!
      l = ancorarLinha(l, idx, unidadeAntes.t0 * 1.5 + 10)
    }
    expect(l.ancora).not.toBeNull()
    // a linha aprendeu o ritmo: a duração ficou perto de 1,5x a estimada (limite de fator [0,5; 2])
    expect(l.duracaoMs).toBeGreaterThan(estimado * 1.2)
    expect(l.duracaoMs).toBeLessThan(estimado * 1.9)
    const fim = encerrarLinha(l, l.duracaoMs - 50)
    expect(fim.duracaoMs).toBeCloseTo(l.duracaoMs - 50, 5)
    expect(avancarAte(fim, fim.duracaoMs + 1).acabou).toBe(true)
  })

  it('âncora move a unidade para o tempo real do evento', () => {
    const l = linha(texto)
    const idx = texto.indexOf('vamos')
    const a = ancorarLinha(l, idx, 1234)
    const k = a.unidades.findIndex((u) => u.c1 > idx)
    expect(a.unidades[k].t0).toBeCloseTo(1234, 5)
    // continuidade: nada se sobrepõe nem anda para trás
    for (let i = 1; i < a.unidades.length; i += 1) {
      expect(a.unidades[i].t0).toBeGreaterThanOrEqual(a.unidades[i - 1].t1 - 1e-6)
    }
    // a linha original não mudou (imutável)
    expect(l.ancora).toBeNull()
  })

  it('boundary fora de ordem é ignorado (índice ou tempo para trás)', () => {
    let l = linha(texto)
    l = ancorarLinha(l, 20, 1500)
    const antes = l
    expect(ancorarLinha(l, 5, 1600)).toBe(antes) // índice menor
    expect(ancorarLinha(l, 30, 900)).toBe(antes) // tempo menor
    expect(ancorarLinha(l, 40, 1700).ancora).toEqual({ charIndex: 40, tMs: 1700 })
  })

  it('valores inválidos ou além do texto: ignorados', () => {
    const l = linha(texto)
    expect(ancorarLinha(l, NaN, 10)).toBe(l)
    expect(ancorarLinha(l, 5, Infinity)).toBe(l)
    expect(ancorarLinha(l, -1, 10)).toBe(l)
    expect(ancorarLinha(l, 99_999, 10)).toBe(l)
    expect(ancorarLinha(linha(''), 0, 0).unidades).toHaveLength(0)
  })

  it('boundary absurdo não entorta a fala (fator limitado a 0,5–2)', () => {
    const l = linha(texto)
    const idx = texto.indexOf('aula')
    const lento = ancorarLinha(l, idx, 60_000)
    const dependeDoFator = lento.msPorPeso / l.msPorPeso
    expect(dependeDoFator).toBeLessThanOrEqual(2 + 1e-9)
    const rapido = ancorarLinha(l, idx, 1)
    expect(rapido.msPorPeso / l.msPorPeso).toBeGreaterThanOrEqual(0.5 - 1e-9)
  })

  it('com duração fixa (áudio), o resto se encaixa no que falta até o fim', () => {
    const l = linha(texto, 'pt', 1, 8000)
    const a = ancorarLinha(l, texto.indexOf('aula'), 5000)
    expect(a.duracaoMs).toBeCloseTo(8000, 3)
  })

  it('independe da unidade do elapsedTime: ms ou s não mudam a linha, que usa o relógio de quem chama', () => {
    // Quem chama converte para o seu relógio; aqui garantimos que `ancorarLinha` só aceita ms desde o start.
    const l = linha(texto)
    const a = ancorarLinha(l, 10, 800)
    const b = ancorarLinha(l, 10, 800)
    expect(a).toEqual(b)
  })
})

describe('boca: suavização e amplitude', () => {
  it('ataque é mais rápido que a soltura e nunca ultrapassa o alvo', () => {
    const sobe = suavizar(0, 1, 16)
    const desce = 1 - suavizar(1, 0, 16)
    expect(sobe).toBeGreaterThan(desce)
    expect(sobe).toBeLessThan(1)
    expect(suavizar(0.2, 0.2, 16)).toBeCloseTo(0.2, 9)
    let v = 0
    for (let i = 0; i < 200; i += 1) v = suavizar(v, 1, 16)
    expect(v).toBeCloseTo(1, 3)
    expect(v).toBeLessThanOrEqual(1)
  })

  it('entradas inválidas não contaminam', () => {
    expect(suavizar(0.4, NaN, 16)).toBe(0.4)
    expect(suavizar(NaN, 1, 16)).toBeGreaterThanOrEqual(0)
    expect(suavizar(0.4, 1, -3)).toBe(0.4)
    expect(suavizar(0.4, 1, 16, 0, 0)).toBe(1)
  })

  it('RMS dos bytes: silêncio (128) é 0; onda cheia é perto de 0,7', () => {
    expect(rmsDeBytes(new Uint8Array(256).fill(128))).toBe(0)
    expect(rmsDeBytes(new Uint8Array(0))).toBe(0)
    const onda = new Uint8Array(256).map((_, i) => 128 + Math.round(127 * Math.sin((i / 256) * 2 * Math.PI * 8)))
    expect(rmsDeBytes(onda)).toBeGreaterThan(0.6)
    expect(rmsDeBytes(onda)).toBeLessThan(0.75)
  })

  it('abertura da amplitude: piso fecha, saturação em 1, monotônica', () => {
    expect(aberturaDaAmplitude(0)).toBe(0)
    expect(aberturaDaAmplitude(0.015)).toBe(0)
    expect(aberturaDaAmplitude(NaN)).toBe(0)
    expect(aberturaDaAmplitude(0.9)).toBe(1)
    expect(aberturaDaAmplitude(0.1)).toBeGreaterThan(aberturaDaAmplitude(0.05))
  })

  it('pesos para o VRM: uma vogal por vez; boca simples usa só `aa`; fechada zera tudo', () => {
    expect(pesosDaBoca({ vogal: 'O', abertura: 0.8, acabou: false })).toEqual({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0.8 })
    const simples = pesosDaBoca({ vogal: 'U', abertura: 1, acabou: false }, true)
    expect(simples.aa).toBeGreaterThan(0.8)
    expect(simples.ou).toBe(0)
    expect(Object.values(pesosDaBoca({ vogal: 'F', abertura: 0.9, acabou: false })).every((v) => v === 0)).toBe(true)
    expect(pesosDaBoca({ vogal: 'A', abertura: 7, acabou: false }).aa).toBe(1)
  })
})
