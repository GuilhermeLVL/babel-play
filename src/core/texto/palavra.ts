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
