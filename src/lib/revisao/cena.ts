/**
 * A CENA DO CARTÃO — de onde a palavra veio, para o verso da revisão (`cxCena`, `cartoes2.js:170-189`):
 * a frase da sessão, quem falou, o tempo da fala e o caminho até a sessão.
 *
 * O dado é o do app: as ocorrências do cartão (`GET /api/vocab/:id/ocorrencias`, uma consulta por
 * índice) e a transcrição da sessão (`GET /api/sessions/:id`), que dá quem falou e o tempo da fala.
 *
 * O CUSTO, que é o cuidado desta peça:
 *  · nada é lido na frente do cartão: a leitura começa quando a pessoa pede a resposta (ou toca em
 *    "Fala original");
 *  · as ocorrências ficam guardadas por cartão e a transcrição por sessão enquanto a revisão está
 *    aberta: vinte cartões da mesma reunião leem a transcrição uma vez;
 *  · O ÁUDIO NÃO É LIDO AQUI. Ele desce inteiro (o app não corta o arquivo no servidor), então só é
 *    pedido quando a pessoa toca para ouvir (`lib/audioDaSessao.urlDeAudio`, que reaproveita o que já
 *    está em memória).
 *
 * O app não guarda quadro do vídeo: a cena é sempre a de onda, com a inicial de quem falou.
 */
import { fetchOcorrencias, fetchSessionTranscript, type OcorrenciaDoCartao, type UtteranceRow } from '../../data/api';
import type { Recording, VocabCard } from '../../types';

export interface CenaDoCartao {
  sessionId: string;
  /** O título da sessão ("Reunião de produto"). */
  titulo: string;
  /** Quem falou, quando a transcrição diz. */
  quem: string;
  frase: string;
  /** A tradução da fala guardada na sessão, quando há. */
  traducao: string;
  inicioMs: number | null;
  fimMs: number | null;
  /** A sessão tem áudio gravado: "Fala original" toca a voz de verdade. */
  temAudio: boolean;
}

export interface OrigemDoCartao {
  /** A cena da frase que o cartão mostra hoje, ou `null` quando o cartão não tem fala de sessão. */
  cena: CenaDoCartao | null;
  /**
   * A palavra aparece numa sessão da pessoa, mas o cartão não nasceu dela (Anki, lista colada, palavra
   * solta): é o que o convite "Juntar a cena" oferece.
   */
  achada: CenaDoCartao | null;
  /** Outras frases em que a palavra apareceu (para "Trocar a frase" e "Outra frase"). */
  outrasFrases: Array<{ frase: string; titulo: string }>;
}

const ocorrenciasPorCartao = new Map<string, Promise<OcorrenciaDoCartao[]>>();
const falasPorSessao = new Map<string, Promise<{ titulo: string; falas: UtteranceRow[] } | null>>();

/** Esvazia o que foi lido (ao sair da revisão, e nos testes). */
export function esquecerCenas(): void {
  ocorrenciasPorCartao.clear();
  falasPorSessao.clear();
}

/** As ocorrências do cartão mudaram (a frase foi trocada): a próxima leitura busca de novo. */
export function esquecerCenaDoCartao(idDoCartao: string): void {
  ocorrenciasPorCartao.delete(idDoCartao);
}

function ocorrenciasDe(id: string): Promise<OcorrenciaDoCartao[]> {
  let p = ocorrenciasPorCartao.get(id);
  if (!p) {
    p = fetchOcorrencias(id);
    ocorrenciasPorCartao.set(id, p);
  }
  return p;
}

function falasDe(sessionId: string): Promise<{ titulo: string; falas: UtteranceRow[] } | null> {
  let p = falasPorSessao.get(sessionId);
  if (!p) {
    p = fetchSessionTranscript(sessionId)
      .then((t) => ({
        titulo: String((t.session as unknown as { title?: string | null })?.title ?? ''),
        falas: t.utterances ?? [],
      }))
      .catch(() => null);
    falasPorSessao.set(sessionId, p);
  }
  return p;
}

const igual = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const semPontuacao = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * A fala da sessão de onde a frase saiu. Pelo id quando a ocorrência o guarda (hoje o servidor grava
 * `utterance_id` nulo em todas); senão pelo texto: a fala igual à frase, ou a que a contém.
 */
