"""
Refaz, a partir do parquet do FLEURS já guardado, as falas da bancada de transcrição que a página de
medição no navegador (`rodar.mjs`) usa.

A amostra é A MESMA de `scripts/eval-fala/baixar-bancada.py`: semente 20260924, ids presentes em pt_br
E en_us, primeira gravação de cada id, embaralhados, os N primeiros. Com N=100 saem exatamente as 100
falas que a bancada de setembro usou em `stt_local_dtypes.json` (o `rodar.mjs` confere os ids e o texto
de referência contra aquele arquivo antes de medir).

Espanhol (`--es`): o FLEURS es_419 não fez parte da bancada de STT; a amostra é independente (mesma
semente, N primeiros ids do próprio idioma).

Lê BANCADA_DIR/cache/fleurs-raw/<idioma>.parquet se existir; senão baixa do Hub (`google/fleurs`).
Grava em BANCADA_DIR/navegador/ (fora do git), sem tocar em BANCADA_DIR/stt.

Uso:  python scripts/eval-fala/bancada/navegador/preparar-audio.py [--n 100] [--es] [--extras fr_fr,de_de]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import random

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf

SEMENTE = 20260924
TAXA = 16000
RAIZ = os.environ.get("BANCADA_DIR") or os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "babel-bancada")
SAIDA = os.path.join(RAIZ, "navegador")


def para16k(pcm: np.ndarray, taxa: int) -> np.ndarray:
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if taxa == TAXA:
        return pcm.astype(np.float32)
    n = int(len(pcm) * TAXA / taxa)
    x = np.linspace(0, len(pcm) - 1, n)
    return np.interp(x, np.arange(len(pcm)), pcm).astype(np.float32)


def parquet_do_idioma(fleurs: str) -> str:
    local = os.path.join(RAIZ, "cache", "fleurs-raw", f"{fleurs}.parquet")
    if os.path.exists(local):
        return local
    from huggingface_hub import hf_hub_download

    return hf_hub_download("google/fleurs", f"parquet-data/{fleurs}/test-00000-of-00001.parquet", repo_type="dataset")


def primeira_posicao(caminho: str) -> dict[int, int]:
    """id → posição da PRIMEIRA gravação. Só a coluna de ids vira objeto Python."""
    ids = pq.read_table(caminho, columns=["id"]).column("id").to_pylist()
    primeira: dict[int, int] = {}
    for posicao, i in enumerate(ids):
        primeira.setdefault(i, posicao)
    return primeira


def sha(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def gravar(rotulo: str, caminho: str, primeira: dict[int, int], escolhidos: list[int]) -> None:
    tabela = pq.read_table(caminho, columns=["id", "audio", "transcription", "raw_transcription"])
    linhas = tabela.take([primeira[i] for i in escolhidos]).to_pylist()
    manifesto = []
    for i, linha in zip(escolhidos, linhas):
        assert linha["id"] == i
        pcm, taxa = sf.read(io.BytesIO(linha["audio"]["bytes"]), dtype="float32")
        pcm = para16k(pcm, taxa)
        arq = f"stt/fleurs_{rotulo}/{i}.wav"
        destino = os.path.join(SAIDA, arq)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        sf.write(destino, np.clip(pcm, -1, 1).astype(np.float32), TAXA, subtype="PCM_16")
        manifesto.append({
            "id": f"fleurs_{rotulo}_{i}", "floresId": i, "idioma": rotulo, "arquivo": arq,
            "referencia": linha["raw_transcription"], "referenciaNormalizada": linha["transcription"],
            "duracaoS": round(len(pcm) / TAXA, 3), "sha256": sha(destino),
        })
    with open(os.path.join(SAIDA, f"stt/fleurs_{rotulo}.jsonl"), "w", encoding="utf-8") as f:
        for m in manifesto:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"fleurs_{rotulo}: {len(manifesto)} falas, {sum(m['duracaoS'] for m in manifesto) / 60:.1f} min")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--es", action="store_true")
    ap.add_argument("--extras", default="", help="idiomas do FLEURS a mais, ex.: fr_fr,de_de (baixa do Hub)")
    a = ap.parse_args()
    print(f"saída: {SAIDA}")
    p_en, p_pt = parquet_do_idioma("en_us"), parquet_do_idioma("pt_br")
    en, pt = primeira_posicao(p_en), primeira_posicao(p_pt)
    comuns = sorted(set(en) & set(pt))
    random.Random(SEMENTE).shuffle(comuns)
    escolhidos = comuns[: a.n]
    gravar("pt", p_pt, pt, escolhidos)
    gravar("en", p_en, en, escolhidos)
    outros = ([("es", "es_419")] if a.es else []) + [(x.split("_")[0], x) for x in a.extras.split(",") if x]
    for rotulo, fleurs in outros:
        p = parquet_do_idioma(fleurs)
        pos = primeira_posicao(p)
        ids = sorted(pos)
        random.Random(SEMENTE).shuffle(ids)
        gravar(rotulo, p, pos, ids[: a.n])


if __name__ == "__main__":
    main()
