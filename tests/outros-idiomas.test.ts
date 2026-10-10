// @vitest-environment jsdom
import { readFileSync } from 'node:fs'

import { beforeAll, describe, expect, it } from 'vitest'

import { makeCloze } from '../src/core/learning/cloze'
import { vazaResposta } from '../src/core/learning/pistaDeJogo'
import { estadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import { buildItems, canPlay } from '../src/core/minigames/itemSource'
import { palavrasDaFrase } from '../src/core/minigames/palavrasDaFrase'
import { buildScrambleRounds } from '../src/core/minigames/scramble'
import { type MinigameId, MINIGAMES } from '../src/core/minigames/types'
import { alfabetoDeEnchimento } from '../src/core/minigames/wordsearch'
import { detectarIdiomaPorTexto } from '../src/core/texto/detectarIdioma'
import { escreveSemEspaco, palavrasDoTexto } from '../src/core/texto/segmentacao'
import { OpusMtLocal } from '../src/gateway/adapters/opusMtLocal'
import { filtrarAlucinacao } from '../src/gateway/alucinacao'
import { routeStt } from '../src/gateway/sttRouter'
import { idiomasDoModelo } from '../src/lib/captura/idiomasDoModelo'
import { direcaoDoLado } from '../src/lib/captura/interprete'
import { trechosTocaveis } from '../src/lib/captura/trechosTocaveis'
import { direcaoDoTexto, LANGUAGES, mtCoverage, toBcp47 } from '../src/lib/languages'
import type { VocabCard } from '../src/types'

/**
 * O APP EM OUTROS IDIOMAS — a tabela idioma × função pura (auditoria de 10/10/2026,
 * `docs/auditoria/2026-10-10-outros-idiomas.md`).
 *
 * O relato do dono: "a gente focou muito no inglês"; no mandarim, a conversa travou, a tradução não
 * apareceu escrita, a voz não saiu, e nos jogos "as palavras e as frases não faziam sentido". Cada
 * bloco abaixo percorre os MESMOS doze idiomas com uma frase real de cada um, para que um defeito que
 * só aparece fora do alfabeto latino não volte a passar por um teste escrito em inglês.
 *
 * O que NÃO se prova aqui: a qualidade de um modelo (o Whisper em mandarim, o tradutor), que só o
 * aparelho mede. Prova-se o caminho: a rota, o código que chega ao modelo, o que os filtros deixam
 * passar, e o que cada jogo monta.
 */

interface Idioma {
  /** ISO-639-1. */
  base: string
  /** Uma frase comum, com pontuação do próprio idioma. */
  frase: string
  /** As palavras que a segmentação precisa achar na frase (não todas: as inequívocas). */
  palavras: string[]
  latino: boolean
  semEspaco: boolean
  rtl: boolean
}

const IDIOMAS: Idioma[] = [
  {
    base: 'en',
    frase: 'I want to buy a car today.',
    palavras: ['want', 'car', 'today'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'pt',
    frase: 'Eu quero comprar um carro hoje.',
    palavras: ['quero', 'carro', 'hoje'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'es',
    frase: '¿Dónde está la estación de tren?',
    palavras: ['Dónde', 'estación', 'tren'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'fr',
    frase: "Je voudrais acheter une voiture aujourd'hui.",
    palavras: ['voudrais', 'voiture'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'de',
    frase: 'Ich möchte heute ein Auto kaufen.',
    palavras: ['möchte', 'heute', 'Auto'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'it',
    frase: 'Vorrei comprare una macchina oggi.',
    palavras: ['Vorrei', 'macchina', 'oggi'],
    latino: true,
    semEspaco: false,
    rtl: false,
  },
  { base: 'zh', frase: '我今天想买一辆车。', palavras: ['今天', '想'], latino: false, semEspaco: true, rtl: false },
  {
    base: 'ja',
    frase: '今日は車を買いたいです。',
    palavras: ['今日', '車'],
    latino: false,
    semEspaco: true,
    rtl: false,
  },
  {
    base: 'ko',
    frase: '오늘 차를 사고 싶어요.',
    palavras: ['오늘', '차를'],
    latino: false,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'ar',
    frase: 'أريد أن أشتري سيارة اليوم.',
    palavras: ['أريد', 'سيارة', 'اليوم'],
    latino: false,
    semEspaco: false,
    rtl: true,
  },
  {
    base: 'ru',
    frase: 'Я хочу купить машину сегодня.',
    palavras: ['хочу', 'машину', 'сегодня'],
    latino: false,
    semEspaco: false,
    rtl: false,
  },
  {
    base: 'hi',
    frase: 'मैं आज एक गाड़ी खरीदना चाहता हूँ।',
    palavras: ['आज', 'गाड़ी'],
    latino: false,
    semEspaco: false,
    rtl: false,
  },
]
const POR_BASE = Object.fromEntries(IDIOMAS.map((i) => [i.base, i]))
const BASES = IDIOMAS.map((i) => i.base)

describe('os doze idiomas estão na lista que o app oferece', () => {
  it.each(BASES)('%s tem entrada em LANGUAGES e um BCP-47 com região', (base) => {
    expect(LANGUAGES.some((l) => l.short === base)).toBe(true)
    expect(toBcp47(base)).toMatch(new RegExp(`^${base}-[A-Z]{2}$`))
  })
})

/* ─────────────────────────────── 1. TRANSCREVER ─────────────────────────────── */

describe('transcrição: a rota e o que o filtro deixa passar', () => {
  const rota = (base: string, micLang = '') =>
    routeStt({
      contentLang: base,
      micLang,
      autoDetect: false,
      quality: 'auto',
      hasWebGpu: false,
      cloudAvailable: false,
      profileId: 'free-web',
      parakeet: false,
    })

  it.each(BASES)('%s: o modelo local escolhido decodifica o idioma (Moonshine só no inglês)', (base) => {
    const { localModel } = rota(base)
    if (base === 'en') expect(localModel).toMatch(/moonshine/i)
    else expect(localModel).toMatch(/whisper/i)
  })

  it.each(BASES.filter((b) => b !== 'en'))(
    'inglês de um lado e %s do outro (o intérprete): nunca o modelo só de inglês',
    (base) => {
      expect(rota('en', base).localModel).not.toMatch(/moonshine/i)
      expect(rota(base, 'en').localModel).not.toMatch(/moonshine/i)
    },
  )

  /* NO INTÉRPRETE o modelo ouve os dois idiomas pelo microfone, e o par muda no meio da conversa sem a
     rota ser refeita: nunca o modelo só de inglês, nem com o microfone contado como "do navegador". */
  it.each(BASES.filter((b) => b !== 'en'))('intérprete inglês ↔ %s: a rota é sempre multilíngue', (base) => {
    for (const [ouve, falo] of [
      ['en', base],
      [base, 'en'],
      ['en', 'pt'],
    ]) {
      for (const micVaiAoModelo of [true, false]) {
        const m = idiomasDoModelo({
          cenario: 'interprete',
          virtual: false,
          ouve,
          falo,
          micVaiAoModelo,
          detectar: false,
        })
        expect(m.soIngles).toBe(false)
        const r = routeStt({
          contentLang: ouve,
          micLang: m.idiomaDoMicrofone,
          autoDetect: m.detectar,
          quality: 'auto',
          hasWebGpu: false,
          cloudAvailable: false,
          profileId: 'free-web',
          parakeet: true,
        })
        expect(r.localModel, `${ouve}/${falo}`).toMatch(/whisper/i)
      }
    }
  })

  it('fora do intérprete a conta é a de sempre: inglês nas duas fontes pode ir ao modelo de inglês', () => {
    const base = { virtual: false, ouve: 'en', detectar: false }
    expect(idiomasDoModelo({ ...base, cenario: 'media', falo: 'pt', micVaiAoModelo: false })).toEqual({
      idiomaDoMicrofone: '',
      detectar: false,
      soIngles: true,
    })
    expect(idiomasDoModelo({ ...base, cenario: 'conversation', falo: 'pt', micVaiAoModelo: true })).toEqual({
      idiomaDoMicrofone: 'pt',
      detectar: false,
      soIngles: false,
    })
    // A conversa virtual segue a captura de sempre (o som do computador é uma fonte própria).
    expect(
      idiomasDoModelo({ ...base, cenario: 'interprete', virtual: true, falo: 'pt', micVaiAoModelo: false }).soIngles,
    ).toBe(true)
  })

  /* A CAUSA DO "NÃO FUNCIONOU, NEM ESCRITO EM TELA": o filtro de alucinação tratava como ruído toda
     palavra sem vogal LATINA ("Vrm", "Grr") — e uma frase inteira em chinês, árabe, russo, coreano,
     japonês ou hindi não tem nenhuma. A fala era transcrita certo e jogada fora antes da tela. */
  it.each(IDIOMAS)('$base: uma frase comum sobrevive ao filtro de alucinação', ({ base, frase }) => {
    expect(filtrarAlucinacao(frase, 3, base)).toBe(frase)
  })

  it.each([
    ['zh', '好。'],
    ['zh', '对'],
    ['ja', 'はい。'],
    ['ko', '네.'],
    ['ru', 'Да.'],
    ['ar', 'نعم'],
    ['hi', 'हाँ'],
    ['de', 'Öl'],
  ])('%s: a resposta curta "%s" não é descartada como vocalização', (base, texto) => {
    expect(filtrarAlucinacao(texto, 1, base)).toBe(texto)
  })

  it('o ruído em alfabeto latino continua sendo descartado', () => {
    expect(filtrarAlucinacao('Grr', 2, 'pt')).toBe('')
    expect(filtrarAlucinacao('Shh tsk', 2, 'en')).toBe('')
    expect(filtrarAlucinacao('hahaha', 2, 'pt')).toBe('')
  })

  it.each(IDIOMAS)('$base: o lado do intérprete leva ao reconhecedor o BCP-47 e ao tradutor a base', ({ base }) => {
    const d = direcaoDoLado('outro', { meu: 'pt-BR', outro: base })
    expect(d.fala).toBe(toBcp47(base))
    expect(d.de).toBe(base)
    expect(d.para).toBe('pt')
  })

  it.todo(
    'nb-NO chega ao Whisper local como "no" (hoje chega "nb", que a biblioteca recusa) — fora dos doze; ' +
      'pede um mapa de código em src/gateway/adapters/whisperWorker.ts',
  )
  it.todo('transcrição REAL em mandarim pelo Whisper local e pela nuvem — não verificado: exige baixar o modelo')
})

describe('detecção de idioma pelo texto', () => {
  it.each(IDIOMAS.filter((i) => !i.latino))('$base: a escrita própria decide', ({ base, frase }) => {
    expect(detectarIdiomaPorTexto(frase)?.lang).toBe(base)
  })

  /* O RELATO: "inglês classificado como tcheco". A lista tcheca tem "a" e "to"; a inglesa não tinha. */
  it.each(['I want to buy a car', 'I need to go to a store', 'so we went to a bar', 'Give it to me', 'I am on a boat'])(
    'inglês não é tcheco, polonês nem finlandês: "%s"',
    (frase) => {
      expect(detectarIdiomaPorTexto(frase)?.lang).toBe('en')
    },
  )

  /* UM NOME PRÓPRIO NÃO MUDA O IDIOMA DA FRASE: a tradução para o português que cita um nome chinês
     era lida como chinês (0,95) e rejeitada como "não traduziu" (`validaTraducao.ts`). */
  it.each([
    ['Meu nome é 王伟 e moro em São Paulo com a minha família', 'pt'],
    ['Ontem eu falei com a Наташа sobre a viagem para o Brasil', 'pt'],
    ['The meeting with محمد is tomorrow and they have the report', 'en'],
  ])('uma palavra em outra escrita não decide: "%s"', (frase, esperado) => {
    expect(detectarIdiomaPorTexto(frase)?.lang).toBe(esperado)
  })

  it('japonês com kanji e kana é japonês; só han é chinês', () => {
    expect(detectarIdiomaPorTexto('今日は車を買いたいです。')?.lang).toBe('ja')
    expect(detectarIdiomaPorTexto('我今天想买一辆车。')?.lang).toBe('zh')
  })
})

/* ─────────────────────────────── 2. TRADUZIR ─────────────────────────────── */

describe('tradução: a cobertura que a tela anuncia é a do tradutor local de verdade', () => {
  const opus = new OpusMtLocal()
  const pares = BASES.flatMap((a) => BASES.filter((b) => b !== a).map((b) => [a, b] as const))

  it.each(pares)('%s → %s: "no aparelho" só quando há modelo local para o par', (de, para) => {
    const local = opus.supports(de, para)
    expect(mtCoverage(de, para)).toBe(local ? 'local' : 'online')
  })

  it.each(BASES)('%s → %s: mesmo idioma não tem o que traduzir', (base) => {
    expect(mtCoverage(base, toBcp47(base))).toBe('same')
  })

  it.each(['zh', 'ja', 'ko', 'ar', 'ru', 'hi'])('pt ↔ %s não tem tradutor no aparelho (depende da internet)', (b) => {
    expect(mtCoverage('pt', b)).toBe('online')
    expect(mtCoverage(b, 'pt')).toBe('online')
  })

  it.todo('pt ↔ zh/ja/ko/ar/ru/hi sem internet: pivô pelo inglês ou modelo próprio — decisão do dono (não há hoje)')
})

/* ─────────────────────────────── 3. FALAR ─────────────────────────────── */

describe('voz: a escolha por idioma', () => {
  type Voz = { name: string; lang: string; localService: boolean; default: boolean; voiceURI: string }
  let vozes: Voz[] = []
  let tts: typeof import('../src/lib/tts')
  let voz: typeof import('../src/lib/voz/faltaDeVoz')
  const instalar = (langs: string[]) => {
    vozes = langs.map((lang) => ({ name: `Voz ${lang}`, lang, localService: true, default: false, voiceURI: lang }))
    // O app guarda a lista e só a relê quando o navegador avisa que ela mudou.
    for (const ouvinte of ouvintes) ouvinte()
  }
  const ouvintes: Array<() => void> = []

  beforeAll(async () => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => vozes,
        addEventListener: (_evento: string, ouvinte: () => void) => void ouvintes.push(ouvinte),
        removeEventListener: () => {},
        cancel: () => {},
        speak: () => {},
      },
    })
    tts = await import('../src/lib/tts')
    voz = await import('../src/lib/voz/faltaDeVoz')
  })

  it.each(BASES)('%s: com a voz do idioma instalada, é ela a escolhida', (base) => {
    instalar(['en-US', 'pt-BR', toBcp47(base)])
    expect(tts.pickVoice(toBcp47(base))?.lang).toBe(toBcp47(base))
    expect(tts.hasVoiceFor(base)).toBe(true)
    expect(voz.faltaVozNoAparelho(base)).toBe(false)
  })

  it.each(BASES.filter((b) => b !== 'en' && b !== 'pt'))(
    '%s: sem a voz do idioma, nenhuma outra é usada no lugar, e a falta é dita',
    (base) => {
      instalar(['en-US', 'pt-BR'])
      expect(tts.pickVoice(toBcp47(base))).toBeNull()
      expect(tts.hasVoiceFor(base)).toBe(false)
      expect(voz.faltaVozNoAparelho(toBcp47(base))).toBe(true)
    },
  )

  it('lista de vozes ainda vazia não é "falta voz": o navegador escolhe pelo idioma', () => {
    instalar([])
    expect(voz.faltaVozNoAparelho('zh-CN')).toBe(false)
  })

  it('mandarim: aceita os códigos que os sistemas usam e não lê com voz cantonesa', () => {
    instalar(['zh_CN'])
    expect(tts.pickVoice('zh-CN')?.lang).toBe('zh_CN')
    instalar(['cmn-Hans-CN'])
    expect(tts.pickVoice('zh-CN')?.lang).toBe('cmn-Hans-CN')
    expect(tts.hasVoiceFor('zh')).toBe(true)
    instalar(['zh-HK', 'zh-TW'])
    expect(tts.pickVoice('zh-CN')?.lang).toBe('zh-TW')
    instalar(['zh-HK', 'yue-Hant-HK'])
    expect(tts.pickVoice('zh-CN')).toBeNull()
    expect(voz.faltaVozNoAparelho('zh-CN')).toBe(true)
  })

  it('a base precisa ser a mesma: finlandês não lê com voz filipina, e os códigos antigos valem', () => {
    instalar(['fil-PH'])
    expect(tts.pickVoice('fi-FI')).toBeNull()
    instalar(['iw-IL', 'in-ID', 'no-NO'])
    expect(tts.pickVoice('he-IL')?.lang).toBe('iw-IL')
    expect(tts.pickVoice('id-ID')?.lang).toBe('in-ID')
    expect(tts.pickVoice('nb-NO')?.lang).toBe('no-NO')
  })

  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141', /Windows/, /Hora e idioma/],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 7) Chrome/141 Mobile', /Android/, /Conversão de texto em voz/i],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari', /iPhone|iPad/, /Conteúdo Falado/i],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', /Mac/, /Conteúdo Falado/i],
  ])('o aviso diz o que houve e o caminho no sistema (%s)', (agente, sistema, caminho) => {
    const texto = voz.comoInstalarVoz('zh-CN', agente)
    expect(texto).toMatch(/não tem voz/)
    expect(texto).toMatch(sistema)
    expect(texto).toMatch(caminho)
  })
})

