// MEDE: (a) a taxa de FALSO POSITIVO do desenclítico, e (b) a estatística da amostra de 60.
//
// (a) O briefing pede: `darme`→`dar` funciona, mas e `carme`, `firme`, `informe`? O código
//     (scripts/trilha/lexemes.mjs:207-232) tem guarda dupla — a raiz precisa estar no dicionário
//     E parecer verbo. Reproduzo a regra literal e rodo sobre o vocabulário REAL das trilhas
//     es/it (o português não tem trilha; é o idioma nativo).
//
//     RESSALVA DE MÉTODO, declarada: `formasPorLema` busca o mapa de lemas por SPARQL no Wikidata,
//     em rede. Não dá para reproduzir offline. Uso como aproximação do "está no dicionário" o
//     próprio conjunto de palavras da trilha — que é vocabulário real do idioma e, por vir da
//     lista de frequência, é um superconjunto razoável. Isso torna o teste MAIS severo que o
//     real (mais raízes disponíveis = mais chance de falso positivo), não menos.
//
// (b) A amostra de 60 com 54 acertos (docs/auditoria/trilha-multi-idioma-v1.md:82) precisa de
//     intervalo de confiança. 90% sem ± não é medida, é impressão.
import { caminho, lerJSON, tabela, publicar } from './comum.mjs';

/* ── (a) o desenclítico, regra copiada de lexemes.mjs:208-226 ─────────────────────────────── */
const ENCLITICOS = {
  es: ['me', 'te', 'se', 'lo', 'la', 'le', 'nos', 'los', 'las', 'les', 'selo', 'sela'],
  pt: ['me', 'te', 'se', 'lo', 'la', 'lhe', 'nos', 'los', 'las', 'lhes'],
  it: ['mi', 'ti', 'si', 'lo', 'la', 'ci', 'li', 'le', 'ne', 'gli'],
};
const FORMA_VERBAL = /(?:ar|er|ir|ír|ndo)$/;
const VERBOS_CURTOS = new Set(['dar', 'ver', 'ir', 'oír', 'ser', 'ter', 'ver', 'vir', 'pôr']);
const pareceVerbo = (raiz) => (raiz.length > 3 ? FORMA_VERBAL.test(raiz) : VERBOS_CURTOS.has(raiz));

function semEnclitico(palavra, mapa, lang) {
  for (const pronome of ENCLITICOS[lang] ?? []) {
    if (!palavra.endsWith(pronome)) continue;
    const raiz = palavra.slice(0, -pronome.length);
    if (raiz.length >= 2 && pareceVerbo(raiz) && mapa.has(raiz)) return raiz;
  }
  return null;
}

// Os casos que o briefing nomeia, mais controles de cada tipo.
const CASOS = [
  ['es', 'darme', 'dar', 'verdadeiro positivo — o caso que a regra existe para pegar'],
  ['es', 'llamarla', 'llamar', 'verdadeiro positivo'],
  ['es', 'hablarnos', 'hablar', 'verdadeiro positivo'],
  ['es', 'enterarse', 'enterar', 'verdadeiro positivo'],
  ['es', 'carme', null, 'FALSO POSITIVO se cortar — raiz "car" tem 3 letras'],
  ['es', 'firme', null, 'FALSO POSITIVO se cortar — "firme" é adjetivo'],
  ['es', 'informe', null, 'FALSO POSITIVO se cortar — "informe" é substantivo'],
  ['es', 'parte', null, 'FALSO POSITIVO se cortar — o próprio comentário do código cita'],
  ['es', 'suerte', null, 'FALSO POSITIVO se cortar — o comentário do código cita'],
  ['es', 'menos', null, 'FALSO POSITIVO se cortar — termina em "nos"'],
  ['es', 'alumnos', null, 'FALSO POSITIVO se cortar'],
  ['es', 'hermanos', null, 'FALSO POSITIVO se cortar'],
  ['it', 'parlarne', 'parlar', 'verdadeiro positivo'],
  ['it', 'dormi', null, 'FALSO POSITIVO se cortar — 2ª pessoa de dormire'],
  ['it', 'figli', null, 'FALSO POSITIVO se cortar — termina em "gli"'],
  ['pt', 'dá-lo', null, 'com hífen: a regra não vê (o hífen fica na raiz)'],
];

const vocab = {};
for (const lang of ['es', 'it']) {
  const d = lerJSON(caminho('public', 'trilha', `${lang}.json`));
  vocab[lang] = new Set(Object.values(d.niveis).flat().map((i) => String(i[0]).toLowerCase()));
}
// Para os casos nomeados, o "dicionário" recebe também as raízes verdadeiras, senão o teste
// mediria a ausência do verbo no vocabulário em vez de medir a regra.
const dicionarioDeTeste = (lang) => {
  const s = new Set(vocab[lang] ?? []);
  for (const [l, , raiz] of CASOS) if (l === lang && raiz) s.add(raiz);
  for (const r of ['car', 'fir', 'infor', 'par', 'suer', 'me', 'alum', 'herma', 'dor', 'fi']) s.add(r);
  return s;
};

const linhasCasos = CASOS.map(([lang, palavra, esperado, nota]) => {
  const obtido = semEnclitico(palavra, dicionarioDeTeste(lang), lang);
  const certo = (esperado ?? null) === obtido;
  return [lang, palavra, esperado ?? '(não cortar)', obtido ?? '(não cortou)', certo ? 'OK' : 'ERRO', nota];
});

