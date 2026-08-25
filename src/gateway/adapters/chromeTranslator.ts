import type { MtResult, TranslationProvider } from '../capabilities'

/**
 * Chrome Translator API — tradução NATIVA on-device (Chrome/Edge 138+). É a mais rápida
 * (C++ nativo, sem rede, sem download no seu bundle) e funciona offline. Feature-detected:
 * se o navegador não tiver, o gateway cai para o próximo adapter (opus-mt local → MyMemory).
 * A API é sequencial (uma tradução por vez) — o gateway já serializa por chamada.
 */
declare const Translator: {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(t: string): Promise<string> }>
}

export class ChromeTranslatorMt implements TranslationProvider {
  readonly id = 'chrome-translator'
  readonly runtime = 'browser' as const
  readonly cost = 'free' as const
  readonly label = 'Chrome Translator (nativo)'

  // Cache de instâncias por par de idiomas (criar é caro; traduzir é barato).
  private instances = new Map<string, Promise<{ translate(t: string): Promise<string> }>>()

  /**
   * O que já APRENDEMOS sobre cada par. `supports()` é síncrono, então não pode consultar a API —
   * mas pode lembrar. Sem isto, um par que o Chrome não cobre era aprovado por `supports()`,
   * escolhido pelo gateway, e só falhava lá dentro do `translate()`: um round-trip desperdiçado por
   * tradução, e — pior — a falha contava contra o adapter no circuit breaker, penalizando os pares
   * que ele DE FATO cobre.
   */
  private known = new Map<string, 'ready' | 'unavailable' | 'downloading'>()

  static isPresent(): boolean {
    return typeof self !== 'undefined' && 'Translator' in self
  }

  supports(src: string | null, tgt: string): boolean {
    if (!ChromeTranslatorMt.isPresent() || !src || !tgt) return false
    const s = src.split('-')[0]
    const t = tgt.split('-')[0]
    if (s === t) return false
    // Já sabemos que este par não existe (ou que o pacote ainda está baixando): não prometa cobri-lo.
    const state = this.known.get(`${s}|${t}`)
    return state !== 'unavailable' && state !== 'downloading'
  }

  private getInstance(src: string, tgt: string) {
    const key = `${src}|${tgt}`
    let inst = this.instances.get(key)
    if (!inst) {
      inst = Translator.create({ sourceLanguage: src, targetLanguage: tgt })
      this.instances.set(key, inst)
    }
    return inst
  }

  async translate(text: string, src: string | null, tgt: string): Promise<MtResult> {
    if (!src) throw new Error('Chrome Translator exige idioma de origem')
    const s = src.split('-')[0]
    const t = tgt.split('-')[0]
    const key = `${s}|${t}`

    const status = await Translator.availability({ sourceLanguage: s, targetLanguage: t })

    if (status === 'unavailable') {
      this.known.set(key, 'unavailable') // não tentamos de novo neste par
      throw new Error(`Chrome Translator não cobre ${s}->${t}`)
    }

    /**
     * 'downloadable' / 'downloading' = o par existe, mas o pacote de idioma NÃO está no disco.
     * `Translator.create()` dispararia o download e ficaria pendurado — o usuário clicaria numa
     * palavra e esperaria, sem saber por quê, um download de dezenas de MB.
     *
     * Então: começamos o download em SEGUNDO PLANO e falhamos AGORA, para o gateway cair no próximo
     * motor imediatamente. A tradução sai na hora (por outro motor), e as próximas passam a ser
     * locais e instantâneas assim que o pacote terminar.
     */
    if (status !== 'available' && status !== 'readily') {
      if (this.known.get(key) !== 'downloading') {
        this.known.set(key, 'downloading')
        void this.getInstance(s, t)
          .then(() => this.known.set(key, 'ready'))
          .catch(() => {
            this.known.set(key, 'unavailable')
            this.instances.delete(key)
          })
      }
      throw new Error(`Chrome Translator ainda está baixando o pacote ${s}->${t}`)
    }

    this.known.set(key, 'ready')
    const translator = await this.getInstance(s, t)
    const translated = await translator.translate(text)
    if (!translated) throw new Error('Chrome Translator devolveu vazio')
    return { text: translated, detectedSourceLang: s, engine: 'chrome-translator' }
  }
}
