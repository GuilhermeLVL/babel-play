#!/usr/bin/env bash
# Gate do redesign v3 — idempotente, sai != 0 em qualquer falha e imprime resumo.
#
# Roda os mesmos comandos reais do projeto (ver docs/redesign/FERRAMENTAS.md).
# Uso:  bash scripts/redesign/gate.sh            (tudo)
#       GATE_PULAR_E2E=1 bash scripts/redesign/gate.sh   (sem E2E, para iterar rápido)
set -uo pipefail
cd "$(dirname "$0")/../.."

RESULTADOS=()
FALHOU=0

etapa() {
  local nome="$1"; shift
  echo ""
  echo "──────── $nome ────────"
  if "$@"; then
    RESULTADOS+=("OK    $nome")
  else
    RESULTADOS+=("FALHA $nome")
    FALHOU=1
  fi
}

# 8. Integridade: nenhum teste removido em relação à main, nenhum .skip/.only novo.
integridade() {
  local base="${GATE_BASE:-main}" apagados novos
  apagados=$(git diff --diff-filter=D --name-only "$base" -- 'tests/**' 'src/**/*.test.*' 'server/**/*.test.*' || true)
  if [ -n "$apagados" ]; then
    echo "ARQUIVO DE TESTE REMOVIDO em relação a $base:"; echo "$apagados"; return 1
  fi
  novos=$(git diff -U0 "$base" -- 'tests/**' | grep -E '^\+.*\b(it|test|describe)\.(skip|only)\b' || true)
  if [ -n "$novos" ]; then
    echo "SKIP/ONLY NOVO introduzido:"; echo "$novos"; return 1
  fi
  echo "Nenhum teste removido, nenhum .skip/.only novo em relação a $base."
}

etapa "1. Typecheck"                 npm run typecheck
etapa "2. Lint"                      npm run lint
etapa "3. Testes unitários"          npm run test:unit
etapa "4. Build de produção"         npm run build
if [ "${GATE_PULAR_E2E:-0}" != "1" ]; then
  etapa "5. E2E (paridade, 3 viewports)" npm run test:e2e
else
  RESULTADOS+=("PULADO 5. E2E (GATE_PULAR_E2E=1)")
fi
etapa "6. Integridade de testes"     integridade

echo ""
echo "════════════ RESUMO DO GATE ════════════"
printf '%s\n' "${RESULTADOS[@]}"
echo "════════════════════════════════════════"
if [ "$FALHOU" -ne 0 ]; then echo "GATE VERMELHO"; exit 1; fi
echo "GATE VERDE"
