#!/usr/bin/env bash
# GUARDA DE IA — roda depois de cada Edit/Write em arquivo que mexe em dinheiro, privacidade ou plano.
#
# Se o arquivo editado é do núcleo de IA/cotas/planos, roda o subconjunto de testes que o protege (~2 s).
# Falhou: sai com 2 e devolve o resumo ao Claude, que corrige antes de seguir. Outros arquivos: não faz nada.
# Lê o JSON do hook na entrada padrão; não imprime chave nem variável de ambiente.
set -u
entrada="$(cat)"
arquivo="$(printf '%s' "$entrada" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))
except Exception: print("")' 2>/dev/null)"

case "$arquivo" in
  */server/ai/*|*/server/lib/usageQuota.ts|*/server/lib/orcamentoDeIa.ts|*/server/lib/entitlements.ts|*/server/lib/nuvemDeAlivio.ts|*/server/lib/convidado.ts|*/src/core/planos.ts|*/src/core/nuvemDeAlivio.ts|*/src/core/rota/*|*/ops/ia-provedores*.json) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
saida="$(npx vitest run \
  tests/integration/registro-de-provedores.test.ts tests/integration/cascata-de-stt.test.ts \
  tests/integration/usage-quota.test.ts tests/integration/usage-quota-reserve.test.ts \
  tests/integration/quota-enforcement.test.ts tests/integration/politica-de-custo.test.ts \
  tests/integration/orcamento-de-ia.test.ts tests/integration/teste-premium.test.ts \
  tests/planos-matriz.test.ts 2>&1)"
status=$?
if [ $status -ne 0 ]; then
  echo "guarda-de-ia: os testes de IA/cotas/planos falharam depois de editar ${arquivo##*/babel-play/}." >&2
  printf '%s\n' "$saida" | grep -E "FAIL|×|AssertionError|Error:|Test Files|Tests " | head -20 >&2
  echo "Regras: nunca Gemini, só retenção zero, o teste acaba nas 3 h (FRANQUIA_DO_TESTE). Skill: custo-de-ia." >&2
  exit 2
fi
exit 0
