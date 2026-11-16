/*
 * O FILME DA HOME, ROLADO PELA PÁGINA (motor portado do scroll-scrub do Higgsfield, em JS puro).
 *
 *  - Cada capítulo (`[data-capitulo]`) tem um clipe; a camada dele (`[data-camada]`) aparece por distância,
 *    numa passagem suave entre capítulos.
 *  - O clipe é baixado inteiro (Blob) quando o capítulo está a 1,5 tela: pular de quadro não depende do
 *    servidor aceitar pedidos por partes, e voltar a rolagem não baixa de novo.
 *  - Pulos enfileirados: nunca pede um quadro novo enquanto o anterior ainda decodifica (`video.seeking`).
 *  - Suavização (0,2 por quadro) e limiar por aparelho, para não tremer.
 *  - Celular, tela pequena ou economia de dados: o clipe de 720p (`data-clipe-celular`).
 *  - A capa (primeiro quadro do mesmo clipe) fica até o vídeo pintar o primeiro quadro.
 *  - iPhone: o primeiro toque "acorda" os vídeos (play/pause); sem isso o Safari não pinta o quadro pedido.
 *  - Movimento reduzido: só as capas, nenhum vídeo baixado.
 *  - Roda de mouse em degraus: Lenis suaviza a rolagem (se carregou); toque e trackpad seguem nativos.
 * Sem este arquivo, a home continua inteira: as capas paradas e todo o texto.
 */
