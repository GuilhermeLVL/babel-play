import { MicVAD } from "@ricky0123/vad-web";
import { apiFetch } from '../../data/api';

// Logger de diagnóstico da captura de sistema/VAD (observabilidade no console do navegador).
const vlog = (...a: any[]) => console.log('%c[cap:vad]', 'color:#0369A1;font-weight:bold', ...a);

export interface AudioCapture {
  /** Encerra a captura e devolve o áudio GRAVADO da sessão — ou null se indisponível. */
  stop(): Promise<Blob | null>;
  /**
   * Instante (Date.now(), epoch-ms) em que o MediaRecorder REALMENTE começou a gravar — a
   * ORIGEM (t=0) do áudio salvo. A UI ancora o relógio das legendas a este valor: sem isso, o
   * t0 do clique em START fica ADIANTADO do t0 do recorder por todo o tempo da caixa de
   * compartilhamento (getDisplayMedia), e a legenda descola do áudio por esse offset variável.
   */
  startedAtMs: number;
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

/**
 * Adquire um MediaStream de display (`getDisplayMedia`) de forma segura: espera qualquer
 * aquisição anterior terminar, libera o stream anterior, respeita o cooldown de liberação e só
 * então chama getDisplayMedia. Registra o resultado como `activeDisplayStream` para o próximo
 * chamador poder liberá-lo. É este ponto único que elimina a colisão probe→start.
 */
async function acquireDisplayStream(): Promise<MediaStream> {
  const prior = displayAcquireLock;
  let release!: () => void;
  displayAcquireLock = new Promise<void>((r) => { release = r; });
  try {
    await prior; // serializa: uma aquisição por vez
    releaseActiveDisplayStream();
    const since = performance.now() - lastDisplayReleaseTs;
    if (lastDisplayReleaseTs && since < DISPLAY_RELEASE_COOLDOWN_MS) {
      await sleep(DISPLAY_RELEASE_COOLDOWN_MS - since);
    }
    /* CONSTRAINTS COMPLETAS (2026-08-27). Além do { video, audio } mínimo:
       - systemAudio: 'include' — pede ao Chrome para OFERECER "áudio do sistema" também na aba
         Tela inteira (sem isto alguns canais/versões só mostram o checkbox na aba Guia);
       - monitorTypeSurfaces: 'include' — garante a aba "Tela inteira" no picker;
       - selfBrowserSurface: 'exclude' — tira a própria janela do Babel do picker (eco garantido);
       - surfaceSwitching: 'include' — deixa trocar de aba no meio sem reabrir o picker;
       - suppressLocalAudioPlayback: false — o som CONTINUA tocando no alto-falante da pessoa.
       O que constraint NENHUMA resolve: JANELA não expõe áudio no Chrome/Windows (limitação de
       plataforma; o próprio picker avisa). Esse caso vira o erro tipado JANELA_SEM_AUDIO abaixo. */
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { suppressLocalAudioPlayback: false } as MediaTrackConstraints,
      systemAudio: 'include',
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    } as MediaStreamConstraints);
    activeDisplayStream = stream;
    return stream;
  } finally {
    release();
  }
}

