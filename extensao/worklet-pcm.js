/**
 * Junta os blocos de 128 amostras do contexto (já a 16 kHz, mono) em quadros fixos de Int16 e os devolve
 * ao offscreen como ArrayBuffer transferido. Canais extras são ignorados (o 1º basta para a fala).
 */
class PcmEmQuadros extends AudioWorkletProcessor {
  constructor(opcoes) {
    super();
    this.tam = opcoes.processorOptions?.amostrasPorQuadro ?? 1600;
    this.quadro = new Int16Array(this.tam);
    this.n = 0;
  }

  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      const v = Math.max(-1, Math.min(1, canal[i]));
      this.quadro[this.n++] = v < 0 ? v * 32768 : v * 32767;
      if (this.n === this.tam) {
        const saida = this.quadro.buffer;
        this.port.postMessage(saida, [saida]);
        this.quadro = new Int16Array(this.tam);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('frasy-pcm', PcmEmQuadros);
