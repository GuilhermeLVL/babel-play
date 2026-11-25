/**
 * MODOS DE EXIBIÇÃO DO PARCIAL VIVO (variante V1b de `parciais-incrementais`; só vale com a flag `parciais_vivos`).
 *
 * V1 (`cauda-token`) pinta cada token do `onUpdate`, e a cauda provisória é reescrita a todo token: a erasure do original
 * subiu de 0,59 para 3,60. Estes modos mudam SÓ o que a tela mostra; a LocalAgreement-2 e a cadência são as mesmas.
 *
 * - `cauda-token` (V1, reprovado como padrão; só override de laboratório): token a token (`visualizar`) + a vista do decode completo.
 * - `sem-cauda`: só o prefixo confirmado (nunca regride, erasure ~0). Nada do `onUpdate` é pintado.
 * - `cauda-decode`: confirmado + cauda provisória, mas a cauda só muda a cada decode COMPLETO (nada do `onUpdate`), e o
 *   texto mostrado nunca encurta mais de `MAX_ENCOLHE_DA_CAUDA` palavras de uma vez: se a hipótese nova é mais curta que
 *   a mostrada antes além disso, as palavras antigas que sobram ficam na cauda até o próximo decode. Escolha simples: 2 palavras,
 *   contadas por chunk entre espaços (escrita sem espaço conta o chunk inteiro como uma palavra aqui; o modo é de laboratório).
 * - `acrescenta-decode` (PADRÃO desde o A/B da V7) / `acrescenta-token` (V1c): SÓ ACRESCENTA, COM MÁSCARA. A tela nunca troca nem apaga uma palavra já mostrada; a cada hipótese
 *   nova mostra o maior prefixo dela que ESTENDE o que já está na tela, menos as últimas `MASCARA_DO_ACRESCENTA` palavras (o confirmado da LocalAgreement-2
 *   nunca é mascarado). Se a hipótese diverge do que está na tela (ou encurta além dela), nada novo aparece até voltar a concordar; o FINAL substitui tudo, como hoje.
 *   `-decode` age só a cada decode completo; `-token` também a cada token do `onUpdate`.
 *
 * PURO: sem React, sem rede, sem DOM. A chave do localStorage é lida por quem chama (`lerModoDeParciais` só interpreta o valor).
 */
import { type Unidade, unidadesDe, type VistaDoParcial } from './localAgreement.ts';

export type ModoDeParciais = 'cauda-token' | 'sem-cauda' | 'cauda-decode' | 'acrescenta-decode' | 'acrescenta-token';

export const CHAVE_DO_MODO_DE_PARCIAIS = 'babel.lab.parciaisModo';
/**
 * O modo da rota do parcial vivo (Parakeet) quando a chave de laboratório não existe: o aprovado no A/B da V7 (pt/Parakeet). O de
 * antes (`cauda-token`, V1) reprovou na erasure (3,6) e só existe como override de laboratório.
 */
export const MODO_DE_PARCIAIS_PADRAO: ModoDeParciais = 'acrescenta-decode';
/** Quantas palavras a cauda mostrada pode encolher de uma vez no `cauda-decode`. */
export const MAX_ENCOLHE_DA_CAUDA = 2;
/** Quantas palavras finais da hipótese ficam de fora da tela nos modos `acrescenta-*` (k provisório). */
export const MASCARA_DO_ACRESCENTA = 2;
/** Chave de laboratório da máscara dos modos `acrescenta-*` (V4): inteiro de 0 a `MASCARA_MAXIMA`; ausente ou inválida = `MASCARA_DO_ACRESCENTA`. */
export const CHAVE_DA_MASCARA_DE_PARCIAIS = 'babel.lab.parciaisMascara';
export const MASCARA_MAXIMA = 8;

/** O valor do localStorage (ou `null`) vira a máscara; só inteiro decimal de 0 a `MASCARA_MAXIMA`, o resto cai no padrão. */
export function lerMascaraDeParciais(valor: string | null | undefined): number {
  const v = String(valor ?? '').trim();
  if (!/^\d+$/u.test(v)) return MASCARA_DO_ACRESCENTA;
  const n = Number(v);
  return n <= MASCARA_MAXIMA ? n : MASCARA_DO_ACRESCENTA;
}

