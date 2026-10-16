  /* ==========================================================================
     Rodada 5 — sentidos: som, vibração e movimento do aparelho.
     No celular não existe mouse, então o que no computador segue o ponteiro
     (luz, inclinação, aura, paralaxe) aqui segue o giroscópio.
     Som e vibração disparam no MESMO quadro da imagem: é isso que faz parecer um objeto.
     Mesmo escopo de prototipo.js / telas.js / telas2.js.
     ========================================================================== */
  const sentidos = { som: true, vibra: true };

  /* ---- Som: sintetizado na hora (Web Audio), sem arquivo nenhum ------------- */
  let ac = null;
  let mestre = null;
  let ultimoSom = 0;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      mestre = ac.createGain();
      mestre.gain.value = 0.55;
      const comp = ac.createDynamicsCompressor();
      mestre.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function nota(f, { t = 0, d = 0.12, tipo = 'sine', g = 0.12, f2 = null } = {}) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + t;
    const o = a.createOscillator();
    const v = a.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(v).connect(mestre);
    o.start(t0);
    o.stop(t0 + d + 0.02);
  }
  function sopro(d, { g = 0.06, de = 400, ate = 2400, t = 0 } = {}) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + t;
    const n = Math.floor(a.sampleRate * d);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource();
    s.buffer = buf;
    const filtro = a.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 1.2;
    filtro.frequency.setValueAtTime(de, t0);
    filtro.frequency.exponentialRampToValueAtTime(ate, t0 + d);
    const v = a.createGain();
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g, t0 + d * 0.3);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(filtro).connect(v).connect(mestre);
    s.start(t0);
  }
  /* Cada som é curto, grave ou agudo conforme o gesto: abrir sobe, fechar desce, erro é grave. */
  const SONS = {
    toque: () => nota(1700, { d: 0.028, g: 0.035, tipo: 'triangle' }),
    nav: () => nota(520, { d: 0.09, g: 0.1, f2: 780 }),
    aba: () => nota(700, { d: 0.06, g: 0.08, f2: 940 }),
    abre: () => (sopro(0.22, { de: 400, ate: 2600 }), nota(330, { d: 0.2, g: 0.07, f2: 660 })),
    fecha: () => (sopro(0.16, { de: 2200, ate: 320, g: 0.05 }), nota(620, { d: 0.13, g: 0.05, f2: 310 })),
    aviso: () => (nota(880, { d: 0.12, g: 0.08 }), nota(1320, { t: 0.07, d: 0.18, g: 0.06 })),
    sucesso: () => [523, 659, 784, 1047].forEach((f, i) => nota(f, { t: i * 0.075, d: 0.24, g: 0.1, tipo: 'triangle' })),
    erro: () => (nota(196, { d: 0.16, g: 0.12, tipo: 'square', f2: 150 }), nota(150, { t: 0.12, d: 0.18, g: 0.1, tipo: 'square', f2: 120 })),
    vira: () => (sopro(0.09, { de: 1200, ate: 3400, g: 0.05 }), nota(420, { d: 0.05, g: 0.04, f2: 640 })),
    acerto: () => [659, 988, 1319].forEach((f, i) => nota(f, { t: i * 0.07, d: 0.22, g: 0.1, tipo: 'triangle' })),
    moeda: () => [1318, 1760, 2093].forEach((f, i) => nota(f, { t: i * 0.055, d: 0.16, g: 0.06, tipo: 'triangle' })),
    liga: () => nota(660, { d: 0.07, g: 0.08, f2: 990 }),
    desliga: () => nota(660, { d: 0.07, g: 0.07, f2: 440 }),
    grava: () => (nota(440, { d: 0.09, g: 0.09 }), nota(660, { t: 0.09, d: 0.12, g: 0.09 })),
    chega: () => (nota(784, { d: 0.1, g: 0.08 }), nota(1175, { t: 0.08, d: 0.16, g: 0.07 })),
    fala: () => nota(1250, { d: 0.03, g: 0.025 }),
    festa: () => ([523, 659, 784, 1047, 1319, 1568].forEach((f, i) => nota(f, { t: i * 0.06, d: 0.3, g: 0.09, tipo: 'triangle' })), sopro(0.6, { de: 3000, ate: 9000, g: 0.04, t: 0.2 })),
    onda: () => (sopro(0.55, { de: 300, ate: 3200, g: 0.05 }), nota(220, { d: 0.5, g: 0.04, f2: 440 })),
  };
  /* ---- Vibração: padrão por tipo de acontecimento ---------------------------- */
  const TATO = {
    toque: 6, nav: 8, aba: 6, abre: 10, fecha: 6, aviso: [8, 40, 8], sucesso: [10, 50, 10, 50, 18], erro: [30, 40, 30],
    vira: 8, acerto: [10, 30, 16], moeda: [8, 30, 8], liga: 10, desliga: 8, grava: 14, chega: 10, festa: [15, 40, 15, 40, 30], onda: 12,
  };
  /* O iPhone não tem navigator.vibrate; um interruptor nativo escondido dá um toque do sistema (Safari 17.4+). */
  document.body.insertAdjacentHTML('beforeend', '<label class="px-tato-ios" aria-hidden="true"><input type="checkbox" switch tabindex="-1"></label>');
  const tatoIos = $('.px-tato-ios');
  function sentir(nome) {
    if (!polido()) return;
    const agora = performance.now();
    const fraco = nome === 'toque' || nome === 'aviso' || nome === 'fala';
    if (fraco && agora - ultimoSom < 160) return;
    if (!fraco) ultimoSom = agora;
    if (sentidos.som) {
      try {
        SONS[nome]?.();
      } catch {
        /* sem áudio neste navegador */
      }
    }
    if (sentidos.vibra && TATO[nome] && !reduz()) {
      if (navigator.vibrate) navigator.userActivation?.hasBeenActive !== false && navigator.vibrate(TATO[nome]); /* telas-enxutas: antes do primeiro toque o navegador bloqueia e avisa no console */
      else if (nome !== 'toque' && nome !== 'fala') tatoIos.click();
    }
  }
  /* Segurar para comprar: o tom sobe enquanto o dedo segura e some se soltar antes. */
  function somSegurar() {
    const a = sentidos.som && polido() ? audio() : null;
    if (!a) return () => {};
    const o = a.createOscillator();
    const v = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(280, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(980, a.currentTime + 1.1 * K());
    v.gain.setValueAtTime(0.0001, a.currentTime);
    v.gain.exponentialRampToValueAtTime(0.06, a.currentTime + 0.05);
    o.connect(v).connect(mestre);
    o.start();
    return () => {
      v.gain.cancelScheduledValues(a.currentTime);
      v.gain.setTargetAtTime(0.0001, a.currentTime, 0.02);
      o.stop(a.currentTime + 0.1);
    };
  }

  /* ---- Onde cada som toca: embrulha as funções que já existem ---------------- */
  const com = (f, antes) =>
    function (...args) {
      antes(...args);
      return f.apply(this, args);
    };
  abrirFolha = com(abrirFolha, () => !folha && sentir('abre'));
  fecharFolha = com(fecharFolha, () => folha && sentir('fecha'));
  abrirDialogo = com(abrirDialogo, () => sentir('abre'));
  fecharDialogo = com(fecharDialogo, () => sentir('fecha'));
  folhaDeBaixo = com(folhaDeBaixo, () => sentir('abre'));
  fecharFolhaDeBaixo = com(fecharFolhaDeBaixo, () => $('dialog.folha-de-baixo') && sentir('fecha'));
  abrirBusca = com(abrirBusca, () => sentir($('.paleta-cmd') ? 'fecha' : 'abre'));
  abrirFlutuante = com(abrirFlutuante, () => sentir(flut ? 'fecha' : 'abre'));
  toast = com(toast, () => sentir('aviso'));
  oferta = com(oferta, () => sentir('chega'));
  confete = com(confete, () => sentir('festa'));
  revelar = com(revelar, () => sentir('onda'));
  alternarTema = com(alternarTema, () => sentir('onda'));
  ativarTeste = com(ativarTeste, () => sentir('sucesso'));
  simularMissao = com(simularMissao, () => setTimeout(() => sentir('sucesso'), 380 * K()));
  girar = com(girar, () => sentir('vira'));
  placar = com(placar, (antes) => sentir(jogo.pontos > antes ? 'acerto' : 'erro'));
  trocar = com(trocar, (nome, o, tipo) => {
    if (tipo === 'aba') sentir('aba');
    else if (tipo === 'clique' && atual && nome !== atual) sentir('nav');
  });
  repintar = com(repintar, () => sentir('aba'));

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!polido()) return;
      audio(); /* o navegador só libera o áudio depois do primeiro gesto */
      pedirGiroscopio();
      const b = e.target.closest?.('button, [role="tab"], summary, a');
      if (!b || b.disabled) return;
      if (b.classList.contains('q-interruptor') || b.getAttribute('role') === 'switch') return sentir(b.getAttribute('aria-checked') === 'true' ? 'desliga' : 'liga');
      if (b.matches('.carta, .q-item, [data-px-comprar]')) return;
      sentir('toque');
    },
    true,
  );
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('[data-px-acao="som"], [data-px-acao="vibra"]');
    if (!b) return;
    const qual = b.dataset.pxAcao;
    sentidos[qual] = !sentidos[qual];
    b.setAttribute('aria-pressed', sentidos[qual]);
    if (sentidos[qual]) sentir(qual === 'som' ? 'sucesso' : 'acerto');
  });
  /* O botão real do app ("Som dos toques") manda no mesmo interruptor. */
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest?.('.q-faixa-do-mais .q-ctl');
    if (!b || !/^Som dos toques/.test(txt(b))) return;
    setTimeout(() => {
      sentidos.som = !/desligado/.test(txt(b));
      $('[data-px-acao="som"]', barra).setAttribute('aria-pressed', sentidos.som);
    }, 0);
  });

  /* ==========================================================================
     Movimento do aparelho (giroscópio)
     ========================================================================== */
  const giro = { ativo: false, x: 0, y: 0, ax: 0, ay: 0, b0: null, g0: null, alvos: [], rodando: false };
  const limita = (v) => Math.max(-1, Math.min(1, v));
  let pediuGiro = false;
  function pedirGiroscopio() {
    if (pediuGiro) return;
    pediuGiro = true;
    /* No iPhone o sensor só liga com permissão, pedida dentro de um toque. */
    const D0 = window.DeviceOrientationEvent;
    if (D0?.requestPermission) D0.requestPermission().catch(() => {});
  }
  function aoGirar(beta, gama) {
    if (beta == null || gama == null || reduz()) return;
    if (giro.b0 == null) (giro.b0 = beta), (giro.g0 = gama);
    /* O jeito de segurar vira o "zero" aos poucos: só o movimento conta, não a postura. */
    giro.b0 += (beta - giro.b0) * 0.004;
    giro.g0 += (gama - giro.g0) * 0.004;
    giro.ax = limita((gama - giro.g0) / 22);
    giro.ay = limita((beta - giro.b0) / 22);
    if (!giro.ativo) {
      giro.ativo = true;
      html.dataset.pxGiro = 'on';
      alvosDoGiro();
    }
    if (!giro.rodando) {
      giro.rodando = true;
      requestAnimationFrame(quadroDoGiro);
    }
  }
  addEventListener('deviceorientation', (e) => aoGirar(e.beta, e.gamma));
  function alvosDoGiro() {
    for (const el of giro.alvos) {
      el.style.transform = '';
      $(':scope > .px-luz.giro', el)?.remove();
    }
    giro.alvos = [];
    if (!giro.ativo || !polido()) return;
    /* Poucos alvos, só os que são "objeto": botões grandes, o cartão do Premium, a vitrine, as cartas. */
    giro.alvos = $$('button.q-tile:not(.apagado):not(.em-linha), .px-premium, .px-vitrine-tela, .px-item .px-arte, .carta:not(.virada):not(.par)', raiz)
      .filter((el) => el.offsetParent)
      .slice(0, 16);
    giro.alvos.slice(0, 4).forEach((el) => {
      if (el.matches('.carta, .px-arte, .px-vitrine-tela')) return;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const l = document.createElement('i');
      l.className = 'px-luz giro on';
      l.setAttribute('aria-hidden', 'true');
      el.append(l);
    });
  }
  function quadroDoGiro() {
    if (!giro.ativo || !polido()) {
      giro.rodando = false;
      return;
    }
    giro.x += (giro.ax - giro.x) * 0.12;
    giro.y += (giro.ay - giro.y) * 0.12;
    /* A aura e as partículas já seguem "mouse": o giroscópio passa a ser o ponteiro. */
    mouse = [innerWidth * (0.5 + giro.x * 0.45), innerHeight * (0.45 + giro.y * 0.4)];
    for (const el of giro.alvos) {
      if (!el.isConnected || el.getAnimations().some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)) continue;
      const f = el.matches('.carta') ? 0.6 : 1;
      el.style.transform = `perspective(800px) rotateY(${giro.x * 9 * f}deg) rotateX(${-giro.y * 8 * f}deg)`;
      const l = el.lastElementChild;
      if (l?.classList.contains('giro')) {
        l.style.setProperty('--mx', (0.5 - giro.x * 0.6) * el.offsetWidth + 'px');
        l.style.setProperty('--my', (0.4 - giro.y * 0.6) * el.offsetHeight + 'px');
      }
    }
    requestAnimationFrame(quadroDoGiro);
  }
  trocar = com(trocar, () => setTimeout(alvosDoGiro, 60));
  repintar = com(repintar, () => setTimeout(alvosDoGiro, 60));
  if (EMBUTIDO) {
    addEventListener('message', (e) => {
      const g = e.data?.pxGiro;
      if (g) aoGirar(g[0], g[1]);
    });
  }

  /* ==========================================================================
     Jeito de celular: a barra some ao rolar, deslizar troca de aba,
     e a aba ativa nunca fica fora da vista
     ========================================================================== */
  let ultimaRolagem = 0;
  main.addEventListener(
    'scroll',
    (e) => {
      if (!e.target.matches?.('.q-palco, .rolagem') || !celular() || !polido()) return;
      const y = e.target.scrollTop;
      const fim = y + e.target.clientHeight >= e.target.scrollHeight - 24;
      if (y > ultimaRolagem + 6 && y > 90 && !fim) trilho.classList.add('px-some');
      else if (y < ultimaRolagem - 6 || fim) trilho.classList.remove('px-some');
      ultimaRolagem = y;
    },
    { capture: true, passive: true },
  );
  function abaAVista() {
    for (const g of $$('.q-abas', raiz)) {
      const a = ativaDe(g);
      if (!a || g.scrollWidth <= g.clientWidth + 2) continue;
      g.scrollLeft = a.offsetLeft - (g.clientWidth - a.offsetWidth) / 2;
    }
    reposicionar();
  }
  trocar = com(trocar, () => {
    ultimaRolagem = 0;
    trilho.classList.remove('px-some');
    requestAnimationFrame(abaAVista);
  });
  repintar = com(repintar, () => requestAnimationFrame(abaAVista));
  /* Deslizar o dedo de lado troca a aba principal da tela. */
  {
    let d = null;
    const rolaDeLado = '.q-abas, .qj-ferramentas, .px-trilha, [data-testid="missoes-no-inicio"], .qe-kpis, .q-tabela-caixa, .q-acoes, input, .tabuleiro';
    tela.addEventListener('pointerdown', (e) => {
      d = celular() && polido() && PRIMARIA[atual] && !e.target.closest(rolaDeLado) ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    });
    tela.addEventListener('pointerup', (e) => {
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const rapido = performance.now() - d.t < 600;
      d = null;
      if (!rapido || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
      const abas = $$(PRIMARIA[atual] + ' .q-aba', tela);
      const i = (abaDe[atual] || 0) + (dx < 0 ? 1 : -1);
      if (abas[i]) abas[i].click();
      else if (!reduz()) {
        /* Sem mais abas para esse lado: a tela estica um pouco e volta. */
        sentir('toque');
        anima(tela, [{ transform: 'translateX(0)' }, { transform: `translateX(${dx < 0 ? -22 : 22}px)` }, { transform: 'translateX(0)' }], { d: 420, e: MOLA_SUAVE });
      }
    });
  }
