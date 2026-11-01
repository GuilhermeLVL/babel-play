"""Servidor HTTP mínimo do contrato da bancada de voz (só biblioteca padrão), usado pelos spikes locais.

Contrato (o mesmo de `criarSintetizadorHttp`):
  GET  /vozes       -> [{"id": "...", "idioma": "*"}, ...]
  POST /sintetizar  {"texto", "voz", "idioma", "velocidade"?} -> audio/wav (PCM 16 bits mono)
                    + cabeçalhos X-Tempo-Sintese (s, medido AQUI) e X-Memoria-MB (RSS de pico)

Clonagem de voz é VEDADA: `voz` só aceita um id da lista fechada do motor (qualquer outra coisa, inclusive
caminho de arquivo, é recusada com 400) e campos de áudio de referência são recusados.
Escuta só em 127.0.0.1. A síntese é serializada por um lock (os motores não são thread-safe).
"""

from __future__ import annotations

import io
import json
import resource
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

CAMPOS_PROIBIDOS = {"reference_audio", "audio_prompt", "ref_audio", "voice_clone", "clone", "speaker_wav"}


def wav_pcm16(amostras: np.ndarray, taxa_hz: int) -> bytes:
    """float [-1, 1] (qualquer forma) -> WAV PCM 16 bits mono."""
    x = np.clip(np.asarray(amostras, dtype=np.float32).reshape(-1), -1.0, 1.0)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(taxa_hz))
        w.writeframes((x * 32767.0).astype("<i2").tobytes())
    return buf.getvalue()


def memoria_pico_mb() -> float:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return rss / (1024 * 1024) if sys.platform == "darwin" else rss / 1024


def servir(vozes: list[dict], sintetizar, porta: int) -> None:
    """`sintetizar(texto, voz, idioma, velocidade|None) -> (amostras, taxa_hz)`; ValueError vira 400."""
    ids = {v["id"] for v in vozes}
    trava = threading.Lock()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silêncio: o corpo traz texto de livro
            pass

        def _json(self, codigo: int, obj) -> None:
            dados = json.dumps(obj).encode()
            self.send_response(codigo)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def do_GET(self):
            if self.path == "/vozes":
                self._json(200, vozes)
            else:
                self._json(404, {"erro": "não encontrado"})

        def do_POST(self):
            if self.path != "/sintetizar":
                return self._json(404, {"erro": "não encontrado"})
            try:
                corpo = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
                if not isinstance(corpo, dict):
                    raise ValueError("corpo inválido")
                if CAMPOS_PROIBIDOS & set(corpo):
                    raise ValueError("clonagem de voz é vedada")
                texto, voz, idioma = corpo.get("texto"), corpo.get("voz"), corpo.get("idioma")
                if not isinstance(texto, str) or not texto.strip():
                    raise ValueError("texto vazio")
                if voz not in ids:
                    raise ValueError("voz fora da lista fechada")
                vel = corpo.get("velocidade")
                with trava:
                    t0 = time.perf_counter()
                    amostras, taxa = sintetizar(texto, voz, idioma, vel)
                    dt = time.perf_counter() - t0
                wav = wav_pcm16(amostras, taxa)
            except ValueError as e:
                return self._json(400, {"erro": str(e)})
            except Exception as e:  # noqa: BLE001
                return self._json(500, {"erro": type(e).__name__})
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(wav)))
            self.send_header("x-tempo-sintese", f"{dt:.4f}")
            self.send_header("x-memoria-mb", f"{memoria_pico_mb():.0f}")
            self.end_headers()
            self.wfile.write(wav)

    srv = ThreadingHTTPServer(("127.0.0.1", porta), H)
    print(f"pronto 127.0.0.1:{porta}", flush=True)
    srv.serve_forever()
