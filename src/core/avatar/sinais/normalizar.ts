/**
 * NORMALIZAÇÃO DO TEXTO PARA SOLETRAR.
 *
 *  · Acentos são ignorados (letra-base). Libras: `Ç` tem sinal próprio; `Ã`/`Õ` = letra-base + til (balanço).
 *    ASL: `Ç` vira C, `Ã` vira A, `Õ` vira O.
 *  · Algarismos 0-9: soletrados só se o alfabeto os traz (`opcoes.numeros`); senão (e para outros dígitos Unicode)
 *    são pulados e a palavra fica marcada.
 *  · Espaço, hífen e pontuação separam palavras (pausa). Qualquer outro caractere (emoji, escrita RTL, símbolos,
 *    letras sem decomposição como ß ou ø) também vira pausa e é listado em `desconhecidos`.
 *  · Percorre por pontos de código (pares substitutos e sequências de emoji não quebram) e é linear no tamanho.
 */
import type { Lingua } from './tipos';

export interface LetraNormalizada {
  /** Maiúscula, como será mostrada (`Ç`, `Ã`). */
  disp: string;
  /** Chave no alfabeto (`Ç` em Libras; senão a letra-base). */
  chave: string;
  til: boolean;
}

export interface PalavraNormalizada {
  /** O token como veio (sem espaços nas pontas). */
  texto: string;
  /** Sub-palavras de letras (um token com hífen/emoji no meio gera mais de uma; cada uma pausa). */
  grupos: LetraNormalizada[][];
  temNumeros: boolean;
  /** Primeiro caractere é maiúscula e não é a primeira palavra do texto (heurística de nome próprio). */
  nomeProprio: boolean;
  /** Total de letras soletráveis (sem contar números). */
  letras: number;
}

export interface TextoNormalizado {
  palavras: PalavraNormalizada[];
  desconhecidos: string[];
}

const COMBINANTE = /\p{M}/u;
const ESPACO_OU_PONTUACAO = /^[\p{Z}\s\p{P}]$/u;
const CEDILHA = '̧';
const TIL = '̃';

export interface OpcoesDeNormalizacao {
  /** O alfabeto tem os algarismos 0-9: eles viram "letras" soletráveis (os outros dígitos Unicode seguem pulados). */
  numeros?: boolean;
}

export function normalizarTexto(texto: string, lingua: Lingua, opcoes: OpcoesDeNormalizacao = {}): TextoNormalizado {
  const desconhecidos = new Set<string>();
  const palavras: PalavraNormalizada[] = [];
  for (const token of texto.split(/\s+/u)) {
    if (!token) continue;
    const decomposto = [...token.normalize('NFD')];
    const grupos: LetraNormalizada[][] = [];
    let atual: LetraNormalizada[] = [];
    let temNumeros = false;
    const fecha = () => {
      if (atual.length) grupos.push(atual);
      atual = [];
    };
    for (let i = 0; i < decomposto.length; i += 1) {
      const ch = decomposto[i];
      if (/^[A-Za-z]$/.test(ch)) {
        // marcas combinantes que acompanham a letra-base
        const marcas: string[] = [];
        while (i + 1 < decomposto.length && COMBINANTE.test(decomposto[i + 1])) marcas.push(decomposto[++i]);
        const up = ch.toUpperCase();
        let chave = up;
        let disp = up;
        let til = false;
        if (lingua === 'libras' && up === 'C' && marcas.includes(CEDILHA)) {
          chave = 'Ç';
          disp = 'Ç';
        }
        if (lingua === 'libras' && (up === 'A' || up === 'O') && marcas.includes(TIL)) {
          til = true;
          disp = up === 'A' ? 'Ã' : 'Õ';
        }
        atual.push({ disp, chave, til });
      } else if (COMBINANTE.test(ch)) {
        // marca solta (sem letra-base): ignora
      } else if (opcoes.numeros === true && /^[0-9]$/.test(ch)) {
        atual.push({ disp: ch, chave: ch, til: false });
      } else if (/^\p{Nd}$/u.test(ch)) {
        temNumeros = true;
      } else if (ESPACO_OU_PONTUACAO.test(ch)) {
        fecha();
      } else {
        // emoji, RTL, símbolos, letras sem decomposição: pausa + registro
        fecha();
        desconhecidos.add(ch);
      }
    }
    fecha();
    const letras = grupos.reduce((s, g) => s + g.length, 0);
    palavras.push({
      texto: token,
      grupos,
      temNumeros,
      nomeProprio: palavras.length > 0 && /^\p{Lu}/u.test(token),
      letras,
    });
  }
  return { palavras, desconhecidos: [...desconhecidos] };
}
