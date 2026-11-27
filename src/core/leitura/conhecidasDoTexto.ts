/**
 * A % DE PALAVRAS CONHECIDAS DE UM TEXTO ANTES DE ABRI-LO (openspec `leitura-assistida`, tarefa C4). Pura: recebe o texto
 * do capítulo e o vocabulário da pessoa (`FonteDeVocabulario`) e conta com a MESMA régua do destaque dentro do capítulo
 * (`DestaqueDoCapitulo`): palavra funcional e nome próprio contam como conhecidas, "conhecida", "ignorada" e "aprendendo"
 * entram na % (a pessoa não precisa de ajuda nelas) e o arredondamento é para baixo (97,9% não vira 98%).
 */
import { funcionais } from './coberturaDoTexto';
import {
  type FonteDeVocabulario,
  type InfoDaPalavra,
  infoDaPalavra,
  type ResumoDoCapitulo,
  resumoDoCapitulo,
} from './destaqueDeVocabulario';
import { palavrasDoCapitulo } from './glosaDoCapitulo';
import { chavesDeLema } from './textoDaLeitura';

/** Capítulo curto demais não dá uma % que diga algo (a conta oscilaria a cada palavra). */
export const MINIMO_DE_PALAVRAS_PARA_PORCENTAGEM = 30;

/** O resumo do vocabulário de um texto, ou `null` quando ele é curto demais ou não há vocabulário carregado. */
export function resumoDeConhecidasDoTexto(
  texto: string,
  idioma: string,
  fonte: FonteDeVocabulario,
): ResumoDoCapitulo | null {
  if (!idioma || fonte.caderno === null) return null;
  const palavras = palavrasDoCapitulo(texto, idioma);
  if (palavras.length < MINIMO_DE_PALAVRAS_PARA_PORCENTAGEM) return null;
  const sabidas = funcionais(idioma);
  const memo = new Map<string, InfoDaPalavra>();
  const infos = palavras.map((p) => {
    const semDestaque = p.nomeProprio || sabidas.has(p.chave);
    const k = semDestaque ? '*' : p.chave;
    let info = memo.get(k);
    if (!info) {
      info = infoDaPalavra(fonte, chavesDeLema(p.texto, idioma), idioma, 0, semDestaque);
      memo.set(k, info);
    }
    return info;
  });
  return resumoDoCapitulo(infos);
}

/** Só o número (% de conhecidas, arredondada para baixo), ou `null`. */
export function porcentagemDeConhecidasDoTexto(
  texto: string,
  idioma: string,
  fonte: FonteDeVocabulario,
): number | null {
  return resumoDeConhecidasDoTexto(texto, idioma, fonte)?.porcentagemDeConhecidas ?? null;
}
