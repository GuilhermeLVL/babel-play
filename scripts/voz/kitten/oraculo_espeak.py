"""ORÁCULO de avaliação (só na máquina de quem desenvolve; NÃO vai para o app nem para o repositório como dado).

Roda o front end de texto do pacote `kittenml` (espeak-ng, GPL-3, para pt/es; léxico + BART para en) sobre frases e
grava, por linha, {idioma, texto, fonemas}. Serve só para MEDIR o fonetizador próprio do app
(`src/core/voz/kitten/fonemas*.ts`, escrito do zero, sem código nem dados do espeak) contra o que o modelo viu no
treino. A saída fica fora do git (padrão: /tmp/kitten-oraculo).

Uso (com o ambiente Python que já tem `kittenml`, `phonemizer` e `espeakng_loader`):
  <env>/bin/python -I scripts/voz/kitten/oraculo_espeak.py <repo-do-modelo> <saida.jsonl> <idioma>:<arquivo.txt> ...
Cada arquivo de frases tem uma frase por linha.
"""

import json
import os
import sys
import tempfile
from pathlib import Path


def preparar_espeak():
    """No macOS a lib do wheel procura os dados um nível acima; espelha nos dois níveis."""
    import espeakng_loader

    real = Path(espeakng_loader.get_data_path())
    d = Path(tempfile.gettempdir()) / "kitten-espeak-dados"
    d.mkdir(parents=True, exist_ok=True)
    for item in real.iterdir():
        alvo = d / item.name
        if not alvo.exists() and not alvo.is_symlink():
            alvo.symlink_to(item)
    interno = d / "espeak-ng-data"
    if not interno.exists() and not interno.is_symlink():
        interno.symlink_to(real)
    os.environ["ESPEAK_DATA_PATH"] = str(d)
    os.environ["PHONEMIZER_ESPEAK_DATA_PATH"] = str(d)
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = espeakng_loader.get_library_path()


def main():
    repo, saida, *pares = sys.argv[1:]
    preparar_espeak()
    from kittenml import KittenTTS

    m = KittenTTS(repo)
    n = 0
    with open(saida, "w", encoding="utf-8") as out:
        for par in pares:
            idioma, arquivo = par.split(":", 1)
            for linha in Path(arquivo).read_text(encoding="utf-8").splitlines():
                texto = linha.strip()
                if not texto:
                    continue
                fon = m.phonemize(texto, idioma)
                out.write(json.dumps({"idioma": idioma, "texto": texto, "fonemas": " | ".join(fon)},
                                     ensure_ascii=False) + "\n")
                n += 1
    print(n, "frases")


if __name__ == "__main__":
    main()
