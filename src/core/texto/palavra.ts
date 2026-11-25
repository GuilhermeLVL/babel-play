import { memoDeTexto } from './memoDeTexto';

/**
 * A CHAVE COMPARÁVEL DE UMA PALAVRA — uma implementação (auditoria de 2026-09-07, achados A24, A55).
 *
 * Sem acento, sem caixa, sem pontuação: é o que permite dizer que "Água" e "agua" são a mesma
 * palavra. Existia byte a byte igual em dois lugares (`core/learning/trilha.ts:chaveDaPalavra` e
 * `core/learning/quality.ts:chaveComparavel`) — dois nomes para a mesma função, o que é pior que
 * duplicata anônima: quem lê um dos arquivos não tem motivo para procurar o outro.
 *
 * O QUE ESTA FUNÇÃO NÃO É. Ela não é a chave de DEDUPLICAÇÃO do acervo, que inclui o idioma
 * (`lang|palavra`) e vive nos repositórios. Aquelas duas (servidor e modo anônimo) discordam entre
 * si — uma inverte a ordem dos campos —, e unificá-las é o objeto da change
 * `modo-anonimo-em-paridade`, porque mexe em dado gravado e não só em texto.
 */
export function chaveDaPalavra(s: string | undefined | null): string {
  return s ? chaveGuardada(s) : '';
}

/* A conta em si, guardada pela própria palavra (`memoDeTexto`): o saguão do Jogar a pedia para cada
   palavra e cada tradução do acervo, uma vez por jogo e de novo a cada passada. */
const chaveGuardada = memoDeTexto((s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento, já separadas pelo NFD
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, ''),
);

/**
 * DOBRAR TEXTO PARA COMPARAR — a segunda das três normalizações (ADR 0004).
 *
 * `chaveDaPalavra` acima responde "estas duas PALAVRAS são a mesma?" e por isso remove tudo que
 * não é letra ou número, inclusive espaço. Esta responde "estes dois TEXTOS são o mesmo?", e
 * preserva o espaço — sem ele, `água doce` e `águadoce` deixariam de ser distinguíveis, e a
 * comparação de frase do Escuta e a busca de idioma parariam de funcionar.
 *
 * O QUE FAZER COM O ESPAÇO É DO CHAMADOR, e é explícito de propósito. Havia quatro cópias desta
 * função que diferiam SÓ nisso, escondido em quatro regexes:
 *   - `languages.ts` comparava nomes de idioma sem tocar no espaço;
 *   - `cefrWordlist.ts` aparava as bordas de uma entrada de lista;
 *   - `escuta.ts` aparava e colapsava, porque compara frase ditada;
 *   - `dictionary.ts` colapsava e aparava, para casar títulos de verbete.
 * Um argumento que se lê no ponto de chamada vale mais que quatro regexes que não se citam.
 */
export type TratamentoDeEspaco = 'preservar' | 'aparar' | 'colapsar';

