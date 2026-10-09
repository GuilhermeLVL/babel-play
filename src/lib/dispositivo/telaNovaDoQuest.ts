/**
 * A CHAVE DAS TELAS NOVAS DO QUEST (maquete de 01/10/2026).
 *
 * Cada tela redesenhada para o headset entra atrás desta chave: ligada de fábrica, e desligável em
 * `/diagnostico` sem novo deploy. Se uma tela nova sair errada no aparelho, o dono desliga e a tela de
 * antes volta na hora. Só vale no perfil `quest`; computador e celular têm a chave deles, mais abaixo.
 */
import { useSyncExternalStore } from 'react';

import { perfilDoDispositivo, registrarQuemDispensaOModoLeve } from './perfil';

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
 * NO CELULAR E NO TABLET (08/10/2026) a mesma chave vale, e nasce LIGADA: ver `padraoDeFabrica`.
 */
export const CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR = 'babel.desenhoNovo';

/**
 * O PADRÃO DE FÁBRICA vem do build: `VITE_DESENHO_NOVO_PADRAO=1` faz o desenho novo ser o que abre no
 * computador (o servidor completo sobe assim); sem a variável, continua desligado. Com o padrão ligado,
 * desligar grava `nao`, porque apagar a chave devolveria o padrão.
 */
const DESENHO_NOVO_DE_FABRICA = import.meta.env.VITE_DESENHO_NOVO_PADRAO === '1';

/** O aparelho é um celular ou um tablet (os dois perfis de `perfil.ts` que não são computador nem headset). */
export const noCelular = (): boolean => perfilDoDispositivo().tipo.startsWith('celular');

/**
 * NO CELULAR E NO TABLET O PADRÃO É LIGADO (decisão do dono, 08/10/2026: o desenho novo será o único em
 * todo aparelho; a versão de celular é a do protótipo, `styles/polimento/celular.css`). A chave continua
 * valendo por enquanto: `nao` devolve a casca de antes (`MobileNav`, `MobileTopBar`).
 *
 * "Celular", para o padrão, é o aparelho DE TOQUE (`maxTouchPoints > 0`, todo telefone e todo tablet).
 * O perfil `celular-*` também acolhe o que só não tem captura de tela (`perfil.ts`: sem `getDisplayMedia`),
 * e ali, sem toque, o padrão continua o do build, como no computador. É também o caso do jsdom dos
 * testes, onde dezenas de arquivos descrevem as telas de antes sem escolher aparelho.
 */
const celularDeToque = (): boolean => {
  const p = perfilDoDispositivo();
  return p.tipo.startsWith('celular') && p.sinais.toques > 0;
};
const padraoDeFabrica = (): boolean => DESENHO_NOVO_DE_FABRICA || celularDeToque();

function desligarDesenhoNovo(): void {
  if (padraoDeFabrica()) localStorage.setItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR, 'nao');
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
    return guardado === null ? padraoDeFabrica() : guardado === 'sim';
  } catch {
    return padraoDeFabrica();
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
 * As telas novas valem AQUI: no Quest com a chave ligada, e no computador, no celular e no tablet com o
 * desenho novo ligado (a mesma chave `babel.desenhoNovo`; no celular e no tablet ela nasce ligada).
 * O nome ficou do headset, onde o desenho nasceu; o que é DO APARELHO (captura leve, voz da nuvem,
 * vibração) pergunta por `perfilDoDispositivo().tipo === 'quest'`, nunca por esta função.
 */
export function questNovo(): boolean {
  const tipo = perfilDoDispositivo().tipo;
  if (tipo === 'quest') return telaNovaDoQuest();
  return desenhoNovoNoComputador();
}

/* Com o desenho novo, o modo leve só liga pela escolha de quem usa (ver `perfil.ts`). */
registrarQuemDispensaOModoLeve(questNovo);

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
