/**
 * CONFERIR A TRANSCRIÇÃO ANTES DE LER A TRADUÇÃO (conversa-de-verdade, 5.4) — puro.
 *
 * No celular, o reconhecimento padrão (Whisper base q8) errou o português de um jeito constrangedor na auditoria
 * ("Minha vôminhe ensinou" virou "My vomiting taught when I was a kid.", CONV-04), e a bancada do conjunto de teste
 * repetiu os erros nas falas da auditoria ("vir o tinto", "vônia"). O Whisper small venceu no texto, mas o download
 * (252 MB contra 80) e a memória e a latência num celular de verdade dependem do dono e de um aparelho real
 * (`openspec/audits/2026-11-18-conversa-de-verdade/README.md`). Até lá vale a regra da spec: sem modelo que
 * atenda, a pessoa confere o que o app entendeu antes de a tradução ser lida — um toque lê, corrige ou descarta.
 *
 * Só onde o modelo falhou: o celular com o Whisper base, fora do inglês (o inglês saiu certo nas duas medições). A fala
 * que veio do reconhecedor do NAVEGADOR (Web Speech, o "Rápido") não passou pelo Whisper: é lida direto, mesmo que a
 * rota tenha o base como modelo local (ele nem roda nesse caso).
 */
import { baseLang } from '@core/texto/idioma';

import { WHISPER_MODELS } from '../../gateway/sttRouter';

export function conferirAntesDeLer(o: {
  /** O aparelho é um celular. */
  celular: boolean;
  /** O modelo LOCAL de transcrição desta conversa (o da rota); vazio = nenhum (a nuvem, o navegador). */
  modeloLocal: string;
  /** O idioma da fala (ISO-639-1 ou BCP-47). */
  idiomaDaFala: string;
  /** O motor que transcreveu ESTA fala (`SpeechSegment.engine`); ausente = o da rota. */
  motorDaFala?: string;
}): boolean {
  if (o.motorDaFala?.startsWith('web-speech')) return false;
  return o.celular && o.modeloLocal === WHISPER_MODELS.base && baseLang(o.idiomaDaFala || '') !== 'en';
}
