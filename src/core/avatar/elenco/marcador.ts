/**
 * MARCADOR HEURÍSTICO do elenco: por frase, QUEM fala e com que EMOÇÃO, sem IA e sem rede. É o padrão e o
 * fallback da futura função de IA (`docs/specs/2026-10-28-avatar-elenco-ia.md`).
 *
 * Princípios:
 *  - ERRAR PARA O NARRADOR/NEUTRO. Na dúvida a frase sai `desconhecido` e a emoção `neutro`; quem consome só usa
 *    voz de personagem e emoção com `confianca >= CONFIANCA_MINIMA`.
 *  - NUNCA INVENTA PERSONAGEM: o `nome` do falante é sempre um item da lista da ficha. Nome DENTRO da fala é
 *    vocativo ("— Ana, venha"), não falante; só se olha a narração em volta (a "marca": "disse Ana").
 *  - LINEAR E COM TETO: sem regex aninhada, frase lida até 20 mil caracteres, 50 mil frases e `orcamentoMs`.
 */
import { type EmocaoDoAvatar } from '../estados';
import { type Lexico, lexicoDoIdioma } from './lexico';
import { normalizar, palavras, partirNoTeto, separarFala, TETO_DE_ANALISE, TETO_DE_CARACTERES_DA_FRASE } from './texto';
import { type FraseDeEntrada, type FraseMarcada, type OpcoesDoMarcador } from './tipos';

const MAX_FRASES = 50_000;
const MAX_PERSONAGENS = 200;
const MAX_NOME = 80;
const ORCAMENTO_PADRAO_MS = 1500;
const MAX_PALAVRAS_DE_MARCA = 8;

/** Artigos e preposições que não identificam ninguém ("The Doctor", "Dom Pedro de Alcântara"). */
const PARTICULAS = new Set([
  'the',
  'and',
  'von',
  'van',
  'der',
  'del',
  'des',
  'las',
  'los',
  'dos',
  'das',
  'san',
  'mrs',
  'sir',
  'dom',
  'dona',
  'sra',
]);

interface Token {
  norm: string;
  maiuscula: boolean;
  indice: number;
}

function tokens(s: string): Token[] {
  const out: Token[] = [];
  for (const m of s.matchAll(/[\p{L}\p{N}]+/gu)) {
    const p = m[0];
    out.push({ norm: normalizar(p), maiuscula: p[0] !== p[0].toLowerCase(), indice: out.length });
  }
  return out;
}

interface EntradaDeNome {
  indice: number;
  exigeMaiuscula: boolean;
}

function mapaDeNomes(nomes: readonly string[]): { lista: string[]; mapa: Map<string, EntradaDeNome> } {
  const lista: string[] = [];
  for (const n of nomes) {
    if (typeof n !== 'string') continue;
    const limpo = n.trim();
    if (!limpo || limpo.length > MAX_NOME || lista.includes(limpo)) continue;
    lista.push(limpo);
    if (lista.length >= MAX_PERSONAGENS) break;
  }
  const mapa = new Map<string, EntradaDeNome>();
  lista.forEach((nome, indice) => {
    for (const t of tokens(nome)) {
      if (t.norm.length < 3 || PARTICULAS.has(t.norm)) continue;
      const antes = mapa.get(t.norm);
      /* O mesmo pedaço em duas personagens ("Maria" e "Maria José") é ambíguo: ninguém o leva. */
      mapa.set(
        t.norm,
        antes && antes.indice !== indice
          ? { indice: -1, exigeMaiuscula: true }
          : { indice, exigeMaiuscula: t.maiuscula },
      );
    }
  });
  return { lista, mapa };
}

interface Achados {
  /** Posição (em palavras) e personagem de cada nome achado. */
  nomes: { pos: number; indice: number }[];
  verbos: number[];
  pronomes: number[];
  total: number;
}

interface Ctx {
  lex: Lexico;
  verbos: ReadonlySet<string>;
  pronomes: ReadonlySet<string>;
  lista: string[];
  mapa: Map<string, EntradaDeNome>;
}