(() => {
  const rolo = document.getElementById('rolo');
  if (!rolo) return;
  const menos = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toque = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const pequena = matchMedia('(max-width: 860px)');
  const con = navigator.connection;
  const economia = !!(con && (con.saveData || /2g/.test(con.effectiveType || '')));
  const celular = () => toque || pequena.matches || economia;
  const lim = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const suave = (x) => {
    x = lim(x);
    return x * x * (3 - 2 * x);
  };

  let lenis = null;
  if (!menos && !toque && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true });
    const passo = (t) => {
      lenis.raf(t);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  const rota = document.getElementById('rota');
  const camadas = [...rolo.querySelectorAll('[data-camada]')];
  const caps = [...rolo.querySelectorAll('[data-capitulo]')];
  const seg = caps.map((el, i) => {
    const s = {
      el,
      camada: camadas[i],
      clipe: el.dataset.clipe,
      clipeCelular: el.dataset.clipeCelular,
      ini: 0,
      fim: 0,
      alvo: 0,
      atual: 0,
    };
    const leg = el.querySelector('[data-leg]');
    if (leg) {
      const o = leg.querySelector('.o');
      o.replaceChildren(
        ...o.textContent.split(' ').map((p) => Object.assign(document.createElement('span'), { textContent: p + ' ' })),
      );
      s.palavras = [...o.children];
      s.trad = leg.querySelector('.t');
    }
    return s;
  });
  const fonteDe = (s) => (celular() && s.clipeCelular ? s.clipeCelular : s.clipe);

  let topoDoRolo = 0;
  let total = 1;
  let alturaTela = innerHeight;
  let largura = innerWidth;
  let sujo = true;
  let ativo = -1;
  let gesto = false;

  caps.forEach((el, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = el.dataset.rotulo;
    b.addEventListener('click', () => {
      const y = topoDoRolo + seg[i].ini + 0.3 * (seg[i].fim - seg[i].ini);
      if (lenis) lenis.scrollTo(y);
      else scrollTo({ top: y, behavior: menos ? 'auto' : 'smooth' });
    });
    rota.append(b);
  });
  const botoes = [...rota.children];

  function descarregar(s) {
    if (s.abort) s.abort.abort();
    if (s.video) s.video.remove();
    if (s.url) URL.revokeObjectURL(s.url);
    Object.assign(s, { video: null, url: null, fonte: null, carregando: false, pronto: false, falhou: false });
    delete s.camada.dataset.pintado;
  }

  function medir() {
    const y = scrollY;
    topoDoRolo = rolo.getBoundingClientRect().top + y;
    alturaTela = innerHeight;
    largura = innerWidth;
    for (const s of seg) {
      if (s.fonte && s.fonte !== fonteDe(s)) descarregar(s);
      const r = s.el.getBoundingClientRect();
      s.ini = r.top + y - topoDoRolo;
      s.fim = s.ini + r.height - alturaTela;
    }
    total = Math.max(seg[seg.length - 1].fim, 1);
    sujo = true;
  }

  async function acordar(v) {
    if (!v || !celular()) return;
    try {
      await v.play();
      v.pause();
    } catch {
      /* fica a capa; o próximo gesto tenta de novo */
    }
  }

  async function carregar(s) {
    if (menos || s.carregando || s.pronto || s.falhou) return;
    const fonte = fonteDe(s);
    s.carregando = true;
    s.fonte = fonte;
    s.abort = new AbortController();
    try {
      const r = await fetch(fonte, { signal: s.abort.signal });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      if (s.fonte !== fonte) return;
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      s.url = URL.createObjectURL(blob);
      v.src = s.url;
      v.addEventListener(
        'loadedmetadata',
        () => {
          s.pronto = true;
          s.carregando = false;
          sujo = true;
        },
        { once: true },
      );
      v.addEventListener(
        'loadeddata',
        () => {
          if (gesto) acordar(v);
        },
        { once: true },
      );
      v.addEventListener(
        'seeked',
        () => {
          s.camada.dataset.pintado = '';
        },
        { once: true },
      );
      v.addEventListener(
        'error',
        () => {
          s.falhou = true;
          s.carregando = false;
          v.remove();
        },
        { once: true },
      );
      s.camada.append(v);
      s.video = v;
    } catch (e) {
      if (e.name !== 'AbortError') {
        s.falhou = true;
        s.carregando = false;
      }
    }
  }

  function lerRolagem() {
    const y = lim(scrollY - topoDoRolo, 0, total + alturaTela);
    const passagem = 0.35 * alturaTela;
    let atual = 0;
    seg.forEach((s, i) => {
      if (y >= s.ini - alturaTela * 0.5) atual = i;
      const local = lim((y - s.ini) / Math.max(s.fim - s.ini, 1));
      s.alvo = local;
      const fora = y < s.ini ? s.ini - y : y > s.fim ? y - s.fim : 0;
      const op = menos ? (fora === 0 ? 1 : 0) : suave(1 - fora / passagem);
      s.camada.style.opacity = i === 0 && y <= s.ini ? '1' : String(op);
      s.camada.style.zIndex = i === atual ? '2' : '1';
      if (y > s.ini - 1.5 * alturaTela && y < s.fim + 1.5 * alturaTela) carregar(s);
      if (s.palavras) {
        // O primeiro capítulo abre a página: a frase já vem adiantada, com a tradução à vista.
        const k = i === 0 ? lim(local + 0.6) : local;
        const n = Math.max(1, Math.ceil(lim(k / 0.5) * s.palavras.length));
        s.palavras.forEach((p, j) => {
          p.style.opacity = j < n ? '1' : '0';
        });
        s.trad.classList.toggle('oculta', k < 0.5);
      }
    });
    if (atual !== ativo) {
      ativo = atual;
      botoes.forEach((b, j) =>
        j === ativo ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'),
      );
    }
    rolo.style.setProperty('--progresso', String(lim(y / total)));
  }

  function videos() {
    for (const s of seg) {
      const v = s.video;
      if (!v || !s.pronto || v.seeking) continue;
      if (Math.abs(s.atual - s.alvo) < 0.0015 && s.camada.dataset.pintado !== undefined) continue;
      s.atual += (s.alvo - s.atual) * 0.2;
      const t = lim(s.atual, 0, 0.999) * (v.duration || 1);
      if (Math.abs(v.currentTime - t) > (celular() ? 0.02 : 0.008)) {
        try {
          v.currentTime = t;
        } catch {
          /* segue o último quadro pintado */
        }
      }
    }
  }

  function tique() {
    if (sujo) {
      sujo = false;
      lerRolagem();
    }
    videos();
    requestAnimationFrame(tique);
  }

  addEventListener(
    'scroll',
    () => {
      sujo = true;
    },
    { passive: true },
  );
  addEventListener('resize', () => {
    if (toque && innerWidth === largura) return;
    medir();
  });
  addEventListener('orientationchange', medir);
  const primeiroGesto = () => {
    if (gesto) return;
    gesto = true;
    seg.forEach((s) => acordar(s.video));
  };
  addEventListener('pointerdown', primeiroGesto, { once: true, passive: true });
  addEventListener('touchstart', primeiroGesto, { once: true, passive: true });
  medir();
  requestAnimationFrame(tique);

  // Telas do app: só tocam quando aparecem.
  const visor = new IntersectionObserver(
    (itens) => {
      for (const it of itens) {
        const v = it.target;
        if (it.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          if (!menos) v.play().catch(() => {});
        } else v.pause();
      }
    },
    { threshold: 0.35 },
  );
  document.querySelectorAll('[data-quando-visivel]').forEach((v) => visor.observe(v));

  // Antes e depois: os dois lados tocam juntos; o controle move a divisa.
  const sem = document.getElementById('cmp-sem');
  const com = document.getElementById('cmp-com');
  const controle = document.getElementById('cmp-controle');
  if (sem && com && controle) {
    const camada = document.getElementById('cmp-camada');
    const divisor = document.getElementById('cmp-divisor');
    const mover = () => {
      camada.style.clipPath = `inset(0 0 0 ${controle.value}%)`;
      divisor.style.left = controle.value + '%';
    };
    controle.addEventListener('input', mover);
    mover();
    new IntersectionObserver(
      ([it]) => {
        if (it.isIntersecting && !menos) {
          sem.play().catch(() => {});
          com.play().catch(() => {});
        } else {
          sem.pause();
          com.pause();
        }
      },
      { threshold: 0.4 },
    ).observe(document.getElementById('comparar'));
    setInterval(() => {
      if (Math.abs(sem.currentTime - com.currentTime) > 0.15) com.currentTime = sem.currentTime;
    }, 500);
  }
})();
