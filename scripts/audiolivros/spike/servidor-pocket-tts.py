# /// script
# requires-python = ">=3.10,<3.15"
# dependencies = ["pocket-tts==4.0.1", "numpy"]
# ///
"""Servidor local do Pocket TTS (Kyutai, CPU) no contrato HTTP da bancada de voz.

  uv run scripts/audiolivros/spike/servidor-pocket-tts.py --porta 8802 [--cache <dir>] [--variante 24l]

Pesos: o pacote usa `kyutai/pocket-tts-without-voice-cloning` (CC-BY-4.0, SEM o codificador de clonagem e
sem trava de acesso); o repositório `kyutai/pocket-tts` é gated e NÃO é usado. Cache em `--cache`
(`HF_HOME`), nunca no repositório.

Vozes: lista FECHADA. Só entram vozes com licença documentada que permite uso comercial (CC0/CC-BY).
`rafael` (pt) e `lola` (es) NÃO têm licença documentada (ver docs/pesquisa) e só entram com
`--incluir-nao-verificadas`, apenas para a escuta de avaliação. `cosette` (Expresso) e `jean` (EARS) são
CC-BY-NC e ficam de fora sempre. Nenhum caminho de áudio é aceito (clonagem vedada).
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from servidor_base import servir  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--porta", type=int, default=8802)
p.add_argument("--cache", default=None)
p.add_argument("--variante", default="", choices=["", "24l"])
p.add_argument("--incluir-nao-verificadas", action="store_true")
a = p.parse_args()
if a.cache:
    os.environ["HF_HOME"] = a.cache

from pocket_tts import TTSModel  # noqa: E402
from pocket_tts.utils.utils import get_predefined_voice  # noqa: E402

LIMPAS = ["marius", "javert", "alba", "anna", "vera", "fantine", "charles", "paul", "eponine", "azelma",
          "george", "mary", "jane", "michael", "eve", "bill_boerst", "peter_yearsley", "stuart_bell", "caro_davy"]
NAO_VERIFICADAS = ["rafael", "lola"]
LINGUA = {"pt": "portuguese", "es": "spanish", "en": "english"}
modelos: dict = {}
estados: dict = {}


def modelo(idioma):
    if idioma not in LINGUA:
        raise ValueError("idioma não suportado neste spike")
    if idioma not in modelos:
        lingua = LINGUA[idioma] + (f"_{a.variante}" if a.variante and idioma != "en" else "")
        modelos[idioma] = TTSModel.load_model(language=lingua)
    return modelos[idioma]


def sintetizar(texto, voz, idioma, _velocidade):
    m = modelo(idioma)
    if (idioma, voz) not in estados:
        estados[(idioma, voz)] = m.get_state_for_audio_prompt(get_predefined_voice(LINGUA[idioma], voz))
    audio = m.generate_audio(estados[(idioma, voz)], texto)
    return audio.detach().cpu().numpy(), m.sample_rate


ids = LIMPAS + (NAO_VERIFICADAS if a.incluir_nao_verificadas else [])
servir([{"id": v, "idioma": "*"} for v in ids], sintetizar, a.porta)
