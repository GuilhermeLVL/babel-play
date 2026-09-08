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
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento, já separadas pelo NFD
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
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
export function chaveDedup(palavra: string | undefined | null, lang: string | undefined | null): string {
  const idioma = (lang ?? '').toLowerCase().split('-')[0]
  return `${idioma}|${chaveDaPalavra(palavra)}`
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
  'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D',
  'ı': 'i', 'İ': 'I', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'þ': 'th', 'Þ': 'TH',
};

/** Troca as letras acima pela base antes de qualquer remocao de nao-A-Z. */
export function comBaseLatina(texto: string): string {
  return (texto ?? '').replace(/[łŁøØđĐðÐıİßæÆœŒþÞ]/g, (c) => BASE_LATINA[c] ?? c);
}
