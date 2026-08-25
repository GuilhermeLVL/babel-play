/**
 * AudioWorkletProcessor do loopback via servidor — substitui o ScriptProcessorNode
 * (depreciado e rodando na MAIN THREAD, causa de micro-travamentos em jogos).
 * Roda na thread de áudio: recebe Float32Array 16kHz mono via port (transferable,
 * zero-cópia) e alimenta a saída com backpressure (~10s; excedente é descartado).
 */
class LoopbackFeeder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fifo = [];
    this.offset = 0;
    this.queued = 0;
    this.MAX_QUEUED = 16000 * 10;
    this.port.onmessage = (e) => {
      const chunk = e.data;
      if (!(chunk instanceof Float32Array) || !chunk.length) return;
      if (this.queued + chunk.length > this.MAX_QUEUED) return; // descarta sob pressão
      this.fifo.push(chunk);
      this.queued += chunk.length;
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    let filled = 0;
    while (filled < out.length && this.fifo.length) {
      const head = this.fifo[0];
      const take = Math.min(out.length - filled, head.length - this.offset);
      out.set(head.subarray(this.offset, this.offset + take), filled);
      filled += take;
      this.offset += take;
      this.queued -= take;
      if (this.offset >= head.length) { this.fifo.shift(); this.offset = 0; }
    }
    if (filled < out.length) out.fill(0, filled); // sem dados → silêncio (VAD ignora)
    return true;
  }
}

registerProcessor('loopback-feeder', LoopbackFeeder);
