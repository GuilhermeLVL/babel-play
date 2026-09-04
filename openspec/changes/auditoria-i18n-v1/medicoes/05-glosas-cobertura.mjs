// MEDE: cobertura de glosa e de frase traduzida POR PAR, não só o total global.
//
// O relatório fala em "41%" e depois "37%" de cobertura como se fosse um número do produto.
// Não é: a glosa é de um PAR de idiomas, e o par é sempre `xx-pt`. Um alemão estudando
// espanhol não tem glosa nenhuma. Aqui separo o que existe por par do que existiria se
// houvesse outros nativos.
//
// Também conto três defeitos que a cobertura bruta esconde:
//   - glosa idêntica à palavra (`temor → temor`): ocupa a vaga e não ensina nada
//   - glosa vazia
//   - glosa para palavra que não está na trilha daquele idioma (glosa órfã)
import { andar, caminho, lerJSON, relativo, tamanho, tabela, pct, publicar } from './comum.mjs';

const DIR_GLOSAS = caminho('public', 'glosas');
const DIR_TRILHA = caminho('public', 'trilha');

// Índice das palavras de cada trilha, para achar glosa órfã.
const palavrasDaTrilha = new Map();
for (const arq of andar(DIR_TRILHA, (p) => p.endsWith('.json'))) {
  const lang = arq.split(/[/\\]/).pop().replace('.json', '');
  const dados = lerJSON(arq);
  const set = new Set();
  for (const itens of Object.values(dados.niveis)) {
    for (const i of itens) set.add((Array.isArray(i) ? i[0] : i).normalize('NFC'));
  }
  palavrasDaTrilha.set(lang, set);
}

const resultados = [];
const nativos = new Set();

for (const arq of andar(DIR_GLOSAS, (p) => p.endsWith('.json'))) {
  const par = arq.split(/[/\\]/).pop().replace('.json', '');
  const d = lerJSON(arq);
  nativos.add(d.nativo);

  const glosas = d.glosas ?? {};
  const frases = d.frases ?? {};
  const chaves = Object.keys(glosas);

  const identicas = chaves.filter((k) => typeof glosas[k] === 'string' && glosas[k].normalize('NFC') === k.normalize('NFC'));
  const vazias = chaves.filter((k) => typeof glosas[k] !== 'string' || glosas[k].trim() === '');

  const trilha = palavrasDaTrilha.get(d.praticado);
  const orfas = trilha ? chaves.filter((k) => !trilha.has(k.normalize('NFC'))) : [];

  const totalTrilha = trilha ? trilha.size : 0;
  const uteis = chaves.length - identicas.length - vazias.length;

  resultados.push({
    par, arquivo: relativo(arq), bytes: tamanho(arq),
    praticado: d.praticado, nativo: d.nativo,
    totalTrilha,
    glosas: chaves.length,
    glosasUteis: uteis,
    identicas: identicas.length,
    vazias: vazias.length,
    orfas: orfas.length,
    exemplosIdenticas: identicas.slice(0, 4),
    exemplosOrfas: orfas.slice(0, 4),
    frases: Object.keys(frases).length,
    coberturaDeclarada: d.cobertura ?? null,
  });
}

const linhas = resultados.map((r) => [
  r.par, r.totalTrilha, r.glosas, pct(r.glosas, r.totalTrilha),
  r.glosasUteis, pct(r.glosasUteis, r.totalTrilha),
  r.identicas, r.vazias, r.orfas, r.frases, `${(r.bytes / 1024).toFixed(0)} kB`,
]);

let texto = tabela(
  ['par', 'palavras', 'glosas', '% bruta', 'glosas úteis', '% útil', 'iguais à palavra', 'vazias', 'órfãs', 'frases trad.', 'tamanho'],
  linhas,
);

const somaGlosas = resultados.reduce((a, r) => a + r.glosas, 0);
const somaUteis = resultados.reduce((a, r) => a + r.glosasUteis, 0);
const somaTrilha = resultados.reduce((a, r) => a + r.totalTrilha, 0);
const somaFrases = resultados.reduce((a, r) => a + r.frases, 0);

texto += `\n\nPares de glosa existentes: ${resultados.length}`;
texto += `\nNativos atendidos: ${[...nativos].join(', ')}  → todo par é *-pt; nenhum outro nativo tem glosa.`;
texto += `\nTOTAL de glosas: ${somaGlosas} (úteis: ${somaUteis})`;
texto += `\nTOTAL de frases traduzidas: ${somaFrases}`;
texto += `\nCobertura global bruta: ${pct(somaGlosas, somaTrilha)} · útil: ${pct(somaUteis, somaTrilha)}`;

// O inglês é v1 e carrega a glosa embutida na própria trilha, sem arquivo em public/glosas.
const comArquivo = new Set(resultados.map((r) => r.praticado));
const semArquivo = [...palavrasDaTrilha.keys()].filter((l) => !comArquivo.has(l));
if (semArquivo.length) texto += `\n\nIdiomas com trilha e SEM arquivo de glosa: ${semArquivo.join(', ')} (glosa embutida na trilha v1).`;

texto += '\n\nExemplos de glosa idêntica à palavra (não ensina nada):';
let houve = false;
for (const r of resultados) {
  if (!r.exemplosIdenticas.length) continue;
  houve = true;
  texto += `\n  [${r.par}] ${r.exemplosIdenticas.map((e) => JSON.stringify(e)).join(' ')}`;
}
if (!houve) texto += ' nenhuma.';

texto += '\n\nExemplos de glosa órfã (palavra fora da trilha daquele idioma):';
let houveOrfa = false;
for (const r of resultados) {
  if (!r.exemplosOrfas.length) continue;
  houveOrfa = true;
  texto += `\n  [${r.par}] ${r.exemplosOrfas.map((e) => JSON.stringify(e)).join(' ')}`;
}
if (!houveOrfa) texto += ' nenhuma.';

export default publicar('05 — glosas e frases, por par', texto, {
  pares: resultados.length, somaGlosas, somaUteis, somaFrases, nativos: [...nativos], resultados,
});
