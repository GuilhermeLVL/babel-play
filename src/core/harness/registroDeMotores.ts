/**
 * REGISTRO DE MOTORES — o que cada motor de IA É, declarado num lugar só (harness adaptativo §6).
 *
 * POR QUE EXISTE. Hoje o "o que é este motor" vive espalhado: o `switch` de `src/gateway/index.ts`
 * sabe instanciar, o `sttRouter.ts` sabe o tamanho, o comentário do perfil sabe se é offline, e a
 * lista fixa `exigeConsentimento` sabe se sai do aparelho. Uma lista à mão erra por omissão, e errou:
 * a Web Speech manda o áudio do microfone ao Google no Chrome (modo nuvem, sem `processLocally`) —
 * até no perfil "Privado/Local 100% offline" — e nunca passou pelo consentimento, porque a lista só
 * conhecia quem fala com o NOSSO servidor (auditoria de eficiência 2026-09-28, §3; LGPD).
 *
 * A REGRA NOVA: o consentimento é DERIVADO de `enviaDadosA`. Qualquer motor cujo dado sai do
 * aparelho — para o Google, a Apple, um terceiro ou a nossa própria nuvem — exige consentimento. A
 * nossa nuvem ('nos') continua exigindo, como na lista de hoje: o usuário não distingue "o servidor
 * do Babel" de "a Groq atrás dele", e a promessa do perfil Privado é "nada sai daqui".
 *
 * PURO E ISOMÓRFICO (núcleo): nada de DOM, nada de import de adaptador. Os números de tamanho são
 * CÓPIA das tabelas medidas de `src/gateway/sttRouter.ts` (o núcleo não importa o gateway do
 * navegador); `tests/registroDeMotores.test.ts` compara as duas e quebra se divergirem.
 *
 * LIGADO (integração do harness, 2026-09-28): o gateway (`src/gateway/index.ts`) decide o
 * consentimento por `bindingExigeConsentimento` — a lista à mão de lá foi apagada. Os `switch` de
 * instanciação continuam lá; trocá-los por consultas a este registro é passo futuro.
 */
import type { CapabilityBinding } from '../gateway/profile';

export type TarefaDoMotor = 'stt' | 'mt' | 'llm';

/**
 * Onde o motor roda. `dados` = não é IA (dicionário, memória de tradução); `nativo-navegador` = API
 * do próprio navegador (Web Speech, Translator); `nativo-app` = SO via casca (Capacitor); `local` =
 * nosso modelo no aparelho (WASM/WebGPU); `nuvem` = sai do aparelho por rede.
 */
export type RuntimeDoMotor = 'dados' | 'nativo-navegador' | 'nativo-app' | 'local' | 'nuvem';

/** Para onde o dado do usuário vai. `null` = não sai do aparelho. */
export type DestinoDosDados = null | 'google' | 'apple' | 'microsoft' | 'meta' | 'nos' | 'terceiro';

/** Custo para quem usa: `zero`; `download` (uma vez, bytes no aparelho); `cota` (conta no plano/limite). */
export type CustoDoMotor = 'zero' | 'download' | 'cota';

export interface RequisitosDoMotor {
  /** Precisa de adaptador WebGPU real (o small em WASM leva 18,6 s por legenda — auditoria de latência). */
  webgpu?: boolean;
  /** Precisa da feature `shader-f16` do adaptador. */
  shaderF16?: boolean;
  /** Precisa de `crossOriginIsolated` (WASM com threads). */
  isolado?: boolean;
  /** Precisa da ponte nativa do app (Capacitor). */
  ponteNativa?: boolean;
  /** Precisa da extensão do navegador. */
  extensao?: boolean;
}

