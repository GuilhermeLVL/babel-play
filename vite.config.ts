import { execFileSync } from 'node:child_process'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import { bergamotNoPublic } from './scripts/baixar-modelos-bergamot.mjs'
import { preCarregarEfemeroNaEdicaoEstatica } from './scripts/vite/preCarregarEfemero'
import { preCarregarFontes } from './scripts/vite/preCarregarFontes'
import { precomprimir } from './scripts/vite/precomprimir'
import { aplicarUrlPublica } from './scripts/vite/urlPublica'
import { montarVersao } from './server/lib/versao'

/**
 * Serve os assets do onnxruntime-web (usado pelo @ricky0123/vad-web) + modelo Silero + worklet
 * direto de /public, IGNORANDO a query `?import` que o Vite acrescenta ao import dinâmico do wasm
 * do ort (senão dá 404 e o Silero VAD não inicializa). Assets copiados de node_modules → /public.
 */
function serveVadOnnxAssets(): Plugin {
  const isAsset = (u: string) =>
    /\/(ort-wasm-[^/?]+\.(mjs|wasm)|silero_vad_[^/?]+\.onnx|vad\.worklet\.bundle\.min\.js)(\?|$)/.test(u)
  return {
    name: 'serve-vad-onnx-assets',
    /* GARANTE os assets em `public/` antes de servir ou empacotar. Eles não são versionados e só
       o `postinstall` os copiava: uma instalação sem ele (worktree nova, `npm ci --ignore-scripts`)
       subia o app com 404 em `/silero_vad_legacy.onnx`, e "Iniciar captura" falhava sem dizer por
       quê (24/09/2026). A cópia é idempotente — pula o que já existe com o mesmo tamanho. */
    buildStart() {
      execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'copiar-assets-runtime.mjs')], {
        stdio: 'inherit',
      })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (isAsset(url)) {
          const base = url.split('?')[0].split('/').pop()!
          const file = path.join(__dirname, 'public', base)
          if (fs.existsSync(file)) {
            const ext = path.extname(file)
            res.setHeader(
              'Content-Type',
              ext === '.wasm' ? 'application/wasm' : ext === '.onnx' ? 'application/octet-stream' : 'text/javascript',
            )
            fs.createReadStream(file).pipe(res)
            return
          }
        }
        next()
      })
    },
  }
}

/**
 * O BERGAMOT NO BUILD (A9b): garante o motor e os modelos pt→en em `public/modelos/bergamot/`
 * (`scripts/baixar-modelos-bergamot.mjs`: baixa do bucket da Mozilla, confere o sha256, idempotente)
 * e diz ao cliente se pode oferecê-lo — `__BERGAMOT_PT_EN__`, lido por
 * `src/gateway/adapters/bergamotModelo.ts`. Roda no `config` (e não no `buildStart`, como o ORT)
 * porque o `define` precisa da resposta antes de o Vite montar a configuração. Build sem rede sai
 * com `false`: o app segue no opus-mt, sem prometer 31 MB que não estão no `dist`. Com
 * `VITE_BERGAMOT_MODELOS_URL` (R2/CDN) basta o motor, que sempre sai do próprio domínio.
 * `BERGAMOT_BAIXAR=0` desliga (nem baixa, nem oferece).
 */
function modelosDoBergamot(urlDosModelos: string | undefined): Plugin {
  return {
    name: 'modelos-do-bergamot',
    config() {
      if (process.env.BERGAMOT_BAIXAR === '0') return { define: { __BERGAMOT_PT_EN__: 'false' } }
      try {
        execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'baixar-modelos-bergamot.mjs')], {
          stdio: 'inherit',
        })
      } catch {
        /* o script já avisou; sem os arquivos, a conferência abaixo diz `false` */
      }
      const disponivel = bergamotNoPublic({
        raiz: path.join(__dirname, 'public', 'modelos', 'bergamot'),
        exigirModelos: !urlDosModelos?.trim(),
      })
      return { define: { __BERGAMOT_PT_EN__: JSON.stringify(disponivel) } }
    },
  }
}

/**
 * Canonical e og do `index.html` a partir de `VITE_PUBLIC_URL` — ou fora do HTML, sem ela.
 * `order: 'pre'` roda antes da troca de `%VAR%` do próprio Vite. Ver `scripts/vite/urlPublica.ts`.
 */
function urlPublica(url: string | undefined): Plugin {
  return {
    name: 'url-publica',
    transformIndexHtml: { order: 'pre', handler: (html) => aplicarUrlPublica(html, url) },
  }
}

/**
 * A VERSÃO DO APP no bundle (P0-7b). `define` troca `__APP_VERSION__` pela string no build — o
 * cliente compara com o cabeçalho `x-babel-versao` do servidor e mostra na tela Sobre. E grava
 * `dist/versao.json`: é ele que o servidor de produção lê, para os dois lados dizerem a MESMA
 * versão mesmo quando o ambiente do runtime é outro (ver `server/lib/versao.ts`).
 */
