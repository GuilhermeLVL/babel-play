#!/bin/bash
# uso: construir2.sh <nome> [sobrepor]
# Build de producao a partir da ARVORE ISOLADA (o commit de antes, exportado), com ou sem os arquivos
# deste conserto por cima. As mudancas do outro agente na arvore de trabalho nao entram.
set -e
NOME=$1
P="C:/Users/Guilh/AppData/Local/Temp/claude/c--Users-Guilh-OneDrive--rea-de-Trabalho-babel-play-lab/de918f0f-08be-4ee8-b701-1de5b0ff2546/scratchpad/perf-cli"
REPO=C:/Users/Guilh/dev/ei-polimento
MEUS="src/core/texto/memoDeTexto.ts src/core/texto/palavra.ts src/core/minigames/itemSource.ts src/core/minigames/termo.ts src/core/minigames/wordsearch.ts src/lib/jogos/saguaoEstavel.ts src/components/views/Play.tsx src/lib/captura/blocosDasFalas.ts src/components/views/captura/quest/HistoricoDoPrototipo.tsx src/styles/capturaNoCelular.css src/data/rotas/sessoes.ts src/data/funil.ts src/data/rotas/settings.ts src/lib/estado/useMetricas.ts src/lib/flags.ts src/components/views/Metrics.tsx src/lib/voz/cacheDeVoz.ts src/lib/voz/vozDaNuvem.ts src/components/views/captura/celular/CapturaDoPrototipo.tsx"
if [ "$2" = "sobrepor" ]; then
  for f in $MEUS; do mkdir -p "$(dirname "$P/arvore/$f")"; cp "$REPO/$f" "$P/arvore/$f"; done
  echo "sobrepostos: $(echo $MEUS | wc -w) arquivos"
fi
cd "$P/arvore"
while powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { \$_.CommandLine -match 'vite.js. build|vite.js build' }) { exit 0 } else { exit 1 }"; do echo "outro build do vite rodando; esperando"; sleep 10; done
export VITE_AUTH_REQUIRED=0 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= BERGAMOT_BAIXAR=0
node node_modules/vite/bin/vite.js build $3 --outDir "$P/$NOME/dist" --emptyOutDir > "$P/$NOME-vite.log" 2>&1
mkdir -p "$REPO/node_modules/.cache/perf-cli/$NOME"
node node_modules/esbuild/bin/esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile="$REPO/node_modules/.cache/perf-cli/$NOME/server.cjs" >> "$P/$NOME-vite.log" 2>&1
cp package.json "$P/$NOME/package.json"
echo FEITO $NOME; grep -c "" "$P/$NOME-vite.log"; tail -2 "$P/$NOME-vite.log"
