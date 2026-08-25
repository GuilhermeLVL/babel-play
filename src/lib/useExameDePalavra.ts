/**
 * EXAMINAR UMA PALAVRA DO BARALHO — a lógica que Metrics e Study mantinham em duplicata.
 *
 * `jscpd` mediu 4 blocos clonados entre `Metrics.tsx` e `Study.tsx`, ~101 linhas, o maior com 48.
 * Não era coincidência de formatação: era a MESMA rotina — resolver o idioma real da palavra,
 * abrir o painel do analista e buscar tradução sob demanda — escrita duas vezes.
 *
 * E as duas cópias já tinham divergido de um jeito silencioso: em `Metrics` a votação do par de
 * idiomas usava `vocabCards` (o baralho inteiro) e em `Study` usava `activeVocabCards` (o
 * recorte em estudo). Nada quebrava, mas a mesma palavra podia ser enviada ao tradutor com
 * idioma diferente conforme a tela — exatamente a classe de bug que o comentário original
 * dizia estar corrigindo. Aqui o chamador passa a lista que quer votar, e a escolha fica
 * explícita em vez de acidental.
 *
 * O que este hook NÃO faz, de propósito: não renderiza nada e não decide layout. As duas telas
 * mostram o resultado de formas diferentes, e essa diferença é legítima.
 */
import { useEffect, useMemo, useState } from 'react'
import type { VocabCard, VocabWord } from '../types'
import { fetchLangConfig, onLangConfigChange, DEFAULT_LANG_CONFIG, type LangConfig } from './langConfig'
import { baseLang } from './languages'
import { resolveWord, buildVocabWord, type WordOrigin } from './vocabWord'
import { buildGateway } from '../gateway'
import { getActiveProfile } from '../gateway/activeProfile'
import { speak as ttsSpeak } from './tts'

export interface ExameDePalavra {
  /** Configuração de idioma do usuário, já reconciliada com mudanças em Configurações. */
  langCfg: LangConfig
  /** Par de idiomas predominante entre os cartões votantes, sempre em ISO-639-1. */
  deckLangPair: { src: string; tgt: string }
  /** Cartão real do baralho para uma palavra, se existir. */
  cardFor: (word?: string) => VocabCard | undefined
  /** Par REAL de um cartão: `src` é o idioma da palavra, `tgt` o da tradução. */
  langPairOf: (card?: VocabCard) => { src: string; tgt: string }
  /** Palavra em foco no painel do analista. */
  palavraExaminada: VocabWord | null
  setPalavraExaminada: React.Dispatch<React.SetStateAction<VocabWord | null>>
  /** Abre o painel e busca tradução sob demanda quando o cartão não a tem. */
  examinar: (word: string, sentence?: string) => Promise<void>
  /** Fala a palavra no idioma REAL do cartão — nunca no idioma da interface. */
  falar: (word: string) => void
  velocidade: number
  setVelocidade: React.Dispatch<React.SetStateAction<number>>
}

/**
 * @param cartoes       baralho consultado para achar o cartão real de uma palavra
 * @param cartoesVotantes  subconjunto que decide o par de idiomas predominante. Em `Study` é o
 *   recorte em estudo; em `Metrics`, o baralho inteiro. Explícito porque a divergência entre as
 *   duas cópias vivia justamente aqui.
 */
