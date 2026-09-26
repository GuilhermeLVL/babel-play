/**
 * A BASE ISO-639-1 DE UM CÓDIGO BCP-47 — uma implementação (auditoria de 2026-09-07, achado A55).
 *
 * `'pt-BR' → 'pt'`. Uma linha, e por isso mesmo estava escrita QUATRO vezes: `lib/languages.ts`,
 * `gateway/alucinacao.ts`, `server/import/youtube.ts` e `core/learning/quality.ts` (com outro
 * nome). Duplicata de uma linha não incomoda até o dia em que uma delas precisa mudar — e uma
 * delas já tinha mudado: a do YouTube tira o prefixo `a.` das legendas automáticas, o que as
 * outras três não fazem e não deveriam fazer.
 *
 * Mora no núcleo porque servidor e navegador precisam da MESMA resposta: é ela que decide se o
 * cartão em `pt-BR` casa com o filtro de `pt`.
 */
export function baseLang(code: string | undefined | null): string {
  return (code ?? '').toLowerCase().split('-')[0]
}

/**
 * O IDIOMA DE UM CARTÃO — a pergunta que Jogar, Estudo e a Biblioteca fazem antes de falar ou de
 * filtrar. Uma função só, para ninguém reinventar o fallback (auditoria 2026-09-26, idioma da sessão).
 *
 * É o idioma da FALA de onde a palavra saiu (`srcLang`), gravado na captura. Sem ele, `''`, e quem
 * chama decide o que fazer — nunca um `'en'` silencioso: foi esse default que fazia a palavra
 * portuguesa ser lida com voz inglesa.
 */
export function idiomaDoCartao(card: { srcLang?: string | null } | null | undefined): string {
  return baseLang(card?.srcLang)
}

/**
 * O idioma DOMINANTE de um conjunto de cartões (ex.: os de uma gravação), pesado por quantidade.
 * `''` quando nenhum cartão tem idioma. Empate: o que aparece primeiro.
 */
export function idiomaDominanteDosCartoes(cards: ReadonlyArray<{ srcLang?: string | null }>): string {
  const conta = new Map<string, number>()
  for (const c of cards) {
    const l = idiomaDoCartao(c)
    if (l) conta.set(l, (conta.get(l) ?? 0) + 1)
  }
  let melhor = ''
  let n = 0
  for (const [l, q] of conta) if (q > n) { melhor = l; n = q }
  return melhor
}
