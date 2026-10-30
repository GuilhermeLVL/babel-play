/*
 * A PONTE DO VLIBRAS (piloto só para adultos): o script desta página. Roda num iframe de ORIGEM OPACA
 * (`sandbox="allow-scripts"`, sem `allow-same-origin`) e só faz três coisas:
 *   1. avisa o app que está pronta (`pronta`);
 *   2. ao receber `iniciar` DO PAI, pede o script oficial do VLibras e abre o widget (`iniciado` ou `erro`);
 *   3. ao receber `texto` DO PAI, mostra a frase e toca nela para o widget traduzir.
 * Mensagens: esquema estrito, só do `window.parent`, texto com teto. Nada é guardado. O esquema é o mesmo de
 * `src/core/libras/vlibras.ts` (`lerMensagemParaAPonte`); `tests/vlibras-ponte.test.ts` trava os dois juntos.
 * Arquivo estático, fora do lint e do bundle: sem dependência.
 */
(function () {
  'use strict';
  var MARCA = 'vlibras-ponte';
  var MAXIMO = 2000;
  var RAIZ = 'https://vlibras.gov.br/app';
  var SCRIPT = RAIZ + '/vlibras-plugin.js';
  var iniciando = false;
  var versao = 0;
  var pai = window.parent;
  if (!pai || pai === window) return; // aberta sozinha: não faz nada, nunca carrega o VLibras

  var campo = document.getElementById('texto');
  var estado = document.getElementById('estado');

  function avisar(tipo) {
    try {
      // A origem do pai é desconhecida aqui (esta página é opaca) e a mensagem não leva dado nenhum.
      pai.postMessage({ frasy: MARCA, tipo: tipo }, '*');
    } catch (e) {
      /* o pai sumiu */
    }
  }

  function esquema(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.frasy !== MARCA) return null;
    var chaves = Object.keys(d).length;
    if (d.tipo === 'iniciar' && chaves === 2) return { tipo: 'iniciar' };
    if (d.tipo === 'texto' && chaves === 3 && typeof d.texto === 'string' && d.texto.length <= MAXIMO)
      return { tipo: 'texto', texto: d.texto };
    return null;
  }

  function iniciar() {
    if (iniciando) return;
    iniciando = true;
    var s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = function () {
      try {
        new window.VLibras.Widget({ rootPath: RAIZ });
        // Abre a janela do intérprete do widget (o botão flutuante dele fica escondido).
        if (window.VLibrasWidget && typeof window.VLibrasWidget.open === 'function') window.VLibrasWidget.open();
        avisar('iniciado');
      } catch (e) {
        iniciando = false;
        estado.textContent = 'Não consegui iniciar o VLibras.';
        avisar('erro');
      }
    };
    s.onerror = function () {
      iniciando = false;
      s.remove();
      estado.textContent = 'Não consegui carregar o VLibras.';
      avisar('erro');
    };
    document.head.appendChild(s);
  }

  function mostrar(texto) {
    var limpo = texto.replace(/\s+/g, ' ').trim();
    if (!limpo) return;
    campo.textContent = limpo; // textContent, nunca innerHTML
    // O widget traduz o texto do elemento tocado, mas só depois que o avatar (Unity) carrega; antes disso ele ignora o
    // toque. Ele marca o elemento com `vlibras--active` quando o toque vale: tenta de novo a cada 3 s, até 60 s.
    // Quem quiser repetir a tradução toca na frase.
    var vez = ++versao;
    var tentar = function (n) {
      if (vez !== versao || n > 20) return;
      try {
        campo.click();
      } catch (e) {
        /* sem widget ainda */
      }
      if (!campo.classList.contains('vlibras--active')) setTimeout(tentar, 3000, n + 1);
    };
    setTimeout(tentar, 300, 0);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== pai) return; // só o pai (o Frasy) fala com a ponte
    var m = esquema(e.data);
    if (!m) return;
    if (m.tipo === 'iniciar') iniciar();
    else mostrar(m.texto);
  });

  avisar('pronta');
})();