/* ─────────────────────────────── 5. PALAVRAS ─────────────────────────────── */

describe('palavras: segmentar para tocar, salvar e contar', () => {
  it.each(IDIOMAS)('$base: a frase vira palavras, e não uma peça só', ({ base, frase, palavras }) => {
    const achadas = palavrasDoTexto(frase, base)
    expect(achadas.length).toBeGreaterThanOrEqual(3)
    for (const p of palavras) expect(achadas, `${base}: faltou "${p}"`).toContain(p)
    expect(achadas.join('')).not.toMatch(/[。．.،؟?!！？।]/)
  })

  it.each(IDIOMAS)('$base: os trechos tocáveis juntos devolvem o texto original', ({ base, frase }) => {
    const trechos = trechosTocaveis(frase, toBcp47(base))
    expect(trechos.map((t) => t.texto).join('')).toBe(frase)
    expect(trechos.filter((t) => t.palavra).length).toBeGreaterThanOrEqual(3)
  })

  it.each(IDIOMAS)('$base: sabe se a escrita separa palavras e para que lado se lê', ({ base, semEspaco, rtl }) => {
    expect(escreveSemEspaco(base)).toBe(semEspaco)
    expect(direcaoDoTexto(toBcp47(base))).toBe(rtl ? 'rtl' : 'ltr')
  })

  it.todo('transliteração (pinyin, romaji) na folha da palavra — não existe; decisão do dono')
})

