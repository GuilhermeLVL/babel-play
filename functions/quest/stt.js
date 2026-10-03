/**
 * TRANSCRIÇÃO DE NUVEM DO SITE ESTÁTICO (Pages Function, `/quest/stt`).
 *
 * Nasceu para o Meta Quest (3 núcleos: o Whisper local leva de 9 a 16 s para 11 s de fala, medido em
 * 01/10/2026) e serve a todo aparelho fraco: o aparelho manda a FALA JÁ RECORTADA (um WAV por frase) e
 * recebe o texto do Whisper large-v3-turbo do Workers AI. É o padrão do mercado em óculos e headsets
 * (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`).
 *
 * Este arquivo é também a casa da COTA das três funções (`stt`, `mt`, `tts`): todas contam no mesmo
 * contador de segundos, por `entrar` → `reservar` → `acertar`/`devolver` → `sair`.
 *
 * BLINDAGEM (o site não tem conta, então o limite é contado AQUI, por endereço de rede):
 *   1. cota do dia por visitante (`COTA_POR_IP_S`): aba anônima, outro navegador e limpar dados não
 *      adiantam. No IPv6 o visitante é o prefixo /64 (a rede da casa), não o endereço: trocar o sufixo,
 *      que o próprio aparelho faz sozinho, não dá cota nova;
 *   2. teto global do dia (`TETO_GLOBAL_S`): VPN e troca de IP gastam, no máximo, o que é de todos;
 *   3. freio global da hora (`TETO_POR_HORA_S`): o teto do dia não é queimado de uma vez. Quem gasta a
 *      hora inteira deixa a nuvem fora até a hora virar, não até amanhã;
 *   4. ritmo por visitante, por minuto (`PEDIDOS_POR_MINUTO`, `SEGUNDOS_POR_MINUTO`, `SIMULTANEOS`):
 *      um script não gasta os 15 minutos em segundos;
 *   5. por pedido: só WAV, no máximo `MAX_SEGUNDOS` de fala — não vira transcritor de arquivo longo.
 * As recusas: 429 `cota_do_dia` e `cota_do_site` (acabou por hoje), 429 `devagar` (ritmo: tente de novo
 * depois do `Retry-After`, de 1 a 60 s) e 429 `nuvem_ocupada` (a hora cheia, o contador sem gravar ou o
 * Workers AI no limite: a nuvem volta sozinha). Em todas o aparelho segue no modelo local
 * (`PausaDaNuvem`).
 *
 * O IP não é guardado: a chave é um hash dele com a data (muda todo dia), e some em 2 dias.
 *
 * COMO SE CONTA. O KV é o que o plano grátis do Pages dá, e ele NÃO soma de forma atômica: é ler,
 * somar e gravar, com 1.000 escritas por dia, uma escrita por segundo por chave e até um minuto para
 * uma escrita aparecer em outra borda. Então a conta tem duas camadas:
 *   · a MEMÓRIA DO ISOLATE, exata e imediata: cada pedido confere e RESERVA o seu custo num passo só
 *     (sem `await` no meio), ANTES de chamar o modelo; se o modelo falha, a reserva volta. Rajada de
 *     pedidos simultâneos que cai no mesmo isolate não passa do teto. O ritmo por minuto e os pedidos
 *     em curso moram só aqui;
 *   · o KV, o que liga os isolates e as bordas: a cada `BLOCO_S` acumulados numa chave o valor exato
 *     vai para lá (também antes do modelo). Sai ~1 escrita por minuto de fala por chave, e a leitura
 *     nunca faz a conta andar para trás (vale o maior entre o lido e o que este isolate já viu).
 * Sem conseguir gravar (`SEM_GRAVAR_MAX_S` acumulados), a nuvem FECHA: nunca segue sem contar.
 *
 * O QUE CONTINUA APROXIMADO (e só um Durable Object, ou uma regra de rate limit na borda, resolve):
 *   · a memória é POR ISOLATE. A Cloudflare sobe vários por borda e há centenas de bordas: uma rajada
 *     espalhada por K isolates passa até K vezes o limite por minuto, e K vezes o que restava do dia
 *     até o bloco de cada um chegar ao KV;
 *   · até `BLOCO_S` por chave vivem só na memória: isolate reciclado antes de gravar perde esse resto
 *     (sempre a favor do visitante, nunca contra);
 *   · dois isolates gravando a mesma chave ao mesmo tempo: a última escrita vence e um bloco se perde;
 *   · nada aqui segura um ataque de muitos endereços: ele gasta o teto da hora e a nuvem cai para
 *     todos até a hora virar. O teto de PEDIDOS do Pages (100 mil por dia no plano grátis) também não
 *     é defendido daqui: a função já rodou quando recusa.
 * A cota é o teto de uma amostra grátis, não um controle de abuso.
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
/**
 * Uma hora de fala por hora de relógio, somados todos os visitantes: quatro pessoas usando a cota
 * inteira na mesma hora cabem, e o teto do dia leva no mínimo 3 h 20 para acabar.
 */
