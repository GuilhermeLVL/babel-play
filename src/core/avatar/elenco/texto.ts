/** Utilitários de texto do elenco. Puro: nada de DOM, `URL` nem `TextDecoder`. */

export const TETO_DE_CARACTERES_DA_FRASE = 600;
/** Quanto de uma frase a análise lê (o resto, em frase patológica, é ignorado). */
export const TETO_DE_ANALISE = 20_000;

export const normalizar = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Palavras (letras/dígitos) de um texto, normalizadas. */
export const palavras = (s: string): string[] => normalizar(s).match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Parte um trecho maior que `teto` no último sinal de pausa (ou espaço) antes do teto. Mesma regra do
 * `partirNoTeto` de `frasesDoTexto` (leitor de livros), para a marcação casar com a narração.
 */
export function partirNoTeto(texto: string, teto = TETO_DE_CARACTERES_DA_FRASE): string[] {
  const out: string[] = [];
  let i = 0;
  while (texto.length - i > teto) {
    const janela = texto.slice(i, i + teto);
    let corte = Math.max(janela.lastIndexOf(', '), janela.lastIndexOf('; '), janela.lastIndexOf(': '));
    corte = corte > teto * 0.4 ? corte + 1 : janela.lastIndexOf(' ');
    if (corte <= 0) corte = teto;
    out.push(texto.slice(i, i + corte));
    i += corte;
    while (i < texto.length && /\s/.test(texto[i])) i += 1;
  }
  if (i < texto.length) out.push(texto.slice(i));
  return out.map((f) => f.trim()).filter((f) => f);
}

export interface FalaSeparada {
  /** O que é fala direta (aspas ou travessão), juntando os pedaços. */
  fala: string;
  /** O que é narração (a "marca": "disse Ana"), juntando os pedaços. */
  marca: string;
  temFala: boolean;
  /** A fala começa a frase (aspas abrem no início ou travessão de diálogo). */
  falaNoInicio: boolean;
  /** Aspas sem par (aberta e nunca fechada, ou fechamento sem abertura). */
  desbalanceada: boolean;
  porTravessao: boolean;
  /** Aspas abertas e nunca fechadas, mas introduzidas por ":" ou "," ("Sofia ligou: «Esqueci..."): tem cara de fala. */
  abertaIntroduzida: boolean;
}

interface Trecho {
  inicio: number;
  fim: number;
}

const ABRE: Record<string, string> = { '“': '”', '«': '»', '‹': '›', '„': '“', '‘': '’' };

/** Travessão de diálogo no começo da frase (— ou –; o hífen só com espaço depois, para não pegar "-5"). */
export const comecaComTravessao = (s: string): boolean => /^\s*(?:[—–]|-\s)\s*\S/u.test(s);

/** Os pedaços entre aspas. Aspas retas alternam; as demais abrem/fecham por par. Linear no tamanho. */
function trechosEntreAspas(s: string): {
  trechos: Trecho[];
  desbalanceada: boolean;
  abreNoInicio: boolean;
  abertaIntroduzida: boolean;
} {
  const trechos: Trecho[] = [];
  let desbalanceada = false;
  let abertoEm = -1;
  let fechador = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (abertoEm < 0) {
      if (c === '"') {
        abertoEm = i;
        fechador = '"';
      } else if (ABRE[c]) {
        abertoEm = i;
        fechador = ABRE[c];
      } else if (c === '”' || c === '»' || c === '›') {
        /* Fechamento sem abertura: a fala veio de antes desta frase. */
        trechos.push({ inicio: 0, fim: i });
        desbalanceada = true;
      }
    } else if (c === fechador || (fechador === '“' && c === '”')) {
      if (fechador === '’' && /\p{L}/u.test(s[i + 1] ?? '')) continue; /* apóstrofo (don’t) */
      trechos.push({ inicio: abertoEm, fim: i + 1 });
      abertoEm = -1;
    }
  }
  /* ‘ sem par é quase sempre apóstrofo: ignora. Outra abertura sem par: fala até o fim, desbalanceada. */
  let abertaIntroduzida = false;
  if (abertoEm >= 0 && s[abertoEm] !== '‘') {
    trechos.push({ inicio: abertoEm, fim: s.length });
    desbalanceada = true;
    abertaIntroduzida = /[:,;—–-]$/u.test(s.slice(0, abertoEm).trimEnd());
  }
  const abreNoInicio = trechos.length > 0 && s.slice(0, trechos[0].inicio).trim() === '';
  return { trechos, desbalanceada, abreNoInicio, abertaIntroduzida };
}

const tiraAspas = (s: string) => s.replace(/^[\s"“”«»‹›„‘’]+|[\s"“”«»‹›„‘’]+$/gu, '');

/** Separa fala direta e narração de UMA frase. `ehMarca` diz se um pedaço depois do travessão é narração. */
export function separarFala(frase: string, ehMarca: (pedaco: string) => boolean): FalaSeparada {
  const s = frase.length > TETO_DE_ANALISE ? frase.slice(0, TETO_DE_ANALISE) : frase;
  if (comecaComTravessao(s)) {
    const corpo = s.replace(/^\s*(?:[—–]|-\s)\s*/u, '');
    const pedacos = corpo.split(/\s*[—–]\s*|\s+-\s+/u);
    const fala: string[] = [];
    const marca: string[] = [];
    pedacos.forEach((p, i) => {
      if (i > 0 && ehMarca(p)) marca.push(p);
      else fala.push(p);
    });
    return {
      fala: fala.join(' '),
      marca: marca.join(' '),
      temFala: fala.join('').trim() !== '',
      falaNoInicio: true,
      desbalanceada: false,
      porTravessao: true,
      abertaIntroduzida: false,
    };
  }
  const { trechos, desbalanceada, abreNoInicio, abertaIntroduzida } = trechosEntreAspas(s);
  if (!trechos.length) {
    return {
      fala: '',
      marca: s,
      temFala: false,
      falaNoInicio: false,
      desbalanceada,
      porTravessao: false,
      abertaIntroduzida: false,
    };
  }
  const fala: string[] = [];
  const marca: string[] = [];
  let pos = 0;
  for (const t of trechos) {
    if (t.inicio > pos) marca.push(s.slice(pos, t.inicio));
    fala.push(tiraAspas(s.slice(t.inicio, t.fim)));
    pos = Math.max(pos, t.fim);
  }
  if (pos < s.length) marca.push(s.slice(pos));
  return {
    fala: fala.join(' '),
    marca: marca.join(' '),
    temFala: true,
    falaNoInicio: abreNoInicio,
    desbalanceada,
    porTravessao: false,
    abertaIntroduzida,
  };
}
