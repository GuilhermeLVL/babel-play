/**
 * O CLIENTE DO FEEDBACK DE IA (`POST /api/ai/feedback`): o 👍/👎 da explicação, do resumo, da Nuance e do iChat.
 *
 * Só listas fechadas (`src/core/feedbackDeIa.ts`): função, nota, motivo, modelo e nível. Nenhum texto da frase ou da
 * resposta sai daqui — o servidor recusaria (400), e o tipo nem tem onde pôr. Disparar e esquecer: NUNCA lança e a
 * tela não espera, porque avaliar não pode travar quem estuda nem virar mensagem de erro.
 */
import type { FeedbackDeIa } from '../core/feedbackDeIa';
import { apiFetch } from './funil';

export async function enviarFeedback(f: FeedbackDeIa): Promise<boolean> {
  try {
    const res = await apiFetch('/api/ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcao: f.funcao,
        nota: f.nota,
        ...(f.motivo ? { motivo: f.motivo } : {}),
        ...(f.modelo ? { modelo: f.modelo } : {}),
        ...(f.nivel ? { nivel: f.nivel } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
