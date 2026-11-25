/**
 * PREPARA (e, só com `--publicar`, ENVIA) A COLEÇÃO CURADA DE AVATARES AO BUCKET R2.
 *
 *   npx tsx scripts/avatar/publicar-colecao-no-r2.ts --bucket=frasy-avatares-staging            # só confere e lista
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
 *   npx tsx scripts/avatar/publicar-colecao-no-r2.ts --bucket=frasy-avatares-staging --publicar # envia (ato do dono)
 *
 * O sentido do script é o MESMO de `VITE_AVATARES_URL`: o app monta `<VITE_AVATARES_URL>/colecao/<id>.vrm`
 * (`src/lib/avatar/fontes.ts`), então a chave no bucket é `colecao/<id>.vrm`. Antes de qualquer envio o script
 * CONFERE cada arquivo de `public/avatares/colecao/` contra o `LICENSES.md` de lá (SHA-256 e tamanho em bytes) e
 * contra o catálogo `COLECAO_CURADA`: arquivo que o catálogo não descreve, ou cujo hash mudou, ABORTA (o bucket
 * nunca recebe byte que o registro de licença não descreve). Sem `--publicar` nada sai da máquina.
 *
 * O envio é por `wrangler r2 object put --remote` (só token e conta, sem chaves S3), com `Cache-Control: immutable`
 * como os demais scripts de modelos. Publicar é ato do dono (decisão 34 de `docs/backlog/decisoes-do-dono.md`);
 * a ordem completa, o CORS e a CSP estão em `docs/runbooks/avatar-flags.md`.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { COLECAO_CURADA } from '../../src/data/avatar/colecao';
import { argsDoWrangler } from '../modelos/publicar-bergamot-no-r2';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
export const PASTA_DA_COLECAO = join(RAIZ, 'public', 'avatares', 'colecao');

export interface ObjetoDaColecao {
  id: string;
  arquivo: string;
  chave: string;
  bytes: number;
  sha256: string;
}

/** A chave no bucket: o que `urlDoModeloDaColecao` monta depois da base (`<base>/colecao/<id>.vrm`). */
export const chaveDaColecao = (id: string): string => `colecao/${id}.vrm`;

/** Linhas da tabela do `LICENSES.md`: arquivo, tamanho e SHA-256 registrados. */
export function lerRegistroDeLicencas(md: string): Map<string, { bytes: number; sha256: string }> {
  const out = new Map<string, { bytes: number; sha256: string }>();
  for (const linha of md.split('\n')) {
    const m = /^\|\s*`([^`]+\.vrm)`\s*\|.*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|\s*$/.exec(linha);
    if (m) out.set(m[1], { bytes: Number(m[2]), sha256: m[3] });
  }
  return out;
}

/**
 * Confere cada arquivo do catálogo contra o registro de licenças e o disco. Devolve os objetos publicáveis e a
 * lista de problemas (vazia = pode publicar). Puro quanto ao catálogo: `ler` e `tamanho` entram como parâmetros.
 */
export function conferirColecao(
  ids: string[],
  registro: Map<string, { bytes: number; sha256: string }>,
  ler: (arquivo: string) => Buffer | null,
): { objetos: ObjetoDaColecao[]; problemas: string[] } {
  const objetos: ObjetoDaColecao[] = [];
  const problemas: string[] = [];
  for (const id of ids) {
    const arquivo = `${id}.vrm`;
    const esperado = registro.get(arquivo);
    if (!esperado) {
      problemas.push(`${arquivo}: sem linha no LICENSES.md`);
      continue;
    }
    const corpo = ler(arquivo);
    if (!corpo) {
      problemas.push(`${arquivo}: arquivo ausente em public/avatares/colecao/`);
      continue;
    }
    const sha256 = createHash('sha256').update(corpo).digest('hex');
    if (sha256 !== esperado.sha256) problemas.push(`${arquivo}: SHA-256 diferente do LICENSES.md`);
    else if (corpo.length !== esperado.bytes) problemas.push(`${arquivo}: tamanho diferente do LICENSES.md`);
    else objetos.push({ id, arquivo, chave: chaveDaColecao(id), bytes: corpo.length, sha256 });
  }
  return { objetos, problemas };
}

function principal(): void {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const publicar = process.argv.includes('--publicar');
  const bucket = arg('bucket');
  if (!bucket) {
    console.error('uso: npx tsx scripts/avatar/publicar-colecao-no-r2.ts --bucket=<nome> [--publicar]');
    process.exit(2);
  }
  const registro = lerRegistroDeLicencas(readFileSync(join(PASTA_DA_COLECAO, 'LICENSES.md'), 'utf8'));
  const ids = COLECAO_CURADA.map((m) => m.id);
  const { objetos, problemas } = conferirColecao(ids, registro, (a) => {
    const p = join(PASTA_DA_COLECAO, a);
    return existsSync(p) && statSync(p).isFile() ? readFileSync(p) : null;
  });
  if (problemas.length > 0) {
    console.error(`[avatares] RECUSADO, nada foi enviado:\n  ${problemas.join('\n  ')}`);
    process.exit(3);
  }
  const total = objetos.reduce((n, o) => n + o.bytes, 0);
  console.log(
    `[avatares] ${objetos.length} arquivo(s), ${(total / 1048576).toFixed(1)} MiB, conferidos com o LICENSES.md`,
  );
  if (!publicar) {
    for (const o of objetos) console.log(`  ${bucket}/${o.chave} (${(o.bytes / 1048576).toFixed(1)} MiB)`);
    console.log('[avatares] simulação: nada enviado. Para enviar (ato do dono): --publicar');
    return;
  }
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.error('--publicar pede CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID no ambiente');
    process.exit(2);
  }
  for (const o of objetos) {
    const r = spawnSync(
      'npx',
      argsDoWrangler(bucket, o.chave, join(PASTA_DA_COLECAO, o.arquivo), 'model/gltf-binary'),
      { encoding: 'utf8', env: process.env },
    );
    if (r.status !== 0) {
      throw new Error(`wrangler put ${o.chave}: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-300)}`);
    }
    console.log(`  ↑ ${o.chave}`);
  }
  console.log(
    `[avatares] ${objetos.length} enviado(s). Próximo: portão de CORS/CSP do runbook, depois VITE_AVATARES_URL.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    principal();
  } catch (err) {
    console.error(`[avatares] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  }
}
