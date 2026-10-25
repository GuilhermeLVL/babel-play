/**
 * OS AJUSTES DO ASSISTENTE AO VIVO, guardados NESTE aparelho (`localStorage['babel.assistente']`) e lidos de forma
 * reativa: Ajustes da captura e o Personalizar da janela flutuante mexem no mesmo valor e um vê o outro na hora (a
 * janela da Document PiP roda no mesmo JavaScript do app).
 */
import { useSyncExternalStore } from 'react';

import { AJUSTES_PADRAO, type AjustesDoAssistente, normalizarAjustes } from '../../core/assistente/telaDoAssistente';

export const CHAVE_DO_ASSISTENTE = 'babel.assistente';

let atual: AjustesDoAssistente | null = null;
const inscritos = new Set<() => void>();

function lerDoDisco(): AjustesDoAssistente {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_ASSISTENTE);
    return bruto ? normalizarAjustes(JSON.parse(bruto)) : { ...AJUSTES_PADRAO };
  } catch {
    return { ...AJUSTES_PADRAO };
  }
}

export function lerAjustesDoAssistente(): AjustesDoAssistente {
  atual ??= lerDoDisco();
  return atual;
}

export function mudarAjustesDoAssistente(patch: Partial<AjustesDoAssistente>): void {
  atual = normalizarAjustes({ ...lerAjustesDoAssistente(), ...patch });
  try {
    localStorage.setItem(CHAVE_DO_ASSISTENTE, JSON.stringify(atual));
  } catch {
    /* disco cheio ou bloqueado: vale nesta sessão */
  }
  for (const f of inscritos) f();
}

/** Para os testes: esquece o que está em memória (a próxima leitura volta ao disco). */
export function esquecerAjustesDoAssistente(): void {
  atual = null;
}

function assinar(f: () => void) {
  inscritos.add(f);
  const doOutroAba = (e: StorageEvent) => {
    if (e.key !== CHAVE_DO_ASSISTENTE) return;
    atual = null;
    f();
  };
  window.addEventListener('storage', doOutroAba);
  return () => {
    inscritos.delete(f);
    window.removeEventListener('storage', doOutroAba);
  };
}

export function useAjustesDoAssistente(): AjustesDoAssistente {
  return useSyncExternalStore(assinar, lerAjustesDoAssistente, () => AJUSTES_PADRAO);
}
