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
