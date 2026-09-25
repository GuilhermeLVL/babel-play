# syntax=docker/dockerfile:1
#
# Imagem de produção do Babel Play (modo PÚBLICO multi-usuário).
#
# Base debian-slim, não alpine: `sharp` e `onnxruntime-node` (do cluster
# @huggingface/transformers) trazem binários nativos glibc que quebram em musl.
# Node 22 é o que o CI fixa (.github/workflows/ci.yml).

# ─── build ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Camada de dependências separada do código: só reinstala quando o lock muda.
COPY package.json package-lock.json ./
# `npm ci` completo (com devDeps): o build precisa de vite, esbuild e typescript.
# --ignore-scripts pula os postinstall nativos (esbuild/sharp/onnx) que o BUILD não usa;
# o estágio de runtime os instala de verdade.
RUN npm ci --ignore-scripts

COPY . .
# Binários de runtime (ORT wasm + Silero VAD) não são versionados: `npm ci --ignore-scripts`
# pulou o postinstall que os copia, então copiamos aqui, antes do build (falha se faltar).
RUN node scripts/copiar-assets-runtime.mjs --exigir

# As VITE_* são embutidas no bundle do CLIENTE em BUILD TIME — não adianta passá-las
# só no runtime. Sem elas, `src/lib/supabase.ts` cria um cliente nulo, `authRequired`
# do cliente fica false e a tela de login nunca aparece, enquanto o SERVIDOR continua
# exigindo token: o app builda, sobe, e ninguém consegue entrar.
#
# A anon key é pública por design (vai para o navegador de qualquer forma); quem protege
# é o RLS/policies do Supabase. Ainda assim ela vira uma CAMADA da imagem — não coloque
# aqui nada que não possa ser lido com `docker history`.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_AUTH_REQUIRED=1
# Fase 5 (todas opcionais): o domínio público (canonical/og do index.html), o bucket R2 dos pesos
# dos modelos (`https://…`, ou `1` para /models no mesmo domínio) e o DSN do Sentry do navegador.
ARG VITE_PUBLIC_URL
ARG VITE_SELF_HOST_MODELS
ARG VITE_SENTRY_DSN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AUTH_REQUIRED=$VITE_AUTH_REQUIRED \
    VITE_PUBLIC_URL=$VITE_PUBLIC_URL \
    VITE_SELF_HOST_MODELS=$VITE_SELF_HOST_MODELS \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# P0-7b: o commit entra na VERSÃO do app (`0.1.0+<sha7>`) já no build — o `vite.config.ts` a
# embute no bundle e grava `dist/versao.json`, que o servidor lê em runtime. Sem este ARG aqui o
# `--build-arg VERSAO` do deploy só chegava ao estágio de runtime e o bundle saía sem o sha.
ARG VERSAO
ENV GIT_SHA=$VERSAO

# Falha CEDO e com mensagem clara, em vez de produzir uma SPA sem login.
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || \
    (echo "ERRO: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são build args obrigatórios no modo público." && \
     echo "      docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... ." && exit 1)

# Produz dist/ (SPA) e dist-server/server.cjs (servidor empacotado, deps externas).
RUN npm run build

# ─── litestream ───────────────────────────────────────────────────────────────
# O binário OFICIAL do Litestream (github.com/benbjohnson/litestream), versão FIXADA e conferida
# pelo sha256 que o próprio GitHub publica para o asset da release (campo `digest` da API). Estágio
# próprio para o `curl` não ir parar na imagem de runtime. Atualizar = trocar a versão E os dois
# sha256 no mesmo commit; checksum que não bate derruba o build, que é o ponto.
FROM debian:bookworm-slim AS litestream
ARG LITESTREAM_VERSAO=0.5.17
ARG LITESTREAM_SHA256_AMD64=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ARG LITESTREAM_SHA256_ARM64=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5
ARG TARGETARCH
RUN set -eu; \
    apt-get update; apt-get install -y --no-install-recommends ca-certificates curl; \
    case "${TARGETARCH:-amd64}" in \
      amd64) arq=x86_64; soma="$LITESTREAM_SHA256_AMD64" ;; \
      arm64) arq=arm64;  soma="$LITESTREAM_SHA256_ARM64" ;; \
      *) echo "arquitetura sem checksum fixado: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/litestream.tar.gz \
      "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSAO}/litestream-${LITESTREAM_VERSAO}-linux-${arq}.tar.gz"; \
    echo "${soma}  /tmp/litestream.tar.gz" | sha256sum -c -; \
    mkdir /tmp/ls; tar -xzf /tmp/litestream.tar.gz -C /tmp/ls; \
    install -m 0755 "$(find /tmp/ls -type f -name litestream | head -n 1)" /usr/local/bin/litestream; \
    /usr/local/bin/litestream version

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Só dependências de produção. Isto só funciona porque `vite` deixou de ser exigido
# em runtime: o esbuild com --packages=external transformava o import estático num
# `require("vite")` no TOPO do bundle e a imagem quebrava no boot com
# "Cannot find module 'vite'". O import virou dinâmico, dentro do ramo de dev.
COPY package.json package-lock.json ./
# `npm ci --omit=dev` traz TODAS as `dependencies`, e boa parte delas é do CLIENTE: o Vite
# já as embutiu em `dist/` no estágio de build e o servidor nunca as carrega. Medido dentro
# da imagem: onnxruntime-node 513M, @ricky0123 (VAD) 138M, onnxruntime-web 130M,
# tesseract.js-core 44M, lucide-react 44M, country-flag-icons 22M.
#
# O bundle do servidor exige, de fato: @google/genai @libsql/client @mozilla/readability
# dotenv drizzle-orm express express-rate-limit helmet jose jsdom jszip mammoth zod
# (estáticos) + pdfjs-dist (dinâmico, import de documento). Nenhum dos removidos aparece
# nessa lista — e o boot do container é o teste: sem eles, ele sobe saudável.
# `--ignore-scripts`, e SEM ele a imagem NAO CONSTROI. Achado da validacao final da rodada de
# saneamento (2026-09-09), e o defeito e ANTERIOR a ela — esta em `main` desde o primeiro commit
# publico: o `postinstall` do `package.json` chama `scripts/copiar-assets-runtime.mjs`, e este
# estagio copia so `package.json` e `package-lock.json`. O `npm ci` falhava com
# "Cannot find module '/app/scripts/copiar-assets-runtime.mjs'".
#
# Ignorar e o certo, e nao um remendo: aquele script copia os binarios de RUNTIME DO CLIENTE (ORT
# wasm + Silero VAD) para `public/`, e o estagio de build ja o executa explicitamente antes do
# `vite build` — eles chegam aqui dentro de `dist/`, que e copiado logo abaixo. O estagio de build
# usa `--ignore-scripts` pela mesma razao e chama o script a mao.
RUN npm ci --omit=dev --ignore-scripts \
 && rm -rf \
      node_modules/onnxruntime-node \
      node_modules/onnxruntime-web \
      node_modules/onnxruntime-common \
      node_modules/@huggingface \
      node_modules/@ricky0123 \
      node_modules/tesseract.js node_modules/tesseract.js-core \
      node_modules/lucide-react \
      node_modules/country-flag-icons \
      node_modules/recharts \
      node_modules/react node_modules/react-dom \
 && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Os .sql das migrations NÃO entram no bundle do esbuild — são lidos do disco em runtime.
