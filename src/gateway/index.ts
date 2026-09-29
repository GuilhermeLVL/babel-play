/**
 * Fábrica do AI Gateway (navegador): constrói o run-loop do núcleo a partir de um
 * Perfil e resolve cada binding para um adapter concreto. Expõe uma API de
 * conveniência (`gateway.mt.translate`, `gateway.llm.chat/chatStream`) que roteia
 * pela cadeia de bindings com fallback + breaker + consentimento + orçamento.
 *
 * Adicionar um provider = registrar um caso em `resolveMt`/`resolveLlm`. Nenhuma
 * tela muda — é o mandato provider-agnóstico do produto.
 */
import type { CapabilityBinding, ChatMessage, ChatResult, Profile } from '@core';
import { AiGateway, BreakerRegistry, BudgetLedger, MotorAindaCarregando, NoRouteError } from '@core';
import { avaliarTraducaoLocal } from '@core/harness/portasDeQualidade';
import { bindingExigeConsentimento } from '@core/harness/registroDeMotores';

import { detectLanguage } from '../lib/langDetect';
import { explicarRejeicao, precisaConferir, validarTraducao } from '../lib/validaTraducao';
import { ChromeTranslatorMt, codigoDoTradutor, type EstadoDoTradutorNativo } from './adapters/chromeTranslator';
import { GroqWhisperStt } from './adapters/groqWhisper';
import { MyMemoryMt } from './adapters/mymemory';
import { OpenAiCompatibleLlm } from './adapters/openaiCompatible';
import { OpusMtLocal } from './adapters/opusMtLocal';
import { ServerLlmMt } from './adapters/serverLlmMt';
import { WebSpeechStt } from './adapters/webSpeech';
import { WhisperLocalStt } from './adapters/whisperLocal';
import type {
  AvisoDeDegradacaoDoStt,
  LlmOptions,
  LlmProvider,
  MtOptions,
  MtResult,
  SttCallbacks,
  SttFinal,
  SttProvider,
  SttSession,
  TranslationProvider,
} from './capabilities';
import { capMetrics } from './capture/captureMetrics';

const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i;
const isLocalUrl = (u?: string): boolean => !!u && LOCAL_RE.test(u);

/** Um binding é "nuvem" (exige consentimento + orçamento) se referencia credencial. */
const isCloud = (b: CapabilityBinding): boolean => !!b.credentialId;

/**
 * O binding manda o dado do usuário para fora do aparelho? Então exige o CONSENTIMENTO de nuvem
 * (Ajustes → Privacidade). Antes só o BYOK era perguntado (Fase 2 do lançamento); depois, uma lista
 * à mão aqui — que esqueceu a Web Speech, cujo modo nuvem manda o áudio do microfone ao Google até
 * no perfil "Privado/Local" (auditoria de eficiência 2026-09-28, §3). Agora a decisão é DERIVADA do
 * registro de motores (`enviaDadosA`), e adaptador sem registro falha fechado (pede).
 */
const exigeConsentimento = (b: CapabilityBinding): boolean => bindingExigeConsentimento(b);

/** O binding traduz sem mandar o texto a ninguém (Chrome Translator nativo, opus-mt no aparelho)? */
const ehLocal = (b: CapabilityBinding): boolean => !isCloud(b) && !exigeConsentimento(b);

/** Motores de MT que traduzem no aparelho — os que a porta de qualidade do final avalia. */
const MOTORES_LOCAIS_DE_MT = new Set(['chrome-translator', 'opus-mt-local']);

/** `engine` da resposta VAZIA de um parcial sem tradutor local pronto — nada foi traduzido. */
export const PARCIAL_SEM_MOTOR_LOCAL = 'parcial-sem-motor-local';

// Adapters de MT com estado (worker do opus-mt) precisam ser SINGLETON entre chamadas.
const mtSingletons = new Map<string, TranslationProvider>();

function resolveMt(b: CapabilityBinding): TranslationProvider {
  const cached = mtSingletons.get(b.adapterId);
  if (cached) return cached;
  let adapter: TranslationProvider;
  switch (b.adapterId) {
    case 'chrome-translator':
      adapter = new ChromeTranslatorMt();
      break;
    case 'opus-mt-local':
      adapter = new OpusMtLocal();
      break;
    case 'mymemory':
      adapter = new MyMemoryMt();
      break;
    case 'server-llm-mt':
      adapter = new ServerLlmMt();
      break;
    default:
      throw new Error(`adapter de tradução desconhecido: ${b.adapterId}`);
  }
  mtSingletons.set(b.adapterId, adapter);
  return adapter;
}

