/**
 * ENVIA UM DUMP AO R2 (workflow `backup-pg-dump.yml`) com o MESMO cliente S3/SigV4 do servidor.
 *
 *   npx tsx scripts/backup/enviar-ao-r2.ts <arquivo.dump> <chave-no-bucket>
 *
 * Lê `R2_S3_ENDPOINT`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY` e `R2_S3_BUCKET` (padrão
 * `babel-backups`). Faltando qualquer uma, sai com 1 e diz o NOME da que falta (nunca o valor). Depois do
 * envio lê o objeto de volta e compara o sha256: um PUT que "deu certo" mas gravou outra coisa reprova.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { armazenamentoS3 } from '../../server/lib/armazenamento';

const [arquivo, chave] = process.argv.slice(2);
if (!arquivo || !chave) {
  console.error('uso: enviar-ao-r2.ts <arquivo.dump> <chave-no-bucket>');
  process.exit(2);
}

const faltando = ['R2_S3_ENDPOINT', 'R2_S3_ACCESS_KEY_ID', 'R2_S3_SECRET_ACCESS_KEY'].filter((n) => !process.env[n]);
if (faltando.length > 0) {
  console.error(`[backup] FALHOU: faltam variáveis de ambiente: ${faltando.join(', ')}`);
  process.exit(1);
}

const s3 = armazenamentoS3({
  endpoint: process.env.R2_S3_ENDPOINT as string,
  bucket: process.env.R2_S3_BUCKET || 'babel-backups',
  regiao: 'auto',
  accessKeyId: process.env.R2_S3_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY as string,
});

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const local = await readFile(arquivo);
if (local.length === 0) {
  console.error('[backup] FALHOU: o dump está vazio');
  process.exit(1);
}
await s3.gravarDeArquivo(chave, arquivo, 'application/octet-stream');
const remoto = await s3.ler(chave);
if (sha(remoto) !== sha(local)) {
  console.error(`[backup] FALHOU: o objeto ${chave} lido de volta não confere com o dump enviado`);
  process.exit(1);
}
console.log(
  `[backup] enviado e conferido: ${chave} (${(local.length / 1048576).toFixed(1)} MB, sha256 ${sha(local).slice(0, 12)})`,
);
