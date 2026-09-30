import { MotorAindaCarregando } from '@core';

import type { MtResult, TranslationProvider } from '../capabilities';

/**
 * Chrome Translator API — tradução NATIVA on-device (Chrome/Edge 138+). É a mais rápida
 * (C++ nativo, sem rede, sem download no seu bundle) e funciona offline. Feature-detected:
 * se o navegador não tiver, o gateway cai para o próximo adapter (opus-mt local → MyMemory).
 * A API é sequencial (uma tradução por vez) — o gateway já serializa por chamada.
 */
declare const Translator: {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    /** Progresso do download do pacote de idioma (`downloadprogress`, `loaded` de 0 a 1). */
    monitor?: (m: { addEventListener(tipo: 'downloadprogress', f: (e: { loaded: number }) => void): void }) => void;
  }): Promise<{ translate(t: string): Promise<string> }>;
};

/** O que a preparação no clique descobriu do par. `null` = sem a API. */
export type EstadoDoTradutorNativo = 'available' | 'downloadable' | 'unavailable' | null;

/**
 * PRAZO DA CONSULTA DE DISPONIBILIDADE. Medido na auditoria de latência (2026-09-26): no headless
 * shell, `Translator.availability()` levou 6,0 s para responder, e como a chamada era refeita a CADA
 * tradução, sem prazo, três legendas esperaram 6 s cada antes de o opus-mt ser tentado. Onde a API
 * funciona, ela responde na hora; passado o prazo, esta tradução segue pela cascata e a resposta,
 * quando vier, fica guardada para as próximas.
 */
export const PRAZO_DA_DISPONIBILIDADE_MS = 250;

/**
 * PRAZO DA PERGUNTA SEM O CLIQUE (`atendeSemBaixar`): quem pergunta é o aquecimento da tela aberta,
 * que não tem legenda esperando — pode esperar mais que a tradução. Mas não os 6 s do headless shell:
 * sem resposta, o opus-mt aquece como antes (errar para o lado de a tradução funcionar).
 */
export const PRAZO_DA_PERGUNTA_SEM_CLIQUE_MS = 1500;

type Estado = 'ready' | 'unavailable' | 'downloading' | 'consultando';

/**
 * O CÓDIGO QUE A TRANSLATOR API ENTENDE para o idioma do app. A API fala BCP 47 com a base do
 * idioma (`pt`, `es`, `ja`) — o `pt-BR`/`es-MX` do app vira a base. A exceção é o chinês: `zh` é o
 * simplificado e o tradicional é `zh-Hant`; cortar `zh-TW` em `zh` trocaria a escrita de quem lê.
 * Vale para qualquer par que o app ofereça (não só en↔pt) e para o Edge 148+, que expõe a mesma API.
 */
