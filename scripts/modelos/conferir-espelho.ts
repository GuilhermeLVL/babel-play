/**
 * O PORTÃO DO ESPELHO (change `modelos-confiaveis-e-offline`, 3.3): antes de publicar um build cuja CSP NÃO
 * libera mais o Hugging Face nem o jsDelivr, confere que o bucket próprio tem TUDO o que o app vai pedir.
 *
 *   npx tsx scripts/modelos/conferir-espelho.ts --base=https://modelos.frasy.com.br [--ort=https://modelos.frasy.com.br/ort/1.26.0/]
 *
 * Faz um HEAD de cada arquivo de `src/gateway/manifestoDosPesos.json` (no layout `<modelo>/<sha>/<arquivo>` de
 * `publicar-no-r2.ts`), dos arquivos fixados do Parakeet e, com `--ort`, do runtime do ONNX (`ort-wasm-*`).
 * Um arquivo ausente (não 200) ou com tamanho diferente do manifesto reprova, com a lista: o deploy para antes
 * de publicar (`.github/workflows/deploy-worker.yml`). Sem `--base` (deploy sem espelho), não há o que conferir.
 */
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { ARQUIVOS_DO_PARAKEET } from '../../src/gateway/adapters/parakeetArquivos';
import manifesto from '../../src/gateway/manifestoDosPesos.json';
import { arquivosDoRuntime } from './publicar-no-r2';

type Entrada = [number] | [number, string];
type Manifesto = Record<string, Record<string, Entrada>>;

export interface ArquivoEsperado {
  url: string;
  bytes?: number;
}

const semBarra = (u: string) => u.replace(/\/+$/, '');

/** Tudo o que o bucket precisa servir, com o tamanho quando o sabemos. */
export function arquivosEsperados(
  base: string,
  opcoes: { ort?: string; runtime?: string[]; m?: Manifesto } = {},
): ArquivoEsperado[] {
  const raiz = semBarra(base);
  const m = opcoes.m ?? (manifesto as unknown as Manifesto);
  const fora: ArquivoEsperado[] = [];
  for (const [chave, arquivos] of Object.entries(m)) {
    const [modelo, sha] = chave.split('@');
    for (const [arquivo, [bytes]] of Object.entries(arquivos))
      fora.push({ url: `${raiz}/${modelo}/${sha}/${arquivo}`, bytes });
  }
  for (const a of ARQUIVOS_DO_PARAKEET) fora.push({ url: `${raiz}/${a.repo}/${a.revisao}/${a.nome}`, bytes: a.bytes });
  if (opcoes.ort) for (const nome of opcoes.runtime ?? []) fora.push({ url: `${semBarra(opcoes.ort)}/${nome}` });
  return fora;
}

export interface ResultadoDoPortao {
  conferidos: number;
  faltando: string[];
}

type Buscar = (url: string, init: RequestInit) => Promise<Pick<Response, 'status' | 'headers'>>;

export async function conferirEspelho(
  esperados: ArquivoEsperado[],
  buscar: Buscar = fetch,
  paralelos = 16,
): Promise<ResultadoDoPortao> {
  const faltando: string[] = [];
  let i = 0;
  const trabalhar = async () => {
    while (i < esperados.length) {
      const a = esperados[i++];
      try {
        const r = await buscar(a.url, { method: 'HEAD' });
        if (r.status !== 200) {
          faltando.push(`${a.url} (HTTP ${r.status})`);
          continue;
        }
        const tamanho = Number(r.headers.get('content-length'));
        if (a.bytes && Number.isFinite(tamanho) && tamanho > 0 && tamanho !== a.bytes)
          faltando.push(`${a.url} (tamanho ${tamanho}, o manifesto diz ${a.bytes})`);
      } catch (e) {
        faltando.push(`${a.url} (${(e as Error).message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelos, esperados.length) }, trabalhar));
  return { conferidos: esperados.length, faltando: faltando.sort() };
}

async function principal() {
  const arg = (n: string) =>
    process.argv
      .find((a) => a.startsWith(`--${n}=`))
      ?.slice(n.length + 3)
      ?.trim();
  const base = arg('base');
  if (!base || !/^https:\/\//.test(base)) {
    console.log('[espelho] sem --base=https://… (deploy sem espelho próprio): nada a conferir');
    return;
  }
  const ort = arg('ort') || undefined;
  const runtime = ort ? arquivosDoRuntime(readdirSync(arg('dir') ?? 'public')) : [];
  if (ort && !runtime.length) throw new Error('nenhum ort-wasm-* em public/ (rode scripts/copiar-assets-runtime.mjs)');
  const esperados = arquivosEsperados(base, { ort, runtime });
  const { conferidos, faltando } = await conferirEspelho(esperados);
  if (faltando.length) {
    console.error(`[espelho] ${faltando.length} de ${conferidos} arquivo(s) FALTANDO no bucket:`);
    for (const f of faltando.slice(0, 50)) console.error(`  ${f}`);
    console.error('Publique com scripts/modelos/publicar-no-r2.ts (pesos e --prefixo=ort/<versão>) antes do deploy.');
    process.exit(1);
  }
  console.log(`[espelho] ${conferidos} arquivo(s) conferidos no bucket ✓`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => {
    console.error(`[espelho] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  });
}
