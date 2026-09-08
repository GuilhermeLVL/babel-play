// ESLint 9 flat config — mínimo intencional: só regras que pegam ERRO REAL.
// Sem guerra de estilo (formatação fica com o editor); o typecheck do tsc segue
// sendo a rede principal. Ampliar regras só quando uma classe de bug justificar.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
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
      'no-restricted-syntax': ['error', {
        selector: 'CatchClause[body.body.length=0]',
        message: 'catch vazio em caminho de rede/adapter: logue via server/lib/logger.ts (log(...)) antes de degradar.',
      }],
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
    files: ['server/routes/**/*.ts', 'server/ai/**/*.ts', 'server/db/repositories/**/*.ts', 'server/import/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Scripts Node puros (.mjs) — sem parser TS, precisam dos globals declarados.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly', Buffer: 'readonly', console: 'readonly',
        fetch: 'readonly', URL: 'readonly', __dirname: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
      },
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
);