export interface RegistroDeMotor {
  /** Id único do motor no registro (um adaptador pode ter vários motores: whisper tiny/base/small). */
  id: string;
  /** O `adapterId` do binding que instancia este motor (`CapabilityBinding.adapterId`). */
  adapterId: string;
  /** Id do modelo no Hub, quando há um (o mesmo que o worker pede). */
  modelo?: string;
  tarefa: TarefaDoMotor;
  runtime: RuntimeDoMotor;
  /** ISO-639-1 que o motor atende, ou `todos` (a disponibilidade real do par é checada em execução). */
  idiomas: readonly string[] | 'todos';
  /** Bytes baixados na primeira vez, no dtype que a rota usa. Ausente = não baixa nada nosso. */
  bytes?: number;
  /** Memória de pico medida, quando há medição. Ausente = não medido (não inventamos número). */
  memoriaDePicoMb?: number;
  requer: RequisitosDoMotor;
  enviaDadosA: DestinoDosDados;
  custo: CustoDoMotor;
  /** Licença do modelo ou, para serviço, os termos que regem o uso. */
  licenca: string;
  /** Observação que muda decisão (por que o destino é esse, o que falta medir). */
  nota?: string;
}

/** MB decimais do Hub → bytes. As tabelas do `sttRouter.ts` estão em MB decimais (bytes do Hub / 1e6). */
const mb = (n: number): number => n * 1_000_000;

/**
 * Os motores de HOJE, fiéis ao código (`src/gateway/index.ts` resolveMt/resolveStt/resolveLlm,
 * `profiles.ts`, `sttRouter.ts`, `adapters/*`). Motores futuros (Bergamot, Parakeet, ML Kit) entram quando existir o adaptador — registro de motor que não roda é
 * promessa, e o teste de fidelidade exige que tudo aqui corresponda a um adaptador real.
 */
