/**
 * APARELHO × NUVEM — a escolha de "onde a fala é processada", num lugar só (Task 4, correção 1).
 *
 * Quem escolhe: a aba Processamento dos Ajustes (`AiEnginePanel`), o painel de processamento da Captura
 * (`PainelDeProcessamento`) e os níveis da folha "Como isto funciona". Todos chamam
 * `escolherProcessamento`, e todos leem o lado marcado de `ladoDoProcessamento`: as telas não podem
 * discordar, porque não guardam nada delas.
 *
 * A ESCOLHA É FEITA DE DUAS PEÇAS QUE JÁ EXISTIAM, gravadas juntas:
 *   - o modo do provedor (`providerMode` + perfil + chave, `gateway/activeProfile`): aparelho = `free-web`
 *     (ou `local-private`, com a IA do computador); nuvem = `cloud-quality` com a chave, quando há chave;
 *   - a qualidade da transcrição (`sttQuality`, `gateway/sttRouter`): aparelho = o modelo local que a
 *     pessoa já tinha (`fast`/`accurate`, `accurate` por padrão); nuvem = `cloud` (a nuvem do plano).
 * Antes, os Ajustes só gravavam o modo, e a nuvem do plano seguia transcrevendo no automático.
 *
 * "APARELHO" GARANTE O APARELHO (`soNoAparelho`): com o modo local e um modelo local na qualidade, a
 * rota do STT é local (`routeStt`), e `consentiuNuvemNaFala` responde "não" à captura — o gateway não
 * manda trecho nenhum à nuvem (nem a subida da porta de qualidade, nem o tradutor do servidor, nem o
 * MyMemory), e a oferta da nuvem de alívio não aparece. Vale até a pessoa escolher Nuvem de novo.
 * O reconhecimento do navegador ("Rápido" do microfone) tem consentimento próprio e não entra aqui.
 */
import { useSyncExternalStore } from 'react';

import { fetchSettings, patchUiSettings } from '../data/api';
import { CREDENTIAL_KEY, getProviderMode, setProviderChoice } from '../gateway/activeProfile';
import { getSttQuality, setSttQualityMirror, type SttQuality } from '../gateway/sttRouter';
import { qualidadeDoNivel } from './captura/nivelDeServico';
import { consentiuNuvem } from './consentimentoDeNuvem';
import { perfilProtegido } from './protecaoDoMenor';

export type LadoDoProcessamento = 'aparelho' | 'nuvem';
export type PerfilDoAparelho = 'free-web' | 'local-private';

/** O evento que avisa as telas abertas (a Captura guarda a qualidade no estado dela). */
export const EVENTO_DO_PROCESSAMENTO = 'babel:processamento';

