// FASE 3 — MEDE: as armadilhas por escrita que não precisam de navegador para serem provadas.
//
// Cada uma é um caso conhecido de i18n que quebra em silêncio. Aqui elas viram número, não
// opinião: o que o runtime realmente faz, com os dados reais deste app.
import { andar, caminho, lerJSON, lerTexto, tabela, pct, publicar } from './comum.mjs';

const linhas = [];
const conta = (t, re) => (t.match(re) ?? []).length;

/* ── 1. TURCO: o i sem ponto ───────────────────────────────────────────────────────────────── */
const turco = [
  ['I'.toLowerCase(), 'I'.toLocaleLowerCase('tr'), "'I'.toLowerCase() × toLocaleLowerCase('tr')"],
  ['i'.toUpperCase(), 'i'.toLocaleUpperCase('tr'), "'i'.toUpperCase() × toLocaleUpperCase('tr')"],
  ['İSTANBUL'.toLowerCase(), 'İSTANBUL'.toLocaleLowerCase('tr'), "'İSTANBUL' minúsculo"],
  ['ışık'.toUpperCase(), 'ışık'.toLocaleUpperCase('tr'), "'ışık' maiúsculo"],
];
// Quantas palavras da trilha turca mudam de identidade com a regra errada.
const tr = lerJSON(caminho('public', 'trilha', 'tr.json'));
const palavrasTr = Object.values(tr.niveis).flat().map((i) => String(i[0]));
const divergem = palavrasTr.filter((p) => p.toLowerCase() !== p.toLocaleLowerCase('tr'));
const divergemUp = palavrasTr.filter((p) => p.toUpperCase() !== p.toLocaleUpperCase('tr'));

let texto = '1. TURCO — o `i` sem ponto\n';
texto += tabela(['caso', 'invariante', "com locale 'tr'", 'igual?'],
  turco.map(([a, b, nome]) => [nome, JSON.stringify(a), JSON.stringify(b), a === b ? 'sim' : '**NÃO**']));
texto += `\n  palavras da trilha turca (${palavrasTr.length}) que mudam de identidade:`;
texto += `\n    com toLowerCase() invariante: ${divergem.length} (${pct(divergem.length, palavrasTr.length)})`;
texto += `\n    com toUpperCase() invariante: ${divergemUp.length} (${pct(divergemUp.length, palavrasTr.length)})`;
texto += `\n    exemplos: ${divergemUp.slice(0, 6).map((p) => `${p}→${p.toUpperCase()} (certo: ${p.toLocaleUpperCase('tr')})`).join(' · ')}`;

/* ── 2. ORDENAÇÃO: islandês, sueco, turco, alemão ─────────────────────────────────────────── */
const testesDeOrdem = [
  ['is', ['zebra', 'þór', 'ær', 'öl', 'að'], 'þ vem depois de z em islandês'],
  ['sv', ['ö', 'z', 'å', 'ä', 'a'], 'å/ä/ö vêm depois de z em sueco'],
  ['tr', ['z', 'ç', 'ş', 'i', 'ı'], 'ç/ş/ı têm posição própria em turco'],
  ['de', ['ß', 'ss', 'z', 'ä'], 'ß ordena como ss em alemão'],
];
texto += '\n\n2. ORDENAÇÃO — `Intl.Collator` por idioma × ordenação binária\n';
texto += tabela(['idioma', 'entrada', 'binária (sort padrão)', `Intl.Collator`, 'diferem?'],
  testesDeOrdem.map(([l, arr, nota]) => {
    const bin = [...arr].sort().join(' ');
    const col = [...arr].sort(new Intl.Collator(l).compare).join(' ');
    return [`${l} — ${nota}`, arr.join(' '), bin, col, bin === col ? 'não' : '**sim**'];
  }));
// O app usa Collator em algum lugar?
const fontes = andar(caminho('src'), (p) => /\.(ts|tsx)$/.test(p));
const usaCollator = fontes.filter((a) => /Intl\.Collator|localeCompare/.test(lerTexto(a)));
const sortCru = fontes.reduce((n, a) => n + conta(lerTexto(a), /\.sort\(\s*\)/g), 0);
texto += `\n  arquivos que usam Intl.Collator ou localeCompare: ${usaCollator.length}`;
if (usaCollator.length) texto += ` → ${usaCollator.slice(0, 4).map((a) => a.split(/[/\\]/).pop()).join(', ')}`;
texto += `\n  chamadas de .sort() sem comparador (ordenação binária): ${sortCru}`;

