"""
COMET e sacreBLEU sobre o bruto de tradução da bancada de nuvem — as MESMAS métricas de
`bancada/pontuar.py` (setembro): COMET `Unbabel/wmt22-comet-da` na CPU, BLEU (13a) e chrF++ do
sacreBLEU com assinatura, IC de 95% por bootstrap (1000 reamostras, semente 20260924) e diferença
PAREADA frase a frase.

Lê `docs/auditoria/eval/bancada-2026-10-nuvem/bruto/mt_*.json` e grava `comet.json` na pasta de cima.
Falha de tradução conta como saída vazia.

Uso (Python com unbabel-comet 2.2.7 e sacrebleu 2.6.0, ver `bancada/requirements.txt`):
  python scripts/eval-fala/bancada/nuvem/pontuar-comet.py
"""
from __future__ import annotations

import glob
import json
import os
import random

import sacrebleu

PASTA = "docs/auditoria/eval/bancada-2026-10-nuvem"
SEMENTE = 20260924


def bootstrap(vals: list[float], b: int = 1000) -> dict:
    rnd = random.Random(SEMENTE)
    n = len(vals)
    media = sum(vals) / n
    amostras = sorted(sum(vals[rnd.randrange(n)] for _ in range(n)) / n for _ in range(b))
    return {"valor": media, "ic95": [amostras[int(0.025 * b)], amostras[int(0.975 * b) - 1]]}


def main() -> None:
    sistemas = []
    for arq in sorted(glob.glob(os.path.join(PASTA, "bruto", "mt_*.json"))):
        d = json.load(open(arq, encoding="utf-8"))
        casos = [
            {"id": i, "src": c["origem"], "mt": (c.get("texto") or "") if c.get("ok") else "", "ref": c["referencia"]}
            for i, c in d["casos"].items()
        ]
        if casos:
            sistemas.append({"sistema": d["sistema"], "direcao": d["direcao"], "casos": casos})

    from comet import download_model, load_from_checkpoint

    modelo = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
    todos = [c for s in sistemas for c in s["casos"]]
    print(f"COMET: {len(todos)} segmentos (CPU)…", flush=True)
    notas = modelo.predict(
        [{"src": c["src"], "mt": c["mt"], "ref": c["ref"]} for c in todos], batch_size=16, gpus=0, progress_bar=False
    ).scores
    for c, s in zip(todos, notas):
        c["comet"] = float(s)

    resultados, comparacoes = [], []
    for s in sistemas:
        hips, refs = [c["mt"] for c in s["casos"]], [c["ref"] for c in s["casos"]]
        m_bleu, m_chrf = sacrebleu.BLEU(tokenize="13a"), sacrebleu.CHRF(word_order=2)
        r = {
            "sistema": s["sistema"],
            "direcao": s["direcao"],
            "n": len(hips),
            "comet": bootstrap([c["comet"] for c in s["casos"]]),
            "bleu": m_bleu.corpus_score(hips, [refs]).score,
            "chrfpp": m_chrf.corpus_score(hips, [refs]).score,
            "assinaturaBleu": str(m_bleu.get_signature()),
            "assinaturaChrf": str(m_chrf.get_signature()),
            "cometPorCaso": {c["id"]: c["comet"] for c in s["casos"]},
        }
        resultados.append(r)
        c = r["comet"]
        print(f"{r['direcao']} {r['sistema']:<34} n={r['n']} COMET {c['valor']:.4f} [{c['ic95'][0]:.4f}–{c['ic95'][1]:.4f}]  BLEU {r['bleu']:5.1f}  chrF++ {r['chrfpp']:5.1f}")
    for a in resultados:
        for b in resultados:
            if a is b or a["direcao"] != b["direcao"] or not a["sistema"].startswith("openrouter:"):
                continue
            if b["sistema"].startswith("openrouter:") and a["sistema"] < b["sistema"]:
                continue
            ids = [i for i in a["cometPorCaso"] if i in b["cometPorCaso"]]
            d = bootstrap([a["cometPorCaso"][i] - b["cometPorCaso"][i] for i in ids])
            sig = d["ic95"][0] > 0 or d["ic95"][1] < 0
            comparacoes.append({"direcao": a["direcao"], "sistema": a["sistema"], "contra": b["sistema"], "n": len(ids), "diferencaComet": {**d, "significativo": sig}})
            print(f"   Δ COMET {a['direcao']}: {a['sistema']} − {b['sistema']} = {d['valor']:+.4f} [{d['ic95'][0]:+.4f}; {d['ic95'][1]:+.4f}] {'*significativo*' if sig else '(empate)'}  n={len(ids)}")
    json.dump(
        {"modelo": "Unbabel/wmt22-comet-da", "sacrebleu": sacrebleu.__version__, "resultados": resultados, "comparacoes": comparacoes},
        open(os.path.join(PASTA, "comet.json"), "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=1,
    )


if __name__ == "__main__":
    main()
