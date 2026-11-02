/**
 * TEXTO CORRIDO EM CAPÍTULOS (TXT, Markdown, HTML e DOCX depois de virar texto). Regras PURAS.
 *
 *  · se o texto marca capítulos ("Capítulo 3", "CHAPTER IV", "Parte 2", linha toda em maiúsculas entre linhas em
 *    branco), um capítulo por marca;
 *  · senão, blocos de ~3000 palavras cortados em linha em branco, para a leitura não ser uma página só.
 */
import type { CapituloDeTexto } from './epub';

const PALAVRAS_POR_CAPITULO = 3000;

const NUMERO = String.raw`(?:\d{1,4}|[ivxlcdm]{1,8}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|one|two|three|four|five|six|seven|eight|nine|ten|primeiro|segundo|terceiro|first|second|third)`;
const MARCA_NUMERADA = new RegExp(
  String.raw`^(?:cap[ií]tulo|cap\.|chapter|cap[ií]tulo|parte|part|livro|book|ato|act|canto|cap[ií]tulo)\s+${NUMERO}\b[\s.:\-–—]*.{0,70}$`,
  'iu',
);
const MARCA_SOLTA =
  /^(?:pr[oó]logo|ep[ií]logo|prologue|epilogue|pref[aá]cio|preface|introdu[cç][aã]o|introduction)\.?$/iu;

function ehTitulo(linha: string): boolean {
  const l = linha.trim();
  return l.length > 0 && l.length <= 90 && (MARCA_NUMERADA.test(l) || MARCA_SOLTA.test(l));
}

/** Linha toda em maiúsculas (com pelo menos 3 letras), curta e sem ponto final: candidata a título. */
function ehTituloEmCaixaAlta(linha: string): boolean {
  const l = linha.trim();
  if (l.length < 3 || l.length > 60 || /[.!?,;]$/.test(l)) return false;
  const letras = l.replace(/[^\p{L}]/gu, '');
  return letras.length >= 3 && letras === letras.toUpperCase() && letras !== letras.toLowerCase();
}

const contarPalavras = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Corta em blocos de ~3000 palavras, sempre numa linha em branco. */
export function emCapitulosPorTamanho(texto: string, rotulo: (i: number) => string): CapituloDeTexto[] {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim());
  const capitulos: CapituloDeTexto[] = [];
  let atual: string[] = [];
  let palavras = 0;
  for (const p of paragrafos) {
    atual.push(p.trim());
    palavras += contarPalavras(p);
    if (palavras >= PALAVRAS_POR_CAPITULO) {
      capitulos.push({ titulo: rotulo(capitulos.length), texto: atual.join('\n\n') });
      atual = [];
      palavras = 0;
    }
  }
  if (atual.length) capitulos.push({ titulo: rotulo(capitulos.length), texto: atual.join('\n\n') });
  return capitulos;
}

/** Acha os capítulos pelas marcas; sem marcas suficientes, cai nos blocos por tamanho. */
export function dividirEmCapitulos(bruto: string, rotulo: (i: number) => string): CapituloDeTexto[] {
  const texto = bruto.replace(/\r\n?/g, '\n').trim();
  if (!texto) return [];
  const linhas = texto.split('\n');
  const solta = (i: number) => !linhas[i - 1]?.trim() && !linhas[i + 1]?.trim();
  const porMarca: number[] = [];
  const emCaixaAlta: number[] = [];
  linhas.forEach((l, i) => {
    if (ehTitulo(l) && (i === 0 || !linhas[i - 1].trim())) porMarca.push(i);
    else if (ehTituloEmCaixaAlta(l) && solta(i) && i > 0 && i < linhas.length - 1) emCaixaAlta.push(i);
  });
  /* Marcas "Capítulo N" valem com 2 ou mais; linhas em caixa alta, só com 3 ou mais (menos arrisca um grito). */
  const marcas = porMarca.length >= 2 ? porMarca : emCaixaAlta.length >= 3 ? emCaixaAlta : [];
  if (!marcas.length) return emCapitulosPorTamanho(texto, rotulo);

  const capitulos: CapituloDeTexto[] = [];
  const antes = linhas.slice(0, marcas[0]).join('\n').trim();
  if (contarPalavras(antes) >= 20) capitulos.push({ titulo: rotulo(0), texto: antes });
  marcas.forEach((inicio, k) => {
    const fim = marcas[k + 1] ?? linhas.length;
    const corpo = linhas
      .slice(inicio + 1, fim)
      .join('\n')
      .trim();
    if (corpo) capitulos.push({ titulo: linhas[inicio].trim(), texto: corpo });
  });
  return capitulos.length ? capitulos : emCapitulosPorTamanho(texto, rotulo);
}