/* ── 3. HÍNDI e árabe: cluster de grafema × .length ────────────────────────────────────────── */
const clusters = [
  ['hi', 'तुम्हें', 'você'],
  ['hi', 'क्षत्रिय', 'guerreiro'],
  ['ar', 'مُحَمَّد', 'nome próprio com marcas'],
  ['ko', '한국어', 'coreano'],
  ['th', 'กำ', 'tailandês'],
];
texto += '\n\n3. CLUSTER DE GRAFEMA — `.length` × `Intl.Segmenter(grapheme)`\n';
texto += tabela(['lang', 'palavra', '.length', '[...spread]', 'grafemas (ICU)', 'slice(0,3) corta?'],
  clusters.map(([l, p, nota]) => {
    const g = [...new Intl.Segmenter(l, { granularity: 'grapheme' }).segment(p)].length;
    const cortado = p.slice(0, 3);
    const quebra = [...new Intl.Segmenter(l, { granularity: 'grapheme' }).segment(cortado)]
      .some((s) => /^\p{M}/u.test(s.segment));
    return [`${l} (${nota})`, p, p.length, [...p].length, g, quebra || cortado.normalize('NFC') !== cortado ? '**sim**' : 'não'];
  }));
const slices = fontes.reduce((n, a) => n + conta(lerTexto(a), /\.slice\(\s*0\s*,\s*\d+\s*\)/g), 0);
const substrings = fontes.reduce((n, a) => n + conta(lerTexto(a), /\.substring\(|\.substr\(/g), 0);
texto += `\n  .slice(0,N) sobre string no código: ${slices} · .substring/.substr: ${substrings}`;
texto += '\n  (censo: cada um desses trunca por unidade UTF-16, não por grafema)';

/* ── 4. CHINÊS: zh-Hans × zh-Hant ─────────────────────────────────────────────────────────── */
const zh = lerJSON(caminho('public', 'trilha', 'zh.json'));
const palavrasZh = Object.values(zh.niveis).flat().map((i) => String(i[0]));
// Caracteres exclusivos de tradicional que aparecem na trilha.
const SO_TRAD = /[國說時們來會個爲對開這樣後點動萬與東車馬鳥魚龍]/;
const comTrad = palavrasZh.filter((p) => SO_TRAD.test(p));
const idiomas = lerTexto(caminho('src', 'lib', 'languages.ts'));
const variantesZh = [...idiomas.matchAll(/\{\s*code:\s*'(zh-[A-Za-z]+)'[^}]*short:\s*'(\w+)'/g)].map((m) => `${m[1]}→${m[2]}`);
texto += '\n\n4. CHINÊS — simplificado × tradicional\n';
texto += tabela(['medida', 'valor'], [
  ['variantes no seletor de idioma', variantesZh.join(', ') || '(nenhuma)'],
  ['arquivos de trilha para chinês', 'public/trilha/zh.json (um só)'],
  ['palavras da trilha zh', palavrasZh.length],
  ['com caractere exclusivo de tradicional', `${comTrad.length} (${pct(comTrad.length, palavrasZh.length)})`],
]);
texto += '\n  As duas variantes do seletor colapsam para o mesmo `short` e portanto para a MESMA trilha.';

/* ── 5. FONTES ─────────────────────────────────────────────────────────────────────────────── */
const css = lerTexto(caminho('src', 'index.css'));
const importGoogle = (css.match(/@import url\('([^']+)'\)/) ?? [])[1] ?? null;
const familias = importGoogle ? [...importGoogle.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' '))) : [];
const arquivosDeFonte = andar(caminho('.'), (p) => /\.(woff2?|ttf|otf)$/.test(p));
texto += '\n\n5. FONTES\n';
texto += tabela(['medida', 'valor'], [
  ['arquivos de fonte no repositório', arquivosDeFonte.length],
  ['famílias importadas do Google Fonts', familias.length],
  ['quais', familias.join(', ')],
  ['@font-face próprio', conta(css, /@font-face/g)],
  ['declaração de unicode-range própria', conta(css, /unicode-range/g)],
  ['fallback declarado para escrita não latina', /Noto|CJK|Naskh|Devanagari|Hebrew/i.test(css) ? 'sim' : 'NÃO'],
]);
texto += '\n  Nenhuma das famílias importadas cobre CJK, árabe, hebraico, devanágari ou tailandês:';
texto += '\n  essas escritas caem no fallback do sistema operacional de quem lê.';

export default publicar('14 — estresse por escrita', texto, {
  turco: { divergemLower: divergem.length, divergemUpper: divergemUp.length, total: palavrasTr.length },
  ordenacao: { usaCollator: usaCollator.length, sortCru },
  grafemas: { slices, substrings },
  zh: { variantes: variantesZh, comTrad: comTrad.length, total: palavrasZh.length },
  fontes: { arquivos: arquivosDeFonte.length, familias, unicodeRange: conta(css, /unicode-range/g) },
});
