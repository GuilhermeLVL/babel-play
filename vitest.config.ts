import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    /*
     * `.tsx` entrou junto com o primeiro teste de COMPONENTE do projeto (`blitzGame.test.tsx`).
     *
     * Até aqui todo teste era de função pura, e foi exatamente por isso que dois defeitos de
     * componente chegaram a ser publicados: o Ditado quebrando no "Conferir" e o Duelo aceitando a
     * última resposta duas vezes. Nenhum dos dois é visível a um teste de função — os dois são
     * ORDEM de atualização de estado dentro do React.
     */
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    /* Padrão `node`: os testes puros não precisam de DOM e pagariam o custo do jsdom à toa. Quem
       precisa declara `// @vitest-environment jsdom` no topo do arquivo. */
    environment: 'node',
    /*
     * Aponta `DATABASE_URL` para um arquivo descartável ANTES de qualquer import.
     *
     * `.env` não define `DATABASE_URL`, então `server/db/db.ts` cai no default
     * `file:./data/babel.db` — o banco REAL. Um teste que importe `db` sem o harness efêmero
     * ter definido a variável antes escreve nos dados de verdade; já aconteceu (uma migração
     * foi aplicada ao banco do desenvolvedor por esse caminho).
     */
    setupFiles: ['tests/setup-db-isolada.ts'],
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@gateway': path.resolve(__dirname, 'src/gateway'),
    },
  },
});
