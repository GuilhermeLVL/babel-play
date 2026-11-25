/**
 * AudioWorkletProcessor da prática de fala no aparelho (openspec `sombra-sem-web-speech`): entrega o canal 0 do
 * microfone em blocos Float32 (cópia, transferida sem recópia) para a thread principal acumular. Roda na taxa nativa
 * do contexto; a reamostragem para 16 kHz é de `src/core/fala/pcm.ts`. Não escreve na saída (silêncio).
 */
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (canal && canal.length) {
      const copia = new Float32Array(canal);
      this.port.postMessage(copia, [copia.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