export const REGISTRO_DE_MOTORES: readonly RegistroDeMotor[] = [
  // ── STT ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'web-speech',
    adapterId: 'web-speech',
    tarefa: 'stt',
    runtime: 'nativo-navegador',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'google',
    custo: 'zero',
    licenca: 'termos do navegador',
    nota:
      'Modo NUVEM (sem `processLocally`): o Chrome manda o áudio aos servidores do Google; no Safari vai ' +
      'à Apple (Siri). Registramos o caso dominante (Chrome/Android): o que importa para o ' +
      'consentimento é que SAI do aparelho, qualquer que seja o destino.',
  },
  {
    /* O MESMO adaptador, no modo que não sai do aparelho: `processLocally = true` (Chrome 139+ com o
       pacote do idioma instalado). Não muda o consentimento do BINDING `web-speech` — o binding não
       sabe o modo, e `bindingExigeConsentimento` segue pedindo (algum motor do adaptador envia). Quem
       escolhe o modo local é a captura (`lib/captura/motorDoMicrofone.ts`), depois de o navegador
       responder `available()` para o idioma; e o adaptador FALHA FECHADO se o navegador não conhece a
       propriedade (sem ela, o reconhecimento iria ao Google calado). */
    id: 'web-speech-local',
    adapterId: 'web-speech',
    tarefa: 'stt',
    runtime: 'nativo-navegador',
    idiomas: 'todos', // o pacote de cada idioma é checado em execução (`available({processLocally})`)
    requer: {},
    enviaDadosA: null,
    custo: 'zero',
    licenca: 'termos do navegador',
    nota: 'O pacote de idioma é do navegador; `install()` só a partir do clique em "Iniciar" (ativação do usuário).',
  },
  {
    id: 'whisper-small',
    adapterId: 'whisper-local',
    modelo: 'onnx-community/whisper-small',
    tarefa: 'stt',
    runtime: 'local',
    idiomas: 'todos',
    bytes: mb(589), // medido: bytes do Hub no dtype hybrid (download real 588,7 MB)
    requer: { webgpu: true },
    enviaDadosA: null,
    custo: 'download',
    licenca: 'MIT',
    nota: 'Pico de memória de 1,3–1,4 GB medido no conjunto STT+MT (relatório de dispositivos 2026-09-26), não isolado.',
  },
  {
    id: 'whisper-base',
    adapterId: 'whisper-local',
    modelo: 'onnx-community/whisper-base',
    tarefa: 'stt',
    runtime: 'local',
    idiomas: 'todos',
    bytes: mb(209), // medido: bytes do Hub, hybrid (q8 = 80 MB, rota de celular/Quest)
    requer: {},
    enviaDadosA: null,
    custo: 'download',
    licenca: 'MIT',
  },
  {
    id: 'whisper-tiny',
    adapterId: 'whisper-local',
    modelo: 'onnx-community/whisper-tiny',
    tarefa: 'stt',
    runtime: 'local',
    idiomas: 'todos',
    bytes: mb(117), // medido: canário de payload real
    requer: {},
    enviaDadosA: null,
    custo: 'download',
    licenca: 'MIT',
    nota: 'Alucina em 70,6% dos trechos sem fala (bancada 2026-09-24); só entra onde nada maior cabe.',
  },
  {
    id: 'moonshine-base',
    adapterId: 'whisper-local', // o worker do Whisper carrega o Moonshine (`adapters/moonshine.ts`)
    modelo: 'onnx-community/moonshine-base-ONNX',
    tarefa: 'stt',
    runtime: 'local',
    idiomas: ['en'],
    bytes: mb(67), // medido: bytes do Hub, q8
    requer: {},
    enviaDadosA: null,
    custo: 'download',
    licenca: 'MIT (só o modelo de inglês; os não-inglês são não comerciais)',
  },
  {
    id: 'moonshine-tiny',
    adapterId: 'whisper-local',
    modelo: 'onnx-community/moonshine-tiny-ONNX',
    tarefa: 'stt',
    runtime: 'local',
    idiomas: ['en'],
    bytes: mb(32), // medido: bytes do Hub, q8
    requer: {},
    enviaDadosA: null,
    custo: 'download',
    licenca: 'MIT (só o modelo de inglês)',
  },
  {
    id: 'groq-whisper',
    adapterId: 'groq-whisper',
    modelo: 'whisper-large-v3-turbo',
    tarefa: 'stt',
    runtime: 'nuvem',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'nos',
    custo: 'cota',
    licenca: 'MIT (modelo) + termos do provedor (Groq, ZDR)',
    nota: 'Passa pelo NOSSO proxy (`/api/ai/stt`), que repassa à Groq: para o usuário, é a nossa nuvem.',
  },

  // ── MT ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'chrome-translator',
    adapterId: 'chrome-translator',
    tarefa: 'mt',
    runtime: 'nativo-navegador',
    idiomas: 'todos', // o par é decidido pelo navegador (`Translator.availability()`) em execução
    requer: {},
    enviaDadosA: null,
    custo: 'zero',
    licenca: 'termos do navegador',
    nota: 'Tradução no aparelho (Chrome 138+/Edge 148+ desktop). O pacote de idioma é baixado pelo navegador, não por nós.',
  },
  {
    id: 'opus-mt-local',
    adapterId: 'opus-mt-local',
    tarefa: 'mt',
    runtime: 'local',
    // Só pares com o inglês: en↔es/fr/it/de (dedicados), en→pt (ROMANCE com `>>pt_br<<`) e
    // pt/ro/ca/gl→en (ROMANCE-en). Ver `dirConfig` em `adapters/mtWorker.ts`.
    idiomas: ['en', 'pt', 'es', 'fr', 'it', 'de', 'ro', 'ca', 'gl'],
    bytes: mb(113), // o maior par em q8 (`MT_DOWNLOAD_MB`), por direção
    requer: {},
    enviaDadosA: null,
    custo: 'download',
    licenca: 'CC-BY-4.0 (Helsinki-NLP)',
  },
  {
    id: 'server-llm-mt',
    adapterId: 'server-llm-mt',
    modelo: 'gpt-oss-120b',
    tarefa: 'mt',
    runtime: 'nuvem',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'nos',
    custo: 'cota',
    licenca: 'Apache-2.0 (modelo) + termos do provedor',
    nota: 'Tradutor IA do NOSSO servidor (`/api/ai/mt`); só o texto sai, nunca o áudio.',
  },
  {
    id: 'mymemory',
    adapterId: 'mymemory',
    tarefa: 'mt',
    runtime: 'nuvem',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'terceiro',
    custo: 'cota', // ~5k caracteres/dia no anônimo
    licenca: 'termos do MyMemory (Translated)',
    nota: 'Chamado DIRETO do navegador, sem passar pelo nosso servidor.',
  },

  // ── LLM ─────────────────────────────────────────────────────────────────────────────────────────
  // Um adaptador, três destinos: o `openai-compatible` decide pelo binding (credencial → proxy;
  // URL local → Ollama/LM Studio; outra URL → provedor direto). `bindingExigeConsentimento` resolve
  // qual dos três um binding é.
  {
    id: 'openai-compatible-local',
    adapterId: 'openai-compatible',
    tarefa: 'llm',
    runtime: 'local',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: null,
    custo: 'zero',
    licenca: 'do modelo que o usuário instalou',
    nota: 'Ollama/LM Studio no próprio computador (baseUrl localhost).',
  },
  {
    id: 'openai-compatible-proxy',
    adapterId: 'openai-compatible',
    tarefa: 'llm',
    runtime: 'nuvem',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'nos',
    custo: 'cota',
    licenca: 'termos do provedor da credencial',
    nota: 'Com `credentialId`: vai ao nosso proxy (`/api/ai/llm`), que injeta a chave.',
  },
  {
    id: 'openai-compatible-remoto',
    adapterId: 'openai-compatible',
    tarefa: 'llm',
    runtime: 'nuvem',
    idiomas: 'todos',
    requer: {},
    enviaDadosA: 'terceiro',
    custo: 'cota',
    licenca: 'termos do provedor',
    nota: 'baseUrl remota sem credencial: o navegador fala direto com o provedor.',
  },
];

