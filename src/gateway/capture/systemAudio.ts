import { MicVAD } from '@ricky0123/vad-web';

import { apiFetch } from '../../data/api';
import { ehPrefixo, EspelhoDoVad } from './espelhoDoVad';
import { pararGravador } from './pararGravador';
import { TAXA_DE_BITS_DA_GRAVACAO } from './taxaDeBits';

// Logger de diagnóstico da captura de sistema/VAD (observabilidade no console do navegador).
const vlog = (...a: any[]) => console.log('%c[cap:vad]', 'color:#0369A1;font-weight:bold', ...a);

export interface AudioCapture {
  /** Encerra a captura e devolve o áudio GRAVADO da sessão — ou null se indisponível. */
  stop(): Promise<Blob | null>;
  /**
   * MUDO/ATIVO sem encerrar a captura — o interruptor de microfone do Espaço de Gravação.
   *
   * POR QUE NÃO É `stop()` + `start()`. Cada `stop()` fecha o MediaRecorder e devolve UM blob.
   * Alternar a fonte três vezes numa sessão produziria três blobs, e o `handleStopRecording` só
   * sabe misturar um — o áudio das partes anteriores sumiria do que é salvo, e cada reinício
   * moveria o `startedAtMs`, descolando as legendas do áudio.
   *
   * Desabilitar a FAIXA resolve os dois: o navegador entrega silêncio, então o recorder segue
   * gravando (um blob só, com a linha do tempo intacta) e o VAD não vê fala nenhuma. É o mesmo
   * gesto que qualquer app de chamada chama de "mutar".
   */
  setMuted(muted: boolean): void;
  /**
   * PAUSA sem encerrar — o "Parar" que abre o Encerrar a sessão com a gravação ainda de pé.
   *
   * Diferente do mudo: o gravador PAUSA (o trecho da pausa não entra no áudio salvo) e o VAD
   * pausa entregando a frase que estava em curso (`submitUserSpeechOnPause`), então nada do que
   * foi dito se perde. "Continuar gravando" retoma o MESMO gravador — um blob só, sem pedir de
   * novo o compartilhamento de tela. Quem retoma adianta o relógio das legendas pela duração da
   * pausa, para elas continuarem coladas no áudio.
   */
  setPaused(paused: boolean): void;
  /**
   * Instante (Date.now(), epoch-ms) em que o MediaRecorder REALMENTE começou a gravar — a
   * ORIGEM (t=0) do áudio salvo. A UI ancora o relógio das legendas a este valor: sem isso, o
   * t0 do clique em START fica ADIANTADO do t0 do recorder por todo o tempo da caixa de
   * compartilhamento (getDisplayMedia), e a legenda descola do áudio por esse offset variável.
   */
  startedAtMs: number;
  /**
   * A trilha de áudio que o VAD e o gravador ouvem — para a Web Speech no aparelho reconhecer a MESMA
   * fonte (`start(trilha)`, `lib/captura/webSpeechDoSistema.ts`). Ausente onde não há trilha (a rota
   * do servidor, que chega em PCM).
   */
  trilhaDeAudio?: MediaStreamTrack;
}

/* A taxa de bits do gravador mora num módulo-folha (a mistura sistema+mic usa a mesma); o porquê
   do valor está lá. Reexportada daqui porque é deste módulo que quem grava a importa. */
export { TAXA_DE_BITS_DA_GRAVACAO };

/**
 * TETO DE FALA CONTÍNUA antes do corte forçado, por motor FINAL de STT.
 *
 * LOCAL (6 s): o Whisper no navegador decodifica o trecho inteiro de uma vez; um bloco longo é um
 * decode longo, e a legenda atrasa. Seis segundos mantêm o retorno responsivo.
 *
 * NUVEM (12 s): a Groq COBRA NO MÍNIMO 10 s POR REQUISIÇÃO. Fatiar em 6 s paga ~o dobro pelo mesmo
 * áudio, e ainda parte frases ao meio — o que piora o WER (docs/PROXIMOS-PASSOS.md, D1), porque o
 * modelo perde o contexto da outra metade. O parcial continua LOCAL e a cada ~1 s, então um final
 * mais longo NÃO atrasa o texto que aparece na tela enquanto a pessoa fala.
 */
export const MAX_SPEECH_MS_LOCAL = 6000;
export const MAX_SPEECH_MS_NUVEM = 12_000;

/**
 * Opções da captura que dependem do RESTO do app (hoje: da rota de STT).
 *
 * `maxSpeechMs` é uma FUNÇÃO, lida a cada quadro do VAD, e não um número: o roteador de STT só
 * decide "nuvem primeiro" DEPOIS que a captura abriu (a sonda `/api/ai/stt/available` corre em
 * paralelo ao pedido de compartilhamento). Um número congelaria a decisão errada no começo; a função
 * pega a rota assim que ela existe — e acompanha se a nuvem cair no meio da sessão.
 */
export interface OpcoesDeCaptura {
  maxSpeechMs?: () => number;
  /**
   * O contexto criado e retomado NO CLIQUE (`lib/captura/contextoDoClique.ts`). Com ele, o VAD e a
   * sonda de nível não criam contexto nenhum — no iPhone, um criado depois dos `await` pode ficar
   * 'suspended' e a captura não recebe um quadro. A captura passa a ser a dona: o `stop` o fecha.
   */
  audioContext?: AudioContext;
}

// Escolhe um container/codec de áudio suportado pelo MediaRecorder deste navegador.
function pickRecorderMime(): string {
  const MR = (globalThis as any).MediaRecorder;
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of cands) if (MR?.isTypeSupported?.(c)) return c;
  return '';
}

// ─────────────────── Aquisição SERIALIZADA do getDisplayMedia ───────────────────
// No Windows/Chrome a fonte de áudio de loopback (WASAPI) é ÚNICA: duas chamadas de
// getDisplayMedia em sequência colidem e a segunda lança NotReadableError ("Could not start
// audio source") — mesmo para áudio de ABA, que sozinho funciona. Antes o "Testar" (probe) e o
// "Iniciar" (capture) abriam getDisplayMedia de forma independente e colidiam. Aqui garantimos:
//   (1) no máximo UM stream de display vivo por vez (para o anterior antes de adquirir);
//   (2) um respiro (~600ms) após liberar, dando tempo do SO soltar a fonte;
//   (3) serialização (lock) para nunca ter duas aquisições em voo.
let activeDisplayStream: MediaStream | null = null;
let lastDisplayReleaseTs = 0;
let displayAcquireLock: Promise<void> = Promise.resolve();
const DISPLAY_RELEASE_COOLDOWN_MS = 600;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Encerra o stream de display ativo (se houver) e marca o instante de liberação. */
function releaseActiveDisplayStream(): void {
  if (activeDisplayStream) {
    activeDisplayStream.getTracks().forEach((t) => t.stop());
    activeDisplayStream = null;
    lastDisplayReleaseTs = performance.now();
  }
}

