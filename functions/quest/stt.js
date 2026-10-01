/**
 * TRANSCRIÇÃO DE NUVEM DO META QUEST (Pages Function, `/quest/stt`).
 *
 * O Quest dá 3 núcleos ao navegador: o Whisper local leva de 9 a 16 s para 11 s de fala (medido em
 * 01/10/2026, `/diagnostico`). Aqui o headset manda a FALA JÁ RECORTADA (um WAV por frase) e recebe o
 * texto do Whisper large-v3-turbo do Workers AI. Padrão do mercado em óculos e headsets: o aparelho
 * capta e exibe, a nuvem transcreve (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`).
 *
 * Privacidade: nada é gravado aqui (sem KV, sem log do corpo), e a Cloudflare não usa o conteúdo do
 * Workers AI para treinar. O cliente só chama com o consentimento de nuvem dado (`nuvemDoQuest.ts`).
 * Custo: US$ 0,0005 por minuto de áudio; a cota grátis do dia (~214 min) é o teto — estourou, responde
 * 429 e o headset volta ao modelo local sozinho (`PausaDaNuvem`).
 */
const MODELO = '@cf/openai/whisper-large-v3-turbo';
/** ~60 s de WAV 16 kHz mono; uma fala da captura tem no máximo 12 s. */
const TETO_DE_BYTES = 2_000_000;

const json = (corpo, status = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabecalhos },
  });

/** Só o próprio site chama: sem `Origin` igual ao host, recusa (não é API pública). */
function mesmaOrigem(request) {
  const origem = request.headers.get('origin');
  if (!origem) return false;
  try {
    return new URL(origem).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function paraBase64(bytes) {
  let binario = '';
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) binario += String.fromCharCode(...bytes.subarray(i, i + PEDACO));
  return btoa(binario);
}

/** A nuvem existe? (o cliente pergunta antes de escolher a rota). */
export async function onRequestGet({ env }) {
  return env.AI ? json({ ok: true }) : json({ code: 'sem_ia' }, 501);
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ code: 'sem_ia' }, 501);
  if (!mesmaOrigem(request)) return json({ code: 'origem' }, 403);
  if (Number(request.headers.get('content-length') || 0) > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return json({ code: 'vazio' }, 400);
  if (bytes.length > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);

  const idioma = (request.headers.get('x-language') || '').toLowerCase().split('-')[0].slice(0, 3);
  let contexto = '';
  try {
    contexto = decodeURIComponent(request.headers.get('x-stt-prompt') || '').slice(0, 224);
  } catch {
    /* cabeçalho malformado: segue sem contexto */
  }
  const inicio = Date.now();
  try {
    const r = await env.AI.run(MODELO, {
      audio: paraBase64(bytes),
      task: 'transcribe',
      ...(idioma ? { language: idioma } : {}),
      ...(contexto ? { initial_prompt: contexto } : {}),
    });
    return json({
      text: String(r?.text ?? r?.transcription_info?.text ?? '').trim(),
      language: String(r?.transcription_info?.language ?? r?.language ?? ''),
      ms: Date.now() - inicio,
    });
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro).slice(0, 200);
    // Cota do dia, limite de taxa ou falta de capacidade: o cliente pausa a nuvem e segue no aparelho.
    const ocupada = /limit|quota|capacity|allocation|neurons|429|3036|3040/i.test(mensagem);
    return json(
      { code: ocupada ? 'nuvem_ocupada' : 'falha_da_nuvem', erro: mensagem },
      ocupada ? 429 : 502,
      ocupada ? { 'retry-after': '600' } : {},
    );
  }
}
