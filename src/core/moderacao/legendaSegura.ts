/**
 * A LEGENDA SEGURA (change `legenda-segura-para-menores`, achado COMP-02 da auditoria de 17/11/2026).
 *
 * O reconhecimento local ouviu "review the pull request together" numa aula e escreveu "reveal the porn quest together";
 * a tradução saiu "revelar a busca pornô juntos". Quem inventou o termo foi o sistema, não o áudio. Esta função troca
 * SÓ o termo das listas (`termosDaLegenda.ts`) por `•••` e devolve quantos ocultou. O resto da fala fica como o
 * reconhecimento escreveu: nada é trocado por outra palavra, para não esconder o erro atrás de uma frase "limpa" que
 * ninguém disse.
 *
 * CASAMENTO POR PALAVRA, NÃO POR ÍNDICE NO TEXTO NORMALIZADO. O texto ORIGINAL é quebrado em palavras (pelo espaço);
 * cada palavra é normalizada sozinha (`normalizar.ts`) e comparada com a lista; quando casa, só o miolo dela (sem a
 * pontuação colada) vira `•••`. Assim pontuação, maiúsculas e acentos do resto ficam, e não há posição a mapear entre o
 * texto normalizado e o original (o NFKD e a junção de letras espaçadas mudam o tamanho). Além da palavra, casam o par
 * de palavras vizinhas (`pares`) e a sequência de letras soltas ("P O R N").
 *
 * Puro: sem DOM, sem rede. O(n) por palavra, com memória por texto e política, porque o parcial reaparece a cada
 * quadro.
 */
import { base, desfazerLeet, INVISIVEIS } from './normalizar';
import { type CategoriaDaLegenda, TERMOS_DA_LEGENDA } from './termosDaLegenda';

export type { CategoriaDaLegenda } from './termosDaLegenda';

/** O marcador que fica no lugar do termo. A tela o lê como "palavra ocultada" (rótulo acessível). */
export const MARCADOR = '•••';

export interface PoliticaDaLegenda {
  ligada: boolean;
  /** Perfil protegido: a pessoa não pode desligar (Ajustes mostra a opção ligada e travada). */
  travada: boolean;
  categorias: ReadonlySet<CategoriaDaLegenda>;
}

export interface TextoOcultado {
  texto: string;
  ocultadas: number;
  categorias: CategoriaDaLegenda[];
}

export const POLITICA_DESLIGADA: PoliticaDaLegenda = Object.freeze({
  ligada: false,
  travada: false,
  categorias: new Set<CategoriaDaLegenda>(),
});

const DO_PROTEGIDO: PoliticaDaLegenda = Object.freeze({
  ligada: true,
  travada: true,
  categorias: new Set<CategoriaDaLegenda>(['sexual', 'odio', 'palavrao']),
});

const DO_ADULTO_COM_OPCAO: PoliticaDaLegenda = Object.freeze({
  ligada: true,
  travada: false,
  categorias: new Set<CategoriaDaLegenda>(['sexual', 'odio']),
});

/**
 * A política por perfil (decisão do dono de 17/11/2026):
 *  - perfil protegido (menor de 18, idade não declarada ou sem conta): ligada e travada, com `sexual`, `odio` e
 *    `palavrao`, em qualquer faixa de menor;
 *  - adulto declarado e self-host: desligada; a opção de Ajustes liga `sexual` e `odio`.
 */
export function politicaDaLegenda(p: { protegido: boolean; opcaoDoAdulto: boolean }): PoliticaDaLegenda {
  if (p.protegido) return DO_PROTEGIDO;
  return p.opcaoDoAdulto ? DO_ADULTO_COM_OPCAO : POLITICA_DESLIGADA;
}

/* ─────────────────────────────── os índices das listas ─────────────────────────────── */

const EXATOS = new Map<string, CategoriaDaLegenda>();
const PREFIXOS: Array<[string, CategoriaDaLegenda]> = [];
const PARES = new Map<string, CategoriaDaLegenda>();
for (const lista of TERMOS_DA_LEGENDA) {
  for (const t of lista.exatos) EXATOS.set(t, lista.categoria);
  for (const t of lista.prefixos) PREFIXOS.push([t, lista.categoria]);
  for (const t of lista.pares) PARES.set(t, lista.categoria);
}

/** A categoria de UMA forma normalizada (só `a-z0-9`), ou `null`. */
function categoriaDaForma(forma: string): CategoriaDaLegenda | null {
  if (forma.length < 3) return null;
  const exata = EXATOS.get(forma);
  if (exata) return exata;
  for (const [prefixo, categoria] of PREFIXOS) if (forma.startsWith(prefixo)) return categoria;
  return null;
}

/** As formas de uma palavra: 3+ letras repetidas reduzidas a uma ("fuuuck") e a duas ("boooobs"). */
function categoriaDaPalavra(forma: string): CategoriaDaLegenda | null {
  if (!forma) return null;
  return (
    categoriaDaForma(forma) ??
    categoriaDaForma(forma.replace(/([a-z])\1{2,}/g, '$1')) ??
    categoriaDaForma(forma.replace(/([a-z])\1{2,}/g, '$1$1'))
  );
}

/* ─────────────────────────────── as palavras do texto ─────────────────────────────── */

