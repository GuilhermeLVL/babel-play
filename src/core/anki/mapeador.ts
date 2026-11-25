import { limparCampo } from './campo';
import { normalizarNomeDeCampo } from './estrutura';
import priors from './priorsDeCampos.json';

/**
 * O MAPEADOR, na parte pura: QUAL CAMPO DO TIPO DE NOTA É O QUÊ, com a CONFIANÇA de cada palpite.
 *
 * Por que existe: o baralho "4000 Essential English Words" perdeu 3.871 de 3.871 notas porque o parser adivinhou
 * `№`/`IMG` como palavra e significado, e a tela só disse "0 notas lidas". O palpite continua sendo palpite; o que
 * muda é (1) ele diz o quanto confia, (2) quando confia pouco a pessoa decide ANTES de gravar e (3) a decisão dela é
 * lembrada, por estrutura, só no aparelho (`src/lib/anki/perfisDeMapeamento.ts`).
 *
 * Os nomes conhecidos NÃO moram aqui: são dado (`priorsDeCampos.json`), para ampliar a lista sem tocar em lógica.
 */

/** O papel de um campo na importação. Só `palavra`, `significado` e `frase` mudam o texto da nota; os outros dizem o
 *  que o campo é (ele sai da disputa por palavra/significado, e mídia continua sendo achada em qualquer campo). */
export type PapelNaImportacao = 'palavra' | 'significado' | 'frase' | 'leitura' | 'audio' | 'imagem' | 'nenhum';

export const PAPEIS_NA_IMPORTACAO: readonly PapelNaImportacao[] = [
  'palavra',
  'significado',
  'frase',
  'leitura',
  'audio',
  'imagem',
  'nenhum',
];

export type Confianca = 'alta' | 'media' | 'baixa';

/** De onde veio o palpite. `perfil` e `manual` não são adivinhação: a pessoa já decidiu (agora ou numa importação anterior). */
export type OrigemDoPalpite = 'nome' | 'contem' | 'conteudo' | 'posicao' | 'perfil' | 'manual';

export interface Palpite {
  indice: number;
  confianca: Confianca;
  origem: OrigemDoPalpite;
}

export interface MapeamentoInferido {
  /** Um papel por campo, na ordem do tipo de nota. */
  papeis: PapelNaImportacao[];
  palpites: { palavra?: Palpite; significado?: Palpite; frase?: Palpite };
  /** Confiança BAIXA em palavra ou significado, num tipo de nota com mais de dois campos: a pessoa decide antes de gravar. */
  precisaDeConferencia: boolean;
}

type Faixas = string[][];
interface PriorDoPapel {
  exato: Faixas;
  contem?: string[];
  ambiguos?: string[];
}
const PAPEIS_DOS_PRIORS = priors.papeis as Record<string, PriorDoPapel>;

/** Um campo é a palavra-alvo ou a frase? Resolve `Expression` (palavra em baralho de vocabulário, frase em mineração). */
export const COMPRIMENTO_DE_FRASE = 25;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** As faixas de prioridade de um papel, como regex (igualdade com o nome normalizado). */
function regexesDoPapel(papel: 'palavra' | 'significado'): RegExp[] {
  return PAPEIS_DOS_PRIORS[papel].exato.map((faixa) => {
    const alternativas = faixa.map((e) => (e.endsWith('*') ? `${escapar(e.slice(0, -1))}\\w*` : escapar(e)));
    return new RegExp(`^(${alternativas.join('|')})$`, 'i');
  });
}

/** Padrões de PALAVRA e de SIGNIFICADO em ordem de prioridade: o formato que `indicePorNome` consome. */
export const PADRAO_FRENTE: RegExp[] = regexesDoPapel('palavra');
export const PADRAO_VERSO: RegExp[] = regexesDoPapel('significado');

const casaExato = (nome: string, entrada: string) =>
  entrada.endsWith('*')
    ? nome.startsWith(entrada.slice(0, -1)) && /^\w*$/.test(nome.slice(entrada.length - 1))
    : nome === entrada;
const casaContem = (nome: string, entrada: string) => nome.includes(entrada.replace(/\*$/, ''));

/**
 * O campo é áudio, imagem ou leitura PELO NOME? Esses saem da disputa por palavra e significado também no "contém":
 * `Word Audio` contém "word" e `Sound_Meaning` contém "meaning", e nenhum dos dois é o que o nome sugere.
 */
