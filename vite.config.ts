import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serve os assets do onnxruntime-web (usado pelo @ricky0123/vad-web) + modelo Silero + worklet
 * direto de /public, IGNORANDO a query `?import` que o Vite acrescenta ao import dinâmico do wasm
 * do ort (senão dá 404 e o Silero VAD não inicializa). Assets copiados de node_modules → /public.
 */
function serveVadOnnxAssets(): Plugin {
  const isAsset = (u: string) =>
    /\/(ort-wasm-[^/?]+\.(mjs|wasm)|silero_vad_[^/?]+\.onnx|vad\.worklet\.bundle\.min\.js)(\?|$)/.test(u);
  return {
    name: 'serve-vad-onnx-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (isAsset(url)) {
          const base = url.split('?')[0].split('/').pop()!;
          const file = path.join(__dirname, 'public', base);
          if (fs.existsSync(file)) {
            const ext = path.extname(file);
            res.setHeader(
              'Content-Type',
              ext === '.wasm'
                ? 'application/wasm'
                : ext === '.onnx'
                  ? 'application/octet-stream'
                  : 'text/javascript'
            );
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    // Cache de pré-bundle (optimizeDeps/esbuild) FORA do OneDrive: sobre a pasta sincronizada
    // o filtro do OneDrive estrangula/trava o churn de arquivos do otimizador no boot do dev.
    // Em disco local (tmp) o optimize completa em segundos. (Cross-platform via os.tmpdir().)
    cacheDir: path.join(os.tmpdir(), 'babel-play-web-vite'),
    plugins: [react(), tailwindcss(), serveVadOnnxAssets()],
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
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react-dom|react|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](@supabase[\\/][^\\/]+|iceberg-js)[\\/]/.test(id)) return 'vendor-supabase';
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
