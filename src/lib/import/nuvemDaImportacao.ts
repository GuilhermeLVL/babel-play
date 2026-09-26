/**
 * A IMPORTAÇÃO TRANSCREVE NA NUVEM? — a MESMA régua da captura ao vivo, aplicada ao arquivo.
 *
 * Antes a importação era sempre local (57% de WER em português) mesmo para quem paga pela nuvem
 * (24%; docs/PROXIMOS-PASSOS.md, D4). As condições são as da captura, uma por uma:
 *  - ROTA: `routeStt` com a preferência "Qualidade da transcrição", o idioma e a disponibilidade
 *    da nuvem no servidor — inglês no "auto" continua local, "rápido"/"preciso" continuam locais,
 *    o perfil Privado/Local nunca vai à nuvem;
 *  - CONSENTIMENTO de nuvem de Ajustes → Privacidade (desligado por padrão; o app é aberto a
 *    menores): sem o "sim", nada sai do aparelho;
 *  - PLANO: a nuvem GERENCIADA (a chave do dono do serviço) só com `managedCloudStt`. A chave
 *    PRÓPRIA (BYOK, binding com `credentialId`) é sempre livre, como no resto do app;
 *  - BINDING: o perfil ativo precisa ter o `groq-whisper`.
 */
import type { CapabilityBinding } from '@core';

import { apiFetch } from '../../data/api';
import { getActiveProfile } from '../../gateway/activeProfile';
import { temAdaptadorWebGpu } from '../../gateway/adaptadorWebGpu';
import { GroqWhisperStt } from '../../gateway/adapters/groqWhisper';
import type { MotorDeNuvem } from '../../gateway/offlineTranscribe';
import { getSttQuality, routeStt, type SttRoute } from '../../gateway/sttRouter';
import { consentiuNuvem } from '../consentimentoDeNuvem';
import { getEntitlements } from '../entitlements';

export function importacaoVaiANuvem(i: {
  managedCloudStt: boolean;
  consentiu: boolean;
  rota: SttRoute;
  binding: Pick<CapabilityBinding, 'adapterId' | 'credentialId'> | undefined;
}): boolean {
  if (!i.consentiu || !i.rota.preferCloud || !i.binding) return false;
  return i.managedCloudStt || !!i.binding.credentialId;
}

/** O motor de nuvem para transcrever esta importação, ou `null` (local). Nunca lança. */
export async function motorDeNuvemDaImportacao(idioma: string | undefined): Promise<MotorDeNuvem | null> {
  try {
    const perfil = getActiveProfile();
    const binding = (perfil.bindings.stt ?? []).find((b) => b.adapterId === 'groq-whisper');
    const consentiu = consentiuNuvem();
    // Sem binding ou sem consentimento, nem pergunta ao servidor.
    if (!binding || !consentiu) return null;
    const cloudAvailable = await apiFetch('/api/ai/stt/available')
      .then((r) => r.ok)
      .catch(() => false);
    const rota = routeStt({
      contentLang: (idioma || '').split('-')[0],
      autoDetect: !idioma,
      quality: getSttQuality(),
      hasWebGpu: await temAdaptadorWebGpu(),
      cloudAvailable,
      profileId: perfil.id,
    });
    const vai = importacaoVaiANuvem({ managedCloudStt: getEntitlements().managedCloudStt, consentiu, rota, binding });
    return vai
      ? new GroqWhisperStt({ model: binding.model ?? 'whisper-large-v3-turbo', credentialId: binding.credentialId })
      : null;
  } catch {
    return null;
  }
}
