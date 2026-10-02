/**
 * VOZ DE NUVEM DO SITE ESTÁTICO (Pages Function, `/quest/tts`).
 *
 * O navegador do Meta Quest tem a API de voz (`speechSynthesis`) e NENHUMA voz instalada: o app mandava
 * ler a tradução do intérprete e nada tocava (relato do dono, 01/10/2026). Aqui o texto vira áudio no
 * Workers AI e volta como MP3; o aparelho só toca.
 *
 * QUEM FALA O QUÊ
 *   · MeloTTS (`@cf/myshell-ai/melotts`): inglês, espanhol, francês, chinês, japonês e coreano. É o
 *     modelo de voz barato do Workers AI (US$ 0,0002 por minuto de áudio em 01/10/2026). O Aura-2 soa
 *     melhor, mas custa US$ 0,03 por mil caracteres: uma conversa de dez minutos gastaria a franquia
 *     grátis do dia inteira.
 *   · O RESTO (o português entre eles) não existe no Workers AI. Com o segredo `DEEPINFRA_API_KEY` no
 *     Pages, vai ao Chatterbox Multilingual da DeepInfra, o mesmo modelo previsto para a edição com
 *     servidor (`server/ai/provedoresDeVoz.ts`). Sem o segredo, 422 `idioma_sem_voz`, e a tela mostra a
 *     tradução em texto. ANTES DE CRIAR O SEGREDO: conferir a retenção no contrato da DeepInfra
 *     (`docs/lgpd/operadores.md`) e citar a voz na política de privacidade.
 *
 * A mesma blindagem da transcrição (`stt.js`): só a própria origem, o ritmo por minuto, a cota do
 * visitante, o teto global e o freio da hora, e texto de no máximo `MAX_CARACTERES`. A voz soma pouco
 * na cota (`PESO_DA_VOZ`): custa uma fração do que custa transcrever o mesmo tempo de áudio. O custo é
 * RESERVADO antes de chamar o modelo e devolvido se ele falhar. Nada do texto nem do áudio é gravado,
 * e nenhum pedido leva áudio de referência (sem clonagem de voz).
 */
import { consultar, entrar, falhaDoModelo, json, mesmaOrigem } from './stt.js';

const MAX_CARACTERES = 600;
const MELO = '@cf/myshell-ai/melotts';
/**
 * O código que o MeloTTS espera por idioma. Os nomes do japonês e do coreano são os do projeto
 * (`JP`, `KR`), não os ISO; a segunda tentativa cobre o caso de o Workers AI aceitar o ISO.
 */
const IDIOMAS_DO_MELO = {
  en: ['en'],
  es: ['es'],
  fr: ['fr'],
  zh: ['zh'],
  ja: ['jp', 'ja'],
  ko: ['kr', 'ko'],
};
const CHATTERBOX = 'ResembleAI/chatterbox-multilingual';
const ENDPOINT_DA_DEEPINFRA = 'https://api.deepinfra.com/v1/openai/audio/speech';
/** Os idiomas da página do modelo (30/09/2026), os mesmos de `server/ai/provedoresDeVoz.ts`. */
const IDIOMAS_DO_CHATTERBOX = [
  'ar',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hi',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
  'sw',
  'tr',
  'zh',
];
/** A fala corre a uns 15 caracteres por segundo: é a duração que entra na cota. */
const CARACTERES_POR_SEGUNDO = 15;
/** Quanto um segundo de voz pesa na cota, frente a um segundo transcrito (a razão dos preços). */
const PESO_DA_VOZ = 0.4;
const PRAZO_DA_DEEPINFRA_MS = 12_000;
const TETO_DE_BYTES = 4 * 1024 * 1024;

const base = (codigo) => {
  const b = String(codigo || '')
    .toLowerCase()
    .split(/[-_]/)[0];
  return b === 'nb' || b === 'nn' ? 'no' : b;
};

const temChaveDaDeepInfra = (env) => String(env.DEEPINFRA_API_KEY || '').length >= 16;

/** Os idiomas que esta instalação lê em voz alta (o cliente pergunta uma vez, pelo GET). */
export function idiomasComVoz(env) {
  const lista = new Set(Object.keys(IDIOMAS_DO_MELO));
  if (temChaveDaDeepInfra(env)) for (const i of IDIOMAS_DO_CHATTERBOX) lista.add(i);
  return [...lista].sort();
}

