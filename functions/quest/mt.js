/**
 * TRADUÇÃO DE NUVEM DO SITE ESTÁTICO (Pages Function, `/quest/mt`).
 *
 * No aparelho fraco o tradutor local (113 MB, uma thread) é a etapa que mais atrasa a legenda depois
 * da transcrição. Aqui o texto vai ao m2m100 do Workers AI. Normalmente a tradução já volta JUNTO com
 * a transcrição (`/quest/stt`, cabeçalho `x-traduzir-para`); esta rota serve o que sobra: uma frase
 * tocada de novo, um par que mudou no meio.
 *
 * A mesma blindagem da transcrição (`stt.js`): só a própria origem, o ritmo por minuto, a cota do
 * visitante, o teto global e o freio da hora, e texto de no máximo `MAX_CARACTERES`. Nada é gravado.
 *
 * A TRADUÇÃO CUSTA COTA. Antes ela só conferia a cota e nunca somava: com um segundo de saldo, dava
 * para traduzir sem limite. E não é de graça: o m2m100 cobra 31.050 neurônios por milhão de tokens,
 * na entrada e na saída, e o Whisper 46,63 por minuto de áudio (preços do Workers AI em 02/10/2026).
 * A ~4 caracteres por token, 100 caracteres (entrada + saída) custam o mesmo que 1 s de fala; nos
 * idiomas de token curto (chinês, japonês, árabe) custam mais. `CARACTERES_POR_SEGUNDO` fica em 60
 * para cobrir esses: uma frase de 60 letras e a tradução dela gastam 2 s da cota, e o texto máximo,
 * 20 s.
 */
import { CARACTERES_POR_SEGUNDO, entrar, json, mesmaOrigem, traduzir } from './stt.js';

const MAX_CARACTERES = 600;

export async function onRequestPost({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  if (!mesmaOrigem(request)) return json({ code: 'origem' }, 403);
  const vez = await entrar(request, env);
  if (vez.recusa) return vez.recusa;
  try {
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

    // Reserva pela estimativa (a saída do tamanho da entrada) e acerta com o que voltou.
    const recusa = await vez.reservar((2 * texto.length) / CARACTERES_POR_SEGUNDO);
    if (recusa) return recusa;

    const inicio = Date.now();
    const traducao = await traduzir(env, texto, de, para);
    if (!traducao) {
      vez.devolver();
      return json({ code: 'falha_da_nuvem' }, 502);
    }
    vez.acertar((texto.length + traducao.length) / CARACTERES_POR_SEGUNDO);
    return json({ text: traducao, ms: Date.now() - inicio });
  } finally {
    vez.sair();
  }
}
