/* Protótipo de polimento do Babel Play.
   A marcação e o CSS das telas vêm de produção (babel-play.pages.dev, desenho novo),
   capturados sem edição. Este arquivo faz duas coisas:
   1. o mínimo de comportamento para o clone navegar (vale nos dois modos);
   2. a camada de movimento, que só roda com html[data-px="on"]. */
(() => {
  'use strict';

  const D = JSON.parse(document.getElementById('px-dados').textContent);
  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '');

  /* Embutido: esta mesma página rodando dentro da moldura de um aparelho (ver "Aparelhos" na barra). */
  const QS = new URLSearchParams(location.search);
  const EMBUTIDO = QS.has('embutido');
  if (EMBUTIDO) html.dataset.pxEmb = '1';
  if (QS.get('px')) html.dataset.px = QS.get('px');
  const polido = () => html.dataset.px === 'on';
  const K = () => (html.dataset.pxLento === 'on' ? 5 : 1);
  const mqReduz = matchMedia('(prefers-reduced-motion: reduce)');
  /* Protótipo: por padrão ignora "reduzir movimento/transparência" do sistema, para o dono VER.
     O botão "Seguir o sistema" na barra devolve o comportamento que o app real deve ter. */
  const reduz = () => html.dataset.pxAcess === 'on' && mqReduz.matches;
  function aplicarAcess() {
    const segue = html.dataset.pxAcess === 'on';
    /* 08/10: antes só a folha da camada era acertada. Com "reduzir movimento" ligado no Windows, o CSS
       de produção continuava tirando as transições dos ícones, do menu e dos cartões, e os laços (anéis
       do microfone, brilho das barras) nem começavam: o dono via as animações "sumirem" de um dia para
       o outro. Agora as regras de MOVIMENTO valem para todas as folhas, descendo em @layer e afins. */
    const daCamada = document.getElementById('polimento').sheet;
    const visitar = (regras, folha) => {
      for (const r of regras) {
        if (!(r instanceof CSSMediaRule)) {
          if (r.cssRules?.length) visitar(r.cssRules, folha);
          continue;
        }
        r._px ??= r.media.mediaText;
        if (/prefers-reduced-motion/.test(r._px)) {
          r.media.mediaText = segue ? r._px : /no-preference/.test(r._px) ? 'all' : 'not all';
          visitar(r.cssRules, folha);
        } else if (/prefers-(reduced|contrast)/.test(r._px) && folha === daCamada) {
          r.media.mediaText = segue ? r._px : 'not all';
        } else visitar(r.cssRules, folha);
      }
    };
    for (const folha of document.styleSheets) {
      try {
        visitar(folha.cssRules, folha);
      } catch {
        /* folha de outra origem (as fontes): não é nossa */
      }
    }
  }

  const EO = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const EIO = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const EG = 'cubic-bezier(0.32, 0.72, 0, 1)';
  /* Mola de verdade como curva linear(): resposta ao degrau de um sistema subamortecido. */
  function mola(zeta, n = 44) {
    const zw = 6.9;
    const wd = (zw / zeta) * Math.sqrt(1 - zeta * zeta);
    const p = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      p.push(i === n ? 1 : +(1 - Math.exp(-zw * t) * (Math.cos(wd * t) + (zw / wd) * Math.sin(wd * t))).toFixed(4));
    }
    return `linear(${p.join(', ')})`;
  }
  const temLinear = CSS.supports('transition-timing-function', 'linear(0, 1)');
  const MOLA = temLinear ? mola(0.5) : 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const MOLA_SUAVE = temLinear ? mola(0.72) : EG;
  html.style.setProperty('--px-mola', MOLA);
  html.style.setProperty('--px-mola-suave', MOLA_SUAVE);

  const anima = (el, quadros, o = {}) =>
    el.animate(quadros, {
      duration: (o.d ?? 240) * K(),
      delay: (o.atraso ?? 0) * K(),
      easing: o.e ?? EO,
      fill: o.fill ?? 'backwards',
    });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms * K()));
  /* Cancelar uma animação rejeita a promessa dela: quem cancela também engole o aviso. */
  const limpar = (el) =>
    el.getAnimations().forEach((a) => {
      a.finished.catch(() => {});
      a.cancel();
    });

  /* ---- Montagem da casca ------------------------------------------------- */
  const raiz = $('#root');
  raiz.innerHTML = D.casca;
  const app = raiz.firstElementChild;
  const casca = $('.q-casca');
  const trilho = $('.q-trilho');
  const main = $('main');
  const toastEl = $('.toast');
  const itens = $$('.q-item', trilho);
  const maisBtn = $('.q-mais-botao', trilho);
  main.innerHTML =
    '<canvas class="px-particulas" aria-hidden="true"></canvas>' +
    '<div class="px-aura" aria-hidden="true"></div>' +
    '<div class="px-borda" aria-hidden="true"></div>' +
    '<div class="px-tela"></div>';
  const tela = $('.px-tela');

  const ROTAS = ['inicio', 'capturar', 'interprete', 'jogar', 'estatisticas', 'personalizar'];
  const PRIMARIA = {
    estatisticas: '.qe-abas',
    personalizar: '.qp-abas',
    ajustes: '.q-abas:not(.q-seg)',
  };
  let atual = null;
  /* Pontos de encaixe para as telas de telas.js */
  const ganchos = [];
  const aoMostrar = {};
  const aoSair = {};
  const redesenho = {}; /* telas refeitas que só valem no modo Polido */
  const aoAbrirFolha = [];
  const aoAbrirBusca = [];
  const abaDe = {};
  const vistos = {};

  /* ---- Dados de exemplo do Início (o estado anônimo tem tudo em zero) ----- */
  const INICIAL = { revisar: [12, 20], palavras: [2, 3], rodadaBoa: [1, 2] };
  const ex = { xp: 240, nivel: 3, pct: 60, falta: 160, seeds: 420, missoes: structuredClone(INICIAL) };

  const trocaTexto = (el, de, para) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (de.test(n.nodeValue)) {
        n.nodeValue = n.nodeValue.replace(de, para);
        return n;
      }
    }
    return null;
  };

  function pintarInicio() {
    const prog = $('[data-testid="progresso-no-inicio"]', tela);
    if (!prog) return;
    $('b', prog).textContent = `Nível ${ex.nivel} · ${ex.xp} XP`;
    const barra = $('.q-barra', prog);
    barra.firstElementChild.style.width = ex.pct + '%';
    barra.setAttribute('aria-valuenow', ex.pct);
    trocaTexto($('small', prog), /Uma revisão hoje começa a sua ofensiva\. Faltam \d+ XP/, `Ofensiva de 4 dias. Faltam ${ex.falta} XP`);
    trocaTexto($('.q-chip', prog), /\d+ Seeds/, `${ex.seeds} Seeds`);
    let feitas = 0;
    for (const cartao of $$('[data-missao]', tela)) {
      const [a, b] = ex.missoes[cartao.dataset.missao];
      $('.q-barra > span', cartao).style.width = (a / b) * 100 + '%';
      $('.q-barra', cartao).setAttribute('aria-valuenow', a);
      $('.q-rotulo', cartao).textContent = `${a}/${b}`;
      cartao.classList.toggle('px-feita', a >= b);
      if (a >= b) feitas++;
    }
    trocaTexto($('[data-testid="missoes-no-inicio"] header .q-chip', tela), /\d\/3/, `${feitas}/3`);
  }

  /* ---- Contagem de número ------------------------------------------------- */
  function contar(pinta, de, ate, ms = 600) {
    if (reduz() || de === ate) return pinta(ate);
    const t0 = performance.now();
    const dur = ms * K();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      pinta(Math.round(de + (ate - de) * e));
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  /* ---- Pílula que desliza (abas e trilho) --------------------------------- */
  const ativaDe = (g) =>
    g === trilho
      ? $('.q-item[aria-current="page"]', g)
      : $('.q-aba[aria-selected="true"], .q-aba[aria-checked="true"]', g);

  function medir(g) {
    const a = ativaDe(g);
    if (!a) return null;
    const rg = g.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    return {
      x: ra.left - rg.left - g.clientLeft + g.scrollLeft,
      y: ra.top - rg.top - g.clientTop + g.scrollTop,
      w: ra.width,
      h: ra.height,
    };
  }
  function aplicar(p, r) {
    if (!r) {
      p.style.opacity = '0';
      return;
    }
    p.style.opacity = '1';
    p.style.width = r.w + 'px';
    p.style.height = r.h + 'px';
    p.style.transform = `translate(${r.x}px, ${r.y}px)`;
  }
  function porPilula(g, de) {
    if (!polido()) return;
    let p = $(':scope > .px-pilula', g);
    if (!p) {
      p = document.createElement('span');
      p.className = 'px-pilula';
      p.setAttribute('aria-hidden', 'true');
      g.prepend(p);
      g.classList.add('px-com-pilula');
      p.style.transition = 'none';
      aplicar(p, de || medir(g));
      void p.offsetWidth;
      p.style.transition = '';
    }
    aplicar(p, medir(g));
  }
  function tirarPilulas() {
    $$('.px-pilula').forEach((p) => p.remove());
    $$('.px-com-pilula').forEach((g) => g.classList.remove('px-com-pilula'));
  }
  function reposicionar() {
    for (const p of $$('.px-pilula')) {
      p.style.transition = 'none';
      aplicar(p, medir(p.parentElement));
      void p.offsetWidth;
      p.style.transition = '';
    }
  }
  addEventListener('resize', () => requestAnimationFrame(reposicionar));
  document.fonts?.ready.then(reposicionar);

  /* ---- Troca de tela ------------------------------------------------------ */
  const fonteDe = (nome) => (polido() && redesenho[nome]?.()) || (PRIMARIA[nome] ? D.abas[`${nome}/${abaDe[nome] || 0}`] : D.telas[nome]);
  const rolagem = () => $('.q-palco, .rolagem', tela);

  function marcarTrilho(nome) {
    const antes = $('.q-item[aria-current="page"]', trilho);
    itens.forEach((b) => b.removeAttribute('aria-current'));
    const i = { jogo: 3, aovivo: 1, interpretando: 2 }[nome] ?? ROTAS.indexOf(nome);
    const noMais = ['ajustes', 'biblioteca', 'sessao', 'planos', 'sobre', 'ajuda'].includes(nome) || (celular() && polido() && (i === 4 || i === 5));
    const alvo = noMais ? maisBtn : itens[i];
    alvo?.setAttribute('aria-current', 'page');
    porPilula(trilho);
    if (alvo && alvo !== antes && polido() && !reduz()) {
      anima($('svg', alvo), [{ transform: 'scale(0.6) rotate(-14deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 620, e: MOLA });
    }
  }

  let vezDaTela = 0;
  let dirAba = 1;
  const ordem = (n) => ({ jogo: 3.5, aovivo: 1.5, interpretando: 2.5, ajustes: 7, biblioteca: 7, sessao: 7.2, planos: 7, sobre: 7, ajuda: 7 })[n] ?? ROTAS.indexOf(n);
  function mostrar(nome, o = {}) {
    const tipo = o.origem || 'clique';
    const vez = ++vezDaTela;
    const dir = atual && ordem(nome) < ordem(atual) ? -1 : 1;
    if (o.aba != null) dirAba = o.aba < (abaDe[nome] || 0) ? -1 : 1;
    const sair = polido() && !reduz() && tipo === 'clique' && atual && nome !== atual && tela.firstChild;
    if (!sair) return trocar(nome, o, tipo, dir);
    marcarTrilho(nome); /* a pílula responde no toque, antes de a tela trocar */
    limpar(tela);
    const fim = () => {
      if (vez !== vezDaTela) return;
      limpar(tela);
      trocar(nome, o, tipo, dir);
    };
    anima(tela, [{ opacity: 0, transform: `translateY(${-18 * dir}px) scale(0.985)`, filter: 'blur(5px)' }], {
      d: 150,
      e: 'ease-out',
      fill: 'forwards',
    }).finished.then(fim, fim);
  }
  function trocar(nome, o, tipo, dir) {
    const antes = tipo === 'aba' ? $$('.q-abas', tela).map(medir) : null;
    const rol = tipo === 'aba' ? rolagem()?.scrollTop || 0 : 0;
    if (o.aba != null) abaDe[nome] = o.aba;
    olheiro.disconnect();
    comLuz = null;
    zerarTilt();
    if (atual !== nome) aoSair[atual]?.();
    tela.innerHTML = fonteDe(nome);
    atual = nome;
    if (nome === 'inicio') pintarInicio();
    const r = rolagem();
    if (r) r.scrollTop = rol;
    main.toggleAttribute('data-px-rolou', rol > 6);
    marcarTrilho(nome);
    $$('.q-abas', tela).forEach((g, i) => porPilula(g, antes && antes[i]));
    if (nome === 'jogo') iniciarJogo();
    aoMostrar[nome]?.();
    if (!polido() || tipo === 'seco' || tipo === 'teclado') return;
    if (tipo === 'aba') entrarAba();
    else if (nome !== 'jogo') entrar(nome, dir);
    else revelarTitulo();
  }
  const ir = (nome) => nome && mostrar(nome, { origem: 'clique' });

  /* Quem está fora da vista espera: entra quando a rolagem chegar nele. */
  const ENTRA = (y) => [
    { opacity: 0, transform: `translateY(${y}px) scale(0.96)`, filter: 'blur(8px)' },
    { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
  ];
  const olheiro = new IntersectionObserver(
    (es) => {
      let i = 0;
      for (const e of es) {
        if (!e.isIntersecting) continue;
        olheiro.unobserve(e.target);
        e.target.style.opacity = '';
        anima(e.target, ENTRA(34), { d: 680, atraso: i++ * 70 });
      }
    },
    { threshold: 0.12 },
  );

  function revelarTitulo() {
    const h1 = $('.q-cab h1, .cab h1', tela);
    if (!h1 || h1.children.length || reduz()) return;
    const palavras = h1.textContent.trim().split(/\s+/);
    h1.textContent = '';
    palavras.forEach((p, i) => {
      const caixa = document.createElement('span');
      caixa.className = 'px-pal';
      const dentro = document.createElement('span');
      dentro.textContent = p;
      caixa.append(dentro);
      h1.append(caixa, i < palavras.length - 1 ? ' ' : '');
      anima(dentro, [{ transform: 'translateY(115%) rotate(7deg)' }, { transform: 'translateY(0) rotate(0deg)' }], {
        d: 760,
        atraso: 60 + i * 75,
      });
    });
    const sobre = $('.q-cab .q-sobre, .cab .sobrancelha', tela);
    if (sobre) anima(sobre, [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'translateX(0)' }], { d: 520 });
  }

  function pecas() {
    const out = [];
    const abre = (b) => {
      if (b.matches('.q-grade')) out.push(...b.children);
      else if (b.matches('.q-secao') && $(':scope > .q-grade', b)) [...b.children].forEach(abre);
      else out.push(b);
    };
    $$(':scope > .q-palco > *, :scope .tela > *', tela).forEach(abre);
    return out.filter((b) => b.offsetParent && !b.matches('.q-cab, .cab'));
  }

  function entrar(nome, dir = 1) {
    if (reduz()) {
      anima(tela, [{ opacity: 0 }, { opacity: 1 }], { d: 160, e: 'ease' });
      return;
    }
    revelarTitulo();
    const lista = pecas();
    if (!lista.length) anima(tela, ENTRA(28 * dir), { d: 620 });
    let i = 0;
    for (const b of lista) {
      if (b.getBoundingClientRect().top < innerHeight - 20) {
        anima(b, ENTRA(30 * dir), { d: 700, atraso: 90 + Math.min(i++, 12) * 60 });
      } else {
        b.style.opacity = '0';
        olheiro.observe(b);
      }
    }
    if (nome === 'inicio') {
      $$('.q-barra > span', tela).forEach((s, k) =>
        anima(s, [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], {
          d: 1100,
          atraso: 450 + k * 140,
        }),
      );
      const b = $('[data-testid="progresso-no-inicio"] b', tela);
      contar((v) => (b.textContent = `Nível ${ex.nivel} · ${v} XP`), 0, ex.xp, 1300);
      for (const c of $$('[data-missao]', tela)) {
        const [a, t] = ex.missoes[c.dataset.missao];
        const r = $('.q-rotulo', c);
        contar((v) => (r.textContent = `${v}/${t}`), 0, a, 1200);
      }
    }
  }

  function entrarAba() {
    const g = $(PRIMARIA[atual], tela);
    if (!g) return;
    let topo = g;
    while (topo.parentElement && !topo.parentElement.matches('.q-palco, .tela, .px-tela')) topo = topo.parentElement;
    let i = 0;
    for (let n = topo.nextElementSibling; n; n = n.nextElementSibling) {
      anima(
        n,
        reduz()
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: `translateX(${70 * dirAba}px)`, filter: 'blur(8px)' },
              { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
            ],
        { d: 560, atraso: Math.min(i++, 5) * 60 },
      );
    }
  }

  /* ---- Painéis: "Mais" e "O que você vai praticar" ------------------------- */
  let folha = null;
  const mqCel = matchMedia('(max-width: 720px)');
  const celular = () => mqCel.matches;

  /* No celular a barra tem 5 destinos; Estatísticas e Personalizar passam a morar no Mais. */
  function completarMais(painel) {
    const grade = $('.q-grade[role="tabpanel"]', painel);
    if (!grade || !celular() || !polido() || $('[data-px-extra]', grade)) return;
    const molde = [...grade.children].find((t) => !$('.q-pede-conta', t));
    [
      ['Personalizar', itens[5]],
      ['Estatísticas', itens[4]],
    ].forEach(([nome, origemDoIcone]) => {
      const t = molde.cloneNode(true);
      t.dataset.pxExtra = '1';
      $('b', t).textContent = nome;
      $('.q-ic', t).replaceChildren($('svg', origemDoIcone).cloneNode(true));
      grade.prepend(t);
    });
  }

  /* Arrastar o painel: segue o dedo 1:1 para baixo, resiste para cima, e ao soltar
     decide pelo ponto para onde o gesto IA (velocidade projetada), não por onde parou. */
  function arrastarFolha(f) {
    const p = f.painel;
    let a = null;
    p.addEventListener('pointerdown', (e) => {
      if (a || e.target.closest('button, input, a')) return;
      if (e.clientY - p.getBoundingClientRect().top > 76) return;
      a = { id: e.pointerId, y0: e.clientY, t: 0, hist: [[performance.now(), e.clientY]], indo: false };
      p.setPointerCapture(e.pointerId);
    });
    p.addEventListener('pointermove', (e) => {
      if (!a || e.pointerId !== a.id) return;
      const dy = e.clientY - a.y0;
      if (!a.indo) {
        if (Math.abs(dy) < 6) return;
        a.indo = true;
        limpar(p);
        f.el.classList.add('px-arrastando');
      }
      a.t = dy > 0 ? dy : elastico(dy, 90);
      a.hist.push([performance.now(), e.clientY]);
      if (a.hist.length > 6) a.hist.shift();
      p.style.transform = `translateY(${a.t}px)`;
      f.el.style.setProperty('--px-prog', Math.max(0, 1 - a.t / p.offsetHeight));
    });
    const soltar = (e) => {
      if (!a || e.pointerId !== a.id) return;
      const g = a;
      a = null;
      if (!g.indo) return;
      f.el.classList.remove('px-arrastando');
      const [t0, y0] = g.hist[0];
      const [t1, y1] = g.hist[g.hist.length - 1];
      const vel = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0; /* px/s */
      const projetado = g.t + (vel / 1000) * 0.998 / (1 - 0.998) * 0.35;
      if (projetado > p.offsetHeight * 0.4 && folha === f) return fecharFolha({ arrastado: true, vel });
      anima(p, [{ transform: `translateY(${g.t}px)` }, { transform: 'translateY(0)' }], { d: 520, e: MOLA_SUAVE });
      p.style.transform = '';
      f.el.style.removeProperty('--px-prog');
    };
    p.addEventListener('pointerup', soltar);
    p.addEventListener('pointercancel', soltar);
  }
  const modelo = (h) => {
    const t = document.createElement('template');
    t.innerHTML = h;
    return t.content;
  };

  function origem(painel, gatilho) {
    const r = painel.getBoundingClientRect();
    const g = gatilho?.getBoundingClientRect?.();
    painel.style.transformOrigin =
      g && g.width ? `${g.left + g.width / 2 - r.left}px ${g.top + g.height / 2 - r.top}px` : '50% 50%';
  }
  function rotularTema() {
    if (!folha) return;
    const b = $$('.q-faixa-do-mais .q-ctl', folha.painel).find((x) => /^Tema/.test(txt(x)));
    if (b) b.lastChild.nodeValue = html.classList.contains('dark') ? 'Tema escuro' : 'Tema claro';
  }

  function abrirFolha(tipo, gatilho) {
    if (folha) return;
    const host = tipo === 'fonte' ? main : casca;
    host.insertAdjacentHTML('beforeend', D[tipo]);
    const el = host.lastElementChild;
    const painel = $('.q-mais', el);
    folha = { el, painel, gatilho, tipo };
    if (tipo === 'mais') {
      maisBtn.setAttribute('aria-expanded', 'true');
      rotularTema();
    }
    if (tipo === 'mais') completarMais(painel);
    aoAbrirFolha.forEach((f) => f(tipo, painel));
    $$('.q-abas', el).forEach((g) => porPilula(g));
    if (polido() && celular() && !reduz()) {
      main.classList.add('px-recuado');
      requestAnimationFrame(() => el.classList.add('px-aberto'));
      anima(painel, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 620, e: MOLA_SUAVE });
      $$('.q-tile, :scope > .q-faixa, .q-secao', painel).forEach((t, i) =>
        anima(t, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 520, atraso: 140 + i * 45 }),
      );
      arrastarFolha(folha);
    } else if (polido()) {
      main.classList.add('px-recuado');
      requestAnimationFrame(() => el.classList.add('px-aberto'));
      if (reduz()) {
        anima(painel, [{ opacity: 0 }, { opacity: 1 }], { d: 180, e: 'ease' });
      } else {
        origem(painel, gatilho);
        anima(painel, [{ opacity: 0, transform: 'scale(0.55)', filter: 'blur(10px)' }, { opacity: 1, offset: 0.35 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 640, e: MOLA_SUAVE });
        $$(':scope > *:not(.q-grade)', painel).forEach((t, i) => anima(t, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 520, atraso: 120 + i * 60 }));
        $$('.q-tile', painel).forEach((t, i) =>
          anima(t, [{ opacity: 0, transform: 'translateY(22px) scale(0.9)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], {
            d: 620,
            atraso: 220 + i * 55,
            e: MOLA_SUAVE,
          }),
        );
      }
    }
    ($('[aria-label^="Fechar"]', painel) || painel).focus({ preventScroll: true });
  }

  function fecharFolha(o = {}) {
    if (!folha) return;
    const f = folha;
    folha = null;
    maisBtn.setAttribute('aria-expanded', 'false');
    main.classList.remove('px-recuado');
    const fim = () => {
      f.el.remove();
      if (!o.semFoco) f.gatilho?.focus?.({ preventScroll: true });
    };
    if (!polido() || o.seco) return fim();
    f.el.classList.remove('px-aberto');
    f.el.classList.add('px-saindo');
    f.el.style.pointerEvents = 'none';
    f.el.style.removeProperty('--px-prog');
    if (celular() && !reduz()) {
      /* Sai por onde entrou; se foi jogado com o dedo, sai mais rápido. */
      const d = o.arrastado ? Math.max(160, 340 - Math.abs(o.vel || 0) / 8) : 340;
      return anima(f.painel, [{ transform: 'translateY(105%)' }], { d, e: EG, fill: 'forwards' }).finished.then(fim, fim);
    }
    /* Um quadro só ("para onde"): parte do valor que está na tela, mesmo no meio da entrada. */
    const a = reduz()
      ? anima(f.painel, [{ opacity: 0 }], { d: 140, e: 'ease', fill: 'forwards' })
      : (origem(f.painel, f.gatilho),
        anima(f.painel, [{ opacity: 0, transform: 'scale(0.6)', filter: 'blur(8px)' }], { d: 260, fill: 'forwards' }));
    a.finished.then(fim, fim);
  }

  function trocarAbaDoMais(i) {
    const p = folha.painel;
    const antes = $$('.q-abas', p).map(medir);
    const h0 = p.offsetHeight;
    p.innerHTML = '';
    p.append(...$('.q-mais', modelo(i ? D.maisAvisos : D.mais)).childNodes);
    rotularTema();
    completarMais(p);
    if (!i) aoAbrirFolha.forEach((f) => f('mais', p));
    $$('.q-abas', p).forEach((g, k) => porPilula(g, antes[k]));
    if (!polido()) return;
    const depois = $$(':scope > .q-abas ~ *', p);
    depois.forEach((n, k) => anima(n, [{ opacity: 0, transform: `translateX(${50 * (i ? 1 : -1)}px)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' }], { d: 480, atraso: k * 50 }));
    const h1 = p.offsetHeight;
    if (h1 !== h0 && !reduz()) {
      p.style.overflow = 'hidden';
      anima(p, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { d: 520, e: MOLA_SUAVE, fill: 'none' }).finished.then(
        () => (p.style.overflow = ''),
      );
    }
  }

  function cliqueNaFolha(e) {
    const f = folha;
    if (e.target === f.el) return fecharFolha();
    const b = e.target.closest('button');
    if (!b) return;
    const t = txt(b);
    if ((b.getAttribute('aria-label') || '').startsWith('Fechar')) return fecharFolha();
    if (b.dataset.px === 'planos') {
      fecharFolha({ semFoco: true });
      return ir('planos');
    }
    const aba = b.closest('.q-aba');
    if (aba && f.tipo === 'mais' && aba.closest('[role="tablist"]')) {
      return trocarAbaDoMais($$('.q-aba', aba.parentElement).indexOf(aba));
    }
    if (aba) return abaLocal(aba);
    if (f.tipo === 'planos') {
      if (b.dataset.px) toast(b.dataset.px === 'teste' ? 'No app, aqui começam os 14 dias de Premium, sem cartão.' : 'No app, aqui abre o pagamento do Premium.');
      return;
    }
    if (f.tipo === 'fonte') {
      if (/^Usar estas palavras/.test(t)) fecharFolha();
      return;
    }
    if (/^Buscar/.test(t)) {
      fecharFolha({ seco: true, semFoco: true });
      return abrirBusca('clique');
    }
    if (/^Tema/.test(t)) return alternarTema();
    if (/^Som dos toques/.test(t)) {
      b.lastChild.nodeValue = /ligado/.test(t) && !/desligado/.test(t) ? 'Som dos toques: desligado' : 'Som dos toques: ligado';
      return;
    }
    const tile = b.closest('.q-tile');
    if (tile) {
      const nome = txt($('b', tile));
      const rota = { Ajustes: 'ajustes', Estatísticas: 'estatisticas', Personalizar: 'personalizar', Biblioteca: 'biblioteca', Sobre: 'sobre', 'Ajuda e suporte': 'ajuda' }[nome];
      if (rota) {
        fecharFolha({ semFoco: true });
        return ir(rota);
      }
      toast(`${nome} não foi clonada neste protótipo.`);
    }
  }

  /* ---- Busca (Ctrl+K): aberta pelo teclado, não anima --------------------- */
  const DESTINO = {
    'Iniciar captura': 'capturar',
    Início: 'inicio',
    Capturar: 'capturar',
    Intérprete: 'interprete',
    Jogar: 'jogar',
    Estatísticas: 'estatisticas',
    Personalizar: 'personalizar',
    Ajustes: 'ajustes',
    Biblioteca: 'biblioteca',
  };
  function fecharBusca() {
    const d = $('.paleta-cmd');
    if (!d) return;
    d.close();
    d.remove();
  }
  function abrirBusca(via) {
    if ($('.paleta-cmd')) return fecharBusca();
    app.insertAdjacentHTML('beforeend', D.paleta.replace(' open=""', ''));
    const d = $('.paleta-cmd');
    const campo = $('input', d);
    aoAbrirBusca.forEach((f) => f(d));
    const lista = () => $$('.cmd-item', d).filter((b) => !b.hidden);
    d.showModal();
    campo.focus();
    if (polido() && via === 'clique' && !reduz()) {
      anima(d, [{ opacity: 0, transform: 'scale(0.9) translateY(-24px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0)' }], { d: 480, e: MOLA_SUAVE });
      $$('.cmd-item', d).forEach((b, i) => anima(b, [{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'translateX(0)' }], { d: 420, atraso: 120 + i * 45 }));
    }
    const focar = (b) => {
      $$('.cmd-item', d).forEach((x) => {
        x.classList.toggle('foco', x === b);
        x.setAttribute('aria-selected', x === b);
      });
      b?.scrollIntoView({ block: 'nearest' });
    };
    const abrir = (b, origemDoGesto) => {
      const nome = DESTINO[txt($('.cmd-t', b))];
      fecharBusca();
      if (nome) mostrar(nome, { origem: origemDoGesto });
      else toast(`${txt($('.cmd-t', b))} não foi clonada neste protótipo.`);
    };
    campo.addEventListener('input', () => {
      const q = campo.value.trim().toLowerCase();
      $$('.cmd-item', d).forEach((b) => (b.hidden = q && !txt(b).toLowerCase().includes(q)));
      $$('.cmd-grupo', d).forEach((g) => {
        let n = g.nextElementSibling;
        let tem = false;
        while (n && !n.matches('.cmd-grupo')) {
          if (!n.hidden) tem = true;
          n = n.nextElementSibling;
        }
        g.hidden = !tem;
      });
      focar(lista()[0]);
    });
    d.addEventListener('keydown', (e) => {
      const l = lista();
      const i = l.findIndex((b) => b.classList.contains('foco'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focar(l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]);
      } else if (e.key === 'Enter' && l[i]) {
        e.preventDefault();
        abrir(l[i], 'teclado');
      }
    });
    d.addEventListener('click', (e) => {
      if (e.target === d) return fecharBusca();
      const b = e.target.closest('.cmd-item');
      if (b) abrir(b, 'clique');
    });
    d.addEventListener('close', () => d.remove());
  }

  /* ---- Toast: entra e sai pela borda de cima; arrasta para dispensar ------ */
  let toastT = 0;
  let toastFim = 0;
  function fecharToast() {
    clearTimeout(toastT);
    toastEl.classList.remove('on');
  }
  function toast(msg, ms = 3400) {
    toastEl.innerHTML = '<span class="dot"></span><span></span>';
    toastEl.lastChild.textContent = msg;
    toastEl.style.transform = '';
    toastEl.style.opacity = '';
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastFim = ms * K();
    toastT = setTimeout(fecharToast, toastFim);
  }
  const elastico = (v, dim = 120, c = 0.55) => (v * dim * c) / (dim + c * Math.abs(v));
  {
    let arr = null;
    toastEl.addEventListener('pointerenter', () => clearTimeout(toastT));
    toastEl.addEventListener('pointerleave', () => {
      if (!arr && toastEl.classList.contains('on')) toastT = setTimeout(fecharToast, 1500 * K());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(toastT);
      else if (toastEl.classList.contains('on')) toastT = setTimeout(fecharToast, 1500 * K());
    });
    toastEl.addEventListener('pointerdown', (e) => {
      if (!polido() || arr || reduz()) return;
      toastEl.setPointerCapture(e.pointerId);
      arr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), eixo: null, dx: 0, dy: 0 };
    });
    toastEl.addEventListener('pointermove', (e) => {
      if (!arr || e.pointerId !== arr.id) return;
      const dx = e.clientX - arr.x;
      const dy = e.clientY - arr.y;
      if (!arr.eixo) {
        if (Math.hypot(dx, dy) < 6) return;
        arr.eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        toastEl.classList.add('px-arrastando');
      }
      /* Para a direita e para cima segue o dedo 1:1; no sentido contrário, resiste. */
      arr.dx = arr.eixo === 'x' ? (dx > 0 ? dx : elastico(dx)) : 0;
      arr.dy = arr.eixo === 'y' ? (dy < 0 ? dy : elastico(dy)) : 0;
      toastEl.style.transform = `translate(${arr.dx}px, ${arr.dy}px)`;
    });
    const soltar = (e) => {
      if (!arr || e.pointerId !== arr.id) return;
      const a = arr;
      arr = null;
      toastEl.classList.remove('px-arrastando');
      const dist = a.eixo === 'x' ? a.dx : -a.dy;
      const vel = Math.abs(dist) / (performance.now() - a.t);
      if (a.eixo && dist > 0 && (dist >= 45 || vel > 0.11)) {
        clearTimeout(toastT);
        toastEl.style.transform = a.eixo === 'x' ? 'translateX(calc(100% + 40px))' : 'translateY(calc(-100% - 24px))';
        toastEl.style.opacity = '0';
        setTimeout(() => {
          toastEl.classList.remove('on');
          toastEl.style.transform = '';
          toastEl.style.opacity = '';
        }, 230 * K());
      } else {
        toastEl.style.transform = '';
        if (!toastEl.matches(':hover')) toastT = setTimeout(fecharToast, 1500 * K());
      }
    };
    toastEl.addEventListener('pointerup', soltar);
    toastEl.addEventListener('pointercancel', soltar);
  }

  /* ---- Tema --------------------------------------------------------------- */
  let ultimoPonto = [innerWidth / 2, innerHeight / 2];
  function alternarTema() {
    const vira = () => {
      html.classList.toggle('dark');
      rotularTema();
      corDasParticulas();
    };
    if (!polido() || reduz() || !document.startViewTransition) return vira();
    const [x, y] = ultimoPonto;
    const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    html.classList.add('px-vt');
    const vt = document.startViewTransition(vira);
    vt.ready
      .then(() =>
        html.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
          { duration: 850 * K(), easing: EIO, pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => {});
    vt.finished.finally(() => html.classList.remove('px-vt'));
  }

  /* ---- Partículas do tema (já existem no app) e rajadas de comemoração ---- */
  const cv = $('.px-particulas');
  const cx = cv.getContext('2d');
  let pts = [];
  let raj = [];
  let cor = '#f04e23';
  function corDasParticulas() {
    cor = getComputedStyle(html).getPropertyValue('--q-acento').trim() || getComputedStyle(html).getPropertyValue('--accent').trim() || cor;
  }
  function medirTela() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  let mouse = [innerWidth / 2, innerHeight / 2];
  const aura = [innerWidth / 2, innerHeight / 3];
  const auraEl = $('.px-aura');
  addEventListener('pointermove', (e) => (mouse = [e.clientX, e.clientY]), { passive: true });
  function semear() {
    pts = Array.from({ length: 46 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: 1 + Math.random() * 2,
      z: 0.2 + Math.random(),
      vx: (Math.random() - 0.5) * 6,
      vy: -(4 + Math.random() * 12),
      a: 0.22 + Math.random() * 0.45,
      f: Math.random() * 6,
    }));
  }
  function rajada(x, y, n = 14, forca = 1) {
    if (reduz()) return;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const v = (110 + Math.random() * 220) * forca;
      raj.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 80, vida: 1, r: 2 + Math.random() * 3.5, g: 520, q: 1.3 });
    }
  }
  const CORES = ['#f04e23', '#ffb347', '#3f9b56', '#5b6ee1', '#f6d55c', '#ff7aa2'];
  function confete(n = 170) {
    if (reduz()) return;
    for (let i = 0; i < n; i++) {
      raj.push({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 160,
        vy: 120 + Math.random() * 260,
        vida: 1,
        r: 4 + Math.random() * 5,
        g: 160,
        q: 0.3,
        cor: CORES[i % CORES.length],
        giro: Math.random() * 6,
        vg: (Math.random() - 0.5) * 14,
      });
    }
  }
  let tAnt = performance.now();
  function quadro(t) {
    const real = (t - tAnt) / 1000 / K();
    const dt = Math.min(0.05, real);
    tAnt = t;
    const vivo = polido();
    const px = (mouse[0] / innerWidth - 0.5) * 60;
    const py = (mouse[1] / innerHeight - 0.5) * 60;
    aura[0] += (mouse[0] - aura[0]) * 0.07;
    aura[1] += (mouse[1] - aura[1]) * 0.07;
    if (vivo) {
      const mr = main.getBoundingClientRect();
      auraEl.style.transform = `translate(${aura[0] - mr.left - 310}px, ${aura[1] - mr.top - 310}px)`;
    }
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pts) {
      if (!reduz()) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.f += dt * 2;
        if (p.y < -6) {
          p.y = innerHeight + 6;
          p.x = Math.random() * innerWidth;
        }
      }
      cx.fillStyle = cor;
      cx.globalAlpha = p.a * (vivo ? 0.65 + 0.35 * Math.sin(p.f) : 1);
      cx.beginPath();
      cx.arc(p.x - (vivo ? px * p.z : 0), p.y - (vivo ? py * p.z : 0), p.r, 0, 6.3);
      cx.fill();
    }
    for (const p of raj) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= real * p.q;
      cx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
      cx.fillStyle = p.cor || cor;
      if (p.cor) {
        p.giro += p.vg * dt;
        cx.save();
        cx.translate(p.x, p.y);
        cx.rotate(p.giro);
        cx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        cx.restore();
      } else {
        cx.beginPath();
        cx.arc(p.x, p.y, p.r, 0, 6.3);
        cx.fill();
      }
    }
    raj = raj.filter((p) => p.vida > 0 && p.y < innerHeight + 40);
    cx.globalAlpha = 1;
    if (!document.hidden) requestAnimationFrame(quadro);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tAnt = performance.now();
      requestAnimationFrame(quadro);
    }
  });
  addEventListener('resize', medirTela);
  const centro = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };

  /* ---- Missão concluída (momento raro: aqui mora o orçamento de encanto) -- */
  const CHECK =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  async function simularMissao() {
    if (atual !== 'inicio') mostrar('inicio', { origem: 'seco' });
    if (ex.missoes.palavras[0] >= 3) {
      ex.missoes = structuredClone(INICIAL);
      ex.seeds = 420;
      mostrar('inicio', { origem: 'seco' });
      await espera(350);
    }
    const cartao = $('[data-missao="palavras"]', tela);
    cartao.scrollIntoView({ block: 'nearest', behavior: reduz() ? 'auto' : 'smooth' });
    const sementes = $('[data-testid="progresso-no-inicio"] .q-chip', tela);
    const de = ex.seeds;
    ex.missoes.palavras[0] = 3;
    ex.seeds += 5;
    if (!polido()) {
      pintarInicio();
      return toast('Missão concluída: +5 Seeds');
    }
    /* Som, toque e imagem no mesmo quadro: a vibração dispara junto com a troca. */
    navigator.vibrate?.(12);
    const ic = $('.q-ic', cartao);
    const antigo = $('svg', ic);
    pintarInicio();
    trocaTexto(sementes, /\d+ Seeds/, `${de} Seeds`);
    if (reduz()) {
      ic.innerHTML = CHECK;
      trocaTexto(sementes, /\d+ Seeds/, `${ex.seeds} Seeds`);
      return toast('Missão concluída: +5 Seeds');
    }
    anima(antigo, [{ opacity: 0, filter: 'blur(4px)', transform: 'scale(0.7)' }], { d: 120, e: 'ease', fill: 'forwards' }).finished.then(() => {
      ic.innerHTML = CHECK;
      anima($('svg', ic), [{ opacity: 0, filter: 'blur(4px)', transform: 'scale(0.6)' }, { opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }], { d: 320, e: MOLA });
      anima(ic, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { d: 420 });
      rajada(...centro(ic), 30, 1.3);
      anima(cartao, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { d: 700, e: MOLA });
      anima(cartao, [{ boxShadow: '0 0 0 0 rgb(63 155 86 / 0.7)' }, { boxShadow: '0 0 0 26px rgb(63 155 86 / 0)' }], { d: 900 });
    });
    await espera(420);
    const nó = [...sementes.childNodes].find((n) => n.nodeType === 3);
    contar((v) => (nó.nodeValue = `${v} Seeds`), de, ex.seeds, 500);
    anima(sementes, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { d: 360 });
    const r = sementes.getBoundingClientRect();
    const mais = document.createElement('span');
    mais.className = 'px-mais-um';
    mais.textContent = '+5';
    mais.style.left = r.right - 34 + 'px';
    mais.style.top = r.top - 6 + 'px';
    document.body.append(mais);
    anima(
      mais,
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(-10px)', offset: 0.3 },
        { opacity: 0, transform: 'translateY(-28px)' },
      ],
      { d: 950, e: 'ease-out', fill: 'forwards' },
    ).finished.then(() => mais.remove());
    toast('Missão concluída: +5 Seeds');
    setTimeout(() => oferta('conquista'), 2600 * K());
  }

  /* ---- Jogo da memória ---------------------------------------------------- */
  const PARES = {
    medicina: 'medicine',
    derramar: 'spill',
    prateleira: 'shelf',
    tempestade: 'storm',
    toalha: 'towel',
    fêmea: 'female',
    costa: 'coast',
    ódio: 'hate',
  };
  const parDe = (t) => PARES[t] || Object.keys(PARES).find((k) => PARES[k] === t);
  let jogo = null;

  function iniciarJogo() {
    jogo = { abertas: [], pares: 0, pontos: 0, combo: 1, trava: false };
    if (!polido() || reduz()) return;
    /* As cartas saem de um monte embaixo do tabuleiro, uma a uma. */
    const [mx, my] = centro($('.tabuleiro', tela));
    $$('.carta', tela).forEach((c, i) => {
      const [x, y] = centro(c);
      anima(
        c,
        [
          { opacity: 0, transform: `translate(${mx - x}px, ${my - y + 260}px) rotate(${(i % 2 ? 1 : -1) * (10 + i * 2)}deg) scale(0.5)` },
          { opacity: 1, offset: 0.2 },
          { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
        ],
        { d: 760, atraso: 200 + i * 55, e: MOLA_SUAVE },
      );
    });
    anima($('.hud', tela), [{ opacity: 0, transform: 'translateY(-20px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 600 });
  }
  function face(c, aberta) {
    if (aberta) {
      c.classList.add('virada');
      c.setAttribute('aria-label', c.dataset.texto);
      c.innerHTML = '<span class="line-clamp-3 break-words" dir="ltr"></span>';
      c.firstChild.textContent = c.dataset.texto;
    } else {
      c.classList.remove('virada');
      c.setAttribute('aria-label', 'Carta virada');
      c.innerHTML = '<span class="verso" aria-hidden="true">?</span>';
    }
  }
  async function girar(c, aberta) {
    const vez = (c._vez = (c._vez || 0) + 1);
    if (!polido() || reduz()) return face(c, aberta);
    /* Giro em dois tempos: a carta levanta e fecha até ficar de perfil, troca a face, abre e pousa com mola.
       Se outro giro da mesma carta começar no meio, este desiste e o novo parte de onde a carta está. */
    try {
      await anima(c, [{ transform: 'rotateY(90deg) scale(1.14)' }], { d: 190, e: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished;
    } catch {
      /* cancelada por um giro mais novo */
    }
    if (c._vez !== vez) return;
    face(c, aberta);
    limpar(c);
    anima(c, [{ transform: 'rotateY(-90deg) scale(1.14)' }, { transform: 'rotateY(0deg) scale(1)' }], { d: 520, e: MOLA_SUAVE });
  }
  function placar(antes) {
    const pts = $('.hud-bloco b', tela);
    if (polido()) contar((v) => (pts.textContent = v), antes, jogo.pontos, 450);
    else pts.textContent = jogo.pontos;
    $('.hud .mut', tela).textContent = `${jogo.pares} de 8 pares`;
    const pct = (jogo.pares / 8) * 100;
    $('.hud-progresso > span', tela).style.width = pct + '%';
    $('.hud-progresso', tela).setAttribute('aria-valuenow', pct);
    const combo = $('.combo', tela);
    combo.innerHTML = `<small>×</small>${jogo.combo}<em></em>`;
    if (polido() && !reduz() && jogo.combo > 1) {
      anima(combo, [{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1)' }], { d: 640, e: MOLA });
    }
  }
  async function tocarCarta(c) {
    if (!jogo || jogo.trava || jogo.abertas.includes(c) || c.classList.contains('virada') || c.classList.contains('par')) return;
    jogo.abertas.push(c);
    girar(c, true);
    if (jogo.abertas.length < 2) return;
    jogo.trava = true;
    const [a, b] = jogo.abertas;
    await espera(polido() ? 760 : 450);
    const antes = jogo.pontos;
    if (parDe(a.dataset.texto) === b.dataset.texto) {
      a.classList.add('par');
      b.classList.add('par');
      jogo.pares++;
      jogo.pontos += 100 * jogo.combo;
      jogo.combo++;
      if (polido()) {
        navigator.vibrate?.(10);
        if (!reduz()) {
          [a, b].forEach((x) => {
            anima(x, [{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-3deg)' }, { transform: 'scale(1)' }], { d: 720, e: MOLA });
            anima(x, [{ boxShadow: '0 0 0 0 rgb(63 155 86 / 0.8)' }, { boxShadow: '0 0 0 28px rgb(63 155 86 / 0)' }], { d: 800 });
            rajada(...centro(x), 18, 1.2);
          });
        }
      }
    } else {
      jogo.combo = 1;
      if (polido() && !reduz()) {
        [a, b].forEach((x) =>
          anima(x, [0, -12, 12, -9, 9, -5, 5, 0].map((v) => ({ transform: `translateX(${v}px) rotate(${v / 4}deg)` })), { d: 480, e: 'ease-out' }),
        );
        await espera(520);
      } else {
        await espera(400);
      }
      girar(a, false);
      girar(b, false);
    }
    jogo.abertas = [];
    jogo.trava = false;
    placar(antes);
    if (jogo.pares === 8) {
      toast('Rodada completa: 8 de 8 pares');
      if (polido() && !reduz()) {
        $$('.carta', tela).forEach((x, i) =>
          anima(x, [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-22px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }], {
            d: 700,
            atraso: i * 55,
            e: MOLA,
          }),
        );
        confete();
      }
    }
  }

  /* ---- Intérprete: inverter idiomas --------------------------------------- */
  function inverter(b) {
    const [a, c] = $$('.par-idiomas .campo-idioma .v', tela);
    const dx = c.getBoundingClientRect().left - a.getBoundingClientRect().left;
    const t = a.innerHTML;
    a.innerHTML = c.innerHTML;
    c.innerHTML = t;
    if (!polido() || reduz()) return;
    b._g = (b._g || 0) + 180;
    anima(
      $('svg', b),
      [
        { transform: `rotate(${b._g - 180}deg) scale(1)` },
        { transform: `rotate(${b._g - 90}deg) scale(1.35)` },
        { transform: `rotate(${b._g}deg) scale(1)` },
      ],
      { d: 700, e: EIO, fill: 'forwards' },
    );
    /* FLIP: o texto já trocou; cada um parte de onde estava e atravessa até o lugar novo, em arco. */
    const campos = $$('.par-idiomas .campo-idioma', tela);
    campos.forEach((x) => (x.style.overflow = 'visible'));
    [a, c].forEach((v, i) => {
      const s = i ? -1 : 1;
      v.style.display = 'inline-block';
      anima(
        v,
        [
          { transform: `translate(${dx * s}px, 0) scale(1)` },
          { transform: `translate(${(dx * s) / 2}px, ${-26 * s}px) scale(1.12)`, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { d: 760, e: EIO },
      );
    });
  }

  /* ---- Cliques ------------------------------------------------------------ */
  function abaLocal(aba) {
    if (aba.disabled || aba.getAttribute('aria-disabled') === 'true') return;
    const g = aba.closest('.q-abas');
    const attr = aba.hasAttribute('aria-checked') ? 'aria-checked' : 'aria-selected';
    $$('.q-aba', g).forEach((b) => b.setAttribute(attr, b === aba));
    porPilula(g);
  }

  raiz.addEventListener('click', (e) => {
    if (e.target.closest?.('dialog')) return; /* cada diálogo cuida dos próprios cliques */
    if (folha && folha.el.contains(e.target)) return cliqueNaFolha(e);
    const b = e.target.closest('button, [role="tab"], [role="radio"], [role="switch"]');
    if (!b) return;
    if (!trilho.contains(b)) for (const g of ganchos) if (g(e, b)) return;

    const item = b.closest('.q-item');
    if (item && trilho.contains(item)) {
      const i = itens.indexOf(item);
      if (item === maisBtn) return abrirFolha('mais', maisBtn);
      if (item.classList.contains('q-busca-botao')) return abrirBusca('clique');
      return ir(ROTAS[i]);
    }

    const aba = b.closest('.q-aba');
    if (aba) {
      const g = aba.closest('.q-abas');
      if (PRIMARIA[atual] && g.matches(PRIMARIA[atual]) && !aba.disabled) {
        const i = $$('.q-aba', g).indexOf(aba);
        if (i !== (abaDe[atual] || 0)) mostrar(atual, { aba: i, origem: 'aba' });
        return;
      }
      return abaLocal(aba);
    }

    if (b.classList.contains('q-interruptor') || b.getAttribute('role') === 'switch') {
      b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true');
      return;
    }

    const t = txt(b);
    const tile = b.closest('.q-tile');
    if (atual === 'inicio') {
      if (tile) return ir({ 'Legendar agora': 'capturar', Conversar: 'interprete', Jogar: 'jogar' }[txt($('b', tile))]);
      if (b.matches('[data-testid="progresso-no-inicio"]')) return ir('estatisticas');
    }
    if (atual === 'jogar') {
      if (tile) return /Memória/.test(txt(tile)) ? ir('jogo') : toast('Neste protótipo, só a Memória abre.');
      if ((b.getAttribute('aria-label') || '').startsWith('Trocar')) return abrirFolha('fonte', b);
      if (/^(Partida rápida|Começar)/.test(t)) return ir('jogo');
    }
    if (atual === 'jogo') {
      if (b.classList.contains('carta')) return tocarCarta(b);
      if (b.classList.contains('voltar')) return ir('jogar');
      if (b.dataset.acao === 'recomecar') return mostrar('jogo', { origem: 'clique' });
      return;
    }
    if (atual === 'interprete' && b.getAttribute('aria-label') === 'Inverter os idiomas') return inverter(b);
    if (atual === 'capturar' && /^Intérprete/.test(t)) return ir('interprete');
    if (atual === 'estatisticas' && /^Praticar agora/.test(t)) return ir('jogar');
  });

  /* Luz que segue o ponteiro + inclinação 3D com mola.
     Só em cartões que são botões (q-tile, q-linha): cartão de conteúdo não inclina nem acende.
     Uma luz por vez na tela inteira: ao trocar de cartão, todas as outras saem. */
  let til = null;
  let comLuz = null;
  function soltarTilt() {
    if (til) til.saindo = true;
  }
  function zerarTilt() {
    if (!til) return;
    til.el.style.transform = '';
    til.el.style.transition = '';
    til = null;
  }
  function quadroTilt() {
    const t = til;
    if (!t) return;
    if (!t.el.isConnected || !polido()) return zerarTilt();
    const alvo = t.saindo ? [0, 0, 0, 1] : [t.ax, t.ay, -6, t.aperta ? 0.96 : 1.02];
    t.v = t.v.map((v, i) => v + (alvo[i] - v) * 0.16);
    const [rx, ry, y, s] = t.v;
    if (t.saindo && Math.abs(rx) + Math.abs(ry) + Math.abs(y) + Math.abs(s - 1) * 100 < 0.1) return zerarTilt();
    t.el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${y}px) scale(${s})`;
    requestAnimationFrame(quadroTilt);
  }
  function apagarLuzes(menos) {
    for (const l of $$('.px-luz')) {
      if (menos && l === menos) continue;
      l.classList.remove('on');
      setTimeout(() => l.remove(), 320);
    }
  }
  function soltarPonteiro() {
    comLuz = null;
    apagarLuzes();
    soltarTilt();
  }
  raiz.addEventListener('pointermove', (e) => {
    if (!polido() || reduz() || e.pointerType === 'touch') return;
    const c = e.target.closest?.('button.q-tile:not(.apagado):not(:disabled), button.q-linha:not(:disabled)');
    if (c !== comLuz) {
      comLuz = c;
      let l = null;
      if (c) {
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        l = document.createElement('i');
        l.className = 'px-luz';
        l.setAttribute('aria-hidden', 'true');
        c.append(l);
        requestAnimationFrame(() => l.isConnected && l.classList.add('on'));
      }
      apagarLuzes(l);
    }
    if (c) {
      const r = c.getBoundingClientRect();
      const l = c.lastElementChild;
      if (l?.classList.contains('px-luz')) {
        l.style.setProperty('--mx', e.clientX - r.left + 'px');
        l.style.setProperty('--my', e.clientY - r.top + 'px');
      }
    }
    const k = c && c.matches('.q-tile:not(.em-linha)') ? c : null;
    if (!k) return soltarTilt();
    if (til && til.el !== k) zerarTilt();
    const r = k.getBoundingClientRect();
    const forca = Math.min(1, 320 / r.width) * 8;
    const novo = !til;
    til ??= { el: k, v: [0, 0, 0, 1] };
    til.saindo = false;
    til.ay = ((e.clientX - r.left) / r.width - 0.5) * 2 * forca;
    til.ax = -((e.clientY - r.top) / r.height - 0.5) * 2 * forca;
    if (novo) {
      k.style.transition = 'box-shadow 0.25s ease, border-color 0.16s ease, background-color 0.16s ease';
      requestAnimationFrame(quadroTilt);
    }
  });
  raiz.addEventListener('pointerleave', soltarPonteiro);
  document.addEventListener('pointerleave', soltarPonteiro);
  addEventListener('blur', soltarPonteiro);

  addEventListener('pointerup', () => til && (til.aperta = false));
  document.addEventListener('pointerdown', (e) => (ultimoPonto = [e.clientX, e.clientY]), true);
  raiz.addEventListener('pointerdown', (e) => {
    if (til) til.aperta = true;
    if (!polido() || reduz()) return;
    const b = e.target.closest('.q-ctl, .btn, .q-chip, .q-aba, .q-tile, .q-linha, .q-item, .campo-idioma, .cmd-item');
    if (!b || b.disabled) return;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    const r = b.getBoundingClientRect();
    const d = Math.hypot(r.width, r.height) * 2;
    const caixa = document.createElement('i');
    caixa.className = 'px-onda-caixa';
    caixa.setAttribute('aria-hidden', 'true');
    const o = document.createElement('i');
    o.className = 'px-onda';
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    caixa.append(o);
    b.append(caixa);
    const some = () => caixa.remove();
    anima(o, [{ transform: 'scale(0)', opacity: 0.28 }, { transform: 'scale(1)', opacity: 0 }], { d: 750, fill: 'forwards' }).finished.then(some, some);
  });

  main.addEventListener(
    'scroll',
    (e) => {
      if (e.target.matches?.('.q-palco, .rolagem')) main.toggleAttribute('data-px-rolou', e.target.scrollTop > 6);
    },
    { capture: true, passive: true },
  );

  /* ---- Barra do protótipo e auditoria ------------------------------------- */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="px-barra" role="toolbar" aria-label="Controles do protótipo">
      <button type="button" data-px-acao="demo" aria-pressed="false" title="Percorre todos os efeitos sozinho">▶ Demonstração</button>
      <div class="px-seg"><i></i>
        <button type="button" data-px-modo="off" title="O app como está em produção">Atual</button>
        <button type="button" data-px-modo="on" title="Com a camada de polimento">Polido</button>
      </div>
      <div class="px-seg px-seg-ap" title="Ver em outros aparelhos: Atual e Polido lado a lado"><i></i>
        <button type="button" data-px-ap="pc" aria-pressed="true">Computador</button>
        <button type="button" data-px-ap="tablet" aria-pressed="false">Tablet</button>
        <button type="button" data-px-ap="celular" aria-pressed="false">Celular</button>
      </div>
      <span class="px-sep"></span>
      <button type="button" data-px-acao="lento" aria-pressed="false" title="Tudo 5× mais devagar, para ver os detalhes">Câmera lenta</button>
      <button type="button" data-px-acao="tema">Tema</button>
      <button type="button" data-px-acao="som" aria-pressed="true" title="Sons curtos em cada gesto, sintetizados na hora">Som</button>
      <button type="button" data-px-acao="vibra" aria-pressed="true" title="Vibração do aparelho (celular)">Vibração</button>
      <button type="button" data-px-acao="acess" aria-pressed="false" title="Ligado: respeita 'reduzir movimento' e 'reduzir transparência' do Windows, como o app real deve fazer. Desligado: mostra tudo.">Seguir o sistema</button>
      <span class="px-sep"></span>
      <button type="button" data-px-acao="missao">Simular missão</button>
      <button type="button" data-px-acao="toast">Simular aviso</button>
      <button type="button" data-px-acao="oferta" title="Mostra a sugestão do Premium como ela apareceria depois de uma conquista">Simular oferta</button>
      <button type="button" data-px-acao="repetir">Repetir entrada</button>
      <span class="px-sep"></span>
      <button type="button" data-px-acao="auditoria">Auditoria</button>
      <button type="button" data-px-acao="recolher" aria-label="Recolher ou abrir a barra do protótipo" title="Recolher a barra">⌄</button>
    </div>
    <div class="px-legenda" role="status" aria-live="polite"></div>
    <div class="px-aud-fundo"></div>
    <aside class="px-aud" aria-label="Auditoria de movimento e acabamento" tabindex="-1">${D.auditoria}</aside>`,
  );
  const barra = $('.px-barra');
  function marcarSeg(sel) {
    const i = $('i', sel.parentElement);
    i.style.width = sel.offsetWidth + 'px';
    i.style.transform = `translateX(${sel.offsetLeft - 2}px)`;
  }

  /* ---- Aparelhos: a mesma página em molduras, Atual e Polido lado a lado ---- */
  const APARELHOS = { tablet: [820, 1180, 'Tablet · 820 × 1180'], celular: [390, 844, 'Celular · 390 × 844'] };
  let aparelho = 'pc';
  const quadros = () => $$('.px-palco-ap iframe');
  const aosQuadros = (msg) => quadros().forEach((f) => f.contentWindow?.postMessage({ px: msg }, '*'));
  function ajustarPalco() {
    const palco = $('.px-palco-ap');
    if (!palco) return;
    const [w, h] = APARELHOS[aparelho];
    const s = Math.min(1, (innerHeight - 150) / (h + 28), (innerWidth - 80) / (2 * (w + 28) + 48));
    for (const m of $$('.px-moldura', palco)) {
      m.style.width = (w + 28) * s + 'px';
      m.style.height = (h + 28) * s + 'px';
      const f = $('iframe', m);
      f.style.width = w + 'px';
      f.style.height = h + 'px';
      f.style.transform = `scale(${s})`;
      m.style.setProperty('--s', s);
    }
  }
  function verAparelho(qual) {
    aparelho = qual;
    $$('[data-px-ap]', barra).forEach((b) => b.setAttribute('aria-pressed', b.dataset.pxAp === qual));
    marcarSeg($(`[data-px-ap="${qual}"]`, barra));
    $('.px-palco-ap')?.remove();
    document.body.classList.toggle('px-em-aparelho', qual !== 'pc');
    if (qual === 'pc') return;
    const tema = (html.classList.contains('dark') ? '&tema=escuro' : '') + (/^[a-z]+$/.test(html.dataset.theme || '') ? '&pele=' + html.dataset.theme : '');
    const base = location.pathname.split('/').pop() || '';
    const um = (modoDoQuadro, rotulo) =>
      `<figure class="px-ap"><figcaption>${rotulo}</figcaption><div class="px-moldura ${qual}"><iframe title="${rotulo}" src="${base}?embutido=1&px=${modoDoQuadro}${tema}"></iframe></div></figure>`;
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="px-palco-ap"><p class="px-ap-titulo">${APARELHOS[qual][2]} · mova o mouse em volta dos aparelhos para simular o giroscópio</p><div class="px-ap-linha">${um('off', qual === 'celular' ? 'Desenho novo, sem adaptar' : 'Atual (produção)')}${um('on', 'Polido')}</div></div>`,
    );
    ajustarPalco();
    const palco = $('.px-palco-ap');
    /* Giroscópio simulado: o mouse inclina as molduras e cada página recebe a inclinação como se fosse o sensor. */
    const inclinar = (nx, ny) => {
      $$('.px-moldura', palco).forEach((m) => (m.style.transform = `perspective(1600px) rotateY(${nx * 16}deg) rotateX(${-ny * 10}deg)`));
      quadros().forEach((f) => f.contentWindow?.postMessage({ pxGiro: [ny * 24, nx * 24] }, '*'));
    };
    quadros().forEach((f) => f.addEventListener('load', () => f.contentWindow?.postMessage({ pxGiro: [0, 0] }, '*')));
    palco.addEventListener('pointermove', (e) => {
      const r = palco.getBoundingClientRect();
      inclinar(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    palco.addEventListener('pointerleave', () => inclinar(0, 0));
    anima(palco, [{ opacity: 0 }, { opacity: 1 }], { d: 300, e: 'ease' });
    $$('.px-ap', palco).forEach((f, i) =>
      anima(f, [{ opacity: 0, transform: 'translateY(60px) scale(0.92)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 760, atraso: 80 + i * 120, e: MOLA_SUAVE }),
    );
  }
  addEventListener('resize', ajustarPalco);
  if (EMBUTIDO) {
    if (QS.get('tema') === 'escuro') html.classList.add('dark');
    addEventListener('message', (e) => {
      const a = e.data?.px;
      if (a) $(`[data-px-acao="${a}"]`, barra)?.click();
    });
  }
  function modo(v, primeira) {
    html.dataset.px = v;
    $$('[data-px-modo]', barra).forEach((b) => b.setAttribute('aria-pressed', b.dataset.pxModo === v));
    marcarSeg($(`[data-px-modo="${v}"]`, barra));
    if (primeira) return;
    if (v === 'off') tirarPilulas();
    soltarPonteiro();
    zerarTilt();
    if (folha) fecharFolha({ seco: true, semFoco: true });
    mostrar(atual, { origem: 'seco' });
  }
  const auditoria = (abre) => {
    document.body.classList.toggle('px-aud-aberta', abre);
    if (abre) $('.px-aud').focus({ preventScroll: true });
  };
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pxModo) return modo(b.dataset.pxModo);
    if (b.dataset.pxAp) return verAparelho(b.dataset.pxAp);
    /* Com aparelhos na tela, os controles agem dentro das molduras. */
    if (aparelho !== 'pc' && ['lento', 'tema', 'som', 'vibra', 'demo', 'missao', 'toast', 'oferta', 'repetir', 'acess'].includes(b.dataset.pxAcao)) {
      aosQuadros(b.dataset.pxAcao);
      if (b.dataset.pxAcao === 'tema') html.classList.toggle('dark');
      if (['lento', 'acess', 'demo'].includes(b.dataset.pxAcao)) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      return;
    }
    switch (b.dataset.pxAcao) {
      case 'lento': {
        const liga = html.dataset.pxLento !== 'on';
        html.dataset.pxLento = liga ? 'on' : 'off';
        b.setAttribute('aria-pressed', liga);
        break;
      }
      case 'tema':
        alternarTema();
        break;
      case 'demo':
        demo();
        break;
      case 'oferta':
        oferta('conquista');
        break;
      case 'acess': {
        const liga = html.dataset.pxAcess !== 'on';
        html.dataset.pxAcess = liga ? 'on' : 'off';
        b.setAttribute('aria-pressed', liga);
        aplicarAcess();
        break;
      }
      case 'missao':
        simularMissao();
        break;
      case 'toast':
        toast(polido() ? 'Palavra salva no caderno. Arraste para dispensar.' : 'Palavra salva no caderno.');
        break;
      case 'repetir':
        trocar(atual, {}, 'clique', 1);
        break;
      case 'recolher': {
        const min = barra.classList.toggle('px-min');
        b.textContent = min ? 'Protótipo ⌃' : '⌄';
        break;
      }
      case 'auditoria':
        auditoria(!document.body.classList.contains('px-aud-aberta'));
        break;
    }
  });
  $('.px-aud-fundo').addEventListener('click', () => auditoria(false));
  $('.px-aud').addEventListener('click', (e) => e.target.closest('.px-fechar') && auditoria(false));

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      return abrirBusca('teclado');
    }
    if (e.key === 'Escape') {
      if (document.body.classList.contains('px-aud-aberta')) return auditoria(false);
      if (folha && !$('.paleta-cmd')) return fecharFolha();
    }
  });

/*MODULOS*/

  /* ---- Demonstração: percorre os efeitos com legenda ----------------------- */
  let demoVez = 0;
  const legenda = $('.px-legenda');
  async function demo() {
    const botao = $('[data-px-acao="demo"]', barra);
    if (botao.getAttribute('aria-pressed') === 'true') {
      demoVez++;
      botao.setAttribute('aria-pressed', 'false');
      botao.textContent = '▶ Demonstração';
      legenda.classList.remove('on');
      return;
    }
    const vez = ++demoVez;
    botao.setAttribute('aria-pressed', 'true');
    botao.textContent = '■ Parar';
    if (!polido()) modo('on');
    if (folha) fecharFolha({ seco: true, semFoco: true });
    const aba = (i) => $$(PRIMARIA[atual] + ' .q-aba', tela)[i]?.click();
    const carta = (t) => $$('.carta', tela).find((c) => c.dataset.texto === t)?.click();
    const passos = [
      ['Troca de tela: o título sobe palavra por palavra e os blocos entram em cascata, com desfoque', 2800, () => ir('jogar')],
      ['Rolagem: cada cartão só entra quando chega na vista', 2800, () => rolagem()?.scrollTo({ top: 620, behavior: 'smooth' })],
      ['Trilho: a pílula desliza com mola e o ícone salta', 2600, () => ir('estatisticas')],
      ['Abas: a pílula corre até a aba e o painel entra pelo lado', 2400, () => aba(3)],
      ['…e volta pelo outro lado', 2400, () => aba(1)],
      ['Painel Mais: nasce do botão; a tela de trás recua, arredonda e desfoca', 3200, () => abrirFolha('mais', maisBtn)],
      ['Tema: a cor nova se abre em círculo', 2800, () => ((ultimoPonto = centro($('.q-faixa-do-mais .q-ctl', folha.painel))), alternarTema())],
      ['…e fecha de volta', 2600, () => alternarTema()],
      ['O painel sai pelo mesmo caminho por onde entrou', 1600, () => fecharFolha({ semFoco: true })],
      ['Início: barras enchem, números contam, o microfone pulsa', 3400, () => ir('inicio')],
      ['Missão concluída: o ícone vira "certo", faíscas, +5 Seeds', 3800, () => simularMissao()],
      ['Memória: as cartas são distribuídas de um monte', 3400, () => ir('jogo')],
      ['Giro 3D em dois tempos…', 1200, () => carta('medicina')],
      ['Par certo: salto, anel verde e faíscas', 2800, () => carta('medicine')],
      ['Par errado: as cartas tremem e desviram', 1000, () => carta('costa')],
      ['', 3400, () => carta('hate')],
      ['Aviso: entra com mola. Arraste para cima ou para o lado para dispensar', 3800, () => toast('Palavra salva no caderno. Arraste para dispensar.')],
      ['Captura ao vivo: as palavras chegam uma a uma e a tradução assume a linha', 10500, () => (ir('aovivo'), setTimeout(() => $('[data-px="iniciar"]', tela)?.click(), 1500 * K()))],
      ['Legendas flutuantes: arraste e jogue a janelinha; ela pousa no canto para onde ia', 4500, () => !celular() && abrirFlutuante()],
      ['Toque numa frase: ações, palavras e a Tradução Nuance com cadeado à vista', 5000, () => abrirFrase(0)],
      ['', 700, () => (fecharFolhaDeBaixo(), flut && fecharFlutuante())],
      ['Encerrar leva à Biblioteca. Só depois, sem cobrir nada, vem a sugestão do Premium', 6000, () => $('[data-px="encerrar"]', tela)?.click()],
      ['Planos é uma tela fixa (Mais, Início, Ajustes e busca levam a ela): Grátis inteiro, Premium com 14 dias sem cartão', 6500, () => (fecharOferta(), ir('planos'))],
      ['Intérprete: cada um toca a sua metade e a tradução aparece do lado do outro, virada para ele', 3000, () => ir('interpretando')],
      ['', 5200, () => falar('meu')],
      ['', 5200, () => falar('outro')],
      ['Personalizar: toque num tema e o app inteiro se repinta a partir do clique', 3200, () => ir('personalizar')],
      ['', 3600, () => ((ultimoPonto = centro($('[data-px-tema="jardim"]', tela))), provarTema('jardim'))],
      ['', 2600, () => ((ultimoPonto = centro($('[data-px-tema="babel"]', tela))), provarTema('babel'))],
      ['Temporada: trilha de recompensas, grátis em cima e assinante embaixo', 4500, () => mostrar('personalizar', { aba: 2, origem: 'aba' })],
      ['Loja: cada item mostra quanto falta; para gastar Seeds, segure o botão', 5000, () => mostrar('personalizar', { aba: 4, origem: 'aba' })],
      ['Agora é com você: passe o mouse nos cartões (inclinam em 3D, com uma luz seguindo o ponteiro)', 5000, () => ir('inicio')],
    ];
    for (const [texto, ms, faz] of passos) {
      if (vez !== demoVez) return;
      if (texto) {
        legenda.textContent = texto;
        legenda.classList.add('on');
      }
      faz();
      await espera(ms);
    }
    if (vez !== demoVez) return;
    legenda.classList.remove('on');
    botao.setAttribute('aria-pressed', 'false');
    botao.textContent = '▶ Demonstração';
  }

  /* ---- Partida ------------------------------------------------------------ */
  aplicarAcess();
  marcarSeg($('[data-px-ap="pc"]', barra));
  corDasParticulas();
  medirTela();
  semear();
  requestAnimationFrame(quadro);
  modo(html.dataset.px === 'off' ? 'off' : 'on', true);
  trocar('inicio', {}, 'clique', 1);
})();
