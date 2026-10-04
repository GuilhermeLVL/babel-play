/**
 * A CHAVE DAS TELAS NOVAS DO QUEST (maquete de 01/10/2026).
 *
 * Cada tela redesenhada para o headset entra atrás desta chave: ligada de fábrica, e desligável em
 * `/diagnostico` sem novo deploy. Se uma tela nova sair errada no aparelho, o dono desliga e a tela de
 * antes volta na hora. Só vale no perfil `quest`; computador e celular nunca passam por aqui.
 */
import { useSyncExternalStore } from 'react';

import { perfilDoDispositivo } from './perfil';

export const CHAVE_DA_TELA_NOVA_DO_QUEST = 'babel.quest.telaNova';
const EVENTO = 'babel:quest-tela-nova';

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
  marcarQuestNovoNoDocumento();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

/**
 * O MESMO DESENHO NO COMPUTADOR (pedido do dono, 02/10/2026: "ficou tão bom que eu gostaria de passar
 * essa interface para o computador também"). DESLIGADO de fábrica enquanto as telas são conferidas no
 * computador; liga em Ajustes → Aparência, ou com `?desenho=novo` na URL (`?desenho=antigo` desliga).
 * O celular fica para depois: lá o desenho precisa de adaptação própria.
 */
export const CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR = 'babel.desenhoNovo';

/**
 * O PADRÃO DE FÁBRICA vem do build: `VITE_DESENHO_NOVO_PADRAO=1` faz o desenho novo ser o que abre no
 * computador (o servidor completo sobe assim); sem a variável, continua desligado. Com o padrão ligado,
 * desligar grava `nao`, porque apagar a chave devolveria o padrão.
 */
const DESENHO_NOVO_DE_FABRICA = import.meta.env.VITE_DESENHO_NOVO_PADRAO === '1';

function desligarDesenhoNovo(): void {
  if (DESENHO_NOVO_DE_FABRICA) localStorage.setItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR, 'nao');
  else localStorage.removeItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR);
}

if (typeof window !== 'undefined') {
  try {
    const pedido = new URLSearchParams(window.location.search).get('desenho');
    if (pedido === 'novo') localStorage.setItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR, 'sim');
    else if (pedido === 'antigo') desligarDesenhoNovo();
  } catch {
    /* sem armazenamento: vale o padrão */
  }
}

export function desenhoNovoNoComputador(): boolean {
  try {
    const guardado = localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR);
    return guardado === null ? DESENHO_NOVO_DE_FABRICA : guardado === 'sim';
  } catch {
    return DESENHO_NOVO_DE_FABRICA;
  }
}

export function definirDesenhoNovoNoComputador(ligado: boolean): void {
  try {
    if (ligado) localStorage.setItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR, 'sim');
    else desligarDesenhoNovo();
  } catch {
    /* sem armazenamento: vale o padrão */
  }
  marcarQuestNovoNoDocumento();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

/** O aparelho é um computador (e não o headset, nem um celular). */
export const noComputador = (): boolean => perfilDoDispositivo().tipo.startsWith('desktop');

/**
 * O aparelho é o HEADSET. Tudo o que é LIMITE OU RECURSO DO APARELHO (sem teclado físico, sem voz
 * própria, sem nota de pronúncia, o raio do controle, a vibração, o relógio mais folgado de um jogo)
 * pergunta por aqui, ou pelo recurso em `recursos.ts`; nunca por `questNovo()`, que hoje também é
 * verdadeiro no computador.
 */
export const noHeadset = (): boolean => perfilDoDispositivo().tipo === 'quest';

/**
 * As telas novas valem AQUI: no Quest com a chave ligada, ou no computador com o desenho novo ligado.
 * O nome ficou do headset, onde o desenho nasceu; o que é DO APARELHO (captura leve, voz da nuvem,
 * vibração) pergunta por `perfilDoDispositivo().tipo === 'quest'`, nunca por esta função.
 */
export function questNovo(): boolean {
  const tipo = perfilDoDispositivo().tipo;
  if (tipo === 'quest') return telaNovaDoQuest();
  return tipo.startsWith('desktop') && desenhoNovoNoComputador();
}

/** `<html data-quest-novo>`: é o que o CSS de `styles/quest.css` lê. Chamado no boot e a cada troca da chave. */
export function marcarQuestNovoNoDocumento(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.questNovo = String(questNovo());
}

const assinar = (aoMudar: () => void) => {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
};

/** `questNovo()` para componentes: desligar a chave em `/diagnostico` devolve a tela de antes na hora. */
export function useQuestNovo(): boolean {
  return useSyncExternalStore(assinar, questNovo, () => false);
}

/* A fonte do som, a vibração do controle e a escala da legenda (o que só o headset tem) moram em
   `preferenciasDoQuest.ts`: este arquivo entra no JS inicial, e elas não precisam estar nele. */