/* LOOPBACK POR PROCESSO (causa provada em 2026-09-27; relatório em
   openspec/audits/2026-09-27-audio-do-sistema/relatorio.md).

   Sem `restrictOwnAudio`, o Chrome abre o áudio de JANELA/TELA pelo loopback do WASAPI do
   dispositivo de saída padrão (deviceId "loopback") e pede ESTÉREO, 48 kHz. Numa saída configurada
   como 5.1/7.1 (comum em placas Realtek e headsets "7.1") o Windows recusa esse formato no loopback:
   `IAudioClient::Initialize` → 0x88890008 (AUDCLNT_E_UNSUPPORTED_FORMAT) e o getDisplayMedia rejeita
   com NotReadableError "Could not start audio source". Reproduzido no Chrome 153 com `audio: true`
   numa página vazia, então NENHUMA constraint de DSP muda o resultado (a antiga repetição "modo
   compatível" só reabria o seletor para falhar igual, e saiu).

   Com `restrictOwnAudio: true` o Chrome usa o loopback POR PROCESSO do Windows
   (deviceId "loopbackWithoutChrome", excluindo a árvore de processos do próprio Chrome), que
   entrega estéreo em qualquer layout de saída: janela e tela voltaram a abrir com sinal. O preço:
   o som que toca DENTRO do Chrome (outra aba, o próprio Babel lendo em voz alta) não entra. Para
   o Babel isso é bônus (não transcreve a própria voz sintetizada); para um vídeo numa aba, o caminho
   certo sempre foi compartilhar a ABA, e a captura de aba ignora `restrictOwnAudio` ("Tab audio").

   `suppressLocalAudioPlayback: false` mantém o som no alto-falante; `echoCancellation`,
   `noiseSuppression` e `autoGainControl` desligados porque o que chega é música, jogo, a voz já
   processada pelo app de chamada: o DSP de conferência come consoantes e bombeia o volume. */
/* O VÍDEO VEM NO MÍNIMO. A API exige `video` (não existe getDisplayMedia só de áudio) e a faixa de
   vídeo NÃO pode ser parada: na "Tela inteira" pará-la encerra o áudio do sistema junto (ver o
   comentário em `startSystemAudioCapture`). Mas ninguém aqui consome os quadros — e o navegador
   captura, redimensiona e mantém cada um na taxa pedida. Com `video: true` isso é a tela cheia a
   30 quadros/s (cópia de GPU, conversão de cor) só para ser jogado fora: peso real num Quest ou num
   notebook fraco. 1 quadro/s em até 640×360 mantém o compartilhamento vivo quase de graça.
   Quando um recurso de visão precisar da imagem, `applyConstraints` na faixa sobe a taxa e a
   resolução sem pedir o compartilhamento de novo. */
const QUALIDADE_DO_VIDEO_DA_TELA = { frameRate: { max: 1 }, width: { max: 640 }, height: { max: 360 } } as const;

function constraintsDeDisplay(): MediaStreamConstraints {
  return {
    video: { ...QUALIDADE_DO_VIDEO_DA_TELA },
    audio: {
      suppressLocalAudioPlayback: false,
      restrictOwnAudio: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    } as MediaTrackConstraints,
    systemAudio: 'include',
    monitorTypeSurfaces: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  } as MediaStreamConstraints;
}

/* MEMÓRIA DO APARELHO. Quando o Windows recusa o áudio da janela/tela, o app lembra (neste
   navegador) para orientar ANTES do próximo clique: "aqui, prefira a aba ou o loopback". Esquece
   assim que uma janela/tela volta a entregar áudio. Armazenamento indisponível = sem memória. */
const CHAVE_FALHA_DO_AUDIO_DA_TELA = 'babel.captura.audioDaTelaFalhou';

function lembrarFalhaDoAudioDaTela(falhou: boolean): void {
  try {
    if (falhou) localStorage.setItem(CHAVE_FALHA_DO_AUDIO_DA_TELA, String(Date.now()));
    else localStorage.removeItem(CHAVE_FALHA_DO_AUDIO_DA_TELA);
  } catch {
    /* modo privado / armazenamento bloqueado: segue sem memória */
  }
}

/** true se o áudio de janela/tela já foi recusado pelo Windows neste navegador. */
export function audioDaTelaFalhouNesteAparelho(): boolean {
  try {
    return localStorage.getItem(CHAVE_FALHA_DO_AUDIO_DA_TELA) != null;
  } catch {
    return false;
  }
}

/** Texto curto do erro tipado AUDIO_DA_TELA_INDISPONIVEL (a UI mostra o guia com os botões). */
export const MSG_AUDIO_DA_TELA_INDISPONIVEL =
  'O Windows não liberou o áudio desta janela/tela. Use a aba do Chrome (com "compartilhar áudio da guia") ou o dispositivo de loopback.';

/**
 * Traduz a rejeição do getDisplayMedia num erro com `code` para a UI. Sem stream não há
 * `displaySurface`: quem diz se foi o ÁUDIO ou a IMAGEM que não abriu é a mensagem do Chrome
 * ("Could not start audio source" × "Could not start video source").
 */
