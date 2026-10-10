#!/bin/bash
# A campanha de medida: ANTES (antes2) x DEPOIS, alternados por perfil, um navegador por vez.
cd "$(dirname "$0")"
export URL0=http://127.0.0.1:4320
for perfil in cel-medio cel-fraco desktop; do
  for build in antes2 depois; do
    echo "=== jogar $build $perfil $(date +%H:%M:%S)"
    timeout 900 node jogar.mjs $build $perfil 3 trilha 2>&1 | grep -v "^PARES\|FIM botoes" | cut -c1-400
  done
  for build in antes2 depois; do
    echo "=== captura $build $perfil $(date +%H:%M:%S)"
    timeout 600 node captura.mjs $build $perfil 3 2>&1 | cut -c1-500
  done
  for build in antes2 depois; do
    echo "=== pedidos $build $perfil $(date +%H:%M:%S)"
    timeout 400 node pedidos.mjs $build $perfil 1 2>&1 | cut -c1-300
  done
done
echo "=== FIM DA CAMPANHA $(date +%H:%M:%S)"
