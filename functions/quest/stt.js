/**
 * TRANSCRIÇÃO DE NUVEM DO SITE ESTÁTICO (Pages Function, `/quest/stt`).
 *
 * Nasceu para o Meta Quest (3 núcleos: o Whisper local leva de 9 a 16 s para 11 s de fala, medido em
 * 01/10/2026) e serve a todo aparelho fraco: o aparelho manda a FALA JÁ RECORTADA (um WAV por frase) e
 * recebe o texto do Whisper large-v3-turbo do Workers AI. É o padrão do mercado em óculos e headsets
 * (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`).
 *
 * BLINDAGEM (o site não tem conta, então o limite é contado AQUI, por endereço de rede):
 *   1. cota do dia por IP (`COTA_POR_IP_S`): aba anônima, outro navegador e limpar dados não adiantam;
 *   2. teto global do dia (`TETO_GLOBAL_S`): VPN e troca de IP gastam, no máximo, o que é de todos;
 *   3. por pedido: só WAV, no máximo `MAX_SEGUNDOS` de fala — não vira transcritor de arquivo longo;
 *   4. só a própria origem chama.
 * Estourou qualquer cota: 429, e o aparelho volta sozinho ao modelo local (`PausaDaNuvem`).
 *
 * O IP não é guardado: a chave é um hash dele com a data (muda todo dia), e some em 2 dias.
 *
 * CONTAGEM PROBABILÍSTICA. O KV gratuito aceita 1.000 escritas por dia; uma escrita por fala esgotaria
 * isso com meia dúzia de pessoas. Cada fala de `d` segundos soma um BLOCO de 60 s com probabilidade
 * `d/60`: o valor esperado é exato e as escritas caem para ~1 por minuto de áudio. O erro num dia de
 * 15 min é de poucos minutos, para mais ou para menos — aceitável para uma amostra grátis.
 *
 * Privacidade: nada do áudio nem do texto é gravado, e a Cloudflare não usa o conteúdo do Workers AI
 * para treinar. O cliente só chama com o consentimento de nuvem dado (`nuvemDoQuest.ts`).
 */
const MODELO = '@cf/openai/whisper-large-v3-turbo';
/** Uma fala da captura tem no máximo 12 s; a folga cobre o pré-rolo do detector de fala. */
const MAX_SEGUNDOS = 16;
const TETO_DE_BYTES = 1_100_000;
/** A amostra grátis: 15 minutos de fala por dia, por endereço de rede. */
const COTA_POR_IP_S = 15 * 60;
/** Logo abaixo da franquia diária gratuita do Workers AI (~214 min): o site nunca passa dela. */
const TETO_GLOBAL_S = 200 * 60;
const BLOCO_S = 60;
const DOIS_DIAS_S = 2 * 24 * 60 * 60;

export const json = (corpo, status = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabecalhos },
  });

