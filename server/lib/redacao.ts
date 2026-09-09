/**
 * REDAÇÃO DO TEXTO DE ERRO ANTES DE ELE VIRAR LOG.
 *
 * O `logger.ts` sempre teve allowlist de CAMPOS: qualquer chave fora da lista é descartada, e é
 * isso que garante que transcrição, prompt e chave de API não vão para o diário. A allowlist é
 * sobre a chave, e não sobre o VALOR — e o campo `error`, que está na lista, carrega o texto do
 * erro inteiro.
 *
 * O QUE ISSO DEIXAVA PASSAR, medido em 2026-09-09 com drizzle 0.44 + @libsql/client:
 *
 *   String(err) === 'Error: Failed query: insert into "t" ("id","texto") values (?, ?)\n' +
 *                  'params: 2,transcricao-do-usuario-meu-cpf-e-123.456.789-00'
 *
 * O driver do libsql sozinho NÃO faz isso — `LibsqlError` traz só `SQLITE_CONSTRAINT: UNIQUE
 * constraint failed: t.texto`, sem valor nenhum (confirmado no mesmo teste). Quem anexa é o
 * drizzle, que escreve `message`, `stack` E uma propriedade `params` com TODOS os valores
 * vinculados. Ou seja: toda escrita que falha — salvar transcrição, gravar cartão, guardar
 * credencial — despejava o conteúdo do usuário no `error` do log, atravessando a allowlist por
 * dentro do único campo que a allowlist deixa passar.
 *
 * O QUE ESTA FUNÇÃO REMOVE, e por que só isto:
 *
 *   1. o rabo `params: ...` do drizzle — a query fica (é ela que diz onde quebrou), os valores
 *      saem inteiros. Cortar do `params:` para a frente é preciso porque o formato é posicional:
 *      não há como saber qual valor é sensível, então nenhum passa.
 *   2. e-mail, que aparece em erro de conta e de cobrança;
 *   3. as três formas de segredo que este servidor manuseia: `Bearer <token>`, chave de provedor
 *      (`sk-...`, `gsk_...`, `AIza...`) e JWT (`eyJ...`).
 *
 * O QUE ELA NÃO TENTA REMOVER, deliberadamente: CPF, telefone e afins por regex de formato. O
 * padrão colide com id, timestamp e número de linha, e um redator que corrompe a mensagem de erro
 * custa mais do que resolve — a defesa contra esses é o item 1, que já tira a fonte deles.
 *
 * Ela roda dentro de `log()`, e não nos chamadores: chokepoint único, pelo mesmo motivo que a
 * allowlist mora lá. Um `log('error', { error: ... })` novo nasce coberto.
 */

/** Marca visível no log — quem investiga precisa saber que houve corte, não achar que não havia nada. */
const CORTADO = '[redigido]'

const REGRAS: Array<[RegExp, string]> = [
  /*
   * 1. Os parâmetros vinculados que o drizzle anexa.
   *
   * Vai até o FIM do texto — os valores são separados por vírgula e podem conter quebra de linha,
   * então não existe fim confiável dentro deles. A exceção é o começo do stack: `\n    at ...`.
   * Sem essa saída, redigir o campo `stack` apagaria justamente os quadros, que são a única coisa
   * que sobrou de útil ali.
   */
  [/\bparams:\s[\s\S]*?(?=\n\s+at |$)/g, `params: ${CORTADO}`],
  // 2. E-mail.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, `${CORTADO}@email`],
  // 3a. Bearer.
  [/\bBearer\s+[\w\-._~+/]+=*/gi, `Bearer ${CORTADO}`],
  // 3b. Chave de provedor. Os três prefixos que aparecem em `server/ai/provedores.ts`.
  [/\b(sk|gsk|sk-proj|sk-ant)[-_][A-Za-z0-9\-_]{8,}/g, `${CORTADO}`],
  [/\bAIza[A-Za-z0-9\-_]{10,}/g, `${CORTADO}`],
  // 3c. JWT: três blocos base64url separados por ponto, começando pelo cabeçalho `{"alg"`.
  [/\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, `${CORTADO}`],
]

/**
 * Devolve o texto sem os valores que não podem ir para o diário.
 *
 * Idempotente por construção: aplicada duas vezes, o resultado é o mesmo — `[redigido]` não casa
 * com nenhuma das regras. Isso importa porque a mesma string passa por `log()` e pelo console.
 */
export function redigirErro(texto: string): string {
  let saida = texto
  for (const [padrao, troca] of REGRAS) saida = saida.replace(padrao, troca)
  return saida
}