function deBase64(texto) {
  const cru = texto.startsWith('data:') ? texto.slice(texto.indexOf(',') + 1) : texto;
  const binario = atob(cru.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * O que o Workers AI devolveu, em bytes. O binding responde de jeitos diferentes conforme o modelo e a
 * versão: `{ audio: <base64> }`, um `ReadableStream`, um `ArrayBuffer` ou um `Uint8Array`.
 */
export async function bytesDoAudio(r) {
  if (!r) return null;
  if (typeof r === 'string') return deBase64(r);
  if (typeof r.audio === 'string') return deBase64(r.audio);
  if (r instanceof Uint8Array) return r;
  if (r instanceof ArrayBuffer) return new Uint8Array(r);
  if (typeof r.getReader === 'function' || typeof r.arrayBuffer === 'function') {
    return new Uint8Array(await new Response(r).arrayBuffer());
  }
  return null;
}

async function pelaCloudflare(env, texto, idioma) {
  let ultimoErro = null;
  for (const codigo of IDIOMAS_DO_MELO[idioma]) {
    try {
      const bytes = await bytesDoAudio(await env.AI.run(MELO, { prompt: texto, lang: codigo }));
      if (bytes?.length) return { bytes, tipo: 'audio/mpeg', modelo: MELO };
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw ultimoErro ?? new Error('sem áudio');
}

async function pelaDeepInfra(env, texto, idioma, buscar = fetch) {
  /* Só estas chaves saem: texto, modelo, formato e idioma. Nenhum campo de voz de referência. */
  const r = await buscar(ENDPOINT_DA_DEEPINFRA, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.DEEPINFRA_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CHATTERBOX,
      input: texto,
      response_format: 'mp3',
      extra_body: { language: idioma },
    }),
    signal: AbortSignal.timeout(PRAZO_DA_DEEPINFRA_MS),
    redirect: 'manual',
  });
  if (!r.ok) throw new Error(`deepinfra ${r.status}`);
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bytes =
    tipo.startsWith('audio/') || tipo === 'application/octet-stream'
      ? new Uint8Array(await r.arrayBuffer())
      : await bytesDoAudio(await r.json().catch(() => null));
  if (!bytes?.length) throw new Error('deepinfra sem áudio');
  return { bytes, tipo: tipo.startsWith('audio/') ? tipo : 'audio/mpeg', modelo: CHATTERBOX };
}

/** Os idiomas com voz aqui e o que resta da cota (o cliente decide o que promete na tela). */
export async function onRequestGet({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  const c = await consultar(request, env);
  return c.recusa ?? json({ ok: true, idiomas: idiomasComVoz(env), restante: c.restante });
}

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
    const texto = String(corpo?.texto ?? '').trim();
    const idioma = base(corpo?.idioma);
    if (!texto || !idioma) return json({ code: 'formato' }, 400);
    if (texto.length > MAX_CARACTERES) return json({ code: 'longo_demais' }, 413);

    const daCloudflare = idioma in IDIOMAS_DO_MELO;
    const daDeepInfra = !daCloudflare && temChaveDaDeepInfra(env) && IDIOMAS_DO_CHATTERBOX.includes(idioma);
    if (!daCloudflare && !daDeepInfra) return json({ code: 'idioma_sem_voz', idioma }, 422);

    const recusa = await vez.reservar((texto.length / CARACTERES_POR_SEGUNDO) * PESO_DA_VOZ);
    if (recusa) return recusa;

    try {
      const audio = daCloudflare ? await pelaCloudflare(env, texto, idioma) : await pelaDeepInfra(env, texto, idioma);
      if (audio.bytes.length > TETO_DE_BYTES) return json({ code: 'falha_da_nuvem' }, 502);
      return new Response(audio.bytes, {
        status: 200,
        headers: {
          'content-type': audio.tipo,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-voz-modelo': audio.modelo,
        },
      });
    } catch (erro) {
      // Só conta o que virou áudio.
      vez.devolver();
      return falhaDoModelo(erro);
    }
  } finally {
    vez.sair();
  }
}