/** A chave guardada neste navegador. */
function lerCredencial(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

/** A chave lembrada no servidor, quando o navegador não a tem. */
async function credencialDoServidor(): Promise<string | null> {
  const s = await fetchSettings();
  try {
    const ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {};
    return (ui.credencialDaNuvem as string | undefined) ?? (ui.credentialId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

const local = (q: SttQuality): boolean => q === 'fast' || q === 'accurate';

/** A pessoa escolheu o aparelho: modo local E um modelo local na qualidade. Nada de fala vai à nuvem. */
export function soNoAparelho(): boolean {
  return getProviderMode() === 'local' && local(getSttQuality());
}

/**
 * O consentimento de nuvem PARA A FALA DA CAPTURA: o de Ajustes → Privacidade, e não "Aparelho". É o
 * `cloudConsent` do gateway da Captura e o consentimento que o selo da fala considera.
 */
export const consentiuNuvemNaFala = (): boolean => consentiuNuvem() && !soNoAparelho();

/**
 * O LADO MARCADO, o mesmo em toda tela. `nuvemLiberada` = o plano tem nuvem (e não é a edição estática);
 * sem ela, e no perfil protegido, é sempre o aparelho. No automático, é a nuvem só com o consentimento
 * (sem ele, nada sai do aparelho de qualquer jeito).
 */
export function ladoDoProcessamento(nuvemLiberada: boolean): LadoDoProcessamento {
  if (!nuvemLiberada || perfilProtegido() || soNoAparelho()) return 'aparelho';
  if (getProviderMode() === 'cloud' || getSttQuality() === 'cloud') return 'nuvem';
  return consentiuNuvem() ? 'nuvem' : 'aparelho';
}

function avisar(): void {
  try {
    window.dispatchEvent(new Event(EVENTO_DO_PROCESSAMENTO));
  } catch {
    /* fora do navegador */
  }
}

function assinar(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_DO_PROCESSAMENTO, aoMudar);
  window.addEventListener('storage', aoMudar);
  return () => {
    window.removeEventListener(EVENTO_DO_PROCESSAMENTO, aoMudar);
    window.removeEventListener('storage', aoMudar);
  };
}

/** O lado marcado, reativo: muda na hora em que qualquer tela escolhe. */
export function useLadoDoProcessamento(nuvemLiberada: boolean): LadoDoProcessamento {
  return useSyncExternalStore(
    assinar,
    () => ladoDoProcessamento(nuvemLiberada),
    () => 'aparelho',
  );
}

export interface ResultadoDaEscolha {
  /** A qualidade gravada (o espelho local já mudou quando a função volta). */
  qualidade: SttQuality;
  /** Nuvem sem chave própria cadastrada: vale a nuvem do plano. */
  semChave: boolean;
  /** O servidor gravou. A escolha local vale de qualquer jeito. */
  salvo: boolean;
}

/**
 * ESCOLHER APARELHO OU NUVEM — a escolha inteira: o modo, o perfil, a chave e a qualidade, no espelho
 * local (vale na hora, para a próxima captura) e no servidor, e o aviso às telas abertas.
 * `credencial`: a chave que acabou de ser cadastrada (o formulário dos Ajustes).
 */
export async function escolherProcessamento(
  lado: LadoDoProcessamento,
  opcoes: { perfil?: PerfilDoAparelho; credencial?: string } = {},
): Promise<ResultadoDaEscolha> {
  const atual = getSttQuality();
  if (lado === 'aparelho') {
    const qualidade = qualidadeDoNivel('aparelho', atual);
    const cred = lerCredencial();
    setProviderChoice({ mode: 'local', profileId: opcoes.perfil ?? 'free-web' });
    setSttQualityMirror(qualidade);
    avisar();
    const salvo = await patchUiSettings({
      providerMode: 'local',
      credentialId: null,
      sttQuality: qualidade,
      ...(cred ? { credencialDaNuvem: cred } : {}),
    });
    return { qualidade, semChave: false, salvo: !!salvo };
  }
  const qualidade = qualidadeDoNivel('precisao', atual);
  /* A chave: a que chegou agora, a deste navegador, ou a lembrada no servidor. Sem nenhuma, o modo
     fica local e a nuvem é a do plano (`sttQuality: cloud`), que não precisa de chave. */
  const cred = opcoes.credencial ?? lerCredencial();
  setSttQualityMirror(qualidade);
  if (cred) setProviderChoice({ mode: 'cloud', profileId: 'cloud-quality', credentialId: cred });
  avisar();
  const lembrada = cred ?? (await credencialDoServidor());
  if (!cred && lembrada) {
    setProviderChoice({ mode: 'cloud', profileId: 'cloud-quality', credentialId: lembrada });
    avisar();
  }
  const chave = cred ?? lembrada;
  const salvo = await patchUiSettings({
    sttQuality: qualidade,
    ...(chave ? { providerMode: 'cloud', credentialId: chave, credencialDaNuvem: chave } : {}),
  });
  return { qualidade, semChave: !chave, salvo: !!salvo };
}
