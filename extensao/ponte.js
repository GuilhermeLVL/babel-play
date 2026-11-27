/**
 * A PONTE: content script só nas origens do app (`manifest.json`, `matches`). Faz a ligação entre a
 * página e o offscreen, e NADA além disso:
 *   - só atende a página quando `event.source === window` e `event.origin === location.origin`;
 *   - só repassa `pedir` e `parar` (validados pelo contrato); o resto é descartado;
 *   - o áudio só flui depois de a página PEDIR (a extensão sozinha não entrega nada a nenhum site).
 * O contrato vem por import dinâmico (content script clássico não importa módulo estático).
 */
(async () => {
  const c = await import(chrome.runtime.getURL('contrato.js'));
  let porta = null;

  const paraPagina = (m) => window.postMessage(m, location.origin);

  function abrir() {
    if (porta) return;
    porta = chrome.runtime.connect({ name: c.NOME_DA_PORTA });
    porta.onMessage.addListener((m) => paraPagina(m));
    porta.onDisconnect.addListener(() => {
      /* Sem offscreen (nenhuma aba sendo capturada) a conexão cai na hora: a página fica sabendo. */
      porta = null;
      paraPagina(c.mensagemParou());
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!c.validarDoApp(e.data).ok) return;
    if (e.data.tipo === 'pedir') return abrir();
    if (e.data.tipo === 'parar' && porta) {
      porta.postMessage(e.data);
      porta.disconnect();
      porta = null;
    }
  });
})();