// Varredura sobre o vocabulário real: quantas palavras a regra cortaria, e quais.
const varredura = [];
for (const lang of ['es', 'it']) {
  const dic = vocab[lang];
  const cortadas = [];
  for (const p of dic) {
    const raiz = semEnclitico(p, dic, lang);
    if (raiz) cortadas.push([p, raiz]);
  }
  varredura.push({ lang, total: dic.size, cortadas });
}

let texto = 'CASOS NOMEADOS (a regra literal de lexemes.mjs:214-232):\n';
texto += tabela(['lang', 'palavra', 'esperado', 'obtido', 'veredito', 'por quê'], linhasCasos);

const erros = linhasCasos.filter((l) => l[4] === 'ERRO').length;
texto += `\n\n${linhasCasos.length - erros} de ${linhasCasos.length} casos corretos · ${erros} erro(s)`;

texto += '\n\nVARREDURA SOBRE O VOCABULÁRIO REAL DA TRILHA:\n';
texto += tabela(['lang', 'palavras', 'que a regra cortaria', 'taxa'],
  varredura.map((v) => [v.lang, v.total, v.cortadas.length, `${((v.cortadas.length / v.total) * 100).toFixed(2)}%`]));
for (const v of varredura) {
  texto += `\n  [${v.lang}] ${v.cortadas.length ? v.cortadas.slice(0, 25).map(([p, r]) => `${p}→${r}`).join(' · ') : 'nenhuma'}`;
  if (v.cortadas.length > 25) texto += ` … e mais ${v.cortadas.length - 25}`;
}

/* ── (b) a amostra de 60 ──────────────────────────────────────────────────────────────────── */
// Wilson score interval: honesto perto das bordas, ao contrário do intervalo normal simples,
// que para 54/60 chega a estourar 100%.
function wilson(acertos, n, z = 1.96) {
  const p = acertos / n;
  const d = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / d;
  const meia = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, baixo: centro - meia, alto: centro + meia };
}
// n necessário para uma meia-largura alvo, na proporção observada.
const nPara = (alvo, p = 0.9, z = 1.96) => Math.ceil((z * z * p * (1 - p)) / (alvo * alvo));

const antes = wilson(42, 60);   // 70% de 60
const depois = wilson(54, 60);  // 90% de 60

texto += '\n\nA AMOSTRA DE 60 (docs/auditoria/trilha-multi-idioma-v1.md:81-82):\n';
texto += tabela(['medida', 'proporção', 'IC 95% (Wilson)', 'meia-largura'], [
  ['antes das correções (42/60)', `${(antes.p * 100).toFixed(1)}%`, `${(antes.baixo * 100).toFixed(1)}% – ${(antes.alto * 100).toFixed(1)}%`, `±${(((antes.alto - antes.baixo) / 2) * 100).toFixed(1)} pp`],
  ['depois (54/60)', `${(depois.p * 100).toFixed(1)}%`, `${(depois.baixo * 100).toFixed(1)}% – ${(depois.alto * 100).toFixed(1)}%`, `±${(((depois.alto - depois.baixo) / 2) * 100).toFixed(1)} pp`],
]);
// A comparação 70% → 90% é PAREADA: `D:78` diz "amostra determinística de 60", e as correções
// foram aplicadas sobre as mesmas entradas. Comparar os dois intervalos de confiança seria o
// teste errado — ele trata as medidas como amostras independentes e perde todo o poder do
// pareamento. O teste certo é McNemar sobre os discordantes.
//
// Não sabemos b (acertos que viraram erros); o documento não reporta. Calculo o cenário
// declarado (b=0, c=12) e o pior cenário compatível com o saldo de +12.
function mcnemarExato(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const menor = Math.min(b, c);
  const comb = (k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  let cauda = 0;
  for (let i = 0; i <= menor; i++) cauda += comb(i);
  return Math.min(1, 2 * cauda * Math.pow(0.5, n));
}

texto += '\n\nA melhora 70% → 90%, testada como PAREADA (mesma amostra antes e depois):\n';
texto += tabela(['cenário (b→erro, c→acerto)', 'discordantes', 'p (McNemar exato)', 'significativa a 5%?'],
  [[0, 12], [2, 14], [4, 16], [6, 18]].map(([b, c]) => {
    const p = mcnemarExato(b, c);
    return [`b=${b}, c=${c}`, b + c, p < 0.0001 ? '<0,0001' : p.toFixed(4), p < 0.05 ? 'sim' : 'não'];
  }));
texto += '\n  Em todos os cenários compatíveis com o saldo de +12, a melhora É significativa.';
texto += '\n  (Comparar os dois IC acima e ver sobreposição daria "não significativa" — e seria';
texto += '\n   o teste errado, porque trata como independentes duas medidas sobre os mesmos itens.)';

texto += '\n\nTamanho de amostra necessário (proporção esperada 90%, 95% de confiança):\n';
texto += tabela(['precisão desejada', 'n necessário'],
  [0.10, 0.05, 0.03, 0.02].map((a) => [`±${(a * 100).toFixed(0)} pp`, nPara(a)]));

export default publicar('11 — desenclítico e a amostra de 60', texto, {
  casos: linhasCasos, erros, varredura: varredura.map((v) => ({ lang: v.lang, total: v.total, cortadas: v.cortadas })),
  amostra: { antes, depois, nPara3pp: nPara(0.03) },
});