function resolveLlm(b: CapabilityBinding): LlmProvider {
  switch (b.adapterId) {
    case 'openai-compatible': {
      const cloud = isCloud(b);
      return new OpenAiCompatibleLlm({
        id: b.adapterId,
        label: cloud ? 'Nuvem (proxy)' : isLocalUrl(b.baseUrl) ? 'Local (Ollama/LM Studio)' : 'OpenAI-compatible',
        runtime: cloud ? 'proxy' : 'browser',
        cost: cloud ? 'byo-cloud' : isLocalUrl(b.baseUrl) ? 'local' : 'free',
        // Nuvem → proxy do server (injeta segredo). Local/direto → baseUrl do binding.
        baseUrl: cloud ? '/api/ai/llm' : (b.baseUrl ?? ''),
        model: b.model ?? '',
        credentialId: b.credentialId,
      });
    }
    default:
      throw new Error(`adapter de LLM desconhecido: ${b.adapterId}`);
  }
}

// Adapters de STT com estado (worker do Whisper, modelo carregado) precisam ser SINGLETON
// entre chamadas — senão cada enunciado abriria um novo worker e rebaixaria o modelo de novo.
const sttSingletons = new Map<string, SttProvider>();

function resolveStt(b: CapabilityBinding): SttProvider {
  const key = `${b.adapterId}|${b.baseUrl ?? ''}|${b.model ?? ''}|${b.credentialId ?? ''}`;
  const cached = sttSingletons.get(key);
  if (cached) return cached;
  let adapter: SttProvider;
  switch (b.adapterId) {
    case 'web-speech':
      adapter = new WebSpeechStt();
      break;
    case 'whisper-local':
      adapter = new WhisperLocalStt();
      break;
    case 'groq-whisper':
      adapter = new GroqWhisperStt({ model: b.model ?? 'whisper-large-v3-turbo', credentialId: b.credentialId });
      break;
    default:
      throw new Error(`adapter de STT desconhecido: ${b.adapterId}`);
  }
  sttSingletons.set(key, adapter);
  return adapter;
}

export interface GatewayDeps {
  profile: Profile;
  /** Consentimento de nuvem da sessão (bindings de nuvem são pulados se `false`). */
  cloudConsent?: () => boolean;
}