export function useExameDePalavra(cartoes: VocabCard[], cartoesVotantes: VocabCard[] = cartoes): ExameDePalavra {
  const [palavraExaminada, setPalavraExaminada] = useState<VocabWord | null>(null)
  const [velocidade, setVelocidade] = useState(1.0)

  /**
   * Leitor ÚNICO da configuração (`lib/langConfig`). Antes cada tela lia `ui.captureSourceLang`
   * com um significado diferente — uma como idioma do usuário, outra como idioma estudado — e a
   * mesma palavra virava cartão com o par invertido conforme onde fosse clicada.
   */
  const [langCfg, setLangCfg] = useState<LangConfig>(DEFAULT_LANG_CONFIG)
  useEffect(() => {
    let vivo = true
    const carregar = () => {
      fetchLangConfig().then((c) => { if (vivo) setLangCfg(c) }).catch(() => {})
    }
    carregar()
    // A tela pode estar aberta quando o idioma muda em Configurações.
    const off = onLangConfigChange(carregar)
    return () => { vivo = false; off() }
  }, [])

  const langPairOf = (card?: VocabCard) => ({
    src: card?.srcLang || langCfg.studying,
    tgt: card?.tgtLang || langCfg.mine,
  })

  const cardFor = (word?: string) =>
    word ? cartoes.find((c) => c.word.toLowerCase() === word.toLowerCase()) : undefined

  /**
   * A votação NORMALIZA com `baseLang` antes de apurar: sem isso `pt-BR|en-US` e `pt|en` (o
   * formato do seed) contam como pares DISTINTOS e um par minoritário pode vencer só por estar
   * num formato mais uniforme.
   */
  const deckLangPair = useMemo(() => {
    const apuracao = new Map<string, number>()
    for (const c of cartoesVotantes) {
      const src = baseLang(c.srcLang || '')
      const tgt = baseLang(c.tgtLang || '')
      if (!src || !tgt) continue
      const chave = `${src}|${tgt}`
      apuracao.set(chave, (apuracao.get(chave) ?? 0) + 1)
    }
    const topo = [...apuracao.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topo) {
      const [src, tgt] = topo[0].split('|')
      return { src, tgt }
    }
    return { src: baseLang(langCfg.studying), tgt: baseLang(langCfg.mine) }
  }, [cartoesVotantes, langCfg])

  const gateway = useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: () => true }), [])

  const falar = (word: string) => {
    const lang = langPairOf(cardFor(word)).src
    ttsSpeak(word, { lang: lang || undefined, rate: velocidade })
  }

  /**
   * A origem tira o idioma da FRASE de contexto, não do par do baralho: um acervo bilíngue tem
   * palavras nos dois idiomas, e carimbar todas com o par majoritário é o que mandava a palavra
   * inglesa ao tradutor declarada como portuguesa.
   */
  const originOf = (word: string, sentence?: string, known?: VocabCard): WordOrigin => ({
    word,
    context: sentence || known?.sentence || undefined,
    declaredLang: known?.srcLang || undefined,
    config: langCfg,
  })

  /**
   * HONESTIDADE: `phonetics` e `explanation` só vêm do cartão REAL; `cefr` nunca é fabricado.
   * Sem motor para o par, o painel abre sem tradução e diz o porquê — em vez de ficar em
   * "traduzindo…" para sempre.
   */
  const examinar = async (word: string, sentence?: string) => {
    const known = cardFor(word)
    const origem = originOf(word, sentence, known)

    // 1ª fase — abre assim que o idioma real está resolvido (detecção local, sem rede).
    const resolvida = await resolveWord(origem)
    setPalavraExaminada({
      word,
      translation: known?.translation || '',
      phonetics: known?.phonetics || undefined,
      explanation: known?.explanation || undefined,
      example: resolvida.context,
      lang: resolvida.lang || undefined,
    })
    if (known?.translation) return

    // 2ª fase — tradução na direção decidida pelo idioma DA PALAVRA.
    const { vocab } = await buildVocabWord(origem, gateway.mt)
    if (!vocab.translation) return
    setPalavraExaminada((prev) =>
      prev && prev.word === word
        ? { ...prev, translation: vocab.translation, mtEngine: vocab.mtEngine }
        : prev,
    )
  }

  return {
    langCfg, deckLangPair, cardFor, langPairOf,
    palavraExaminada, setPalavraExaminada, examinar, falar,
    velocidade, setVelocidade,
  }
}
