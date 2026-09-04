// FASE 2 — MEDE: o censo de cobertura do app inteiro, por tela e por SUPERFÍCIE.
//
// A Fase 0 mediu "texto visível em JSX". Isso deixa de fora justamente o que costuma ser
// esquecido numa migração de i18n e é onde o defeito dói mais: mensagem de erro, estado vazio,
// validação de formulário, `aria-label`/`alt`/`title`, `<title>` da página, string vinda do
// servidor, nome de conquista e texto de paywall.
//
// Aqui cada superfície é contada separadamente, com o veredito de se ela TEM caminho de tradução.
import { andar, caminho, ehFonte, lerTexto, relativo, tabela, pct, publicar } from './comum.mjs';

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TEM_PT = /[\p{L}]{3,}/u;
// Uma string só conta como "de tela" se tiver espaço ou acento — descarta identificador,
// classe CSS, chave de união discriminada ('trilha-sem-frase') e nome de ícone.
const PARECE_FRASE = (s) => /\s/.test(s.trim()) || /[áàâãéêíóôõúçÁÉÍÓÚÂÊÔÃÕÇ]/.test(s);

const SUPERFICIES = [
  { nome: 'aria-label', re: /aria-label\s*=\s*(?:\{)?["'`]([^"'`\n]{2,})["'`]/g, risco: 'acessibilidade' },
  { nome: 'title= (tooltip)', re: /\btitle\s*=\s*(?:\{)?["'`]([^"'`\n]{2,})["'`]/g, risco: 'descoberta' },
  { nome: 'placeholder', re: /placeholder\s*=\s*(?:\{)?["'`]([^"'`\n]{2,})["'`]/g, risco: 'formulário' },
  { nome: 'alt', re: /\balt\s*=\s*(?:\{)?["'`]([^"'`\n]{2,})["'`]/g, risco: 'acessibilidade' },
];

const arquivos = [...andar(caminho('src'), ehFonte)];
const doServidor = [...andar(caminho('server'), ehFonte)];

/* ── 1. por superfície ─────────────────────────────────────────────────────────────────────── */
const porSuperficie = [];
for (const s of SUPERFICIES) {
  let total = 0, traduzidas = 0;
  const exemplos = [];
  for (const arq of arquivos) {
    const txt = semComentarios(lerTexto(arq));
    for (const m of txt.matchAll(s.re)) {
      const valor = m[1];
      if (!TEM_PT.test(valor) || !PARECE_FRASE(valor)) continue;
      total++;
      // Traduzida = o atributo recebe `{t(...)}` em vez de literal. O regex acima só casa
      // literal, então tudo que ele pega está FORA do sistema por construção; conto à parte
      // as ocorrências com `t(` no atributo.
      if (exemplos.length < 4) exemplos.push(`${relativo(arq).split('/').pop()}: ${JSON.stringify(valor.slice(0, 46))}`);
    }
    // Atributo que passa por t(): `aria-label={t('...')}`
    const comT = new RegExp(`${s.nome.split(' ')[0]}\\s*=\\s*\\{\\s*t\\(`, 'g');
    traduzidas += (txt.match(comT) ?? []).length;
  }
  porSuperficie.push({ ...s, literais: total, comT: traduzidas, exemplos });
}

/* ── 2. strings do servidor que chegam ao usuário ──────────────────────────────────────────── */
const ERRO_API = /\b(?:error|erro|message|mensagem|motivo)\s*:\s*["'`]([^"'`\n]{6,})["'`]/g;
let errosServidor = 0;
const exemplosServidor = [];
for (const arq of doServidor) {
  const txt = semComentarios(lerTexto(arq));
  for (const m of txt.matchAll(ERRO_API)) {
    if (!PARECE_FRASE(m[1])) continue;
    errosServidor++;
    if (exemplosServidor.length < 8) exemplosServidor.push(`${relativo(arq)}: ${JSON.stringify(m[1].slice(0, 54))}`);
  }
}
// O servidor importa lib/i18n? Se não, não há como traduzir string dele.
const servidorImportaI18n = doServidor.some((a) => /lib\/i18n/.test(lerTexto(a)));

/* ── 3. estados vazios, que são o padrão declarado da casa ─────────────────────────────────── */
const usosDeHonestidade = arquivos.filter((a) => /Honestidade|SemDado/.test(lerTexto(a))).length;
const motivosLiterais = arquivos.reduce((acc, a) => {
  const t = semComentarios(lerTexto(a));
  return acc + (t.match(/motivo\s*=\s*["'`][^"'`\n]{6,}["'`]/g) ?? []).length;
}, 0);

/* ── 4. o HTML de entrada ──────────────────────────────────────────────────────────────────── */
const html = lerTexto(caminho('index.html'));
const titulo = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '(sem title)';
const metas = [...html.matchAll(/<meta[^>]*(?:name|property)="([^"]+)"[^>]*content="([^"]{10,})"/g)]
  .map((m) => [m[1], m[2].slice(0, 58)]);

/* ── 5. censo por diretório ────────────────────────────────────────────────────────────────── */
const CHAMADA_T = /(?<![\w.$])t\(/g;
const TEXTO_JSX = />\s*([^<>{}\n][^<>{}]*[\p{L}][^<>{}]*)\s*</gu;
const areas = new Map();
for (const arq of arquivos) {
  const rel = relativo(arq);
  const area = rel.split('/').slice(0, 3).join('/');
  const txt = semComentarios(lerTexto(arq));
  const t = (txt.match(CHAMADA_T) ?? []).length;
  const vis = /<[A-Za-z]/.test(txt)
    ? [...txt.matchAll(TEXTO_JSX)].filter((m) => /[\p{L}]{2}/u.test(m[1]) && PARECE_FRASE(m[1])).length
    : 0;
  const a = areas.get(area) ?? { area, arquivos: 0, t: 0, visivel: 0 };
  a.arquivos++; a.t += t; a.visivel += vis;
  areas.set(area, a);
}
const porArea = [...areas.values()].filter((a) => a.visivel > 0 || a.t > 0).sort((a, b) => b.visivel - a.visivel);

/* ── saída ─────────────────────────────────────────────────────────────────────────────────── */
let texto = '1. SUPERFÍCIES QUE COSTUMAM SER ESQUECIDAS\n';
texto += tabela(['superfície', 'literal cravado', 'via t()', 'cobertura', 'risco'],
  porSuperficie.map((s) => [s.nome, s.literais, s.comT, pct(s.comT, s.literais + s.comT), s.risco]));
for (const s of porSuperficie) {
  if (!s.exemplos.length) continue;
  texto += `\n  [${s.nome}] ${s.exemplos.join(' · ')}`;
}

texto += '\n\n2. STRINGS DO SERVIDOR QUE CHEGAM AO USUÁRIO\n';
texto += tabela(['medida', 'valor'], [
  ['mensagens de erro/motivo literais em server/', errosServidor],
  ['o servidor importa lib/i18n?', servidorImportaI18n ? 'sim' : 'NÃO — não há caminho de tradução'],
  ['arquivos .ts em server/', doServidor.length],
]);
texto += '\n  ' + exemplosServidor.join('\n  ');

texto += '\n\n3. ESTADOS VAZIOS\n';
texto += tabela(['medida', 'valor'], [
  ['arquivos que usam Honestidade/SemDado', usosDeHonestidade],
  ['prop `motivo` com literal cravado', motivosLiterais],
]);

texto += '\n\n4. HTML DE ENTRADA (index.html)\n';
texto += tabela(['tag', 'conteúdo'], [['<title>', titulo], ...metas]);
texto += '\n  Nenhuma dessas passa por t(): são estáticas no HTML, servidas iguais para todo idioma.';

texto += '\n\n5. CENSO POR ÁREA\n';
texto += tabela(['área', 'arquivos', 'texto visível', 't()', 'cobertura'],
  porArea.map((a) => [a.area, a.arquivos, a.visivel, a.t, pct(a.t, a.visivel)]));
const somaVis = porArea.reduce((s, a) => s + a.visivel, 0);
const somaT = porArea.reduce((s, a) => s + a.t, 0);
texto += `\n  TOTAL: ${somaT} t() sobre ${somaVis} de texto visível = ${pct(somaT, somaVis)}`;

export default publicar('13 — censo de cobertura por superfície e por área', texto, {
  porSuperficie, errosServidor, servidorImportaI18n, usosDeHonestidade, motivosLiterais,
  titulo, metas, porArea, somaVis, somaT,
});
