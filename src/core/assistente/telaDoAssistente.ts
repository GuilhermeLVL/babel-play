/**
 * AS REGRAS DA TELA DO ASSISTENTE AO VIVO (Fase C2; spec `docs/specs/2026-10-25-assistente-ao-vivo.md`) — puras, sem
 * React e sem rede: o que aparece (portão de flag, plano, recusa do servidor e consentimento), em que formato da janela,
 * quando uma linha merece uma chamada (o ORÇAMENTO) e onde cada destaque cai no texto da linha.
 *
 * O servidor decide; a tela só pinta. Mas a tela também é quem GASTA: cada chamada automática conta no teto do dia da
 * pessoa e custa dinheiro. Por isso as regras de quando chamar moram aqui, testadas, e não espalhadas num efeito.
 */
import type { CefrLevel } from '../learning/contract';
import type { Layout } from '../legendas/janelaFlutuante';
import { NIVEIS_CEFR } from './palavrasAcimaDoNivel';
import { candidatosATermo } from './termosCandidatos';

/* ─────────────────────────────── os ajustes guardados ─────────────────────────────── */

export interface AjustesDoAssistente {
  /** (2) As palavras acima do nível, 100% locais (também no Grátis). */
  niveis: boolean;
  /** O nível da pessoa para o recurso 2. */
  nivel: CefrLevel;
  /** (1) Expressões e gírias destacadas na linha (nuvem, pago). */
  expressoes: boolean;
  /** (3) Siglas e termos técnicos explicados em uma linha (nuvem, pago). */
  termos: boolean;
  /** (5) A correção gentil da própria fala (nuvem, pago). OPT-IN: nasce desligada. */
  correcao: boolean;
  /** A janela abre já na aba Assistente. */
  abrirNaAba: boolean;
}

export const AJUSTES_PADRAO: Readonly<AjustesDoAssistente> = Object.freeze({
  niveis: true,
  nivel: 'B1',
  expressoes: true,
  termos: true,
  correcao: false,
  abrirNaAba: false,
});

/** Aceita só o que tem forma de ajuste (o disco pode ter qualquer coisa); o resto cai no padrão. */
export function normalizarAjustes(bruto: unknown): AjustesDoAssistente {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Record<keyof AjustesDoAssistente, unknown>>;
  const sim = (k: Exclude<keyof AjustesDoAssistente, 'nivel'>) =>
    typeof o[k] === 'boolean' ? (o[k] as boolean) : AJUSTES_PADRAO[k];
  return {
    niveis: sim('niveis'),
    nivel: (NIVEIS_CEFR as readonly unknown[]).includes(o.nivel) ? (o.nivel as CefrLevel) : AJUSTES_PADRAO.nivel,
    expressoes: sim('expressoes'),
    termos: sim('termos'),
    correcao: sim('correcao'),
    abrirNaAba: sim('abrirNaAba'),
  };
}

/* ─────────────────────────────── o portão ─────────────────────────────── */

export interface ContextoDoAssistente {
  /** A flag `assistente_ao_vivo` (desligada de fábrica). */
  flagLigada: boolean;
  /** `assistenteDia` do plano: `0` = o plano não tem (Grátis, convidado), `null` = sem teto (self-host). */
  assistenteDiaDoPlano: number | null;
  /** O servidor já disse nesta sessão que não há assistente (`sem_plano` ou `fora`): o cache do cliente era velho. */
  recusadoNaSessao: boolean;
  /** A IA de nuvem autorizada (Ajustes → Privacidade). Sem ela, nada automático sai para a rede. */
  consentiuNuvem: boolean;
}

export interface RecursosDoAssistente {
  /** A nuvem do assistente existe para esta conta agora (flag + plano + servidor não recusou). */
  nuvem: boolean;
  niveis: boolean;
  expressoes: boolean;
  termos: boolean;
  /** O botão "Como respondo?" aparece (o consentimento é pedido na própria folha, num toque). */
  comoRespondo: boolean;
  correcao: boolean;
  /** Há alguma coisa do assistente para mostrar (decide a aba). */
  algum: boolean;
}

/**
 * O que aparece. Os recursos de nuvem (1, 3, 4 e 5) ficam ESCONDIDOS com a flag desligada ou sem o plano (decisão do
 * dono de 25/10/2026); o 2 é local e só depende do ajuste. O perfil protegido recebe os mesmos recursos (todos tratam
 * só a frase que a pessoa vê ou falou; o servidor já descarta o contexto do menor) — o que muda para ele é a copy,
 * nunca com oferta de plano.
 */
