/**
 * A NARRAÇÃO DO LEITOR (L3 de Livros & Leitura) — as regras puras: as frases de um texto, a máquina de estados
 * (tocar, pausar, retomar, frase anterior/seguinte, virar o capítulo), o que se fala de cada frase em cada modo
 * e quem pode usar a voz natural da nuvem.
 *
 * As frases saem do `Intl.Segmenter` (e não do evento `boundary` da voz, que varia entre navegadores — spec §6).
 * Uma frase maior que o teto de um pedido da voz natural (`TETO_DE_CARACTERES_DA_VOZ`, 600) é partida em pedaços
 * no último sinal de pausa ou espaço antes do teto: cada pedaço é uma "frase" da narração (destaque e fala).
 */
import type { MotorDeVozId } from '../voz/portaDeVoz';
import { TETO_DE_CARACTERES_DA_VOZ } from '../vozNatural';

export interface FraseDoTexto {
  /** Posição no texto (em unidades de código, como `String#slice`). */
  inicio: number;
  fim: number;
  texto: string;
}

/** Tem letra ou número? (o "* * *" de separação de cena não é lido) */
const temConteudo = (s: string) => /[\p{L}\p{N}]/u.test(s);

/** Parte um trecho maior que `teto` no último sinal de pausa (ou espaço) antes do teto. */
function partirNoTeto(texto: string, inicio: number, teto: number): FraseDoTexto[] {
  const out: FraseDoTexto[] = [];
  let i = 0;
  while (texto.length - i > teto) {
    const janela = texto.slice(i, i + teto);
    let corte = Math.max(janela.lastIndexOf(', '), janela.lastIndexOf('; '), janela.lastIndexOf(': '));
    corte = corte > teto * 0.4 ? corte + 1 : janela.lastIndexOf(' ');
    if (corte <= 0) corte = teto;
    out.push({ inicio: inicio + i, fim: inicio + i + corte, texto: texto.slice(i, i + corte) });
    i += corte;
    while (i < texto.length && /\s/.test(texto[i])) i++;
  }
  if (i < texto.length) out.push({ inicio: inicio + i, fim: inicio + texto.length, texto: texto.slice(i) });
  return out.map((f) => ({ ...f, texto: f.texto.trim() })).filter((f) => f.texto);
}

/**
 * As frases de um texto, na ordem, sem o espaço das bordas (o `inicio`/`fim` já descontam o espaço). Quebra de
 * linha (`\n`) é sempre fim de frase: é como o leitor separa os parágrafos do capítulo.
 */
export function frasesDoTexto(
  texto: string,
  idioma?: string,
  teto: number = TETO_DE_CARACTERES_DA_VOZ,
): FraseDoTexto[] {
  const seg = new Intl.Segmenter(idioma || undefined, { granularity: 'sentence' });
  const out: FraseDoTexto[] = [];
  for (const s of seg.segment(texto)) {
    /* O segmentador junta "fim.\nComeço" quando não há espaço; a quebra de linha manda. */
    let base = s.index;
    for (const parte of s.segment.split('\n')) {
      const ini = base + (parte.length - parte.trimStart().length);
      const limpo = parte.trim();
      base += parte.length + 1;
      if (!limpo || !temConteudo(limpo)) continue;
      if (limpo.length > teto) out.push(...partirNoTeto(limpo, ini, teto));
      else out.push({ inicio: ini, fim: ini + limpo.length, texto: limpo });
    }
  }
  return out;
}

/* ─────────────────────────── a máquina de estados ─────────────────────────── */

/**
 * `parada`: nada destacado. `tocando`: a frase `indice` está sendo falada. `pausada`: a frase fica destacada e
 * retomar a fala DE NOVO do começo (o motor de voz não promete retomar no meio, e a nuvem não sabe pausar).
 * `virando`: o capítulo acabou e o próximo está carregando. `vez` muda a cada fala nova: callback de fala
 * velha (cancelada, trocada) não mexe em nada.
 */