export function buildGateway({ profile, cloudConsent }: GatewayDeps) {
  const breakers = new BreakerRegistry();
  const ledger = new BudgetLedger(profile.budget);
  const core = new AiGateway(profile, breakers, ledger, cloudConsent ?? (() => true));
  const consentiu = (): boolean => cloudConsent?.() !== false;
  // Rota ativa do sttRouter (nuvem-primeiro?) — mutável via stt.setRoute sem recriar o gateway.
  const sttPreferCloudRef = { value: false };

  /* TRADUTOR NATIVO preparado no clique (`mt.prepararNativo`): a promessa de cada par, para o
     `warmup`/`preload` do opus-mt esperarem por ela e pularem o download quando o nativo serve. */
  const preparacoesNativas = new Map<string, Promise<EstadoDoTradutorNativo>>();
  const chaveDoPar = (src: string, tgt: string): string => `${codigoDoTradutor(src)}|${codigoDoTradutor(tgt)}`;
  const tradutorNativo = (): ChromeTranslatorMt | null => {
    const b = (core.getProfile().bindings.mt ?? []).find((x) => x.adapterId === 'chrome-translator');
    if (!b) return null;
    try {
      const a = resolveMt(b);
      return a instanceof ChromeTranslatorMt ? a : null;
    } catch {
      return null;
    }
  };
  const nativoPronto = (src: string, tgt: string): boolean => !!tradutorNativo()?.pronto(src, tgt);
  /** O tradutor nativo do par já foi CRIADO (o parcial só usa um que existe; ver `ChromeTranslatorMt.criado`). */
  const nativoCriado = (src: string | null, tgt: string): boolean => !!src && !!tradutorNativo()?.criado(src, tgt);

  /* O MOTOR LOCAL FICOU PRONTO: o disjuntor dele fecha na hora (uma falha antiga não pode segurar o
     modelo que acabou de carregar por 30 s — Quest emulado, 2026-09-28) e quem pediu aviso (a
     captura, para retraduzir o que ficou sem tradução) é chamado DEPOIS disso. Um ouvinte por
     adaptador por gateway, pendurado na primeira vez que o adaptador é resolvido aqui. */
  const prontidao = new Set<() => void>();
  /** Quem quer saber que um tradutor local NÃO carregou (a captura: a tradução pendente não virá dele). */
  const falhasDeCarga = new Set<() => void>();
  const vigiados = new Set<string>();
  const resolverMt = (b: CapabilityBinding): TranslationProvider => {
    const a = resolveMt(b);
    if (a.aoFicarPronto && !vigiados.has(b.adapterId)) {
      vigiados.add(b.adapterId);
      a.aoFicarPronto(() => {
        breakers.reiniciar(b.adapterId);
        for (const fn of prontidao) fn();
      });
      /* O opus-mt não carregou. Com o tradutor do NAVEGADOR presente, não é o fim: quem esperava tenta
         de novo por ele (os ouvintes do "pronto"); sem ele, a tradução no aparelho acabou aqui. */
      a.aoFalharCarga?.(() => {
        for (const fn of ChromeTranslatorMt.isPresent() ? prontidao : falhasDeCarga) fn();
      });
    }
    return a;
  };

  /** O preload do 1º tradutor LOCAL com `preload` (opus-mt), com o vigia de estagnação. */
  const preloadLocal = (
    src: string,
    tgt: string,
    onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void,
  ): Promise<void> => {
    for (const b of core.getProfile().bindings.mt ?? []) {
      try {
        const a = resolverMt(b);
        if (a.preload && a.supports(src, tgt)) {
          return new Promise<void>((resolve) => {
            let done = false;
            // Failsafe POR ESTAGNAÇÃO, não por prazo fixo. O prazo de 30 s resolvia a promise
            // no meio de um download legítimo — medido, 113 MB a 0,44 MB/s levam ~257 s (A-P1-8).
            let ultimoSinal = Date.now();
            a.preload!(src, tgt, (p, label, bytes) => {
              ultimoSinal = Date.now();
              onProgress?.(p, label, bytes);
              if (p >= 1 && !done) {
                done = true;
                resolve();
              }
            });
            const vigia = setInterval(() => {
              if (done) {
                clearInterval(vigia);
                return;
              }
              if (Date.now() - ultimoSinal < 30000) return; // baixando, só devagar
              clearInterval(vigia);
              done = true;
              resolve(); // MT é best-effort: o gateway cai p/ o próximo adapter
            }, 5000);
          });
        }
      } catch {
        /* próximo binding */
      }
    }
    return Promise.resolve();
  };

  return {
    core,
    ledger,
    setProfile: (p: Profile): void => core.setProfile(p),

    mt: {
      translate: (text: string, src: string | null, tgt: string, opts?: MtOptions): Promise<MtResult> =>
        (async () => {
          /* FALA DO MICROFONE VAI AO LLM PRIMEIRO. Na cadeia o `server-llm-mt` é o terceiro: só
           corria se o opus-mt falhasse — ou seja, com o opus-mt funcionando, o motor que traduz
           SENTIDO nunca era chamado, e "a gente tava de boa" chegava à tela ao pé da letra. Para a
           fala (registro informal, gíria, contexto), o LLM vai primeiro quando existe na cadeia e
           está disponível; se recusar (402/501, disjuntor aberto), a cascata normal segue. */
          /* ÁUDIO DO SISTEMA TAMBÉM (Fase 2 do lançamento): para quem paga pela nuvem, `nuvemPrimeiro`
           leva a legenda do vídeo ao LLM do servidor antes do opus-mt — com o prompt de texto fiel,
           porque `falada` continua falso. Falhou (cota, orçamento, 5xx), segue a cascata local. */
          /* PARCIAL NUNCA VAI À NUVEM (auditoria de eficiência da IA, 2026-09-28, achado 1). A cada
           ~1,1 s o parcial do Whisper pedia tradução com `falada`, e este ramo mandava cada
           refinamento ao LLM pago — várias chamadas por frase, a cota do usuário drenada por textos
           que o refinamento seguinte joga fora. O parcial só usa tradutor LOCAL; o final é quem vai
           ao servidor. */
          const parcial = opts?.parcial === true;
          /** O Tradutor IA do servidor, se estiver na cadeia, fechado e consentido; `null` = não serviu. */
          let tentouNuvem = false;
          const tentarNuvem = async (): Promise<MtResult | null> => {
            const b = (core.getProfile().bindings.mt ?? []).find((x) => x.adapterId === 'server-llm-mt');
            if (!b || breakers.get(b.adapterId).isOpen || !consentiu()) return null;
            tentouNuvem = true;
            try {
              const a = resolverMt(b);
              if (!a.supports(src, tgt)) return null;
              const r = await breakers.get(b.adapterId).run(() => a.translate(text, src, tgt, opts));
              const veredicto = validarTraducao(r.text, tgt, src, null, text);
              if (veredicto.ok && r.text) return r;
              capMetrics.fallback('mt:server-llm-mt'); // respondeu, mas a resposta não servia
            } catch {
              /* cai para a cascata normal — e a telemetria conta a queda */
              capMetrics.fallback('mt:server-llm-mt');
            }
            return null;
          };
          if (!parcial && (opts?.falada || opts?.nuvemPrimeiro)) {
            const r = await tentarNuvem();
            if (r) return r;
          }
          const cascata = core.run(
            'mt',
            async (b) => {
              const adapter = resolverMt(b);
              if (!adapter.supports(src, tgt)) {
                /* O pacote do navegador BAIXANDO tira o par da cascata, mas ele vai voltar: é "só falta
                   carregar" (a fala fica pendente), não "não há motor". */
                if (src && adapter.carregando?.(src, tgt))
                  throw new MotorAindaCarregando(adapter.id, `${adapter.id} ainda carregando ${src}→${tgt}`);
                throw new Error(`${adapter.id} não suporta ${src}→${tgt}`);
              }
              const r = await adapter.translate(text, src, tgt, opts);

              /* A RESPOSTA VEIO NO IDIOMA QUE PEDIMOS?
               Ninguém perguntava isso, e o resultado chegou à tela de um usuário: um vídeo em
               espanhol, tradução pedida para português, e o que apareceu foi TCHECO, uma
               tradução correta do espanhol, no idioma errado. Nenhum erro, nenhum disjuntor,
               texto direto para a interface.

               A conferência mora AQUI e não no chamador, de propósito: lançar faz o adaptador
               contar como falha, abre o disjuntor dele e deixa a cascata tentar o próximo. Um
               tradutor que responde no idioma errado é um tradutor com defeito, e o gateway já
               sabe lidar com defeito. */
              /* SÓ DETECTA QUANDO A DETECÇÃO PODE MUDAR O VEREDICTO. `validarTraducao` aprova de
               saída o que é curto demais ou sem alvo, mas a detecção já tinha sido paga para
               chegar até lá. Numa legenda ao vivo a maioria das falas é curta, então era uma
               detecção desperdiçada por tradução, dentro do caminho que o usuário está esperando. */
              // A detecção pode falhar (offline, texto curto); `null` significa "não sei", e a
              // validação aceita — nunca derrubamos tradução por falta de informação.
              const saida = precisaConferir(r.text, tgt) ? await detectLanguage(r.text).catch(() => null) : null;
              const veredicto = validarTraducao(r.text, tgt, src, saida, text);
              if (!veredicto.ok) throw new Error(explicarRejeicao(veredicto, adapter.id));
              return r;
            },
            // Parcial: fora qualquer binding que mande o texto a terceiro (servidor, MyMemory, BYOK).
            /* NATIVO NO PARCIAL: só o tradutor que JÁ EXISTE (criado no clique, pacote no disco) —
               rápido e de graça. Sem instância, o parcial não é quem cria (sem ativação do usuário,
               e a criação no meio da legenda): o binding é pulado sem contar falha no disjuntor. */
            {
              isCloud,
              exigeConsentimento,
              aceita: parcial
                ? (b) => ehLocal(b) && (b.adapterId !== 'chrome-translator' || nativoCriado(src, tgt))
                : undefined,
            },
          );
          if (!parcial) {
            const r = await cascata;
            /* PORTA DE QUALIDADE DO FINAL (harness §5): a tradução LOCAL parece ruim (vazia, tamanho
             fora de [0,5; 2], cópia do original)? Para quem tem direito à nuvem (`escalarSeRuim`, o
             chamador decide pelo plano) e consentiu, ESTE trecho sobe ao Tradutor IA — e só ele.
             Não repete a nuvem que acabou de falhar neste mesmo pedido (`tentouNuvem`). */
            if (!opts?.escalarSeRuim || tentouNuvem || !MOTORES_LOCAIS_DE_MT.has(r.engine)) return r;
            if (avaliarTraducaoLocal({ origem: text, traducao: r.text }).veredicto !== 'subir') return r;
            const nuvem = await tentarNuvem();
            if (!nuvem) return r;
            capMetrics.escalada('mt');
            return nuvem;
          }
          /* Nenhum tradutor local pronto (sem Chrome Translator, opus-mt ainda não carregado): o
           parcial fica SEM tradução — não é erro, o balão segue em "…" até o final traduzir. Lançar
           aqui viraria o texto original entre parênteses e o aviso de "tradução indisponível" a cada
           refinamento. Cancelamento (o final atropelou o parcial) continua subindo como antes. */
          return cascata.catch((e: unknown): MtResult => {
            if (!(e instanceof NoRouteError)) throw e;
            return { text: '', engine: PARCIAL_SEM_MOTOR_LOCAL };
          });
        })().then((r) => {
          /* SÓ EM DESENVOLVIMENTO: o motor que atendeu é um que o `routeMt` permitiria? (parcial
             nunca na nuvem; nada sai sem consentimento — `conferenciaDaRotaMt.ts`). Em produção o
             ramo some no build, e o `import()` com ele. */
          if (import.meta.env?.DEV) {
            const consentimento = consentiu();
            void import('./conferenciaDaRotaMt').then(({ violacaoDaRotaMt }) => {
              const v = violacaoDaRotaMt({
                texto: text,
                origem: src ?? '',
                destino: tgt,
                parcial: opts?.parcial === true,
                consentimento,
                falada: opts?.falada === true,
                motor: r.engine,
              });
              if (v) console.error('[harness]', v);
            });
          }
          return r;
        }),

      /**
       * DIAGNÓSTICO: roda cada motor da cadeia isoladamente e diz o que cada um respondeu — com o
       * estado do disjuntor. Existe porque "não traduz" na máquina do usuário não tinha como ser
       * observado (2026-08-26). Exposto em `window.__babelMt.diagnosticar(texto, de, para)`.
       */
      diagnosticar: async (text: string, src: string, tgt: string): Promise<Array<Record<string, unknown>>> => {
        const linhas: Array<Record<string, unknown>> = [];
        for (const b of core.getProfile().bindings.mt ?? []) {
          const t0 = Date.now();
          try {
            const a = resolverMt(b);
            const breaker = breakers.get(b.adapterId);
            const suporta = a.supports(src, tgt);
            if (!suporta) {
              linhas.push({ id: b.adapterId, suporta, disjuntorAberto: breaker.isOpen });
              continue;
            }
            const r = await a.translate(text, src, tgt);
            const veredicto = validarTraducao(r.text, tgt, src, null, text);
            linhas.push({
              id: b.adapterId,
              suporta,
              disjuntorAberto: breaker.isOpen,
              texto: r.text,
              aproximada: r.approximate === true,
              veredicto,
              ms: Date.now() - t0,
            });
          } catch (e) {
            linhas.push({ id: b.adapterId, erro: String((e as Error)?.message ?? e), ms: Date.now() - t0 });
          }
        }
        return linhas;
      },

      /**
       * Avisa quando um tradutor LOCAL fica pronto (depois de fechar o disjuntor dele). A captura usa
       * para retraduzir as falas que ficaram sem tradução enquanto o modelo carregava.
       */
      aoFicarPronto: (fn: () => void): (() => void) => {
        prontidao.add(fn);
        // Pendura o vigia nos adaptadores locais já agora: o 1º `ready` pode vir de um aquecimento.
        for (const b of core.getProfile().bindings.mt ?? []) {
          try {
            resolverMt(b);
          } catch {
            /* próximo binding */
          }
        }
        return () => {
          prontidao.delete(fn);
        };
      },

      /** Avisa quando um tradutor LOCAL não carrega neste aparelho (WASM, memória): não vai ficar pronto. */
      aoFalharCarga: (fn: () => void): (() => void) => {
        falhasDeCarga.add(fn);
        for (const b of core.getProfile().bindings.mt ?? []) {
          try {
            resolverMt(b);
          } catch {
            /* próximo binding */
          }
        }
        return () => {
          falhasDeCarga.delete(fn);
        };
      },

      /** Libera os tradutores locais (encerra os workers do opus-mt). Ver `stt.liberarModelo`. */
      liberarModelos: (): void => {
        for (const b of core.getProfile().bindings.mt ?? []) {
          try {
            const a = resolverMt(b) as { liberar?: () => void };
            if (typeof a.liberar === 'function') a.liberar();
          } catch {
            /* próximo binding */
          }
        }
      },

      /**
       * PREPARA O TRADUTOR NATIVO (Translator API) no CLIQUE em "Iniciar" — ver
       * `ChromeTranslatorMt.preparar`. A promessa de cada par fica guardada: `warmup`/`preload`
       * esperam por ela e pulam o opus-mt (113 MB) quando o nativo respondeu `available`.
       */
      /* `onProgress`/`aoFalhar` recebem o PAR (`en|pt`): a tela junta os pares que baixam numa
         barra só ("Tradutor do navegador"). Só falam quando há download (ver `preparar`). */
      prepararNativo: (
        pairs: Array<[string, string]>,
        onProgress?: (p: number, par: string) => void,
        aoFalhar?: (par: string) => void,
      ): Promise<void> => {
        const nativo = tradutorNativo();
        if (!nativo) return Promise.resolve();
        return Promise.all(
          pairs.map(([src, tgt]) => {
            const key = chaveDoPar(src, tgt);
            let prep = preparacoesNativas.get(key);
            if (!prep) {
              prep = nativo
                .preparar(src, tgt, onProgress && ((p) => onProgress(p, key)), aoFalhar && (() => aoFalhar(key)))
                .catch(() => null);
              preparacoesNativas.set(key, prep);
            }
            return prep;
          }),
        ).then(() => undefined);
      },

      /** Aquece os adapters de MT locais (ex.: opus-mt) para as direções esperadas, em background. */
      warmup: (pairs: Array<[string, string]>): void => {
        for (const [src, tgt] of pairs) {
          // Tradutor nativo pronto para o par: o opus-mt não baixa (nem ocupa memória) à toa.
          const aquecer = (): void => {
            if (nativoPronto(src, tgt)) return;
            for (const b of core.getProfile().bindings.mt ?? []) {
              try {
                const a = resolverMt(b);
                if (a.preload && a.supports(src, tgt)) a.preload(src, tgt);
              } catch {
                /* próximo binding */
              }
            }
          };
          const prep = preparacoesNativas.get(chaveDoPar(src, tgt));
          if (prep) void prep.then(aquecer);
          else aquecer();
        }
      },

      /**
       * Pré-carrega o MT local de UMA direção reportando progresso (0..1) — para a UI de
       * preparação (onboarding/captura) mostrar a barra do TRADUTOR ao lado da do Whisper.
       * Resolve quando o modelo fica pronto (ou rejeita se nenhum adapter local cobre o par).
       */
      preload: (
        src: string,
        tgt: string,
        onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void,
      ): Promise<void> => {
        const prep = preparacoesNativas.get(chaveDoPar(src, tgt));
        if (prep) return prep.then(() => (nativoPronto(src, tgt) ? undefined : preloadLocal(src, tgt, onProgress)));
        return nativoPronto(src, tgt) ? Promise.resolve() : preloadLocal(src, tgt, onProgress);
      },
    },

    llm: {
      chat: (system: string, messages: ChatMessage[], opts?: LlmOptions): Promise<ChatResult> =>
        core.run('llm', (b) => resolveLlm(b).chat(system, messages, opts), { isCloud, exigeConsentimento }),

      chatStream: (
        system: string,
        messages: ChatMessage[],
        onDelta: (delta: string) => void,
        opts?: LlmOptions,
      ): Promise<ChatResult> =>
        core.run('llm', (b) => resolveLlm(b).chatStream(system, messages, onDelta, opts), {
          isCloud,
          exigeConsentimento,
        }),
    },

    stt: {
      /* Ao vivo também respeita o consentimento: a Web Speech (modo nuvem) manda o áudio ao Google.
         O modo LOCAL dela (`processLocally`) é escolhido pela captura (`motorDoMicrofone.ts`), que
         instancia o adaptador direto — este caminho genérico não sabe o modo e falha fechado. */
      isAvailable(): boolean {
        return (core.getProfile().bindings.stt ?? []).some((b) => {
          if (exigeConsentimento(b) && !consentiu()) return false;
          try {
            const a = resolveStt(b);
            return a.supportsLiveMic && a.isAvailable();
          } catch {
            return false;
          }
        });
      },
      startLive(lang: string, cb: SttCallbacks): SttSession {
        for (const b of core.getProfile().bindings.stt ?? []) {
          if (exigeConsentimento(b) && !consentiu()) continue;
          try {
            const adapter = resolveStt(b);
            if (adapter.supportsLiveMic && adapter.isAvailable() && adapter.startLive) {
              return adapter.startLive(lang, cb);
            }
          } catch {
            /* tenta o próximo binding */
          }
        }
        throw new Error('nenhum adapter de STT ao vivo disponível neste perfil/navegador');
      },

      /** Há algum adapter capaz de transcrever áudio já capturado (sistema/aba)? */
      hasBlobStt(): boolean {
        return (core.getProfile().bindings.stt ?? []).some((b) => {
          try {
            const a = resolveStt(b);
            return a.supportsBlob && a.isAvailable();
          } catch {
            return false;
          }
        });
      },

      /** Pré-carrega o modelo do 1º STT de blob disponível (ex.: Whisper WebGPU), com progresso. */
      preloadModel(
        onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void,
        opts?: { aoDegradar?: (aviso: AvisoDeDegradacaoDoStt) => void },
      ): Promise<void> {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b);
            if (a.supportsBlob && a.isAvailable() && a.preload) return a.preload(onProgress, opts);
          } catch {
            /* próximo binding */
          }
        }
        return Promise.resolve();
      },

      /**
       * Transcreve um enunciado PCM (do VAD) — despacho DIRETO no 1º adapter de blob
       * disponível (hoje o Whisper local), SEM passar pela cadeia genérica. Motivo: a cadeia
       * tentava o `web-speech` primeiro (que não faz PCM) a cada trecho, abrindo o circuit
       * breaker e REORDENANDO os finais concorrentes. O despacho direto é sequencial e sem
       * ruído — crítico para a latência em áudio contínuo. Consentimento de nuvem respeitado.
       */
      /**
       * ROTEADOR DE QUALIDADE (sttRouter): quando a rota manda "nuvem primeiro" (conteúdo
       * não-EN com Groq disponível), reordenamos os bindings para o groq-whisper vir antes
       * do local — a qualidade multilíngue do large-v3-turbo é muito superior ao tiny.
       * O local continua na cadeia como reserva. Perfil Privado/Local nunca liga isto.
       */
      setRoute(route: { preferCloud: boolean; localModel?: string; dtype?: string; device?: 'wasm' | 'webgpu' }): void {
        sttPreferCloudRef.value = route.preferCloud;
        if (route.localModel) {
          const opcoes = route.dtype || route.device ? { dtype: route.dtype, device: route.device } : undefined;
          for (const b of core.getProfile().bindings.stt ?? []) {
            try {
              const a = resolveStt(b);
              if (a.supportsBlob && typeof (a as any).setModel === 'function')
                (a as any).setModel(route.localModel, opcoes);
            } catch {
              /* próximo binding */
            }
          }
        }
      },

      /**
       * O REGULADOR trocou o modelo local (um degrau abaixo ou de volta — `reguladorDaCaptura.ts`).
       * Sem `opcoes`, só o modelo: a rota (nuvem primeiro?) e o dtype ficam como o roteador deixou.
       * Com `opcoes`, o degrau diz o dtype/backend dele (o tiny só em hybrid na GPU; `trocar-backend`).
       */
      trocarModeloLocal(modelo: string, opcoes?: { dtype?: string; device?: 'wasm' | 'webgpu' }): void {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b) as SttProvider & {
              setModel?: (m: string, o?: { dtype?: string; device?: 'wasm' | 'webgpu' }) => void;
            };
            if (a.supportsBlob && typeof a.setModel === 'function') a.setModel(modelo, opcoes);
          } catch {
            /* próximo binding */
          }
        }
      },

      /**
       * Libera o modelo local de STT (encerra o worker; a próxima transcrição recarrega do cache).
       * A captura chama ao sair, em aparelho com pouca memória (`perfilDoDispositivo().poucaMemoria`).
       */
      liberarModelo(): void {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b) as { liberar?: () => void };
            if (typeof a.liberar === 'function') a.liberar();
          } catch {
            /* próximo binding */
          }
        }
      },

      /**
       * O decode FINAL vai, neste momento, para a NUVEM? (rota "nuvem primeiro", consentimento
       * dado e um binding `groq-whisper` no perfil.) A captura usa isto para escolher o teto de fala
       * contínua: 12 s na nuvem (cobrança mínima de 10 s por pedido), 6 s no local. É lido a cada
       * quadro do VAD, então retirar o consentimento no meio da sessão volta ao corte curto na hora.
       */
      finalNaNuvem(): boolean {
        return (
          sttPreferCloudRef.value &&
          consentiu() &&
          (core.getProfile().bindings.stt ?? []).some((b) => b.adapterId === 'groq-whisper')
        );
      },

      /**
       * PORTA DE QUALIDADE DO STT (harness §5): o final LOCAL pareceu ruim, e ESTE trecho sobe à
       * transcrição de nuvem — só ele, só com consentimento e um `groq-whisper` no perfil. Quem decide
       * se a pessoa tem direito (plano) é o chamador. `null` = não havia nuvem ou ela falhou (fica o local).
       */
      async transcribePcmNaNuvem(
        pcm: Float32Array,
        sampleRate: number,
        opts?: { languageHint?: string; prompt?: string },
      ): Promise<SttFinal | null> {
        if (!consentiu()) return null;
        for (const b of core.getProfile().bindings.stt ?? []) {
          if (b.adapterId !== 'groq-whisper') continue;
          try {
            const a = resolveStt(b);
            if (!a.supportsBlob || !a.transcribePcm || !a.isAvailable()) continue;
            const r = await a.transcribePcm(pcm, sampleRate, opts);
            return { ...r, engine: r.engine ?? b.adapterId };
          } catch {
            capMetrics.fallback('stt:groq-whisper');
          }
        }
        return null;
      },

      async transcribePcm(
        pcm: Float32Array,
        sampleRate: number,
        opts?: { languageHint?: string; signal?: AbortSignal; onUpdate?: (text: string) => void; prompt?: string },
      ): Promise<SttFinal> {
        let lastErr: Error | null = null;
        let bindings = [...(core.getProfile().bindings.stt ?? [])];
        if (sttPreferCloudRef.value) {
          // Nuvem (groq-whisper) primeiro; o resto mantém a ordem relativa (reserva local).
          bindings = [
            ...bindings.filter((b) => b.adapterId === 'groq-whisper'),
            ...bindings.filter((b) => b.adapterId !== 'groq-whisper'),
          ];
        }
        for (const b of bindings) {
          let a: SttProvider;
          try {
            a = resolveStt(b);
          } catch {
            continue;
          }
          if (!a.supportsBlob || !a.transcribePcm || !a.isAvailable()) continue;
          if (exigeConsentimento(b) && !consentiu()) continue;
          try {
            // AWAIT: se este adapter (ex.: Groq sem chave/erro de rede) REJEITAR, cai para o
            // próximo binding (ex.: Whisper local) em vez de propagar a falha.
            const r = await a.transcribePcm(pcm, sampleRate, opts);
            return { ...r, engine: r.engine ?? b.adapterId };
          } catch (e) {
            // Cancelado por quem pediu (final especulativo cuja fala continuou): não é falha, e o
            // próximo motor da cadeia (a nuvem, que cobra) não deve refazer o trabalho.
            if ((e as Error)?.name === 'AbortError') throw e;
            lastErr = e instanceof Error ? e : new Error(String(e));
            // Telemetria: este motor caiu e o próximo da cadeia (se houver) assume.
            capMetrics.fallback(`stt:${b.adapterId}`);
          }
        }
        throw lastErr ?? new Error('nenhum STT de blob disponível neste perfil');
      },

      /**
       * Transcreve um PARCIAL (best-effort): usa o 1º adapter LOCAL com `transcribeIfIdle`
       * (hoje o Whisper local), que resolve `null` se estiver ocupado — o parcial é
       * DESCARTADO em vez de enfileirar. Despacho direto, sem breaker/consentimento.
       */
      transcribePartial(
        pcm: Float32Array,
        sampleRate: number,
        opts?: { languageHint?: string },
      ): Promise<SttFinal | null> {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b);
            if (a.supportsBlob && a.isAvailable() && a.transcribeIfIdle) {
              return a.transcribeIfIdle(pcm, sampleRate, opts);
            }
          } catch {
            /* próximo binding */
          }
        }
        return Promise.resolve(null);
      },

      /** Profundidade da fila de decode do 1º STT de blob (para métrica de saturação). */
      pendingCount(): number {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b);
            if (a.supportsBlob && typeof a.queueDepth === 'number') return a.queueDepth;
          } catch {
            /* próximo binding */
          }
        }
        return 0;
      },
    },
  };
}
