/**
 * GERA O MANIFESTO DOS PESOS (`src/gateway/manifestoDosPesos.json`) — change `modelos-confiaveis-e-offline`.
 *
 *   npx tsx scripts/modelos/gerar-manifesto-dos-pesos.ts           # regenera
 *   npx tsx scripts/modelos/gerar-manifesto-dos-pesos.ts --check   # falha se o arquivo estiver desatualizado
 *
 * Para cada modelo de `src/gateway/revisoesDosModelos.ts`, lista os arquivos NO COMMIT fixado pela API do Hub
 * (`tree/<sha>`, a mesma de `publicar-no-r2.ts`) e grava o tamanho de cada um e, nos pesos grandes (LFS), o
 * sha256 (`lfs.oid`) — o mesmo número que `publicar-no-r2.ts` confere antes de subir ao bucket. Só os
 * arquivos que os workers carregam (`arquivoInteressa`, a mesma régua da publicação).
 *
 * O navegador usa o manifesto em `src/gateway/cacheDePesos.ts`: um peso que não bate em bytes e sha256
 * NÃO vai ao Cache Storage (DISP-01: um `.onnx` truncado com 200 envenenava a legenda para sempre). E o
 * portão do deploy (`scripts/modelos/conferir-espelho.ts`) faz um HEAD de cada arquivo daqui no bucket.
 *
 * Trocar a revisão de um modelo sem regenerar isto reprova `tests/manifestoDosPesos.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REVISOES_DOS_MODELOS } from '../../src/gateway/revisoesDosModelos';
import { arquivoInteressa } from './publicar-no-r2';

export const CAMINHO_DO_MANIFESTO = join(process.cwd(), 'src', 'gateway', 'manifestoDosPesos.json');

interface ArquivoDoHub {
  type: string;
  path: string;
  size: number;
  lfs?: { oid: string; size: number };
}

/** `[bytes]` ou `[bytes, sha256]`: compacto, porque o JSON vai junto no bundle de cada worker. */
export type EntradaDoManifesto = [number] | [number, string];

async function listar(modelo: string, sha: string): Promise<ArquivoDoHub[]> {
  const r = await fetch(`https://huggingface.co/api/models/${modelo}/tree/${sha}?recursive=true`);
  if (!r.ok) throw new Error(`tree ${modelo}@${sha}: HTTP ${r.status}`);
  return ((await r.json()) as ArquivoDoHub[]).filter((e) => e.type === 'file' && arquivoInteressa(e.path));
}

/** `{ "<modelo>@<sha>": { "<arquivo>": entrada } }`: a chave de um arquivo é `<modelo>@<sha>/<arquivo>`. */
export type Manifesto = Record<string, Record<string, EntradaDoManifesto>>;

export async function gerarManifesto(): Promise<Manifesto> {
  const saida: Manifesto = {};
  for (const [modelo, sha] of Object.entries(REVISOES_DOS_MODELOS).sort(([a], [b]) => a.localeCompare(b))) {
    const arquivos = (await listar(modelo, sha)).sort((a, b) => a.path.localeCompare(b.path));
    const doModelo: Record<string, EntradaDoManifesto> = {};
    for (const a of arquivos) doModelo[a.path] = a.lfs ? [a.size, a.lfs.oid] : [a.size];
    saida[`${modelo}@${sha}`] = doModelo;
    console.log(`[manifesto] ${modelo}@${sha.slice(0, 8)}: ${arquivos.length} arquivo(s)`);
  }
  return saida;
}

/** Um arquivo por linha: o diff de uma revisão nova mostra exatamente o que mudou. */
export function serializar(m: Manifesto): string {
  const blocos = Object.entries(m).map(([chave, arquivos]) => {
    const linhas = Object.entries(arquivos).map(([p, e]) => `  ${JSON.stringify(p)}: ${JSON.stringify(e)}`);
    return ` ${JSON.stringify(chave)}: {\n${linhas.join(',\n')}\n }`;
  });
  return `{\n${blocos.join(',\n')}\n}\n`;
}

async function principal() {
  const texto = serializar(await gerarManifesto());
  if (process.argv.includes('--check')) {
    const atual = readFileSync(CAMINHO_DO_MANIFESTO, 'utf8');
    if (atual !== texto) {
      console.error('[manifesto] DESATUALIZADO: rode npx tsx scripts/modelos/gerar-manifesto-dos-pesos.ts');
      process.exit(1);
    }
    console.log('[manifesto] em dia');
    return;
  }
  writeFileSync(CAMINHO_DO_MANIFESTO, texto);
  console.log(`[manifesto] gravado em ${CAMINHO_DO_MANIFESTO}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => {
    console.error(`[manifesto] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  });
}