export interface EstadoDaNarracao {
  fase: 'parada' | 'tocando' | 'pausada' | 'virando';
  indice: number;
  total: number;
  vez: number;
}

export type EventoDaNarracao =
  | { tipo: 'tocar'; indice: number }
  | { tipo: 'pausar' }
  | { tipo: 'retomar' }
  | { tipo: 'alternar' }
  | { tipo: 'parar' }
  | { tipo: 'proxima' }
  | { tipo: 'anterior' }
  /** Vai a outra frase do capítulo mantendo a fase (tocando segue tocando, pausada segue pausada). */
  | { tipo: 'ir'; indice: number }
  | { tipo: 'fimDaFrase'; vez: number }
  | { tipo: 'erro'; vez: number }
  /** As frases mudaram (outro capítulo): `continuar` = seguir falando a partir de `indice`. */
  | { tipo: 'capitulo'; total: number; indice: number; continuar: boolean };

export const NARRACAO_PARADA: EstadoDaNarracao = { fase: 'parada', indice: 0, total: 0, vez: 0 };

const limitar = (i: number, total: number) => Math.max(0, Math.min(i, Math.max(0, total - 1)));

export function narrar(e: EstadoDaNarracao, ev: EventoDaNarracao): EstadoDaNarracao {
  const vez = e.vez + 1;
  switch (ev.tipo) {
    case 'tocar':
      if (!e.total) return e;
      return { ...e, fase: 'tocando', indice: limitar(ev.indice, e.total), vez };
    case 'pausar':
      return e.fase === 'tocando' ? { ...e, fase: 'pausada', vez } : e;
    case 'retomar':
      return e.fase === 'pausada' && e.total ? { ...e, fase: 'tocando', vez } : e;
    case 'alternar':
      if (e.fase === 'tocando') return narrar(e, { tipo: 'pausar' });
      if (e.fase === 'pausada') return narrar(e, { tipo: 'retomar' });
      if (e.fase === 'parada') return narrar(e, { tipo: 'tocar', indice: e.indice });
      return e;
    case 'parar':
      return e.fase === 'parada' ? e : { ...e, fase: 'parada', vez };
    case 'proxima':
      if (e.fase === 'parada' || e.fase === 'virando') return e;
      if (e.indice + 1 < e.total) return { ...e, indice: e.indice + 1, vez };
      return e.fase === 'tocando' ? { ...e, fase: 'virando', vez } : e;
    case 'anterior':
      if (e.fase === 'parada' || e.fase === 'virando') return e;
      return { ...e, indice: Math.max(0, e.indice - 1), vez };
    case 'ir':
      if (e.fase === 'parada' || e.fase === 'virando' || !e.total) return e;
      return { ...e, indice: limitar(ev.indice, e.total), vez };
    case 'fimDaFrase':
      if (e.fase !== 'tocando' || ev.vez !== e.vez) return e;
      if (e.indice + 1 < e.total) return { ...e, indice: e.indice + 1, vez };
      return { ...e, fase: 'virando', vez };
    case 'erro':
      /* A voz falhou nesta frase: para nela (destacada), sem correr pelas outras. */
      if (e.fase !== 'tocando' || ev.vez !== e.vez) return e;
      return { ...e, fase: 'pausada', vez };
    case 'capitulo': {
      const total = Math.max(0, ev.total);
      if (!total) return { ...e, total: 0, indice: 0, fase: ev.continuar ? 'virando' : 'parada', vez };
      const fase = ev.continuar ? 'tocando' : e.fase === 'parada' ? 'parada' : 'pausada';
      return { fase, total, indice: limitar(ev.indice, total), vez };
    }
  }
}

/* ─────────────────────────── os modos (o que se fala de cada frase) ─────────────────────────── */

