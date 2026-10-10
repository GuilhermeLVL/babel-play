/**
 * "ESTE APARELHO TEM VOZ PARA ESTE IDIOMA?" — a pergunta que faltava ao Intérprete.
 *
 * O RELATO DO DONO (10/10/2026): "não consegui fazer com que a pronúncia do mandarim saísse". No
 * Windows sem o pacote de voz de chinês, o motor (`tts.ts`) faz o certo — não lê chinês com voz
 * inglesa — mas a tela continuava prometendo "é lida em voz alta" e "Voz do aparelho", com os botões
 * "Repetir" e "Parar voz" à mostra. A única pista era um aviso de cinco segundos, uma vez.
 *
 * `haVozPara` (`haVoz.ts`) responde "há ALGUMA voz no aparelho?" (o Quest não tem nenhuma). Aqui a
 * pergunta é por idioma, e tem três respostas: há, não há, e "ainda não sei" — a lista de vozes do
 * navegador chega atrasada (`vozesCarregadas`), e lista vazia não é falta de voz.
 */
import { useSyncExternalStore } from 'react';

import { t } from '../i18n';
import { langLabelNaUI } from '../languages';
import { aoMudarVozes, hasVoiceFor, isTtsSupported, vozesCarregadas } from '../tts';

/**
 * A lista de vozes do aparelho JÁ chegou e nenhuma é deste idioma (aceita `zh` ou `zh-CN`). Enquanto
 * a lista não chega, `false`: o navegador escolhe a voz pelo idioma, e pode haver uma.
 */
export function faltaVozNoAparelho(idioma: string): boolean {
  if (!idioma || !isTtsSupported() || !vozesCarregadas()) return false;
  return !hasVoiceFor(idioma);
}

/** Redesenha quem o usa quando a lista de vozes muda (a pessoa instalou a voz e voltou ao app). */
export function useVozesDoAparelho(): number {
  return useSyncExternalStore(
    aoMudarVozes,
    () => (isTtsSupported() ? window.speechSynthesis.getVoices().length : 0),
    () => 0,
  );
}

type Sistema = 'windows' | 'android' | 'ios' | 'mac' | 'outro';

function sistemaDoAparelho(agente: string): Sistema {
  if (/android/i.test(agente)) return 'android';
  if (/iphone|ipad|ipod/i.test(agente)) return 'ios';
  if (/windows/i.test(agente)) return 'windows';
  if (/macintosh|mac os x/i.test(agente)) return 'mac';
  return 'outro';
}

/**
 * O QUE HOUVE E O QUE FAZER, numa frase: "Este aparelho não tem voz em chinês" e o caminho para
 * instalar a voz NAQUELE sistema. Depois de instalar, o navegador precisa ser reaberto para ver a voz.
 */
export function comoInstalarVoz(
  idioma: string,
  agente: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): string {
  const nome = langLabelNaUI(idioma);
  const sistema = sistemaDoAparelho(agente);
  if (sistema === 'windows')
    return t(
      'Este aparelho não tem voz em {idioma}: a tradução fica em texto. Para ouvir, instale a voz no Windows em Configurações → Hora e idioma → Fala → Adicionar vozes, e reabra o navegador.',
      { idioma: nome },
    );
  if (sistema === 'android')
    return t(
      'Este aparelho não tem voz em {idioma}: a tradução fica em texto. Para ouvir, instale a voz no Android em Configurações → Sistema → Idiomas e entrada → Conversão de texto em voz → Instalar dados de voz.',
      { idioma: nome },
    );
  if (sistema === 'ios')
    return t(
      'Este aparelho não tem voz em {idioma}: a tradução fica em texto. Para ouvir, baixe a voz no iPhone ou iPad em Ajustes → Acessibilidade → Conteúdo Falado → Vozes.',
      { idioma: nome },
    );
  if (sistema === 'mac')
    return t(
      'Este aparelho não tem voz em {idioma}: a tradução fica em texto. Para ouvir, baixe a voz no Mac em Ajustes do Sistema → Acessibilidade → Conteúdo Falado → Voz do sistema → Gerenciar vozes.',
      { idioma: nome },
    );
  return t(
    'Este aparelho não tem voz em {idioma}: a tradução fica em texto. Para ouvir, instale uma voz desse idioma nas configurações de fala do sistema e reabra o navegador.',
    { idioma: nome },
  );
}