# Sem esta linha o boot falha com "no such table: sessions" num volume novo.
COPY --from=build /app/server/db/migrations ./server/db/migrations

# Fase 5 — operação do banco DENTRO da imagem (antes, `scripts/backup.mjs` ficava fora dela e o
# backup só rodava onde houvesse o repositório):
#   - `scripts/backup.mjs` só importa `@libsql/client`, que é dependência de produção e fica acima;
#   - `dist-server/operacao.cjs` (snapshot / restaurar-snapshot / verificar) já veio com o
#     `dist-server` do build;
#   - o Litestream, a configuração dele e o entrypoint que decide se ele entra.
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY --chmod=0755 scripts/iniciar-container.sh /usr/local/bin/iniciar-container.sh

# O que a CSP do servidor precisa enxergar das VITE_* (server/http/csp.ts) e a versão que o
# Sentry mostra. Repetidas aqui porque ARG não atravessa estágio sozinho.
ARG VITE_SUPABASE_URL
ARG VITE_SELF_HOST_MODELS
ARG VITE_SENTRY_DSN
ARG VERSAO
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SELF_HOST_MODELS=$VITE_SELF_HOST_MODELS \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    SENTRY_RELEASE=$VERSAO

# Diretório do banco e dos áudios. Em produção AMBOS devem ser volume — ver
# docker-compose.yml. Sem volume, o dado morre com o container.
#
# `chown` SÓ em /data. A versão anterior fazia `chown -R node:node /data /app` e a imagem
# saía com 4,08GB: o chown recursivo reescreve cada arquivo de /app, e o Docker grava a
# árvore inteira DE NOVO numa camada nova. O app só LÊ de /app — não precisa ser dono.
RUN mkdir -p /data/audio && chown -R node:node /data
ENV DATABASE_URL=file:/data/babel.db \
    AUDIO_DIR=/data/audio

# Dentro do container o bind PRECISA ser 0.0.0.0 — o default do app é 127.0.0.1
# (decisão de segurança para uso local) e por ele nada entraria de fora.
# Aqui a fronteira é a rede do container + AUTH_REQUIRED=1, não o bind.
ENV HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000

# A PROBE PASSOU A SER /api/ready (Fase 5), e a troca é sobre o que o Docker faz com a resposta.
#
# O `HEALTHCHECK` não reinicia nada: ele marca o container como `unhealthy`, e quem LÊ esse estado
# são as coisas que decidem ROTEAR — `depends_on: service_healthy` no compose, o reagendamento do
# Swarm, os proxies reversos que descartam alvo doente. Isso é readiness, não liveness, e é por
# isso que apontar para o `/api/health` estava errado por acidente: o health responde "o processo
# está vivo", e ele devolve 200 numa instância que subiu com o banco na versão anterior — que é
# exatamente a instância que não pode receber tráfego.
#
# `/api/ready` acrescenta ao que o health já cobria (banco por tabela REAL + passos de boot) as
# duas perguntas que faltavam: migrações aplicadas (journal x banco) e o armazenamento externo,
# quando há S3/R2 configurado. As duas rotas são públicas — registradas antes do authMiddleware.
#
# `--timeout=5s`: com S3 o `ready` faz um HEAD no bucket, e 5 s é folgado para isso na mesma
# região. `--start-period=40s` continua cobrindo migração + seed do primeiro boot, em que 503 é a
# resposta certa e não deve contar como falha.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
# Com as LITESTREAM_* no ambiente: restaura o banco do R2 se o volume estiver vazio e sobe o Node
# como filho do `litestream replicate` (que repassa o SIGTERM). Sem elas: `node` direto, como antes.
# Ver scripts/iniciar-container.sh.
ENTRYPOINT ["/usr/local/bin/iniciar-container.sh"]
