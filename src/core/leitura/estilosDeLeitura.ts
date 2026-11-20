/**
 * OS AJUSTES DA NARRAÇÃO E OS ESTILOS DE LEITURA (spec `docs/specs/2026-10-28-narracao-v2.md`) — puro.
 *
 * `OpcoesDaNarracao` é tudo o que a pessoa regula na voz: velocidade, tom, volume, a pausa entre frases e
 * entre parágrafos e quantas vezes cada frase se repete (para estudar). Um ESTILO é um conjunto fechado de
 * (velocidade, tom, pausas, repetições); o volume é da pessoa e nunca muda com o estilo.
 *
 * Também mora aqui o que é conta pura do transporte: o passo fino da velocidade, quantas frases "voltar 10 s"
 * recua e o temporizador de sono.
 */

export interface OpcoesDaNarracao {
  /** 0,5–2,5× (a voz natural da nuvem só vai até 2×). */
  velocidade: number;
  /** 0,5–1,5 (1 = o tom natural da voz). */
  tom: number;
  /** 0–1. */
  volume: number;
  /** Segundos de silêncio depois de cada frase. */
  pausaFrase: number;
  /** Segundos EXTRA de silêncio quando a frase fecha um parágrafo. */
  pausaParagrafo: number;
  /** Quantas vezes cada frase é lida seguida (1–3). */
  repeticoes: number;
}

interface Limite {
  min: number;
  max: number;
  passo: number;
}

export const LIMITES_DA_NARRACAO: Record<keyof OpcoesDaNarracao, Limite> = {
  velocidade: { min: 0.5, max: 2.5, passo: 0.1 },
  tom: { min: 0.5, max: 1.5, passo: 0.1 },
  volume: { min: 0, max: 1, passo: 0.05 },
  pausaFrase: { min: 0, max: 1.5, passo: 0.1 },
  pausaParagrafo: { min: 0, max: 1.5, passo: 0.1 },
  repeticoes: { min: 1, max: 3, passo: 1 },
};

export const OPCOES_PADRAO_DA_NARRACAO: OpcoesDaNarracao = {
  velocidade: 1,
  tom: 1,
  volume: 1,
  pausaFrase: 0,
  pausaParagrafo: 0.4,
  repeticoes: 1,
};

/** Arredonda ao passo e prende no intervalo (sem lixo de ponto flutuante: 0,7000000001 vira 0,7). */
export function ajustarValor(campo: keyof OpcoesDaNarracao, valor: number, padrao?: number): number {
  const { min, max, passo } = LIMITES_DA_NARRACAO[campo];
  const v = Number.isFinite(valor) ? valor : (padrao ?? OPCOES_PADRAO_DA_NARRACAO[campo]);
  const noPasso = Math.round((v - min) / passo) * passo + min;
  return Math.round(Math.max(min, Math.min(max, noPasso)) * 1000) / 1000;
}

/** Junta `parcial` sobre `base`, valor a valor: o que vier fora do intervalo ou inválido não passa. */
export function normalizarOpcoes(
  parcial: Partial<Record<keyof OpcoesDaNarracao, unknown>> | null | undefined,
  base: OpcoesDaNarracao = OPCOES_PADRAO_DA_NARRACAO,
): OpcoesDaNarracao {
  const out = { ...base };
  if (!parcial || typeof parcial !== 'object') return out;
  for (const campo of Object.keys(LIMITES_DA_NARRACAO) as Array<keyof OpcoesDaNarracao>) {
    const v = parcial[campo];
    if (typeof v === 'number') out[campo] = ajustarValor(campo, v, base[campo]);
  }
  return out;
}

/** Um passo na velocidade (`+1` mais rápido, `-1` mais lento), no intervalo. */
export const passoDeVelocidade = (atual: number, direcao: 1 | -1): number =>
  ajustarValor('velocidade', atual + direcao * LIMITES_DA_NARRACAO.velocidade.passo);

/* ─────────────────────────── os estilos ─────────────────────────── */

export const IDS_DE_ESTILO = ['natural', 'audiolivro', 'dinamico', 'estudo', 'foco'] as const;
export type IdDeEstilo = (typeof IDS_DE_ESTILO)[number];

/** O que um estilo define (o volume é da pessoa). */
export type AjustesDoEstilo = Omit<OpcoesDaNarracao, 'volume'>;

