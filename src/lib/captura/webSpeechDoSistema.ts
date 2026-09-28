/**
 * O ÁUDIO DA ABA/SISTEMA NO RECONHECEDOR DO NAVEGADOR — degrau T2 do harness adaptativo (§1.1, §3;
 * `openspec/audits/2026-09-28-eficiencia-ia/harness-adaptativo.md`).
 *
 * POR QUE EXISTE. No Chrome/Edge do computador, com o pacote do idioma instalado, o navegador
 * reconhece fala NO aparelho (`processLocally`, Chrome ~139+) e aceita uma trilha como entrada
 * (`start(trilha)`, Chrome 133+). Juntas, legendam o vídeo da aba de graça, sem baixar o Whisper
 * (209–589 MB) nem ocupar a GPU com ele. Fora disso, nada muda: VAD → Whisper/Moonshine local ou a
 * nuvem (`routeStt`).
 *
 * NUNCA NA NUVEM DO NAVEGADOR. O áudio de um vídeo é a fala de TERCEIROS: o modo nuvem da Web Speech
 * o mandaria ao Google, e o consentimento do "Rápido" (`reconhecimentoDoNavegador`) foi dado para a
 * SUA voz no microfone. Esta decisão só conhece dois motores — local ou o caminho de sempre — e o
 * adaptador lança se receber uma trilha sem `processLocally`.
 *
 * QUANDO (`escolherMotorDoSistema`, pura; a ordem é a do mais barato ao mais caro de perguntar):
 *   · o navegador tem `processLocally` (a propriedade existe) e é computador — celular, Quest,
 *     Firefox e Safari não têm a combinação;
 *   · o teste em execução não falhou antes NESTE aparelho (`webSpeechComTrilha`, na sonda);
 *   · a rota NÃO é nuvem primeiro — quem paga recebe o large-v3-turbo (4,9% de WER), melhor que
 *     qualquer nativo medido;
 *   · a pessoa não escolheu um modelo ("rápido"/"preciso" são escolhas do Whisper) nem o multi-idioma
 *     (a Web Speech precisa de UM idioma);
 *   · `available({langs:[idioma do conteúdo], processLocally:true})` = 'available'. Sob automação
 *     (`navigator.webdriver`) a pergunta nem é feita: derruba o Chromium headless do Playwright
 *     (guarda em `disponibilidadeDoSttNoAparelho`).
 *
 * O TESTE EM EXECUÇÃO (`iniciarWebSpeechDoSistema`). Não está documentado se `start(trilha)` combina
 * com `processLocally`, então a captura TENTA, e cai no Whisper sem a pessoa perceber quando:
 *   · `start(trilha)` lança → devolve `null` (quem chama segue no Whisper);
 *   · o reconhecedor diz language-not-supported/not-allowed/service-not-allowed;
 *   · o VAD (que continua ouvindo a mesma trilha) detecta fala — duas falas e `PRAZO_SEM_RESULTADO_MS`
 *     desde a primeira — e a Web Speech não devolve nada. Uma fala só não conta: música e ruído
 *     passam pelo VAD às vezes, e a Web Speech com razão fica calada.
 * Falhar ANTES do primeiro resultado grava `'falhou'` na sonda (o próximo início nem tenta); o
 * primeiro final grava `'ok'`. Travar DEPOIS de funcionar cai nesta sessão, sem gravar nada.
 */
import { type ErroDaWebSpeech, ERROS_FATAIS_DA_TRILHA, WebSpeechStt } from '../../gateway/adapters/webSpeech';
import type { SttCallbacks, SttSession } from '../../gateway/capabilities';
import type { SttQuality } from '../../gateway/sttRouter';
import type { Disponibilidade, EstadoDaWebSpeechComTrilha } from '../dispositivo/sonda';

export type MotorDoSistema = 'web-speech-local' | 'pipeline';

export type MotivoDoMotorDoSistema =
  | 'no-aparelho'
  | 'sem-reconhecimento-local'
  | 'movel'
  | 'falhou-antes'
  | 'nuvem-primeiro'
  | 'escolha-de-modelo'
  | 'multi-idioma'
  | 'idioma-indisponivel';

export interface EntradaDoMotorDoSistema {
  /** Computador (o perfil do aparelho começa com `desktop`). */
  desktop: boolean;
  /** `SpeechRecognition` com a propriedade `processLocally` (Chrome ~139+). */
  reconhecimentoLocalSuportado: boolean;
  /** A rota do STT é nuvem primeiro (plano pago com a nuvem no ar, ou chave própria). */
  nuvemPrimeiro: boolean;
  /** A preferência "Qualidade da transcrição". */
  qualidade: SttQuality;
  /** Detecção de idioma ligada (sem idioma fixo do conteúdo). */
  multiIdioma: boolean;
  /** `available({langs:[idioma do conteúdo], processLocally:true})`; `null` = sem resposta. */
  noAparelho: Disponibilidade | null;
  /** O veredito guardado do teste em execução, neste aparelho. */
  lembrado: EstadoDaWebSpeechComTrilha | null;
}