export function acharFala(falas: readonly UtteranceRow[], o: Pick<OcorrenciaDoCartao, 'utteranceId' | 'sentence'>) {
  if (o.utteranceId) {
    const porId = falas.find((u) => u.id === o.utteranceId);
    if (porId) return porId;
  }
  const frase = semPontuacao(o.sentence);
  if (!frase) return undefined;
  return (
    falas.find((u) => semPontuacao(u.sourceText) === frase) ??
    falas.find((u) => {
      const texto = semPontuacao(u.sourceText);
      return texto.length > 0 && (texto.includes(frase) || frase.includes(texto));
    })
  );
}

async function cenaDaOcorrencia(o: OcorrenciaDoCartao, gravacoes: readonly Recording[]): Promise<CenaDoCartao | null> {
  if (o.originKind !== 'sessao' || !o.originRef || !(o.sentence ?? '').trim()) return null;
  const gravacao = gravacoes.find((g) => g.id === o.originRef);
  const lida = await falasDe(o.originRef);
  if (!lida && !gravacao) return null;
  const fala = acharFala(lida?.falas ?? [], o);
  return {
    sessionId: o.originRef,
    titulo: gravacao?.title || lida?.titulo || '',
    quem: (fala?.speakerName ?? '').trim(),
    frase: (o.sentence ?? '').trim(),
    traducao: (fala?.traducaoPolida ?? fala?.translatedText ?? '').trim(),
    inicioMs: fala?.tStartMs ?? null,
    fimMs: fala?.tEndMs ?? null,
    temAudio: !!gravacao?.audioUrl && typeof fala?.tStartMs === 'number' && typeof fala?.tEndMs === 'number',
  };
}

/**
 * Lê a origem de um cartão. Nunca lança: sem rede ou sem ocorrência, o cartão fica com o verso simples.
 */
export async function lerOrigemDoCartao(cartao: VocabCard, gravacoes: readonly Recording[]): Promise<OrigemDoCartao> {
  const vazia: OrigemDoCartao = { cena: null, achada: null, outrasFrases: [] };
  let ocorrencias: OcorrenciaDoCartao[];
  try {
    ocorrencias = await ocorrenciasDe(cartao.id);
  } catch {
    return vazia;
  }
  const deSessao = ocorrencias.filter((o) => o.originKind === 'sessao' && o.originRef && (o.sentence ?? '').trim());
  /* A cena é a da frase que o cartão mostra: a ocorrência com a mesma frase; senão, para um cartão
     nascido de sessão, a ocorrência da sessão de origem. */
  const daFrase = deSessao.find((o) => igual(o.sentence, cartao.sentence));
  const daOrigem = cartao.sourceSessionId ? deSessao.find((o) => o.originRef === cartao.sourceSessionId) : undefined;
  const escolhida = daFrase ?? (cartao.sentence ? undefined : daOrigem);
  const cena = escolhida ? await cenaDaOcorrencia(escolhida, gravacoes) : null;
  /* "Juntar a cena": só para o cartão que não nasceu de sessão e cuja palavra a pessoa já capturou. */
  const candidata = !cena && !cartao.sourceSessionId ? deSessao[0] : undefined;
  const achada = candidata ? await cenaDaOcorrencia(candidata, gravacoes) : null;
  const vistas = new Set<string>([(cartao.sentence ?? '').trim().toLowerCase()]);
  const outrasFrases: OrigemDoCartao['outrasFrases'] = [];
  for (const o of ocorrencias) {
    const f = (o.sentence ?? '').trim();
    if (!f || vistas.has(f.toLowerCase())) continue;
    vistas.add(f.toLowerCase());
    const titulo =
      o.originKind === 'sessao' && o.originRef ? (gravacoes.find((g) => g.id === o.originRef)?.title ?? '') : '';
    outrasFrases.push({ frase: f, titulo });
  }
  return { cena, achada, outrasFrases };
}

/* ---- "Juntar a cena": a escolha fica neste aparelho ---------------------------------------------- */

const CHAVE_DAS_JUNTADAS = 'revisao.cenasJuntadas';

function lerJuntadas(): string[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DAS_JUNTADAS) ?? '[]') as unknown;
    return Array.isArray(bruto) ? bruto.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** A pessoa já juntou a cena deste cartão (neste aparelho)? */
export const cenaJuntada = (idDoCartao: string): boolean => lerJuntadas().includes(idDoCartao);

/** Guarda a escolha. Os 500 mais recentes: é uma preferência, não um arquivo. */
export function juntarCena(idDoCartao: string): void {
  try {
    const l = lerJuntadas().filter((x) => x !== idDoCartao);
    l.push(idDoCartao);
    localStorage.setItem(CHAVE_DAS_JUNTADAS, JSON.stringify(l.slice(-500)));
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
}