function versaoNoBuild(versao: string): Plugin {
  return {
    name: 'versao-do-app',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ versao }) })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const pacote = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')) as { version: string }
  const versao = montarVersao(pacote.version, process.env)
  return {
    define: { __APP_VERSION__: JSON.stringify(versao) },
    // Cache de pré-bundle (optimizeDeps/esbuild) FORA do OneDrive: sobre a pasta sincronizada
    // o filtro do OneDrive estrangula/trava o churn de arquivos do otimizador no boot do dev.
    // Em disco local (tmp) o optimize completa em segundos. (Cross-platform via os.tmpdir().)
    // `VITE_CACHE_DIR` separa o cache quando várias worktrees sobem servidor ao mesmo tempo —
    // com uma pasta só, um servidor invalida o pré-bundle do outro.
    cacheDir: process.env.VITE_CACHE_DIR || path.join(os.tmpdir(), 'babel-play-web-vite'),
    /* `precomprimir` por último: grava `.br`/`.gz` de cada arquivo do `dist` e tira dele o que é só de
       desenvolvimento (protótipo de design, lucide.min.js) — ver scripts/vite/precomprimir.ts. */
    plugins: [
      react(),
      tailwindcss(),
      serveVadOnnxAssets(),
      modelosDoBergamot(env.VITE_BERGAMOT_MODELOS_URL || process.env.VITE_BERGAMOT_MODELOS_URL),
      urlPublica(env.VITE_PUBLIC_URL),
      versaoNoBuild(versao),
      // Edição estática: o servidor em memória vem como modulepreload (sem cascata no arranque).
      preCarregarEfemeroNaEdicaoEstatica(env.VITE_EDICAO_ESTATICA === '1' || process.env.VITE_EDICAO_ESTATICA === '1'),
      preCarregarFontes(),
      precomprimir(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@core': path.resolve(__dirname, './src/core'),
      },
    },
    // Worker do Whisper usa módulos ES; transformers.js gerencia seu próprio wasm (fora do pre-bundle).
    worker: { format: 'es' as const },
    build: {
      rollupOptions: {
        /**
         * O NÚCLEO (`src/core`) NÃO TEM EFEITO COLATERAL DE IMPORTAÇÃO — é TS puro (ver
         * `src/core/index.ts`): só declarações, e o único comando de topo (`cefrWordlist.ts`,
         * `indices.set`) enche um mapa do próprio módulo. Dizer isso ao Rollup é o que faz o barril
         * `@core` parar de arrastar o núcleo inteiro para quem importa UMA função dele: sem a
         * marca, qualquer `const X = f(...)` de topo (tabelas montadas no carregamento) conta como
         * efeito e o módulo entra mesmo com nenhum export usado. Medido na auditoria de performance
         * do frontend (26/09/2026, `scripts/perf/telas/composicao-bundle.mjs`).
         *
         * Um módulo do núcleo que um dia PRECISAR de efeito ao ser importado (registrar algo num
         * mapa global, por exemplo) tem de sair desta regra — senão some do bundle em silêncio.
         */
        treeshake: {
          moduleSideEffects: (id: string) => !/[\\/]src[\\/]core[\\/]/.test(id),
        },
        output: {
          /**
           * VENDORS PESADOS EM CHUNKS PRÓPRIOS.
           *
           * O bundle de arranque era UM arquivo de 631 kB e o Vite avisava a cada build
           * ("Some chunks are larger than 500 kB"). Medido no build: 548 kB de react-dom e
           * 810 kB de @supabase/* (pré-minificação) viviam dentro dele junto com o código do app.
           *
           * O que isto conserta é PESO DE ARQUIVO e CACHE, não tempo de execução: o `bootup-time`
           * do Lighthouse no /jogar atribui 1169 ms a *scripting* e só 2 ms a *parse/compile*,
           * então dividir não devolve tempo de CPU — devolve a possibilidade de o navegador
           * reaproveitar react-dom entre deploys em vez de rebaixar 180 KiB inteiros a cada
           * mudança de uma linha do app.
           *
           * O @supabase JÁ NÃO ESTÁ no grafo de arranque: `src/lib/supabase.ts` passou a puxá-lo
           * por `import()` e só quando há URL + chave (F0-08 — ele era 96% código não executado
           * no /jogar, porque com VITE_SUPABASE_ANON_KEY vazia o cliente é `null`). A regra segue
           * aqui de propósito: ela é o que mantém o pacote em UM chunk sob demanda em vez de
           * espalhado, e o que garante que ele não volte a ser fundido no arranque se um dia
           * alguém reintroduzir um import estático.
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (/[\\/]node_modules[\\/](react-dom|react|scheduler)[\\/]/.test(id)) return 'vendor-react'
            if (/[\\/]node_modules[\\/](@supabase[\\/][^\\/]+|iceberg-js)[\\/]/.test(id)) return 'vendor-supabase'
          },
        },
      },
    },
    optimizeDeps: {
      // vad-web (CJS) + onnxruntime-web pré-bundlados JÁ NO START — senão o Vite os descobre só quando
      // a captura abre, re-otimiza no meio da sessão e o require do ort quebra ("Dynamic require").
      // transformers.js fica fora (o Web Worker cuida do wasm dele).
      include: ['@ricky0123/vad-web', 'onnxruntime-web'],
      exclude: ['@huggingface/transformers'],
    },
    server: {
      /* WORKTREE COM `node_modules` EM JUNÇÃO: o Vite resolve a junção para a pasta de verdade, que
         fica fora da raiz, e recusava (403) as fontes do @fontsource. A pasta real entra na lista. */
      fs: { allow: [__dirname, fs.realpathSync(path.join(__dirname, 'node_modules'))] },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  }
})