export interface DecisaoDoMotorDoSistema {
  motor: MotorDoSistema;
  motivo: MotivoDoMotorDoSistema;
}

const pipeline = (motivo: MotivoDoMotorDoSistema): DecisaoDoMotorDoSistema => ({ motor: 'pipeline', motivo });

export function escolherMotorDoSistema(e: EntradaDoMotorDoSistema): DecisaoDoMotorDoSistema {
  if (!e.reconhecimentoLocalSuportado) return pipeline('sem-reconhecimento-local');
  if (!e.desktop) return pipeline('movel');
  if (e.lembrado === 'falhou') return pipeline('falhou-antes');
  if (e.nuvemPrimeiro) return pipeline('nuvem-primeiro');
  if (e.qualidade === 'fast' || e.qualidade === 'accurate') return pipeline('escolha-de-modelo');
  if (e.multiIdioma) return pipeline('multi-idioma');
  if (e.noAparelho !== 'available') return pipeline('idioma-indisponivel');
  return { motor: 'web-speech-local', motivo: 'no-aparelho' };
}

/** O navegador conhece `processLocally`? Pela propriedade no protótipo — nunca pela UA. */
export function temReconhecimentoLocal(escopo: unknown = globalThis): boolean {
  try {
    const e = escopo as { SpeechRecognition?: { prototype?: object }; webkitSpeechRecognition?: { prototype?: object } };
    const proto = (e.SpeechRecognition ?? e.webkitSpeechRecognition)?.prototype;
    return !!proto && 'processLocally' in proto;
  } catch {
    return false;
  }
}

/**
 * A decisão com as perguntas ao navegador, da mais barata à mais cara: só pergunta o que ainda pode
 * mudar a resposta. Nunca lança; na dúvida, o caminho de sempre.
 */
export async function resolverMotorDoSistema(e: {
  /** Idioma do CONTEÚDO (o que se ouve), como a Web Speech o recebe (`en-US`, `pt-BR`). */
  lang: string;
  desktop: boolean;
  qualidade: SttQuality;
  multiIdioma: boolean;
  /** A rota é nuvem primeiro? Só perguntada se o resto permitir (custa uma ida ao servidor). */
  nuvemPrimeiro: () => Promise<boolean>;
  /** O veredito guardado (`webSpeechComTrilhaLembrada`). */
  lembrado: () => Promise<EstadoDaWebSpeechComTrilha | null>;
  escopo?: unknown;
}): Promise<DecisaoDoMotorDoSistema> {
  const escopo = e.escopo ?? globalThis;
  const entrada: EntradaDoMotorDoSistema = {
    desktop: e.desktop,
    reconhecimentoLocalSuportado: temReconhecimentoLocal(escopo),
    nuvemPrimeiro: false,
    qualidade: e.qualidade,
    multiIdioma: e.multiIdioma,
    noAparelho: 'available',
    lembrado: null,
  };
  let d = escolherMotorDoSistema(entrada);
  if (d.motor === 'pipeline') return d;
  entrada.lembrado = await e.lembrado().catch(() => null);
  d = escolherMotorDoSistema(entrada);
  if (d.motor === 'pipeline') return d;
  try {
    // A guarda do `webdriver` mora aqui dentro: sob automação, `null` sem chamar `available`.
    const { disponibilidadeDoSttNoAparelho } = await import('../dispositivo/sonda');
    entrada.noAparelho = await disponibilidadeDoSttNoAparelho(e.lang, escopo);
  } catch {
    entrada.noAparelho = null;
  }
  d = escolherMotorDoSistema(entrada);
  if (d.motor === 'pipeline') return d;
  // Rota que não responde conta como nuvem primeiro: errar para o caminho de sempre.
  entrada.nuvemPrimeiro = await e.nuvemPrimeiro().catch(() => true);
  return escolherMotorDoSistema(entrada);
}

/* ─── o controlador da sessão ─────────────────────────────────────────────────────────────────── */

/** Silêncio da Web Speech, com o VAD ouvindo fala, que derruba o teste. */
export const PRAZO_SEM_RESULTADO_MS = 10_000;
/** Falas do VAD sem resultado, no mínimo, antes de derrubar (uma só pode ser música). */
export const FALAS_SEM_RESULTADO = 2;
const RELOGIO_DA_VIGIA_MS = 1000;

/** O pedaço do adaptador que o controlador usa (injetável nos testes). */
type CriarStt = (o: { processLocally: boolean; trilha: MediaStreamTrack }) => {
  startLive(lang: string, cb: SttCallbacks): SttSession;
};