export function dobrarTexto(s: string | undefined | null, opcoes: { espacos: TratamentoDeEspaco }): string {
  const semAcento = (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // as marcas de acento, ja separadas pelo NFD
    .toLowerCase();
  if (opcoes.espacos === 'preservar') return semAcento;
  if (opcoes.espacos === 'aparar') return semAcento.trim();
  return semAcento.replace(/\s+/g, ' ').trim();
}

/**
 * A CHAVE DE DEDUPLICAÇÃO DO ACERVO — a mesma nas duas pontas (auditoria de 2026-09-07, achado A24).
 *
 * Existiam duas, e o comentário de uma delas dizia "mesma chave do servidor". Não era, em três
 * pontos: o servidor monta `lang|palavra` e o modo anônimo montava `palavra|lang`; o servidor tira
 * pontuação e o anônimo só aparava espaços; o servidor usa o idioma BASE (`pt` de `pt-BR`) e o
 * anônimo o locale inteiro.
 *
 * O efeito aparece na migração, que é o pior lugar: "Água!" em `pt-BR` era uma carta no anônimo e
 * outra no servidor, então quem estudou sem conta e depois criou uma via o acervo duplicar
 * palavras que já tinha. Dedup é uma decisão sobre IGUALDADE — duas respostas para "estas duas
 * palavras são a mesma?" não é duplicação de código, é duas verdades.
 *
 * A ordem `lang|palavra` é a do servidor porque é a que já está gravada em `vocab_cards.norm_key`:
 * mudar do lado do banco custaria uma migração de dados para ganhar nada.
 */
export function chaveDedup(
  palavra: string | undefined | null,
  lang: string | undefined | null,
  versao: VersaoDaChaveDedup = 1,
): string {
  const idioma = (lang ?? '').toLowerCase().split('-')[0];
  return `${idioma}|${versao === 2 ? chaveDaPalavraV2(palavra, idioma) : chaveDaPalavra(palavra)}`;
}

/**
 * A VERSÃO DA CHAVE DE DEDUPLICAÇÃO (openspec `modelo-do-aluno-e-dados`, tarefa 5.1).
 *
 *   1 = a de hoje (`chaveDaPalavra`): tira TODA marca, então `año`=`ano`, `schön`=`schon`, `avó`=`avô`,
 *       `がっこう`=`かっこう`, `й`=`и`.
 *   2 = por idioma, MANTÉM as marcas que distinguem palavras (`chaveDaPalavraV2`).
 *
 * A 2 só vale com a flag `chave_dedup_v2` ligada E depois da reescrita de `norm_key` em lotes
 * (`reescreverChavesDeDuplicata`): ligar a flag sem reescrever (ou reescrever sem ligar) faz a captura
 * seguinte criar um cartão duplicado. Por isso o padrão é 1 em toda chamada.
 */
export type VersaoDaChaveDedup = 1 | 2;

/** Marcas combinantes (Unicode) que a chave v2 MANTÉM sobre letra latina, por idioma base. */
const MARCAS_QUE_FICAM: Readonly<Record<string, string>> = {
  es: '\u0303', // ñ (til): año x ano
  pt: '\u0302\u0303\u0327', // circunflexo, til, cedilha: avô x avó, mão x mao, caça x caca. Agudo e grave caem: Água = agua
  de: '\u0308', // trema: schön x schon
  fr: '\u0300\u0302\u0308\u0327', // grave, circunflexo, trema, cedilha: où x ou, sûr x sur, ça x ca. Agudo cai
};

/** Pontos de vogal do árabe (harakat) e do hebraico (niqqud): a escrita comum não os traz, então caem. */
const PONTOS_DE_VOGAL = /[\u064b-\u065f\u0670\u05b0-\u05c7]/;
const LETRA_LATINA = /\p{Script=Latin}/u;
const MARCA = /\p{M}/u;

/**
 * A CHAVE COMPARÁVEL v2: a de `chaveDaPalavra` com as marcas que MUDAM A PALAVRA preservadas.
 *
 *  - Letra latina: só as marcas de `MARCAS_QUE_FICAM[idioma]` ficam; idioma fora da tabela (en, it, nl, pl...)
 *    segue como a v1 (acento cai). `Água` e `agua` continuam iguais em pt.
 *  - Qualquer outra escrita (kana, cirílico, devanágari, tailandês, hangul...): TODA marca fica, menos os pontos
 *    de vogal árabes e hebraicos. Dakuten (が x か), breve (й x и) e matras fazem outra palavra.
 *
 * É um REFINAMENTO da v1: duas palavras de mesma chave v2 têm sempre a mesma chave v1. Por isso a reescrita
 * de `norm_key` (v1 → v2) nunca junta dois cartões — só distingue o que antes colidia.
 */
export function chaveDaPalavraV2(s: string | undefined | null, idioma?: string | null): string {
  if (!s) return '';
  const base = (idioma ?? '').toLowerCase().split('-')[0];
  const fica = MARCAS_QUE_FICAM[base] ?? '';
  let saida = '';
  let baseLatina = false;
  for (const c of s.normalize('NFD')) {
    if (MARCA.test(c)) {
      if (PONTOS_DE_VOGAL.test(c)) continue;
      if (baseLatina ? fica.includes(c) : true) saida += c;
      continue;
    }
    baseLatina = LETRA_LATINA.test(c);
    saida += c;
  }
  return saida
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

/**
 * LETRAS LATINAS QUE O NFD NAO DECOMPOE, e a base de cada uma.
 *
 * `normalize('NFD')` separa `á` em `a` + acento, mas nao mexe em `ł`, `ø`, `đ`, `ı`, `æ` nem `œ`:
 * o traco faz parte do glifo. Como as chaves de comparacao removem tudo que nao e A-Z DEPOIS do
 * NFD, essas letras nao viravam a base — elas SUMIAM. Medido: `łatwy` virava `ATWY` (sem o L),
 * `øre` virava `RE`, `oeuvre` escrito `œuvre` virava `UVRE`. Quem digitava a palavra certa errava.
 *
 * Efeito no material: 17% da trilha polonesa e 8% da turca eram recusadas ou comparadas erradas.
 */
const BASE_LATINA: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  ı: 'i',
  İ: 'I',
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  þ: 'th',
  Þ: 'TH',
};

/** Troca as letras acima pela base antes de qualquer remocao de nao-A-Z. */
export function comBaseLatina(texto: string): string {
  return (texto ?? '').replace(/[łŁøØđĐðÐıİßæÆœŒþÞ]/g, (c) => BASE_LATINA[c] ?? c);
}
