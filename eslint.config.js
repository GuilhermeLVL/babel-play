// ESLint 9 flat config — mínimo intencional: só regras que pegam ERRO REAL.
// A formatação é do Prettier desde 2026-09-09 (`prettier.config.mjs`); o typecheck do tsc segue
// sendo a rede principal. Ampliar regras só quando uma classe de bug justificar.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default tseslint.config(
  {
    /**
     * ORDEM DE IMPORT AUTOMÁTICA — a única regra de estilo aqui, e ela não é sobre gosto.
     *
     * O Prettier não ordena import (por decisão do próprio Prettier), e a ordem manual produz um
     * tipo específico de conflito de merge: duas frentes acrescentam um import no mesmo lugar e o
     * git não sabe qual vem antes. Com ordem determinística e `--fix`, o conflito some.
     *
     * `warn` e não `error`: com `--max-warnings 0` no `npm run lint` o efeito no CI é o mesmo, e o
     * `lint-staged` já corrige antes do commit — quem vê o aviso é quem roda o lint à mão, e para
     * essa pessoa o recado é "rode --fix", não "seu código está errado".
     */
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'server.ts', 'tests/**/*.{ts,tsx}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
    },
  },
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**', 'public/**', 'data/**', '*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      // O codebase usa `any` deliberadamente nas bordas (workers, APIs experimentais) — não é erro.
      '@typescript-eslint/no-explicit-any': 'off',
      // ADOÇÃO GRADUAL (ratchet): o codebase é pré-lint. Regras informativas ficam como warning
      // (visíveis, não bloqueiam CI); promover a error módulo a módulo conforme forem zeradas.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'preserve-caught-error': 'off', // o padrão do projeto re-lança mensagens amigáveis sem encadear cause
      // try/catch vazio é o padrão "best-effort" documentado do projeto.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Ratchet D5 (audit-architecture-hardening): no caminho de rede/adapter dos proxies de IA,
    // engolir a exceção esconde falha real. NOVOS catches aqui DEVEM logar via server/lib/logger.ts
    // antes de degradar (os existentes já surfam o erro — via log() ou resposta 502; server/ai/**
    // está limpo de catch vazio). O front (localStorage)
    // segue com o `no-empty` global acima. `body.body.length=0` conta statements → pega catch vazio
    // E catch com só comentário (que o `no-empty` puro deixaria passar).
    files: ['server/ai/**/*.ts'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CatchClause[body.body.length=0]',
          message:
            'catch vazio em caminho de rede/adapter: logue via server/lib/logger.ts (log(...)) antes de degradar.',
        },
      ],
    },
  },
  {
    /**
     * F5-04 — `console.*` PROIBIDO no caminho de request do servidor.
     *
     * O recorte é estreito de propósito, e o número que o justifica corrige o próprio achado: a
     * auditoria registrou "logger adotado em 3 de ~82 pontos", o que sugere adoção quase nula.
     * Medindo por área, os ~79 restantes estão em (a) código de NAVEGADOR, onde `console` é o
     * destino correto, e (b) mensagens de BOOT em `server.ts` e nos scripts de migração, que
     * legitimamente vão para o stdout na subida. No caminho que atende requisição sobravam
     * QUATRO, e três já foram migradas.
     *
     * `erroDeRota` e `erroGlobal` ficam de fora: os dois emitem a linha JSON pelo logger E o
     * texto integral por `console.error` ao lado, deliberadamente — é o que um operador lê ao
     * investigar, e a allowlist do logger corta justamente o detalhe que ele precisa.
     *
     * `error` e não `warn`: um `console.*` novo aqui é log de produção que nenhum agregador vê,
     * e é exatamente o que a regra existe para impedir de voltar.
     */
    /* O GLOB COBRE A CAMADA, NAO A PASTA DE HOJE. A lista literal de quatro pastas deixaria de
       cobrir no dia em que a arvore virasse `server/dominios/<dominio>/rotas/`, e um
       `console.log` novo passaria calado. As entradas por camada (rotas, servico, repositorio)
       valem para a arvore atual e para a proxima.
       (Sem glob literal neste comentario: a sequencia de asterisco com barra fecharia o bloco.) */
    files: [
      'server/routes/**/*.ts',
      'server/ai/**/*.ts',
      'server/db/repositories/**/*.ts',
      'server/import/**/*.ts',
      'server/**/rotas/**/*.ts',
      'server/**/servico/**/*.ts',
      'server/**/repositorio/**/*.ts',
    ],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Scripts Node puros (.mjs) — sem parser TS, precisam dos globals declarados.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // `performance.now()` e o relogio monotonico dos scripts de medicao (`arranque.mjs`,
        // `recuperacao.mjs`, `concorrencia.mjs`) — `Date.now()` nao serve la, ele salta com o
        // ajuste de relogio do sistema no meio de uma medicao de milissegundos.
        performance: 'readonly',
      },
    },
  },
  {
    // Roteiros do k6 (`scripts/perf/*.k6.js`). Eles NAO rodam no Node: rodam dentro do container
    // `grafana/k6`, que injeta `__ENV`, `__VU` e `__ITER` como globais. Sem esta declaracao o
    // eslint acusa `no-undef` no que e justamente a interface da ferramenta.
    files: ['scripts/perf/*.k6.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
  },
  {
    // Coletores da medição de UX: o corpo das funções passadas a `page.evaluate()` é serializado
    // e executado DENTRO do navegador, então `document`, `getComputedStyle` e `CSS` são globais
    // legítimos ali — não são erro, são o ponto.
    files: ['scripts/ux-medicao/coletores/*.mjs'],
    languageOptions: {
      globals: { document: 'readonly', getComputedStyle: 'readonly', CSS: 'readonly', window: 'readonly' },
    },
  },
  {
    // Evidências do redesign: o corpo passado a `context.addInitScript()` roda DENTRO do navegador,
    // onde `localStorage` é global legítimo — é assim que o modo escuro e a fila de recompensas são
    // forçados antes de a página carregar (mesma técnica de `tests/e2e/acessibilidade.e2e.ts`).
    files: ['scripts/redesign/evidencias.mjs'],
    languageOptions: { globals: { localStorage: 'readonly' } },
  },
)
