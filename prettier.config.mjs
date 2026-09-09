/**
 * AS DUAS CONVENÇÕES DA CASA, MEDIDAS ANTES DE ESCOLHER (Fase 3 da rodada de saneamento).
 *
 * Não era caos, era convenção por área: `src/` fecha statement com ponto e vírgula (6.691 linhas
 * contra 1.952) e `server/`, `tests/` e `scripts/` não fecham (2.063 contra 32 no servidor). Aspas
 * simples são unânimes (3.168 contra 4). Impor um `semi` único reescreveria milhares de linhas de
 * um dos lados só para satisfazer a ferramenta — o `overrides` abaixo preserva a convenção de cada
 * área, e assim o diff da formatação é sobre formatação.
 *
 * `printWidth: 120`: o código é escrito largo (7.885 linhas passam de 100 caracteres, 3.405 de 120).
 * Os comentários em prosa, que são metade do valor deste repositório, já quebram em ~100 e o
 * Prettier não mexe no conteúdo deles.
 *
 * Config em `.mjs` e não em `.json` porque este arquivo precisa explicar a escolha, e JSON não tem
 * comentário — a versão anterior tentou uma chave `"//"` e o Prettier a rejeitou com aviso.
 */
export default {
  singleQuote: true,
  semi: true,
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      files: [
        'server/**/*.ts',
        'server.ts',
        'tests/**/*.ts',
        'tests/**/*.tsx',
        'scripts/**/*.mjs',
        '*.config.ts',
        '*.config.js',
        '*.config.mjs',
      ],
      options: { semi: false },
    },
    { files: ['*.md', '*.json', '*.yml', '*.yaml'], options: { printWidth: 100 } },
  ],
}