/* O espaço que separa palavras. Sem o U+FEFF (que o `\s` inclui): ele é invisível DENTRO da palavra ("p", U+FEFF, "orn"). */
const PALAVRA = /[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;
/* A pontuação colada nas pontas ("(porn)," → "porn"). `$` e `@` contam como letra nas pontas ("$hit", "m3rd@"). */
const PONTAS = /^([^\p{L}\p{N}$@]*)(.*?)([^\p{L}\p{N}$@]*)$/su;

interface Palavra {
  /** Onde o MIOLO começa e termina no texto original. */
  ini: number;
  fim: number;
  /** A forma normalizada inteira e as partes (separadas por hífen, apóstrofo, ponto). */
  forma: string;
  partes: string[];
}

function palavrasDe(texto: string): Palavra[] {
  const saida: Palavra[] = [];
  for (const m of texto.matchAll(PALAVRA)) {
    const [, antes, miolo] = PONTAS.exec(m[0]) as RegExpExecArray;
    if (!miolo) continue;
    /* O `@` do fim depois de letra também é "a" ("m3rd@"): o `desfazerLeet` só o troca antes de letra. */
    const semLeet = desfazerLeet(base(miolo)).replace(/(?<=[a-z])@$/, 'a');
    const ini = (m.index ?? 0) + antes.length;
    saida.push({
      ini,
      fim: ini + miolo.length,
      forma: semLeet.replace(/[^a-z0-9]+/g, ''),
      partes: semLeet.split(/[^a-z0-9]+/).filter((p) => p.length >= 3),
    });
  }
  return saida;
}

/** A sequência de letras soltas mais longa considerada ("p o r n o g r a f i a" tem 11). */
const TETO_DE_LETRAS = 16;

/** Um trecho do original a trocar pelo marcador. */
interface Trecho {
  ini: number;
  fim: number;
  categoria: CategoriaDaLegenda;
}

function trechosSensiveis(palavras: Palavra[], politica: PoliticaDaLegenda): Trecho[] {
  const vale = (c: CategoriaDaLegenda | null | undefined): c is CategoriaDaLegenda => !!c && politica.categorias.has(c);
  const trechos: Trecho[] = [];
  let i = 0;
  while (i < palavras.length) {
    const p = palavras[i];
    // Letras soltas ("P O R N"): a janela mais longa que casa, a partir daqui.
    if (p.forma.length === 1 && /[a-z]/.test(p.forma)) {
      let j = i;
      while (j < palavras.length && j - i < TETO_DE_LETRAS && /^[a-z]$/.test(palavras[j].forma)) j++;
      let achou = false;
      for (let k = j; k - i >= 3; k--) {
        const c = categoriaDaPalavra(
          palavras
            .slice(i, k)
            .map((x) => x.forma)
            .join(''),
        );
        if (vale(c)) {
          trechos.push({ ini: p.ini, fim: palavras[k - 1].fim, categoria: c });
          i = k;
          achou = true;
          break;
        }
      }
      if (achou) continue;
    }
    // O par de palavras vizinhas ("white power").
    const q = palavras[i + 1];
    if (q) {
      const c = PARES.get(`${p.forma} ${q.forma}`);
      if (vale(c)) {
        trechos.push({ ini: p.ini, fim: q.fim, categoria: c });
        i += 2;
        continue;
      }
    }
    // A palavra, inteira ou por uma das partes ("porn-star", "foda-se").
    let c = categoriaDaPalavra(p.forma);
    if (!vale(c)) for (const parte of p.partes) if (vale((c = categoriaDaPalavra(parte)))) break;
    if (vale(c)) trechos.push({ ini: p.ini, fim: p.fim, categoria: c });
    i++;
  }
  return trechos;
}

/* ─────────────────────────────── a função ─────────────────────────────── */

const SEM_NADA = (texto: string): TextoOcultado => ({ texto, ocultadas: 0, categorias: [] });

/* Memória por texto e política: o parcial reaparece igual a cada quadro. Limpa ao encher (não é LRU: barato e basta). */
const TETO_DA_MEMORIA = 2000;
const memorias = new WeakMap<PoliticaDaLegenda, Map<string, TextoOcultado>>();

/**
 * Troca cada termo das listas, nas categorias da política, por `•••`. Política desligada: o texto volta como veio.
 */
export function ocultarTermos(texto: string, politica: PoliticaDaLegenda): TextoOcultado {
  if (!politica.ligada || !texto || !/[\p{L}\p{N}]/u.test(texto)) return SEM_NADA(texto);
  let memoria = memorias.get(politica);
  if (!memoria) memorias.set(politica, (memoria = new Map()));
  const guardado = memoria.get(texto);
  if (guardado) return guardado;
  const resultado = calcular(texto, politica);
  if (memoria.size >= TETO_DA_MEMORIA) memoria.clear();
  memoria.set(texto, resultado);
  return resultado;
}

function calcular(texto: string, politica: PoliticaDaLegenda): TextoOcultado {
  /* Rápido: nenhuma letra latina, nada a casar (árabe, chinês, japonês). */
  if (!/[a-z0-9$@]/i.test(base(texto))) return SEM_NADA(texto);
  const trechos = trechosSensiveis(palavrasDe(texto), politica);
  if (trechos.length === 0) return SEM_NADA(texto);
  let saida = '';
  let cursor = 0;
  const categorias = new Set<CategoriaDaLegenda>();
  for (const t of trechos) {
    saida += texto.slice(cursor, t.ini) + MARCADOR;
    cursor = t.fim;
    categorias.add(t.categoria);
  }
  saida += texto.slice(cursor);
  return { texto: saida.replace(INVISIVEIS, ''), ocultadas: trechos.length, categorias: [...categorias] };
}

/**
 * O texto para a SÍNTESE DE VOZ: sem o marcador (a voz pula a palavra, não lê "ponto ponto ponto") e sem o espaço
 * duplo que sobra.
 */
export function semMarcador(texto: string): string {
  if (!texto.includes(MARCADOR)) return texto;
  return texto
    .split(MARCADOR)
    .join('')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.;:!?…])/g, '$1')
    .trim();
}