const TETO_POR_HORA_S = 60 * 60;
/** O KV recebe o valor a cada bloco acumulado: ~1 escrita por minuto de fala por chave. */
const BLOCO_S = 60;
/** Com isto acumulado numa chave sem o KV aceitar a escrita, a nuvem fecha. */
const SEM_GRAVAR_MAX_S = 2 * BLOCO_S;
/** Todo pedido aceito custa ao menos isto: mil pedidos de duas letras não saem de graça. */
const CUSTO_MINIMO_S = 0.5;
/** Caracteres (entrada + saída da tradução) que valem um segundo da cota de fala; `mt.js` usa o mesmo. */
export const CARACTERES_POR_SEGUNDO = 60;
const DOIS_DIAS_S = 2 * 24 * 60 * 60;

/* O RITMO POR VISITANTE. Uso real: uma fala a cada 3 a 5 s, mais a voz da tradução e, às vezes, uma
   tradução avulsa — uns 30 a 40 pedidos e até 60 s de custo por minuto. Os tetos ficam no dobro. */
const MINUTO_MS = 60_000;
const PEDIDOS_POR_MINUTO = 60;
/** Dois minutos de custo por minuto: duas fontes ao vivo (microfone e aba), ou uma fila atrasada. */
const SEGUNDOS_POR_MINUTO = 120;
/** Em curso ao mesmo tempo: duas transcrições, uma voz e uma tradução. */
const SIMULTANEOS = 4;
/** O GET só lê; quem pergunta é a tela, uma vez por abertura. */
const CONSULTAS_POR_MINUTO = 30;
const VISITANTES_NA_MEMORIA = 5000;

export const json = (corpo, status = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabecalhos },
  });

/* ───────────────────────────── a origem ───────────────────────────── */

