  /* ==========================================================================
     Rodada 3 — telas que não dá para capturar de produção (pedem conta ou microfone):
     captura ao vivo, frase e palavra, legendas flutuantes, Biblioteca, Planos e ofertas.
     A marcação segue os componentes reais do repositório (classes q-leg, q-linha-da-fala,
     folha-*, leg-*, q-bib-*, qc-oferta) e os textos de venda são os do código (planos.ts,
     dados.ts, migração 0045). Os dados (falas, gravações) são de exemplo.
     Este arquivo entra dentro do mesmo escopo de prototipo.js.
     ========================================================================== */

  /* ---- Ícones: reaproveita os lucide que já vieram na captura --------------- */
  const banco = modelo(Object.values(D.telas).join('') + D.abas['ajustes/0'] + D.abas['personalizar/0'] + D.mais + D.casca + D.fonte);
  const svg = (d) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const SIMPLES = {
    'arrow-down': svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    plus: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    copy: svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    'arrow-up-down': svg('<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>'),
    pip: svg('<rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="11" y="11" rx="1" fill="currentColor"/>'),
    gauge: svg('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
    'chevron-left': svg('<path d="m15 18-6-6 6-6"/>'),
    'sliders-horizontal': svg('<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>'),
    grip: svg('<circle cx="9" cy="8" r="1"/><circle cx="15" cy="8" r="1"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>'),
  };
  const ic = (n) => banco.querySelector('svg.lucide-' + n)?.outerHTML || SIMPLES[n] || SIMPLES.check;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---- Mola física (para o que o dedo solta: precisa herdar a velocidade) --- */
  function molaFisica(de, ate, v0, aoPasso, zeta = 0.8, resp = 0.42) {
    const k = ((2 * Math.PI) / resp) ** 2;
    const c = 2 * zeta * Math.sqrt(k);
    let x = de;
    let v = v0;
    let t0 = performance.now();
    let vivo = true;
    const passo = (t) => {
      if (!vivo) return;
      const dt = Math.min(0.032, (t - t0) / 1000) / K();
      t0 = t;
      v += (-k * (x - ate) - c * v) * dt;
      x += v * dt;
      if (Math.abs(x - ate) < 0.4 && Math.abs(v) < 6) return aoPasso(ate);
      aoPasso(x);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return { parar: () => (vivo = false) };
  }

  /* ==========================================================================
     Captura ao vivo
     ========================================================================== */
  const FALAS = [
    ['So, are we still shipping the roadmap today?', 'Então, ainda vamos entregar o roteiro hoje?'],
    ['We ship it today, but the dashboard needs one more review.', 'Entregamos hoje, mas o painel precisa de mais uma revisão.'],
    ['Fair enough. Can you walk me through the changes?', 'Justo. Você pode me explicar as mudanças?'],
    ['Sure. We rewrote the onboarding and cut the loading time in half.', 'Claro. Reescrevemos a entrada e cortamos o tempo de carregamento pela metade.'],
    ["That's a big deal. Customers were complaining about it.", 'Isso é importante. Os clientes estavam reclamando disso.'],
    ['Then let’s celebrate after the release.', 'Então vamos comemorar depois do lançamento.'],
  ];
  const GLOSA = {
    shipping: ['/ˈʃɪp.ɪŋ/', 'entregando, lançando'],
    roadmap: ['/ˈroʊd.mæp/', 'roteiro, plano de entregas'],
    dashboard: ['/ˈdæʃ.bɔːrd/', 'painel'],
    review: ['/rɪˈvjuː/', 'revisão'],
    walk: ['/wɔːk/', 'andar; "walk through": explicar passo a passo'],
    changes: ['/ˈtʃeɪn.dʒɪz/', 'mudanças'],
    onboarding: ['/ˈɑːnˌbɔːr.dɪŋ/', 'entrada, primeiros passos'],
    loading: ['/ˈloʊ.dɪŋ/', 'carregamento'],
    customers: ['/ˈkʌs.tə.mɚz/', 'clientes'],
    complaining: ['/kəmˈpleɪ.nɪŋ/', 'reclamando'],
    release: ['/rɪˈliːs/', 'lançamento'],
    celebrate: ['/ˈsel.ə.breɪt/', 'comemorar'],
  };
  const guardadas = new Set();

  D.telas.aovivo = `<div class="cel cel-gravando quest-vivo px-vivo">
    <div class="cel-conversa"><div class="q-leg">
      <div class="q-historico" aria-live="polite"><p class="q-espera">Ouvindo… a legenda aparece aqui.</p></div>
    </div></div>
    <div class="q-faixa" role="toolbar" aria-label="Controles da captura">
      <span class="q-tempo"><span class="cel-ponto"></span><span class="tn">00:00</span></span>
      <button type="button" class="q-ctl pri" data-px="encerrar"><i class="q-quadrado"></i> Encerrar</button>
      <button type="button" class="q-ctl" data-px="flutuante">${ic('pip')} Legendas flutuantes</button>
      <span class="q-espaco"></span>
      <button type="button" class="q-ctl" aria-label="Diminuir a letra">A−</button>
      <button type="button" class="q-ctl q-fica" aria-label="Aumentar a letra">A+</button>
      <button type="button" class="q-ctl" aria-label="Idiomas da sessão">EN → PT</button>
    </div>
  </div>`;

  let vivo = null;
  const relogio = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  function pararVivo() {
    if (!vivo) return;
    clearTimeout(vivo.t);
    clearInterval(vivo.r);
    vivo = null;
  }
  function comecarVivo() {
    pararVivo();
    const hist = $('.q-historico', tela);
    vivo = { i: 0, seg: 0, hist, falas: [] };
    vivo.r = setInterval(() => {
      const el = $('.q-tempo .tn', tela);
      if (el) el.textContent = relogio(++vivo.seg);
    }, 1000 * K());
    vivo.t = setTimeout(proximaFala, 1100 * K());
  }
  async function proximaFala() {
    const v = vivo;
    if (!v || v.i >= FALAS.length) return;
    const [orig, trad] = FALAS[v.i];
    const id = v.i++;
    $('.q-espera', v.hist)?.remove();
    $$('.q-linha-da-fala.atual', v.hist).forEach((l) => l.classList.remove('atual'));
    v.hist.insertAdjacentHTML(
      'beforeend',
      `<div class="q-linha-da-fala atual" data-fala="${id}"><button type="button" class="q-fala"><span class="q-meta"><span class="tn">${relogio(v.seg)}</span></span><span class="q-t" lang="en"></span></button>
       <div class="q-acoes-da-fala"><button type="button" class="q-ctl" aria-label="Ouvir de novo">${ic('volume2')}</button><button type="button" class="q-ctl" aria-label="Opções da fala">${ic('ellipsis')}</button></div></div>
       <p class="q-transcrevendo"><span class="q-pontos"><i></i><i></i><i></i></span>Transcrevendo…</p>`,
    );
    const linha = $(`[data-fala="${id}"]`, v.hist);
    const alvo = $('.q-t', linha);
    const fim = () => v.hist.scrollTo({ top: v.hist.scrollHeight, behavior: polido() && !reduz() ? 'smooth' : 'auto' });
    if (polido() && !reduz()) limpar(linha), anima(linha, [{ opacity: 0, transform: 'translateY(26px) scale(0.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 520 });
    /* O reconhecimento entrega a fala aos pedaços: as palavras chegam uma a uma. */
    for (const p of orig.split(' ')) {
      if (vivo !== v) return;
      const s = document.createElement('span');
      s.textContent = p + ' ';
      alvo.append(s);
      if (polido() && !reduz()) anima(s, [{ opacity: 0, filter: 'blur(6px)', transform: 'translateY(6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { d: 320 });
      espelharFlutuante(alvo.textContent, '', id);
      fim();
      await espera(polido() ? 150 : 90);
    }
    await espera(650);
    if (vivo !== v) return;
    $('.q-transcrevendo', v.hist)?.remove();
    /* A tradução chega: a original sobe para a linha pequena e a tradução ocupa a grande. */
    const troca = () => {
      alvo.insertAdjacentHTML('beforebegin', `<span class="q-o" lang="en">${esc(orig)}</span>`);
      alvo.textContent = trad;
      alvo.lang = 'pt';
    };
    if (polido() && !reduz()) {
      await anima(alvo, [{ opacity: 0, filter: 'blur(6px)' }], { d: 140, e: 'ease', fill: 'forwards' }).finished.catch(() => {});
      troca();
      limpar(alvo);
      anima(alvo, [{ opacity: 0, filter: 'blur(8px)', transform: 'translateY(10px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { d: 480 });
      anima($('.q-o', linha), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420 });
    } else troca();
    v.falas.push(id);
    sentir('fala');
    espelharFlutuante(orig, trad, id);
    fim();
    v.t = setTimeout(proximaFala, 1500 * K());
  }

  /* ---- Folha da frase e da palavra (FolhaDaFrase / FolhaDaPalavra) ---------- */
  function fecharFolhaDeBaixo() {
    const d = $('dialog.folha-de-baixo');
    if (!d) return;
    const some = () => {
      d.close();
      d.remove();
    };
    if (!polido() || reduz()) return some();
    anima(d, [{ transform: 'translateY(100%)' }], { d: 280, e: EG, fill: 'forwards' }).finished.then(some, some);
  }
  function folhaDeBaixo(corpo, classe) {
    $('dialog.folha-de-baixo')?.remove();
    app.insertAdjacentHTML('beforeend', `<dialog class="folha-de-baixo ${classe}" aria-label="Ações"><span class="folha-pega" aria-hidden="true"></span><div class="folha-corpo">${corpo}</div></dialog>`);
    const d = $('dialog.folha-de-baixo');
    d.showModal();
    d.addEventListener('click', (e) => e.target === d && fecharFolhaDeBaixo());
    d.addEventListener('cancel', (e) => (e.preventDefault(), fecharFolhaDeBaixo()));
    if (polido() && !reduz()) {
      limpar(d);
      anima(d, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 560, e: MOLA_SUAVE });
      $$('.folha-corpo > *, .folha-acao, .folha-palavras button', d).forEach((x, i) =>
        anima(x, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 120 + Math.min(i, 14) * 30 }),
      );
    }
    return d;
  }
  /* No Grátis a Nuance aparece com cadeado e um exemplo desfocado; no Premium, aberta. */
  const nuanceDaFrase = () =>
    conta.premium
      ? `<div class="q-aviso px-nuance"><span><b>${ic('sparkles')} Outras formas de dizer</b><span class="px-nuance-previa nitida"><i>Formal</i> Vamos concluir a entrega ainda hoje? <i>Informal</i> E aí, sai hoje?</span></span></div>`
      : `<div class="q-aviso px-nuance"><span><b>${ic('lock')} Outras formas de dizer</b>
           <span class="px-nuance-previa" aria-hidden="true"><i>Formal</i> Vamos concluir a entrega ainda hoje? <i>Informal</i> E aí, sai hoje?</span>
           Sua legenda já usa a Tradução rápida ao vivo, sem esperar.</span>
         <button type="button" class="q-ctl" data-px="planos">Conhecer o Premium</button></div>`;
  function abrirFrase(id) {
    const [orig, trad] = FALAS[id];
    const palavras = orig.replace(/[.,?!]/g, '').split(' ');
    const d = folhaDeBaixo(
      `<p class="folha-frase" lang="en">${esc(orig)}</p>
       <p class="folha-frase-trad" lang="pt">${esc(trad)}</p>
       <div class="folha-grade">
         <button type="button" class="folha-acao pri">${ic('volume2')} Ouvir</button>
         <button type="button" class="folha-acao">${ic('gauge')} Ouvir devagar</button>
         <button type="button" class="folha-acao">${ic('languages')} Ouvir tradução</button>
         <button type="button" class="folha-acao">${ic('mic')} Repetir eu</button>
         <button type="button" class="folha-acao">${ic('copy')} Copiar</button>
       </div>
       ${nuanceDaFrase()}
       <p class="folha-rotulo">Toque numa palavra</p>
       <div class="folha-palavras">${palavras.map((p) => `<button type="button" ${GLOSA[p.toLowerCase()] && !guardadas.has(p.toLowerCase()) ? 'data-nova' : ''} ${guardadas.has(p.toLowerCase()) ? 'data-aprendida' : ''}>${esc(p)}</button>`).join('')}</div>`,
      'folha-da-frase',
    );
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.px === 'planos') return fecharFolhaDeBaixo(), ir('planos');
      if (b.closest('.folha-palavras')) return abrirPalavra(b.textContent, id);
      if (b.classList.contains('folha-acao')) toast(`${txt(b)}: o áudio não toca neste protótipo.`);
    });
  }
  function abrirPalavra(p, id) {
    const chave = p.toLowerCase();
    const [ipa, glosa] = GLOSA[chave] || ['', ''];
    const d = folhaDeBaixo(
      `<button type="button" class="folha-voltar q-chip" data-px="voltar">${ic('arrow-left')} Voltar à frase</button>
       <p class="folha-pal" lang="en">${esc(p)}</p>
       ${ipa ? `<p class="folha-ipa">${ipa}</p>` : ''}
       <p class="folha-glosa">${glosa || 'Sem tradução para esta palavra.'}</p>
       <div class="folha-grade">
         <button type="button" class="folha-acao">${ic('volume2')} Ouvir</button>
         <button type="button" class="folha-acao">${ic('mic')} Falar eu</button>
         <button type="button" class="folha-acao pri" data-px="guardar">${guardadas.has(chave) ? ic('check') + ' Guardada' : ic('plus') + ' Guardar'}</button>
       </div>
       <p class="folha-status" role="status"></p>`,
      'folha-da-palavra',
    );
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.px === 'voltar') return abrirFrase(id);
      if (b.dataset.px !== 'guardar' || guardadas.has(chave)) return;
      guardadas.add(chave);
      b.innerHTML = ic('check') + ' Guardada';
      sentir('sucesso');
      $('.folha-status', d).textContent = 'No seu caderno. Ela volta nos jogos e na revisão.';
      if (polido() && !reduz()) {
        navigator.vibrate?.(10);
        anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
        anima($('svg', b), [{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 520, e: MOLA });
        rajada(...centro(b), 16);
      }
    });
  }

  /* ==========================================================================
     Legendas flutuantes: arrasta, joga, e ela pousa no canto para onde ia
     ========================================================================== */
  let flut = null;
  function espelharFlutuante(orig, trad, id) {
    if (!flut) return;
    const corpo = $('.leg-corpo', flut.el);
    let l = $(`[data-fala="${id}"]`, corpo);
    if (!l) {
      $('.leg-vazio', corpo)?.remove();
      $$('.leg-fala', corpo).forEach((x) => (x.className = 'leg-fala anterior'));
      $$('.leg-fala', corpo).slice(0, -1).forEach((x) => x.remove());
      corpo.insertAdjacentHTML('beforeend', `<div class="leg-fala atual" data-fala="${id}" aria-current="true"><span class="leg-o" lang="en"></span><span class="leg-t discreta" lang="pt"></span></div>`);
      l = corpo.lastElementChild;
      if (polido() && !reduz()) anima(l, [{ opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420 });
    }
    $('.leg-o', l).textContent = orig;
    const t = $('.leg-t', l);
    requestAnimationFrame(() => flut?.ajustar?.());
    if (trad && !t.textContent) {
      t.textContent = trad;
      if (polido() && !reduz()) anima(t, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380 });
    }
  }
  function fecharFlutuante() {
    if (!flut) return;
    const f = flut;
    flut = null;
    f.mx?.parar();
    f.my?.parar();
    const some = () => f.el.remove();
    if (!polido() || reduz()) return some();
    anima(f.el, [{ opacity: 0, scale: '0.85', filter: 'blur(6px)' }], { d: 220, fill: 'forwards' }).finished.then(some, some);
  }
  function abrirFlutuante() {
    if (flut) return fecharFlutuante();
    app.insertAdjacentHTML(
      'beforeend',
      `<div id="leg-flut" class="leg-flut modo-video" role="region" aria-label="Legendas flutuantes" tabindex="-1">
        <div class="leg-barra">
          <button type="button" class="leg-tit">${ic('grip')} Legendas</button>
          <span class="q-espaco" style="flex:1"></span>
          <button type="button" aria-label="Pausar legendas" title="Pausar (Espaço)">${ic('pause')}</button>
          <button type="button" aria-label="Fechar as legendas flutuantes" title="Fechar" data-px="fechar">${ic('x')}</button>
        </div>
        <div class="leg-corpo"><p class="leg-vazio">Esperando a primeira fala</p></div>
      </div>`,
    );
    const el = $('#leg-flut');
    flut = { el, x: 0, y: 0 };
    toast('Legendas flutuantes abertas: a janelinha fica por cima de tudo');
    el.addEventListener('click', (e) => e.target.closest('[data-px="fechar"]') && fecharFlutuante());
    if (vivo) {
      const u = vivo.falas[vivo.falas.length - 1];
      if (u != null) espelharFlutuante(FALAS[u][0], FALAS[u][1], u);
    }
    if (!polido()) return;
    /* Polido: posição livre. Parte do canto de baixo à direita e aceita ser jogada para qualquer canto. */
    const M = 16;
    const cantos = () => {
      const r = el.getBoundingClientRect();
      const a = app.getBoundingClientRect();
      const esq = celular() ? M : (trilho.offsetWidth || 0) + M;
      return { xs: [esq, a.width - r.width - M], ys: [M, a.height - r.height - M - (celular() ? 86 : 0)] };
    };
    Object.assign(el.style, { left: '0', top: '0', right: 'auto', bottom: 'auto', touchAction: 'none', willChange: 'transform' });
    const por = () => (el.style.transform = `translate(${flut.x}px, ${flut.y}px)`);
    const c0 = cantos();
    flut.x = c0.xs[1];
    flut.y = c0.ys[0];
    por();
    /* A janela cresce quando chega fala nova: se passar da borda, volta para dentro. */
    flut.ajustar = () => {
      if (a || !flut) return;
      const c = cantos();
      flut.x = Math.min(flut.x, c.xs[1]);
      flut.y = Math.min(flut.y, c.ys[1]);
      por();
    };
    if (!reduz()) anima(el, [{ opacity: 0, scale: '0.7', filter: 'blur(8px)' }, { opacity: 1, scale: '1', filter: 'blur(0)' }], { d: 560, e: MOLA_SUAVE });
    let a = null;
    el.addEventListener('pointerdown', (e) => {
      if (a || e.target.closest('button:not(.leg-tit)')) return;
      /* Pegar no meio do voo: as molas param e o arrasto continua de onde a janela está. */
      flut.mx?.parar();
      flut.my?.parar();
      el.setPointerCapture(e.pointerId);
      a = { id: e.pointerId, dx: e.clientX - flut.x, dy: e.clientY - flut.y, hist: [[performance.now(), e.clientX, e.clientY]] };
      el.classList.add('px-pegou');
    });
    el.addEventListener('pointermove', (e) => {
      if (!a || e.pointerId !== a.id) return;
      const c = cantos();
      const livre = (v, [min, max]) => (v < min ? min + elastico(v - min, 120) : v > max ? max + elastico(v - max, 120) : v);
      flut.x = livre(e.clientX - a.dx, c.xs);
      flut.y = livre(e.clientY - a.dy, c.ys);
      a.hist.push([performance.now(), e.clientX, e.clientY]);
      if (a.hist.length > 6) a.hist.shift();
      por();
    });
    const soltar = (e) => {
      if (!a || e.pointerId !== a.id || !flut) return;
      const g = a;
      a = null;
      el.classList.remove('px-pegou');
      const [t0, x0, y0] = g.hist[0];
      const [t1, x1, y1] = g.hist[g.hist.length - 1];
      const dt = Math.max(1, t1 - t0) / 1000;
      const vx = g.hist.length > 1 ? (x1 - x0) / dt : 0;
      const vy = g.hist.length > 1 ? (y1 - y0) / dt : 0;
      /* Projeção de momento (a mesma conta da rolagem): decide pelo ponto para onde a janela IA. */
      const proj = (v) => ((v / 1000) * 0.998) / (1 - 0.998);
      const c = cantos();
      const perto = (v, op) => op.reduce((m, o) => (Math.abs(o - v) < Math.abs(m - v) ? o : m));
      const ax = perto(flut.x + proj(vx) * 0.4, c.xs);
      const ay = perto(flut.y + proj(vy) * 0.4, c.ys);
      if (reduz()) return (flut.x = ax), (flut.y = ay), por();
      /* Uma mola por eixo, cada uma herdando a velocidade do dedo: não há emenda entre arrastar e pousar. */
      flut.mx = molaFisica(flut.x, ax, vx, (x) => flut && ((flut.x = x), por()));
      flut.my = molaFisica(flut.y, ay, vy, (y) => flut && ((flut.y = y), por()));
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  }

  /* ==========================================================================
     Biblioteca (BibliotecaDoQuest.tsx) com gravações de exemplo
     ========================================================================== */
  const GRAVACOES = [
    { t: 'Reunião de produto: roadmap do trimestre', tipo: 'Áudio', i: 'mic', d: 'hoje', min: 38, id: 'Inglês', pal: 1234, fixa: true },
    { t: 'Podcast: The science of sleep', tipo: 'Áudio', i: 'mic', d: 'ontem', min: 52, id: 'Inglês', pal: 2910 },
    { t: 'Aula de espanhol: pretérito perfeito', tipo: 'Vídeo', i: 'monitor', d: '3 out', min: 24, id: 'Espanhol', pal: 876 },
    { t: 'Entrevista com a designer da Lumen', tipo: 'Áudio', i: 'mic', d: '1 out', min: 17, id: 'Inglês', pal: 640 },
    { t: 'Artigo: The future of remote work', tipo: 'Texto', i: 'book-open', d: '28 set', min: 0, id: 'Inglês', pal: 1502 },
    { t: 'Série: episódio 3, temporada 2', tipo: 'Vídeo', i: 'monitor', d: '27 set', min: 44, id: 'Inglês', pal: 0 },
  ];
  const bib = { sel: 0, pag: 0, tipo: 'Todas', busca: '' };
  const num = (n) => n.toLocaleString('pt-BR');
  const filtradas = () => GRAVACOES.filter((g) => (bib.tipo === 'Todas' || g.tipo === bib.tipo) && g.t.toLowerCase().includes(bib.busca.toLowerCase()));
  function detalheDaBib(g) {
    return `<div class="q-bib-topo"><span class="q-ic">${ic(g.i)}</span><div>
        <p class="q-bib-tags"><span class="q-tag">${g.tipo}</span>${g.fixa ? '<span class="q-tag">Fixada</span>' : ''}${g.pal ? '' : '<span class="q-tag off">Processando</span>'}</p>
        <h2>${esc(g.t)}</h2></div></div>
      <dl class="q-bib-fatos"><div><dt>Palavras</dt><dd>${g.pal ? num(g.pal) : '—'}</dd></div><div><dt>Duração</dt><dd>${g.min ? g.min + ' min' : '—'}</dd></div><div><dt>Idioma</dt><dd>${g.id}</dd></div><div><dt>Data</dt><dd>${g.d}</dd></div></dl>
      <div class="q-bib-acoes" role="toolbar">
        <button type="button" class="q-ctl pri">${ic('book-open')} Abrir</button>
        <div class="q-acoes"><button type="button" class="q-ctl" ${g.pal ? '' : 'disabled'} data-px="jogar">${ic('gamepad-2')} Jogar com esta</button><button type="button" class="q-ctl" ${g.pal ? '' : 'disabled'}>Revisar palavras</button></div>
        <div class="q-acoes q-bib-cuidar q-bib-levar"><button type="button" class="q-ctl">${ic('download')} Exportar transcrição</button><button type="button" class="q-ctl">Retomar captura</button></div>
        <div class="q-acoes q-bib-cuidar"><button type="button" class="q-ctl">${g.fixa ? 'Desafixar' : 'Fixar no topo'}</button><button type="button" class="q-ctl">Renomear</button><button type="button" class="q-ctl perigo">Excluir</button></div>
      </div>`;
  }
  function htmlDaBib() {
    const l = filtradas();
    const total = GRAVACOES.length;
    const paginas = Math.max(1, Math.ceil(l.length / 4));
    bib.pag = Math.min(bib.pag, paginas - 1);
    const vis = l.slice(bib.pag * 4, bib.pag * 4 + 4);
    const g = l[bib.sel] || l[0];
    const tipos = ['Todas', 'Áudio', 'Vídeo', 'Texto'];
    return `<div class="q-palco q-bib">
      <header class="q-cab"><div><p class="q-sobre">${total} gravações · ${GRAVACOES.reduce((s, x) => s + x.min, 0)} min · ${num(GRAVACOES.reduce((s, x) => s + x.pal, 0))} palavras</p><h1>Biblioteca</h1></div>
        <button type="button" class="q-chip">${ic('arrow-up-down')} Mais recentes</button><button type="button" class="q-chip">${ic('plus')} Importar</button></header>
      <label class="q-campo q-bib-busca">${ic('search')}<input type="search" placeholder="Buscar por título" value="${esc(bib.busca)}" aria-label="Buscar por título"></label>
      <div class="q-abas" role="group" aria-label="Tipo de gravação">${tipos.map((t) => `<button type="button" class="q-aba" data-px-tipo="${t}" aria-checked="${bib.tipo === t}">${t} <span class="n">${t === 'Todas' ? total : GRAVACOES.filter((x) => x.tipo === t).length}</span></button>`).join('')}</div>
      ${
        l.length
          ? `<div class="q-bib-corpo"><div class="q-bib-col">
        <div class="q-lista" role="group" aria-label="Gravações">${vis
          .map((x) => `<button type="button" class="q-linha" data-px-grav="${l.indexOf(x)}" aria-pressed="${x === g}"><span class="q-ic">${ic(x.i)}</span><span><b>${esc(x.t)}</b><small>${x.d}${x.min ? ' · ' + x.min + ' min' : ''} · ${x.id}</small></span><span class="q-fim">${x.pal ? num(x.pal) + ' palavras' : 'Processando'}</span></button>`)
          .join('')}</div>
        <button type="button" class="q-linha q-bib-nova" data-px="capturar"><span class="q-bib-nova-dentro"><span class="q-ic">${ic('mic')}</span><span><b>Capturar outra sessão</b><small>O que você ouvir vira texto, palavras e jogos.</small></span></span></button>
        <div class="q-faixa q-bib-paginas"><button type="button" class="q-ctl" data-px-pag="-1" ${bib.pag ? '' : 'disabled'}>${ic('chevron-left')} Anterior</button><span class="q-espaco"></span><span class="q-tempo">${bib.pag + 1} / ${paginas}</span><span class="q-espaco"></span><button type="button" class="q-ctl" data-px-pag="1" ${bib.pag < paginas - 1 ? '' : 'disabled'}>Próxima ${ic('chevron-right')}</button></div>
      </div>
      <section class="q-cartao q-bib-det" aria-label="Gravação selecionada">${detalheDaBib(g)}</section></div>`
          : `<div class="q-vazio"><h2>Nenhum resultado</h2><p>Nenhuma gravação tem “${esc(bib.busca)}” no título.</p><button type="button" class="q-ctl" data-px="limpar">Limpar a busca</button></div>`
      }
    </div>`;
  }
  Object.defineProperty(D.telas, 'biblioteca', { get: htmlDaBib });
  function redesenharBib(como, dir = 1) {
    const foco = document.activeElement?.matches?.('.q-bib-busca input');
    const antes = $$('.q-abas', tela).map(medir);
    tela.innerHTML = htmlDaBib();
    $$('.q-abas', tela).forEach((g, i) => porPilula(g, antes[i]));
    if (foco) {
      const inp = $('.q-bib-busca input', tela);
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
    if (!polido() || reduz()) return;
    if (como === 'detalhe') {
      const det = $('.q-bib-det', tela);
      anima(det, [{ opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 460 });
      $$('.q-bib-fatos > div, .q-bib-acoes > *', det).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 60 + i * 45 }));
    } else {
      $$('.q-lista > .q-linha', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: `translateX(${46 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }], { d: 460, atraso: i * 55 }));
    }
  }

  /* ==========================================================================
     Planos e ofertas (textos de planos.ts, dados.ts e da migração 0045)
     ========================================================================== */
  const li = (t, nota) => `<li>${ic('check')}<span>${t}${nota ? `<small>${nota}</small>` : ''}</span></li>`;
  D.planos = `<div class="q-mais-fundo"><div class="q-mais px-planos" role="dialog" aria-modal="true" aria-label="Planos">
    <div class="q-cab"><div><p class="q-sobre">Planos</p><h2>Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho</h2></div>
      <button type="button" class="q-ctl" aria-label="Fechar">${ic('x')}</button></div>
    <div class="q-grade g2 px-planos-grade">
      <section class="q-cartao px-plano"><p class="q-rotulo">Seu plano</p><h3>Grátis</h3>
        <p class="px-preco"><b>R$ 0</b><span>para sempre</span></p><p class="q-d">Sem cartão, sem conta.</p>
        <ul>${li('Legenda bilíngue ao vivo, no aparelho, sem limite')}${li('Tradução rápida ao vivo')}${li('Jogos, vocabulário e revisão')}${li('Nuvem: até 3 h por mês, para aparelho fraco, quando disponível')}</ul>
        <button type="button" class="q-ctl" aria-label="Fechar e continuar grátis">Continuar grátis</button></section>
      <section class="q-cartao px-plano px-premium"><p class="q-rotulo"><span class="q-tag">Recomendado</span> Tradução Nuance</p><h3>Premium</h3>
        <p class="px-preco"><b>R$ 19,90</b><span>por mês</span></p><p class="q-d">Para entender o jeito de dizer, não só a palavra.</p>
        <p class="px-tudo">Tudo do Grátis, e:</p>
        <ul>${li('Tradução Nuance: outras formas de dizer, formal ou informal, variantes e glossário')}${li('Nuvem sem limite no dia a dia', 'uso justo: até 2 h de nuvem por dia e 40 h por mês; passando disso, a legenda segue no aparelho')}${li('Tutor de IA (iChat) sobre o seu material')}${li('Intérprete automático: reconhece sozinho quem fala qual idioma')}${li('Voz natural no modo intérprete (em breve)')}</ul>
        <button type="button" class="q-ctl pri" data-px="teste">Testar 14 dias grátis</button>
        <button type="button" class="q-ctl" data-px="assinar">Assinar Premium</button>
        <p class="px-nota">Sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.</p></section>
    </div>
    <p class="px-garantia">${ic('lock')} Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser</p>
  </div></div>`;

  const OFERTAS = {
    fim_de_sessao: ['book-open', 'Boa sessão!', 'No Premium, toque numa frase para ver outras formas de dizer e escolher entre formal e informal.'],
    conquista: ['trophy', 'Mais uma conquista', 'Quer ir além da tradução rápida? A Tradução Nuance do Premium mostra o jeito de dizer.'],
  };
  const naoMostrar = new Set();
  function fecharOferta() {
    const o = $('.qc-oferta');
    if (!o) return;
    if (!polido() || reduz()) return o.remove();
    anima(o, [{ opacity: 0, translate: '0 120%' }], { d: 280, e: EG, fill: 'forwards' }).finished.then(
      () => o.remove(),
      () => o.remove(),
    );
  }
  /* Regras de docs/ofertas.md: uma por vez, nunca por cima de captura, rodada ou painel aberto,
     e as três saídas sempre à vista (ação, "Agora não", "Não mostrar novamente"). */
  function oferta(momento) {
    if (naoMostrar.has(momento) || $('.qc-oferta') || folha || atual === 'jogo' || atual === 'aovivo') return;
    const [icone, titulo, corpo] = OFERTAS[momento];
    app.insertAdjacentHTML(
      'beforeend',
      `<aside class="qc-oferta" role="complementary" aria-label="Sugestão de plano">
        <span class="q-ic">${ic(icone)}</span>
        <div class="qc-oferta-texto"><span class="q-tag">Sugerido: 14 dias de Premium grátis, sem cartão</span><b>${titulo}</b><p>${corpo}</p></div>
        <button type="button" class="q-ctl qc-fechar" aria-label="Fechar" data-px="agora-nao">${ic('x')}</button>
        <div class="q-acoes"><button type="button" class="q-ctl pri" data-px="conhecer">Conhecer o Premium</button><button type="button" class="q-ctl" data-px="agora-nao">Agora não</button><button type="button" class="q-ctl" data-px="nunca">Não mostrar novamente</button></div>
      </aside>`,
    );
    const o = $('.qc-oferta');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.px === 'nunca') naoMostrar.add(momento), toast('Combinado: esta sugestão não aparece mais.');
      fecharOferta();
      if (b.dataset.px === 'conhecer') ir('planos');
    });
    if (!polido() || reduz()) return;
    anima(o, [{ opacity: 0, translate: '0 120%' }, { opacity: 1, translate: '0 0' }], { d: 680, e: MOLA_SUAVE });
    anima($('.q-ic', o), [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 700, atraso: 180, e: MOLA });
    $$('.qc-oferta-texto > *, .q-acoes > *', o).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 200 + i * 55 }));
  }

  /* ---- Ligações com o resto do protótipo ------------------------------------ */
  aoMostrar.aovivo = comecarVivo;
  aoSair.aovivo = pararVivo;
  ganchos.push((e, b) => {
    const t = txt(b);
    if (atual === 'capturar' && /^Iniciar captura/.test(t)) return ir('aovivo'), true;
    if ((atual === 'capturar' || atual === 'aovivo') && (/^Legendas flutuantes/.test(t) || b.dataset.px === 'flutuante')) return abrirFlutuante(), true;
    if (/^Conhecer o Premium/.test(t)) return ir('planos'), true;
    if (atual === 'aovivo') {
      if (b.dataset.px === 'encerrar') {
        ir('biblioteca');
        setTimeout(() => oferta('fim_de_sessao'), 1700 * K());
        return true;
      }
      const linha = b.closest('.q-linha-da-fala');
      if (linha && $('.q-o', linha)) return abrirFrase(+linha.dataset.fala), true;
      return !!b.closest('.px-vivo');
    }
    if (atual === 'biblioteca') {
      if (b.dataset.pxGrav) return (bib.sel = +b.dataset.pxGrav), redesenharBib('detalhe'), true;
      if (b.dataset.pxTipo) return (bib.tipo = b.dataset.pxTipo), (bib.sel = 0), (bib.pag = 0), redesenharBib('lista'), true;
      if (b.dataset.pxPag) return (bib.pag += +b.dataset.pxPag), redesenharBib('lista', +b.dataset.pxPag), true;
      if (b.dataset.px === 'capturar') return ir('capturar'), true;
      if (b.dataset.px === 'jogar') return ir('jogar'), true;
      if (b.dataset.px === 'limpar') return (bib.busca = ''), redesenharBib('lista'), true;
      if (b.closest('.q-bib-det')) return toast(`${t}: não clonado neste protótipo.`), true;
    }
    return false;
  });
  tela.addEventListener('input', (e) => {
    if (!e.target.matches('.q-bib-busca input')) return;
    bib.busca = e.target.value;
    bib.sel = 0;
    bib.pag = 0;
    redesenharBib('lista');
  });
