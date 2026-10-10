#!/usr/bin/env bash
# ANTES e DEPOIS INTERCALADOS: cada configuracao roda 3x no build de antes e, em seguida, 3x no de depois.
# (A maquina e dividida com outros agentes: medir um lado inteiro e o outro horas depois comparava cargas
# diferentes da maquina, nao os dois builds.)
# uso: PASTA=<pasta com antes/ e depois/> bash intercalado.sh [grupo...]
set -u
S="${PASTA:?}"
M="${MEDIDA:-$(cd "$(dirname "$0")" && pwd)}"
GRUPOS="${*:-parado saguao traco nav navtoque carga}"
mkdir -p "$S/i-antes/dados" "$S/i-depois/dados"
(cd "$S/i-antes" && node "$M/servidor.mjs" "$S/antes" 4271 > servidor.log 2>&1 &)
(cd "$S/i-depois" && node "$M/servidor.mjs" "$S/depois" 4272 > servidor.log 2>&1 &)
sleep 1
par() {
  echo "=== $*"
  (cd "$S/i-antes" && URL0=http://127.0.0.1:4271 node "$@" 2>&1 | grep -E "MEDIANA|ERRO" | sed 's/^/antes  /')
  (cd "$S/i-depois" && URL0=http://127.0.0.1:4272 node "$@" 2>&1 | grep -E "MEDIANA|ERRO" | sed 's/^/depois /')
}
for g in $GRUPOS; do
  case $g in
    parado)
      par "$M/parado.mjs" cel-medio 3 '{}' '' nada
      par "$M/parado.mjs" cel-medio 3 '{}' '' giroquieto
      par "$M/parado.mjs" cel-medio 3 '{}' '' giro
      par "$M/parado.mjs" cel-fraco 3 '{}' '' nada
      par "$M/parado.mjs" cel-fraco 3 '{}' '' giroquieto
      par "$M/parado.mjs" cel-fraco 3 '{}' '' giro
      par "$M/parado.mjs" cel-medio 3 '{"desempenho":true}' '-desempenho' nada
      par "$M/parado.mjs" desktop 3 '{}' '' nada
      par "$M/parado.mjs" desktop 3 '{}' '' mouse
      ;;
    saguao)
      par "$M/parado.mjs" cel-medio 3 '{"fonteTrilha":true}' '-saguao' nada jogar
      par "$M/parado.mjs" cel-medio 3 '{"fonteTrilha":true}' '-saguao' giroquieto jogar
      par "$M/parado.mjs" cel-medio 3 '{"fonteTrilha":true}' '-saguao' giro jogar
      par "$M/parado.mjs" cel-fraco 3 '{"fonteTrilha":true}' '-saguao' nada jogar
      ;;
    traco)
      par "$M/tracoNav.mjs" cel-medio '{}' '-base' base 3
      par "$M/tracoNav.mjs" cel-fraco '{}' '-base' base 3
      par "$M/tracoNav.mjs" desktop '{}' '-base' base 3
      ;;
    nav) par "$M/navegar.mjs" cel-medio 3 '{}' '' ;;
    navtoque) par "$M/navegar.mjs" cel-medio 3 '{"semOcioso":true}' '-semocioso' ;;
    carga) par "$M/carga.mjs" cel-medio 3 ;;
  esac
done
for porta in 4271 4272; do for p in $(netstat -ano | grep "127.0.0.1:$porta " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID $p //F; done; done
echo TUDO-FIM