export const ESTILOS_DE_LEITURA: Record<IdDeEstilo, { nome: string; explica: string; ajustes: AjustesDoEstilo }> = {
  natural: {
    nome: 'Natural',
    explica: 'Velocidade e tom normais, com uma pausa curta entre parágrafos.',
    ajustes: { velocidade: 1, tom: 1, pausaFrase: 0, pausaParagrafo: 0.4, repeticoes: 1 },
  },
  audiolivro: {
    nome: 'Audiolivro',
    explica: 'Mais lenta, tom levemente grave e pausas maiores entre parágrafos.',
    ajustes: { velocidade: 0.9, tom: 0.9, pausaFrase: 0.2, pausaParagrafo: 0.9, repeticoes: 1 },
  },
  dinamico: {
    nome: 'Dinâmico',
    explica: 'Mais rápida, com pausas curtas.',
    ajustes: { velocidade: 1.3, tom: 1, pausaFrase: 0, pausaParagrafo: 0.2, repeticoes: 1 },
  },
  estudo: {
    nome: 'Estudo',
    explica: 'Lenta, com uma pausa depois de cada frase e cada frase lida duas vezes, para repetir em voz alta.',
    ajustes: { velocidade: 0.8, tom: 1, pausaFrase: 1, pausaParagrafo: 0.8, repeticoes: 2 },
  },
  foco: {
    nome: 'Foco',
    explica: 'Rápida e quase sem pausas, para passar os olhos e ouvir junto.',
    ajustes: { velocidade: 1.6, tom: 1, pausaFrase: 0, pausaParagrafo: 0.1, repeticoes: 1 },
  },
};

/** Aplica um estilo (ou o "Meu estilo" guardado) sobre as opções atuais, mantendo o volume. */
export function aplicarEstilo(atual: OpcoesDaNarracao, ajustes: AjustesDoEstilo): OpcoesDaNarracao {
  return normalizarOpcoes({ ...ajustes, volume: atual.volume }, atual);
}

export const ajustesDeOpcoes = (o: OpcoesDaNarracao): AjustesDoEstilo => ({
  velocidade: o.velocidade,
  tom: o.tom,
  pausaFrase: o.pausaFrase,
  pausaParagrafo: o.pausaParagrafo,
  repeticoes: o.repeticoes,
});

const mesmos = (a: AjustesDoEstilo, b: AjustesDoEstilo) =>
  (Object.keys(a) as Array<keyof AjustesDoEstilo>).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

/** Qual estilo as opções atuais formam: um preset, o "Meu estilo" guardado, ou `personalizado`. */
export function estiloAtual(o: OpcoesDaNarracao, meu?: AjustesDoEstilo | null): IdDeEstilo | 'meu' | 'personalizado' {
  const atual = ajustesDeOpcoes(o);
  for (const id of IDS_DE_ESTILO) if (mesmos(ESTILOS_DE_LEITURA[id].ajustes, atual)) return id;
  if (meu && mesmos(ajustesDeOpcoes(normalizarOpcoes(meu)), atual)) return 'meu';
  return 'personalizado';
}

/* ─────────────────────────── pausas e transporte ─────────────────────────── */

/** O silêncio (ms) depois de uma frase. */
export const pausaAposAFrase = (o: OpcoesDaNarracao, fimDeParagrafo: boolean): number =>
  Math.round((o.pausaFrase + (fimDeParagrafo ? o.pausaParagrafo : 0)) * 1000);

/** Caracteres lidos por segundo na velocidade 1× (média da fala em pt/en/es; estimativa). */
export const CARACTERES_POR_SEGUNDO = 15;

/**
 * Quantas frases "voltar N segundos" recua a partir de `indice`: soma o tamanho das frases anteriores até
 * cobrir o tempo (estimado pelo comprimento do texto e pela velocidade). Recua ao menos uma, nunca passa de 0.
 */
export function frasesParaVoltar(
  tamanhos: readonly number[],
  indice: number,
  segundos: number,
  velocidade: number,
): number {
  const alvo = Math.max(1, segundos * CARACTERES_POR_SEGUNDO * Math.max(0.1, velocidade));
  let soma = 0;
  let n = 0;
  for (let i = Math.min(indice, tamanhos.length) - 1; i >= 0; i--) {
    soma += tamanhos[i];
    n++;
    if (soma >= alvo) break;
  }
  return Math.max(1, n);
}

/* ─────────────────────────── o temporizador de sono ─────────────────────────── */

export const MINUTOS_DE_SONO = [15, 30, 60] as const;

/** `null` = sem sono. `minutos`: vence em `ate` (ms). `capitulo`: vence ao acabar o capítulo. */
export type Sono = { tipo: 'minutos'; ate: number } | { tipo: 'capitulo' } | null;

export const dormirEm = (minutos: number, agora: number): Sono => ({
  tipo: 'minutos',
  ate: agora + minutos * 60_000,
});

/** O sono por tempo venceu? (o de "fim do capítulo" não vence por relógio) */
export const sonoVenceu = (s: Sono, agora: number): boolean => s?.tipo === 'minutos' && agora >= s.ate;

/** Minutos que faltam, arredondados para cima (mínimo 1 enquanto não venceu). */
export const minutosDoSono = (s: Sono, agora: number): number =>
  s?.tipo === 'minutos' ? Math.max(0, Math.ceil((s.ate - agora) / 60_000)) : 0;
