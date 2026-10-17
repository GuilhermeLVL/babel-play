/**
 * PUBLICA OS MODELOS DO BERGAMOT NO BUCKET R2 (os 16 pares: o pt→en e os `paresDoCdn`).
 *
 *   S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com \
 *   S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *   npx tsx scripts/modelos/publicar-bergamot-no-r2.ts --bucket=babel-modelos            # publica
 *   npx tsx scripts/modelos/publicar-bergamot-no-r2.ts --bucket=babel-modelos --seco     # só lista
 *   npx tsx scripts/modelos/publicar-bergamot-no-r2.ts --bucket=... --pares=ja-en,zh-en
 *
 * Para cada par de `src/gateway/adapters/modelosDoBergamot.json`: baixa os três `.gz` do bucket da Mozilla
 * (`origem` + `caminhoNaOrigem`), CONFERE o sha256 do `.gz` contra o do JSON (diferença = aborta: o bucket nunca
 * recebe um byte que o JSON não descreve) e grava em `bergamot/<par>/<execução>/<arquivo>` com
 * `Cache-Control: immutable` — o MESMO layout que o app monta a partir de `VITE_BERGAMOT_MODELOS_URL`
 * (`adapters/bergamotModelo.ts`: `<base>/bergamot/<par>/<execução>/<arquivo>`). Execução nova = caminho novo.
 *
 * Idempotente: objeto que já existe com o mesmo tamanho é pulado. O `.gz` vai como arquivo (sem `Content-Encoding`):
 * quem descomprime é o worker (`DecompressionStream`), que depois confere o sha256 do conteúdo.
 *
 * O bucket precisa estar PÚBLICO (domínio próprio ou r2.dev) e com CORS liberando GET da origem do app — ver
 * `docs/LANCAMENTO.md`. Depois, no build: `VITE_BERGAMOT_MODELOS_URL=https://<domínio do bucket>`.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { assinarSigV4, type ConfigS3 } from '../../server/lib/armazenamento';
import modelos from '../../src/gateway/adapters/modelosDoBergamot.json';

interface ArquivoDoPar {
  nome: string;
  bytes: number;
  sha256: string;
}
interface ParDoJson {
  execucao: string;
  caminhoNaOrigem: string;
  arquivos: Record<string, ArquivoDoPar>;
}

/** Todos os pares publicáveis: o embutido (`pt-en`, que com a URL do CDN também sai de lá) e os do CDN. */
export function todosOsPares(): Record<string, ParDoJson> {
  return { ...modelos.pares, ...modelos.paresDoCdn } as Record<string, ParDoJson>;
}

/** A chave no bucket — o layout que o app monta (`<base>/bergamot/<par>/<execução>/<arquivo>`). */
export const chaveNoBucket = (par: string, execucao: string, nome: string): string =>
  `bergamot/${par}/${execucao}/${nome}`;

export const sha256Hex = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

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
  const so = arg('pares')?.split(',');
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  if (!bucket || (!seco && (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY))) {
    console.error(
      'uso: S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx tsx scripts/modelos/publicar-bergamot-no-r2.ts --bucket=<nome> [--seco] [--pares=ja-en,zh-en]',
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
  const origem = modelos.origem.replace(/\/?$/, '/');

  let enviados = 0;
  let pulados = 0;
  let bytes = 0;
  for (const [par, cfgDoPar] of Object.entries(todosOsPares())) {
    if (so && !so.includes(par)) continue;
    console.log(`[bergamot] ${par} (execução ${cfgDoPar.execucao})`);
    for (const a of Object.values(cfgDoPar.arquivos)) {
      const chave = chaveNoBucket(par, cfgDoPar.execucao, a.nome);
      if (seco) {
        console.log(`  ${chave} (${(a.bytes / 1048576).toFixed(1)} MB)`);
        continue;
      }
      const existente = await chamarS3(cfg, 'HEAD', chave);
      if (existente.ok && Number(existente.headers.get('content-length')) === a.bytes) {
        pulados += 1;
        continue;
      }
      const r = await fetch(`${origem}${cfgDoPar.caminhoNaOrigem}${a.nome}`);
      if (!r.ok) throw new Error(`${par}/${a.nome}: HTTP ${r.status}`);
      const corpo = Buffer.from(await r.arrayBuffer());
      const hex = sha256Hex(corpo);
      if (hex !== a.sha256) {
        throw new Error(
          `INTEGRIDADE: ${par}/${a.nome} veio com sha256 ${hex.slice(0, 12)}…, o JSON diz ${a.sha256.slice(0, 12)}…`,
        );
      }
      const put = await chamarS3(cfg, 'PUT', chave, corpo, 'application/gzip');
      if (!put.ok) throw new Error(`PUT ${chave}: HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
      enviados += 1;
      bytes += corpo.length;
      console.log(`  ↑ ${chave} (${(corpo.length / 1048576).toFixed(1)} MB)`);
    }
  }
  if (!seco)
    console.log(`[bergamot] ${enviados} enviado(s), ${pulados} já estavam lá, ${(bytes / 1048576).toFixed(0)} MB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => {
    console.error(`[bergamot] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  });
}
