#!/bin/bash
# A bancada do Intérprete (conversa-de-verdade, 5.3), um processo por modelo (a memória de um não conta no outro).
# Uso: bash scripts/eval-fala/medir-interprete.sh <pasta de saída> [pasta das falas da auditoria]
set -euo pipefail
SAIDA="$1"
AUDITORIA="${2:-}"
mkdir -p "$SAIDA"
for m in base@q8 small@q8 small@hibrido parakeet; do
  npx tsx scripts/eval-fala/medir-interprete.mjs --modelos "$m" --saida "$SAIDA/$m.json" \
    ${AUDITORIA:+--auditoria "$AUDITORIA"} > "$SAIDA/$m.log" 2>&1
  tail -1 "$SAIDA/$m.log" | cut -c1-300
done