const mesmoHost = (origem, request) => {
  try {
    return new URL(origem).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

/**
 * O POST veio de uma página DESTE site?
 *
 * ISTO NÃO É CONTROLE DE ABUSO. `Origin` e `Sec-Fetch-Site` são cabeçalhos que o NAVEGADOR preenche e a
 * página não consegue forjar; fora do navegador (curl, script) qualquer um escreve o que quiser. O que
 * a conferência garante é só que OUTRO SITE, aberto no navegador de um visitante, não use a nuvem na
 * cota dele. Quem segura script é a cota e o ritmo, acima.
 *
 * Todo navegador manda `Origin` num POST; `Sec-Fetch-Site`, quando veio, tem de dizer `same-origin`.
 */
export function mesmaOrigem(request) {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return false;
  const origem = request.headers.get('origin');
  return !!origem && mesmoHost(origem, request);
}

/**
 * O GET (que revela o que resta da cota e os idiomas com voz) veio deste site? Mesma ressalva de
 * `mesmaOrigem`: barra outro site no navegador, não um script.
 *
 * Num GET da própria origem o navegador NÃO manda `Origin`; manda `Sec-Fetch-Site: same-origin`
 * (Chrome 76, Firefox 90, Safari 16.4). `none` é a pessoa abrindo o endereço à mão. Navegador antigo
 * não manda nenhum dos dois, e aí passa: recusar tiraria a nuvem de quem tem Safari velho.
 */
export function consultaDaMesmaOrigem(request) {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio) return sitio === 'same-origin' || sitio === 'none';
  const origem = request.headers.get('origin');
  return !origem || mesmoHost(origem, request);
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

/* ───────────────────────────── a cota ───────────────────────────── */

const hoje = () => new Date().toISOString().slice(0, 10);
/** `2026-10-02T15`: a hora do relógio, em UTC, que o freio da hora conta. */
const estaHora = () => new Date().toISOString().slice(0, 13);

/** Segundos até a meia-noite UTC, quando as cotas zeram. */
function segundosAteVirarODia() {
  const agora = new Date();
  const amanha = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 1);
  return Math.max(60, Math.ceil((amanha - agora.getTime()) / 1000));
}

function segundosAteVirarAHora() {
  return Math.max(60, Math.ceil((3_600_000 - (Date.now() % 3_600_000)) / 1000));
}

/**
 * De quem é a cota: o endereço IPv4 inteiro; no IPv6, o prefixo /64. Um /64 é a rede de UMA casa, e o
 * aparelho troca os 64 bits finais sozinho (endereço temporário): contar pelo endereço daria cota nova
 * a cada troca, e a quem quisesse, 2^64 cotas.
 */
function redeDoVisitante(ip) {
  if (!ip.includes(':') || ip.includes('.')) return ip;
  const [cabeca, cauda = ''] = ip.toLowerCase().split('::');
  const inicio = cabeca ? cabeca.split(':') : [];
  const fim = cauda ? cauda.split(':') : [];
  const grupos = ip.includes('::')
    ? [...inicio, ...Array(Math.max(0, 8 - inicio.length - fim.length)).fill('0'), ...fim]
    : inicio;
  return `${grupos
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** A chave do visitante no dia: hash do IP (ou do /64) com a data. O IP em si nunca é gravado. */
export async function chaveDoVisitante(request, dia) {
  const ip = redeDoVisitante(request.headers.get('cf-connecting-ip') || 'sem-ip');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${dia}|${ip}|babel-play`));
  const hex = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ip:${dia}:${hex}`;
}

/* A MEMÓRIA DO ISOLATE (ver o cabeçalho). Some quando o isolate é reciclado; o KV é o que fica. */
/** chave do KV → `{ gravado, pendente, gravando }`. O usado é `gravado + pendente`. */
const contadores = new Map();
/** chave do visitante → `{ emCurso, pedidos: [{ t, s }], consultas: [t] }`. */
const ritmos = new Map();
let diaDaMemoria = '';

/** Só para os testes: um isolate novo. */
export function _reiniciarMemoriaDaCota() {
  contadores.clear();
  ritmos.clear();
  diaDaMemoria = '';
}

/** Virou o dia: as chaves de ontem não servem mais. Memória cheia: saem os visitantes mais antigos. */
function arrumarMemoria(dia) {
  if (dia !== diaDaMemoria) {
    contadores.clear();
    ritmos.clear();
    diaDaMemoria = dia;
    return;
  }
  if (ritmos.size <= VISITANTES_NA_MEMORIA) return;
  for (const [chave, r] of ritmos) {
    if (ritmos.size <= VISITANTES_NA_MEMORIA * 0.8) break;
    if (r.emCurso > 0) continue;
    ritmos.delete(chave);
    if (!contadores.get(chave)?.gravando) contadores.delete(chave);
  }
}

function contadorDe(chave) {
  let c = contadores.get(chave);
  if (!c) contadores.set(chave, (c = { gravado: 0, pendente: 0, gravando: false }));
  return c;
}

function ritmoDe(chave) {
  let r = ritmos.get(chave);
  if (!r) ritmos.set(chave, (r = { emCurso: 0, pedidos: [], consultas: [] }));
  return r;
}

const usado = (c) => Math.max(0, c.gravado + c.pendente);

/** Lê a chave no KV e junta com a memória. Leitura velha (outra borda, cache) não baixa a conta. */
async function contadorEmDia(kv, chave) {
  const lido = Number(await kv.get(chave));
  const c = contadorDe(chave);
  if (Number.isFinite(lido) && lido > c.gravado) c.gravado = lido;
  return c;
}

/**
 * Leva ao KV o que a chave acumulou, se já deu um bloco. Devolve `false` só quando tentou e o KV não
 * aceitou (limite de escritas, 1 escrita por segundo na mesma chave): o acumulado fica na memória e a
 * próxima tenta de novo. Uma gravação por chave de cada vez neste isolate.
 */
async function gravar(kv, chave, c) {
  if (c.pendente < BLOCO_S || c.gravando) return true;
  c.gravando = true;
  const parte = c.pendente;
  const valor = Math.round(c.gravado + parte);
  try {
    await kv.put(chave, String(valor), { expirationTtl: DOIS_DIAS_S });
    c.pendente -= parte;
    c.gravado = Math.max(c.gravado, valor);
    return true;
  } catch {
    return false;
  } finally {
    c.gravando = false;
  }
}

/**
 * A CHAVE DE DONO: o cabeçalho `x-chave-do-dono` igual ao segredo `CHAVE_DO_DONO` do Pages tira o
 * pedido da cota e do ritmo POR VISITANTE (o dono testando no próprio aparelho). O teto global e o
 * freio da hora continuam valendo. Sem o segredo configurado (ou curto demais), ninguém é dono.
 */
function ehODono(request, env) {
  const segredo = String(env.CHAVE_DO_DONO || '');
  const dada = request.headers.get('x-chave-do-dono') || '';
  if (segredo.length < 16 || dada.length !== segredo.length) return false;
  let diferenca = 0;
  for (let i = 0; i < segredo.length; i++) diferenca |= segredo.charCodeAt(i) ^ dada.charCodeAt(i);
  return diferenca === 0;
}

async function estadoDasCotas(env, chaveIp, dono) {
  const chaveTotal = `total:${hoje()}`;
  const chaveHora = `hora:${estaHora()}`;
  const [ip, total, hora] = await Promise.all([
    contadorEmDia(env.LIMITES, chaveIp),
    contadorEmDia(env.LIMITES, chaveTotal),
    contadorEmDia(env.LIMITES, chaveHora),
  ]);
  const usadoIp = dono ? 0 : usado(ip);
  return {
    chaveIp,
    chaveTotal,
    chaveHora,
    usadoIp,
    usadoTotal: usado(total),
    usadoHora: usado(hora),
    dono,
    restante: Math.max(0, COTA_POR_IP_S - usadoIp),
  };
}

/** O estado das cotas deste visitante, hoje. Sem KV configurado, a nuvem fica FECHADA. */
export async function cotas(request, env) {
  return estadoDasCotas(env, await chaveDoVisitante(request, hoje()), ehODono(request, env));
}

export function recusaPorCota(c) {
  const espera = String(segundosAteVirarODia());
  if (c.usadoTotal >= TETO_GLOBAL_S) return json({ code: 'cota_do_site', restante: 0 }, 429, { 'retry-after': espera });
  if (c.usadoIp >= COTA_POR_IP_S) return json({ code: 'cota_do_dia', restante: 0 }, 429, { 'retry-after': espera });
  return null;
}

/** A hora está cheia: a nuvem volta quando ela virar. O cliente trata como nuvem ocupada, não como fim do dia. */
function recusaPorHora(c) {
  if (c.usadoHora < TETO_POR_HORA_S) return null;
  return json({ code: 'nuvem_ocupada', motivo: 'teto_da_hora' }, 429, {
    'retry-after': String(segundosAteVirarAHora()),
  });
}

/** 429 `devagar`: é o RITMO, não a cota. O cliente tenta de novo depois da espera. */
const devagar = (ms) =>
  json({ code: 'devagar' }, 429, { 'retry-after': String(Math.min(60, Math.max(1, Math.ceil(ms / 1000)))) });

const semOsVelhos = (lista, agora, instante = (x) => x) => {
  while (lista.length && instante(lista[0]) <= agora - MINUTO_MS) lista.shift();
  return lista;
};

/** Pedidos em curso e pedidos no último minuto. Só memória: recusa sem ler o KV. */
function recusaPorPedidos(r, agora) {
  if (r.emCurso >= SIMULTANEOS) return devagar(1000);
  const pedidos = semOsVelhos(r.pedidos, agora, (p) => p.t);
  if (pedidos.length >= PEDIDOS_POR_MINUTO) return devagar(pedidos[0].t + MINUTO_MS - agora);
  return null;
}

/** O custo do último minuto mais o deste pedido passa do teto? A espera é até caber. */
function recusaPorSegundos(r, agora, custo) {
  const pedidos = semOsVelhos(r.pedidos, agora, (p) => p.t);
  let sobra = pedidos.reduce((soma, p) => soma + p.s, 0) + custo - SEGUNDOS_POR_MINUTO;
  if (sobra <= 0) return null;
  for (const p of pedidos) {
    sobra -= p.s;
    if (sobra <= 0) return devagar(p.t + MINUTO_MS - agora);
  }
  return devagar(MINUTO_MS);
}

/**
 * A VEZ de um pedido que custa (POST). Quem chama:
 *
 *   const vez = await entrar(request, env);
 *   if (vez.recusa) return vez.recusa;
 *   try {
 *     const recusa = await vez.reservar(custo);   // confere tudo e reserva, ANTES do modelo
 *     if (recusa) return recusa;
 *     …modelo…                                    // falhou: vez.devolver()
 *     vez.acertar(custoReal);                     // só se o custo real difere do reservado
 *   } finally {
 *     vez.sair();
 *   }
 *
 * `entrar` conta o pedido no ritmo do visitante (mesmo que ele acabe recusado por formato) sem ler o
 * KV: lixo em rajada custa só a memória.
 */
export async function entrar(request, env) {
  const dia = hoje();
  const chaveIp = await chaveDoVisitante(request, dia);
  arrumarMemoria(dia);
  const dono = ehODono(request, env);
  const r = ritmoDe(chaveIp);
  const marca = { t: Date.now(), s: 0 };
  if (!dono) {
    const recusa = recusaPorPedidos(r, marca.t);
    if (recusa) return { recusa };
    r.pedidos.push(marca);
  }
  r.emCurso += 1;
  let dentro = true;
  let reservado = 0;
  /** As chaves em que este pedido reservou: `[chave, contador]`. */
  let contas = [];
  const mexer = (segundos) => {
    for (const [, c] of contas) c.pendente += segundos;
    marca.s += segundos;
    reservado += segundos;
  };

  return {
    recusa: null,
    dono,
    /** Confere ritmo, cota do visitante, teto do dia e freio da hora, e reserva `custo` segundos. */
    async reservar(custo) {
      const segundos = Math.max(CUSTO_MINIMO_S, custo);
      if (!dono) {
        const lento = recusaPorSegundos(r, Date.now(), segundos);
        if (lento) return lento;
      }
      const c = await estadoDasCotas(env, chaveIp, dono);
      /* Daqui até a reserva não há `await`: conferir e reservar é um passo só neste isolate. */
      const recusa = recusaPorCota(c) ?? recusaPorHora(c);
      if (recusa) return recusa;
      contas = [dono ? null : c.chaveIp, c.chaveTotal, c.chaveHora].filter(Boolean).map((k) => [k, contadorDe(k)]);
      mexer(segundos);
      const gravou = await Promise.all(contas.map(([k, contador]) => gravar(env.LIMITES, k, contador)));
      if (contas.some(([, contador], i) => !gravou[i] && contador.pendente >= SEM_GRAVAR_MAX_S)) {
        mexer(-reservado);
        return json({ code: 'nuvem_ocupada', motivo: 'contador' }, 429, { 'retry-after': '60' });
      }
      return null;
    },
    /** O custo real, quando só se sabe depois do modelo (a tradução: entrada + saída). */
    acertar(custoReal) {
      if (reservado > 0) mexer(Math.max(CUSTO_MINIMO_S, custoReal) - reservado);
    },
    /** O modelo falhou: a reserva volta. */
    devolver() {
      mexer(-reservado);
    },
    /** O que resta ao visitante hoje, já com este pedido. */
    restante() {
      return dono ? COTA_POR_IP_S : Math.max(0, Math.floor(COTA_POR_IP_S - usado(contadorDe(chaveIp))));
    },
    sair() {
      if (dentro) r.emCurso -= 1;
      dentro = false;
    },
  };
}

/**
 * A CONSULTA (GET): confere a origem e o ritmo, e devolve o estado das cotas do visitante. Não gasta
 * cota. O freio da hora não entra: a hora cheia é passageira e a tela não pode dizer que o dia acabou.
 */
export async function consultar(request, env) {
  if (!consultaDaMesmaOrigem(request)) return { recusa: json({ code: 'origem' }, 403) };
  const dia = hoje();
  const chaveIp = await chaveDoVisitante(request, dia);
  arrumarMemoria(dia);
  const dono = ehODono(request, env);
  if (!dono) {
    const agora = Date.now();
    const consultas = semOsVelhos(ritmoDe(chaveIp).consultas, agora);
    if (consultas.length >= CONSULTAS_POR_MINUTO) return { recusa: devagar(consultas[0] + MINUTO_MS - agora) };
    consultas.push(agora);
  }
  const c = await estadoDasCotas(env, chaveIp, dono);
  return { recusa: recusaPorCota(c), restante: Math.floor(c.restante) };
}

/** O modelo (Workers AI ou o provedor de voz) falhou: a resposta que o cliente entende. */
export function falhaDoModelo(erro) {
  const mensagem = String(erro?.message ?? erro).slice(0, 200);
  // Cota do dia do Workers AI, limite de taxa ou falta de capacidade: o cliente pausa a nuvem.
  const ocupada = /limit|quota|capacity|allocation|neurons|429|3036|3040/i.test(mensagem);
  return json(
    { code: ocupada ? 'nuvem_ocupada' : 'falha_da_nuvem', erro: mensagem },
    ocupada ? 429 : 502,
    ocupada ? { 'retry-after': '600' } : {},
  );
}

/* ───────────────────────────── a tradução ───────────────────────────── */

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
/** `nb` e `nn` (o norueguês do app) são o `no` do m2m100: sem isto o norueguês ficava sem tradução. */
const base = (codigo) => {
  const b = String(codigo || '')
    .toLowerCase()
    .split('-')[0];
  return b === 'nb' || b === 'nn' ? 'no' : b;
};

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

/* ───────────────────────────── as rotas ───────────────────────────── */

/** A nuvem existe e este visitante ainda tem cota? (o cliente pergunta antes de escolher a rota). */
export async function onRequestGet({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  const c = await consultar(request, env);
  return c.recusa ?? json({ ok: true, restante: c.restante, cota: COTA_POR_IP_S });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI || !env.LIMITES) return json({ code: 'sem_nuvem' }, 501);
  if (!mesmaOrigem(request)) return json({ code: 'origem' }, 403);
  if (Number(request.headers.get('content-length') || 0) > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);
  const vez = await entrar(request, env);
  if (vez.recusa) return vez.recusa;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > TETO_DE_BYTES) return json({ code: 'grande_demais' }, 413);
    const segundos = segundosDoWav(bytes);
    if (segundos == null || segundos <= 0) return json({ code: 'formato' }, 400);
    if (segundos > MAX_SEGUNDOS) return json({ code: 'longo_demais' }, 413);

    const recusa = await vez.reservar(segundos);
    if (recusa) return recusa;

    const idioma = (request.headers.get('x-language') || '').toLowerCase().split('-')[0].slice(0, 3);
    let contexto = '';
    try {
      contexto = decodeURIComponent(request.headers.get('x-stt-prompt') || '').slice(0, 224);
    } catch {
      /* cabeçalho malformado: segue sem contexto */
    }
    const inicio = Date.now();
    let r;
    try {
      r = await env.AI.run(MODELO, {
        audio: paraBase64(bytes),
        task: 'transcribe',
        ...(idioma ? { language: idioma } : {}),
        ...(contexto ? { initial_prompt: contexto } : {}),
      });
    } catch (erro) {
      // Só conta o que foi transcrito de verdade.
      vez.devolver();
      return falhaDoModelo(erro);
    }
    const texto = String(r?.text ?? r?.transcription_info?.text ?? '').trim();
    const idiomaDaFala = String(r?.transcription_info?.language ?? r?.language ?? '') || idioma;
    const ms = Date.now() - inicio;
    /* A TRADUÇÃO NA MESMA VIAGEM (`x-traduzir-para`): o aparelho fraco não paga o tradutor local, e a
       legenda traduzida chega junto com a transcrição, sem uma segunda ida à rede. A tradução custa cota
       (~30 % dos neurônios da fala): soma-se à fala, em segundos, pela mesma conversão do `mt.js`
       (entrada + saída ÷ `CARACTERES_POR_SEGUNDO`). Tradutor que falha não cobra a tradução. */
    const para = base(request.headers.get('x-traduzir-para'));
    const inicioDaTraducao = Date.now();
    const translation = texto && para ? await traduzir(env, texto, idiomaDaFala, para) : null;
    if (translation) vez.acertar(segundos + (texto.length + translation.length) / CARACTERES_POR_SEGUNDO);
    return json({
      text: texto,
      language: idiomaDaFala,
      ms,
      ...(translation ? { translation, msTraducao: Date.now() - inicioDaTraducao } : {}),
      segundos: Math.round(segundos * 10) / 10,
      restante: vez.restante(),
    });
  } finally {
    vez.sair();
  }
}
