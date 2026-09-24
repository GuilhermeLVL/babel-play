/**
 * RECIFRA OS SEGREDOS AINDA PRESOS NA CHAVE LEGADA — e é o ÚNICO lugar onde ela ainda existe.
 *
 *   npx tsx scripts/db/recifrar-segredos-legados.ts             # só conta (não escreve nada)
 *   npx tsx scripts/db/recifrar-segredos-legados.ts --aplicar   # recifra com a chave atual
 *
 * HISTÓRIA. Antes da correção da auditoria, faltando `SECRET_KEY`, o servidor cifrava as credenciais
 * de IA com uma chave derivada de uma frase FIXA no código-fonte — quem tivesse o banco lia os
 * segredos. A correção passou a exigir `SECRET_KEY` (ou gerar uma chave local aleatória), mas o
 * servidor continuou carregando a chave legada para LER blobs antigos e recifrá-los no primeiro uso
 * (`server/crypto.ts:100`, achado S-11). Na Fase 6 do lançamento ela saiu do servidor: uma chave
 * pública dentro do processo de produção é um convite, e a produção nasce sem nenhum dado antigo
 * (é o primeiro deploy — não existe blob legado para ler).
 *
 * Sobrou este script para quem roda self-host desde antes da correção: ele percorre `secrets`,
 * tenta a chave ATUAL (a mesma resolução de `server/crypto.ts`: `SECRET_KEY` ou o `secret.key` do
 * diretório de dados) e, se ela não abre, a legada. O que só a legada abre é recifrado com a atual.
 * O que nenhuma abre é contado e deixado como está — apagar credencial é decisão do dono.
 *
 * Sai com 0 quando não sobra nada legado; com 3 quando há legado e faltou `--aplicar`; com 4 quando
 * há blob que nenhuma chave abre.
 */
import { createDecipheriv, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** A chave do fallback antigo. Não use para nada além de LER aqui. */
const CHAVE_LEGADA = scryptSync('dev-only-insecure-key-change-me', 'babel-play-web:secrets', 32);

export function decifrarComChaveLegada(blob: string): string {
  const [ivB, tagB, encB] = blob.split('.');
  if (!ivB || !tagB || !encB) throw new Error('segredo malformado');
  const decifra = createDecipheriv('aes-256-gcm', CHAVE_LEGADA, Buffer.from(ivB, 'base64'), { authTagLength: 16 });
  decifra.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decifra.update(Buffer.from(encB, 'base64')), decifra.final()]).toString('utf8');
}

/** O mínimo do cliente libsql que o script usa — injetável para o teste. */
export interface ClienteSql {
  execute(
    q: string | { sql: string; args: Array<string | number> },
  ): Promise<{ rows: ArrayLike<Record<string, unknown>> }>;
}

export interface Resultado {
  total: number;
  atuais: number;
  legados: number;
  recifrados: number;
  ilegiveis: number;
}

export async function recifrarLegados(
  cliente: ClienteSql,
  opts: { aplicar: boolean; decifrarAtual: (b: string) => string; cifrar: (v: string) => string },
): Promise<Resultado> {
  const r: Resultado = { total: 0, atuais: 0, legados: 0, recifrados: 0, ilegiveis: 0 };
  const { rows } = await cliente.execute('SELECT ref, value_encrypted FROM secrets');
  for (const linha of Array.from(rows)) {
    r.total += 1;
    const ref = String(linha.ref);
    const blob = String(linha.value_encrypted);
    try {
      opts.decifrarAtual(blob);
      r.atuais += 1;
      continue;
    } catch {
      /* não é da chave atual — tenta a legada abaixo */
    }
    let valor: string;
    try {
      valor = decifrarComChaveLegada(blob);
    } catch {
      r.ilegiveis += 1;
      continue;
    }
    r.legados += 1;
    if (opts.aplicar) {
      await cliente.execute({
        sql: 'UPDATE secrets SET value_encrypted = ?, updated_at = ? WHERE ref = ?',
        args: [opts.cifrar(valor), Date.now(), ref],
      });
      r.recifrados += 1;
    }
  }
  return r;
}

async function principal() {
  const aplicar = process.argv.includes('--aplicar');
  const { client } = await import('../../server/db/db');
  const { decryptSecret, encryptSecret } = await import('../../server/crypto');
  const r = await recifrarLegados(client as unknown as ClienteSql, {
    aplicar,
    decifrarAtual: decryptSecret,
    cifrar: encryptSecret,
  });
  console.log(
    `[recifrar] ${r.total} segredo(s): ${r.atuais} na chave atual, ${r.legados} na chave legada` +
      (aplicar ? `, ${r.recifrados} recifrado(s)` : ' (nada escrito: rode com --aplicar)') +
      `, ${r.ilegiveis} ilegível(is)`,
  );
  if (r.ilegiveis > 0) process.exit(4);
  if (r.legados > r.recifrados) process.exit(3);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal();
}
