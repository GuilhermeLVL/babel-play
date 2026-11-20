# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = ["supertonic==1.3.1", "numpy"]
# ///
"""Servidor local do Supertonic 3 (ONNX, CPU) no contrato HTTP da bancada de voz.

  uv run scripts/audiolivros/spike/servidor-supertonic.py --porta 8801 [--cache <dir>] [--passos 8]

Pesos: baixados pelo pacote `supertonic` de huggingface.co/Supertone/supertonic-3 (revisão fixada pelo
pacote) para `--cache` (NUNCA dentro do repositório). Licença dos pesos: BigScience OpenRAIL-M
(ver docs/pesquisa/2026-11-01-audiolivros-motores-locais.md). Vozes: os 10 presets (F1-F5, M1-M5); sem clonagem.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from servidor_base import servir  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--porta", type=int, default=8801)
p.add_argument("--cache", default=None)
p.add_argument("--passos", type=int, default=8)
a = p.parse_args()
if a.cache:
    os.environ["SUPERTONIC_CACHE_DIR"] = a.cache

from supertonic import TTS  # noqa: E402

tts = TTS(model="supertonic-3", auto_download=True)
nomes = sorted(tts.voice_style_names)
estilos = {n: tts.get_voice_style(n) for n in nomes}
IDIOMAS = ["pt", "en", "es"]


def sintetizar(texto, voz, idioma, velocidade):
    if idioma not in IDIOMAS:
        raise ValueError("idioma não suportado neste spike")
    kw = {"speed": float(velocidade)} if velocidade else {}
    wav, _dur = tts.synthesize(texto, voice_style=estilos[voz], lang=idioma, total_steps=a.passos, **kw)
    return wav, tts.sample_rate


servir([{"id": n, "idioma": "*"} for n in nomes], sintetizar, a.porta)
