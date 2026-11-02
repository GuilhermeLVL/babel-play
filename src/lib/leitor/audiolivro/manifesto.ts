/**
 * O AUDIOLIVRO NO CDN (F2): o ponteiro da versão, o manifesto e os tempos de um capítulo, lidos de `VITE_AUDIO_URL`.
 *
 * O PONTEIRO (ruling da F2, `docs/runbooks/audiolivros.md` §3): o contrato do manifesto não diz qual pasta `<versao>/`
 * usar; o cliente lê primeiro `audiolivros/<livroId>/<voz>/atual.json` (`{"versao": n}`, n inteiro ≥ 1), depois o
 * `manifesto.json`, e os arquivos ficam em `<versao>/<nn>.opus|json` (`chaveDoCapitulo`).
 *
 * QUALQUER falha (sem variável, 404, rede, timeout de 8 s, JSON fora do contrato) devolve `null`: o "Ouvir" lê com a
 * voz do aparelho, sem silêncio. Este módulo só é carregado (import dinâmico) com a flag `audiolivros` ligada e o
 * livro visível para quem lê.
 */
import { type FraseComTempo, type ManifestoDeAudio, validarManifesto } from '../../../core/leitura/audiolivro';

const TIMEOUT_PADRAO_MS = 8000;
/** Pedaço de caminho no CDN: só letras, dígitos, `_` e `-` (nada de `..` nem `/`). */
const SEGMENTO = /^[A-Za-z0-9_-]{1,120}$/;

interface OpcoesDeRede {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** A raiz do CDN (padrão: `urlDoAudio()`). */
  base?: string | null;
}

export interface ManifestoCarregado {
  manifesto: ManifestoDeAudio;
  /** A versão do lote apontada por `atual.json`: a pasta dos arquivos. */
  versao: number;
}

/** A raiz pública do áudio (`VITE_AUDIO_URL`, sem `/` final), ou `null` sem ela. */
export function urlDoAudio(): string | null {
  const v = (import.meta.env?.VITE_AUDIO_URL as string | undefined)?.trim();
  return v ? v.replace(/\/+$/, '') : null;
}

/** GET com teto de tempo; JSON ou `null` (nunca lança). */
async function pedirJson(url: string, o: OpcoesDeRede): Promise<unknown> {
  const f = o.fetch ?? fetch;
  const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((ok) => {
    timer = setTimeout(() => {
      controle?.abort();
      ok(null);
    }, o.timeoutMs ?? TIMEOUT_PADRAO_MS);
  });
  try {
    const pedido = (async () => {
      const r = await f(url, { credentials: 'omit', signal: controle?.signal });
      if (!r.ok) return null;
      return (await r.json()) as unknown;
    })().catch(() => null);
    return await Promise.race([pedido, limite]);
  } finally {
    clearTimeout(timer);
  }
}

/** A pasta do livro/voz no CDN, ou `null` (sem raiz, ou id/voz fora do padrão). */
export function pastaDaVoz(livroId: string, voz: string, base: string | null = urlDoAudio()): string | null {
  if (!base || !SEGMENTO.test(livroId) || !SEGMENTO.test(voz)) return null;
  return `${base}/audiolivros/${livroId}/${voz}`;
}

/** O ponteiro e o manifesto válidos do livro/voz, ou `null`. */
export async function carregarManifesto(
  livroId: string,
  voz: string,
  o: OpcoesDeRede = {},
): Promise<ManifestoCarregado | null> {
  const pasta = pastaDaVoz(livroId, voz, o.base === undefined ? urlDoAudio() : o.base);
  if (!pasta) return null;
  const atual = await pedirJson(`${pasta}/atual.json`, o);
  const versao = (atual as { versao?: unknown } | null)?.versao;
  if (typeof atual !== 'object' || Array.isArray(atual) || !Number.isInteger(versao) || (versao as number) < 1)
    return null;
  const bruto = await pedirJson(`${pasta}/manifesto.json`, o);
  const v = validarManifesto(bruto, livroId);
  if (!v.ok || v.manifesto.voz !== voz) return null;
  return { manifesto: v.manifesto, versao: versao as number };
}

/**
 * Os tempos `{i, t0, t1}` de um capítulo (`<nn>.json`), conferidos: `frases` itens, `i` em sequência, `t0 ≤ t1`, sem
 * sobreposição. Fora disso, `null` (o destaque desalinharia em silêncio).
 */
export async function carregarTempos(
  url: string,
  frases: number,
  o: OpcoesDeRede = {},
): Promise<FraseComTempo[] | null> {
  const bruto = await pedirJson(url, o);
  if (!Array.isArray(bruto) || bruto.length !== frases) return null;
  let fim = 0;
  for (const [k, x] of bruto.entries()) {
    const { i, t0, t1 } = (x ?? {}) as Partial<FraseComTempo>;
    if (i !== k || typeof t0 !== 'number' || typeof t1 !== 'number') return null;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 < fim || t1 < t0) return null;
    fim = t1;
  }
  return (bruto as FraseComTempo[]).map(({ i, t0, t1 }) => ({ i, t0, t1 }));
}
