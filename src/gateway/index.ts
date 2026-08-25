/**
 * Fábrica do AI Gateway (navegador): constrói o run-loop do núcleo a partir de um
 * Perfil e resolve cada binding para um adapter concreto. Expõe uma API de
 * conveniência (`gateway.mt.translate`, `gateway.llm.chat/chatStream`) que roteia
 * pela cadeia de bindings com fallback + breaker + consentimento + orçamento.
 *
 * Adicionar um provider = registrar um caso em `resolveMt`/`resolveLlm`. Nenhuma
 * tela muda — é o mandato provider-agnóstico do produto.
 */
import { AiGateway, BreakerRegistry, BudgetLedger } from '@core'
import { validarTraducao, explicarRejeicao, precisaConferir } from '../lib/validaTraducao'
import { detectLanguage } from '../lib/langDetect'
import type { CapabilityBinding, ChatMessage, ChatResult, Profile } from '@core'
import type {
  LlmOptions,
  LlmProvider,
  MtResult,
  SttCallbacks,
  SttFinal,
  SttProvider,
  SttSession,
  TranslationProvider,
} from './capabilities'
import { MyMemoryMt } from './adapters/mymemory'
import { ServerLlmMt } from './adapters/serverLlmMt'
import { ChromeTranslatorMt } from './adapters/chromeTranslator'
import { OpusMtLocal } from './adapters/opusMtLocal'
import { OpenAiCompatibleLlm } from './adapters/openaiCompatible'
import { WebSpeechStt } from './adapters/webSpeech'
import { WhisperLocalStt } from './adapters/whisperLocal'
import { GroqWhisperStt } from './adapters/groqWhisper'

const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i
const isLocalUrl = (u?: string): boolean => !!u && LOCAL_RE.test(u)

/** Um binding é "nuvem" (exige consentimento + orçamento) se referencia credencial. */
const isCloud = (b: CapabilityBinding): boolean => !!b.credentialId

// Adapters de MT com estado (worker do opus-mt) precisam ser SINGLETON entre chamadas.
const mtSingletons = new Map<string, TranslationProvider>()

function resolveMt(b: CapabilityBinding): TranslationProvider {
  const cached = mtSingletons.get(b.adapterId)
  if (cached) return cached
  let adapter: TranslationProvider
  switch (b.adapterId) {
    case 'chrome-translator':
      adapter = new ChromeTranslatorMt()
      break
    case 'opus-mt-local':
      adapter = new OpusMtLocal()
      break
    case 'mymemory':
      adapter = new MyMemoryMt()
      break
    case 'server-llm-mt':
      adapter = new ServerLlmMt()
      break
    default:
      throw new Error(`adapter de tradução desconhecido: ${b.adapterId}`)
  }
  mtSingletons.set(b.adapterId, adapter)
  return adapter
}

function resolveLlm(b: CapabilityBinding): LlmProvider {
  switch (b.adapterId) {
    case 'openai-compatible': {
      const cloud = isCloud(b)
      return new OpenAiCompatibleLlm({
        id: b.adapterId,
        label: cloud ? 'Nuvem (proxy)' : isLocalUrl(b.baseUrl) ? 'Local (Ollama/LM Studio)' : 'OpenAI-compatible',
        runtime: cloud ? 'proxy' : 'browser',
        cost: cloud ? 'byo-cloud' : isLocalUrl(b.baseUrl) ? 'local' : 'free',
        // Nuvem → proxy do server (injeta segredo). Local/direto → baseUrl do binding.
        baseUrl: cloud ? '/api/ai/llm' : b.baseUrl ?? '',
        model: b.model ?? '',
        credentialId: b.credentialId,
      })
    }
    default:
      throw new Error(`adapter de LLM desconhecido: ${b.adapterId}`)
  }
}

// Adapters de STT com estado (worker do Whisper, modelo carregado) precisam ser SINGLETON
// entre chamadas — senão cada enunciado abriria um novo worker e rebaixaria o modelo de novo.
const sttSingletons = new Map<string, SttProvider>()

function resolveStt(b: CapabilityBinding): SttProvider {
  const key = `${b.adapterId}|${b.baseUrl ?? ''}|${b.model ?? ''}|${b.credentialId ?? ''}`
  const cached = sttSingletons.get(key)
  if (cached) return cached
  let adapter: SttProvider
  switch (b.adapterId) {
    case 'web-speech':
      adapter = new WebSpeechStt()
      break
    case 'whisper-local':
      adapter = new WhisperLocalStt()
      break
    case 'groq-whisper':
      adapter = new GroqWhisperStt({ model: b.model ?? 'whisper-large-v3-turbo', credentialId: b.credentialId })
      break
    default:
      throw new Error(`adapter de STT desconhecido: ${b.adapterId}`)
  }
  sttSingletons.set(key, adapter)
  return adapter
}

