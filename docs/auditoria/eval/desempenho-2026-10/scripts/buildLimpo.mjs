// BUILD DA EDICAO ESTATICA SO COM AS MUDANCAS DESTE CONSERTO. A arvore de trabalho e dividida com outro
// agente (o saguao do Jogar): os arquivos de `src/` que ELE mudou entram aqui como estao no HEAD, para a
// medida de "depois" nao misturar os dois trabalhos. Nada e escrito no repositorio.
// uso: node buildLimpo.mjs <pasta de saida>
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const REPO = 'C:/Users/Guilh/dev/ei-polimento';
const MEUS = new Set([
  'src/App.tsx', 'src/components/shell/TrilhoDoQuest.tsx', 'src/lib/dispositivo/respostaAoApontar.ts', 'src/lib/polimento/base.ts',
  'src/lib/polimento/estilos.ts', 'src/lib/polimento/ponteiro.ts', 'src/lib/polimento/sentidos.ts', 'src/lib/polimento/telas.ts',
  'src/styles/quest.css', 'src/lib/polimento/minis.ts', 'src/lib/polimento/precarga.ts', 'src/lib/polimento/pulso.ts', 'src/styles/polimentoDesempenho.css',
  'src/lib/appearanceSync.ts', 'src/components/DocumentPiP.tsx', 'src/styles/polimentoCursor.css',
]);
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 });
const dosOutros = git('status', '--porcelain', '--', 'src', 'public', 'index.html')
  .split('\n').filter(Boolean).map((l) => ({ estado: l.slice(0, 2), arq: l.slice(3).trim() })).filter((x) => !MEUS.has(x.arq));
const mudados = dosOutros.filter((x) => x.estado.trim() === 'M').map((x) => x.arq);
console.log('do HEAD (mudados por outro agente):', mudados.join(', ') || 'nenhum');
console.log('novos de outro agente (so entram se um arquivo meu ou do HEAD os importar):', dosOutros.filter((x) => x.estado === '??').map((x) => x.arq).join(', ') || 'nenhum');
const noHead = new Map(mudados.map((a) => [path.resolve(REPO, a).replace(/\\/g, '/').toLowerCase(), git('show', 'HEAD:' + a)]));
Object.assign(process.env, { VITE_EDICAO_ESTATICA: '1', VITE_RECOMPENSAS_V2: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_AUTH_REQUIRED: '' });
process.chdir(REPO);
const vite = await import(pathToFileURL(path.join(REPO, 'node_modules/vite/dist/node/index.js')).href);
await vite.build({
  root: REPO,
  plugins: [{ name: 'head-dos-outros', enforce: 'pre', load(id) { const k = id.split('?')[0].replace(/\\/g, '/').toLowerCase(); return noHead.has(k) ? noHead.get(k) : null; } }],
  build: { outDir: path.resolve(process.argv[2]), emptyOutDir: true },
  logLevel: 'warn',
});
console.log('FEITO', process.argv[2]);
