/**
 * O ID DO LIVRO QUE VAI AO SERVIDOR. No aparelho, o arquivo da pessoa é `arq:<sha-256>` (o mesmo arquivo cai
 * nas mesmas anotações). Esse hash não sai daqui: o servidor recebe `arq:<HMAC-SHA256(chave, sha)>`, com a
 * chave da pessoa derivada NO SERVIDOR (`GET /api/leitura/chave`, de `SECRET_KEY`) — a mesma em todo aparelho
 * da pessoa, e fora do banco. Livro do catálogo, sessão e `meu-…` (id aleatório) vão como estão.
 *
 * Vale para as anotações (`anotacoesDoLivro.ts`) e para a origem do cartão no deck (`livro:<id>`).
 */
import * as api from '../../data/rotas/leitura';

let chave: Promise<CryptoKey | null> | null = null;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

function chaveDaPessoa(ler: typeof api.lerChaveDoLivro): Promise<CryptoKey | null> {
  chave ??= ler()
    .then((r) =>
      r.ok ? crypto.subtle.importKey('raw', deHex(r.chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) : null,
    )
    .then((k) => {
      if (!k) chave = null; // sem rede ou sem conta: tenta de novo na próxima vez
      return k;
    })
    .catch(() => {
      chave = null;
      return null;
    });
  return chave;
}

/** Esquece a chave guardada (troca de conta; e os testes). */
export function esquecerChaveDoLivro(): void {
  chave = null;
}

/**
 * O id que o servidor vê. `null` = livro trazido sem a chave agora (sem rede): não sincroniza desta vez, e o
 * hash nunca sai cru.
 */
export async function idRemotoDoLivro(
  livroId: string,
  ler: typeof api.lerChaveDoLivro = api.lerChaveDoLivro,
): Promise<string | null> {
  if (!livroId.startsWith('arq:')) return livroId;
  const k = await chaveDaPessoa(ler);
  if (!k) return null;
  const assinatura = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(livroId.slice('arq:'.length)));
  return `arq:${hex(assinatura).slice(0, 32)}`;
}
