/**
 * TRADUÇÃO DE NUVEM DO SITE ESTÁTICO (Pages Function, `/quest/mt`).
 *
 * No aparelho fraco o tradutor local (113 MB, uma thread) é a etapa que mais atrasa a legenda depois
 * da transcrição. Aqui o texto vai ao m2m100 do Workers AI. Normalmente a tradução já volta JUNTO com
 * a transcrição (`/quest/stt`, cabeçalho `x-traduzir-para`); esta rota serve o que sobra: uma frase
 * tocada de novo, um par que mudou no meio.
 *
 * A mesma blindagem da transcrição: só a própria origem, cota do visitante e teto global conferidos
 * (a tradução não soma segundos: custa centésimos do que custa o áudio), e texto de no máximo
 * `MAX_CARACTERES`. Nada é gravado.
 */
import { cotas, json, mesmaOrigem, recusaPorCota, traduzir } from './stt.js';

const MAX_CARACTERES = 600;

export async function onRequestPost({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  if (!mesmaOrigem(request)) return json({ code: 'origem' }, 403);
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ code: 'formato' }, 400);
  }
  const texto = String(corpo?.text ?? '').trim();
  const para = String(corpo?.tgt ?? '');
  const de = String(corpo?.src ?? '');
  if (!texto || !para) return json({ code: 'formato' }, 400);
  if (texto.length > MAX_CARACTERES) return json({ code: 'longo_demais' }, 413);

  const recusa = recusaPorCota(await cotas(request, env));
  if (recusa) return recusa;

  const inicio = Date.now();
  const traducao = await traduzir(env, texto, de, para);
  if (!traducao) return json({ code: 'falha_da_nuvem' }, 502);
  return json({ text: traducao, ms: Date.now() - inicio });
}