function erroDaAquisicao(err: unknown): Error {
  const nome = (err as Error)?.name;
  const texto = String((err as Error)?.message ?? '');
  if (nome === 'NotAllowedError') {
    return new Error('Compartilhamento cancelado ou bloqueado. Clique novamente e escolha uma ABA/TELA com áudio.');
  }
  if (nome === 'NotReadableError' || nome === 'AbortError' || nome === 'OverconstrainedError') {
    if (/video/i.test(texto)) {
      const e = new Error(
        'O Windows não liberou a imagem desta janela/tela. Escolha outra janela, a tela inteira ou uma aba do Chrome.',
      ) as Error & { code?: string };
      e.code = 'TELA_INDISPONIVEL';
      return e;
    }
    lembrarFalhaDoAudioDaTela(true);
    const e = new Error(MSG_AUDIO_DA_TELA_INDISPONIVEL) as Error & { code?: string };
    e.code = 'AUDIO_DA_TELA_INDISPONIVEL';
    return e;
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** A janela/tela entregou áudio: a falha lembrada deixou de valer. A ABA não prova nada. */
function registrarSuperficieComAudio(surface: string | undefined, faixasDeAudio: number): void {
  if (faixasDeAudio > 0 && (surface === 'monitor' || surface === 'window')) lembrarFalhaDoAudioDaTela(false);
}

/**
 * Adquire um MediaStream de display (`getDisplayMedia`) de forma segura: espera qualquer
 * aquisição anterior terminar, libera o stream anterior, respeita o cooldown de liberação e só
 * então chama getDisplayMedia — UMA vez por clique. Registra o resultado como `activeDisplayStream`
 * para o próximo chamador poder liberá-lo. É este ponto único que elimina a colisão probe→start.
 * A rejeição sobe CRUA (DOMException); quem traduz para a UI é `erroDaAquisicao`.
 */
export async function acquireDisplayStream(): Promise<MediaStream> {
  const prior = displayAcquireLock;
  let release!: () => void;
  displayAcquireLock = new Promise<void>((r) => {
    release = r;
  });
  try {
    await prior; // serializa: uma aquisição por vez
    releaseActiveDisplayStream();
    const since = performance.now() - lastDisplayReleaseTs;
    if (lastDisplayReleaseTs && since < DISPLAY_RELEASE_COOLDOWN_MS) {
      await sleep(DISPLAY_RELEASE_COOLDOWN_MS - since);
    }
    /* CONSTRAINTS (ver `constraintsDeDisplay`):
       - systemAudio: 'include' — o Chrome OFERECE "áudio do sistema" na Tela inteira e na Janela;
       - monitorTypeSurfaces: 'include' — garante a aba "Tela inteira" no seletor;
       - selfBrowserSurface: 'exclude' — tira a própria janela do Babel do seletor (eco garantido);
       - surfaceSwitching: 'include' — deixa trocar de aba no meio sem reabrir o seletor;
       - audio.restrictOwnAudio — o loopback por processo, que abre em saídas 5.1/7.1. */
    const stream = await navigator.mediaDevices.getDisplayMedia(constraintsDeDisplay());
    activeDisplayStream = stream;
    return stream;
  } finally {
    release();
  }
}

/** O que o dono do decode especulativo devolve: a captura só sabe cancelá-lo (a fala continuou). */
export interface EspeculacaoDoFinal {
  cancelar(): void;
}

export interface SystemAudioCallbacks {
  /**
   * Fim da fala (VAD) → enunciado PCM completo (autoritativo, com pré-pad). `especulacao` vem quando
   * o decode especulativo desta fala foi feito sobre EXATAMENTE este `pcm` (ver `espelhoDoVad.ts`):
   * o resultado dele É o final, não há o que decodificar de novo.
   */
  onUtterance: (pcm: Float32Array, sampleRate: number, seq: number, especulacao?: EspeculacaoDoFinal) => void;
  /**
   * ~450 ms de silêncio dentro da fala: começa o decode final JÁ, sobre a janela que o VAD vai
   * entregar se fechar (o segmento continua aberto; a redenção segue em 800 ms). Devolve o handle do
   * decode, ou `null` para não especular (nuvem, modelo carregando). Se a fala voltar, `cancelar()`.
   */
  onFinalEspeculativo?: (pcm: Float32Array, sampleRate: number, seq: number) => EspeculacaoDoFinal | null;
  /** Início da fala → `seq` monotônico do enunciado (para mapear parciais/final na UI). */
  onSpeechStart?: (seq: number) => void;
  /**
   * PARCIAL: buffer da fala ATÉ AGORA (cresce a cada tick ~1s enquanto se fala) — permite
   * transcrever incrementalmente e exibir "em tempo real" em vez de esperar a fala fechar.
   */
  onPartialAudio?: (pcm: Float32Array, sampleRate: number, seq: number) => void;
  onMisfire?: (seq: number) => void;
  onError?: (err: Error) => void;
  onStatus?: (msg: string) => void;
  /** Nível de áudio em tempo real (0..1, ~20 fps) — alimenta o waveform e o diagnóstico de sinal. */
  onLevel?: (level: number) => void;
}

/* Limiares e tempos do Silero — constantes porque o espelho do final especulativo (`espelhoDoVad.ts`)
   precisa dos MESMOS números que a biblioteca usa. O porquê de cada um está na configuração do VAD. */
const LIMIAR_DE_FALA = 0.5;
const LIMIAR_DE_SILENCIO = 0.35;
export const REDENCAO_MS = 800;
const PRE_FALA_MS = 300;
/**
 * Silêncio a partir do qual o decode FINAL começa, especulativo, dentro dos 800 ms da redenção. A
 * segmentação não muda (continua fechando em 800 ms); só o decode começa antes. Com quadros de 96 ms
 * isto são 4 quadros (384 ms): o final ganha ~0,38 s em toda fala que termina.
 */
export const ESPECULATIVO_MS = 450;

// Cadência dos parciais: reprocessa o buffer-até-agora a cada ~1.1s enquanto a fala continua.
const PARTIAL_INTERVAL_MS = 1100;
// Com que frequência o relógio dos parciais olha o buffer (o 1º parcial não espera o intervalo).
const PARTIAL_TICK_MS = 200;
// Só emite um parcial quando acumulou pelo menos este tanto de áudio NOVO (evita decodes minúsculos).
const PARTIAL_MIN_NEW_SAMPLES = 16000 * 0.6; // ~0,6s @ 16 kHz

/**
 * Núcleo compartilhado da captura: recebe um `MediaStream` já obtido (do sistema via
 * getDisplayMedia OU do microfone via getUserMedia) e monta o pipeline Silero VAD →
 * enunciado PCM (Float32Array a 16 kHz) + parciais + gravação MediaRecorder. É o
 * equivalente web do WASAPI loopback → Silero VAD do desktop.
 *
 * `fullStream` é o stream ORIGINAL (pode conter vídeo, no caso do sistema) — mantido
 * vivo durante a captura e parado só no `stop()`. `audioStream` é o áudio-only usado
 * pelo VAD e pelo MediaRecorder.
 */
async function startCaptureFromStream(
  fullStream: MediaStream,
  audioStream: MediaStream,
  cb: SystemAudioCallbacks,
  label: 'system' | 'mic',
  opcoes: OpcoesDeCaptura = {},
): Promise<AudioCapture> {
  // GRAVA o áudio da sessão com MediaRecorder — é o que o player do Analysis reproduz
  // depois ("dar play e ouvir") com waveform real. Best-effort: se falhar, seguimos sem áudio.
  let recorder: MediaRecorder | null = null;
  const recChunks: Blob[] = [];
  const recMime = pickRecorderMime();
  // ORIGEM do áudio salvo (t=0 do blob). Fica no instante em que recorder.start() dispara — é o
  // que a UI usa para ancorar as legendas. Fallback: agora (sem recorder não há áudio p/ alinhar).
  let startedAtMs = Date.now();
  try {
    recorder = new MediaRecorder(audioStream, {
      ...(recMime ? { mimeType: recMime } : {}),
      audioBitsPerSecond: TAXA_DE_BITS_DA_GRAVACAO,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) recChunks.push(e.data);
    };
    recorder.start(1000); // timeslice → chunks periódicos (não perde tudo se algo falhar)
    startedAtMs = Date.now(); // t=0 REAL da gravação, captura AQUI, não no clique em START
    vlog(label, 'MediaRecorder gravando (', recMime || 'default', ')');
  } catch (e) {
    vlog(label, 'MediaRecorder indisponível:', String(e));
    recorder = null;
  }

  // SONDA DE NÍVEL (RMS via AnalyserNode): alimenta o waveform em tempo real E é o DIAGNÓSTICO
  // chave — distingue "faixa presente mas SILENCIOSA" (loopback do sistema não está fluindo) de
  // "faixa com sinal". Usa setInterval (não rAF) p/ continuar medindo mesmo com a aba em segundo plano.
  // MUDO: faixa desabilitada, captura viva. Ver `AudioCapture.setMuted`.
  let muted = false;
  // PAUSA: gravador e VAD parados, faixa e compartilhamento vivos. Ver `AudioCapture.setPaused`.
  let paused = false;

  let levelCtx: AudioContext | null = null;
  let levelTimer: any = null;
  try {
    levelCtx = opcoes.audioContext ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    // O contexto do clique já pediu `resume()` dentro do gesto; pedir de novo não custa nada.
    if (levelCtx.state === 'suspended') void Promise.resolve(levelCtx.resume?.()).catch(() => {});
    const analyser = levelCtx.createAnalyser();
    analyser.fftSize = 512;
    levelCtx.createMediaStreamSource(audioStream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let peak = 0;
    let reported = false;
    levelTimer = setInterval(() => {
      if (paused) return; // pausado: o waveform fica parado, e o silêncio não vira diagnóstico
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      peak = Math.max(peak, rms);
      cb.onLevel?.(Math.min(1, rms * 4)); // 0..1 aprox. p/ o waveform
      /* Diagnóstico único após ~2,5s: chegou algum sinal na faixa?
         MUDO não conta como defeito. Sem esta guarda, mutar o microfone nos primeiros
         segundos dispararia "⚠ O microfone está SILENCIOSO" — culpando o dispositivo por
         um silêncio que a própria pessoa pediu. Adiado, não cancelado: o teste roda quando
         a faixa voltar a valer. */
      if (!reported && !muted && performance.now() - t0 > 2500) {
        reported = true;
        vlog(label, 'pico RMS em 2,5s:', peak.toFixed(4));
        if (peak < 0.0015) {
          cb.onStatus?.(
            label === 'system'
              ? '⚠ A faixa de áudio do sistema existe, mas está SILENCIOSA (nível ~0). Confirme que marcou "Compartilhar o áudio do sistema/aba" e que algo está de fato tocando.'
              : '⚠ O microfone está SILENCIOSO (nível ~0). Verifique o dispositivo de entrada escolhido e o volume do microfone no Windows.',
          );
        }
      }
    }, 50);
  } catch (e) {
    vlog(label, 'sonda de nível indisponível:', String(e));
  }

  // Silero VAD sobre o áudio. Assets auto-hospedados em /public. O Silero só fecha um
  // segmento no SILÊNCIO; num áudio sem pausas isso vira um bloco gigante e lento —
  // cortamos à força falas contínuas > maxSpeechMs() para manter o retorno responsivo. O teto
  // depende do motor final (ver MAX_SPEECH_MS_LOCAL/NUVEM) e vem por opção, lido a cada quadro.
  const maxSpeechMs = (): number => {
    const v = opcoes.maxSpeechMs?.();
    return typeof v === 'number' && v > 0 ? v : MAX_SPEECH_MS_LOCAL;
  };
  let speechStartTs = 0;
  let forcingCut = false;
  /*
   * `let` e não `const`, apesar do que o lint pede.
   *
   * `vad` é referenciado DENTRO do objeto de configuração passado a `MicVAD.new` — o corte forçado
   * chama `vad.pause()`/`vad.start()`. Declarar como `const` na atribuição funcionaria enquanto os
   * callbacks só rodassem depois da construção, mas se a biblioteca invocar qualquer um deles de
   * forma síncrona durante o `new`, a referência cai na TDZ e a captura de áudio quebra em tempo de
   * execução — algo que nenhum teste daqui pega. Declarar antes e atribuir depois é imune a isso.
   */
  let vad: MicVAD;

  // Estado do enunciado em andamento (para partials + seq).
  let seqCounter = 0;
  let currentSeq = 0;
  let speaking = false;
  let frameChunks: Float32Array[] = [];
  let accumSamples = 0;
  let lastPartialSamples = 0;

  /* FINAL ESPECULATIVO (ver `espelhoDoVad.ts`): o espelho reproduz o buffer do VAD quadro a quadro e
     avisa quando o silêncio passa de `ESPECULATIVO_MS`; a janela daquele instante é decodificada já.
     No fim da fala, se o áudio do VAD começa EXATAMENTE por ela, o final é a janela especulativa (e o
     decode dela, já em andamento ou pronto); senão, o de sempre. */
  const espelho = new EspelhoDoVad({
    positiveSpeechThreshold: LIMIAR_DE_FALA,
    negativeSpeechThreshold: LIMIAR_DE_SILENCIO,
    redemptionMs: REDENCAO_MS,
    preSpeechPadMs: PRE_FALA_MS,
    especulativoMs: ESPECULATIVO_MS,
  });
  let especulacao: { seq: number; janela: Float32Array; handle: EspeculacaoDoFinal } | null = null;
  const cancelarEspeculacao = (): void => {
    especulacao?.handle.cancelar();
    especulacao = null;
  };

  const resetUtterance = (): void => {
    frameChunks = [];
    accumSamples = 0;
    lastPartialSamples = 0;
  };
  const concatFrames = (): Float32Array => {
    const out = new Float32Array(accumSamples);
    let o = 0;
    for (const c of frameChunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };

  /* DESFAZ o que já foi aberto se o detector não subir. Sem isto, uma falha no `MicVAD.new`
     (assets do VAD/ONNX ausentes — 404 em `/silero_vad_legacy.onnx`) deixava o gravador, a sonda
     de nível e o compartilhamento de tela vivos: a tela voltava a "Iniciar captura", a barra do
     navegador seguia "compartilhando", e a sonda órfã avisava "faixa SILENCIOSA" 2,5 s depois,
     apontando o problema no lugar errado. Ver `tests/captura-vad-falha.test.ts`. */
  const desfazerAbertura = async (): Promise<void> => {
    if (levelTimer) clearInterval(levelTimer);
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* já parado */
    }
    try {
      await levelCtx?.close();
    } catch {
      /* já fechado */
    }
    cb.onLevel?.(0);
    fullStream.getTracks().forEach((t) => t.stop());
  };

  vlog(label, 'criando Silero VAD sobre o áudio…');
  try {
    vad = await MicVAD.new({
      baseAssetPath: '/',
      onnxWASMBasePath: '/',
      model: 'legacy', // usa /silero_vad_legacy.onnx
      // O contexto do clique (se veio): o VAD não cria o dele, e não o fecha (não é dele).
      ...(opcoes.audioContext ? { audioContext: opcoes.audioContext } : {}),
      getStream: () => Promise.resolve(audioStream),
      pauseStream: async () => {},
      resumeStream: async (s) => s,
      submitUserSpeechOnPause: true, // pause() entrega o áudio acumulado, usado no corte forçado
      positiveSpeechThreshold: LIMIAR_DE_FALA,
      negativeSpeechThreshold: LIMIAR_DE_SILENCIO,
      /* 800 ms de silêncio antes de fechar a fala (era 450). MEDIDO na bancada de 2026-09 (FLEURS
         pt, 100 falas, o mesmo Silero e FrameProcessor): com 450 ms uma frase lida de ~12,6 s saía
         em 2,57 pedaços — cada respiração virava um enunciado; com 800 ms, 1,12. Duas coisas
         melhoram juntas: o WER local cai de 20,5% para 18,0% (o modelo recebe a frase, não o
         fragmento) e o STT de nuvem, que cobra no mínimo 10 s por requisição, passa de 2,06× para
         1,08× o tempo real de fala — metade do custo. O preço é a legenda FINAL chegar ~0,35 s
         depois; a parcial continua saindo durante a fala. 1200 ms não melhora mais nada. */
      redemptionMs: REDENCAO_MS,
      preSpeechPadMs: PRE_FALA_MS, // prepende 0,3s → não corta o INÍCIO das sentenças
      minSpeechMs: 400, // descarta ruídos < 0,4s (era 250: ruído curto virava frase inventada)
      onSpeechStart: () => {
        speechStartTs = performance.now();
        currentSeq = ++seqCounter;
        speaking = true;
        resetUtterance();
        vlog(label, 'VAD → início de fala (seq', currentSeq, ')');
        cb.onSpeechStart?.(currentSeq);
      },
      onFrameProcessed: (probs, frame) => {
        if (speaking && frame && frame.length) {
          frameChunks.push(frame.slice());
          accumSamples += frame.length;
        }
        if (frame && frame.length) {
          const evento = espelho.quadro(probs.isSpeech, frame);
          if (evento === 'cancelar') {
            // A fala voltou antes da redenção: o decode especulativo não vale mais.
            cancelarEspeculacao();
          } else if (evento === 'especular' && speaking && !muted && !paused && cb.onFinalEspeculativo) {
            cancelarEspeculacao();
            const janela = espelho.janela();
            // Cópia para o worker (o buffer é transferido); a nossa fica para conferir no fim.
            const handle = cb.onFinalEspeculativo(janela.slice(), 16000, currentSeq);
            if (handle) especulacao = { seq: currentSeq, janela, handle };
          }
        }
        const teto = maxSpeechMs();
        if (!forcingCut && speechStartTs && performance.now() - speechStartTs >= teto) {
          forcingCut = true;
          speechStartTs = performance.now();
          vlog(label, 'VAD → corte forçado (fala contínua > ' + teto + 'ms)');
          Promise.resolve(vad.pause())
            // Uma pausa pedida no meio do corte vence: o VAD não volta sozinho.
            .then(() => (paused ? undefined : vad.start()))
            .catch(() => {})
            .finally(() => {
              forcingCut = false;
            });
        }
      },
      onVADMisfire: () => {
        espelho.reiniciar();
        cancelarEspeculacao();
        speaking = false;
        vlog(label, 'VAD → misfire (ruído curto, ignorado), seq', currentSeq);
        cb.onMisfire?.(currentSeq);
        resetUtterance();
      },
      onSpeechEnd: (audio: Float32Array) => {
        speaking = false;
        speechStartTs = 0;
        vlog(label, 'VAD → fim de fala (seq', currentSeq, '):', audio.length, 'amostras');
        espelho.reiniciar();
        const esp = especulacao;
        especulacao = null;
        if (esp && esp.seq === currentSeq && ehPrefixo(esp.janela, audio)) {
          // O decode especulativo foi feito sobre o começo EXATO deste áudio: ele é o final.
          vlog(
            label,
            'final especulativo aproveitado (',
            audio.length - esp.janela.length,
            'amostras de silêncio a menos)',
          );
          cb.onUtterance(esp.janela, 16000, currentSeq, esp.handle);
        } else {
          esp?.handle.cancelar();
          cb.onUtterance(audio, 16000, currentSeq);
        }
        resetUtterance();
      },
    });
  } catch (e) {
    vlog(label, 'Silero VAD NÃO subiu:', String(e));
    await desfazerAbertura();
    throw new Error(
      'O detector de fala não pôde ser carregado, então a captura não começou. Os arquivos dele ' +
        '(silero_vad_legacy.onnx e ort-wasm) não estão sendo servidos pelo app. Recarregue a página; ' +
        'se continuar, quem instalou o app precisa rodar "npm install" (que os copia para public/).',
    );
  }

  vad.start();
  vlog(label, 'VAD iniciado ✓');

  // Tick de PARCIAIS: enquanto se fala, transcreve o buffer-até-agora (rolling partial).
  /* O PRIMEIRO PARCIAL SAI ASSIM QUE HÁ 0,6 s DE FALA, e não no próximo tique de 1,1 s. Medido na
     auditoria de latência (2026-09-26): o 1º texto aparecia 2,6 s depois do início da fala — o tique
     de 1,1 s, mais os 0,6 s de áudio novo, mais o decode. O relógio agora olha a cada 200 ms; o
     espaçamento ENTRE parciais continua 1,1 s (o custo por fala não muda). */
  let ultimoParcialTs = 0;
  const partialTimer: any = setInterval(() => {
    if (!speaking || !cb.onPartialAudio) return;
    // O final especulativo desta fala já está no worker: um parcial agora só o atrasaria.
    if (especulacao?.seq === currentSeq) return;
    if (accumSamples - lastPartialSamples < PARTIAL_MIN_NEW_SAMPLES) return;
    const primeiro = lastPartialSamples === 0;
    if (!primeiro && performance.now() - ultimoParcialTs < PARTIAL_INTERVAL_MS) return;
    lastPartialSamples = accumSamples;
    ultimoParcialTs = performance.now();
    const soFar = concatFrames();
    vlog(label, 'VAD → parcial (seq', currentSeq, '):', soFar.length, 'amostras');
    cb.onPartialAudio(soFar, 16000, currentSeq);
  }, PARTIAL_TICK_MS);

  // Detecta quando a faixa de áudio encerra (usuário parou o compartilhamento / desplugou o mic).
  const audioTracks = audioStream.getAudioTracks();
  audioTracks[0]?.addEventListener('ended', () => {
    vlog(label, 'faixa de áudio encerrada');
    cb.onStatus?.(label === 'mic' ? 'Microfone desconectado.' : 'Compartilhamento de áudio encerrado pelo usuário.');
  });

  return {
    startedAtMs,
    trilhaDeAudio: audioTracks[0],
    setMuted(next: boolean): void {
      if (next === muted) return;
      muted = next;
      // A faixa para de entregar áudio: o recorder grava silêncio e o VAD não vê fala.
      audioTracks.forEach((t) => {
        t.enabled = !next;
      });
      if (next) {
        /* Descarta o enunciado EM CURSO. Mutar no meio de uma frase deixaria um parcial
           pendurado na tela para sempre — o VAD nunca fecharia um segmento que agora só
           recebe silêncio. */
        speaking = false;
        speechStartTs = 0;
        resetUtterance();
        espelho.reiniciar();
        cancelarEspeculacao();
        cb.onMisfire?.(currentSeq);
        cb.onLevel?.(0);
      }
      vlog(label, next ? 'MUDO (faixa desabilitada, gravação segue)' : 'ATIVO');
    },
    setPaused(next: boolean): void {
      if (next === paused) return;
      paused = next;
      if (next) {
        try {
          if (recorder?.state === 'recording') recorder.pause();
        } catch {
          /* gravador sem pausa: segue gravando, o áudio não se perde */
        }
        /* `submitUserSpeechOnPause`: a frase em curso é ENTREGUE (vira fala), não descartada. */
        try {
          void Promise.resolve(vad.pause()).catch(() => {});
        } catch {
          /* ignore */
        }
        speechStartTs = 0;
        cb.onLevel?.(0);
      } else {
        try {
          if (recorder?.state === 'paused') recorder.resume();
        } catch {
          /* ignore */
        }
        try {
          void Promise.resolve(vad.start()).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      vlog(label, next ? 'PAUSADA (gravador e VAD parados, faixa viva)' : 'RETOMADA');
    },
    async stop(): Promise<Blob | null> {
      clearInterval(partialTimer);
      speaking = false;
      // Finaliza a gravação ANTES de parar as faixas (senão perde o último chunk).
      let blob: Blob | null = null;
      // Com PRAZO (`pararGravador`): um `onstop` que não chega segurava o fim da captura para sempre.
      if (recorder && recorder.state !== 'inactive') blob = await pararGravador(recorder, recChunks, recMime);
      try {
        vad.pause();
      } catch {
        /* ignore */
      }
      try {
        (vad as any).destroy?.();
      } catch {
        /* ignore */
      }
      if (levelTimer) clearInterval(levelTimer);
      try {
        await levelCtx?.close();
      } catch {
        /* ignore */
      }
      cb.onLevel?.(0);
      fullStream.getTracks().forEach((t) => t.stop());
      return blob;
    },
  };
}

/**
 * Captura o áudio do SISTEMA/aba via getDisplayMedia (video:true é OBRIGATÓRIO pela API).
 * Para Discord/jogos/apps externos: o usuário escolhe "Tela inteira" e marca "compartilhar
 * áudio do sistema" (capta o mix do SO, menos o som do próprio Chrome: ver `constraintsDeDisplay`).
 * Para conteúdo numa aba: escolhe a aba + "áudio da aba". A Janela, no Chrome recente, oferece o
 * mesmo "áudio do sistema".
 */
export async function startSystemAudioCapture(
  cb: SystemAudioCallbacks,
  opcoes?: OpcoesDeCaptura,
): Promise<AudioCapture> {
  try {
    let stream: MediaStream;
    try {
      vlog('solicitando getDisplayMedia… (escolha ABA, JANELA ou TELA e marque compartilhar áudio)');
      // Aquisição serializada (ver acquireDisplayStream): um único stream de display por vez, com
      // cooldown de liberação — impede a colisão probe→start que causava NotReadableError na aba.
      stream = await acquireDisplayStream();
    } catch (err) {
      vlog('getDisplayMedia rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
      releaseActiveDisplayStream();
      throw erroDaAquisicao(err);
    }

    // Verifica áudio + QUAL superfície foi compartilhada (para orientar o usuário com precisão).
    const videoTrack = stream.getVideoTracks()[0];
    const surface = (videoTrack?.getSettings?.() as any)?.displaySurface as string | undefined;
    const audioTracks = stream.getAudioTracks();
    vlog('superfície:', surface ?? '?', '| vídeo:', stream.getVideoTracks().length, '| áudio:', audioTracks.length);
    registrarSuperficieComAudio(surface, audioTracks.length);
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      let msg: string;
      if (surface === 'window') {
        msg =
          'A JANELA veio sem áudio. Escolha de novo e ative "Compartilhar áudio do sistema" (Chrome recente oferece na Janela) ou use a TELA INTEIRA ou uma aba.';
      } else if (surface === 'monitor') {
        msg =
          'Você compartilhou a Tela, mas NÃO marcou "Também compartilhar o áudio do sistema". Clique de novo e ATIVE essa opção (o botão fica no canto inferior esquerdo da janela de seleção).';
      } else {
        msg =
          'Nenhum áudio foi compartilhado. Escolha uma ABA (marque "áudio da aba") ou a TELA INTEIRA (marque "áudio do sistema"). Uma JANELA não tem áudio.';
      }
      vlog('SEM faixa de áudio ✗ (superfície:', surface, ')');
      // Erro TIPADO: o LiveCapture usa o código para abrir o guia com botão "Escolher de novo"
      // (repetir o picker exige um novo gesto do usuário — não dá para reabrir sozinho).
      const err = new Error(msg) as Error & { code?: string };
      err.code = surface === 'window' ? 'JANELA_SEM_AUDIO' : 'SEM_AUDIO_COMPARTILHADO';
      throw err;
    }
    vlog('faixa de áudio ✓ (superfície:', surface, '),', audioTracks[0].label || '(sem rótulo)');

    // NÃO paramos a faixa de vídeo: em "Tela inteira", parar o vídeo ENCERRA o áudio do
    // sistema junto. Mantemos o stream vivo (fullStream) e usamos só o áudio no pipeline.
    const audioStream = new MediaStream(audioTracks);
    const capture = await startCaptureFromStream(stream, audioStream, cb, 'system', opcoes);
    // Ao parar, também limpamos a referência do singleton e marcamos a liberação (cooldown),
    // para que uma nova aquisição respeite o respiro do WASAPI.
    return {
      startedAtMs: capture.startedAtMs,
      trilhaDeAudio: capture.trilhaDeAudio,
      setMuted: (m) => capture.setMuted(m),
      setPaused: (p) => capture.setPaused(p),
      async stop(): Promise<Blob | null> {
        const blob = await capture.stop();
        if (activeDisplayStream === stream) {
          activeDisplayStream = null;
          lastDisplayReleaseTs = performance.now();
        }
        return blob;
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(error);
    throw error;
  }
}

/**
 * Captura o MICROFONE (sua voz) via getUserMedia, no MESMO pipeline VAD+Whisper do
 * sistema — assim honra o dispositivo de entrada escolhido, funciona offline e é
 * consistente. `deviceId` vazio/ausente = microfone padrão do SO.
 */
export async function startMicCapture(
  deviceId: string | undefined,
  cb: SystemAudioCallbacks,
  opcoes?: OpcoesDeCaptura,
): Promise<AudioCapture> {
  try {
    let stream: MediaStream;
    try {
      vlog('solicitando getUserMedia(mic) deviceId=', deviceId || '(padrão)');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          // Para a própria voz, o processamento AJUDA (fala mais limpa p/ o Whisper).
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      vlog('getUserMedia(mic) rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
      /* `nomeDoErro`: o nome do DOMException fica no erro traduzido — a tela classifica a falha por
         ele (`ajudaDoMicrofone.ts`) e mostra os passos do aparelho, sem ler o texto. */
      const nomeDoErro = (err as Error)?.name;
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        throw Object.assign(
          new Error('Permissão do microfone negada. Ative o microfone nas permissões do navegador.'),
          {
            nomeDoErro,
          },
        );
      }
      if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
        throw Object.assign(new Error('Microfone escolhido não encontrado. Selecione outro dispositivo de entrada.'), {
          nomeDoErro,
        });
      }
      throw err;
    }
    return await startCaptureFromStream(stream, stream, cb, 'mic', opcoes);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(error);
    throw error;
  }
}

/**
 * Captura o áudio do SISTEMA por um dispositivo de ENTRADA de LOOPBACK (Windows "Stereo Mix"
 * ou driver virtual VB-Audio Cable/VoiceMeeter) via getUserMedia — a rota CONFIÁVEL para
 * Discord/jogos/o sistema inteiro dentro do navegador. Como o loopback aparece como um microfone
 * comum, isso NUNCA dispara o NotReadableError do getDisplayMedia de tela. Rotulado como 'system'
 * (mesma direção de tradução e mesmo falante do áudio de sistema) e com TODO o processamento de
 * voz DESLIGADO — EC/NS/AGC estragariam música/áudio de jogo. `deviceId` vazio cai no default
 * (útil só se o default do SO já for um loopback).
 */
export async function startSystemLoopbackCapture(
  deviceId: string | undefined,
  cb: SystemAudioCallbacks,
  opcoes?: OpcoesDeCaptura,
): Promise<AudioCapture> {
  try {
    let stream: MediaStream;
    try {
      vlog('solicitando getUserMedia(loopback) deviceId=', deviceId || '(padrão)');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      vlog('getUserMedia(loopback) rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        throw new Error('Permissão de captura negada. Autorize o acesso ao dispositivo de áudio no navegador.');
      }
      if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
        throw new Error(
          'Dispositivo de loopback não encontrado. Habilite o "Stereo Mix" (Som → Gravação → Mostrar dispositivos desabilitados) ou instale o VB-Audio Cable, e selecione-o.',
        );
      }
      if (err instanceof DOMException && err.name === 'NotReadableError') {
        throw new Error(
          'O dispositivo de loopback existe mas não pôde ser aberto (outro app o segura, ou está em modo exclusivo). Feche apps que o usem e tente de novo.',
        );
      }
      throw err;
    }
    return await startCaptureFromStream(stream, stream, cb, 'system', opcoes);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(error);
    throw error;
  }
}

// ─────────────────── Rota SEM FRICÇÃO: loopback WASAPI do servidor local ───────────────────
// O servidor Node (local) captura o mix do dispositivo de reprodução padrão do Windows via
// WASAPI loopback e transmite Int16 mono 16 kHz por HTTP chunked (/api/audio/loopback/stream).
// Aqui convertemos esse fluxo num MediaStream SINTÉTICO (ScriptProcessor → MediaStreamDestination)
// e entramos no MESMO pipeline VAD→parciais→gravação do resto das rotas. Zero permissão de
// navegador, zero setup de dispositivo — mas só existe quando o app roda com o servidor local.

/** true se o servidor local expõe a captura de loopback (Windows + módulo nativo ok). */
export async function serverLoopbackSupported(): Promise<boolean> {
  try {
    const r = await apiFetch('/api/audio/loopback/support');
    if (!r.ok) return false;
    return !!(await r.json()).supported;
  } catch {
    return false;
  }
}

/**
 * Captura o áudio do sistema PELO SERVIDOR local. Consome o PCM (Int16 mono 16 kHz) do
 * endpoint de stream e o reproduz num grafo WebAudio mudo cuja saída é um MediaStream —
 * o que permite reusar `startCaptureFromStream` (VAD, parciais, MediaRecorder) sem forks.
 */
export async function startServerLoopbackCapture(
  cb: SystemAudioCallbacks,
  opcoes?: OpcoesDeCaptura,
): Promise<AudioCapture> {
  try {
    const resp = await apiFetch('/api/audio/loopback/stream', { timeoutMs: 24 * 3_600_000 });
    if (!resp.ok || !resp.body) {
      let msg = `Servidor recusou o stream de loopback (HTTP ${resp.status}).`;
      try {
        msg = (await resp.json()).error || msg;
      } catch {
        /* corpo não-JSON */
      }
      throw new Error(msg);
    }
    vlog('loopback do SERVIDOR conectado, montando grafo WebAudio (AudioWorklet)…');

    // Grafo: PCM → AudioWorklet (thread de ÁUDIO, zero-cópia via transferable) →
    // MediaStreamDestination (vira stream p/ o pipeline VAD). O ScriptProcessor anterior
    // rodava na MAIN THREAD e causava micro-travamentos durante jogos. O worklet também
    // faz o backpressure (~10s) do lado dele. Contexto a 16 kHz = 1:1 com o fio.
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule('/loopback-worklet.js');
    const dest = ctx.createMediaStreamDestination();
    const feeder = new AudioWorkletNode(ctx, 'loopback-feeder', { numberOfInputs: 0, outputChannelCount: [1] });
    feeder.connect(dest);

    // Bombeia o corpo HTTP → worklet (Int16 LE → Float32 −1..1, buffer transferido).
    const reader = resp.body.getReader();
    let stopped = false;
    (async () => {
      try {
        let carry: Uint8Array | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped) break;
          if (!value || !value.length) continue;
          // Anotado porque `carry` é alimentado a partir de `data` logo abaixo: sem o tipo escrito,
          // o compilador vê a inferência de `data` dependendo dela mesma.
          const data: Uint8Array = carry ? new Uint8Array([...carry, ...value]) : value;
          const usable: number = data.length - (data.length % 2);
          carry = usable < data.length ? data.slice(usable) : null;
          const i16 = new Int16Array(data.buffer, data.byteOffset, usable / 2);
          const f32 = new Float32Array(i16.length);
          for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
          feeder.port.postMessage(f32, [f32.buffer]); // transferable: zero-cópia p/ a thread de áudio
        }
      } catch (e) {
        if (!stopped) {
          vlog('loopback do SERVIDOR: stream interrompido:', String(e));
          cb.onStatus?.('A captura pelo servidor local foi interrompida.');
        }
      }
    })();

    const capture = await startCaptureFromStream(dest.stream, dest.stream, cb, 'system', opcoes);
    return {
      startedAtMs: capture.startedAtMs,
      setMuted: (m) => capture.setMuted(m),
      setPaused: (p) => capture.setPaused(p),
      async stop(): Promise<Blob | null> {
        stopped = true;
        try {
          await reader.cancel();
        } catch {
          /* já cancelado */
        }
        const blob = await capture.stop();
        try {
          feeder.disconnect();
        } catch {
          /* já desconectado */
        }
        try {
          await ctx.close();
        } catch {
          /* já fechado */
        }
        return blob;
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(error);
    throw error;
  }
}

/**
 * DIAGNÓSTICO da rota do SERVIDOR: lê ~2s do stream de PCM e mede o pico direto nos samples
 * Int16 (sem WebAudio). Mesmo contrato dos outros probes, com `surface: 'server'`.
 */
export async function probeServerLoopback(): Promise<SystemAudioProbe> {
  if (!(await serverLoopbackSupported())) {
    throw new Error('O servidor local não expõe a captura de loopback (só Windows, com o módulo nativo instalado).');
  }
  const resp = await apiFetch('/api/audio/loopback/stream', { timeoutMs: 24 * 3_600_000 });
  if (!resp.ok || !resp.body) {
    let msg = `Servidor recusou o stream de loopback (HTTP ${resp.status}).`;
    try {
      msg = (await resp.json()).error || msg;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  const reader = resp.body.getReader();
  let peak = 0;
  let bytes = 0;
  const t0 = performance.now();
  try {
    while (performance.now() - t0 < 2000) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.length;
      const usable = value.length - (value.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const s = Math.abs((((value[i + 1] << 8) | value[i]) << 16) >> 16) / 32768;
        if (s > peak) peak = s;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* já cancelado */
    }
  }
  vlog('PROBE servidor → bytes:', bytes, '| pico:', peak.toFixed(4));
  return {
    surface: 'server',
    audioTrackCount: bytes > 0 ? 1 : 0,
    audioLabel: 'WASAPI loopback (servidor local)',
    peakLevel: +peak.toFixed(4),
    verdict: bytes === 0 ? 'no-audio-track' : peak < 0.0015 ? 'silent' : 'ok',
  };
}

/**
 * Mede o pico RMS de um stream por `ms` (~tick de 50ms) — núcleo compartilhado dos probes
 * "Testar" (tela e loopback). Devolve 0 se a sonda não puder ser criada.
 */
async function measurePeakRms(stream: MediaStream, ms = 2000): Promise<number> {
  let peak = 0;
  let ctx: AudioContext | null = null;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        peak = Math.max(peak, Math.sqrt(s / buf.length));
        if (performance.now() - t0 > ms) {
          clearInterval(iv);
          resolve();
        }
      }, 50);
    });
  } catch (e) {
    vlog('sonda de nível falhou:', String(e));
  }
  try {
    await ctx?.close();
  } catch {
    /* ignore */
  }
  return peak;
}

export interface SystemAudioProbe {
  /** 'browser' (aba) | 'window' (janela) | 'monitor' (tela inteira) | '?' */
  surface: string;
  audioTrackCount: number;
  audioLabel: string;
  /** Pico de nível RMS medido em ~2s (0..1). */
  peakLevel: number;
  /** ok = tem sinal; silent = faixa existe mas ~0; no-audio-track = nenhuma faixa de áudio. */
  verdict: 'ok' | 'silent' | 'no-audio-track';
}

/**
 * DIAGNÓSTICO de um clique: abre o seletor de compartilhamento, mede o pico de sinal por ~2s e
 * devolve um veredito estruturado — sem iniciar uma sessão. Serve para descobrir, no computador
 * REAL do usuário, se o problema é "não marcou o áudio / janela sem áudio" (no-audio-track),
 * "faixa existe mas o loopback não flui" (silent) ou "está tudo certo" (ok).
 */
export async function probeSystemAudio(): Promise<SystemAudioProbe> {
  let stream: MediaStream;
  try {
    stream = await acquireDisplayStream();
  } catch (err) {
    vlog('PROBE getDisplayMedia rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
    releaseActiveDisplayStream();
    // Mesmo diagnóstico do fluxo real (erro tipado + memória do aparelho).
    throw erroDaAquisicao(err);
  }
  const vTrack = stream.getVideoTracks()[0];
  const surface = ((vTrack?.getSettings?.() as any)?.displaySurface as string) ?? '?';
  const aTracks = stream.getAudioTracks();
  vlog('PROBE → superfície:', surface, '| áudio:', aTracks.length, '| label:', aTracks[0]?.label || '-');
  registrarSuperficieComAudio(surface, aTracks.length);
  if (aTracks.length === 0) {
    releaseActiveDisplayStream();
    return { surface, audioTrackCount: 0, audioLabel: '', peakLevel: 0, verdict: 'no-audio-track' };
  }
  // Mede o pico RMS por ~2s (usuário deve deixar algo tocando).
  const peak = await measurePeakRms(new MediaStream(aTracks));
  const audioLabel = aTracks[0].label || '(sem rótulo)';
  releaseActiveDisplayStream();
  vlog('PROBE → pico RMS:', peak.toFixed(4));
  return {
    surface,
    audioTrackCount: aTracks.length,
    audioLabel,
    peakLevel: +peak.toFixed(4),
    verdict: peak < 0.0015 ? 'silent' : 'ok',
  };
}

/**
 * DIAGNÓSTICO da rota de LOOPBACK: abre o dispositivo escolhido via getUserMedia, mede o pico RMS
 * por ~2s (deixe algo tocando) e devolve o mesmo veredito estruturado do probe de tela — mas com
 * `surface: 'loopback'`. Serve para o usuário confirmar, no PC real, se o Stereo Mix/VB-Cable está
 * de fato levando o mix do sistema (ok) ou está mudo/roteado errado (silent).
 */
export async function probeLoopback(deviceId: string | undefined): Promise<SystemAudioProbe> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    vlog('PROBE loopback rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
    if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
      throw new Error(
        'Dispositivo de loopback não encontrado. Habilite o "Stereo Mix" ou instale o VB-Audio Cable e selecione-o.',
      );
    }
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
      throw new Error('Permissão negada. Autorize o acesso ao dispositivo de áudio no navegador.');
    }
    throw err;
  }
  const aTracks = stream.getAudioTracks();
  const audioLabel = aTracks[0]?.label || '(sem rótulo)';
  vlog('PROBE loopback → device:', audioLabel);
  const peak = await measurePeakRms(stream);
  stream.getTracks().forEach((t) => t.stop());
  vlog('PROBE loopback → pico RMS:', peak.toFixed(4));
  return {
    surface: 'loopback',
    audioTrackCount: aTracks.length,
    audioLabel,
    peakLevel: +peak.toFixed(4),
    verdict: aTracks.length === 0 ? 'no-audio-track' : peak < 0.0015 ? 'silent' : 'ok',
  };
}