function papelDeMidiaPeloNome(nome: string): 'audio' | 'imagem' | 'leitura' | null {
  for (const papel of ['audio', 'imagem', 'leitura'] as const) {
    const p = PAPEIS_DOS_PRIORS[papel];
    if (p.exato.some((faixa) => faixa.some((e) => casaExato(nome, e)))) return papel;
    if (p.contem?.some((e) => casaContem(nome, e))) return papel;
  }
  return null;
}

/**
 * Acha o campo pelo NOME: igualdade em todas as faixas primeiro (a ordem das faixas é a prioridade: `Word` vence
 * `Front`), "contém" só depois. `Sound_Meaning` contém "meaning" e é um áudio: a igualdade vem antes e áudio/imagem
 * não disputam o "contém". Devolve -1 se nada casar.
 */
export function indicePorNome(campos: string[], padroes: RegExp[]): number {
  const nomes = campos.map((c) => normalizarNomeDeCampo(c ?? ''));
  for (const padrao of padroes) {
    const exato = nomes.findIndex((c) => padrao.test(c));
    if (exato >= 0) return exato;
  }
  for (const padrao of padroes) {
    const solto = new RegExp(padrao.source.replace(/^\^|\$$/g, ''), 'i');
    const i = nomes.findIndex((c) => !papelDeMidiaPeloNome(c) && solto.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** Qual campo é a frase de exemplo? Pelo NOME, quando o baralho nomeia os campos. */
export function indiceDoExemplo(campos: string[]): number {
  const nomes = campos.map((c) => normalizarNomeDeCampo(c ?? ''));
  const entradas = PAPEIS_DOS_PRIORS.frase.exato.flat();
  return nomes.findIndex((n) => !papelDeMidiaPeloNome(n) && entradas.some((e) => casaContem(n, e)));
}

function procurar(
  nomes: string[],
  faixas: Faixas,
  fora: (i: number) => boolean,
): { indice: number; origem: 'nome' | 'contem'; nome: string } | null {
  for (const faixa of faixas) {
    const i = nomes.findIndex((n, k) => !fora(k) && faixa.some((e) => casaExato(n, e)));
    if (i >= 0) return { indice: i, origem: 'nome', nome: nomes[i] };
  }
  for (const faixa of faixas) {
    const i = nomes.findIndex((n, k) => !fora(k) && faixa.some((e) => casaContem(n, e)));
    if (i >= 0) return { indice: i, origem: 'contem', nome: nomes[i] };
  }
  return null;
}

/** Tira marcas de mídia e HTML; sobra algo? */
const soMidia = (valor: string, marca: RegExp) =>
  marca.test(valor) &&
  !valor
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]*>|&nbsp;|\s/gi, '').length;

/** O que a AMOSTRA diz de cada coluna: áudio ou imagem quando a maioria das notas só tem a marca de mídia. */
function papelPeloConteudo(amostra: string[][], coluna: number): 'audio' | 'imagem' | null {
  if (!amostra.length) return null;
  const quantas = (marca: RegExp) => amostra.filter((l) => soMidia(l[coluna] ?? '', marca)).length;
  if (quantas(/\[sound:/i) / amostra.length >= 0.6) return 'audio';
  if (quantas(/<img\b/i) / amostra.length >= 0.6) return 'imagem';
  return null;
}

/**
 * Um campo de texto parece FRASE ou PALAVRA? Pelo comprimento médio e pelos espaços dos textos limpos da amostra: frase é
 * longa (25+ caracteres) ou tem 4+ palavras; em escrita sem espaço (japonês, chinês), 12+ caracteres já é frase.
 */
function pareceFrase(amostra: string[][], coluna: number): boolean {
  const textos = amostra.map((l) => limparCampo(l[coluna] ?? '')).filter(Boolean);
  if (!textos.length) return false;
  const media = (f: (t: string) => number) => textos.reduce((s, t) => s + f(t), 0) / textos.length;
  const caracteres = media((t) => t.length);
  const palavras = media((t) => t.split(/\s+/).length);
  const cjk = textos.filter((t) => /[\u3040-\u30ff\u3400-\u9fff]/.test(t)).length / textos.length >= 0.5;
  return caracteres >= COMPRIMENTO_DE_FRASE || palavras >= 4 || (cjk && caracteres >= 12);
}

/** Coluna só de números (ordem, id): não é palavra nem significado. */
function soNumeros(amostra: string[][], coluna: number): boolean {
  const textos = amostra.map((l) => limparCampo(l[coluna] ?? '')).filter(Boolean);
  return textos.length > 0 && textos.every((t) => /^[\d\s.,№#-]+$/.test(t));
}

export interface OpcoesDaInferencia {
  /** Linhas BRUTAS (`flds` já separado por campo) de algumas notas do tipo: serve para o conteúdo desempatar. */
  amostra?: string[][];
  /** Mapeamento que a pessoa confirmou numa importação anterior, deste mesmo tipo de nota (mesmo hash de estrutura). */
  perfil?: PapelNaImportacao[];
  /** Mapeamento que a pessoa escolheu AGORA no Mapeador. Vence tudo. */
  manual?: PapelNaImportacao[];
}

/** Um mapeamento já decidido por alguém: nada a adivinhar, só a posição de cada papel. */
function decidido(papeis: PapelNaImportacao[], origem: 'perfil' | 'manual'): MapeamentoInferido {
  const confianca: Confianca = origem === 'manual' ? 'alta' : 'media';
  const palpites: MapeamentoInferido['palpites'] = {};
  for (const papel of ['palavra', 'significado', 'frase'] as const) {
    const indice = papeis.indexOf(papel);
    if (indice >= 0) palpites[papel] = { indice, confianca, origem };
  }
  return { papeis: [...papeis], palpites, precisaDeConferencia: false };
}

/** Um mapeamento serve ao tipo de nota se cobre todos os campos e deixa o par palavra/significado resolvido. */
export function mapeamentoServe(papeis: PapelNaImportacao[] | undefined, colunas: number): boolean {
  if (!papeis || papeis.length !== colunas) return false;
  if (!papeis.every((p) => PAPEIS_NA_IMPORTACAO.includes(p))) return false;
  return (papeis.includes('palavra') || papeis.includes('frase')) && papeis.includes('significado');
}

/**
 * Decide o mapeamento de um tipo de nota. Ordem: o que a pessoa escolheu agora, o perfil dela, e só então o palpite:
 *  - ALTA: o nome bateu por igualdade num padrão do JSON;
 *  - MÉDIA: o nome só CONTÉM o padrão (ou veio de um perfil salvo);
 *  - BAIXA: posicional, ou desempate por conteúdo (`Expression`).
 * Baralho de dois campos sem nome é posicional e baixo mas NÃO bloqueia: a posição já é a resposta.
 */
export function inferirMapeamento(nomesDosCampos: string[], opcoes: OpcoesDaInferencia = {}): MapeamentoInferido {
  const amostra = opcoes.amostra ?? [];
  const colunas = Math.max(nomesDosCampos.length, ...amostra.map((l) => l.length), 0);
  if (mapeamentoServe(opcoes.manual, colunas)) return decidido(opcoes.manual!, 'manual');
  if (mapeamentoServe(opcoes.perfil, colunas)) return decidido(opcoes.perfil!, 'perfil');

  const nomes = Array.from({ length: colunas }, (_, i) => normalizarNomeDeCampo(nomesDosCampos[i] ?? ''));
  const papeis: PapelNaImportacao[] = nomes.map(() => 'nenhum');
  // O que o campo É, antes de disputar: áudio/imagem/leitura pelo nome, áudio/imagem pelo conteúdo.
  nomes.forEach((n, i) => {
    const papel = papelDeMidiaPeloNome(n) ?? papelPeloConteudo(amostra, i);
    if (papel) papeis[i] = papel;
  });
  const ocupado = (i: number) => papeis[i] !== 'nenhum';
  /* POSICIONAL: com até dois campos é a posição cega de sempre (o baralho comum sem nome). Com mais, já há campo de
     mídia ou número na frente (o 4000EW: `№`, `IMG`), então pula o que a amostra mostra ser áudio, imagem ou só número. */
  const pulavel = (i: number) => colunas > 2 && (papeis[i] !== 'nenhum' || soNumeros(amostra, i));
  const posicional = (desde: number) => {
    let i = desde;
    while (i < colunas - 1 && pulavel(i)) i++;
    return i;
  };
  const palpites: MapeamentoInferido['palpites'] = {};

  // PALAVRA
  const p = procurar(nomes, PAPEIS_DOS_PRIORS.palavra.exato, ocupado);
  if (p) {
    const ambiguo = p.origem === 'nome' && (PAPEIS_DOS_PRIORS.palavra.ambiguos ?? []).includes(p.nome);
    if (ambiguo) {
      const frase = amostra.length > 0 && pareceFrase(amostra, p.indice);
      papeis[p.indice] = frase ? 'frase' : 'palavra';
      palpites.palavra = { indice: p.indice, confianca: 'baixa', origem: amostra.length ? 'conteudo' : 'nome' };
      if (frase) palpites.frase = { indice: p.indice, confianca: 'baixa', origem: 'conteudo' };
    } else {
      papeis[p.indice] = 'palavra';
      palpites.palavra = { indice: p.indice, confianca: p.origem === 'nome' ? 'alta' : 'media', origem: p.origem };
    }
  } else if (colunas > 0) {
    const i = posicional(0);
    papeis[i] = 'palavra';
    palpites.palavra = { indice: i, confianca: 'baixa', origem: 'posicao' };
  }

  // SIGNIFICADO
  const s = procurar(nomes, PAPEIS_DOS_PRIORS.significado.exato, (i) => ocupado(i) || i === palpites.palavra?.indice);
  if (s) {
    papeis[s.indice] = 'significado';
    palpites.significado = { indice: s.indice, confianca: s.origem === 'nome' ? 'alta' : 'media', origem: s.origem };
  } else if (colunas > 1) {
    const i = posicional(palpites.palavra ? palpites.palavra.indice + 1 : 1);
    if (i !== palpites.palavra?.indice && i < colunas) {
      papeis[i] = 'significado';
      palpites.significado = { indice: i, confianca: 'baixa', origem: 'posicao' };
    }
  }

  // FRASE (não bloqueia: o exemplo é um enfeite do cartão, não a razão de a nota existir)
  if (!palpites.frase) {
    const usada = (i: number) => ocupado(i) || i === palpites.palavra?.indice || i === palpites.significado?.indice;
    const f = procurar(nomes, PAPEIS_DOS_PRIORS.frase.exato, usada);
    if (f) {
      papeis[f.indice] = 'frase';
      palpites.frase = { indice: f.indice, confianca: f.origem === 'nome' ? 'alta' : 'media', origem: f.origem };
    } else if (colunas > 2 && !usada(2)) {
      papeis[2] = 'frase';
      palpites.frase = { indice: 2, confianca: 'baixa', origem: 'posicao' };
    }
  }

  const baixa =
    colunas > 0 &&
    (!palpites.palavra ||
      !palpites.significado ||
      palpites.palavra.confianca === 'baixa' ||
      palpites.significado.confianca === 'baixa');
  return { papeis, palpites, precisaDeConferencia: baixa && colunas > 2 };
}

/** A posição de cada papel que muda o texto da nota (`-1` se ausente). */
export function indicesDosPapeis(papeis: PapelNaImportacao[]) {
  return {
    palavra: papeis.indexOf('palavra'),
    significado: papeis.indexOf('significado'),
    frase: papeis.indexOf('frase'),
  };
}

/**
 * O texto da nota a partir dos campos JÁ LIMPOS e dos papéis. Sem campo de palavra, a frase faz de frente (baralho de
 * mineração: o cartão é a frase). O exemplo nunca repete a frente nem o verso.
 */
export function textosDaNota(camposLimpos: string[], papeis: PapelNaImportacao[]) {
  const i = indicesDosPapeis(papeis);
  const frente = (i.palavra >= 0 ? camposLimpos[i.palavra] : i.frase >= 0 ? camposLimpos[i.frase] : '') ?? '';
  const verso = (i.significado >= 0 ? camposLimpos[i.significado] : '') ?? '';
  const cru = (i.frase >= 0 ? camposLimpos[i.frase] : '') ?? '';
  return { frente, verso, exemplo: cru && cru !== frente && cru !== verso ? cru : '' };
}

/** A prévia que o Mapeador mostra: as mesmas regras de `textosDaNota` sobre a amostra já limpa. */
export function preverNotas(amostraLimpa: string[][], papeis: PapelNaImportacao[]) {
  return amostraLimpa.map((campos) => textosDaNota(campos, papeis));
}

/** Troca o papel de um campo. Palavra, significado e frase são ÚNICOS: quem os tinha antes vira `nenhum`. */
export function trocarPapel(
  papeis: PapelNaImportacao[],
  indice: number,
  papel: PapelNaImportacao,
): PapelNaImportacao[] {
  const novo = papeis.map((atual, i) =>
    i !== indice && papel !== 'nenhum' && atual === papel && ['palavra', 'significado', 'frase'].includes(papel)
      ? ('nenhum' as const)
      : atual,
  );
  novo[indice] = papel;
  return novo;
}
