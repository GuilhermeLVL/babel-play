import type { MtResult, TranslationProvider } from '../capabilities';

/**
 * Chrome Translator API — tradução NATIVA on-device (Chrome/Edge 138+). É a mais rápida
 * (C++ nativo, sem rede, sem download no seu bundle) e funciona offline. Feature-detected:
 * se o navegador não tiver, o gateway cai para o próximo adapter (opus-mt local → MyMemory).
 * A API é sequencial (uma tradução por vez) — o gateway já serializa por chamada.
 */
declare const Translator: {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(t: string): Promise<string> }>;
};

/**
 * PRAZO DA CONSULTA DE DISPONIBILIDADE. Medido na auditoria de latência (2026-09-26): no headless
 * shell, `Translator.availability()` levou 6,0 s para responder, e como a chamada era refeita a CADA
 * tradução, sem prazo, três legendas esperaram 6 s cada antes de o opus-mt ser tentado. Onde a API
 * funciona, ela responde na hora; passado o prazo, esta tradução segue pela cascata e a resposta,
 * quando vier, fica guardada para as próximas.
 */
export const PRAZO_DA_DISPONIBILIDADE_MS = 250;

type Estado = 'ready' | 'unavailable' | 'downloading' | 'consultando';

export class ChromeTranslatorMt implements TranslationProvider {
  readonly id = 'chrome-translator';
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'Chrome Translator (nativo)';

  // Cache de instâncias por par de idiomas (criar é caro; traduzir é barato).
  private instances = new Map<string, Promise<{ translate(t: string): Promise<string> }>>();

  /**
   * O que já APRENDEMOS sobre cada par, pela sessão. `supports()` é síncrono, então não pode consultar
   * a API — mas pode lembrar. Sem isto, um par que o Chrome não cobre era aprovado por `supports()`,
   * escolhido pelo gateway, e só falhava lá dentro do `translate()`: um round-trip desperdiçado por
   * tradução, e — pior — a falha contava contra o adapter no circuit breaker, penalizando os pares
   * que ele DE FATO cobre. `consultando` = a consulta estourou o prazo e ainda não voltou: o par fica
   * de fora até ela voltar, em vez de cada tradução pagar a espera de novo.
   */
  private known = new Map<string, Estado>();
  /** A consulta de disponibilidade EM CURSO por par — uma só, reaproveitada. */
  private consultas = new Map<string, Promise<string>>();

  static isPresent(): boolean {
    return typeof self !== 'undefined' && 'Translator' in self;
  }

  supports(src: string | null, tgt: string): boolean {
    if (!ChromeTranslatorMt.isPresent() || !src || !tgt) return false;
    const s = src.split('-')[0];
    const t = tgt.split('-')[0];
    if (s === t) return false;
    // Já sabemos que este par não existe, que o pacote ainda está baixando, ou que a consulta está
    // pendurada: não prometa cobri-lo.
    const state = this.known.get(`${s}|${t}`);
    return state !== 'unavailable' && state !== 'downloading' && state !== 'consultando';
  }

  private getInstance(src: string, tgt: string) {
    const key = `${src}|${tgt}`;
    let inst = this.instances.get(key);
    if (!inst) {
      inst = Translator.create({ sourceLanguage: src, targetLanguage: tgt });
      this.instances.set(key, inst);
    }
    return inst;
  }

  /**
   * `availability()` com prazo e memória. A consulta é UMA por par: a resposta (ou a falha) vira
   * estado conhecido. Estourou o prazo: marca `consultando` e lança; quando a resposta chegar, o
   * estado é atualizado e o par volta a valer (se estiver disponível).
   */
  private async disponibilidade(s: string, t: string, key: string): Promise<string> {
    let consulta = this.consultas.get(key);
    if (!consulta) {
      consulta = Promise.resolve().then(() => Translator.availability({ sourceLanguage: s, targetLanguage: t }));
      this.consultas.set(key, consulta);
      consulta.then(
        (status) => {
          this.consultas.delete(key);
          if (status === 'unavailable') this.known.set(key, 'unavailable');
          else if (status === 'available' || status === 'readily')
            this.known.set(key, 'ready'); // as próximas nem perguntam
          else if (this.known.get(key) === 'consultando') this.known.delete(key); // volta a ser tentado (e dispara o download)
        },
        () => {
          this.consultas.delete(key);
          this.known.set(key, 'unavailable'); // rejeitou: não perguntamos de novo nesta sessão
        },
      );
    }
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => {
        if (!this.known.has(key)) this.known.set(key, 'consultando');
        rejeitar(
          new Error(
            `Chrome Translator: disponibilidade de ${s}->${t} sem resposta em ${PRAZO_DA_DISPONIBILIDADE_MS} ms`,
          ),
        );
      }, PRAZO_DA_DISPONIBILIDADE_MS);
    });
    try {
      return await Promise.race([consulta, prazo]);
    } catch (e) {
      if (this.known.get(key) !== 'consultando') this.known.set(key, 'unavailable');
      throw e;
    } finally {
      clearTimeout(relogio);
    }
  }

  async translate(text: string, src: string | null, tgt: string): Promise<MtResult> {
    if (!src) throw new Error('Chrome Translator exige idioma de origem');
    const s = src.split('-')[0];
    const t = tgt.split('-')[0];
    const key = `${s}|${t}`;

    // Par já pronto nesta sessão: nada de perguntar de novo a cada legenda.
    const status = this.known.get(key) === 'ready' ? 'available' : await this.disponibilidade(s, t, key);

    if (status === 'unavailable') {
      this.known.set(key, 'unavailable'); // não tentamos de novo neste par
      throw new Error(`Chrome Translator não cobre ${s}->${t}`);
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
        this.known.set(key, 'downloading');
        void this.getInstance(s, t)
          .then(() => this.known.set(key, 'ready'))
          .catch(() => {
            this.known.set(key, 'unavailable');
            this.instances.delete(key);
          });
      }
      throw new Error(`Chrome Translator ainda está baixando o pacote ${s}->${t}`);
    }

    this.known.set(key, 'ready');
    const translator = await this.getInstance(s, t);
    const translated = await translator.translate(text);
    if (!translated) throw new Error('Chrome Translator devolveu vazio');
    return { text: translated, detectedSourceLang: s, engine: 'chrome-translator' };
  }
}
