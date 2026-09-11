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
# 5. E2E — verde significa "nenhuma falha NOVA", nao "nenhuma falha".
#
# A main ja chegou vermelha aqui: 5 testes (x 3 viewports) falham por dependerem de um estado de
# banco que `_global-setup.ts` nao cria. Um gate que so soubesse dizer "vermelho" seria inutil
# nesta branch — vermelho desde o primeiro commit, por causa alheia, e portanto ignorado.
#
# Entao ele compara com `e2e-falhas-conhecidas.txt` e falha nas DUAS direcoes:
#  · falha fora da lista  -> regressao desta branch;
#  · teste da lista que passou -> a lista envelheceu e esta escondendo um conserto.
e2e() {
  local saida="${TMPDIR:-/tmp}/gate-e2e.txt" lista="scripts/redesign/e2e-falhas-conhecidas.txt"
  npm run test:e2e > "$saida" 2>&1
  local ok falhas
  ok=$(grep -cE "^  ok" "$saida" || true)
  echo "E2E: $ok aprovados."

  grep -E "^  x " "$saida" | sed -E 's/ \([0-9.]+m?s\)$//; s/^  x +[0-9]+ +//; s/^\[[a-z0-9-]+\] › //'     | sort -u > "${saida}.falhas"
  grep -vE '^\s*(#|$)' "$lista" | sort -u > "${saida}.conhecidas"

  local novas somem
  novas=$(comm -23 "${saida}.falhas" "${saida}.conhecidas")
  somem=$(comm -13 "${saida}.falhas" "${saida}.conhecidas")

  if [ -n "$novas" ]; then
    echo "REGRESSAO — falha(s) que a main nao tinha:"; echo "$novas"
    echo "--- saida completa: $saida"
    return 1
  fi
  if [ -n "$somem" ]; then
    echo "BASELINE VELHA — passou(ram) e continua(m) na lista de falhas conhecidas:"; echo "$somem"
    echo "Remova a(s) linha(s) de $lista; manter esconderia o conserto."
    return 1
  fi
  falhas=$(wc -l < "${saida}.falhas" | tr -d ' ')
  echo "Nenhuma falha nova. $falhas falha(s) pre-existente(s), todas na lista conhecida."
}

if [ "${GATE_PULAR_E2E:-0}" != "1" ]; then
  etapa "5. E2E (paridade, 3 viewports)" e2e
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
