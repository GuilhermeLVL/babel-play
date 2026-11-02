/**
 * PUBLICA OS PESOS DA SUPERTONIC 3 NO BUCKET R2 (voz no aparelho, openspec `voz-no-aparelho`).
 *
 *   npx tsx scripts/modelos/publicar-supertonic-no-r2.ts --bucket=frasy-modelos --via=wrangler [--seco]
 *   S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx tsx scripts/modelos/publicar-supertonic-no-r2.ts --bucket=frasy-modelos
 *
 * Para cada arquivo de `ARQUIVOS_DO_SUPERTONIC` (`src/core/voz/supertonic.ts`): baixa de
 * `huggingface.co/Supertone/supertonic-3/resolve/<REVISAO_DO_SUPERTONIC>/<caminho>` (endereço imutável), CONFERE tamanho e
 * sha256 contra a lista fixada (diferença = aborta: o bucket nunca recebe um byte que a lista não descreve) e grava em
 * `supertonic-3/<caminho>` com `Cache-Control: immutable`. É o MESMO layout que o app monta a partir de
 * `VITE_VOZ_MODELO_URL=https://<domínio do bucket>/supertonic-3` (`urlDoArquivo`). Idempotente no modo S3.
 *
 * Pesos sob BigScience OpenRAIL-M (Supertone/supertonic-3): as restrições de uso precisam acompanhar quem os recebe
 * (ver `docs/` e o parecer pendente). O bucket precisa estar PÚBLICO com CORS liberando GET da origem do app.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assinarSigV4, type ConfigS3 } from '../../server/lib/armazenamento';
import { ARQUIVOS_DO_SUPERTONIC, REVISAO_DO_SUPERTONIC } from '../../src/core/voz/supertonic';

export const PREFIXO_NO_BUCKET = 'supertonic-3';

/** A chave no bucket: o layout de `urlDoArquivo(raiz, a)` com a raiz `<domínio>/supertonic-3`. */
export const chaveNoBucket = (caminho: string): string => `${PREFIXO_NO_BUCKET}/${caminho}`;

export const origemDoArquivo = (caminho: string): string =>
  `https://huggingface.co/Supertone/supertonic-3/resolve/${REVISAO_DO_SUPERTONIC}/${caminho}`;

export const tipoDe = (caminho: string): string =>
  caminho.endsWith('.json') ? 'application/json' : 'application/octet-stream';

export const sha256Hex = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

/** Confere o que veio contra o que a lista fixa: lança com o motivo, ou devolve. */
export function conferir(caminho: string, corpo: Buffer, bytes: number, sha256: string): void {
  if (corpo.length !== bytes)
    throw new Error(`INTEGRIDADE: ${caminho} veio com ${corpo.length} bytes, a lista diz ${bytes}`);
  const hex = sha256Hex(corpo);
  if (hex !== sha256)
    throw new Error(
      `INTEGRIDADE: ${caminho} veio com sha256 ${hex.slice(0, 12)}…, a lista diz ${sha256.slice(0, 12)}…`,
    );
}

async function chamarS3(cfg: ConfigS3, metodo: string, chave: string, corpo: Buffer | '' = '', tipo?: string) {
  const caminho = chave.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`/${cfg.bucket}/${caminho}`, cfg.endpoint);
  const cab = assinarSigV4({ metodo, url, corpo, contentType: tipo, cfg, agora: new Date() });
  return fetch(url, {
    method: metodo,
    headers: metodo === 'PUT' ? { ...cab, 'cache-control': 'public, max-age=31536000, immutable' } : cab,
    body: metodo === 'PUT' ? corpo : undefined,
  });
}

function enviarPorWrangler(bucket: string, chave: string, corpo: Buffer, tipo: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'supertonic-'));
  try {
    const arquivo = join(dir, 'objeto');
    writeFileSync(arquivo, corpo);
    const r = spawnSync(
      'npx',
      [
        'wrangler',
        'r2',
        'object',
        'put',
        `${bucket}/${chave}`,
        '--remote',
        '--file',
        arquivo,
        '--content-type',
        tipo,
        '--cache-control',
        'public, max-age=31536000, immutable',
      ],
      { encoding: 'utf8', env: process.env },
    );
    if (r.status !== 0)
      throw new Error(`wrangler put ${chave}: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-300)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function principal() {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const seco = process.argv.includes('--seco');
  const bucket = arg('bucket');
  const viaWrangler = arg('via') === 'wrangler';
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  if (!bucket || (!seco && !viaWrangler && (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY))) {
    console.error(
      'uso: npx tsx scripts/modelos/publicar-supertonic-no-r2.ts --bucket=<nome> [--via=wrangler] [--seco]',
    );
    process.exit(2);
  }
  if (!seco && viaWrangler && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) {
    console.error('--via=wrangler pede CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID no ambiente');
    process.exit(2);
  }
  const cfg: ConfigS3 = {
    endpoint: S3_ENDPOINT ?? '',
    bucket,
    regiao: S3_REGION || 'auto',
    accessKeyId: S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: S3_SECRET_ACCESS_KEY ?? '',
  };
  const total = ARQUIVOS_DO_SUPERTONIC.reduce((s, a) => s + a.bytes, 0) / 1_000_000;
  console.log(
    `[supertonic] ${ARQUIVOS_DO_SUPERTONIC.length} arquivo(s), ${total.toFixed(0)} MB, revisão ${REVISAO_DO_SUPERTONIC.slice(0, 8)}`,
  );
  let enviados = 0;
  let pulados = 0;
  for (const a of ARQUIVOS_DO_SUPERTONIC) {
    const chave = chaveNoBucket(a.caminho);
    if (seco) {
      console.log(`  ${chave} (${(a.bytes / 1_000_000).toFixed(1)} MB)`);
      continue;
    }
    if (!viaWrangler) {
      const existente = await chamarS3(cfg, 'HEAD', chave);
      if (existente.ok && Number(existente.headers.get('content-length')) === a.bytes) {
        pulados += 1;
        continue;
      }
    }
    const r = await fetch(origemDoArquivo(a.caminho));
    if (!r.ok) throw new Error(`${a.caminho}: HTTP ${r.status}`);
    const corpo = Buffer.from(await r.arrayBuffer());
    conferir(a.caminho, corpo, a.bytes, a.sha256);
    if (viaWrangler) enviarPorWrangler(bucket, chave, corpo, tipoDe(a.caminho));
    else {
      const put = await chamarS3(cfg, 'PUT', chave, corpo, tipoDe(a.caminho));
      if (!put.ok) throw new Error(`PUT ${chave}: HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
    }
    enviados += 1;
    console.log(`  ok ${chave}`);
  }
  if (!seco) console.log(`[supertonic] ${enviados} enviado(s), ${pulados} já estava(m) no bucket`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((e) => {
    console.error(`[supertonic] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
