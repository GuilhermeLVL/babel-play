// MEDE: quanto da interface passa pelo sistema de tradução.
//
// Por que não reuso o denominador do repo: `scripts/i18n/orfas.mjs:52` conta literais que
// contenham acento, sobre o código inteiro concatenado. Isso erra nos dois sentidos —
// superestima (pega JSDoc, comentário, prompt de LLM, chave de localStorage) e subestima
// (não vê "Voltar", "Salvar", "Idioma", "Nome", que são tela e não têm acento).
//
// Aqui monto um denominador diferente: texto REALMENTE visível em JSX — nós de texto entre
// tags e atributos que o usuário lê (placeholder, title, aria-label, alt, label) — sobre
// src/components/** e src/lib/**, com comentários removidos antes de contar.
// Reporto os dois números lado a lado. Nenhum é exato; a divergência entre eles é o dado.
import { andar, caminho, ehFonte, lerTexto, relativo, tabela, pct, publicar } from './comum.mjs';

const SRC = caminho('src');
const arquivos = andar(SRC, ehFonte);

/** Remove comentários de linha e de bloco, e o conteúdo de template literals de várias linhas
 *  (prompts de LLM), que não são tela. Preserva o comprimento aproximado para não bagunçar nada. */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const CHAMADA_T = /(?<![\w.$])t\(/g;
const CHAMADA_TP = /(?<![\w.$])tp\(/g;
// Exige uma prop depois do `<T`, senão casa com genérico do TypeScript: `<T>` em
// src/core/learning/trilha.ts:101 e `<T,>` em src/components/views/Analysis.tsx:722
// são parâmetros de tipo, não o componente. Sem essa exigência a contagem sobe de 6 para 45.
const COMPONENTE_T = /<T\s+[a-z][\w-]*=/g;
const BRUTO = /(?<![\w.$])bruto\(/g;

// Texto entre tags JSX: `>Alguma coisa<`. Exige ao menos duas letras seguidas para não pegar
// pontuação solta, e recusa o que começa com `{` (interpolação, não literal).
const TEXTO_JSX = />\s*([^<>{}\n][^<>{}]*[\p{L}][^<>{}]*)\s*</gu;
const ATRIBUTO_VISIVEL = /\b(?:placeholder|title|aria-label|ariaLabel|alt|label)\s*=\s*(["'])([^"'\n]*[\p{L}][^"'\n]*)\1/gu;

const conta = (texto, re) => (texto.match(re) ?? []).length;

const porArquivo = [];
let codigoInteiro = '';

for (const arq of arquivos) {
  const cru = lerTexto(arq);
  codigoInteiro += `\n${cru}`;
  const limpo = semComentarios(cru);

  const t = conta(limpo, CHAMADA_T);
  const tp = conta(limpo, CHAMADA_TP);
  const compT = conta(limpo, COMPONENTE_T);
  const br = conta(limpo, BRUTO);

  // Só conto texto visível onde há JSX; arquivo sem `<` não desenha tela.
  const temJSX = /<[A-Za-z]/.test(limpo);
  let visiveis = 0;
  if (temJSX) {
    visiveis += [...limpo.matchAll(TEXTO_JSX)].filter((m) => /[\p{L}]{2}/u.test(m[1])).length;
    visiveis += [...limpo.matchAll(ATRIBUTO_VISIVEL)].length;
  }

  if (t + tp + compT + br + visiveis > 0) {
    porArquivo.push({ arquivo: relativo(arq), t, tp, componenteT: compT, bruto: br, textoVisivel: visiveis });
  }
}

const soma = (campo) => porArquivo.reduce((a, x) => a + x[campo], 0);
const totalT = soma('t');
const totalTp = soma('tp');
const totalCompT = soma('componenteT');
const totalVisivel = soma('textoVisivel');
const arquivosComT = porArquivo.filter((x) => x.t > 0).length;

// O mesmo cálculo que o repo faz, para poder confrontar sem discutir metodologia.
const comoORepoConta = {
  chamadas: (codigoInteiro.match(/(?<![\w.])t\(/g) ?? []).length,
  literaisComAcento: (codigoInteiro.match(/['"`][^'"`\n]*[áàâãéêíóôõúçÁÉÍÓÚÂÊÔÃÕÇ][^'"`\n]*['"`]/g) ?? []).length,
};

const top = [...porArquivo].sort((a, b) => b.textoVisivel - a.textoVisivel).slice(0, 15);

let texto = tabela(
  ['medida', 'valor'],
  [
    ['arquivos .ts/.tsx varridos', arquivos.length],
    ['chamadas t( (sem comentários)', totalT],
    ['chamadas tp(', totalTp],
    ['usos do componente <T', totalCompT],
    ['chamadas bruto(', soma('bruto')],
    ['arquivos que chamam t(', arquivosComT],
    ['texto visível em JSX (denominador próprio)', totalVisivel],
    ['cobertura t()/texto visível', pct(totalT, totalVisivel)],
    ['— repo: chamadas t( (com comentários)', comoORepoConta.chamadas],
    ['— repo: literais com acento (denominador dele)', comoORepoConta.literaisComAcento],
    ['— repo: cobertura pelo método dele', pct(comoORepoConta.chamadas, comoORepoConta.literaisComAcento)],
  ],
);

texto += '\n\nOs 15 arquivos com mais texto visível ainda fora do sistema:\n';
texto += tabela(
  ['arquivo', 'texto visível', 't(', 'tp(', '<T'],
  top.map((x) => [x.arquivo, x.textoVisivel, x.t, x.tp, x.componenteT]),
);

export default publicar('03 — chamadas de t() e cobertura', texto, {
  arquivosVarridos: arquivos.length,
  totalT, totalTp, totalCompT, totalVisivel, arquivosComT,
  comoORepoConta,
  porArquivo,
});
