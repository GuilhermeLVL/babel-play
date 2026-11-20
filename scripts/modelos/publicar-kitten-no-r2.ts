/**
 * ESPELHA OS PESOS DO KITTEN TTS 2 NO BUCKET R2 (voz natural no aparelho, openspec `voz-natural-no-aparelho-kitten`).
 *
 *   npx tsx scripts/modelos/publicar-kitten-no-r2.ts --bucket=frasy-modelos --seco            (só lista)
 *   npx tsx scripts/modelos/publicar-kitten-no-r2.ts --bucket=frasy-modelos --via=wrangler
 *   S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx tsx scripts/modelos/publicar-kitten-no-r2.ts --bucket=frasy-modelos
 *   [--variante=mini|pico]   (padrão: as duas)
 *
 * Para cada arquivo de `ARQUIVOS_DO_KITTEN` (`src/core/voz/kitten.ts`): baixa de
 * `huggingface.co/KittenML/kitten-tts-2-<variante>/resolve/<REVISAO_DO_KITTEN>/<caminho>` (endereço imutável), CONFERE
 * tamanho e sha256 contra a lista fixada (diferença = aborta: o bucket nunca recebe um byte que a lista não descreve) e
 * grava em `kitten-tts-2/<variante>/<caminho>` com `Cache-Control: immutable`. É o MESMO layout que o app monta a partir
 * de `VITE_VOZ_KITTEN_URL=https://<domínio do bucket>/kitten-tts-2` (`urlDoArquivoDoKitten`). Idempotente no modo S3.
 *
 * Pesos Apache-2.0 (KittenML): o aviso de licença acompanha o espelho (`LICENSE`/model card no HF). O bucket precisa
 * estar PÚBLICO com CORS liberando GET/HEAD (com `Range`) da origem do app.
 */
import { pathToFileURL } from 'node:url';

import type { ConfigS3 } from '../../server/lib/armazenamento';
import { ARQUIVOS_DO_KITTEN, REVISAO_DO_KITTEN, type VarianteDoKitten } from '../../src/core/voz/kitten';
import { chamarS3, conferir, enviarPorWrangler } from './publicar-supertonic-no-r2';

export const PREFIXO_DO_KITTEN = 'kitten-tts-2';

/** A chave no bucket: o layout de `urlDoArquivoDoKitten(raiz, v, a)` com a raiz `<domínio>/kitten-tts-2`. */
export const chaveDoKitten = (v: VarianteDoKitten, caminho: string): string => `${PREFIXO_DO_KITTEN}/${v}/${caminho}`;

export const origemDoKitten = (v: VarianteDoKitten, caminho: string): string =>
  `https://huggingface.co/KittenML/kitten-tts-2-${v}/resolve/${REVISAO_DO_KITTEN[v]}/${caminho}`;

export const tipoDoKitten = (caminho: string): string =>
  caminho.endsWith('.json') ? 'application/json' : 'application/octet-stream';

async function principal() {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const seco = process.argv.includes('--seco');
  const bucket = arg('bucket');
  const viaWrangler = arg('via') === 'wrangler';
  const so = arg('variante');
  const variantes: VarianteDoKitten[] = so === 'mini' || so === 'pico' ? [so] : ['mini', 'pico'];
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  if (!bucket || (!seco && !viaWrangler && (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY))) {
    console.error(
      'uso: npx tsx scripts/modelos/publicar-kitten-no-r2.ts --bucket=<nome> [--via=wrangler] [--variante=mini|pico] [--seco]',
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
  for (const v of variantes) {
    const lista = ARQUIVOS_DO_KITTEN[v];
    const total = lista.reduce((s, a) => s + a.bytes, 0) / 1_000_000;
    console.log(
      `[kitten] ${v}: ${lista.length} arquivo(s), ${total.toFixed(1)} MB, revisão ${REVISAO_DO_KITTEN[v].slice(0, 8)}`,
    );
    let enviados = 0;
    let pulados = 0;
    for (const a of lista) {
      const chave = chaveDoKitten(v, a.caminho);
      if (seco) {
        console.log(`  ${chave} (${(a.bytes / 1_000_000).toFixed(2)} MB, sha256 ${a.sha256.slice(0, 12)}…)`);
        continue;
      }
      if (!viaWrangler) {
        const existente = await chamarS3(cfg, 'HEAD', chave);
        if (existente.ok && Number(existente.headers.get('content-length')) === a.bytes) {
          pulados += 1;
          continue;
        }
      }
      const r = await fetch(origemDoKitten(v, a.caminho));
      if (!r.ok) throw new Error(`${v}/${a.caminho}: HTTP ${r.status}`);
      const corpo = Buffer.from(await r.arrayBuffer());
      conferir(`${v}/${a.caminho}`, corpo, a.bytes, a.sha256);
      if (viaWrangler) enviarPorWrangler(bucket, chave, corpo, tipoDoKitten(a.caminho));
      else {
        const put = await chamarS3(cfg, 'PUT', chave, corpo, tipoDoKitten(a.caminho));
        if (!put.ok) throw new Error(`PUT ${chave}: HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
      }
      enviados += 1;
      console.log(`  ok ${chave}`);
    }
    if (!seco) console.log(`[kitten] ${v}: ${enviados} enviado(s), ${pulados} já estava(m) no bucket`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((e) => {
    console.error(`[kitten] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
