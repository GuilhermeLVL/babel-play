"""Compara, pelo ouvido de um ASR (faster-whisper small, CPU int8), o áudio do Kitten com os fonemas do oráculo
(espeak, como no treino) e com os do fonetizador do app. Mede CER contra o texto em cada caso.

Uso: <env-com-faster-whisper>/bin/python -I scripts/voz/kitten/asr_comparar.py <manifesto.json> <pasta-dos-wav>
O manifesto (id, idioma, texto) e os WAV `<id>-oraculo.wav` / `<id>-app.wav` saem do spike (`spike/rodar.mjs`).
"""

import json
import re
import statistics
import sys
import unicodedata
import wave
from pathlib import Path

import numpy as np

from faster_whisper import WhisperModel


def normalizar(t):
    t = unicodedata.normalize("NFC", t.lower())
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def lev(a, b):
    ant = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (ca != cb)))
        ant = cur
    return ant[-1]


def ler_wav_16k(caminho):
    """WAV PCM16 mono → float32 a 16 kHz (interpolação linear; basta para o ASR)."""
    with wave.open(str(caminho)) as w:
        taxa = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    n = int(len(x) * 16000 / taxa)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def main():
    manifesto, pasta = sys.argv[1], Path(sys.argv[2])
    itens = json.loads(Path(manifesto).read_text(encoding="utf-8"))
    m = WhisperModel("small", device="cpu", compute_type="int8")
    por = {}
    piores = []
    for it in itens:
        ref = normalizar(it["texto"])
        linha = {}
        for fonte in ("oraculo", "app"):
            wav = pasta / f"{it['id']}-{fonte}.wav"
            segs, _ = m.transcribe(ler_wav_16k(wav), language=it["idioma"], beam_size=1)
            hyp = normalizar(" ".join(s.text for s in segs))
            cer = lev(ref, hyp) / max(1, len(ref))
            por.setdefault((it["idioma"], fonte), []).append(cer)
            linha[fonte] = (cer, hyp)
        piores.append((linha["app"][0] - linha["oraculo"][0], it["id"], it["texto"], linha["app"][1], linha["oraculo"][1]))
    for (idioma, fonte), xs in sorted(por.items()):
        print(json.dumps({"idioma": idioma, "fonte": fonte, "n": len(xs), "cer_medio": round(statistics.mean(xs), 4),
                          "cer_mediano": round(statistics.median(xs), 4)}))
    print("--- onde o app perde mais para o oráculo ---")
    for d, i, t, ha, ho in sorted(piores, reverse=True)[:8]:
        print(f"{d:+.3f} {i} | {t} | app: {ha} | oráculo: {ho}")


if __name__ == "__main__":
    main()