/** O valor do localStorage (ou `null`) vira um modo; qualquer coisa desconhecida cai no padrão. */
export function lerModoDeParciais(valor: string | null | undefined): ModoDeParciais {
  const v = String(valor ?? '').trim();
  return v === 'sem-cauda' ||
    v === 'cauda-decode' ||
    v === 'cauda-token' ||
    v === 'acrescenta-decode' ||
    v === 'acrescenta-token'
    ? v
    : MODO_DE_PARCIAIS_PADRAO;
}

/** O `onUpdate` (token a token) só é pintado no modo de hoje e no `acrescenta-token`. */
export const pintaTokens = (modo: ModoDeParciais): boolean => modo === 'cauda-token' || modo === 'acrescenta-token';

const juntar = (us: readonly Unidade[]): string => us.map((u, i) => (i ? u.sep : '') + u.txt).join('');

/**
 * Só acrescenta, com máscara: `hipotese` é a vista da LocalAgreement-2 (texto inteiro da hipótese + o confirmado); `exibidoAntes` é o que a tela
 * mostra. Nunca devolve algo que não comece por `exibidoAntes` (palavras comparadas pela forma normalizada; o texto já mostrado é mantido literal).
 */
export function vistaAcrescenta(
  hipotese: VistaDoParcial,
  exibidoAntes: string,
  mascara: number = MASCARA_DO_ACRESCENTA,
): VistaDoParcial {
  const hip = unidadesDe(hipotese.texto);
  const mostrado = unidadesDe(exibidoAntes);
  const concorda = mostrado.length <= hip.length && mostrado.every((u, i) => u.chave === hip[i].chave);
  let novo: Unidade[] = mostrado;
  if (concorda) {
    const confirmadas = unidadesDe(hipotese.confirmado).length;
    const alvo = Math.min(hip.length, Math.max(hip.length - Math.max(0, mascara), confirmadas));
    if (alvo > mostrado.length) novo = [...mostrado, ...hip.slice(mostrado.length, alvo)];
  }
  const texto = novo === mostrado ? exibidoAntes.trim() : juntar(novo);
  const conf = unidadesDe(hipotese.confirmado);
  let c = 0;
  while (c < conf.length && c < novo.length && conf[c].chave === novo[c].chave) c++;
  const confirmado = juntar(novo.slice(0, c));
  return { confirmado, provisorio: juntar(novo.slice(c)), texto };
}

/** O que pintar a cada token do `onUpdate` (só chamado quando `pintaTokens`): `acrescenta-token` aplica a regra; `cauda-token` devolve a vista como veio. */
export function vistaDoToken(
  modo: ModoDeParciais,
  vista: VistaDoParcial,
  exibidoAntes: string,
  mascara: number = MASCARA_DO_ACRESCENTA,
): VistaDoParcial {
  return modo === 'acrescenta-token' ? vistaAcrescenta(vista, exibidoAntes, mascara) : vista;
}

const palavras = (t: string): string[] => t.split(/\s+/u).filter(Boolean);

/**
 * O que pintar quando um decode COMPLETO termina. `vista` é a da LocalAgreement-2 (`avancar`); `exibidoAntes` é o texto que
 * a tela mostrava deste parcial (`''` na primeira vez). No `cauda-token` devolve a vista como veio.
 */
export function vistaDoDecode(
  modo: ModoDeParciais,
  vista: VistaDoParcial,
  exibidoAntes: string,
  mascara: number = MASCARA_DO_ACRESCENTA,
): VistaDoParcial {
  if (modo === 'cauda-token') return vista;
  if (modo === 'acrescenta-decode' || modo === 'acrescenta-token') return vistaAcrescenta(vista, exibidoAntes, mascara);
  if (modo === 'sem-cauda') return { confirmado: vista.confirmado, provisorio: '', texto: vista.confirmado };
  const antes = palavras(exibidoAntes);
  const novas = palavras(vista.texto);
  const piso = antes.length - MAX_ENCOLHE_DA_CAUDA;
  if (novas.length >= piso) return vista;
  // Encolheu demais: mantém as palavras antigas que passam do piso, na cauda (o confirmado nunca é tocado).
  const resto = antes.slice(novas.length, piso).join(' ');
  const provisorio = [vista.provisorio, resto].filter(Boolean).join(' ');
  return { confirmado: vista.confirmado, provisorio, texto: [vista.confirmado, provisorio].filter(Boolean).join(' ') };
}
