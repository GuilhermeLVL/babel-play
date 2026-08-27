import type { OrigemDaPratica, EscopoDeGravacoes } from '@core';
import type { CefrLevel } from '@core';

/**
 * A ÚLTIMA ESCOLHA DE PRÁTICA, LEMBRADA ENTRE VISITAS.
 *
 * O DEFEITO QUE ISTO CONSERTA. Nada da fonte sobrevivia a um recarregamento: `fonte.id`,
 * `sessionId` e `nivel` eram `useState` puro. Quem escolhia "Trilha B1" e apertava F5 voltava para
 * "Minhas palavras" — e, pela regra antiga de exibição, podia nem reencontrar o botão da trilha.
 * Só o idioma sobrevivia, e por outro caminho (`settings.ui.praticaLang`).
 *
 * POR QUE `localStorage`, E NÃO O SERVIDOR. O idioma é preferência de PERFIL — "o que eu estudo" —
 * e deve atravessar dispositivos; ele continua em `settings.ui`. Isto aqui é outra coisa: é
 * contexto de trabalho da última visita, local e descartável. Três razões concretas:
 *  - `patchUiSettings` faz `fetchSettings` + `saveSettings` (duas idas à rede por gravação) e falha
 *    offline, num app que se orgulha de funcionar sem rede;
 *  - `sessionId` é um ponteiro para algo que pode ter sido apagado noutro dispositivo —
 *    sincronizá-lo produz um ponteiro quebrado remoto;
 *  - o precedente já está estabelecido: `babel.pular_antessala` e `lib/ordemDosJogos`.
 *
 * A LEITURA É VALIDADA, no molde de `lerOrdem`: valor corrompido ou gravação que não existe mais
 * caem para o padrão, em vez de deixar a tela apontando para o nada.
 */

const CHAVE = 'babel.fonte_da_pratica';

export interface FonteGuardada {
  origem: OrigemDaPratica;
  escopo: EscopoDeGravacoes;
  sessionId?: string;
  nivel?: CefrLevel;
}

const PADRAO: FonteGuardada = { origem: 'gravacoes', escopo: 'todas' };

const ORIGENS: OrigemDaPratica[] = ['gravacoes', 'trilha'];
const ESCOPOS: EscopoDeGravacoes[] = ['todas', 'uma'];
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * Lê a escolha guardada, saneando contra o mundo real.
 *
 * `sessoesExistentes` não é opcional por preguiça de tipo: sem ela, a escolha "uma gravação"
 * poderia restaurar um id que foi apagado, e a tela abriria uma fonte vazia sem dizer por quê.
 */
export function lerFonteGuardada(sessoesExistentes: readonly string[]): FonteGuardada {
  let cru: unknown;
  try {
    const texto = localStorage.getItem(CHAVE);
    if (!texto) return PADRAO;
    cru = JSON.parse(texto);
  } catch {
    return PADRAO;   // storage bloqueado ou JSON corrompido, o padrão sempre funciona
  }

  const o = (cru ?? {}) as Partial<FonteGuardada>;
  const origem = ORIGENS.includes(o.origem as OrigemDaPratica) ? o.origem as OrigemDaPratica : PADRAO.origem;
  const escopo = ESCOPOS.includes(o.escopo as EscopoDeGravacoes) ? o.escopo as EscopoDeGravacoes : PADRAO.escopo;
  const nivel = NIVEIS.includes(o.nivel as string) ? o.nivel as CefrLevel : undefined;

  // A gravação guardada só vale se ainda existe. Senão, "todas" — que nunca aponta para o vazio.
  const sessionId = o.sessionId && sessoesExistentes.includes(o.sessionId) ? o.sessionId : undefined;
  if (origem === 'gravacoes' && escopo === 'uma' && !sessionId) {
    return { origem: 'gravacoes', escopo: 'todas' };
  }

  return { origem, escopo, sessionId, nivel };
}

/** Grava. Falha de storage é silenciosa de propósito: perder a memória não pode travar a prática. */
export function gravarFonteGuardada(f: FonteGuardada): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      origem: f.origem, escopo: f.escopo, sessionId: f.sessionId, nivel: f.nivel,
    }));
  } catch { /* storage bloqueado */ }
}
