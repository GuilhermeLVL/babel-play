// Monta uma árvore mínima com dados deliberadamente ruins e roda o GATE DE PUBLICAÇÃO real
// (scripts/trilha/verificar.mjs, copiado sem alteração) contra ela.
//
// Objetivo: provar empiricamente que o gate REPROVA — e descobrir o que ele deixa passar.
// Nada é escrito no repositório: a árvore inteira vive no scratchpad.
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'c:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/multi-idioma';
const BASE = process.argv[2];
rmSync(BASE, { recursive: true, force: true });

const dir = (...p) => { const d = join(BASE, ...p); mkdirSync(d, { recursive: true }); return d; };
dir('scripts', 'trilha'); dir('public', 'trilha'); dir('public', 'glosas'); dir('src', 'data', 'trilha', 'niveis');

// O gate real, byte a byte.
copyFileSync(join(REPO, 'scripts/trilha/verificar.mjs'), join(BASE, 'scripts/trilha/verificar.mjs'));

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Monta um idioma com N palavras por faixa, uma fração `sujo` fora da escrita e `taxaGlosa` de glosa. */
function idioma({ lang, porFaixa, limpa, suja, taxaGlosa }) {
  const niveis = {}; const todas = [];
  for (const n of NIVEIS) {
    niveis[n] = [];
    for (let i = 0; i < porFaixa; i++) {
      // A fração suja é distribuída por igual entre as faixas.
      // O nome carrega a faixa: sem isso a mesma palavra aparece nas seis e o gate reprova por
      // divergência de nível, mascarando o que este teste quer provar.
      const ehSuja = i < Math.round(porFaixa * suja);
      const p = `${ehSuja ? limpa.sujo : limpa.boa}${n}${i}`;
      niveis[n].push([p, `frase com ${p}`]);
      todas.push(p);
    }
  }
  const glosas = {};
  for (let i = 0; i < Math.round(todas.length * taxaGlosa); i++) glosas[todas[i]] = `glosa${i}`;

  writeFileSync(join(BASE, 'public/trilha', `${lang}.json`),
    JSON.stringify({ lang, versao: 2, escala: 'frequencia', fonte: 'fixture', niveis }));
  writeFileSync(join(BASE, 'public/glosas', `${lang}-pt.json`),
    JSON.stringify({ par: `${lang}-pt`, praticado: lang, nativo: 'pt', versao: 1, trilhaVersao: 2, fonte: 'fixture', cobertura: {}, glosas, frases: {} }));

  // O derivado tem de bater com a origem, senão o gate falha por outro motivo e o teste não prova nada.
  const derivado = {};
  const chave = (p) => p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  for (const n of NIVEIS) derivado[n] = niveis[n].map((it) => chave(it[0])).join('|');
  writeFileSync(join(BASE, 'src/data/trilha/niveis', `${lang}.json`), JSON.stringify(derivado));

  return {
    escala: 'frequencia', versao: 2, total: todas.length,
    comFrase: todas.length,
    porNivel: Object.fromEntries(NIVEIS.map((n) => [n, porFaixa])),
    glosas: ['pt'],
  };
}

const casos = JSON.parse(process.argv[3]);
const indice = {};
for (const c of casos) indice[c.lang] = idioma(c);
writeFileSync(join(BASE, 'src/data/trilha/indice.json'), JSON.stringify(indice));
console.log('fixture montada em', BASE, 'com', Object.keys(indice).join(', '));