export function codigoDoTradutor(lang: string): string {
  const [base, ...resto] = lang.split('-');
  const b = base.toLowerCase();
  if (b === 'zh' && resto.some((r) => /^(hant|tw|hk|mo)$/i.test(r))) return 'zh-Hant';
  return b;
}

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

  /**
   * Quem espera um PACOTE baixando (a captura: a tradução pendente, `soFaltaCarregar`). Avisados
   * quando o download acaba — pronto OU falho: nos dois casos, quem esperava tenta de novo (pelo
   * nativo, ou pelo próximo motor da cascata). Sem isto, a fala pendente só por este pacote ficava
   * em "Preparando a tradução…" até outro motor ficar pronto.
   */
  private prontidao = new Set<(par: string) => void>();

  aoFicarPronto(fn: (par: string) => void): () => void {
    this.prontidao.add(fn);
    return () => this.prontidao.delete(fn);
  }

  private avisarQueAcabou(key: string): void {
    for (const fn of this.prontidao) {
      try {
        fn(key);
      } catch {
        /* ouvinte com defeito não impede o resto */
      }
    }
  }

  /**
   * O pacote do par está BAIXANDO? `supports()` o tira da cascata enquanto isso; o gateway pergunta
   * aqui para dizer "só falta carregar" em vez de "não há motor" (`MotorAindaCarregando`).
   */
  carregando(src: string, tgt: string): boolean {
    return this.known.get(this.chave(src, tgt)) === 'downloading';
  }

  static isPresent(): boolean {
    return typeof self !== 'undefined' && 'Translator' in self;
  }

  supports(src: string | null, tgt: string): boolean {
    if (!ChromeTranslatorMt.isPresent() || !src || !tgt) return false;
    const s = codigoDoTradutor(src);
    const t = codigoDoTradutor(tgt);
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
      inst.then(
        () => this.criados.add(key),
        () => this.criados.delete(key),
      );
    }
    return inst;
  }

  /** Os pares cujo tradutor JÁ FOI CRIADO e resolveu (a instância existe; traduzir não cria nada). */
  private criados = new Set<string>();

  private chave(src: string, tgt: string): string {
    return `${codigoDoTradutor(src)}|${codigoDoTradutor(tgt)}`;
  }

  /** O par já está pronto nesta sessão (a próxima tradução não pergunta nada)? */
  pronto(src: string, tgt: string): boolean {
    return this.known.get(this.chave(src, tgt)) === 'ready';
  }

  /**
   * O tradutor do par JÁ EXISTE (criado no clique ou por um final)? É a pergunta do PARCIAL: ele
   * roda a cada ~1 s, fora de qualquer gesto do usuário, e não pode ser quem cria o tradutor —
   * `create()` sem ativação falha quando o pacote precisa baixar e, mesmo pronto, custa a criação
   * no meio da legenda. Sem instância, o parcial pula o nativo (o gateway nem o tenta).
   */
  criado(src: string, tgt: string): boolean {
    const key = this.chave(src, tgt);
    return this.criados.has(key) && this.known.get(key) === 'ready';
  }

  /**
   * PREPARAR NO CLIQUE (harness adaptativo §1.2, M3). `Translator.create()` precisa de ATIVAÇÃO DO
   * USUÁRIO quando o pacote de idioma ainda vai baixar; dentro de uma tradução assíncrona ela já
   * expirou, a criação falhava e o par ficava "indisponível" a sessão inteira — e o opus-mt (113 MB)
   * baixava mesmo em Chrome que traduz de graça. Chamado do clique em "Iniciar": consulta a
   * disponibilidade (sem o prazo curto da tradução — aqui ninguém espera legenda) e cria a
   * instância JÁ, com `monitor` para o progresso do download. Nunca lança.
   *
   * PROGRESSO PARA A TELA (estágio 4): `onProgress` só fala quando há DOWNLOAD — 0 na hora (a barra
   * aparece antes do primeiro evento do `monitor`, que pode demorar), os `downloadprogress` e 1
   * quando o tradutor fica pronto. Par já no disco não emite nada: uma barra que nasce em 100% é
   * ruído. `aoFalhar` é chamado UMA vez se o download/criação falhar — o par sai da cascata e a
   * tradução segue pelo opus-mt, sem aviso de erro (a pessoa não pediu este pacote).
   *
   * QUALQUER PAR, UMA PERGUNTA POR SESSÃO: o par é o real da sessão (idioma do conteúdo → idioma
   * da pessoa), e o que se descobre fica em `known` — preparar de novo (retomar, desmutar) não
   * pergunta nem cria outra vez.
   */
  async preparar(
    src: string,
    tgt: string,
    onProgress?: (p: number) => void,
    aoFalhar?: () => void,
  ): Promise<EstadoDoTradutorNativo> {
    if (!ChromeTranslatorMt.isPresent() || !src || !tgt) return null;
    const s = codigoDoTradutor(src);
    const t = codigoDoTradutor(tgt);
    if (s === t) return null;
    const key = `${s}|${t}`;
    const sabido = this.known.get(key);
    if (sabido === 'ready') return 'available';
    if (sabido === 'unavailable') return 'unavailable';
    if (sabido === 'downloading' && this.instances.has(key)) return 'downloadable';
    let status: string;
    try {
      status = await Translator.availability({ sourceLanguage: s, targetLanguage: t });
    } catch {
      this.known.set(key, 'unavailable');
      return 'unavailable';
    }
    if (status === 'unavailable') {
      this.known.set(key, 'unavailable');
      return 'unavailable';
    }
    const pronto = status === 'available' || status === 'readily';
    if (!pronto) {
      this.known.set(key, 'downloading');
      onProgress?.(0);
    }
    let inst = this.instances.get(key);
    if (!inst) {
      inst = Translator.create({
        sourceLanguage: s,
        targetLanguage: t,
        monitor: pronto
          ? undefined
          : (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(Math.min(1, Math.max(0, e.loaded)))),
      });
      this.instances.set(key, inst);
    }
    const criada = inst.then(
      () => {
        this.criados.add(key);
        this.known.set(key, 'ready');
        if (!pronto) {
          onProgress?.(1);
          this.avisarQueAcabou(key);
        }
      },
      () => {
        this.known.set(key, 'unavailable');
        this.instances.delete(key);
        this.criados.delete(key);
        if (!pronto) {
          aoFalhar?.();
          this.avisarQueAcabou(key);
        }
      },
    );
    // Pronto: a criação é instantânea, vale esperar. A baixar: devolve já e o download segue.
    if (pronto) {
      await criada;
      return this.known.get(key) === 'ready' ? 'available' : 'unavailable';
    }
    return 'downloadable';
  }

  /**
   * O PAR JÁ ESTÁ NO DISCO (`availability` = 'available')? A pergunta de quem aquece o opus-mt SEM o
   * clique (a tela abrindo — plano "Grátis sem travar", A9a): se o navegador traduz o par agora, o
   * nosso tradutor não precisa ocupar memória nem CPU. SÓ PERGUNTA: não cria o tradutor (o de um
   * pacote a baixar exige o gesto do clique, e falhar aqui o tiraria da sessão inteira) e não muda o
   * que a sessão sabe do par — `preparar` continua sendo quem cria no clique. Nunca lança; sem
   * resposta no prazo, `false`.
   */
  async atendeSemBaixar(src: string, tgt: string, prazoMs = PRAZO_DA_PERGUNTA_SEM_CLIQUE_MS): Promise<boolean> {
    if (!ChromeTranslatorMt.isPresent() || !src || !tgt) return false;
    const s = codigoDoTradutor(src);
    const t = codigoDoTradutor(tgt);
    if (s === t) return false;
    const sabido = this.known.get(`${s}|${t}`);
    if (sabido === 'ready') return true;
    if (sabido === 'unavailable' || sabido === 'downloading') return false;
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<null>((resolve) => {
      relogio = setTimeout(() => resolve(null), prazoMs);
    });
    try {
      const status = await Promise.race([
        Promise.resolve().then(() => Translator.availability({ sourceLanguage: s, targetLanguage: t })),
        prazo,
      ]);
      return status === 'available' || status === 'readily';
    } catch {
      return false;
    } finally {
      clearTimeout(relogio);
    }
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
    const s = codigoDoTradutor(src);
    const t = codigoDoTradutor(tgt);
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
          .then(() => {
            this.known.set(key, 'ready');
            this.avisarQueAcabou(key);
          })
          .catch(() => {
            this.known.set(key, 'unavailable');
            this.instances.delete(key);
            this.avisarQueAcabou(key);
          });
      }
      // Pulo, não falha: o pacote baixando não pode abrir o disjuntor (ver `MotorAindaCarregando`).
      throw new MotorAindaCarregando(this.id, `Chrome Translator ainda está baixando o pacote ${s}->${t}`);
    }

    this.known.set(key, 'ready');
    const translator = await this.getInstance(s, t);
    const translated = await translator.translate(text);
    if (!translated) throw new Error('Chrome Translator devolveu vazio');
    return { text: translated, detectedSourceLang: s, engine: 'chrome-translator' };
  }
}