export function recursosDoAssistente(aj: AjustesDoAssistente, ctx: ContextoDoAssistente): RecursosDoAssistente {
  const nuvem = ctx.flagLigada && ctx.assistenteDiaDoPlano !== 0 && !ctx.recusadoNaSessao;
  const automatico = nuvem && ctx.consentiuNuvem;
  const r = {
    nuvem,
    niveis: aj.niveis,
    expressoes: automatico && aj.expressoes,
    termos: automatico && aj.termos,
    comoRespondo: nuvem,
    correcao: automatico && aj.correcao,
  };
  return { ...r, algum: r.niveis || nuvem };
}

/** O que cada layout da janela mostra. A FAIXA (jogo) fica mínima: só as marcas sutis. */
export interface AssistenteNoLayout {
  marcasSutis: boolean;
  /** As palavras acima do nível aparecem neste layout? Na faixa, não: no jogo elas seriam ruído (fica a expressão). */
  niveis: boolean;
  comoRespondo: boolean;
  correcao: boolean;
}

export function assistenteNoLayout(layout: Layout): AssistenteNoLayout {
  const faixa = layout === 'faixa';
  return { marcasSutis: faixa, niveis: !faixa, comoRespondo: !faixa, correcao: !faixa };
}

/* ─────────────────────────────── o orçamento de chamadas ─────────────────────────────── */

/** Expressões só em linha com pelo menos isto de palavras (a recomendação da spec). */
export const PALAVRAS_PARA_EXPRESSOES = 4;

const base = (lang: string | undefined) => (lang || '').toLowerCase().split('-')[0];
/** Escritas sem espaço entre palavras (chinês, japonês, tailandês, laosiano, khmer, birmanês). */
const ESCRITA_SEM_ESPACO =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Quantas palavras a linha tem. Nas escritas sem espaço, conta pelo `Intl.Segmenter` (granularidade de palavra) e, sem
 * ele, aproxima por caracteres (2 por palavra) — "≥ 4 palavras" continua querendo dizer uma frase, não um "はい".
 */
export function contarPalavras(s: string, lang?: string): number {
  if (!ESCRITA_SEM_ESPACO.test(s)) return s.split(/\s+/).filter((p) => /\p{L}/u.test(p)).length;
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        l?: string,
        o?: { granularity: 'word' },
      ) => {
        segment: (t: string) => Iterable<{ isWordLike?: boolean }>;
      };
    }
  ).Segmenter;
  if (Segmenter) {
    try {
      let n = 0;
      for (const seg of new Segmenter(lang || undefined, { granularity: 'word' }).segment(s)) if (seg.isWordLike) n++;
      return n;
    } catch {
      /* idioma que o Intl recusa: cai na aproximação */
    }
  }
  return Math.floor(s.replace(/[\s\p{P}]/gu, '').length / 2);
}

/** A fala, no que o orçamento precisa. */
export interface FalaDoAssistente {
  id: string;
  original: string;
  lado: 'eles' | 'voce';
  lang?: string;
  parcial?: boolean;
}

export interface PlanoDeChamadas {
  expressoes: boolean;
  /** As siglas candidatas (vazio = não chamar a rota de termos). */
  termos: string[];
  correcao: boolean;
}

export const NADA_A_CHAMAR: Readonly<PlanoDeChamadas> = Object.freeze({
  expressoes: false,
  termos: [],
  correcao: false,
});

/** Alguma chamada no plano? */
export const temChamada = (p: PlanoDeChamadas) => p.expressoes || p.termos.length > 0 || p.correcao;

/**
 * O que uma linha FINAL merece. Nada para parcial, linha vazia ou linha no idioma da própria pessoa (a ajuda é sobre o
 * idioma que ela aprende). A linha ganha expressões (≥ 4 palavras) e termos (só com sigla candidata local). A fala da
 * PRÓPRIA pessoa (microfone, `voce`) com a correção ligada (opt-in) ganha SÓ a correção. Sem ela, a linha do microfone
 * é tratada como qualquer outra: no "assistir" só com o microfone, quem fala ali é a TV, não a pessoa.
 */
export function planejarChamadas(f: FalaDoAssistente, r: RecursosDoAssistente, langDaPessoa: string): PlanoDeChamadas {
  const texto = f.original.trim();
  if (f.parcial || !texto) return NADA_A_CHAMAR;
  if (f.lang && base(f.lang) === base(langDaPessoa)) return NADA_A_CHAMAR;
  /* A própria fala com a correção ligada: só a correção (uma chamada por linha, não três). */
  if (f.lado === 'voce' && r.correcao) {
    return { expressoes: false, termos: [], correcao: contarPalavras(texto, f.lang) >= 2 };
  }
  return {
    expressoes: r.expressoes && contarPalavras(texto, f.lang) >= PALAVRAS_PARA_EXPRESSOES,
    termos: r.termos ? candidatosATermo(texto) : [],
    correcao: false,
  };
}

