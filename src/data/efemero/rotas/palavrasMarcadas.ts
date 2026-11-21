/**
 * ESPELHO SEM CONTA — as palavras marcadas sem cartão ("Já sei" e "Ignorar").
 *
 * Metade de `src/data/rotas/palavrasMarcadas.ts`: as MESMAS rotas `/api/vocab/marcadas`, guardadas no `localStorage`
 * deste aparelho em vez da tabela, como as configurações (`./settings.ts`): são chaves curtas, lidas de uma vez. Sem
 * `localStorage` (janela privada, armazenamento bloqueado), a lista fica vazia e a escrita é best-effort.
 * O mesmo teto e a mesma redução de idioma e chave do servidor.
 *
 * Rotas: GET `/api/vocab/marcadas`, PUT `/api/vocab/marcadas`, DELETE `/api/vocab/marcadas`.
 */
import { baseLang } from '../../../core/texto/idioma';
import { chaveDaPalavra } from '../../../core/texto/palavra';
import { ehEstadoDaMarcacao, type PalavraMarcada, TETO_DE_MARCADAS } from '../../../core/vocabulario/marcadas';
import { json, lerJson, str } from '../nucleo';

const CHAVE_MARCADAS = 'babel.efemero.palavrasMarcadas';

/** Apaga as marcadas deste aparelho ("esquecer este navegador" e o fim da migração: `limparTudo`). */
export function esquecerMarcadasLocais(): void {
  try {
    localStorage.removeItem(CHAVE_MARCADAS);
  } catch {
    /* sem localStorage: não há o que apagar */
  }
}

function lerMarcadas(): PalavraMarcada[] {
  try {
    const bruto = localStorage.getItem(CHAVE_MARCADAS);
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return Array.isArray(lista)
      ? lista.filter(
          (m): m is PalavraMarcada =>
            !!m && typeof m.lang === 'string' && typeof m.chave === 'string' && ehEstadoDaMarcacao(m.estado),
        )
      : [];
  } catch {
    return [];
  }
}

function gravarMarcadas(lista: PalavraMarcada[]): boolean {
  try {
    localStorage.setItem(CHAVE_MARCADAS, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

const idiomaValido = (v: string | null) => (v && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v.trim()) ? baseLang(v) : '');

export async function listarMarcadas(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const lang = url.searchParams.get('lang');
  const idioma = lang ? idiomaValido(lang) : '';
  if (lang && !idioma) return json({ error: 'idioma inválido' }, 400);
  const lista = lerMarcadas()
    .filter((m) => !idioma || m.lang === idioma)
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  return json({ marcadas: lista, truncado: false });
}

export async function marcarPalavraLocal(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const idioma = idiomaValido(str(p.lang));
  const chave = chaveDaPalavra(str(p.chave)?.slice(0, 100));
  if (!idioma || !chave || !ehEstadoDaMarcacao(p.estado)) return json({ error: 'marcação inválida' }, 400);
  const lista = lerMarcadas();
  const i = lista.findIndex((m) => m.lang === idioma && m.chave === chave);
  if (i < 0 && lista.length >= TETO_DE_MARCADAS) {
    return json({ error: 'teto de palavras marcadas', code: 'marcadas_cheio', limite: TETO_DE_MARCADAS }, 409);
  }
  const marcada: PalavraMarcada = { lang: idioma, chave, estado: p.estado, atualizadoEm: Date.now() };
  if (i >= 0) lista[i] = marcada;
  else lista.push(marcada);
  if (!gravarMarcadas(lista)) return json({ error: 'sem armazenamento no aparelho' }, 507);
  return json({ marcada });
}

export async function desmarcarPalavraLocal(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const idioma = idiomaValido(url.searchParams.get('lang'));
  const chave = chaveDaPalavra(url.searchParams.get('chave')?.slice(0, 100));
  if (!idioma || !chave) return json({ error: 'marcação inválida' }, 400);
  const lista = lerMarcadas();
  const resto = lista.filter((m) => !(m.lang === idioma && m.chave === chave));
  if (resto.length !== lista.length) gravarMarcadas(resto);
  return new Response(null, { status: 204 });
}
