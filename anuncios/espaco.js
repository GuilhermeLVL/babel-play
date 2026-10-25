/*
 * A PÁGINA DE ANÚNCIOS (rulings R32 e R35) — o único lugar onde o GPT do Google roda, no Worker próprio
 * `frasy-anuncios`.
 *
 * Do BUILD (`config.js`, `scripts/anuncios/build.mjs`), nunca da query:
 *   FRASY_ANUNCIOS.rede  o código da rede no Ad Manager (`VITE_ANUNCIOS_REDE_CONTA`, só dígitos)
 *   FRASY_ANUNCIOS.app   a ORIGEM do app (`APP_URL`): o único destino das mensagens (`postMessage`)
 *
 * Da query (montada pelo app, `src/lib/anuncios/provedores/iframe.tsx`):
 *   espaco        o espaço do app (`inicio-nativo`, `fim-premiado`…)
 *   formato       `nativo` | `premiado`
 *   consentimento `1` = a pessoa aceitou. Sem ele, o GPT NUNCA é carregado
 *   exibicao      (premiado) a exibição aberta pelo servidor (`/api/anuncios/premiado/iniciar`)
 *   tratamento    o tratamento de idade (`tratamentoDeIdade` em `src/core/anuncios/politicaDeAnuncio.ts`):
 *                 `crianca` (abaixo de 13 ou idade desconhecida) | `adolescente` (13–17) | `nenhum` (adulto).
 *                 Ausente ou fora da lista vale `crianca` (falha para o lado protetivo). O premiado só com
 *                 `nenhum`: o "assista e ganhe" é só para adultos, e esta página confere de novo.
 *   tema, idioma  aparência; não vão ao Google
 * Lida a query, ela sai da barra de endereço (`history.replaceState`) ANTES do GPT: a exibição não vai ao
 * Google no endereço da página.
 *
 * Só roda DENTRO de um quadro e fora da origem do app: aberta direto (topo) ou servida pela origem do app,
 * sai sem fazer nada.
 *
 * Privacidade, sempre e antes de qualquer slot. PARA TODOS, adultos inclusive: `restrictDataProcessing` e
 * `nonPersonalizedAds` (`setPrivacySettings`), mais `privacyTreatments` `disablePersonalization` (`setConfig`,
 * quando o GPT o tem); criativo em SafeFrame. E o TRATAMENTO DE IDADE (`tagForAgeTreatment`, o TFAT que o Google
 * pôs no lugar do TFCD/TFUA, hoje obsoletos; Ad Manager, resposta 9004919): `crianca` → `CHILD` e, junto,
 * `childDirectedTreatment` + `underAgeOfConsent` (equivalentes; valem também num GPT sem o enum); `adolescente` →
 * `TEEN`; `nenhum` (adulto) → `UNSPECIFIED`, sem tratamento de criança nem de adolescente. Só a criança leva o
 * TFCD/TFUA: como o Google aplica o mais conservador, mandá-los a todos anularia o TEEN e o adulto (decisão do
 * controlador, 25/10/2026). `setPublisherProvidedId` NUNCA: o Google não recebe identificador nenhum nosso. O
 * quadro é `credentialless` (sem cookies).
 *
 * Fonte da API (conferida em 25/10/2026): https://developers.google.com/publisher-tag/reference —
 * `googletag.PrivacySettingsConfig.tagForAgeTreatment` (enum `googletag.enums.TagForAgeTreatment`: `CHILD`, `TEEN`,
 * `UNSPECIFIED`) e `googletag.config.PrivacyTreatmentsConfig.treatments` (`['disablePersonalization']`, via
 * `googletag.setConfig({ privacyTreatments })`); TFAT no lugar do TFCD/TFUA e "o mais conservador vale":
 * https://support.google.com/admanager/answer/9004919
 *
 * Mensagens ao app: `{ tipo: 'frasy:anuncio', evento: 'recompensa' | 'fechou' | 'vazio', exibicaoId }`.
 * O app confere a origem e a exibição; quem credita é o servidor, com teto (não há SSV do Google na web).
 */
/* global window, document, URL, URLSearchParams */
(function () {
  'use strict';

  var GPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  var cfg = window.FRASY_ANUNCIOS || {};
  var rede = typeof cfg.rede === 'string' ? cfg.rede : '';
  var app = null;
  try {
    var u = new URL(cfg.app || '');
    if (u.protocol === 'https:' || u.protocol === 'http:') app = u.origin;
  } catch {
    app = null;
  }

  /* Fora de um quadro, ou na origem do app: nada (R35). */
  if (window.top === window || !app || window.location.origin === app) return;

  var q = new URLSearchParams(window.location.search);
  var espaco = q.get('espaco') || '';
  var formato = q.get('formato') || '';
  var exibicao = q.get('exibicao') || '';
  var consentiu = q.get('consentimento') === '1';
  var tratamento = q.get('tratamento');
  if (tratamento !== 'adolescente' && tratamento !== 'nenhum') tratamento = 'crianca';
  /* A query (com a exibição) sai do endereço antes de qualquer script do Google. */
  window.history.replaceState(null, '', window.location.pathname);

  var valida =
    /^[a-z0-9-]{1,40}$/.test(espaco) &&
    (formato === 'nativo' || formato === 'premiado') &&
    (formato !== 'premiado' || /^[A-Za-z0-9_-]{1,80}$/.test(exibicao));
  /* O premiado é só para adultos: com tratamento de criança ou adolescente, nada da rede é pedido. */
  var permitido = formato !== 'premiado' || tratamento === 'nenhum';
  var temRede = /^[0-9]{1,20}$/.test(rede);

  function avisar(evento) {
    var msg = { tipo: 'frasy:anuncio', evento: evento };
    if (exibicao) msg.exibicaoId = exibicao;
    window.parent.postMessage(msg, app);
  }

  /* Sem consentimento, sem o código da rede no build ou com a query fora da forma: nada da rede é pedido. Com a
     query certa, o app ouve `vazio` e o espaço some (falha fechada). Sem rede, um aviso no console (Task 6). */
  if (!consentiu || !valida || !temRede || !permitido) {
    if (valida && !temRede) {
      window.console.warn('frasy-anuncios: sem código da rede no build (VITE_ANUNCIOS_REDE_CONTA); nada é pedido.');
    }
    if (valida) avisar('vazio');
    return;
  }

  var caminho = '/' + rede + '/frasy-' + espaco;
  var googletag = (window.googletag = window.googletag || { cmd: [] });

  googletag.cmd.push(function () {
    var pubads = googletag.pubads();
    var idades = (googletag.enums && googletag.enums.TagForAgeTreatment) || {};
    /* Não personalizado e processamento restrito para TODOS. */
    var privacidade = { restrictDataProcessing: true, nonPersonalizedAds: true };
    /* Criança (abaixo de 13 ou idade desconhecida): também o TFCD/TFUA, que valem num GPT sem o enum. */
    if (tratamento === 'crianca') {
      privacidade.childDirectedTreatment = true;
      privacidade.underAgeOfConsent = true;
    }
    var tfat =
      tratamento === 'crianca' ? idades.CHILD : tratamento === 'adolescente' ? idades.TEEN : idades.UNSPECIFIED;
    if (tfat !== undefined) privacidade.tagForAgeTreatment = tfat;
    pubads.setPrivacySettings(privacidade);
    if (typeof googletag.setConfig === 'function') {
      googletag.setConfig({ privacyTreatments: { treatments: ['disablePersonalization'] } });
    }
    /* Criativo em SafeFrame, nos dois formatos (a CSP do GPT pede isso numa origem só). */
    pubads.setForceSafeFrame(true);

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
