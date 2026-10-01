/**
 * A CHAVE DAS TELAS NOVAS DO QUEST (maquete de 01/10/2026).
 *
 * Cada tela redesenhada para o headset entra atrás desta chave: ligada de fábrica, e desligável em
 * `/diagnostico` sem novo deploy. Se uma tela nova sair errada no aparelho, o dono desliga e a tela de
 * antes volta na hora. Só vale no perfil `quest`; computador e celular nunca passam por aqui.
 */
export const CHAVE_DA_TELA_NOVA_DO_QUEST = 'babel.quest.telaNova';

export function telaNovaDoQuest(): boolean {
  try {
    return localStorage.getItem(CHAVE_DA_TELA_NOVA_DO_QUEST) !== 'nao';
  } catch {
    return true;
  }
}

export function definirTelaNovaDoQuest(ligada: boolean): void {
  try {
    if (ligada) localStorage.removeItem(CHAVE_DA_TELA_NOVA_DO_QUEST);
    else localStorage.setItem(CHAVE_DA_TELA_NOVA_DO_QUEST, 'nao');
  } catch {
    /* sem armazenamento: vale o padrão */
  }
}

/** Os passos do tamanho da legenda ao vivo (diretriz da Meta: três ou mais, de 50% a 200%). */
export const ESCALAS_DA_LEGENDA = [0.75, 1, 1.25, 1.5, 2] as const;
export const CHAVE_DA_ESCALA_DA_LEGENDA = 'babel.quest.legenda';

export function lerEscalaDaLegenda(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_DA_ESCALA_DA_LEGENDA));
    return (ESCALAS_DA_LEGENDA as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** O passo vizinho (`+1` maior, `-1` menor), parando nas pontas; grava a escolha. */
export function mudarEscalaDaLegenda(atual: number, passo: 1 | -1): number {
  const i = (ESCALAS_DA_LEGENDA as readonly number[]).indexOf(atual);
  const proximo = ESCALAS_DA_LEGENDA[Math.max(0, Math.min(ESCALAS_DA_LEGENDA.length - 1, (i < 0 ? 1 : i) + passo))];
  try {
    localStorage.setItem(CHAVE_DA_ESCALA_DA_LEGENDA, String(proximo));
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
  return proximo;
}
