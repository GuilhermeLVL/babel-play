"""
Pontua as saídas da bancada de tradução com as métricas que a área usa para DECIDIR:

  - COMET (Unbabel/wmt22-comet-da, Apache-2.0): métrica neural de referência, a que melhor concorda
    com julgamento humano entre as que rodam numa CPU comum. O chrF++ conta caracteres iguais e pune
    paráfrase — o prompt "comunicativo" da produção PEDE paráfrase ("traduza o sentido"), então só o
    chrF daria vantagem artificial ao tradutor literal. O COMET mede o sentido.
  - BLEU e chrF++ do sacreBLEU, com ASSINATURA, para comparar com números publicados.
  - IC de 95% por bootstrap (1000 reamostras) da média do COMET e diferença PAREADA contra o
    primeiro sistema de cada corpus — a mesma regra de decisão da bancada de STT.

Na cascata (STT → tradução), a fonte dada ao COMET é a frase HUMANA, não a transcrição: o que se
quer saber é se o usuário recebeu o sentido do que foi dito.

O CometKiwi (sem referência) NÃO é usado: licença não comercial. Para monitorar produção, usar
MetricX-24 QE (Apache-2.0) — ver o relatório.

Uso (no venv da bancada):
  %LOCALAPPDATA%/babel-bancada/venv/Scripts/python scripts/eval-fala/bancada/pontuar.py [arquivos mt_*.json]
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import random
import sys

import sacrebleu

RAIZ = os.environ.get("BANCADA_DIR") or os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "babel-bancada")
PASTA = "docs/auditoria/eval/bancada-2026-09"
CACHE = os.path.join(RAIZ, "cache", "comet.json")
SEMENTE = 20260924


def chave(src: str, hip: str, ref: str) -> str:
    return hashlib.sha256(f"{src}\x1f{hip}\x1f{ref}".encode()).hexdigest()[:20]


def bootstrap(vals: list[float], b: int = 1000) -> dict:
    rnd = random.Random(SEMENTE)
    n = len(vals)
    media = sum(vals) / n
    amostras = sorted(sum(vals[rnd.randrange(n)] for _ in range(n)) / n for _ in range(b))
    return {"valor": media, "ic95": [amostras[int(0.025 * b)], amostras[int(0.975 * b) - 1]]}


def main() -> None:
    arquivos = sys.argv[1:] or sorted(glob.glob(os.path.join(PASTA, "mt_*.json")))
    cache: dict[str, float] = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))

    pendentes = {}
    dados = []
    for arq in arquivos:
        d = json.load(open(arq, encoding="utf-8"))
        dados.append((arq, d))
        for r in d["resultados"]:
            for c in r["casos"]:
                src = c.get("origemHumana") or c["origem"]
                k = chave(src, c["hipotese"] or "", c["referencia"])
                if k not in cache:
                    pendentes[k] = {"src": src, "mt": c["hipotese"] or "", "ref": c["referencia"]}

    if pendentes:
        from comet import download_model, load_from_checkpoint
        print(f"COMET: {len(pendentes)} segmentos novos (CPU)…", flush=True)
        modelo = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
        ks = list(pendentes)
        for i in range(0, len(ks), 256):
            lote = ks[i:i + 256]
            saida = modelo.predict([pendentes[k] for k in lote], batch_size=16, gpus=0, progress_bar=False)
            for k, s in zip(lote, saida.scores):
                cache[k] = float(s)
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            json.dump(cache, open(CACHE, "w", encoding="utf-8"))
            print(f"  {min(i + 256, len(ks))}/{len(ks)}", flush=True)

    for arq, d in dados:
        por_corpus: dict[str, list] = {}
        for r in d["resultados"]:
            hips = [c["hipotese"] or "" for c in r["casos"]]
            refs = [c["referencia"] for c in r["casos"]]
            comet = [cache[chave(c.get("origemHumana") or c["origem"], c["hipotese"] or "", c["referencia"])] for c in r["casos"]]
            tgt = r["corpus"].split(":")[-1].split("-")[1]
            m_bleu, m_chrf = sacrebleu.BLEU(tokenize="13a"), sacrebleu.CHRF(word_order=2)
            bleu, chrfpp = m_bleu.corpus_score(hips, [refs]), m_chrf.corpus_score(hips, [refs])
            r["comet"] = bootstrap(comet)
            r["cometPorCaso"] = comet
            r["sacrebleu"] = {
                "bleu": bleu.score, "chrfpp": chrfpp.score,
                "assinaturaBleu": str(m_bleu.get_signature()),
                "assinaturaChrf": str(m_chrf.get_signature()),
                "alvo": tgt,
            }
            por_corpus.setdefault(r["corpus"], []).append(r)
        comps = []
        for corpus, rs in por_corpus.items():
            base = rs[0]
            print(f"\n{corpus}")
            for r in rs:
                c = r["comet"]
                print(f"  {r['sistema']:<42} COMET {c['valor']:.4f} [{c['ic95'][0]:.4f}–{c['ic95'][1]:.4f}]  BLEU {r['sacrebleu']['bleu']:5.1f}  chrF++ {r['sacrebleu']['chrfpp']:5.1f}")
            for r in rs[1:]:
                n = min(len(base["cometPorCaso"]), len(r["cometPorCaso"]))
                dif = [r["cometPorCaso"][i] - base["cometPorCaso"][i] for i in range(n)]
                b = bootstrap(dif)
                sig = b["ic95"][0] > 0 or b["ic95"][1] < 0
                comps.append({"corpus": corpus, "sistema": r["sistema"], "contra": base["sistema"], "diferencaComet": {**b, "significativo": sig}})
                print(f"    Δ {r['sistema']} − {base['sistema']}: {b['valor']:+.4f} [{b['ic95'][0]:+.4f}, {b['ic95'][1]:+.4f}]{' *significativo*' if sig else ' (empate)'}")
        d["comparacoesComet"] = comps
        d["metricasNeurais"] = {"modelo": "Unbabel/wmt22-comet-da", "sacrebleu": sacrebleu.__version__}
        json.dump(d, open(arq, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
