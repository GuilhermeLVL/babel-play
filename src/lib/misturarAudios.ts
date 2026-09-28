/**
 * MISTURA DOS ÁUDIOS DA SESSÃO (sistema + microfone).
 *
 * O bug que isto conserta (2026-08-27): no cenário "Chamada de vídeo" o app grava DOIS
 * MediaRecorders independentes e, ao salvar, ficava só com o do sistema — a voz da própria
 * pessoa era jogada fora, e nos exercícios ela nunca conseguia se reescutar.
 *
 * A mistura é feita NO FIM, decodificando os dois webm/opus e re-renderizando num
 * OfflineAudioContext mono de 16 kHz (o mesmo formato que o pipeline de STT já usa) com o
 * deslocamento real entre os inícios das duas gravações — sem isso a voz entraria fora de
 * tempo em relação ao interlocutor.
 *
 * ─── A SAÍDA É OGG OPUS, NÃO WAV (2026-09-24) ───
 *
 * O WAV PCM de 16 kHz/16 bits custa ~115 MB POR HORA, e o upload do áudio da sessão aceita 120 MB.
 * Toda sessão com as duas fontes acima de ~62 minutos quebrava no salvar — a rota recusava, e a
 * sessão ficava sem áudio nenhum. Em Opus a 24 kbps (a mesma taxa do gravador ao vivo) a hora cabe
 * em ~11 MB: dez horas antes de encostar no teto.
 *
 * COMO, e por que assim. As alternativas pesadas:
 *  - tocar a mistura num `MediaStreamDestination` e gravar com MediaRecorder: funciona em qualquer
 *    navegador, mas é em TEMPO REAL — uma hora de sessão, uma hora de "salvando…". Descartado.
 *  - subir as duas faixas separadas e misturar depois: exige mudar o servidor, o player, a forma de
 *    onda e os minijogos, que todos esperam UM arquivo. Descartado.
 *  - WebCodecs `AudioEncoder` com codec 'opus': codifica MAIS RÁPIDO que o tempo real, sem
 *    dependência nova, e existe no Chromium (o navegador principal do app). Os pacotes crus saem
 *    embrulhados num Ogg mínimo (`oggOpus.ts`) — contêiner que o servidor reconhece pelos magic
 *    bytes (`OggS`) e que o `<audio>` e o `decodeAudioData` tocam. ESCOLHIDO.
 *
 * SEM `AudioEncoder` (ou com o Opus recusado): o WAV antigo, MAS só enquanto couber no upload
 * (`TETO_DO_WAV_BYTES`). Acima disso a mistura RECUSA com erro — e quem chama (`salvarSessao`) já
 * trata a falha mantendo o áudio do SISTEMA, que é o que existia antes da mistura. Perder a voz da
 * pessoa numa sessão longa num navegador sem WebCodecs é ruim; perder a sessão inteira é pior.
 */
import { TAXA_DE_BITS_DA_GRAVACAO } from '../gateway/capture/taxaDeBits';
import { codificarOggOpus, type ConfigOpus, opusDisponivel } from './codificadorOpus';

const TAXA_SAIDA = 16_000;
/**
 * Maior WAV que ainda sobe: o limite da rota é 120 MB; 110 deixa folga para o cabeçalho HTTP e para
 * não depender de arredondamento. ~57 minutos a 16 kHz/16 bits.
 */
export const TETO_DO_WAV_BYTES = 110 * 1024 * 1024;

/**
 * Decodifica NUM contexto offline à taxa de saída: o `decodeAudioData` já devolve reamostrado a
 * 16 kHz. O `AudioContext` de antes decodificava a 48 kHz — o triplo de memória para uma sessão de
 * uma hora (e um contexto de áudio "vivo" só para decodificar).
 */
async function decodificar(blob: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, TAXA_SAIDA);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

