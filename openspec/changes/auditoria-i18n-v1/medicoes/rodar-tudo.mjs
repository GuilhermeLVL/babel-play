// Encadeia as oito medições, imprime tudo e grava em saidas/.
//
//   node openspec/changes/auditoria-i18n-v1/medicoes/rodar-tudo.mjs
//
// Somente leitura sobre o código do app: só escreve dentro de medicoes/saidas/.
// A medição 08 depende de `npm run build` ter rodado antes; sem dist/ ela se anuncia e passa.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDAS = join(AQUI, 'saidas');
mkdirSync(SAIDAS, { recursive: true });

const MEDICOES = [
  '01-inventario.mjs',
  '02-chaves-catalogo.mjs',
  '03-chamadas-t.mjs',
  '04-trilha-palavras.mjs',
  '05-glosas-cobertura.mjs',
  '06-telas-e-rotas.mjs',
  '07-locale-e-caixa.mjs',
  '08-bundle.mjs',
  '09-divida-de-codigo.mjs',
  '10-segmentacao.mjs',
  '11-desenclitico-e-amostra.mjs',
  '12-normalizacao-e-frases.mjs',
  '13-censo-de-cobertura.mjs',
  '14-estresse-por-escrita.mjs',
];

const consolidado = {
  quando: new Date().toISOString(),
  node: process.version,
  icu: process.versions.icu,
  medicoes: {},
};

for (const arquivo of MEDICOES) {
  // Cada medição imprime em stdout ao ser importada; capturo o texto para gravar em disco.
  const linhas = [];
  const original = console.log;
  console.log = (...args) => { linhas.push(args.join(' ')); original(...args); };
  try {
    const mod = await import(`./${arquivo}`);
    if (mod.default) consolidado.medicoes[mod.default.nome] = mod.default.dados;
  } catch (erro) {
    original(`\n!!! ${arquivo} falhou: ${erro.message}`);
    linhas.push(`FALHOU: ${erro.stack}`);
  } finally {
    console.log = original;
  }
  writeFileSync(join(SAIDAS, arquivo.replace('.mjs', '.txt')), linhas.join('\n'), 'utf8');
}

writeFileSync(join(SAIDAS, 'consolidado.json'), JSON.stringify(consolidado, null, 2), 'utf8');
console.log(`\n\nGravado em ${SAIDAS}`);