/* ─────────────────────────────── 6. MINIJOGOS ─────────────────────────────── */

const AGORA = Date.parse('2026-10-10T12:00:00.000Z')

interface DadoDaTrilha {
  niveis: Record<string, Array<[string, string?, string?]>>
}

/** As primeiras palavras da Trilha de verdade que têm glosa e frase: o que um usuário novo recebe. */
function baralhoDaTrilha(base: string, quantas = 60): VocabCard[] {
  const trilha = JSON.parse(readFileSync(`public/trilha/${base}.json`, 'utf8')) as DadoDaTrilha
  let glosas: Record<string, string> = {}
  try {
    glosas = (JSON.parse(readFileSync(`public/glosas/${base}-pt.json`, 'utf8')) as { glosas: Record<string, string> })
      .glosas
  } catch {
    /* inglês e português não têm arquivo de glosas `*-pt` */
  }
  const cartas: VocabCard[] = []
  for (const nivel of Object.values(trilha.niveis)) {
    for (const [palavra, frase] of nivel) {
      const traducao = glosas[palavra]
      if (!traducao || !frase) continue
      cartas.push({
        id: `t${cartas.length}`,
        word: palavra,
        translation: traducao,
        sentence: frase,
        phonetics: '',
        explanation: '',
        leitnerBox: 1,
        leitnerDueAt: new Date(AGORA + 86_400_000).toISOString(),
        fsrsDueAt: new Date(AGORA + 86_400_000).toISOString(),
        fsrsState: 'Review',
        fsrsStability: 5,
        fsrsDifficulty: 5,
        fsrsPredictedRetention: 0,
        inDeck: true,
        srcLang: base,
      } as VocabCard)
      if (cartas.length >= quantas) return cartas
    }
  }
  return cartas
}

