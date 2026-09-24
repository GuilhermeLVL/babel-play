/**
 * PUBLICA OS PESOS DOS MODELOS LOCAIS NO BUCKET R2, NA REVISÃO FIXADA (Fase 5 / GAP-014).
 *
 *   S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com \
 *   S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *   npx tsx scripts/modelos/publicar-no-r2.ts --bucket=babel-modelos            # publica
 *   npx tsx scripts/modelos/publicar-no-r2.ts --bucket=babel-modelos --seco     # só lista
 *   npx tsx scripts/modelos/publicar-no-r2.ts --bucket=... --modelo=onnx-community/whisper-tiny
 *
 * Para cada modelo de `src/gateway/revisoesDosModelos.ts`:
 *   1. lista os arquivos do repositório NO COMMIT fixado (API do Hub, `tree/<sha>`);
 *   2. baixa cada um de `resolve/<sha>/…` — o endereço imutável;
 *   3. CONFERE o sha256 dos pesos grandes contra o `lfs.oid` que o próprio Hub publica para aquele
 *      commit. Diferença = aborta: o bucket nunca recebe um byte que o commit não descreve;
 *   4. grava no bucket em `<modelo>/<sha>/<arquivo>` com `Cache-Control: immutable` (o caminho muda
 *      quando a revisão muda, então nada velho fica servido).
 *
 * É idempotente: objeto que já existe com o mesmo tamanho é pulado. Só os dtypes que os workers
 * usam sobem (a mesma régua de `scripts/fetch-models.mjs`); o resto dos `.onnx` seria peso morto.
 *
 * O bucket precisa estar PÚBLICO (domínio próprio ou r2.dev) e com CORS liberando GET da origem do
 * app — ver `docs/LANCAMENTO.md`. Depois, no build: `VITE_SELF_HOST_MODELS=https://<domínio do bucket>`.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { assinarSigV4, type ConfigS3 } from '../../server/lib/armazenamento';
import { REVISOES_DOS_MODELOS } from '../../src/gateway/revisoesDosModelos';

/** Os dtypes que os workers carregam (ver o comentário em `scripts/fetch-models.mjs`). */
const DTYPES = ['fp32', 'q4', 'quantized', 'int8', 'fp16'];

export function arquivoInteressa(caminho: string): boolean {
  if (!caminho.endsWith('.onnx') && !caminho.endsWith('.onnx_data')) {
    // configs e tokenizers sempre; README, .gitattributes e afins, nunca
    return /\.(json|txt|model|spm)$/.test(caminho) && !caminho.startsWith('.');
  }
  /* fp32 NÃO tem sufixo no nome (`encoder_model.onnx`); os outros dtypes têm (`_q4`, `_quantized`…). */
  const sufixo = /_(fp16|int8|uint8|q4|q4f16|q8|bnb4|quantized)\.onnx(_data)?$/.exec(caminho);
  return DTYPES.includes(sufixo ? sufixo[1] : 'fp32');
}

export function chaveNoBucket(modelo: string, sha: string, caminho: string): string {
  return `${modelo}/${sha}/${caminho}`;
}

interface ArquivoDoHub {
  type: string;
  path: string;
  size: number;
  lfs?: { oid: string; size: number };
}

const tipoDe = (c: string) =>
  c.endsWith('.json') ? 'application/json' : c.endsWith('.txt') ? 'text/plain' : 'application/octet-stream';

async function listar(modelo: string, sha: string): Promise<ArquivoDoHub[]> {
  const r = await fetch(`https://huggingface.co/api/models/${modelo}/tree/${sha}?recursive=true`);
  if (!r.ok) throw new Error(`tree ${modelo}@${sha}: HTTP ${r.status}`);
  return ((await r.json()) as ArquivoDoHub[]).filter((e) => e.type === 'file' && arquivoInteressa(e.path));
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

async function principal() {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const seco = process.argv.includes('--seco');
  const bucket = arg('bucket');
  const so = arg('modelo');
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  if (!bucket || (!seco && (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY))) {
    console.error(
      'uso: S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx tsx scripts/modelos/publicar-no-r2.ts --bucket=<nome> [--seco] [--modelo=<id>]',
    );
    process.exit(2);
  }
  const cfg: ConfigS3 = {
    endpoint: S3_ENDPOINT ?? '',
    bucket,
    regiao: S3_REGION || 'auto',
    accessKeyId: S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: S3_SECRET_ACCESS_KEY ?? '',
  };

  let enviados = 0;
  let pulados = 0;
  let bytes = 0;
  for (const [modelo, sha] of Object.entries(REVISOES_DOS_MODELOS)) {
    if (so && so !== modelo) continue;
    const arquivos = await listar(modelo, sha);
    console.log(`[modelos] ${modelo}@${sha.slice(0, 8)}: ${arquivos.length} arquivo(s)`);
    for (const a of arquivos) {
      const chave = chaveNoBucket(modelo, sha, a.path);
      if (seco) {
        console.log(`  ${chave} (${(a.size / 1048576).toFixed(1)} MB)`);
        continue;
      }
      const existente = await chamarS3(cfg, 'HEAD', chave);
      if (existente.ok && Number(existente.headers.get('content-length')) === a.size) {
        pulados += 1;
        continue;
      }
      const r = await fetch(`https://huggingface.co/${modelo}/resolve/${sha}/${a.path}`);
      if (!r.ok) throw new Error(`${modelo}/${a.path}: HTTP ${r.status}`);
      const corpo = Buffer.from(await r.arrayBuffer());
      if (a.lfs) {
        const hex = createHash('sha256').update(corpo).digest('hex');
        if (hex !== a.lfs.oid) {
          throw new Error(
            `INTEGRIDADE: ${modelo}/${a.path} veio com sha256 ${hex.slice(0, 12)}…, o commit diz ${a.lfs.oid.slice(0, 12)}…`,
          );
        }
      }
      const put = await chamarS3(cfg, 'PUT', chave, corpo, tipoDe(a.path));
      if (!put.ok) throw new Error(`PUT ${chave}: HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
      enviados += 1;
      bytes += corpo.length;
      console.log(`  ↑ ${chave} (${(corpo.length / 1048576).toFixed(1)} MB)`);
    }
  }
  if (!seco)
    console.log(`[modelos] ${enviados} enviado(s), ${pulados} já estavam lá, ${(bytes / 1048576).toFixed(0)} MB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => {
    console.error(`[modelos] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  });
}