function achar(c: Ctx, texto: string): Achados {
  const ts = tokens(texto);
  const a: Achados = { nomes: [], verbos: [], pronomes: [], total: ts.length };
  for (const t of ts) {
    const e = c.mapa.get(t.norm);
    if (e && e.indice >= 0 && (!e.exigeMaiuscula || t.maiuscula)) a.nomes.push({ pos: t.indice, indice: e.indice });
    if (c.verbos.has(t.norm)) a.verbos.push(t.indice);
    if (c.pronomes.has(t.norm)) a.pronomes.push(t.indice);
  }
  return a;
}

interface Autor {
  indice: number;
  conf: number;
}

/** Quem "disse", olhando só a narração em volta da fala. `null` = a marca não nomeia ninguém. */
function autorDaMarca(a: Achados): Autor | null {
  if (!a.nomes.length) return null;
  const distintos = new Set(a.nomes.map((n) => n.indice));
  if (a.verbos.length) {
    const v = a.verbos[0];
    const antes = [...a.nomes].reverse().find((n) => n.pos < v);
    if (antes && v - antes.pos <= 3) return { indice: antes.indice, conf: 0.92 };
    const depois = a.nomes.find((n) => n.pos > v);
    if (depois && depois.pos - v <= 3) return { indice: depois.indice, conf: 0.92 };
    return { indice: (antes ?? depois ?? a.nomes[0]).indice, conf: distintos.size > 1 ? 0.55 : 0.7 };
  }
  /* Sem verbo de fala ("Ana sorriu: «Vem»"): o nome no começo da marca é o sujeito. */
  if (a.nomes[0].pos <= 1) return { indice: a.nomes[0].indice, conf: distintos.size > 1 ? 0.5 : 0.65 };
  return { indice: a.nomes[0].indice, conf: distintos.size > 1 ? 0.35 : 0.45 };
}

/* ─────────────────────────── a emoção ─────────────────────────── */

type EmocaoPontuavel = Exclude<EmocaoDoAvatar, 'neutro'>;
const PONTUAVEIS: readonly EmocaoPontuavel[] = ['feliz', 'triste', 'bravo', 'surpreso', 'relaxado'];
const LIMIAR_DE_EMOCAO = 1;
const FOLGA_ENTRE_EMOCOES = 0.4;

function emocaoDaFala(
  lex: Lexico,
  fala: string,
  marca: string,
  palavrasDaMarca: readonly string[],
): [EmocaoDoAvatar, number] {
  const pontos: Record<EmocaoPontuavel, number> = { feliz: 0, triste: 0, bravo: 0, surpreso: 0, relaxado: 0 };
  const corpo = ` ${palavras(`${fala} ${marca}`).join(' ')} `;
  for (const e of PONTUAVEIS) {
    for (const kw of lex.palavras[e]) {
      /* Frase-chave (com espaço) é pista forte; radical solto é fraca (precisa de reforço). */
      if (corpo.includes(` ${kw}`)) pontos[e] += kw.includes(' ') ? 1 : 0.6;
    }
  }
  const verbosDaMarca = palavrasDaMarca;
  if (verbosDaMarca.some((p) => lex.sussurros.includes(p))) pontos.relaxado += 0.6;
  if (verbosDaMarca.some((p) => lex.gritos.includes(p))) pontos.bravo += 0.5;
  const letras = fala.replace(/[^\p{L}]/gu, '');
  const maiusculas = letras.replace(/[^\p{Lu}]/gu, '');
  if (letras.length >= 4 && maiusculas.length / letras.length > 0.7) pontos.bravo += 0.8;
  if (/\?!|!\?/.test(fala)) pontos.surpreso += 0.8;
  if (/!/.test(fala)) for (const e of ['feliz', 'bravo', 'surpreso'] as const) if (pontos[e] > 0) pontos[e] += 0.5;
  const ordem = [...PONTUAVEIS].sort((x, y) => pontos[y] - pontos[x]);
  const [topo, segundo] = ordem;
  if (pontos[topo] < LIMIAR_DE_EMOCAO || pontos[topo] - pontos[segundo] < FOLGA_ENTRE_EMOCOES) return ['neutro', 1];
  return [topo, Math.min(0.85, 0.4 + 0.2 * pontos[topo])];
}

