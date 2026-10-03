"""
Monta o CORPUS da bancada do fim de fala (`fim-de-fala.mjs`): falas lidas do FLEURS (CC-BY-4.0) em cinco
idiomas — pt_br, en_us, es_419, cmn_hans_cn e ja_jp —, 16 kHz mono, com a transcrição de referência.

Fica em BANCADA_DIR/fimdefala/ (padrão %LOCALAPPDATA%/babel-bancada), FORA do git e SEPARADO do corpus de STT de
`baixar-bancada.py`: o corpus de lá é pt/en com 300 falas; este precisa de mais idiomas e de poucas falas por
idioma. A amostra é determinística (semente fixa) e fica com a primeira gravação de cada id do FLEURS.

Se o parquet do idioma já estiver em BANCADA_DIR/cache/fleurs-raw/<idioma>.parquet (baixado à mão), usa ele; senão
baixa do Hub (`google/fleurs`, `parquet-data/<idioma>/test-00000-of-00001.parquet`, 290–740 MB por idioma).

Uso:  python scripts/eval-fala/bancada/baixar-fim-de-fala.py [--n 100] [--idiomas pt_br,en_us,...]
Precisa de numpy, pyarrow e soundfile (os de requirements.txt).
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

SEMENTE = 20261003
TAXA = 16000
RAIZ = os.environ.get("BANCADA_DIR") or os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "babel-bancada")
# Rótulo curto do app → nome do FLEURS.
IDIOMAS = {"pt": "pt_br", "en": "en_us", "es": "es_419", "zh": "cmn_hans_cn", "ja": "ja_jp"}


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


def montar(rotulo: str, fleurs: str, n: int) -> None:
    tabela = pq.read_table(parquet_do_idioma(fleurs), columns=["id", "audio", "transcription", "raw_transcription"])
    # Só os ids viram objetos Python: converter a tabela inteira (centenas de MB de áudio) estoura a memória.
    primeira: dict[int, int] = {}
    for posicao, i in enumerate(tabela.column("id").to_pylist()):
        primeira.setdefault(i, posicao)
    ids = sorted(primeira)
    random.Random(SEMENTE).shuffle(ids)
    ids = ids[:n]
    por_id = {i: linha for i, linha in zip(ids, tabela.take([primeira[i] for i in ids]).to_pylist())}
    saida = os.path.join(RAIZ, "fimdefala", rotulo)
    os.makedirs(saida, exist_ok=True)
    manifesto = []
    for i in ids[:n]:
        linha = por_id[i]
        pcm, taxa = sf.read(io.BytesIO(linha["audio"]["bytes"]), dtype="float32")
        pcm = para16k(pcm, taxa)
        arq = os.path.join("fimdefala", rotulo, f"{i}.wav")
        sf.write(os.path.join(RAIZ, arq), np.clip(pcm, -1, 1), TAXA, subtype="PCM_16")
        with open(os.path.join(RAIZ, arq), "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        manifesto.append({
            "id": f"{rotulo}_{i}", "idioma": rotulo, "arquivo": arq.replace("\\", "/"),
            "referencia": linha["raw_transcription"], "referenciaNormalizada": linha["transcription"],
            "duracaoS": round(len(pcm) / TAXA, 3), "sha256": sha,
        })
    with open(os.path.join(RAIZ, "fimdefala", f"{rotulo}.jsonl"), "w", encoding="utf-8") as f:
        for m in manifesto:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"{rotulo}: {len(manifesto)} falas, {sum(m['duracaoS'] for m in manifesto) / 60:.1f} min")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--idiomas", default=",".join(IDIOMAS))
    a = ap.parse_args()
    for rot in a.idiomas.split(","):
        montar(rot, IDIOMAS.get(rot, rot), a.n)
