// MEDE: o peso do build e onde ele está.
//
// A alegação a confrontar (docs/auditoria/trilha-multi-idioma-v1.md:239-243) é
// "dist/assets 34,0 MB → 27,7 MB" e "entrada do app 742 kB". Aqui recontam-se as duas,
// e separa-se o que é dado de idioma do que é peso fixo (WASM do ONNX Runtime).
//
// Exige `npm run build` rodado antes. Sem dist/, o script diz isso e sai.
import { existsSync } from 'node:fs';
import { andar, caminho, tamanho, relativo, lerTexto, tabela, pct, publicar } from './comum.mjs';

const DIST = caminho('dist');
if (!existsSync(DIST)) {
  console.log('\n===== 08 — bundle =====\ndist/ não existe. Rode `npm run build` antes.');
  process.exit(0);
}

const arquivos = andar(DIST).map((p) => ({ arquivo: relativo(p), bytes: tamanho(p) }));
const total = arquivos.reduce((a, x) => a + x.bytes, 0);

const assets = arquivos.filter((x) => x.arquivo.includes('dist/assets/'));
const totalAssets = assets.reduce((a, x) => a + x.bytes, 0);

const grupo = (re) => {
  const g = arquivos.filter((x) => re.test(x.arquivo));
  return { n: g.length, bytes: g.reduce((a, x) => a + x.bytes, 0) };
};

const categorias = [
  ['WASM (ONNX Runtime, Whisper, tradução local)', grupo(/\.wasm$/)],
  ['workers .js soltos', grupo(/worker/i)],
  ['dados de trilha servidos (dist/trilha)', grupo(/dist\/trilha\//)],
  ['glosas servidas (dist/glosas)', grupo(/dist\/glosas\//)],
  ['catálogos de i18n (dist/i18n)', grupo(/dist\/i18n\//)],
  ['CSS', grupo(/\.css$/)],
  ['JS em assets', grupo(/dist\/assets\/.*\.js$/)],
];

// A entrada real: leio dist/index.html e pego só o que ele referencia (script de módulo,
// modulepreload e stylesheet). Casar por nome de arquivo dá 1.189 kB porque há três
// chunks chamados `index-*` e dois deles são carregados sob demanda, não na entrada.
const html = lerTexto(caminho('dist', 'index.html'));
const referenciados = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
const entrada = referenciados
  .map((ref) => arquivos.find((x) => x.arquivo.endsWith(ref.replace(/^\//, 'dist/'))))
  .filter(Boolean);
const bytesEntrada = entrada.reduce((a, x) => a + x.bytes, 0);

const mib = (b) => `${(b / 1048576).toFixed(2)} MiB`;
const kb = (b) => `${(b / 1024).toFixed(0)} kB`;

let texto = tabela(['medida', 'valor'], [
  ['dist/ total', `${mib(total)} em ${arquivos.length} arquivos`],
  ['dist/assets/', `${mib(totalAssets)} em ${assets.length} arquivos`],
]);

texto += '\n\nPor categoria:\n';
texto += tabela(['categoria', 'arquivos', 'peso', '% do dist'],
  categorias.map(([nome, g]) => [nome, g.n, mib(g.bytes), pct(g.bytes, total)]));

texto += '\n\nOs 15 maiores arquivos do build:\n';
texto += tabela(['arquivo', 'peso'],
  [...arquivos].sort((a, b) => b.bytes - a.bytes).slice(0, 15).map((x) => [x.arquivo, kb(x.bytes)]));

texto += `\n\nCandidatos a "entrada do app" (index + vendor-react + css de entrada): ${kb(bytesEntrada)}\n`;
texto += tabela(['arquivo', 'peso'], entrada.map((x) => [x.arquivo, kb(x.bytes)]));

// A projeção que interessa para a decisão: 16 catálogos de UI cheios.
const universoDeChaves = 693;
const bytesPorChaveEn = (() => {
  const f = arquivos.find((x) => /dist\/i18n\/en\.json$/.test(x.arquivo));
  return f ? f.bytes / universoDeChaves : null;
})();
if (bytesPorChaveEn) {
  texto += `\n\nProjeção de catálogos de UI (base: en.json medido, ${bytesPorChaveEn.toFixed(0)} B/chave):`;
  for (const [idiomas, chaves] of [[3, 693], [16, 693], [16, 2000]]) {
    texto += `\n  ${idiomas} idiomas × ${chaves} chaves ≈ ${kb(bytesPorChaveEn * chaves * idiomas)} servidos (fora do bundle de entrada)`;
  }
}

export default publicar('08 — peso do build', texto, {
  totalBytes: total, assetsBytes: totalAssets, arquivos: arquivos.length,
  categorias: Object.fromEntries(categorias.map(([n, g]) => [n, g])),
  entradaBytes: bytesEntrada,
});