function paraWav(buffer: AudioBuffer): Blob {
  const canal = buffer.getChannelData(0);
  const cabecalho = 44;
  const dados = new DataView(new ArrayBuffer(cabecalho + canal.length * 2));
  const escreve = (off: number, txt: string) => {
    for (let i = 0; i < txt.length; i++) dados.setUint8(off + i, txt.charCodeAt(i));
  };
  escreve(0, 'RIFF');
  dados.setUint32(4, 36 + canal.length * 2, true);
  escreve(8, 'WAVE');
  escreve(12, 'fmt ');
  dados.setUint32(16, 16, true);
  dados.setUint16(20, 1, true); // PCM
  dados.setUint16(22, 1, true); // mono
  dados.setUint32(24, buffer.sampleRate, true);
  dados.setUint32(28, buffer.sampleRate * 2, true);
  dados.setUint16(32, 2, true);
  dados.setUint16(34, 16, true);
  escreve(36, 'data');
  dados.setUint32(40, canal.length * 2, true);
  for (let i = 0; i < canal.length; i++) {
    const v = Math.max(-1, Math.min(1, canal[i]));
    dados.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([dados.buffer], { type: 'audio/wav' });
}

/** Codifica o buffer mono em Opus (`codificadorOpus.ts`) e devolve o Ogg como Blob. */
async function codificarOpus(buffer: AudioBuffer, config: ConfigOpus): Promise<Blob> {
  const ogg = await codificarOggOpus(buffer.getChannelData(0), config);
  return new Blob([ogg.buffer as ArrayBuffer], { type: 'audio/ogg; codecs=opus' });
}

/**
 * Mistura `a` e `b` num único áudio mono (Ogg Opus; WAV como reserva). `offsetBMs` é o atraso do
 * início de `b` em relação a `a` (negativo = `b` começou antes; o deslocamento vira de `a`).
 */
export async function misturarAudios(a: Blob, b: Blob, offsetBMs: number): Promise<Blob> {
  const [bufA, bufB] = await Promise.all([decodificar(a), decodificar(b)]);
  const offA = offsetBMs < 0 ? -offsetBMs / 1000 : 0;
  const offB = offsetBMs > 0 ? offsetBMs / 1000 : 0;
  const duracao = Math.max(bufA.duration + offA, bufB.duration + offB) + 0.05;
  const amostras = Math.ceil(duracao * TAXA_SAIDA);

  const config: ConfigOpus = { codec: 'opus', sampleRate: TAXA_SAIDA, numberOfChannels: 1, bitrate: TAXA_DE_BITS_DA_GRAVACAO };
  const comOpus = await opusDisponivel(config);
  /* Decidido ANTES de renderizar: sem Opus, uma mistura que não cabe no upload nem é montada — a
     renderização de uma sessão longa custaria centenas de MB de memória para um arquivo inútil. */
  if (!comOpus && 44 + amostras * 2 > TETO_DO_WAV_BYTES) {
    throw new Error(
      `a mistura em WAV (${Math.round((amostras * 2) / 1048576)} MB) não cabe no upload e este navegador não codifica Opus`,
    );
  }

  const off = new OfflineAudioContext(1, amostras, TAXA_SAIDA);
  for (const [buf, inicio] of [
    [bufA, offA],
    [bufB, offB],
  ] as Array<[AudioBuffer, number]>) {
    const fonte = off.createBufferSource();
    fonte.buffer = buf;
    // Leve compressão de ganho para a soma não estourar quando os dois falam juntos.
    const ganho = off.createGain();
    ganho.gain.value = 0.85;
    fonte.connect(ganho);
    ganho.connect(off.destination);
    fonte.start(inicio);
  }
  const misturado = await off.startRendering();
  if (comOpus) {
    try {
      return await codificarOpus(misturado, config);
    } catch (e) {
      // O codificador falhou no meio (raro): o WAV ainda salva a sessão, se couber.
      if (44 + amostras * 2 > TETO_DO_WAV_BYTES) throw e;
    }
  }
  return paraWav(misturado);
}
