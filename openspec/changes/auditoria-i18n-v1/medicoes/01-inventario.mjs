// MEDE: o inventário do que está sendo auditado — stack, versões, superfície de arquivos.
// Serve para que qualquer número das outras medições possa ser situado no tempo e na árvore.
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { andar, caminho, ehFonte, lerJSON, RAIZ, tabela, publicar } from './comum.mjs';

const pkg = lerJSON(caminho('package.json'));

const git = (cmd) => {
  try { return execSync(`git ${cmd}`, { cwd: RAIZ, encoding: 'utf8' }).trim(); }
  catch { return '(indisponível)'; }
};

const estado = {
  branch: git('rev-parse --abbrev-ref HEAD'),
  head: git('rev-parse --short HEAD'),
  baseComum: git('merge-base HEAD main'),
  commitsDesdeABase: git('rev-list --count main..HEAD'),
  sujo: git('status --porcelain').split('\n').filter(Boolean).length,
};

const contar = (dir, filtro) => { try { return andar(caminho(dir), filtro).length; } catch { return 0; } };

const superficie = [
  ['src/**/*.ts,tsx', contar('src', ehFonte)],
  ['src/components/views/*.tsx (telas de topo)', andar(caminho('src', 'components', 'views'), ehFonte).filter((p) => !p.slice(caminho('src', 'components', 'views').length + 1).match(/[/\\]/)).length],
  ['tests/**/*.test.ts,tsx', contar('tests', (p) => /\.test\.tsx?$/.test(p))],
  ['tests/e2e/*.e2e.ts', contar('tests/e2e', (p) => /\.e2e\.ts$/.test(p))],
  ['scripts/i18n/*.mjs', contar('scripts/i18n', (p) => p.endsWith('.mjs'))],
  ['scripts/trilha/*.mjs', contar('scripts/trilha', (p) => p.endsWith('.mjs'))],
  ['audit/rules/ast-grep/*.yml', contar('audit/rules/ast-grep', (p) => p.endsWith('.yml'))],
  ['public/i18n/*.json', contar('public/i18n', (p) => p.endsWith('.json'))],
  ['public/trilha/*.json', contar('public/trilha', (p) => p.endsWith('.json'))],
  ['public/glosas/*.json', contar('public/glosas', (p) => p.endsWith('.json'))],
  ['.github/workflows/*', contar('.github/workflows', () => true)],
  ['openspec/changes/*', (() => { try { return readdirSync(caminho('openspec', 'changes')).length; } catch { return 0; } })()],
];

const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const interessa = ['react', 'vite', 'typescript', 'tailwindcss', 'vitest', '@playwright/test', 'eslint', '@ast-grep/cli', 'express', 'drizzle-orm'];

let texto = tabela(['ambiente', 'valor'], [
  ['raiz auditada', RAIZ],
  ['branch', estado.branch],
  ['HEAD', estado.head],
  ['commits à frente de main', estado.commitsDesdeABase],
  ['arquivos modificados no working tree', estado.sujo],
  ['node', process.version],
  ['ICU', process.versions.icu],
  ['Intl.Segmenter', typeof Intl.Segmenter],
  ['Intl.PluralRules', typeof Intl.PluralRules],
  ['Intl.Collator', typeof Intl.Collator],
  ['Intl.DisplayNames', typeof Intl.DisplayNames],
]);

texto += '\n\nVersões da stack:\n';
texto += tabela(['pacote', 'versão'], interessa.map((n) => [n, deps[n] ?? '(ausente)']));

texto += '\n\nBibliotecas de i18n de terceiros:\n';
const libsI18n = ['i18next', 'react-i18next', 'react-intl', '@formatjs/intl', '@lingui/core', 'intl-messageformat', 'globalize'];
texto += tabela(['pacote', 'presente'], libsI18n.map((n) => [n, deps[n] ? deps[n] : 'NÃO']));

texto += '\n\nSuperfície de arquivos:\n';
texto += tabela(['categoria', 'n'], superficie);

texto += '\n\nScripts do package.json relevantes:\n';
const scripts = Object.entries(pkg.scripts ?? {}).filter(([k]) => /i18n|trilha|test|lint|typecheck|build|audit/.test(k));
texto += tabela(['script', 'comando'], scripts);

export default publicar('01 — inventário', texto, { estado, deps: Object.fromEntries(interessa.map((n) => [n, deps[n] ?? null])), superficie, semBibliotecaI18n: libsI18n.every((n) => !deps[n]) });
