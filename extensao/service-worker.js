/**
 * O SERVICE WORKER: o orquestrador, sem estado próprio (ele dorme a qualquer momento). Quem diz se há
 * captura é a existência do documento offscreen; a aba capturada vai na URL dele (`?aba=`), então não
 * há `storage` nem permissão para isso. Nenhuma requisição de rede sai daqui.
 */

/**
 * Onde o app abre: a PRODUÇÃO (o app mora em `/app`; `manifest.json` autoriza a ponte só nessa origem e em localhost).
 * Em desenvolvimento, troque pela linha de baixo (`extensao/README.md`). A origem de produção é a do `HOST_DE_PRODUCAO`
 * (`wrangler.jsonc`); se o domínio mudar, mude aqui e em `matches` e `web_accessible_resources` (um teste confere os três).
 */
const URL_DO_APP = 'https://frasy.com.br/app/capturar?fonte=extensao';
// const URL_DO_APP = 'http://localhost:3100/capturar?fonte=extensao';
const PAGINA_OFFSCREEN = 'offscreen.html';

async function documentoOffscreen() {
  const [ctx] = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctx ?? null;
}

async function estado() {
  const ctx = await documentoOffscreen();
  if (!ctx) return { capturando: false, aba: null };
  const aba = Number(new URL(ctx.documentUrl).searchParams.get('aba'));
  return { capturando: true, aba: Number.isInteger(aba) ? aba : null };
}

async function parar() {
  if (await documentoOffscreen()) await chrome.offscreen.closeDocument();
  await chrome.action.setBadgeText({ text: '' });
}

/** Chamado do clique no popup: o gesto é o que autoriza o `tabCapture` da aba ativa (`activeTab`). */
async function iniciar(abaId) {
  await parar();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: abaId });
  await chrome.offscreen.createDocument({
    url: `${PAGINA_OFFSCREEN}?aba=${abaId}&stream=${encodeURIComponent(streamId)}`,
    reasons: ['USER_MEDIA'],
    justification: 'Capturar o som da aba que a pessoa escolheu legendar, e entregá-lo ao Frasy.',
  });
  await chrome.action.setBadgeText({ text: 'ON' });
  const abas = await chrome.tabs.query({ url: `${new URL(URL_DO_APP).origin}/*` });
  if (abas.length === 0) await chrome.tabs.create({ url: URL_DO_APP, active: true });
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (sender.id !== chrome.runtime.id || msg?.alvo !== 'sw') return false;
  const trabalho =
    msg.tipo === 'iniciar' ? iniciar(msg.aba).then(estado) : msg.tipo === 'parar' ? parar().then(estado) : estado();
  trabalho.then(responder, (e) => responder({ capturando: false, aba: null, erro: String(e?.message ?? e) }));
  return true; // resposta assíncrona
});

/* Fechou a aba capturada: a captura acaba junto (nada fica ouvindo uma aba que não existe). */
chrome.tabs.onRemoved.addListener(async (abaId) => {
  const e = await estado();
  if (e.capturando && e.aba === abaId) await parar();
});
