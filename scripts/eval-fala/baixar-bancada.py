"""
Monta a BANCADA de avaliação de fala e tradução — os dados fixos contra os quais toda troca de modelo
é medida.

POR QUE ESTES CONJUNTOS (pesquisa de 24/09/2026, ver docs/auditoria/eval/bancada-2026-09.md):
  - FLEURS pt_br e en_us (CC-BY-4.0): fala LIDA, mas cada frase é uma frase do FLORES-200 — o mesmo
    `id` nos dois idiomas. Isso dá, de uma vez só, o teste de transcrição E o de tradução, e permite
    a CASCATA realista: transcrever o áudio em inglês e traduzir o que o STT entendeu, comparando com
    a referência em português. O FLORES+ oficial é restrito (pedir acesso); o FLEURS traz as mesmas
    frases sem restrição.
  - WMT24++ en→pt_BR (Apache-2.0, google/wmt24pp): o conjunto em que os LLMs de ponta foram
    comparados em 2025, com domínios de fala, social, notícia e literatura.
  - ESC-50 (CC BY-NC 3.0, uso interno de avaliação): sons SEM fala — chuva, motor, cachorro,
    aplauso — para medir a taxa de ALUCINAÇÃO (o Whisper inventa texto em ~40% dos trechos sem fala
    quando não há VAD; arXiv 2501.11378). Categorias com voz humana ficam de fora.
  - Variantes derivadas: ruído a 0/5/10 dB e recodificação Opus 16/24/32 kbps, para medir robustez
    e decidir o bitrate de armazenamento com número em vez de palpite.

O ÁUDIO NÃO É VERSIONADO; o MANIFESTO É. Tudo fica em BANCADA_DIR (padrão
%LOCALAPPDATA%/babel-bancada, FORA do OneDrive, que estrangula milhares de arquivos pequenos). Cada
manifesto traz o sha256 do WAV: uma troca silenciosa de conteúdo é detectável.

A AMOSTRA É DETERMINÍSTICA (semente fixa) e usa os ids presentes nos DOIS idiomas, para que a
cascata e a tradução usem as mesmas frases.

Uso:  python scripts/eval-fala/baixar-bancada.py [--n 300] [--n-derivadas 100]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import random
import shutil
import subprocess
import sys

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf
from huggingface_hub import hf_hub_download

SEMENTE = 20260924
TAXA = 16000
RAIZ = os.environ.get("BANCADA_DIR") or os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "babel-bancada")

# Categorias do ESC-50 com voz ou som humano vocal: um "sem fala" que tem risada ou choro não mede
# alucinação, mede outra coisa.
ESC_VOCAIS = {"crying_baby", "sneezing", "breathing", "coughing", "laughing", "snoring", "drinking_sipping"}


def sha(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def gravar_wav(caminho: str, pcm: np.ndarray) -> None:
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    sf.write(caminho, np.clip(pcm, -1, 1).astype(np.float32), TAXA, subtype="PCM_16")


def para16k(pcm: np.ndarray, taxa: int) -> np.ndarray:
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if taxa == TAXA:
        return pcm.astype(np.float32)
    n = int(len(pcm) * TAXA / taxa)
    x = np.linspace(0, len(pcm) - 1, n)
    return np.interp(x, np.arange(len(pcm)), pcm).astype(np.float32)


def ler_fleurs(lang: str) -> dict[int, dict]:
    caminho = hf_hub_download("google/fleurs", f"parquet-data/{lang}/test-00000-of-00001.parquet", repo_type="dataset")
    t = pq.read_table(caminho, columns=["id", "audio", "transcription", "raw_transcription", "gender"]).to_pylist()
    # O FLEURS grava a MESMA frase várias vezes (falantes diferentes). Fica a primeira gravação de
    # cada id: um id repetido pesaria duas vezes a mesma frase no bootstrap.
    por_id: dict[int, dict] = {}
    for linha in t:
        por_id.setdefault(linha["id"], linha)
    return por_id


def montar_fleurs(n: int) -> list[int]:
    en = ler_fleurs("en_us")
    pt = ler_fleurs("pt_br")
    comuns = sorted(set(en) & set(pt))
    random.Random(SEMENTE).shuffle(comuns)
    escolhidos = comuns[:n]
    for lang, fonte in (("en", en), ("pt", pt)):
        manifesto = []
        for i in escolhidos:
            linha = fonte[i]
            pcm, taxa = sf.read(io.BytesIO(linha["audio"]["bytes"]), dtype="float32")
            pcm = para16k(pcm, taxa)
            arq = f"stt/fleurs_{lang}/{i}.wav"
            gravar_wav(os.path.join(RAIZ, arq), pcm)
            manifesto.append({
                "id": f"fleurs_{lang}_{i}", "floresId": i, "idioma": lang, "arquivo": arq,
                "referencia": linha["raw_transcription"], "referenciaNormalizada": linha["transcription"],
                "duracaoS": round(len(pcm) / TAXA, 3), "sha256": sha(os.path.join(RAIZ, arq)),
            })
        escrever_jsonl(f"stt/fleurs_{lang}.jsonl", manifesto)
        print(f"fleurs_{lang}: {len(manifesto)} falas, {sum(m['duracaoS'] for m in manifesto) / 60:.1f} min")
    # Tradução: o par de frases (en, pt) dos mesmos ids.
    pares = [{"id": f"fleurs_{i}", "floresId": i, "en": en[i]["raw_transcription"], "pt": pt[i]["raw_transcription"]} for i in escolhidos]
    escrever_jsonl("mt/fleurs_en_pt.jsonl", pares)
    return escolhidos


def montar_wmt(n: int) -> None:
    caminho = hf_hub_download("google/wmt24pp", "en-pt_BR.jsonl", repo_type="dataset")
    linhas = [json.loads(l) for l in open(caminho, encoding="utf-8")]
    boas = [l for l in linhas if not l["is_bad_source"] and l["domain"] != "canary"]
    # Estratificado por domínio: fala e social são o nosso caso; notícia e literatura, o controle.
    por_dom: dict[str, list] = {}
    for l in boas:
        por_dom.setdefault(l["domain"], []).append(l)
    rnd = random.Random(SEMENTE)
    escolhidas = []
    cota = max(1, n // len(por_dom))
    for dom, ls in sorted(por_dom.items()):
        rnd.shuffle(ls)
        escolhidas += ls[:cota]
    saida = [{"id": f"wmt_{l['document_id']}_{l['segment_id']}", "dominio": l["domain"], "en": l["source"], "pt": l["target"]} for l in escolhidas]
    escrever_jsonl("mt/wmt24pp_en_ptbr.jsonl", saida)
    print(f"wmt24pp: {len(saida)} segmentos ({', '.join(f'{d}={min(cota, len(v))}' for d, v in sorted(por_dom.items()))})")


def montar_sem_fala() -> list[np.ndarray]:
    # O nome do shard do ESC-50 muda com a conversão do Hub: descobre em vez de fixar.
    from huggingface_hub import list_repo_files
    shard = next(f for f in list_repo_files("ashraq/esc50", repo_type="dataset") if f.endswith(".parquet"))
    caminho = hf_hub_download("ashraq/esc50", shard, repo_type="dataset")
    t = pq.read_table(caminho).to_pylist()
    rnd = random.Random(SEMENTE)
    nao_vocais = [l for l in t if l["category"] not in ESC_VOCAIS]
    rnd.shuffle(nao_vocais)
    manifesto, ruidos = [], []
    for k, l in enumerate(nao_vocais[:120]):
        audio = l["audio"]
        if isinstance(audio, dict) and audio.get("bytes"):
            pcm, taxa = sf.read(io.BytesIO(audio["bytes"]), dtype="float32")
        else:
            pcm, taxa = np.asarray(audio["array"], dtype=np.float32), audio["sampling_rate"]
        pcm = para16k(pcm, taxa)
        ruidos.append(pcm)
        arq = f"sem_fala/esc50_{k:03d}_{l['category']}.wav"
        gravar_wav(os.path.join(RAIZ, arq), pcm)
        manifesto.append({"id": f"esc50_{k:03d}", "categoria": l["category"], "arquivo": arq, "duracaoS": round(len(pcm) / TAXA, 3)})
    # Sintéticos: silêncio digital, quase-silêncio com dither, ruído rosa e zumbido de rede elétrica —
    # os casos em que o Whisper mais inventa "Obrigado por assistir".
    gerador = np.random.default_rng(SEMENTE)
    sinteticos = {
        "silencio_3s": np.zeros(3 * TAXA),
        "silencio_10s": np.zeros(10 * TAXA),
        "dither_6s": gerador.normal(0, 1e-4, 6 * TAXA),
        "rosa_6s": ruido_rosa(gerador, 6 * TAXA) * 0.05,
        "rosa_forte_6s": ruido_rosa(gerador, 6 * TAXA) * 0.3,
        "zumbido_60hz_6s": 0.05 * np.sin(2 * np.pi * 60 * np.arange(6 * TAXA) / TAXA),
    }
    for nome, pcm in sinteticos.items():
        arq = f"sem_fala/sint_{nome}.wav"
        gravar_wav(os.path.join(RAIZ, arq), pcm.astype(np.float32))
        manifesto.append({"id": f"sint_{nome}", "categoria": "sintetico", "arquivo": arq, "duracaoS": round(len(pcm) / TAXA, 3)})
    escrever_jsonl("sem_fala.jsonl", manifesto)
    print(f"sem fala: {len(manifesto)} trechos")
    return ruidos


def ruido_rosa(g: np.random.Generator, n: int) -> np.ndarray:
    branco = g.normal(0, 1, n)
    espectro = np.fft.rfft(branco)
    f = np.arange(len(espectro))
    f[0] = 1
    rosa = np.fft.irfft(espectro / np.sqrt(f), n)
    return rosa / (np.max(np.abs(rosa)) + 1e-9)


def montar_derivadas(n: int, ruidos: list[np.ndarray]) -> None:
    """Ruído a 0/5/10 dB SNR e Opus a 16/24/32 kbps, sobre as n primeiras falas de cada idioma."""
    ffmpeg = shutil.which("ffmpeg")
    g = np.random.default_rng(SEMENTE)
    for lang in ("en", "pt"):
        base = [json.loads(l) for l in open(os.path.join(RAIZ, f"stt/fleurs_{lang}.jsonl"), encoding="utf-8")][:n]
        for snr in (10, 5, 0):
            man = []
            for m in base:
                fala, _ = sf.read(os.path.join(RAIZ, m["arquivo"]), dtype="float32")
                ruido = ruidos[g.integers(len(ruidos))]
                ruido = np.resize(ruido, len(fala))
                pf, pr = np.mean(fala ** 2) + 1e-12, np.mean(ruido ** 2) + 1e-12
                mistura = fala + ruido * np.sqrt(pf / (pr * 10 ** (snr / 10)))
                mistura /= max(1.0, np.max(np.abs(mistura)))
                arq = f"stt/fleurs_{lang}_snr{snr}/{m['floresId']}.wav"
                gravar_wav(os.path.join(RAIZ, arq), mistura)
                man.append({**m, "id": f"{m['id']}_snr{snr}", "arquivo": arq, "sha256": sha(os.path.join(RAIZ, arq))})
            escrever_jsonl(f"stt/fleurs_{lang}_snr{snr}.jsonl", man)
        if not ffmpeg:
            print("ffmpeg ausente: variantes Opus puladas")
            continue
        for kbps in (16, 24, 32):
            man = []
            for m in base:
                origem = os.path.join(RAIZ, m["arquivo"])
                ogg = os.path.join(RAIZ, f"tmp_{lang}_{kbps}.ogg")
                arq = f"stt/fleurs_{lang}_opus{kbps}/{m['floresId']}.wav"
                destino = os.path.join(RAIZ, arq)
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                # Mesmo codec do MediaRecorder do navegador (Opus, mono, modo voz/áudio automático).
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", origem, "-c:a", "libopus", "-b:a", f"{kbps}k", "-ac", "1", ogg], check=True)
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", ogg, "-ar", str(TAXA), "-ac", "1", "-sample_fmt", "s16", destino], check=True)
                man.append({**m, "id": f"{m['id']}_opus{kbps}", "arquivo": arq, "bytesOpus": os.path.getsize(ogg), "sha256": sha(destino)})
                os.remove(ogg)
            escrever_jsonl(f"stt/fleurs_{lang}_opus{kbps}.jsonl", man)
        print(f"derivadas {lang}: snr 10/5/0 + opus 16/24/32 ({n} falas cada)")


def escrever_jsonl(rel: str, itens: list[dict]) -> None:
    caminho = os.path.join(RAIZ, rel)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        for it in itens:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--n-derivadas", type=int, default=100)
    ap.add_argument("--n-wmt", type=int, default=400)
    a = ap.parse_args()
    os.makedirs(RAIZ, exist_ok=True)
    print(f"BANCADA_DIR = {RAIZ}")
    montar_fleurs(a.n)
    montar_wmt(a.n_wmt)
    ruidos = montar_sem_fala()
    montar_derivadas(a.n_derivadas, ruidos)
    print("pronto.")


if __name__ == "__main__":
    sys.exit(main())