/* ─────────────────────────── o marcador ─────────────────────────── */

const CONF_NARRADOR = 0.9;

interface Estado {
  /** Falantes do diálogo corrente, o mais recente por último (sem repetição seguida). */
  recentes: number[];
  /** Personagens citadas na narração do diálogo corrente. */
  cena: Set<number>;
  narradorSeguido: number;
  /** A frase anterior era narração cujo sujeito é esta personagem (a "ação" que antecede a fala). */
  sujeitoAnterior: number | null;
  /** Resultado da frase anterior (para preencher uma marca órfã: "disse Ana."). */
  anterior: { pedacos: FraseMarcada[]; semAutor: boolean } | null;
}

const textoDe = (f: FraseDeEntrada): string => {
  const t = typeof f === 'string' ? f : f && typeof f === 'object' ? (f as { texto?: unknown }).texto : '';
  return typeof t === 'string' ? t : '';
};

function empilhar(est: Estado, indice: number) {
  if (est.recentes[est.recentes.length - 1] !== indice) {
    est.recentes = est.recentes.filter((i) => i !== indice);
    est.recentes.push(indice);
  }
}

export function marcarFrases(frases: readonly FraseDeEntrada[], opcoes: OpcoesDoMarcador): FraseMarcada[] {
  const lex = lexicoDoIdioma(opcoes?.idioma);
  const { lista, mapa } = mapaDeNomes(Array.isArray(opcoes?.personagens) ? opcoes.personagens : []);
  const c: Ctx = {
    lex,
    verbos: new Set(lex.verbos.map(normalizar)),
    pronomes: new Set(lex.pronomes.map(normalizar)),
    lista,
    mapa,
  };
  const orcamento = Math.max(0, opcoes?.orcamentoMs ?? ORCAMENTO_PADRAO_MS);
  const inicio = Date.now();
  const saida: FraseMarcada[] = [];
  const est: Estado = { recentes: [], cena: new Set(), narradorSeguido: 0, sujeitoAnterior: null, anterior: null };
  const entrada = Array.isArray(frases) ? frases : [];

  const emitir = (texto: string, f: Omit<FraseMarcada, 'indice' | 'texto'>): FraseMarcada[] => {
    const partes = texto.length > TETO_DE_CARACTERES_DA_FRASE ? partirNoTeto(texto) : [texto.trim()];
    const pedacos = (partes.length ? partes : ['']).map((p) => ({
      ...f,
      falante: { ...f.falante },
      indice: 0,
      texto: p,
    }));
    for (const p of pedacos) {
      p.indice = saida.length;
      saida.push(p);
    }
    return pedacos;
  };
  const narrar = (texto: string, confianca = CONF_NARRADOR) =>
    emitir(texto, { falante: { tipo: 'narrador' }, emocao: 'neutro', confianca });

  let estourou = false;
  for (let n = 0; n < entrada.length; n += 1) {
    if (n >= MAX_FRASES) estourou = true;
    else if (n % 64 === 0 && Date.now() - inicio > orcamento) estourou = true;
    const bruto = textoDe(entrada[n]);
    if (estourou) {
      narrar(bruto, 0);
      continue;
    }
    const texto = bruto.length > TETO_DE_ANALISE ? bruto.slice(0, TETO_DE_ANALISE) : bruto;
    const ehMarca = (p: string) => {
      const a = achar(c, p);
      return a.verbos.length > 0 || (a.nomes.length > 0 && a.nomes[0].pos === 0 && a.total <= 6);
    };
    const sep = separarFala(texto, ehMarca);
    const aMarca = achar(c, sep.marca);
    /* Uma aspa solta no meio da frase (5" de largura) não é fala; só se abre no começo, é introduzida (":") ou há verbo. */
    const aspaSolta = sep.desbalanceada && !sep.falaNoInicio && !sep.abertaIntroduzida && aMarca.verbos.length === 0;
    const ehFala =
      sep.temFala &&
      !aspaSolta &&
      (sep.porTravessao ||
        aMarca.verbos.length > 0 ||
        /[.!?…,]$/u.test(sep.fala.trim()) ||
        palavras(sep.fala).length >= 6);

    if (!ehFala) {
      /* Narração. Pode ser a "marca órfã" de uma fala anterior sem autor: "disse Ana." numa frase só. */
      const autor = autorDaMarca(aMarca);
      const curta = aMarca.total <= MAX_PALAVRAS_DE_MARCA;
      const orfa = !sep.temFala && curta && autor && aMarca.verbos.length > 0 && est.anterior?.semAutor;
      if (orfa && autor && est.anterior) {
        for (const p of est.anterior.pedacos) {
          p.falante = { tipo: 'personagem', nome: lista[autor.indice] };
          p.confianca = Math.round(autor.conf * 95) / 100;
        }
        est.anterior.semAutor = false;
        est.recentes = est.recentes.filter((i) => i !== autor.indice);
        est.recentes.push(autor.indice);
        est.narradorSeguido = 0;
        est.sujeitoAnterior = null;
        est.anterior = { pedacos: narrar(texto), semAutor: false };
        continue;
      }
      for (const nm of aMarca.nomes) est.cena.add(nm.indice);
      est.sujeitoAnterior = aMarca.nomes.length && aMarca.nomes[0].pos <= 1 ? aMarca.nomes[0].indice : null;
      est.narradorSeguido += 1;
      if (est.narradorSeguido >= 3) {
        est.recentes = [];
        est.cena = new Set();
      }
      const duvida = sep.temFala || sep.desbalanceada;
      est.anterior = { pedacos: narrar(texto, duvida ? 0.6 : CONF_NARRADOR), semAutor: false };
      continue;
    }

    /* Fala direta: descobrir quem. */
    est.narradorSeguido = 0;
    for (const nm of aMarca.nomes) est.cena.add(nm.indice);
    let quem: Autor | null = autorDaMarca(aMarca);
    let tagueada = quem !== null;
    if (!quem) {
      tagueada = false;
      const outro = est.recentes.length >= 2 ? est.recentes[est.recentes.length - 2] : -1;
      const ultimo = est.recentes[est.recentes.length - 1];
      const cenaSemUltimo = [...est.cena].filter((i) => i !== ultimo);
      if (est.sujeitoAnterior !== null) quem = { indice: est.sujeitoAnterior, conf: 0.55 };
      else if (outro >= 0) quem = { indice: outro, conf: aMarca.verbos.length || aMarca.pronomes.length ? 0.4 : 0.55 };
      else if (ultimo !== undefined && cenaSemUltimo.length === 1) quem = { indice: cenaSemUltimo[0], conf: 0.45 };
    }
    est.sujeitoAnterior = null;
    const [emocao, confEmocao] = emocaoDaFala(lex, sep.fala, sep.marca, palavras(sep.marca));
    let falante: FraseMarcada['falante'];
    let conf: number;
    if (quem) {
      falante = { tipo: 'personagem', nome: lista[quem.indice] };
      conf = quem.conf;
      empilhar(est, quem.indice);
    } else {
      falante = { tipo: 'desconhecido' };
      conf = 0.3;
    }
    if (sep.desbalanceada) conf = Math.max(0.1, conf - 0.2);
    const pedacos = emitir(texto, {
      falante,
      emocao,
      confianca: Math.round(Math.min(conf, emocao === 'neutro' ? 1 : confEmocao) * 100) / 100,
    });
    est.anterior = { pedacos, semAutor: !tagueada };
  }
  return saida;
}
