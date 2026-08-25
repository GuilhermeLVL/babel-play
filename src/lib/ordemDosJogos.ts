/**
 * A ORDEM DOS JOGOS NA GRADE — a do usuário, não a nossa.
 *
 * A tela nasceu com a ordem cravada no código ("do mais simples ao mais tenso") e com cinco dos
 * nove jogos escondidos atrás de um "Ver todos" nos perfis Kids e Sênior. As duas decisões eram
 * nossas e nenhuma delas era do dono do app: quem joga caça-palavras todo dia não quer descer a
 * página até ele, e quem nunca vai jogar Termo não quer ele no primeiro lugar.
 *
 * ONDE FICA GUARDADO. `localStorage`, seguindo o precedente de `minigames/passosDosJogos.ts`.
 * NÃO em `settings.ui`: `patchUiSettings` é leitura-modificação-escrita não atômica, e
 * `Onboarding.tsx` chama `saveSettings`, que sobrescreve o blob `ui` INTEIRO — a ordem morreria na
 * primeira vez que o onboarding rodasse de novo (e ele é reativável pelos Ajustes).
 *
 * A ordenação em si é pura e mora aqui separada da leitura/escrita, porque é onde o engano passa
 * despercebido: a grade continua aparecendo, só que na ordem errada.
 */
import type { MinigameId } from '@core';

const CHAVE = 'babel.jogos_ordem';

export interface OrdemDosJogos {
  /** Sobem para o topo, na ordem em que foram fixados. */
  fixados: string[];
  /** A ordem escolhida para o resto. Ids que não estão aqui vão para o fim. */
  ordem: string[];
}

export const ORDEM_VAZIA: OrdemDosJogos = { fixados: [], ordem: [] };

/**
 * Aplica a preferência à lista de jogos.
 *
 * A REGRA DE OURO É "NADA SOME". Um jogo que o app ganhar depois de a pessoa ter mexido na ordem
 * não está em `ordem` nem em `fixados` — e vai para o FIM da lista em vez de desaparecer. Pelo
 * mesmo motivo, um id guardado que não existe mais (jogo removido, `localStorage` de uma versão
 * antiga) é simplesmente ignorado: preferência velha não pode derrubar a tela.
 *
 * Genérica em `T` para o chamador passar o objeto inteiro da carta e receber de volta o mesmo
 * objeto reordenado — sem a tela ter de casar ids com cartas por fora.
 */
export function aplicarOrdem<T>(jogos: T[], pref: OrdemDosJogos, idDe: (j: T) => string): T[] {
  const fixados = new Set(pref.fixados ?? []);
  const posicao = new Map<string, number>();
  (pref.ordem ?? []).forEach((id, i) => posicao.set(id, i));
  const posicaoFixado = new Map<string, number>();
  (pref.fixados ?? []).forEach((id, i) => posicaoFixado.set(id, i));

  // `FIM` e não `Infinity`: subtrair Infinity de Infinity dá NaN, e um comparador que devolve NaN
  // produz ordem indefinida — o tipo de defeito que só aparece quando dois jogos novos chegam
  // juntos.
  const FIM = jogos.length + (pref.ordem?.length ?? 0) + 1;

  return [...jogos].sort((a, b) => {
    const ia = idDe(a), ib = idDe(b);
    const fa = fixados.has(ia), fb = fixados.has(ib);
    if (fa !== fb) return fa ? -1 : 1;
    if (fa && fb) return (posicaoFixado.get(ia) ?? FIM) - (posicaoFixado.get(ib) ?? FIM);
    return (posicao.get(ia) ?? FIM) - (posicao.get(ib) ?? FIM);
  });
}

/**
 * Move um jogo uma casa para a esquerda ou para a direita, DENTRO do grupo dele.
 *
 * Dentro do grupo é o ponto: mover um jogo fixado nunca o tira dos fixados, e mover um jogo comum
 * nunca o promove a fixado. Misturar as duas coisas num gesto só faria a seta ora reordenar, ora
 * fixar — e a pessoa não teria como prever qual.
 *
 * Recebe a lista JÁ ORDENADA que está na tela, para a seta mover o que se vê. Calcular a partir da
 * lista original moveria a carta para um lugar que não é o vizinho visível.
 */
export function mover(pref: OrdemDosJogos, visiveis: string[], id: string, direcao: -1 | 1): OrdemDosJogos {
  const fixado = (pref.fixados ?? []).includes(id);
  const grupo = visiveis.filter(x => (pref.fixados ?? []).includes(x) === fixado);
  const i = grupo.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= grupo.length) return pref;   // já está na ponta: nada a fazer
  const novo = [...grupo];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return fixado
    ? { ...pref, fixados: novo }
    // Os não-fixados que não estão visíveis (outra página) mantêm a posição relativa depois.
    : { ...pref, ordem: [...novo, ...(pref.ordem ?? []).filter(x => !novo.includes(x))] };
}

/**
 * Fixa ou desafixa. Desafixar devolve o jogo ao grupo comum NA FRENTE — se ele voltasse para o
 * fim, desafixar por engano custaria caro para desfazer.
 */
export function alternarFixado(pref: OrdemDosJogos, id: string): OrdemDosJogos {
  const fixados = pref.fixados ?? [];
  if (fixados.includes(id)) {
    return { fixados: fixados.filter(x => x !== id), ordem: [id, ...(pref.ordem ?? []).filter(x => x !== id)] };
  }
  return { fixados: [...fixados, id], ordem: (pref.ordem ?? []).filter(x => x !== id) };
}

export function lerOrdem(): OrdemDosJogos {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return ORDEM_VAZIA;
    const o = JSON.parse(cru) as Partial<OrdemDosJogos>;
    // Validação defensiva: um `localStorage` corrompido (ou de outra versão) não pode derrubar a
    // tela de jogos inteira. Na dúvida, ignora a preferência e mostra a ordem padrão.
    return {
      fixados: Array.isArray(o?.fixados) ? o.fixados.filter(x => typeof x === 'string') : [],
      ordem: Array.isArray(o?.ordem) ? o.ordem.filter(x => typeof x === 'string') : [],
    };
  } catch { return ORDEM_VAZIA; }
}

export function gravarOrdem(pref: OrdemDosJogos): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch { /* storage bloqueado: vale só nesta sessão */ }
}

/** Só para o tipo casar com `MinigameId` sem o chamador precisar converter. */
export const idDoJogo = (j: { id: MinigameId }): string => j.id;