export interface OpcoesDaWebSpeechDoSistema {
  trilha: MediaStreamTrack;
  /** Idioma do conteúdo (`en-US`). */
  lang: string;
  aoParcial: (texto: string) => void;
  aoFinal: (texto: string) => void;
  /** A Web Speech não serviu: o chamador liga o caminho de sempre. Chamado no máximo uma vez. */
  aoCair: (motivo: string) => void;
  /** Guarda o veredito do teste (padrão: `lembrarWebSpeechComTrilha` da sonda). */
  lembrar?: (estado: EstadoDaWebSpeechComTrilha) => Promise<void>;
  criarStt?: CriarStt;
  agora?: () => number;
}

export interface ControleDaWebSpeechDoSistema {
  /** O VAD da mesma trilha viu começar uma fala. */
  falaComecou(): void;
  /** O VAD fechou a fala. */
  falaTerminou(): void;
  /** Pausa (encerra o reconhecedor) ou retoma (abre outro com a mesma trilha). */
  pausar(pausado: boolean): void;
  /** Encerra tudo; nada cai depois. */
  parar(): void;
}

const lembrarPadrao = (estado: EstadoDaWebSpeechComTrilha) =>
  import('../dispositivo/sonda').then((m) => m.lembrarWebSpeechComTrilha(estado));

/**
 * Abre a Web Speech no aparelho sobre a trilha. `null` = o `start` lançou (a combinação não existe
 * neste navegador; o veredito já foi guardado) e quem chama segue no Whisper.
 */
export function iniciarWebSpeechDoSistema(o: OpcoesDaWebSpeechDoSistema): ControleDaWebSpeechDoSistema | null {
  const criar: CriarStt = o.criarStt ?? ((op) => new WebSpeechStt(op));
  const lembrar = (estado: EstadoDaWebSpeechComTrilha) => {
    void (o.lembrar ?? lembrarPadrao)(estado).catch(() => {
      /* sem armazenamento: o veredito vale só nesta sessão */
    });
  };
  const agora = o.agora ?? Date.now;
  /* Uma CÓPIA da trilha: o reconhecedor pode encerrar a trilha que recebe, e a original alimenta o
     VAD e o gravador. A cópia morre com o compartilhamento (mesma fonte) e no `parar`. */
  const trilha =
    typeof (o.trilha as { clone?: unknown }).clone === 'function' ? o.trilha.clone() : o.trilha;

  let algumResultado = false;
  let lembrouOk = false;
  let falas = 0;
  let desde: number | null = null;
  let encerrado = false;
  let sessao: SttSession | null = null;
  let relogio: ReturnType<typeof setInterval> | null = null;

  const fecharSessao = () => {
    try {
      sessao?.stop();
    } catch {
      /* já parada */
    }
    sessao = null;
  };

  const encerrar = () => {
    encerrado = true;
    fecharSessao();
    if (relogio) clearInterval(relogio);
    relogio = null;
    if (trilha !== o.trilha) {
      try {
        trilha.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const cair = (motivo: string) => {
    if (encerrado) return;
    encerrar();
    if (!algumResultado) lembrar('falhou');
    o.aoCair(motivo);
  };

  const houveResultado = () => {
    algumResultado = true;
    falas = 0;
    desde = null;
  };

  const callbacks: SttCallbacks = {
    onPartial: (texto) => {
      if (encerrado) return;
      houveResultado();
      o.aoParcial(texto);
    },
    onFinal: ({ text }) => {
      if (encerrado) return;
      houveResultado();
      if (!lembrouOk) {
        lembrouOk = true;
        lembrar('ok');
      }
      o.aoFinal(text);
    },
    onError: (erro) => {
      const codigo = (erro as ErroDaWebSpeech).codigo;
      if (codigo && ERROS_FATAIS_DA_TRILHA.has(codigo)) cair(`erro:${codigo}`);
    },
  };

  const abrir = () => {
    sessao = criar({ processLocally: true, trilha }).startLive(o.lang, callbacks);
  };

  try {
    abrir();
  } catch {
    encerrar();
    lembrar('falhou');
    return null;
  }

  relogio = setInterval(() => {
    if (falas >= FALAS_SEM_RESULTADO && desde != null && agora() - desde >= PRAZO_SEM_RESULTADO_MS)
      cair('sem-resultado');
  }, RELOGIO_DA_VIGIA_MS);

  return {
    falaComecou() {
      if (desde == null) desde = agora();
    },
    falaTerminou() {
      if (desde != null) falas++;
    },
    pausar(pausado) {
      if (encerrado) return;
      if (pausado) {
        fecharSessao();
        falas = 0;
        desde = null;
        return;
      }
      if (sessao) return;
      try {
        abrir();
      } catch {
        cair('retomar-falhou');
      }
    },
    parar: encerrar,
  };
}