const COM_TRILHA_E_GLOSA = ['es', 'fr', 'de', 'it', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi']
const DE_PALAVRA = (Object.keys(MINIGAMES) as MinigameId[]).filter((id) => MINIGAMES[id].modalidade === 'palavra')
const EXIGEM_LATINO = DE_PALAVRA.filter((id) => MINIGAMES[id].requisitos?.alfabeto === 'latino')
const tabela = COM_TRILHA_E_GLOSA.flatMap((base) => DE_PALAVRA.map((jogo) => [base, jogo] as const))

describe('minijogos: cada jogo × cada idioma, com as palavras da Trilha', () => {
  const baralhos = new Map<string, VocabCard[]>()
  const baralho = (base: string) => {
    if (!baralhos.has(base)) baralhos.set(base, baralhoDaTrilha(base))
    return baralhos.get(base)!
  }
  const estado = (jogo: MinigameId, base: string) =>
    estadoDoJogo(jogo, {
      cartas: baralho(base),
      frases: [],
      temAudio: false,
      temVoz: true,
      fonteId: 'baralho',
      lang: base,
    })

  it.each(COM_TRILHA_E_GLOSA)('%s: a Trilha e as glosas dão material para montar um baralho', (base) => {
    expect(baralho(base).length).toBeGreaterThanOrEqual(20)
  })

  it.each(tabela)('%s · %s: ou a rodada faz sentido, ou o jogo não é oferecido e diz por quê', (base, jogo) => {
    const e = estado(jogo, base)
    const latino = POR_BASE[base].latino
    if (!latino && EXIGEM_LATINO.includes(jogo)) {
      /* Jogo de LETRAS em escrita que ele não desenha: fora da grade, com o motivo certo (e não
         "faltam 4 palavras", que mandaria a pessoa juntar mais do que já tem de sobra). */
      expect(e.ok).toBe(false)
      expect(e.motivo).toBe('alfabeto-nao-suportado')
      expect(buildItems(jogo, baralho(base), { now: AGORA })).toEqual([])
      return
    }
    if (!e.ok) {
      // Só o Shiritori pode recusar por conjunto (as palavras precisam encadear).
      expect(jogo, `${jogo} recusou o baralho ${base} sem motivo: faltam ${e.faltam}`).toBe('shiritori')
      return
    }
    const itens = buildItems(jogo, baralho(base), { now: AGORA })
    expect(itens.length).toBeGreaterThanOrEqual(MINIGAMES[jogo].minItems)
    for (const item of itens) {
      expect(item.lang, 'um item de outro idioma entrou na rodada').toBe(base)
      expect(item.answer.trim()).not.toBe('')
      expect(item.prompt.trim()).not.toBe('')
      expect(vazaResposta(item.prompt, item.answer), `a pista "${item.prompt}" entrega "${item.answer}"`).toBe(false)
    }
    expect(new Set(itens.map((i) => i.answer)).size).toBe(itens.length)
  })

  /* A CHARADA: o gate contava os itens com frase e o tabuleiro não conseguia abrir lacuna em nenhuma
     (a lacuna usava `\b`, que só conhece letras ASCII) — a carta prometia o jogo e voltava para a grade. */
  it.each(COM_TRILHA_E_GLOSA)('%s · Charada: todo item que o gate conta tem enigma que o tabuleiro monta', (base) => {
    const itens = buildItems('vitendawili', baralho(base), { now: AGORA })
    for (const item of itens) {
      const temEnigma = (item.clozed && /_{3,}/.test(item.prompt)) || !!makeCloze(item.sentence ?? '', item.answer)
      expect(temEnigma, `sem enigma: "${item.answer}" em "${item.sentence}"`).toBe(true)
    }
    expect(canPlay('vitendawili', baralho(base), { now: AGORA }).disponiveis).toBe(itens.length)
  })
})

describe('caça-palavras: o enchimento não entrega a palavra', () => {
  /* A grade enche com um alfabeto curto (sem J, K, Q, V, X, Y, Z): em alemão, espanhol, francês e
     italiano, toda casa com uma dessas letras era de uma resposta. */
  it.each([
    ['de', ['KATZE', 'VOGEL', 'JAHR', 'ZEIT']],
    ['es', ['JUEVES', 'QUESO', 'VIAJE', 'AÑO']],
    ['fr', ['VOITURE', 'YEUX', 'ÉTÉ', 'KIWI']],
    ['it', ['VIAGGIO', 'ZUCCHERO', 'QUADRO']],
  ])('%s: toda letra das palavras colocadas está entre as letras de enchimento', (_base, palavras) => {
    const alfabeto = alfabetoDeEnchimento('ABCDEFGHILMNOPRSTUW', palavras)
    for (const letra of palavras.join('')) expect(alfabeto).toContain(letra)
    expect(new Set(alfabeto).size).toBe(alfabeto.length)
  })
})

describe('a lacuna na frase, em cada escrita', () => {
  it.each([
    ['es', '¿Qué hora es?', 'Qué', '¿_____ hora es?'],
    ['fr', "J'ai été malade.", 'été', "J'ai _____ malade."],
    ['de', 'Das Mädchen ist müde.', 'müde', 'Das Mädchen ist _____.'],
    ['ru', 'Я хочу купить машину.', 'машину', 'Я хочу купить _____.'],
    ['ar', 'أريد أن أشتري سيارة اليوم.', 'سيارة', 'أريد أن أشتري _____ اليوم.'],
    ['hi', 'मैं आज एक गाड़ी खरीदना चाहता हूँ।', 'गाड़ी', 'मैं आज एक _____ खरीदना चाहता हूँ।'],
    ['ko', '오늘 차를 사고 싶어요.', '차를', '오늘 _____ 사고 싶어요.'],
    ['zh', '我今天想买一辆车。', '今天', '我_____想买一辆车。'],
    ['ja', '今日は車を買いたいです。', '車', '今日は_____を買いたいです。'],
    ['en', 'She walked home.', 'walk', 'She _____ home.'],
  ])('%s: "%s" sem "%s"', (_base, frase, palavra, esperado) => {
    expect(makeCloze(frase, palavra)?.prompt).toBe(esperado)
  })

  it('não abre a lacuna no meio de outra palavra', () => {
    expect(makeCloze('Он сказал правду.', 'сказа')).toBeNull()
    expect(makeCloze('Das Mädchen ist müde.', 'Mäd')).toBeNull()
    // 成交 ("fechar negócio") não é palavra dentro de 造成交通事故 ("causar acidente de trânsito").
    expect(makeCloze('他造成交通事故。', '成交')).toBeNull()
  })
})

describe('frase embaralhada: as peças de cada escrita', () => {
  it.each(IDIOMAS)('$base: as peças são palavras, e juntas refazem a frase', ({ base, frase, semEspaco }) => {
    const pecas = palavrasDaFrase(frase, base)
    expect(pecas.length).toBeGreaterThanOrEqual(4)
    const semPontuacao = frase.replace(/[\s\p{P}]/gu, '')
    expect(pecas.join('').replace(/[\s\p{P}]/gu, '')).toBe(semPontuacao)
    if (semEspaco) expect(pecas.some((p) => [...p].length > 1)).toBe(true)
  })

  it.each(IDIOMAS)('$base: a rodada só nasce de frase com tradução, e leva o idioma dela', ({ base, frase }) => {
    const frases = [1, 2, 3].map((i) => ({ id: `f${i}`, text: frase, translation: `tradução ${i}`, lang: base }))
    const rodadas = buildScrambleRounds(frases, { quantidade: 3, rand: () => 0.42 })
    expect(rodadas.length).toBeGreaterThan(0)
    expect(buildScrambleRounds([{ id: 'x', text: frase, lang: base }], { quantidade: 3 })).toEqual([])
  })

  it.todo(
    'Frase embaralhada em chinês e japonês: as peças vêm do segmentador do aparelho (ex.: "的是" numa peça só); ' +
      'oferecer ou não nesses idiomas é decisão do dono',
  )
  it.todo(
    'Trilha de mandarim: 29% das "palavras" não são palavra na própria frase de exemplo e 80% não têm glosa — ' +
      'o conserto é no gerador dos dados (scripts da Trilha), fora deste trabalho',
  )
  it.todo(
    'Ditado, Escuta e Karaokê na Trilha de mandarim usam palavra solta por voz (homófonos 他/她/它): decisão do dono',
  )
})
