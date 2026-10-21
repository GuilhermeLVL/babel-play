/*
 * A PÁGINA DE ANÚNCIOS (ruling R32) — o único lugar onde o GPT do Google roda.
 *
 * Query (montada pelo app, `src/lib/anuncios/provedores/iframe.tsx`):
 *   espaco        o espaço do app (`inicio-nativo`, `fim-premiado`…)
 *   formato       `nativo` | `premiado`
 *   app           a ORIGEM do app: o único destino das mensagens (`postMessage` com targetOrigin)
 *   rede          o código da rede no Ad Manager (`VITE_ANUNCIOS_REDE_CONTA`, só dígitos)
 *   consentimento `1` = a pessoa aceitou. Sem ele, o GPT NUNCA é carregado
 *   exibicao      (premiado) a exibição aberta pelo servidor (`/api/anuncios/premiado/iniciar`)
 *   tema, idioma  aparência; não vão ao Google
 *
 * Privacidade, sempre e antes de qualquer slot: `childDirectedTreatment`, `underAgeOfConsent`,
 * `restrictDataProcessing` e `nonPersonalizedAds`. `setPublisherProvidedId` NUNCA: o Google não recebe
 * identificador nenhum nosso. O iframe é `credentialless` (sem cookies).
 *
 * Mensagens ao app: `{ tipo: 'frasy:anuncio', evento: 'recompensa' | 'fechou' | 'vazio', exibicaoId }`.
 * O app confere a origem e a exibição; quem credita é o servidor, com teto (não há SSV do Google na web).
 */
(function () {
  'use strict';

  var GPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  var q = new URLSearchParams(window.location.search);
  var espaco = q.get('espaco') || '';
  var formato = q.get('formato') || '';
  var rede = q.get('rede') || '';
  var exibicao = q.get('exibicao') || '';
  var app = null;
  try {
    var u = new URL(q.get('app') || '');
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin === q.get('app')) app = u.origin;
  } catch (e) {
    app = null;
  }

  var valida =
    /^[a-z0-9-]{1,40}$/.test(espaco) &&
    (formato === 'nativo' || formato === 'premiado') &&
    /^[0-9]{1,20}$/.test(rede) &&
    app !== null &&
    (formato !== 'premiado' || /^[A-Za-z0-9_-]{1,80}$/.test(exibicao));

  function avisar(evento) {
    if (!app) return;
    var msg = { tipo: 'frasy:anuncio', evento: evento };
    if (exibicao) msg.exibicaoId = exibicao;
    window.parent.postMessage(msg, app);
  }

  /* Sem consentimento (ou com a query fora da forma) nada da rede é pedido. */
  if (q.get('consentimento') !== '1' || !valida) {
    if (valida) avisar('vazio');
    return;
  }

  var caminho = '/' + rede + '/frasy-' + espaco;
  var googletag = (window.googletag = window.googletag || { cmd: [] });

  googletag.cmd.push(function () {
    var pubads = googletag.pubads();
    pubads.setPrivacySettings({
      childDirectedTreatment: true,
      underAgeOfConsent: true,
      restrictDataProcessing: true,
      nonPersonalizedAds: true,
    });

    if (formato === 'premiado') {
      var premiado = googletag.defineOutOfPageSlot(caminho, googletag.enums.OutOfPageFormat.REWARDED);
      if (!premiado) {
        avisar('vazio');
        return;
      }
      premiado.addService(pubads);
      pubads.addEventListener('rewardedSlotReady', function (e) {
        e.makeRewardedVisible();
      });
      pubads.addEventListener('rewardedSlotGranted', function () {
        avisar('recompensa');
      });
      pubads.addEventListener('rewardedSlotClosed', function () {
        avisar('fechou');
        googletag.destroySlots([premiado]);
      });
      pubads.addEventListener('slotRenderEnded', function (e) {
        if (e.slot === premiado && e.isEmpty) avisar('vazio');
      });
      googletag.enableServices();
      googletag.display(premiado);
      return;
    }

    /* Criativo em SafeFrame: a pesquisa (CSP do GPT) pede isso quando a página é de uma origem só. */
    pubads.setForceSafeFrame(true);
    var nativo = googletag.defineSlot(caminho, [[300, 250], 'fluid'], 'espaco');
    if (!nativo) {
      avisar('vazio');
      return;
    }
    nativo.addService(pubads);
    pubads.addEventListener('slotRenderEnded', function (e) {
      if (e.slot === nativo && e.isEmpty) avisar('vazio');
    });
    googletag.enableServices();
    googletag.display('espaco');
  });

  var s = document.createElement('script');
  s.async = true;
  s.src = GPT;
  s.crossOrigin = 'anonymous';
  s.onerror = function () {
    avisar('vazio');
  };
  document.head.appendChild(s);
})();