export interface GatewayDeps {
  profile: Profile
  /** Consentimento de nuvem da sessão (bindings de nuvem são pulados se `false`). */
  cloudConsent?: () => boolean
}

export function buildGateway({ profile, cloudConsent }: GatewayDeps) {
  const breakers = new BreakerRegistry()
  const ledger = new BudgetLedger(profile.budget)
  const core = new AiGateway(profile, breakers, ledger, cloudConsent ?? (() => true))
  // Rota ativa do sttRouter (nuvem-primeiro?) — mutável via stt.setRoute sem recriar o gateway.
  const sttPreferCloudRef = { value: false }

  return {
    core,
    ledger,
    setProfile: (p: Profile): void => core.setProfile(p),

    mt: {
      translate: (
        text: string,
        src: string | null,
        tgt: string,
        opts?: { signal?: AbortSignal }
      ): Promise<MtResult> =>
        core.run(
          'mt',
          async (b) => {
            const adapter = resolveMt(b)
            if (!adapter.supports(src, tgt)) throw new Error(`${adapter.id} não suporta ${src}→${tgt}`)
            const r = await adapter.translate(text, src, tgt, opts)

            /* A RESPOSTA VEIO NO IDIOMA QUE PEDIMOS?
               Ninguém perguntava isso, e o resultado chegou à tela de um usuário: um vídeo em
               espanhol, tradução pedida para português, e o que apareceu foi TCHECO — uma
               tradução correta do espanhol, no idioma errado. Nenhum erro, nenhum disjuntor,
               texto direto para a interface.

               A conferência mora AQUI e não no chamador, de propósito: lançar faz o adaptador
               contar como falha, abre o disjuntor dele e deixa a cascata tentar o próximo. Um
               tradutor que responde no idioma errado é um tradutor com defeito, e o gateway já
               sabe lidar com defeito. */
            /* SÓ DETECTA QUANDO A DETECÇÃO PODE MUDAR O VEREDICTO. `validarTraducao` aprova de
               saída o que é curto demais ou sem alvo — mas a detecção já tinha sido paga para
               chegar até lá. Numa legenda ao vivo a maioria das falas é curta, então era uma
               detecção desperdiçada por tradução, dentro do caminho que o usuário está esperando. */
            // A detecção pode falhar (offline, texto curto); `null` significa "não sei", e a
            // validação aceita — nunca derrubamos tradução por falta de informação.
            const saida = precisaConferir(r.text, tgt)
              ? await detectLanguage(r.text).catch(() => null)
              : null
            const veredicto = validarTraducao(r.text, tgt, src, saida)
            if (!veredicto.ok) throw new Error(explicarRejeicao(veredicto, adapter.id))
            return r
          },
          { isCloud }
        ),

      /** Aquece os adapters de MT locais (ex.: opus-mt) para as direções esperadas, em background. */
      warmup: (pairs: Array<[string, string]>): void => {
        for (const b of core.getProfile().bindings.mt ?? []) {
          try {
            const a = resolveMt(b)
            if (!a.preload) continue
            for (const [src, tgt] of pairs) if (a.supports(src, tgt)) a.preload(src, tgt)
          } catch {
            /* próximo binding */
          }
        }
      },

      /**
       * Pré-carrega o MT local de UMA direção reportando progresso (0..1) — para a UI de
       * preparação (onboarding/captura) mostrar a barra do TRADUTOR ao lado da do Whisper.
       * Resolve quando o modelo fica pronto (ou rejeita se nenhum adapter local cobre o par).
       */
      preload: (src: string, tgt: string, onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void): Promise<void> => {
        for (const b of core.getProfile().bindings.mt ?? []) {
          try {
            const a = resolveMt(b)
            if (a.preload && a.supports(src, tgt)) {
              return new Promise<void>((resolve) => {
                let done = false
                // Failsafe POR ESTAGNAÇÃO, não por prazo fixo. O prazo de 30 s resolvia a promise
                // no meio de um download legítimo — medido, 113 MB a 0,44 MB/s levam ~257 s (A-P1-8).
                let ultimoSinal = Date.now()
                a.preload!(src, tgt, (p, label, bytes) => {
                  ultimoSinal = Date.now()
                  onProgress?.(p, label, bytes)
                  if (p >= 1 && !done) { done = true; resolve() }
                })
                const vigia = setInterval(() => {
                  if (done) { clearInterval(vigia); return }
                  if (Date.now() - ultimoSinal < 30000) return // baixando, só devagar
                  clearInterval(vigia)
                  done = true
                  resolve() // MT é best-effort: o gateway cai p/ o próximo adapter
                }, 5000)
              })
            }
          } catch {
            /* próximo binding */
          }
        }
        return Promise.resolve()
      },
    },

    llm: {
      chat: (system: string, messages: ChatMessage[], opts?: LlmOptions): Promise<ChatResult> =>
        core.run('llm', (b) => resolveLlm(b).chat(system, messages, opts), { isCloud }),

      chatStream: (
        system: string,
        messages: ChatMessage[],
        onDelta: (delta: string) => void,
        opts?: LlmOptions
      ): Promise<ChatResult> =>
        core.run('llm', (b) => resolveLlm(b).chatStream(system, messages, onDelta, opts), { isCloud }),
    },

    stt: {
      isAvailable(): boolean {
        return (core.getProfile().bindings.stt ?? []).some((b) => {
          try {
            const a = resolveStt(b)
            return a.supportsLiveMic && a.isAvailable()
          } catch {
            return false
          }
        })
      },
      startLive(lang: string, cb: SttCallbacks): SttSession {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const adapter = resolveStt(b)
            if (adapter.supportsLiveMic && adapter.isAvailable() && adapter.startLive) {
              return adapter.startLive(lang, cb)
            }
          } catch {
            /* tenta o próximo binding */
          }
        }
        throw new Error('nenhum adapter de STT ao vivo disponível neste perfil/navegador')
      },

      /** Há algum adapter capaz de transcrever áudio já capturado (sistema/aba)? */
      hasBlobStt(): boolean {
        return (core.getProfile().bindings.stt ?? []).some((b) => {
          try {
            const a = resolveStt(b)
            return a.supportsBlob && a.isAvailable()
          } catch {
            return false
          }
        })
      },

      /** Pré-carrega o modelo do 1º STT de blob disponível (ex.: Whisper WebGPU), com progresso. */
      preloadModel(onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void): Promise<void> {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b)
            if (a.supportsBlob && a.isAvailable() && a.preload) return a.preload(onProgress)
          } catch {
            /* próximo binding */
          }
        }
        return Promise.resolve()
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
      setRoute(route: { preferCloud: boolean; localModel?: string }): void {
        sttPreferCloudRef.value = route.preferCloud
        if (route.localModel) {
          for (const b of core.getProfile().bindings.stt ?? []) {
            try {
              const a = resolveStt(b)
              if (a.supportsBlob && typeof (a as any).setModel === 'function') (a as any).setModel(route.localModel)
            } catch { /* próximo binding */ }
          }
        }
      },

      async transcribePcm(
        pcm: Float32Array,
        sampleRate: number,
        opts?: { languageHint?: string; signal?: AbortSignal; onUpdate?: (text: string) => void }
      ): Promise<SttFinal> {
        const consent = cloudConsent ?? (() => true)
        let lastErr: Error | null = null
        let bindings = [...(core.getProfile().bindings.stt ?? [])]
        if (sttPreferCloudRef.value) {
          // Nuvem (groq-whisper) primeiro; o resto mantém a ordem relativa (reserva local).
          bindings = [
            ...bindings.filter((b) => b.adapterId === 'groq-whisper'),
            ...bindings.filter((b) => b.adapterId !== 'groq-whisper'),
          ]
        }
        for (const b of bindings) {
          let a: SttProvider
          try {
            a = resolveStt(b)
          } catch {
            continue
          }
          if (!a.supportsBlob || !a.transcribePcm || !a.isAvailable()) continue
          if (isCloud(b) && !consent()) continue
          try {
            // AWAIT: se este adapter (ex.: Groq sem chave/erro de rede) REJEITAR, cai para o
            // próximo binding (ex.: Whisper local) em vez de propagar a falha.
            const r = await a.transcribePcm(pcm, sampleRate, opts)
            return { ...r, engine: r.engine ?? b.adapterId }
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e))
          }
        }
        throw lastErr ?? new Error('nenhum STT de blob disponível neste perfil')
      },

      /**
       * Transcreve um PARCIAL (best-effort): usa o 1º adapter LOCAL com `transcribeIfIdle`
       * (hoje o Whisper local), que resolve `null` se estiver ocupado — o parcial é
       * DESCARTADO em vez de enfileirar. Despacho direto, sem breaker/consentimento.
       */
      transcribePartial(
        pcm: Float32Array,
        sampleRate: number,
        opts?: { languageHint?: string }
      ): Promise<SttFinal | null> {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b)
            if (a.supportsBlob && a.isAvailable() && a.transcribeIfIdle) {
              return a.transcribeIfIdle(pcm, sampleRate, opts)
            }
          } catch {
            /* próximo binding */
          }
        }
        return Promise.resolve(null)
      },

      /** Profundidade da fila de decode do 1º STT de blob (para métrica de saturação). */
      pendingCount(): number {
        for (const b of core.getProfile().bindings.stt ?? []) {
          try {
            const a = resolveStt(b)
            if (a.supportsBlob && typeof a.queueDepth === 'number') return a.queueDepth
          } catch {
            /* próximo binding */
          }
        }
        return 0
      },
    },
  }
}
