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
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AUTH_REQUIRED=$VITE_AUTH_REQUIRED

# Falha CEDO e com mensagem clara, em vez de produzir uma SPA sem login.
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || \
    (echo "ERRO: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são build args obrigatórios no modo público." && \
     echo "      docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... ." && exit 1)

# Produz dist/ (SPA) e dist-server/server.cjs (servidor empacotado, deps externas).
RUN npm run build

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
RUN npm ci --omit=dev \
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

# /api/health é público (registrado antes do authMiddleware) e reporta banco E boot:
# um passo de migração que falhou deixa a probe em 503 em vez de subir mudo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "dist-server/server.cjs"]
