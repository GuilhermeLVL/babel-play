/**
 * A VOZ QUE A PESSOA ESCOLHEU, POR IDIOMA — uma preferência só para o app inteiro.
 *
 * A voz escolhida para o inglês vale no narrador da Leitura, no intérprete, na conversa virtual, no
 * "Ouvir" de uma palavra e nos jogos; a do português é outra. Quem FALA não muda: todo mundo já passa
 * por `speak()`/`nativeTts` (`lib/tts.ts`), que lê a preferência do idioma do texto. Este módulo é o
 * que faltava em volta:
 *
 *   · ONDE FICA. Na conta, com as outras preferências (`settings.ui.preferencias.vozes`,
 *     `lib/preferencias.ts`: com conta é o servidor, sem conta o funil guarda no aparelho). O
 *     `localStorage['babel_voice_prefs']` de `tts.ts` continua: é a RESERVA de quem está sem conta e é
 *     de onde o motor lê na hora de falar (síncrono, sem esperar a rede). A conta, quando chega com
 *     vozes guardadas, manda; quando nunca guardou (`vozes: null`), ficam as do aparelho, e elas sobem
 *     na próxima escolha.
 *   · TRÊS TIPOS DE ESCOLHA. Automática (nada guardado: o comportamento de sempre), uma voz do aparelho
 *     (o nome dela) e a voz natural da nuvem (`VOZ_DA_NUVEM`), que só existe com a capacidade
 *     `vozNatural` do plano E a flag `voz_natural`, e só lê onde a nuvem já lia: o intérprete e a
 *     conversa virtual.
 *   · A VOZ QUE SUMIU. Outro aparelho, pacote de voz removido, plano que perdeu a nuvem: a escolha
 *     guardada não é apagada, mas `vozEmUso()` responde "automática" e o motor também. Nada dá erro, e a
 *     voz volta a valer no aparelho que a tem.
 */
import { useEffect, useState } from 'react';

import { FLAG_VOZ_NATURAL } from '../../core/vozNatural';
import { getEntitlements, onPlanChange } from '../entitlements';
import { flagLigada } from '../flagsCache';
import { aoMudarPreferencias, carregarPreferencias, lerPreferencias, salvarPreferencias } from '../preferencias';
import { aoMudarVozes, getVoicePrefs, getVoices, onVoicePrefsChange, setVoicePref, setVoicePrefs } from '../tts';

/** Nada escolhido: o app decide (a melhor voz do aparelho; no intérprete, a da nuvem quando o plano tem). */
export const VOZ_AUTOMATICA = '';
/** A voz natural da nuvem. O `@` não aparece em nome de voz de sistema nenhum. */
export const VOZ_DA_NUVEM = '@nuvem';

const baseDe = (idioma: string): string => (idioma || '').toLowerCase().split(/[-_]/)[0];

/** O plano tem a voz natural E ela está ligada nesta instalação? (a mesma conta do intérprete) */
export function vozDaNuvemDisponivel(): boolean {
  return getEntitlements().vozNatural && flagLigada(FLAG_VOZ_NATURAL);
}

/** Existe no aparelho, agora, uma voz com este nome? */
export function vozDoAparelhoExiste(nome: string): boolean {
  return !!nome && getVoices().some((v) => v.name === nome);
}

/** O que está GUARDADO para o idioma (aceita `en` ou `en-US`), exista a voz aqui ou não. */
export function vozGuardada(idioma: string): string {
  return getVoicePrefs()[baseDe(idioma)] ?? VOZ_AUTOMATICA;
}

/**
 * A escolha que VALE agora para o idioma: a guardada, se ainda existe aqui (a voz do aparelho está
 * instalada; a da nuvem está no plano); senão a automática.
 */
export function vozEmUso(idioma: string, nuvem: boolean = vozDaNuvemDisponivel()): string {
  const guardada = vozGuardada(idioma);
  if (guardada === VOZ_DA_NUVEM) return nuvem ? VOZ_DA_NUVEM : VOZ_AUTOMATICA;
  return vozDoAparelhoExiste(guardada) ? guardada : VOZ_AUTOMATICA;
}

/** A pessoa escolheu, para este idioma, uma voz DO APARELHO que existe aqui? (o intérprete não vai à nuvem) */
export function prefereVozDoAparelho(idioma: string): boolean {
  const guardada = vozGuardada(idioma);
  return guardada !== VOZ_DA_NUVEM && vozDoAparelhoExiste(guardada);
}

/* Enquanto uma gravação minha está em curso, a volta atrás do `salvarPreferencias` (o servidor recusou)
   não desfaz a escolha no aparelho: sem rede, a reserva local é o que vale. */
let gravando = 0;

/**
 * Guarda a voz do idioma (`VOZ_AUTOMATICA` apaga a escolha). Vale NA HORA no aparelho; a gravação na
 * conta vem depois, e `false` diz que ela não aconteceu (a escolha continua valendo neste aparelho).
 * Sobe o mapa inteiro do aparelho: é assim que as vozes escolhidas antes de a conta guardá-las chegam lá.
 */
export async function escolherVoz(idioma: string, voz: string): Promise<boolean> {
  if (!baseDe(idioma)) return false;
  setVoicePref(baseDe(idioma), voz);
  const vozes = { ...getVoicePrefs() };
  gravando++;
  try {
    return await salvarPreferencias((p) => ({ ...p, vozes }));
  } finally {
    gravando--;
  }
}

const iguais = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** A conta chegou (ou mudou em outra tela) com vozes guardadas: o aparelho passa a ter as mesmas. */
function trazerDaConta(vozes: Record<string, string> | null): void {
  if (gravando > 0 || !vozes) return;
  if (!iguais(vozes, getVoicePrefs())) setVoicePrefs(vozes);
}

let ligada: (() => void) | null = null;
/**
 * Liga a preferência à conta: a cada carga ou mudança das preferências, as vozes da conta vêm para o
 * aparelho. Não pede nada ao servidor (quem carrega é a primeira tela que usa as preferências).
 * Idempotente; devolve o desligar.
 */
export function ligarVozesAConta(): () => void {
  if (!ligada) {
    const soltar = aoMudarPreferencias((p) => trazerDaConta(p.vozes));
    trazerDaConta(lerPreferencias().vozes);
    ligada = () => {
      soltar();
      ligada = null;
    };
  }
  return ligada;
}

/**
 * As vozes guardadas, vivas: muda quando a pessoa escolhe (em qualquer tela), quando a conta chega,
 * quando o sistema entrega a lista de vozes e quando o plano muda.
 */
export function useVozesPreferidas(): Record<string, string> {
  const [vozes, setVozes] = useState<Record<string, string>>(getVoicePrefs);
  const [, repintar] = useState(0);
  useEffect(() => {
    ligarVozesAConta();
    void carregarPreferencias();
    setVozes(getVoicePrefs());
    const soltar = [
      onVoicePrefsChange((p) => setVozes({ ...p })),
      aoMudarVozes(() => repintar((n) => n + 1)),
      onPlanChange(() => repintar((n) => n + 1)),
    ];
    return () => soltar.forEach((f) => f());
  }, []);
  return vozes;
}
