// @vitest-environment jsdom
/**
 * A LEGENDA DA CAPTURA EM OUTRAS ESCRITAS (pendências da auditoria de 10/10/2026,
 * `docs/auditoria/2026-10-10-outros-idiomas.md`):
 *   · árabe e hebraico saem da direita para a esquerda (`dir` ao lado de todo `lang`);
 *   · em chinês e japonês o toque pega a PALAVRA, e não a frase inteira (não há espaço para dividir);
 *   · em idioma com espaço NADA muda: as mesmas palavras, a mesma pontuação colada, a mesma marcação.
 */
import { readFileSync } from 'node:fs'

import { cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import FolhaDaFrase, { palavrasDaFrase } from '../src/components/views/captura/celular/FolhaDaFrase'
import FolhasDoPrototipo from '../src/components/views/captura/celular/FolhasDoPrototipo'
import LegendaFlutuanteDoPrototipo from '../src/components/views/captura/legendas/LegendaFlutuanteDoPrototipo'
import LinhaDaLegenda, { type LegendaAoVivo } from '../src/components/views/captura/legendas/LinhaDaLegenda'
import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { palavrasDoPedaco } from '../src/lib/captura/trechosTocaveis'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
afterEach(cleanup)

const CHINES = '大家早上好，今天我们一起学习中文。'
const JAPONES = '今日は一緒に日本語を勉強します。'
const ARABE = 'صباح الخير للجميع، اليوم نتعلم العربية معا.'
const HEBRAICO = 'בוקר טוב לכולם.'
const INGLES = "Well, I'm well-known — aren't you? The e-mail (3.5 MB) arrived today!"
const PORTUGUES = 'Olá, tudo bem? O guarda-chuva está aqui: «pegue-o», disse ela… às 10h30.'

const nada = () => undefined

describe('palavrasDoPedaco', () => {
  it.each([
    ['inglês', 'well-known.', 'en'],
    ['português', 'guarda-chuva,', 'pt-BR'],
    ['número', '3.5', 'en'],
    ['árabe', 'للجميع،', 'ar'],
    ['coreano', '안녕하세요.', 'ko'],
    ['russo', 'привет!', 'ru'],
  ])('%s: o pedaço entre espaços fica como está', (_nome, pedaco, lang) => {
    expect(palavrasDoPedaco(pedaco, lang)).toEqual([pedaco])
  })

  it('chinês: parte em palavras, e juntar devolve o pedaço', () => {
    const partes = palavrasDoPedaco(CHINES, 'zh')
    expect(partes.join('')).toBe(CHINES)
    expect(partes.length).toBeGreaterThan(4)
    expect(partes).toContain('中文')
  })

  it('japonês: parte em palavras, e juntar devolve o pedaço', () => {
    const partes = palavrasDoPedaco(JAPONES, 'ja-JP')
    expect(partes.join('')).toBe(JAPONES)
    expect(partes.length).toBeGreaterThan(3)
  })

  it('o idioma declarado errado (ou inválido) não impede: quem manda é a escrita do texto', () => {
    for (const lang of ['en', '', 'auto', 'zh_CN']) {
      expect(palavrasDoPedaco(CHINES, lang).length, `lang "${lang}"`).toBeGreaterThan(4)
    }
  })

  it('sem segmentador no aparelho, o pedaço fica inteiro (o alvo é a frase, não um caractere)', () => {
    expect(palavrasDoPedaco(CHINES, 'zh', { segmentador: null })).toEqual([CHINES])
  })
})

describe('palavrasDaFrase (os botões de palavra da folha)', () => {
  /** A divisão de antes desta mudança, copiada: é a régua da regressão. */
  function deAntes(texto: string): string[] {
    const vistas = new Set<string>()
    const saida: string[] = []
    for (const bruto of texto.split(/\s+/)) {
      const p = bruto.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
      if (!p || !/\p{L}/u.test(p)) continue
      const chave = p.toLocaleLowerCase()
      if (vistas.has(chave)) continue
      vistas.add(chave)
      saida.push(p)
    }
    return saida
  }

  it.each([
    ['inglês', INGLES, 'en-US'],
    ['português', PORTUGUES, 'pt-BR'],
    ['árabe', ARABE, 'ar'],
    ['inglês sem idioma', INGLES, ''],
  ])('%s: idêntico ao de antes', (_nome, texto, lang) => {
    expect(palavrasDaFrase(texto, lang)).toEqual(deAntes(texto))
  })

  it('inglês: o hífen e o apóstrofo de dentro continuam na palavra', () => {
    expect(palavrasDaFrase(INGLES, 'en')).toEqual([
      'Well',
      "I'm",
      'well-known',
      "aren't",
      'you',
      'The',
      'e-mail',
      'MB',
      'arrived',
      'today',
    ])
  })

  it('chinês: uma palavra por botão, sem a pontuação e sem repetir', () => {
    const palavras = palavrasDaFrase(`${CHINES}中文`, 'zh-CN')
    expect(palavras).toContain('中文')
    expect(palavras).toContain('学习')
    expect(palavras.filter((p) => p === '中文')).toHaveLength(1)
    expect(palavras.some((p) => /[，。]/.test(p))).toBe(false)
    expect(palavras).not.toContain(CHINES)
  })

  it('japonês: uma palavra por botão', () => {
    const palavras = palavrasDaFrase(JAPONES, 'ja')
    expect(palavras.length).toBeGreaterThan(3)
    expect(palavras).not.toContain(JAPONES)
  })
})

describe('LinhaDaLegenda: as palavras tocáveis da janelinha', () => {
  const fala = (original: string, lang?: string): LegendaAoVivo => ({
    id: 'f1',
    quem: 'Outros',
    original,
    traducao: 'tradução',
    lado: 'eles',
    lang,
  })

  function montar(f: LegendaAoVivo, aprendidas?: ReadonlySet<string>) {
    const aoTocarPalavra = vi.fn()
    render(
      <LinhaDaLegenda
        fala={f}
        modo="video"
        modoDaTraducao="sempre"
        traducaoVisivel
        emFoco
        aprendidas={aprendidas}
        aoTocarPalavra={aoTocarPalavra}
        aoCopiar={nada}
      />,
    )
    const original = document.querySelector<HTMLElement>('.leg-o')!
    return { aoTocarPalavra, original }
  }

  /** A marcação de antes desta mudança: um `span[data-palavra]` por pedaço entre espaços. */
  function deAntes(texto: string, aprendidas: ReadonlySet<string> = new Set()) {
    const chave = (p: string) => p.replace(/[,.:;?!¿¡"“”'’()[\]]/g, '').toLowerCase()
    return texto
      .split(/(\s+)/)
      .map((p) => ({ p, palavra: p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') }))
      .filter((x) => x.palavra)
      .map((x) => ({ texto: x.p, palavra: x.palavra, aprendida: aprendidas.has(chave(x.p)) }))
  }

  const naTela = (original: HTMLElement) =>
    [...original.querySelectorAll<HTMLElement>('[data-palavra]')].map((el) => ({
      texto: el.textContent,
      palavra: el.dataset.palavra,
      aprendida: el.hasAttribute('data-aprendida'),
    }))

  it.each([
    ['inglês', INGLES, 'en-US', new Set(['well-known', 'today'])],
    ['português', PORTUGUES, 'pt-BR', new Set(['guarda-chuva', 'olá'])],
    ['inglês sem palavra aprendida', INGLES, 'en', undefined],
    ['sem idioma declarado', INGLES, undefined, undefined],
  ])('%s: os mesmos pedaços, a mesma pontuação colada e a mesma marcação de aprendida', (_n, texto, lang, apr) => {
    const { original } = montar(fala(texto, lang), apr)
    expect(original.textContent).toBe(texto)
    expect(naTela(original)).toEqual(deAntes(texto, apr))
  })

  it('chinês: cada palavra é um alvo, e o toque entrega a palavra (não a frase)', () => {
    const { original, aoTocarPalavra } = montar(fala(CHINES, 'zh-CN'))
    expect(original.textContent).toBe(CHINES)
    const alvos = [...original.querySelectorAll<HTMLElement>('[data-palavra]')]
    expect(alvos.length).toBeGreaterThan(4)
    const alvo = alvos.find((el) => el.dataset.palavra === '中文')!
    expect(alvo, 'a palavra 中文 deveria ser um alvo').toBeTruthy()
    fireEvent.click(alvo)
    expect(aoTocarPalavra).toHaveBeenCalledWith('中文', expect.objectContaining({ id: 'f1' }))
    // A pontuação não é alvo.
    expect(alvos.some((el) => /[，。]/.test(el.dataset.palavra ?? ''))).toBe(false)
  })

  it('japonês: cada palavra é um alvo', () => {
    const { original } = montar(fala(JAPONES, 'ja'))
    expect(original.textContent).toBe(JAPONES)
    expect(original.querySelectorAll('[data-palavra]').length).toBeGreaterThan(3)
  })

  it.each([
    ['árabe', ARABE, 'ar', 'rtl'],
    ['hebraico', HEBRAICO, 'he-IL', 'rtl'],
    ['inglês', INGLES, 'en-US', 'ltr'],
  ])('%s: a linha leva a direção do idioma', (_n, texto, lang, dir) => {
    const { original } = montar(fala(texto, lang))
    expect(original.getAttribute('dir')).toBe(dir)
  })

  it('sem idioma declarado, não crava direção (herda a da tela)', () => {
    const { original } = montar(fala(INGLES))
    expect(original.hasAttribute('dir')).toBe(false)
  })
})

describe('HistoricoDoPrototipo: a legenda ao vivo', () => {
  const seg = (texto: string, lang: string, traducao = ''): SpeechSegment =>
    ({
      id: 's1',
      timestamp: '00:01',
      originalText: texto,
      translatedText: traducao,
      lang,
      isPartial: !traducao,
    }) as unknown as SpeechSegment

  function montar(f: SpeechSegment, idiomaDaTraducao?: (lang: string) => string | undefined) {
    render(
      <HistoricoDoPrototipo
        falas={[f]}
        escala={1}
        idiomaPadrao="en"
        idiomaDaTraducao={idiomaDaTraducao}
        aoTocar={nada}
      />,
    )
    return document.querySelector<HTMLElement>('.q-fala')!
  }

  it.each([
    ['inglês', INGLES, 'en'],
    ['português', PORTUGUES, 'pt-BR'],
  ])('%s: chega palavra por palavra como antes (um pedaço por espaço, com o espaço depois)', (_n, texto, lang) => {
    const grande = montar(seg(texto, lang)).querySelector<HTMLElement>('.q-t')!
    const pedacos = [...grande.querySelectorAll('span')].map((el) => el.textContent)
    expect(pedacos).toEqual(
      texto
        .split(' ')
        .filter(Boolean)
        .map((p) => `${p} `),
    )
  })

  it('chinês: chega palavra por palavra, sem espaço inventado entre elas', () => {
    const grande = montar(seg(CHINES, 'zh')).querySelector<HTMLElement>('.q-t')!
    expect(grande.querySelectorAll('span').length).toBeGreaterThan(4)
    expect(grande.textContent?.trimEnd()).toBe(CHINES)
  })

  it('árabe: a linha grande sai da direita para a esquerda', () => {
    const grande = montar(seg(ARABE, 'ar')).querySelector<HTMLElement>('.q-t')!
    expect(grande.getAttribute('lang')).toBe('ar')
    expect(grande.getAttribute('dir')).toBe('rtl')
  })

  it('inglês traduzido para o árabe: a original segue ltr e a tradução vai rtl', () => {
    const botao = montar(seg('Good morning.', 'en', 'صباح الخير.'), () => 'ar')
    expect(botao.querySelector('.q-o')?.getAttribute('dir')).toBe('ltr')
    expect(botao.querySelector('.q-t')?.getAttribute('dir')).toBe('rtl')
  })

  it('a regra do texto da fala alinha pelo começo da escrita, e não sempre à esquerda', () => {
    const css = readFileSync('src/styles/capturaNoCelular.css', 'utf8')
    const regra = /\.q-fala \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(regra).toContain('text-align: start;')
    expect(regra).not.toContain('text-align: left')
  })
})

describe('LegendaFlutuanteDoPrototipo: o espelho das últimas falas', () => {
  it('árabe com tradução em português: cada linha na sua direção', () => {
    const falas: LegendaAoVivo[] = [
      { id: 'a', quem: 'Outros', original: ARABE, traducao: 'Bom dia a todos.', lado: 'eles', lang: 'ar' },
    ]
    render(<LegendaFlutuanteDoPrototipo aberta falas={falas} idiomaDaTraducao={() => 'pt-BR'} aoFechar={nada} />)
    expect(document.querySelector('.leg-o')?.getAttribute('dir')).toBe('rtl')
    expect(document.querySelector('.leg-t')?.getAttribute('dir')).toBe('ltr')
  })
})

describe('As folhas da frase', () => {
  const tocada = { id: 'a', texto: ARABE, traducao: 'Bom dia a todos.', lang: 'ar', langDaTraducao: 'pt-BR' }

  it('FolhaDaFrase: a frase em árabe vai rtl, a tradução ltr, e os botões de palavra rtl', () => {
    render(<FolhaDaFrase fala={tocada} aoOuvir={nada} aoTocarPalavra={nada} aoFechar={nada} />)
    expect(document.querySelector('.folha-frase')?.getAttribute('dir')).toBe('rtl')
    expect(document.querySelector('.folha-frase-trad')?.getAttribute('dir')).toBe('ltr')
    expect(document.querySelector('.folha-palavras button')?.getAttribute('dir')).toBe('rtl')
    // A fila dos botões segue a ordem de leitura da frase.
    expect(document.querySelector('.folha-palavras')?.getAttribute('dir')).toBe('rtl')
  })

  it('FolhaDaFrase: em chinês, um botão por palavra', () => {
    const aoTocarPalavra = vi.fn()
    render(
      <FolhaDaFrase
        fala={{ id: 'z', texto: CHINES, traducao: '', lang: 'zh-CN' }}
        aoOuvir={nada}
        aoTocarPalavra={aoTocarPalavra}
        aoFechar={nada}
      />,
    )
    const botoes = [...document.querySelectorAll<HTMLElement>('.folha-palavras button')]
    expect(botoes.length).toBeGreaterThan(4)
    fireEvent.click(botoes.find((b) => b.textContent === '中文')!)
    expect(aoTocarPalavra).toHaveBeenCalledWith('中文')
  })

  it('FolhasDoPrototipo (a folha do desenho novo): a mesma direção e a mesma divisão', () => {
    render(
      <FolhasDoPrototipo
        fala={{ id: 'z', texto: CHINES, traducao: '', lang: 'zh-CN' }}
        palavra={null}
        aoFechar={nada}
        aoOuvir={nada}
        aoTocarPalavra={nada}
        aoConsultar={async () => ({ traducao: '' })}
        aoSalvar={async () => ''}
      />,
    )
    expect(document.querySelector('.folha-frase')?.getAttribute('dir')).toBe('ltr')
    const botoes = [...document.querySelectorAll<HTMLElement>('.folha-palavras button')]
    expect(botoes.map((b) => b.textContent?.trim())).toContain('中文')
  })
})

describe('Os textos novos passam pelos catálogos', () => {
  const CHAVES = [
    'este jogo usa letras do alfabeto latino, e {idioma} não é escrito com elas',
    'Os dois lados estão em {idioma}: não há o que traduzir, e as palavras fichadas ficam sem verso. Troque um dos dois.',
    'Detectar sozinho precisa do Whisper. Troque em Ajustes da captura → Microfone.',
    'Ainda não há tradutor no aparelho para este par: a tradução usa a internet.',
    'Não há tradutor para este par: as falas são transcritas, mas ficam sem tradução.',
  ]
  const fontes = ['src/components/views/Play.tsx', 'src/components/views/LiveCapture.tsx']
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')

  it.each(CHAVES)('"%s" está no código dentro de um t()', (chave) => {
    expect(fontes).toContain(`'${chave}'`)
  })

  it.each(['en', 'es', 'ar'])('%s: tem as cinco, traduzidas e com a lacuna do idioma no lugar', (idioma) => {
    const catalogo = JSON.parse(readFileSync(`public/i18n/${idioma}.json`, 'utf8')) as Record<string, string>
    for (const chave of CHAVES) {
      const traducao = catalogo[chave]
      expect(traducao, `${idioma}: falta "${chave}"`).toBeTruthy()
      expect(traducao).not.toBe(chave)
      expect(traducao.includes('{idioma}')).toBe(chave.includes('{idioma}'))
    }
  })
})
