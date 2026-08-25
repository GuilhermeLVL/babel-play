import { Router } from "express";

/**
 * Captura de áudio do SISTEMA no PRÓPRIO servidor local via WASAPI loopback
 * (pacote `loopback-capture`, binário N-API pré-compilado, Windows 10+).
 *
 * Por que existe: no navegador, o áudio de TELA INTEIRA no Windows falha com
 * NotReadableError (limitação Chrome/WASAPI) e o loopback via Stereo Mix/VB-Cable
 * exige setup manual. Como o app roda com um servidor Node LOCAL, capturamos o mix
 * do dispositivo de reprodução padrão AQUI — zero permissão de navegador, zero setup —
 * e transmitimos o PCM ao cliente por HTTP chunked (sem dependência de WebSocket).
 *
 * Formato do fio: Int16 LE, MONO, 16 kHz (o nativo entrega 48 kHz estéreo; reamostramos
 * no servidor para reduzir 6× a banda e casar com o que o VAD/Whisper esperam).
 *
 * OBS: esta rota só faz sentido no modo local/self-host. Num deploy em nuvem o servidor
 * não tem áudio do usuário — `supported` responde false e a UI esconde a opção.
 */

import { TARGET_RATE, makeDownsampler } from "./downsample";
import { LoopbackExclusion } from "./loopbackExclusion";

type LoopbackModule = { LoopbackCapture: new () => { startSystemAudio(cb: (chunk: Buffer) => void): void; stop(): void } };

let cachedModule: LoopbackModule | null | undefined;

/** Carrega o módulo nativo uma única vez; null = indisponível nesta plataforma/instalação. */
async function loadLoopback(): Promise<LoopbackModule | null> {
  if (cachedModule !== undefined) return cachedModule;
  if (process.platform !== "win32") { cachedModule = null; return null; }
  try {
    const mod: any = await import("loopback-capture");
    const resolved = mod?.default?.LoopbackCapture ? mod.default : mod;
    cachedModule = resolved?.LoopbackCapture ? (resolved as LoopbackModule) : null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

// Uma captura WASAPI por vez — o dispositivo de loopback é um recurso único do SO. A exclusão é por
// CONTADOR DE GERAÇÃO (ver loopbackExclusion.ts): a versão antiga, por referência a `activeStop`
// zerada antes do `await`, tinha uma race (S-05) que deixava capturas órfãs.
const exclusion = new LoopbackExclusion();

export const audioRouter = Router();

// A UI usa isto para decidir se mostra a fonte "Áudio do computador (servidor local)".
audioRouter.get("/loopback/support", async (_req, res) => {
  const mod = await loadLoopback();
  res.json({
    supported: !!mod,
    reason: mod ? undefined : (process.platform !== "win32"
      ? "captura de loopback do servidor só existe no Windows"
      : "módulo nativo loopback-capture indisponível nesta instalação"),
    format: mod ? { encoding: "pcm_s16le", sampleRate: TARGET_RATE, channels: 1 } : undefined,
  });
});

// Stream contínuo de PCM (chunked). Encerra quando o cliente aborta a requisição.
audioRouter.get("/loopback/stream", async (req, res) => {
  const mod = await loadLoopback();
  if (!mod) { res.status(501).json({ error: "Loopback do servidor indisponível nesta plataforma." }); return; }
  // TAKEOVER em vez de 409 (bug real: uma conexão fantasma — página recarregada no meio da
  // gravação — deixava a captura presa e TODO start seguinte falhava para sempre). O app é
  // single-user local: a captura mais NOVA tem prioridade; derrubamos a anterior e seguimos.
  // A geração é reivindicada ANTES do respiro — é o que fecha a race S-05 (ver loopbackExclusion.ts).
  const { gen, superseded } = exclusion.supersede();
  if (superseded) {
    console.log("[audio/loopback] captura anterior ainda ativa — assumindo (takeover)");
    await new Promise((r) => setTimeout(r, 150)); // respiro p/ o WASAPI soltar o dispositivo
    // Uma requisição MAIS NOVA chegou durante o respiro? Então esta foi superada — aborta em vez
    // de criar uma captura órfã (era exatamente o vazamento do S-05).
    if (!exclusion.stillOwner(gen)) {
      res.status(409).json({ error: "captura assumida por uma requisição mais nova" });
      return;
    }
  }

  res.status(200);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.flushHeaders?.();

  const capture = new mod.LoopbackCapture();
  const downsample = makeDownsampler();
  // Parada BRUTA: para a captura e encerra a resposta. É o que o takeover de uma requisição futura
  // chama (via exclusion.supersede → stop desta), e também o cleanup do close.
  const stopThis = () => {
    try { capture.stop(); } catch { /* já parada */ }
    try { res.end(); } catch { /* conexão já fechada */ }
    console.log("[audio/loopback] captura encerrada");
  };
  exclusion.activate(gen, stopThis);
  // No close do cliente: só age se ESTA geração ainda for a ativa — nunca derruba uma captura que
  // uma requisição posterior já assumiu (o takeover já parou esta por conta própria).
  const cleanup = () => {
    if (!exclusion.stillOwner(gen)) return;
    exclusion.deactivate(gen);
    stopThis();
  };

  try {
    capture.startSystemAudio((chunk: Buffer) => {
      const out = downsample(chunk);
      if (out.length && !res.writableEnded) res.write(out);
    });
    console.log("[audio/loopback] captura WASAPI iniciada (48kHz estéreo → 16kHz mono)");
  } catch (err) {
    exclusion.deactivate(gen);
    try { capture.stop(); } catch { /* nunca iniciou */ }
    res.status(500).json({ error: `Falha ao iniciar o loopback WASAPI: ${String((err as Error)?.message || err)}` });
    return;
  }

  req.on("close", cleanup);
});
