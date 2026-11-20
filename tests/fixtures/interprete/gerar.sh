#!/bin/bash
# Gera o conjunto de teste do Intérprete (conversa-de-verdade, 5.2) a partir de `frases.json`: WAV 16 kHz mono em
# `falas/`, a frase N na voz N % 2 do idioma (duas vozes por idioma). Precisa do macOS (`say`), do ffmpeg e do node.
# Uso: bash tests/fixtures/interprete/gerar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SAIDA="$AQUI/falas"
mkdir -p "$SAIDA"
node -e '
const c = require(process.argv[1]);
const conta = {};
for (const f of c.frases) {
  const n = (conta[f.idioma] = (conta[f.idioma] ?? -1) + 1);
  console.log([f.id, c.vozes[f.idioma][n % 2], f.texto].join("\t"));
}' "$AQUI/frases.json" | while IFS=$'\t' read -r id voz texto; do
  say -v "$voz" -o "$SAIDA/$id.aiff" "$texto"
  ffmpeg -y -loglevel error -i "$SAIDA/$id.aiff" -ar 16000 -ac 1 -c:a pcm_s16le "$SAIDA/$id.wav"
  rm -f "$SAIDA/$id.aiff"
done
ls -la "$SAIDA"
