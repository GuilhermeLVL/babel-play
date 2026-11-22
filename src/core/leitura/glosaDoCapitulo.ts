/**
 * A GLOSA DAS PALAVRAS NOVAS NO LEITOR (spec `glosa-no-leitor`): quais palavras de um capítulo ganham uma tradução
 * curta acima delas. Puro: sem DOM, sem rede. Quem monta a lista de palavras (com os ranges) e desenha é
 * `src/lib/leitor/glosaNoCapitulo.ts`.
 *
 * A RÉGUA DE "NOVA" é a da cobertura (`coberturaDoTexto`): fora as funcionais do idioma, os nomes próprios e o que a
 * pessoa já conhece (caderno aprendendo/dominada + "Já sei"); some também o que ela marcou como ignorado.
 *
 * O LIMITE, para não poluir a página:
 *  - no máximo UMA glosa a cada `JANELA_DA_GLOSA` palavras seguidas (duas glosas ficam a pelo menos esta distância);
 *  - uma palavra repetida só ganha glosa nas `OCORRENCIAS_COM_GLOSA` primeiras ocorrências do capítulo;
 *  - quando não cabe tudo, as mais frequentes do capítulo vêm primeiro (a mais repetida é a que mais compensa saber);
 *  - palavra sem glosa no dicionário local não aparece (sem glosa, nada).
 */
import { baseLang } from '../texto/idioma';
import { funcionais } from './coberturaDoTexto';
import { chavesDeLema, dividirTexto } from './textoDaLeitura';

/** Prefixo da chave da glosa no overlayer: o motor o ignora no toque (não é anotação). */
export const PREFIXO_DA_GLOSA = 'frasy-glosa:';

/** Distância mínima, em palavras, entre duas glosas: 1 glosa a cada 4 palavras no máximo. */
export const JANELA_DA_GLOSA = 4;
/** Quantas ocorrências da mesma palavra ganham glosa. */
export const OCORRENCIAS_COM_GLOSA = 2;
/** Teto de texto analisado por capítulo (o resto fica sem glosa): a conta não trava a tela. */
export const LIMITE_DE_CARACTERES_DA_GLOSA = 120_000;

export interface PalavraDoCapitulo {
  /** Como aparece no texto, com a pontuação colada. */
  texto: string;
  chave: string;
  /** Posição das letras da palavra no texto do capítulo (sem a pontuação das pontas). */
  inicio: number;
  fim: number;
  nomeProprio: boolean;
}

/** As palavras do texto do capítulo, na ordem, com a posição das LETRAS (a pontuação das pontas fica de fora). */
export function palavrasDoCapitulo(texto: string, lang: string): PalavraDoCapitulo[] {
  const base = baseLang(lang);
  const recorte = texto.length > LIMITE_DE_CARACTERES_DA_GLOSA ? texto.slice(0, LIMITE_DE_CARACTERES_DA_GLOSA) : texto;
  return dividirTexto(recorte, base).palavras.map((p) => {
    const bruta = p.texto;
    const ini = bruta.search(/[\p{L}\p{N}]/u);
    let fimLetras = bruta.length;
    while (fimLetras > ini && !/[\p{L}\p{N}]/u.test(bruta[fimLetras - 1])) fimLetras--;
    return {
      texto: bruta.slice(ini, fimLetras),
      chave: p.chave,
      inicio: p.inicio + ini,
      fim: p.inicio + fimLetras,
      nomeProprio: p.nomeProprio,
    };
  });
}

export interface EntradaDaGlosa {
  palavras: readonly PalavraDoCapitulo[];
  lang: string;
  /** As chaves que a pessoa conhece (`chavesConhecidas`). */
  conhecidas: ReadonlySet<string>;
  /** As que ela marcou como ignoradas. */
  ignoradas?: ReadonlySet<string>;
}

/** A palavra (por índice) é "nova" na régua da cobertura? */
export function ehPalavraNova(p: PalavraDoCapitulo, e: Omit<EntradaDaGlosa, 'palavras'>): boolean {
  if (p.nomeProprio || funcionais(e.lang).has(p.chave)) return false;
  if (e.ignoradas?.has(p.chave)) return false;
  return !chavesDeLema(p.texto, e.lang).some((c) => e.conhecidas.has(c) || e.ignoradas?.has(c));
}

/** Os índices (em `palavras`) das palavras novas, na ordem do texto. */
export function indicesDasPalavrasNovas(e: EntradaDaGlosa): number[] {
  const memo = new Map<string, boolean>();
  const r: number[] = [];
  e.palavras.forEach((p, i) => {
    let nova = memo.get(p.chave);
    // Nome próprio depende da ocorrência (maiúscula no meio da frase): só memoriza o que não é.
    if (nova === undefined || p.nomeProprio) {
      nova = ehPalavraNova(p, e);
      if (!p.nomeProprio) memo.set(p.chave, nova);
    }
    if (nova) r.push(i);
  });
  return r;
}

/**
 * Os índices das palavras que ganham glosa, em ordem do texto. `glosas` diz quais chaves têm glosa local (só
 * importa a presença: o texto da glosa é de quem desenha).
 */
export function escolherGlosas(e: EntradaDaGlosa, glosas: ReadonlySet<string>): number[] {
  const novas = indicesDasPalavrasNovas(e).filter((i) => glosas.has(e.palavras[i].chave));
  const frequencia = new Map<string, number>();
  for (const i of novas) frequencia.set(e.palavras[i].chave, (frequencia.get(e.palavras[i].chave) ?? 0) + 1);

  // Só as primeiras ocorrências de cada palavra são candidatas.
  const vistas = new Map<string, number>();
  const candidatas = novas.filter((i) => {
    const c = e.palavras[i].chave;
    const n = (vistas.get(c) ?? 0) + 1;
    vistas.set(c, n);
    return n <= OCORRENCIAS_COM_GLOSA;
  });
  // Mais frequentes primeiro; empate pela ordem do texto.
  candidatas.sort((a, b) => {
    const d = (frequencia.get(e.palavras[b].chave) ?? 0) - (frequencia.get(e.palavras[a].chave) ?? 0);
    return d || a - b;
  });
  const escolhidas: number[] = [];
  for (const i of candidatas) {
    if (escolhidas.every((j) => Math.abs(j - i) >= JANELA_DA_GLOSA)) escolhidas.push(i);
  }
  return escolhidas.sort((a, b) => a - b);
}