/* ─────────────────────────────── as marcas na linha ─────────────────────────────── */

export type TipoDeMarca = 'expressao' | 'termo' | 'nivel';

export interface MarcaNaLinha {
  inicio: number;
  fim: number;
  tipo: TipoDeMarca;
  /** O trecho como está na linha. */
  texto: string;
  /** O sentido (expressão) ou a explicação (termo). Ausente no nível: o sentido vem do dicionário ao tocar. */
  sentido?: string;
  /** No nível: o nível CEFR ou a faixa de frequência. */
  nivel?: CefrLevel | null;
  escala?: 'cefr' | 'frequencia' | 'fora_da_lista';
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Onde o trecho está na linha: a PRIMEIRA ocorrência, sem diferenciar maiúsculas, inteira e não no meio de uma palavra.
 * Nas escritas sem espaço (chinês, japonês…) não há borda de palavra para conferir: vale a ocorrência do trecho.
 */
export function posicaoNaLinha(linha: string, trecho: string): { inicio: number; fim: number } | null {
  const t = trecho.trim();
  if (!t) return null;
  const re = ESCRITA_SEM_ESPACO.test(t)
    ? new RegExp(escapar(t), 'iu')
    : new RegExp(`(?<![\\p{L}\\p{N}])${escapar(t)}(?![\\p{L}\\p{N}])`, 'iu');
  const m = re.exec(linha);
  return m ? { inicio: m.index, fim: m.index + m[0].length } : null;
}

/**
 * Junta os destaques numa lista ordenada e SEM SOBREPOSIÇÃO (uma palavra tem uma marca só). A expressão vence o termo,
 * que vence o nível: a expressão diz mais ("break a leg" ≠ "perna").
 *
 * Expressão e termo marcam só a PRIMEIRA ocorrência na linha (de propósito: a mesma sigla sublinhada três vezes numa
 * linha é ruído, e o sentido é um só). As palavras acima do nível vêm com a posição de cada uma e marcam todas.
 */
export function marcasDaLinha(
  linha: string,
  d: {
    expressoes?: ReadonlyArray<{ trecho: string; sentido: string }>;
    termos?: ReadonlyArray<{ termo: string; explicacao: string }>;
    niveis?: ReadonlyArray<{
      palavra: string;
      inicio: number;
      fim: number;
      nivel: CefrLevel | null;
      escala: MarcaNaLinha['escala'];
    }>;
  },
): MarcaNaLinha[] {
  const candidatas: MarcaNaLinha[] = [];
  for (const e of d.expressoes ?? []) {
    const p = posicaoNaLinha(linha, e.trecho);
    if (p) candidatas.push({ ...p, tipo: 'expressao', texto: linha.slice(p.inicio, p.fim), sentido: e.sentido });
  }
  for (const t of d.termos ?? []) {
    const p = posicaoNaLinha(linha, t.termo);
    if (p) candidatas.push({ ...p, tipo: 'termo', texto: linha.slice(p.inicio, p.fim), sentido: t.explicacao });
  }
  for (const n of d.niveis ?? []) {
    candidatas.push({
      inicio: n.inicio,
      fim: n.fim,
      tipo: 'nivel',
      texto: n.palavra,
      nivel: n.nivel,
      escala: n.escala,
    });
  }
  const saida: MarcaNaLinha[] = [];
  for (const m of candidatas) {
    if (saida.some((o) => m.inicio < o.fim && o.inicio < m.fim)) continue;
    saida.push(m);
  }
  return saida.sort((a, b) => a.inicio - b.inicio);
}

/** Teto da linha de glosa no PiP de vídeo (só leitura): uma linha curta, legível. */
export const TETO_DA_GLOSA_NO_VIDEO = 64;

/**
 * A ÚNICA glosa que o PiP de vídeo desenha embaixo da legenda: a expressão (ou, sem ela, o termo) mais relevante da
 * linha, curta. O nível não entra (não tem sentido sem tocar). Sem nada relevante, nada.
 */
export function glosaParaOVideo(marcas: ReadonlyArray<MarcaNaLinha>): string | null {
  const m =
    marcas.find((x) => x.tipo === 'expressao' && x.sentido) ?? marcas.find((x) => x.tipo === 'termo' && x.sentido);
  if (!m?.sentido) return null;
  const texto = `${m.texto}: ${m.sentido}`.replace(/\s+/g, ' ').trim();
  return texto.length <= TETO_DA_GLOSA_NO_VIDEO ? texto : `${texto.slice(0, TETO_DA_GLOSA_NO_VIDEO - 1).trimEnd()}…`;
}