/** Exige consentimento de nuvem: o dado sai do aparelho — para quem quer que seja, inclusive nós. */
export function exigeConsentimento(motor: Pick<RegistroDeMotor, 'enviaDadosA'>): boolean {
  return motor.enviaDadosA !== null;
}

export function motorPorId(id: string): RegistroDeMotor | undefined {
  return REGISTRO_DE_MOTORES.find((m) => m.id === id);
}

export function motoresDaTarefa(tarefa: TarefaDoMotor): RegistroDeMotor[] {
  return REGISTRO_DE_MOTORES.filter((m) => m.tarefa === tarefa);
}

/**
 * Os `adapterId` com ALGUM motor que manda dado para fora — a lista que substitui a fixa de
 * `index.ts`. O `openai-compatible` entra (tem destinos remotos); o binding concreto decide.
 */
export function adaptersQueExigemConsentimento(): Set<string> {
  return new Set(REGISTRO_DE_MOTORES.filter(exigeConsentimento).map((m) => m.adapterId));
}

/** Mesma regex de `src/gateway/index.ts` (`LOCAL_RE`): o endereço é do próprio computador. */
const URL_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i;

/**
 * O BINDING concreto exige consentimento? Equivalente à lista de `index.ts` — mais a Web Speech.
 *
 *  - `credentialId` (BYOK) → sim: vai ao proxy, sai do aparelho, qualquer que seja o adaptador;
 *  - `openai-compatible` → pela URL: local não pede; remota pede; SEM URL não pede, igual a hoje
 *    (sem credencial e sem URL o adaptador não tem para onde mandar nada);
 *  - demais → pelo registro: pede se algum motor do adaptador envia dados;
 *  - adaptador fora do registro → PEDE. É a única diferença deliberada para a lista de hoje (que
 *    deixava passar o desconhecido): motor sem decisão de privacidade falha fechado.
 */
export function bindingExigeConsentimento(
  b: Pick<CapabilityBinding, 'adapterId' | 'baseUrl' | 'credentialId'>,
): boolean {
  if (b.credentialId) return true;
  if (b.adapterId === 'openai-compatible') return !!b.baseUrl && !URL_LOCAL.test(b.baseUrl);
  const doAdapter = REGISTRO_DE_MOTORES.filter((m) => m.adapterId === b.adapterId);
  if (doAdapter.length === 0) return true;
  return doAdapter.some(exigeConsentimento);
}