/**
 * Os modos do narrador, os mesmos da Leitura (`Reading.tsx`), com rótulos que dizem o que fazem (NAR02):
 *  original → a frase do livro, na voz do idioma do livro;
 *  traducao → a tradução da frase, na voz do idioma da pessoa (o destaque segue a frase do livro);
 *  bilingue → a frase do livro e, em seguida, a tradução (só avança depois das duas);
 *  auto     → "leitura inteligente": a voz do idioma DETECTADO em cada frase (livro com trechos noutra língua).
 */
export type ModoDaNarracao = 'original' | 'traducao' | 'bilingue' | 'auto';
export const MODOS_DA_NARRACAO: readonly ModoDaNarracao[] = ['original', 'traducao', 'bilingue', 'auto'];

export interface PassoDaFala {
  texto: string;
  /** ISO-639-1 (ou BCP-47) do texto falado: decide a voz. */
  idioma: string;
}

/** O modo usa a tradução da frase? (a tela só traduz quando precisa) */
export const modoTraduz = (m: ModoDaNarracao) => m === 'traducao' || m === 'bilingue';

const base = (l: string) => (l || '').toLowerCase().split(/[-_]/)[0];

/**
 * O que se fala de UMA frase. Sem tradução (falhou, ou o livro já está no idioma da pessoa), o modo cai no
 * original — nunca fica mudo.
 */
export function passosDaFrase(
  modo: ModoDaNarracao,
  frase: string,
  o: { idiomaDoLivro: string; idiomaDaPessoa: string; traducao?: string | null; detectado?: string | null },
): PassoDaFala[] {
  const original: PassoDaFala = { texto: frase, idioma: o.idiomaDoLivro };
  const mesmoIdioma = base(o.idiomaDoLivro) === base(o.idiomaDaPessoa);
  const traducao = !mesmoIdioma && o.traducao?.trim() ? { texto: o.traducao.trim(), idioma: o.idiomaDaPessoa } : null;
  if (modo === 'traducao') return [traducao ?? original];
  if (modo === 'bilingue') return traducao ? [original, traducao] : [original];
  if (modo === 'auto') return [{ texto: frase, idioma: o.detectado || o.idiomaDoLivro }];
  return [original];
}

/* ─────────────────────────── a voz: aparelho (todos) ou nuvem (pago) ─────────────────────────── */

/**
 * Quem lê a narração. A voz do aparelho é de TODOS (grátis); a voz natural da nuvem só com a capacidade
 * `vozNatural` do plano E a flag `voz_natural` ligada E a pessoa tendo escolhido a voz natural para o idioma.
 * (A cota é do servidor: o 402/429 da rota cai na voz do aparelho, `lib/voz/vozDaNuvem.ts`.)
 */
export function vozDaNarracao(o: {
  escolheuNuvem: boolean;
  temDireito: boolean;
  flagLigada: boolean;
  /**
   * Um motor neural local está registrado e pronto para o idioma (`gateway/registroDeMotoresDeVoz.ts`). Ausente
   * = não há: o comportamento é o de sempre. Enquanto nenhum adaptador existir, ninguém passa `true`.
   */
  neuralLocalPronto?: boolean;
}): MotorDeVozId {
  if (o.neuralLocalPronto) return 'neural-local';
  return o.escolheuNuvem && o.temDireito && o.flagLigada ? 'nuvem' : 'aparelho';
}

/**
 * O convite (uma linha, sem pressão) para conhecer os planos da voz natural: só com a voz natural existindo
 * nesta instalação, sem o direito no plano, fora do perfil protegido (menor ou idade desconhecida: NUNCA há
 * convite a compra — ECA Digital) e com uma tela de planos para abrir.
 */
export function mostraConviteDaVozNatural(o: {
  temDireito: boolean;
  flagLigada: boolean;
  protegido: boolean;
  podeAbrirPlanos: boolean;
}): boolean {
  return o.flagLigada && !o.temDireito && !o.protegido && o.podeAbrirPlanos;
}

/** As velocidades de atalho do narrador (a barra regula em passos finos: `estilosDeLeitura.ts`). */
export const VELOCIDADES_DA_NARRACAO = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const;
