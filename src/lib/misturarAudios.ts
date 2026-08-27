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
 * tempo em relação ao interlocutor. Saída: WAV PCM 16-bit (decodificável em qualquer player).
 * ~2 MB por minuto: aceitável para sessões de estudo; se doer, o passo seguinte é reencodar.
 */

const TAXA_SAIDA = 16_000;

async function decodificar(ctx: AudioContext, blob: Blob): Promise<AudioBuffer> {
  const bytes = await blob.arrayBuffer();
  return ctx.decodeAudioData(bytes);
}

function paraWav(buffer: AudioBuffer): Blob {
  const canal = buffer.getChannelData(0);
  const cabecalho = 44;
  const dados = new DataView(new ArrayBuffer(cabecalho + canal.length * 2));
  const escreve = (off: number, txt: string) => { for (let i = 0; i < txt.length; i++) dados.setUint8(off + i, txt.charCodeAt(i)); };
  escreve(0, 'RIFF');
  dados.setUint32(4, 36 + canal.length * 2, true);
  escreve(8, 'WAVE');
  escreve(12, 'fmt ');
  dados.setUint32(16, 16, true);
  dados.setUint16(20, 1, true);   // PCM
  dados.setUint16(22, 1, true);   // mono
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

/**
 * Mistura `a` e `b` num único WAV mono. `offsetBMs` é o atraso do início de `b` em relação a `a`
 * (negativo = `b` começou antes; o deslocamento vira de `a`).
 */
export async function misturarAudios(a: Blob, b: Blob, offsetBMs: number): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const [bufA, bufB] = await Promise.all([decodificar(ctx, a), decodificar(ctx, b)]);
    const offA = offsetBMs < 0 ? -offsetBMs / 1000 : 0;
    const offB = offsetBMs > 0 ? offsetBMs / 1000 : 0;
    const duracao = Math.max(bufA.duration + offA, bufB.duration + offB) + 0.05;
    const off = new OfflineAudioContext(1, Math.ceil(duracao * TAXA_SAIDA), TAXA_SAIDA);
    for (const [buf, inicio] of [[bufA, offA], [bufB, offB]] as Array<[AudioBuffer, number]>) {
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
    return paraWav(misturado);
  } finally {
    void ctx.close().catch(() => { /* já fechado */ });
  }
}