/** Só o próprio site chama: sem `Origin` igual ao host, recusa (não é API pública). */
export function mesmaOrigem(request) {
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

/** Duração de um WAV PCM pelo cabeçalho; `null` se não for WAV (o único formato aceito). */
export function segundosDoWav(bytes) {
  if (bytes.length < 44) return null;
  const texto = (i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (texto(0) !== 'RIFF' || texto(8) !== 'WAVE') return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPorSegundo = v.getUint32(28, true);
  if (!bytesPorSegundo) return null;
  return (bytes.length - 44) / bytesPorSegundo;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/** Segundos até a meia-noite UTC, quando as cotas zeram. */
function segundosAteVirarODia() {
  const agora = new Date();
  const amanha = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 1);
  return Math.max(60, Math.ceil((amanha - agora.getTime()) / 1000));
}

/** A chave do visitante no dia: hash do IP com a data. O IP em si nunca é gravado. */
export async function chaveDoVisitante(request, dia) {
  const ip = request.headers.get('cf-connecting-ip') || 'sem-ip';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${dia}|${ip}|babel-play`));
  const hex = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ip:${dia}:${hex}`;
}

async function lerSegundos(kv, chave) {
  const v = Number(await kv.get(chave));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Soma `segundos` em blocos de 60 s, com probabilidade proporcional (ver o cabeçalho). */
async function somar(kv, chave, atual, segundos, sorteio = Math.random) {
  const inteiros = Math.floor(segundos / BLOCO_S);
  const resto = (segundos % BLOCO_S) / BLOCO_S;
  const blocos = inteiros + (sorteio() < resto ? 1 : 0);
  if (blocos > 0) await kv.put(chave, String(atual + blocos * BLOCO_S), { expirationTtl: DOIS_DIAS_S });
}

/**
 * A CHAVE DE DONO: o cabeçalho `x-chave-do-dono` igual ao segredo `CHAVE_DO_DONO` do Pages tira o
 * pedido da cota POR VISITANTE (o dono testando no próprio aparelho). O teto global continua valendo.
 * Sem o segredo configurado (ou curto demais), ninguém é dono.
 */
function ehODono(request, env) {
  const segredo = String(env.CHAVE_DO_DONO || '');
  const dada = request.headers.get('x-chave-do-dono') || '';
  if (segredo.length < 16 || dada.length !== segredo.length) return false;
  let diferenca = 0;
  for (let i = 0; i < segredo.length; i++) diferenca |= segredo.charCodeAt(i) ^ dada.charCodeAt(i);
  return diferenca === 0;
}

/** O estado das cotas deste visitante, hoje. Sem KV configurado, a nuvem fica FECHADA. */
export async function cotas(request, env) {
  const dia = hoje();
  const chaveIp = await chaveDoVisitante(request, dia);
  const chaveTotal = `total:${dia}`;
  const [usadoIp, usadoTotal] = await Promise.all([
    lerSegundos(env.LIMITES, chaveIp),
    lerSegundos(env.LIMITES, chaveTotal),
  ]);
  const dono = ehODono(request, env);
  return {
    chaveIp,
    chaveTotal,
    usadoIp: dono ? 0 : usadoIp,
    usadoTotal,
    dono,
    restante: dono ? COTA_POR_IP_S : Math.max(0, COTA_POR_IP_S - usadoIp),
  };
}

export function recusaPorCota(c) {
  const espera = String(segundosAteVirarODia());
  if (c.usadoTotal >= TETO_GLOBAL_S) return json({ code: 'cota_do_site', restante: 0 }, 429, { 'retry-after': espera });
  if (c.usadoIp >= COTA_POR_IP_S) return json({ code: 'cota_do_dia', restante: 0 }, 429, { 'retry-after': espera });
  return null;
}

const TRADUTOR = '@cf/meta/m2m100-1.2b';
/** O m2m100 do Workers AI pede o nome do idioma em inglês. */
const NOME_DO_IDIOMA = {
  pt: 'portuguese',
  en: 'english',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  it: 'italian',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  ru: 'russian',
  ar: 'arabic',
  hi: 'hindi',
  nl: 'dutch',
  pl: 'polish',
  tr: 'turkish',
  sv: 'swedish',
  uk: 'ukrainian',
  he: 'hebrew',
  id: 'indonesian',
  vi: 'vietnamese',
  th: 'thai',
  el: 'greek',
  cs: 'czech',
  ro: 'romanian',
  hu: 'hungarian',
  fi: 'finnish',
  da: 'danish',
  no: 'norwegian',
  ca: 'catalan',
};
const base = (codigo) =>
  String(codigo || '')
    .toLowerCase()
    .split('-')[0];

/** Traduz `texto` de `de` para `para` (códigos ISO). `null` se não deu: o aparelho traduz sozinho. */
export async function traduzir(env, texto, de, para) {
  const origem = NOME_DO_IDIOMA[base(de)];
  const destino = NOME_DO_IDIOMA[base(para)];
  if (!origem || !destino || origem === destino) return null;
  try {
    const r = await env.AI.run(TRADUTOR, { text: texto, source_lang: origem, target_lang: destino });
    const traducao = String(r?.translated_text ?? '').trim();
    return traducao || null;
  } catch {
    return null;
  }
}

/** A nuvem existe e este visitante ainda tem cota? (o cliente pergunta antes de escolher a rota). */
export async function onRequestGet({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  const c = await cotas(request, env);
  return recusaPorCota(c) ?? json({ ok: true, restante: c.restante, cota: COTA_POR_IP_S });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  if (!mesmaOrigem(request)) return json({ code: 'origem' }, 403);
  if (Number(request.headers.get('content-length') || 0) > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);
  const segundos = segundosDoWav(bytes);
  if (segundos == null || segundos <= 0) return json({ code: 'formato' }, 400);
  if (segundos > MAX_SEGUNDOS) return json({ code: 'longo_demais' }, 413);

  const c = await cotas(request, env);
  const recusa = recusaPorCota(c);
  if (recusa) return recusa;

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
    // Só conta o que foi transcrito de verdade.
    await Promise.all([
      c.dono ? null : somar(env.LIMITES, c.chaveIp, c.usadoIp, segundos),
      somar(env.LIMITES, c.chaveTotal, c.usadoTotal, segundos),
    ]);
    const texto = String(r?.text ?? r?.transcription_info?.text ?? '').trim();
    const idiomaDaFala = String(r?.transcription_info?.language ?? r?.language ?? '') || idioma;
    const ms = Date.now() - inicio;
    /* A TRADUÇÃO NA MESMA VIAGEM (`x-traduzir-para`): o aparelho fraco não paga o tradutor local, e a
       legenda traduzida chega junto com a transcrição, sem uma segunda ida à rede. */
    const para = base(request.headers.get('x-traduzir-para'));
    const inicioDaTraducao = Date.now();
    const translation = texto && para ? await traduzir(env, texto, idiomaDaFala, para) : null;
    return json({
      text: texto,
      language: idiomaDaFala,
      ms,
      ...(translation ? { translation, msTraducao: Date.now() - inicioDaTraducao } : {}),
      segundos: Math.round(segundos * 10) / 10,
      restante: c.dono ? c.restante : Math.max(0, c.restante - Math.round(segundos)),
    });
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro).slice(0, 200);
    // Cota do dia do Workers AI, limite de taxa ou falta de capacidade: o cliente pausa a nuvem.
    const ocupada = /limit|quota|capacity|allocation|neurons|429|3036|3040/i.test(mensagem);
    return json(
      { code: ocupada ? 'nuvem_ocupada' : 'falha_da_nuvem', erro: mensagem },
      ocupada ? 429 : 502,
      ocupada ? { 'retry-after': '600' } : {},
    );
  }
}
