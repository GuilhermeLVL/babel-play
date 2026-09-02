/**
 * A PISTA QUE O JOGO MOSTRA — e por que ela não pode ser o verso cru.
 *
 * MEDIDO NO ACERVO DO DONO (baralho "4000 Essential English Words", 2.225 cartões importados):
 * **100% dos versos contêm a própria palavra-alvo**. Não é acidente nem baralho ruim: é o formato
 * mais comum de material de vocabulário do Anki — frente = palavra, verso = DEFINIÇÃO no mesmo
 * idioma ("To abandon something is to leave it forever"), não tradução para outro idioma.
 *
 * O produto inteiro foi desenhado supondo o par bilíngue curto (`word` ↔ `translation`), e a régua
 * `pistaUtil` mede COMPRIMENTO e RUÍDO — nunca perguntou se a pista entrega a resposta. Resultado
 * na tela, relatado pelo dono e reproduzido aqui: no Termo, a dica é "To abandon something is to
 * leave it forever" e a resposta a digitar é `abandon`, impressa na própria dica; na Memória, o par
 * casa sozinho porque a palavra está escrita nas duas cartas.
 *
 * A CORREÇÃO NÃO É REJEITAR ESSE MATERIAL — seria jogar fora o tipo de baralho mais popular que
 * existe, e a definição é uma pista pedagogicamente ÓTIMA. É mascarar a resposta dentro dela, que
 * transforma o defeito no exercício clássico de definição-com-lacuna:
 *
 *     "To ____ something is to leave it forever."  →  digite: abandon
 *
 * A máscara cobre também as flexões (`abandoned`, `abandoning`) porque um verso que diz
 * "abandoning" entrega a resposta do mesmo jeito. O que NÃO se mascara é palavra apenas parecida:
 * `art` não pode apagar `article`, senão a pista vira sopa de lacunas. O critério é sufixo
 * FLEXIONAL conhecido, não prefixo comum.
 */

/** O que o jogador vê no lugar da resposta. Três traços leem como lacuna em qualquer fonte. */
export const LACUNA = '———';

/** Sufixos flexionais que ainda são A MESMA palavra para efeito de vazamento. */
const SUFIXOS = ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'est', 'ies', 'ment', 'ness'];

/** Normaliza para comparação: minúsculas, sem acento, sem pontuação de borda. */
function normalizar(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * `token` é a mesma palavra que `alvo`, ou uma flexão dela?
 *
 * IGUALDADE EXATA sempre casa, qualquer que seja o tamanho: se o alvo é `be`, um `be` na pista
 * entrega a resposta tanto quanto qualquer outro. Já a FLEXÃO exige radical de 3+ letras — senão
 * `be` casaria `bear`, `best`, `bed`, e a pista viraria sopa de lacunas. Esta assimetria é o
 * ponto: um teste do material real ("To be or not to be, that is the bear") pegou a versão que
 * descartava alvos curtos por inteiro.
 */
function mesmaPalavra(token: string, alvo: string): boolean {
  if (!token || !alvo) return false;
  if (token === alvo) return true;
  if (alvo.length < 3) return false; // radical curto demais para flexionar com segurança
  // O verso pode trazer a flexão ("abandoning") do alvo ("abandon")…
  if (token.startsWith(alvo)) {
    const resto = token.slice(alvo.length);
    if (SUFIXOS.includes(resto)) return true;
    // dobra da consoante final: abandon → abandonning? (raro, mas barato de cobrir)
    if (resto.length > 1 && resto[0] === alvo[alvo.length - 1] && SUFIXOS.includes(resto.slice(1))) return true;
  }
  // …ou o alvo pode ser a flexão de uma raiz que o verso usa ("abandoned" no cartão, "abandon" no texto).
  if (alvo.startsWith(token) && token.length >= 3) {
    const resto = alvo.slice(token.length);
    if (SUFIXOS.includes(resto)) return true;
  }
  // 'y' → 'ies' / 'ied' (ability/abilities, apply/applied)
  if (alvo.endsWith('y') && token.startsWith(alvo.slice(0, -1) + 'i')) {
    const resto = token.slice(alvo.length - 1 + 1);
    if (SUFIXOS.includes(resto) || resto === 'es' || resto === 'ed') return true;
  }
  return false;
}

/**
 * A pista ENTREGA a resposta? Multi-palavra: basta uma palavra do alvo aparecer, porque ver
 * metade de uma expressão de duas palavras já resolve o exercício.
 */
export function vazaResposta(pista: string, alvo: string): boolean {
  const alvos = normalizar(alvo).split(/\s+/).filter((p) => p.length >= 2);
  if (!alvos.length) return false;
  const tokens = (pista ?? '').split(/[^\p{L}\p{N}'’-]+/u).map(normalizar).filter(Boolean);
  return tokens.some((t) => alvos.some((a) => mesmaPalavra(t, a)));
}

/**
 * Troca por lacuna toda ocorrência da resposta (e flexões) dentro da pista, preservando o resto do
 * texto exatamente como está — pontuação, maiúsculas e espaçamento intactos.
 */
export function mascararResposta(pista: string, alvo: string, lacuna: string = LACUNA): string {
  const texto = pista ?? '';
  const alvos = normalizar(alvo).split(/\s+/).filter((p) => p.length >= 2);
  if (!texto || !alvos.length) return texto;
  return texto.replace(/[\p{L}\p{N}'’-]+/gu, (palavra) => {
    const n = normalizar(palavra);
    return n && alvos.some((a) => mesmaPalavra(n, a)) ? lacuna : palavra;
  });
}

export interface PistaDeJogo {
  /** O texto a exibir: já sem a resposta dentro. */
  texto: string;
  /** Houve mascaramento? A UI usa para explicar a lacuna ao jogador na primeira vez. */
  mascarada: boolean;
  /** Versão curta para espaço apertado (carta de memória, botão do duelo). */
  curta: string;
}

/** Encurta por PALAVRAS, nunca no meio de uma — cortar "compu…" não ajuda ninguém. */
function encurtar(texto: string, maxChars: number): string {
  const t = texto.trim();
  if (t.length <= maxChars) return t;
  const palavras = t.split(/\s+/);
  const saida: string[] = [];
  let n = 0;
  for (const p of palavras) {
    if (n + p.length + 1 > maxChars - 1) break;
    saida.push(p);
    n += p.length + 1;
  }
  return (saida.length ? saida.join(' ') : t.slice(0, maxChars - 1)) + '…';
}

/**
 * A pista pronta para um jogo. É por aqui que TODO jogo deve passar antes de mostrar `translation`
 * — é o único ponto onde a garantia "a pista não contém a resposta" pode ser mantida.
 */
export function pistaDeJogo(alvo: string, pista: string | null | undefined, maxChars = 90): PistaDeJogo {
  const cru = (pista ?? '').trim();
  if (!cru) return { texto: '', mascarada: false, curta: '' };
  const precisa = vazaResposta(cru, alvo);
  const texto = precisa ? mascararResposta(cru, alvo) : cru;
  return { texto, mascarada: precisa, curta: encurtar(texto, maxChars) };
}