export interface SystemAudioCallbacks {
  /** Fim da fala (VAD) → enunciado PCM completo (autoritativo, com pré-pad). */
  onUtterance: (pcm: Float32Array, sampleRate: number, seq: number) => void;
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

// Cadência dos parciais: reprocessa o buffer-até-agora a cada ~1.1s enquanto a fala continua.
const PARTIAL_INTERVAL_MS = 1100;
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
    recorder = new MediaRecorder(audioStream, recMime ? { mimeType: recMime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
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
  let levelCtx: AudioContext | null = null;
  let levelTimer: any = null;
  try {
    levelCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = levelCtx.createAnalyser();
    analyser.fftSize = 512;
    levelCtx.createMediaStreamSource(audioStream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let peak = 0;
    let reported = false;
    levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      peak = Math.max(peak, rms);
      cb.onLevel?.(Math.min(1, rms * 4)); // 0..1 aprox. p/ o waveform
      // Diagnóstico único após ~2,5s: chegou algum sinal na faixa?
      if (!reported && performance.now() - t0 > 2500) {
        reported = true;
        vlog(label, 'pico RMS em 2,5s:', peak.toFixed(4));
        if (peak < 0.0015) {
          cb.onStatus?.(label === 'system'
            ? '⚠ A faixa de áudio do sistema existe, mas está SILENCIOSA (nível ~0). Confirme que marcou "Compartilhar o áudio do sistema/aba" e que algo está de fato tocando.'
            : '⚠ O microfone está SILENCIOSO (nível ~0). Verifique o dispositivo de entrada escolhido e o volume do microfone no Windows.');
        }
      }
    }, 50);
  } catch (e) {
    vlog(label, 'sonda de nível indisponível:', String(e));
  }

  // Silero VAD sobre o áudio. Assets auto-hospedados em /public. O Silero só fecha um
  // segmento no SILÊNCIO; num áudio sem pausas isso vira um bloco gigante e lento —
  // cortamos à força falas contínuas > MAX_SPEECH_MS para manter o retorno responsivo.
  const MAX_SPEECH_MS = 6000;
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

  const resetUtterance = (): void => { frameChunks = []; accumSamples = 0; lastPartialSamples = 0; };
  const concatFrames = (): Float32Array => {
    const out = new Float32Array(accumSamples);
    let o = 0;
    for (const c of frameChunks) { out.set(c, o); o += c.length; }
    return out;
  };

  vlog(label, 'criando Silero VAD sobre o áudio…');
  /* A regra `prefer-const` aponta a ATRIBUIÇÃO, não a declaração — ver o motivo lá em cima. */
  // eslint-disable-next-line prefer-const
  vad = await MicVAD.new({
    baseAssetPath: '/',
    onnxWASMBasePath: '/',
    model: 'legacy', // usa /silero_vad_legacy.onnx
    getStream: () => Promise.resolve(audioStream),
    pauseStream: async () => {},
    resumeStream: async (s) => s,
    submitUserSpeechOnPause: true, // pause() entrega o áudio acumulado, usado no corte forçado
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 450,   // fecha ~0,45s após o silêncio → limite de frase mais natural
    preSpeechPadMs: 300, // prepende 0,3s → não corta o INÍCIO das sentenças
    minSpeechMs: 400,    // descarta ruídos < 0,4s (era 250: ruído curto virava frase inventada)
    onSpeechStart: () => {
      speechStartTs = performance.now();
      currentSeq = ++seqCounter;
      speaking = true;
      resetUtterance();
      vlog(label, 'VAD → início de fala (seq', currentSeq, ')');
      cb.onSpeechStart?.(currentSeq);
    },
    onFrameProcessed: (_probs, frame) => {
      if (speaking && frame && frame.length) {
        frameChunks.push(frame.slice());
        accumSamples += frame.length;
      }
      if (!forcingCut && speechStartTs && performance.now() - speechStartTs >= MAX_SPEECH_MS) {
        forcingCut = true;
        speechStartTs = performance.now();
        vlog(label, 'VAD → corte forçado (fala contínua > ' + MAX_SPEECH_MS + 'ms)');
        Promise.resolve(vad.pause()).then(() => vad.start()).catch(() => {}).finally(() => { forcingCut = false; });
      }
    },
    onVADMisfire: () => {
      speaking = false;
      vlog(label, 'VAD → misfire (ruído curto, ignorado), seq', currentSeq);
      cb.onMisfire?.(currentSeq);
      resetUtterance();
    },
    onSpeechEnd: (audio: Float32Array) => {
      speaking = false;
      speechStartTs = 0;
      vlog(label, 'VAD → fim de fala (seq', currentSeq, '):', audio.length, 'amostras');
      cb.onUtterance(audio, 16000, currentSeq);
      resetUtterance();
    },
  });

  vad.start();
  vlog(label, 'VAD iniciado ✓');

  // Tick de PARCIAIS: enquanto se fala, transcreve o buffer-até-agora (rolling partial).
  const partialTimer: any = setInterval(() => {
    if (!speaking || !cb.onPartialAudio) return;
    if (accumSamples - lastPartialSamples < PARTIAL_MIN_NEW_SAMPLES) return;
    lastPartialSamples = accumSamples;
    const soFar = concatFrames();
    vlog(label, 'VAD → parcial (seq', currentSeq, '):', soFar.length, 'amostras');
    cb.onPartialAudio(soFar, 16000, currentSeq);
  }, PARTIAL_INTERVAL_MS);

  // Detecta quando a faixa de áudio encerra (usuário parou o compartilhamento / desplugou o mic).
  const audioTracks = audioStream.getAudioTracks();
  audioTracks[0]?.addEventListener("ended", () => {
    vlog(label, 'faixa de áudio encerrada');
    cb.onStatus?.(label === 'mic'
      ? 'Microfone desconectado.'
      : 'Compartilhamento de áudio encerrado pelo usuário.');
  });

  return {
    startedAtMs,
    async stop(): Promise<Blob | null> {
      clearInterval(partialTimer);
      speaking = false;
      // Finaliza a gravação ANTES de parar as faixas (senão perde o último chunk).
      let blob: Blob | null = null;
      if (recorder && recorder.state !== 'inactive') {
        blob = await new Promise<Blob | null>((resolve) => {
          recorder!.onstop = () =>
            resolve(recChunks.length ? new Blob(recChunks, { type: recMime || 'audio/webm' }) : null);
          try { recorder!.stop(); } catch { resolve(null); }
        });
      }
      try { vad.pause(); } catch { /* ignore */ }
      try { (vad as any).destroy?.(); } catch { /* ignore */ }
      if (levelTimer) clearInterval(levelTimer);
      try { await levelCtx?.close(); } catch { /* ignore */ }
      cb.onLevel?.(0);
      fullStream.getTracks().forEach((t) => t.stop());
      return blob;
    },
  };
}

/**
 * Captura o áudio do SISTEMA/aba via getDisplayMedia (video:true é OBRIGATÓRIO pela API).
 * Para Discord/jogos/apps externos: o usuário escolhe "Tela inteira" e marca "compartilhar
 * áudio do sistema" (capta o mix inteiro do SO). Para conteúdo numa aba: escolhe a aba +
 * "áudio da aba". Modo "Janela" não tem áudio no Chrome.
 */
export async function startSystemAudioCapture(cb: SystemAudioCallbacks): Promise<AudioCapture> {
  try {
    let stream: MediaStream;
    try {
      vlog('solicitando getDisplayMedia({ video:true, audio:true })… (escolha ABA ou TELA e marque compartilhar áudio)');
      // Aquisição serializada (ver acquireDisplayStream): um único stream de display por vez, com
      // cooldown de liberação — impede a colisão probe→start que causava NotReadableError na aba.
      stream = await acquireDisplayStream();
    } catch (err) {
      vlog('getDisplayMedia rejeitado:', (err as Error)?.name, '-', (err as Error)?.message);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error(
          "Compartilhamento cancelado ou bloqueado. Clique novamente e escolha uma ABA/TELA com áudio."
        );
      }
      // NotReadableError = você MARCOU "compartilhar áudio do sistema", mas o Windows/navegador
      // não conseguiu ABRIR o loopback de áudio. É falha de SO/driver, não do app. Causas comuns:
      // modo exclusivo no dispositivo de reprodução, outro app segurando o áudio, ou driver.
      if (err instanceof DOMException && (err.name === "NotReadableError" || err.name === "AbortError")) {
        releaseActiveDisplayStream();
        throw new Error(
          'O Windows não conseguiu INICIAR a captura do áudio da TELA (NotReadableError), limitação conhecida ' +
          'do Chrome no Windows para o áudio de tela inteira (o áudio de ABA costuma funcionar). ' +
          'Caminhos que funcionam: ' +
          '(1) ROTA CONFIÁVEL p/ Discord/jogos/sistema inteiro: troque a fonte para "Dispositivo de loopback (Stereo Mix / VB-Cable)", veja o guia; ' +
          '(2) para conteúdo numa ABA (YouTube, chamada): compartilhe a ABA e marque "compartilhar áudio da aba"; ' +
          '(3) se insistir na tela inteira, desative o "modo exclusivo" do dispositivo de reprodução (Som → Propriedades → Avançado) e feche apps que usem o áudio.'
        );
      }
      throw err;
    }

    // Verifica áudio + QUAL superfície foi compartilhada (para orientar o usuário com precisão).
    const videoTrack = stream.getVideoTracks()[0];
    const surface = (videoTrack?.getSettings?.() as any)?.displaySurface as string | undefined;
    const audioTracks = stream.getAudioTracks();
    vlog('superfície:', surface ?? '?', '| vídeo:', stream.getVideoTracks().length, '| áudio:', audioTracks.length);
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      let msg: string;
      if (surface === 'window') {
        msg = 'O modo JANELA não captura áudio no Chrome (limitação da plataforma, a própria janela de seleção avisa "To share audio, share a tab or screen instead"). Para jogos/apps, use a TELA INTEIRA e marque "Também compartilhar o áudio do sistema".';
      } else if (surface === 'monitor') {
        msg = 'Você compartilhou a Tela, mas NÃO marcou "Também compartilhar o áudio do sistema". Clique de novo e ATIVE essa opção (o botão fica no canto inferior esquerdo da janela de seleção).';
      } else {
        msg = 'Nenhum áudio foi compartilhado. Escolha uma ABA (marque "áudio da aba") ou a TELA INTEIRA (marque "áudio do sistema"). Uma JANELA não tem áudio.';
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
    const capture = await startCaptureFromStream(stream, audioStream, cb, 'system');
    // Ao parar, também limpamos a referência do singleton e marcamos a liberação (cooldown),
    // para que uma nova aquisição respeite o respiro do WASAPI.
    return {
      startedAtMs: capture.startedAtMs,
      async stop(): Promise<Blob | null> {
        const blob = await capture.stop();
        if (activeDisplayStream === stream) { activeDisplayStream = null; lastDisplayReleaseTs = performance.now(); }
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
export async function startMicCapture(deviceId: string | undefined, cb: SystemAudioCallbacks): Promise<AudioCapture> {
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
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        throw new Error('Permissão do microfone negada. Ative o microfone nas permissões do navegador.');
      }
      if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
        throw new Error('Microfone escolhido não encontrado. Selecione outro dispositivo de entrada.');
      }
      throw err;
    }
    return await startCaptureFromStream(stream, stream, cb, 'mic');
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
export async function startSystemLoopbackCapture(deviceId: string | undefined, cb: SystemAudioCallbacks): Promise<AudioCapture> {
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
        throw new Error('Dispositivo de loopback não encontrado. Habilite o "Stereo Mix" (Som → Gravação → Mostrar dispositivos desabilitados) ou instale o VB-Audio Cable, e selecione-o.');
      }
      if (err instanceof DOMException && err.name === 'NotReadableError') {
        throw new Error('O dispositivo de loopback existe mas não pôde ser aberto (outro app o segura, ou está em modo exclusivo). Feche apps que o usem e tente de novo.');
      }
      throw err;
    }
    return await startCaptureFromStream(stream, stream, cb, 'system');
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
export async function startServerLoopbackCapture(cb: SystemAudioCallbacks): Promise<AudioCapture> {
  try {
    const resp = await apiFetch('/api/audio/loopback/stream', { timeoutMs: 24 * 3_600_000 });
    if (!resp.ok || !resp.body) {
      let msg = `Servidor recusou o stream de loopback (HTTP ${resp.status}).`;
      try { msg = (await resp.json()).error || msg; } catch { /* corpo não-JSON */ }
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
          const data = carry ? new Uint8Array([...carry, ...value]) : value;
          const usable = data.length - (data.length % 2);
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

    const capture = await startCaptureFromStream(dest.stream, dest.stream, cb, 'system');
    return {
      startedAtMs: capture.startedAtMs,
      async stop(): Promise<Blob | null> {
        stopped = true;
        try { await reader.cancel(); } catch { /* já cancelado */ }
        const blob = await capture.stop();
        try { feeder.disconnect(); } catch { /* já desconectado */ }
        try { await ctx.close(); } catch { /* já fechado */ }
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
    try { msg = (await resp.json()).error || msg; } catch { /* corpo não-JSON */ }
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
        const s = Math.abs(((value[i + 1] << 8) | value[i]) << 16 >> 16) / 32768;
        if (s > peak) peak = s;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* já cancelado */ }
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
        if (performance.now() - t0 > ms) { clearInterval(iv); resolve(); }
      }, 50);
    });
  } catch (e) {
    vlog('sonda de nível falhou:', String(e));
  }
  try { await ctx?.close(); } catch { /* ignore */ }
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
    if (err instanceof DOMException && (err.name === 'NotReadableError' || err.name === 'AbortError')) {
      // Mesmo diagnóstico do fluxo real: o SO não conseguiu abrir o loopback do áudio da tela.
      throw new Error(
        'O Windows não conseguiu INICIAR o áudio da TELA (NotReadableError), limitação do Chrome no Windows. ' +
        'Use a fonte "Dispositivo de loopback (Stereo Mix / VB-Cable)" para Discord/jogos/sistema inteiro, ' +
        'ou compartilhe uma ABA com "áudio da aba" (esse caminho funciona).'
      );
    }
    throw err;
  }
  const vTrack = stream.getVideoTracks()[0];
  const surface = ((vTrack?.getSettings?.() as any)?.displaySurface as string) ?? '?';
  const aTracks = stream.getAudioTracks();
  vlog('PROBE → superfície:', surface, '| áudio:', aTracks.length, '| label:', aTracks[0]?.label || '-');
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
      throw new Error('Dispositivo de loopback não encontrado. Habilite o "Stereo Mix" ou instale o VB-Audio Cable e selecione-o.');
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
