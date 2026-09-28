import { type EscolhaDoMic, escolhaGuardada, podeOferecerRapido } from './captura/motorDoMicrofone';
import { lerPreferencias, mudarConsentimento, type Preferencias, salvarPreferencias, usePreferencias } from './preferencias';
import { estadoDaProtecao, perfilProtegido } from './protecaoDoMenor';

/**
 * O CONSENTIMENTO DE NUVEM, lido de onde ele é guardado — Ajustes → Privacidade, com o registro
 * datado de cada mudança (`src/lib/preferencias.ts`).
 *
 * Seis telas montavam o gateway com `cloudConsent: () => true`: o "sim" do usuário não era
 * perguntado em lugar nenhum e a fala dele saía para servidores de IA mesmo assim. Agora elas
 * passam esta função, que é lida A CADA chamada — autorizar ou retirar vale na hora, sem recriar o
 * gateway (Fase 2 do lançamento).
 */
export const consentiuNuvem = (): boolean => lerPreferencias().consentimentos.nuvem === true;

/** Para telas: o estado reativo e a ação de autorizar (grava com data, como Ajustes). */
export function useConsentimentoDeNuvem(): { consentiu: boolean; autorizar: () => Promise<boolean> } {
  const p = usePreferencias();
  return { consentiu: p.consentimentos.nuvem === true, autorizar: () => mudarConsentimento('nuvem', true) };
}

/* --- O RECONHECIMENTO DO NAVEGADOR ("Rápido" no microfone) — consentimento PRÓPRIO, ver
       `preferencias.ts` (`reconhecimentoDoNavegador`) e `captura/motorDoMicrofone.ts`. --- */

/** A pessoa autorizou o navegador a mandar a voz dela ao Google/Microsoft/Apple? */
export const consentiuReconhecimentoDoNavegador = (): boolean =>
  lerPreferencias().consentimentos.reconhecimentoDoNavegador === true;

/**
 * "Rápido", "Privado" ou ainda não respondeu (`null`). Retirar o consentimento em Ajustes →
 * Privacidade também é uma resposta (fica no registro datado): vale como "Privado", sem perguntar.
 */
export function escolhaDoMicGuardada(p: Preferencias = lerPreferencias()): EscolhaDoMic | null {
  return escolhaGuardada({
    consentiuNavegador: p.consentimentos.reconhecimentoDoNavegador === true,
    jaEscolheu: p.micEscolhido || p.registroDeConsentimentos.some((r) => r.chave === 'reconhecimentoDoNavegador'),
  });
}

/** Grava a resposta: o consentimento (com data, como Ajustes grava) e "já respondeu". */
export function guardarEscolhaDoMic(escolha: EscolhaDoMic): Promise<boolean> {
  const valor = escolha === 'rapido';
  return salvarPreferencias((p) => ({
    ...p,
    micEscolhido: true,
    consentimentos: { ...p.consentimentos, reconhecimentoDoNavegador: valor },
    registroDeConsentimentos: [
      ...p.registroDeConsentimentos,
      { chave: 'reconhecimentoDoNavegador', valor, em: Date.now() },
    ],
  }));
}

/**
 * O "Rápido" existe para este perfil? Protegido (menor, ou idade não declarada no modo público) só
 * com o vínculo do responsável aceito e a conta não restrita — a régua da nuvem em `protecaoDoMenor.ts`.
 */
export function rapidoDoMicPermitido(): boolean {
  const e = estadoDaProtecao();
  return podeOferecerRapido({
    protegido: perfilProtegido(),
    responsavelAutorizou: !!e && e.vinculo.estado === 'aceito' && !e.restrita,
  });
}

/** Para o painel da captura: a escolha reativa e a ação de trocar. */
export function useEscolhaDoMic(): { escolha: EscolhaDoMic | null; escolher: (e: EscolhaDoMic) => Promise<boolean> } {
  const p = usePreferencias();
  return { escolha: escolhaDoMicGuardada(p), escolher: guardarEscolhaDoMic };
}
