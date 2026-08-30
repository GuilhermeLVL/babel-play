"""
Monta o corpus de avaliação de fala em pt-BR a partir do CORAA/MuPe.

POR QUE ESTE DATASET. É fala ESPONTÂNEA de brasileiros (histórias de vida do Museu da Pessoa), com
sotaques reais, hesitação e ruído de gravação de campo — exatamente o caso em que o produto falha.
Um corpus de leitura limpa (FLEURS, Common Voice) mediria um problema que não é o nosso. Cada linha
traz `normalized_text` (a referência), `duration`, `audio_quality` e — o que torna este dataset
especialmente útil aqui — `speaker_code`, a identidade do falante, que permite montar cenários de
diarização com ground-truth exato.

POR QUE PARQUET E NÃO A API DE LINHAS. A primeira versão deste coletor usava
`datasets-server.huggingface.co/rows`, uma requisição por áudio. Medido na prática: 429 constante,
6 itens coletados em vários minutos, com falhas silenciosas. O shard parquet é UMA requisição
(~418 MB) que traz milhares de exemplos com o áudio embutido — mais rápido, sem depender de URLs
assinadas que expiram, e reprodutível.

O ÁUDIO NÃO É VERSIONADO; o MANIFESTO É. Áudio no git incharia o repositório por algo que se baixa
de novo. O manifesto guarda id, referência, metadados e o sha256 de cada arquivo, então a medição é
reproduzível e uma troca silenciosa de conteúdo é detectável.

A AMOSTRA É ESTRATIFICADA POR DURAÇÃO, e isso é o experimento: a literatura mostra que o erro do
Whisper dispara em falas curtas, e o VAD deste produto gera exatamente falas curtas. Sem
estratificar, a amostra seria dominada pelas faixas do meio e esconderia o gargalo.

Uso:  python scripts/eval-fala/baixar-corpus.py [--por-faixa 15] [--shard 0]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import urllib.request

DATASET = "nilc-nlp/CORAA-MUPE-ASR"
SPLIT = "test"
MANIFESTO = "tests/fixtures/corpus-pt-br.jsonl"
RAIZ_AUDIO = "tests/fixtures/audio"
DIR_COraa = os.path.join(RAIZ_AUDIO, "coraa")
CACHE_SHARD = os.path.join(RAIZ_AUDIO, "_shard.parquet")

# Faixas de DURAÇÃO em segundos. Espelham as faixas de nº de palavras de src/core/eval/wer.ts.
FAIXAS = [
    ("muito-curta", 0.4, 1.5),
    ("curta", 1.5, 3.0),
    ("media", 3.0, 6.0),
    ("longa", 6.0, 12.0),
]


def baixar_shard(indice: int, destino: str) -> str:
    if os.path.exists(destino) and os.path.getsize(destino) > 1_000_000:
        print(f"shard em cache: {destino} ({os.path.getsize(destino)/1e6:.0f} MB)")
        return destino
    url = f"https://huggingface.co/api/datasets/{DATASET}/parquet/default/{SPLIT}/{indice}.parquet"
    print(f"baixando shard {indice}… (uma requisição, ~400 MB)")
    req = urllib.request.Request(url, headers={"User-Agent": "babel-play-eval"})
    with urllib.request.urlopen(req, timeout=900) as r, open(destino, "wb") as f:
        total = int(r.headers.get("content-length") or 0)
        lido = 0
        while True:
            bloco = r.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)
            lido += len(bloco)
            if total:
                print(f"\r  {lido/1e6:.0f}/{total/1e6:.0f} MB", end="", flush=True)
    print()
    return destino


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--por-faixa", type=int, default=15)
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--por-falante", type=int, default=3,
                    help="teto de falas por pessoa em cada faixa — força diversidade de voz")
    a = ap.parse_args()

    import pyarrow.parquet as pq

    os.makedirs(DIR_COraa, exist_ok=True)
    caminho = baixar_shard(a.shard, CACHE_SHARD)

    pf = pq.ParquetFile(caminho)
    print(f"shard: {pf.metadata.num_rows} linhas, {pf.metadata.num_row_groups} grupos")

    por_faixa: dict[str, list] = {n: [] for n, _, _ in FAIXAS}
    escolhidos: dict[str, dict] = {}
    vistos = 0

    # `file_path` é o identificador do SEGMENTO. `audio_id` identifica a gravação de ORIGEM e é
    # compartilhado por dezenas de falas — usá-lo como chave colapsou 3.871 segmentos em 4 na
    # primeira tentativa.
    colunas = ["audio_id", "file_path", "normalized_text", "duration", "speaker_code",
               "speaker_gender", "age", "birth_state", "audio_quality", "audio"]

    # DIVERSIDADE DE VOZ É REQUISITO, não refinamento. O shard vem ordenado por gravação de
    # origem, então varrer sequencialmente entrega dezenas de falas da MESMA pessoa — mediu-se
    # isso: as duas primeiras faixas de grupo deram 60 itens e 1 único falante. Um WER assim
    # descreve uma voz, não o português. Duas defesas: varrer os grupos ESPALHADOS pelo shard, e
    # limitar quantas falas cada pessoa contribui por faixa.
    ordem = list(range(pf.metadata.num_row_groups))
    passo = max(1, len(ordem) // 8)
    ordem = [ordem[i] for i in range(0, len(ordem), passo)] + ordem
    vistos_grupos: set[int] = set()
    por_falante: dict[tuple[str, str], int] = {}

    for g in ordem:
        if g in vistos_grupos:
            continue
        vistos_grupos.add(g)
        if all(len(por_faixa[n]) >= a.por_faixa for n, _, _ in FAIXAS):
            break
        tabela = pf.read_row_group(g, columns=colunas)
        for linha in tabela.to_pylist():
            vistos += 1
            dur = linha.get("duration")
            texto = (linha.get("normalized_text") or "").strip()
            if not texto or dur is None:
                continue
            faixa = next((n for n, lo, hi in FAIXAS if lo <= dur < hi), None)
            if faixa is None or len(por_faixa[faixa]) >= a.por_faixa:
                continue

            falante = str(linha.get("speaker_code") or "?")
            chave = (falante, faixa)
            if por_falante.get(chave, 0) >= a.por_falante:
                continue

            caminho = str(linha.get("file_path") or "")
            ident = os.path.splitext(os.path.basename(caminho))[0] or str(linha["audio_id"])
            if ident in escolhidos:
                continue
            audio = linha.get("audio")
            # O parquet do HF guarda áudio como {'bytes': ..., 'path': ...}.
            b = audio.get("bytes") if isinstance(audio, dict) else None
            if not b:
                continue

            arquivo = f"coraa/{ident}.wav"
            with open(os.path.join(RAIZ_AUDIO, arquivo), "wb") as f:
                f.write(b)

            item = {
                "id": ident,
                "origem": str(linha.get("audio_id") or ""),
                "arquivo": arquivo,
                "referencia": texto,
                "duracaoS": round(float(dur), 3),
                "faixa": faixa,
                # Metadados que permitem cortar o resultado por condição — é o que responde
                # "a aplicação é fraca com que tipo de voz?".
                "falante": str(linha.get("speaker_code") or ""),
                "genero": str(linha.get("speaker_gender") or ""),
                "idade": linha.get("age"),
                "estado": str(linha.get("birth_state") or ""),
                "qualidade": str(linha.get("audio_quality") or ""),
                "sha256": hashlib.sha256(b).hexdigest(),
            }
            por_faixa[faixa].append(item)
            escolhidos[ident] = item
            por_falante[chave] = por_falante.get(chave, 0) + 1
            print(f"\r  {len(escolhidos)} itens ("
                  + " ".join(f"{n}:{len(por_faixa[n])}" for n, _, _ in FAIXAS) + ")   ", end="", flush=True)

    itens = sorted(escolhidos.values(), key=lambda o: o["id"])
    with io.open(MANIFESTO, "w", encoding="utf-8", newline="\n") as f:
        for o in itens:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")

    print(f"\n\nmanifesto: {MANIFESTO} ({len(itens)} itens de {vistos} linhas varridas)")
    for n, _, _ in FAIXAS:
        g = por_faixa[n]
        print(f"  {n:<12} {len(g):>3} itens · {sum(o['duracaoS'] for o in g):.0f}s")
    print(f"  falantes distintos: {len({o['falante'] for o in itens})}")

    if not itens:
        print("\nNENHUM item coletado. Sem corpus não há medição — não invente número.", file=sys.stderr)
        return 1
    # Faixa vazia não é detalhe: é justamente o recorte que responderia "é o modelo ou a
    # segmentação?", e o relatório precisa dizer que ela ficou de fora.
    vazias = [n for n, _, _ in FAIXAS if not por_faixa[n]]
    if vazias:
        print(f"  ATENÇÃO: faixas sem nenhum item: {', '.join(vazias)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
