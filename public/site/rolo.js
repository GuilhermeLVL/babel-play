/*
 * O FILME DA HOME, ROLADO PELA PÁGINA (motor portado do scroll-scrub do Higgsfield, em JS puro).
 *
 *  - Um plano-sequência só (`data-filme` no rolo); cada capítulo (`[data-capitulo]`) é um trecho dele
 *    (`data-de`/`data-ate`, em segundos) e a rolagem anda pelo filme sem corte. As capas (`[data-camada]`,
 *    um quadro de cada trecho) se revezam por distância até o filme pintar.
 *  - O filme é baixado inteiro (Blob) ao abrir a página: pular de quadro não depende do servidor aceitar
 *    pedidos por partes, e voltar a rolagem não baixa de novo.
 *  - Pulos enfileirados: nunca pede um quadro novo enquanto o anterior ainda decodifica (`video.seeking`).
 *  - Suavização (0,2 por quadro) e limiar por aparelho, para não tremer.
 *  - Celular, tela pequena ou economia de dados: o filme de 720p (`data-filme-celular`).
 *  - iPhone: o primeiro toque "acorda" o vídeo (play/pause); sem isso o Safari não pinta o quadro pedido.
 *  - Movimento reduzido: só as capas, nenhum vídeo baixado.
 *  - Roda de mouse em degraus: Lenis suaviza a rolagem (se carregou); toque e trackpad seguem nativos.
 * Sem este arquivo, a home continua inteira: as capas paradas e todo o texto.
 */
(() => {
  const rolo = document.getElementById('rolo');
  if (!rolo) return;
  document.documentElement.classList.add('js');
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
  // UM filme para o rolo inteiro: cada capítulo é um trecho dele (`data-de`/`data-ate`, em segundos) e a
  // rolagem anda pelo filme sem corte. As capas (`[data-camada]`, um quadro de cada trecho) ficam por baixo
  // até o filme pintar o primeiro quadro.
  const filme = {
    camada: rolo.querySelector('[data-filme-camada]'),
    clipe: rolo.dataset.filme,
    clipeCelular: rolo.dataset.filmeCelular,
    alvo: 0,
    atual: 0,
  };
  const seg = caps.map((el, i) => {
    const s = {
      el,
      camada: camadas[i],
      de: Number(el.dataset.de),
      ate: Number(el.dataset.ate),
      ini: 0,
      fim: 0,
    };
    const leg = el.querySelector('[data-leg]');
    if (leg) {
      const o = leg.querySelector('.o');
      const chave = o.dataset.chave;
      o.replaceChildren(
        ...o.textContent.split(' ').map((p) => {
          const w = Object.assign(document.createElement('span'), { textContent: p + ' ' });
          // A palavra que a cena explica ganha o sublinhado e é a que voa para "Suas palavras".
          if (chave && p.replace(/[^\p{L}\p{N}'-]/gu, '') === chave) {
            w.textContent = p.replace(chave, '');
            const c = Object.assign(document.createElement('span'), { className: 'chave', textContent: chave });
            w.prepend(c);
            w.append(' ');
            s.chave = c;
          }
          return w;
        }),
      );
      s.palavras = [...o.children];
      s.trad = leg.querySelector('.t');
      s.leg = leg;
    }
    // Onde está quem fala, no quadro do filme, em pontos no tempo: [[segundo, x%, y%], ...].
    s.fonte = (el.dataset.fonte || '')
      .split(',')
      .filter(Boolean)
      .map((p) => p.split(':').map(Number));
    return s;
  });

  // Marcas por cima do filme: o pulso na fonte do som, o fio até a legenda e o contador de palavras.
  const palco = rolo.querySelector('.rolo-palco');
  const marcas = rolo.querySelector('.marcas');
  const fio = marcas.querySelector('path');
  const pulso = marcas.querySelector('.pulso-do-som');
  const contador = rolo.querySelector('[data-contador]');
  let contadas = 0;
  const LIMIAR_DE_GUARDAR = 0.62;

  // Um ponto do quadro (em % do vídeo 16:9) na tela, com o recorte do `object-fit: cover`.
  function naTela(x, y) {
    const r = palco.getBoundingClientRect();
    const k = Math.max(r.width / 16, r.height / 9);
    const w = 16 * k;
    const h = 9 * k;
    return [(r.width - w) / 2 + (x / 100) * w, (r.height - h) / 2 + (y / 100) * h, r];
  }

  function fonteNoTempo(f, t) {
    if (!f.length || t < f[0][0] || t > f[f.length - 1][0]) return null;
    for (let i = 1; i < f.length; i++) {
      if (t <= f[i][0]) {
        const [t0, x0, y0] = f[i - 1];
        const [t1, x1, y1] = f[i];
        const a = (t - t0) / Math.max(t1 - t0, 0.001);
        return [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a];
      }
    }
    return f[f.length - 1].slice(1);
  }

  function desenharMarcas() {
    const s = seg[ativo];
    const pintado = filme.camada.dataset.pintado !== undefined;
    const ponto = s && pintado && !menos ? fonteNoTempo(s.fonte, filme.atual) : null;
    marcas.classList.toggle('ligadas', !!ponto);
    if (!ponto) return;
    const [px, py, r] = naTela(ponto[0], ponto[1]);
    pulso.style.transform = `translate(${px}px, ${py}px)`;
    if (!s.leg) return;
    const l = s.leg.getBoundingClientRect();
    const lx = l.right - r.left;
    const ly = l.top - r.top + 18;
    const meioX = (lx + px) / 2;
    fio.setAttribute('d', `M${lx} ${ly} C ${meioX} ${ly}, ${meioX} ${py}, ${px} ${py}`);
  }

  // A palavra da cena "voa" da legenda até o contador, que sobe. Voltando a rolagem, o número só desce.
  function voar(de) {
    const a = de.getBoundingClientRect();
    const b = contador.getBoundingClientRect();
    const v = Object.assign(document.createElement('span'), {
      className: 'palavra-voando',
      textContent: de.textContent,
    });
    v.style.transform = `translate(${a.left}px, ${a.top}px)`;
    document.body.append(v);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        v.style.transform = `translate(${b.left}px, ${b.top}px) scale(.6)`;
        v.style.opacity = '0.2';
      }),
    );
    setTimeout(() => {
      v.remove();
      contador.classList.add('bateu');
      setTimeout(() => contador.classList.remove('bateu'), 260);
    }, 700);
  }
  const fonteDe = (f) => (celular() && f.clipeCelular ? f.clipeCelular : f.clipe);

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
    if (filme.fonte && filme.fonte !== fonteDe(filme)) descarregar(filme);
    for (const s of seg) {
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
      const fora = y < s.ini ? s.ini - y : y > s.fim ? y - s.fim : 0;
      const op = menos ? (fora === 0 ? 1 : 0) : suave(1 - fora / passagem);
      s.camada.style.opacity = i === 0 && y <= s.ini ? '1' : String(op);
      s.camada.style.zIndex = i === atual ? '2' : '1';
      if (s.palavras) {
        // O primeiro capítulo abre a página: a frase já vem adiantada, com a tradução à vista.
        const k = i === 0 ? lim(local + 0.6) : local;
        const n = Math.max(1, Math.ceil(lim(k / 0.5) * s.palavras.length));
        s.palavras.forEach((p, j) => {
          p.style.opacity = j < n ? '1' : '0';
        });
        s.trad.classList.toggle('oculta', k < 0.5);
        if (s.chave) s.chave.classList.toggle('acesa', k >= 0.5);
        s.guardada = !!s.chave && k >= LIMIAR_DE_GUARDAR;
      }
    });
    const agora = seg.filter((s) => s.guardada).length;
    if (agora !== contadas) {
      if (agora > contadas && !menos) {
        const nova = seg.filter((s) => s.guardada).pop();
        if (nova?.chave) voar(nova.chave);
      }
      contadas = agora;
      contador.textContent = String(contadas);
    }
    if (atual !== ativo) {
      ativo = atual;
      botoes.forEach((b, j) =>
        j === ativo ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'),
      );
    }
    rolo.style.setProperty('--progresso', String(lim(y / total)));
    // O tempo do filme: cada capítulo vai do seu `de` ao seu `ate` enquanto a caixa dele passa (até o
    // começo da próxima), então a passagem entre capítulos é o próprio filme andando.
    let t = seg[0].de;
    seg.forEach((s, i) => {
      const prox = seg[i + 1];
      const fimDaCaixa = prox ? prox.ini : s.fim;
      if (y >= s.ini) t = s.de + lim((y - s.ini) / Math.max(fimDaCaixa - s.ini, 1)) * (s.ate - s.de);
    });
    filme.alvo = t;
    if (y < total + 1.5 * alturaTela) carregar(filme);
  }

  function videos() {
    const v = filme.video;
    if (!v || !filme.pronto || v.seeking) return;
    if (Math.abs(filme.atual - filme.alvo) < 0.01 && filme.camada.dataset.pintado !== undefined) return;
    filme.atual += (filme.alvo - filme.atual) * 0.2;
    const t = lim(filme.atual, 0, (v.duration || 1) - 0.05);
    if (Math.abs(v.currentTime - t) > (celular() ? 0.04 : 0.02)) {
      try {
        v.currentTime = t;
      } catch {
        /* segue o último quadro pintado */
      }
    }
  }

  function tique() {
    if (sujo) {
      sujo = false;
      lerRolagem();
    }
    videos();
    desenharMarcas();
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
    acordar(filme.video);
  };
  addEventListener('pointerdown', primeiroGesto, { once: true, passive: true });
  addEventListener('touchstart', primeiroGesto, { once: true, passive: true });
  medir();
  requestAnimationFrame(tique);

  // Entradas suaves (títulos e cartões) e o marca-texto: a classe `js` no <html> só esconde o que este
  // arquivo vai revelar; sem ele, tudo fica visível.
  const revelar = new IntersectionObserver(
    (itens) => {
      for (const it of itens) {
        if (!it.isIntersecting) continue;
        it.target.classList.add('visto');
        revelar.unobserve(it.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  document.querySelectorAll('[data-revelar]').forEach((el) => revelar.observe(el));

  // O fluxo (computador): o passo no meio da tela troca a tela da janela fixa e só ela toca.
  const quadros = [...document.querySelectorAll('[data-quadro]')];
  const passos = [...document.querySelectorAll('[data-passo]')];
  const pontos = [...document.querySelectorAll('.fluxo-pontos span')];
  const largo = matchMedia('(min-width: 901px)');
  let passoAtivo = -1;
  const ativarPasso = (i) => {
    if (i === passoAtivo) return;
    passoAtivo = i;
    quadros.forEach((q, j) => {
      const v = q.querySelector('video');
      q.classList.toggle('ativo', j === i);
      if (j === i && largo.matches) {
        if (v.preload === 'none') v.preload = 'auto';
        v.currentTime = 0;
        if (!menos) v.play().catch(() => {});
      } else v.pause();
    });
    passos.forEach((p, j) => p.classList.toggle('ativo', j === i));
    pontos.forEach((p, j) => p.classList.toggle('ativo', j === i));
  };
  if (passos.length) {
    passos[0].classList.add('ativo');
    // Ativo = o passo cujo TEXTO está mais perto do meio da tela (onde fica a janela), e não o primeiro
    // cuja caixa cruzou o meio: assim o título que você lê é o da tela que está tocando.
    const textos = passos.map((p) => p.querySelector('.passo-texto'));
    let pedido = false;
    const escolher = () => {
      pedido = false;
      const meio = innerHeight / 2;
      let melhor = 0;
      let menor = Infinity;
      textos.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - meio);
        if (d < menor) {
          menor = d;
          melhor = i;
        }
      });
      ativarPasso(melhor);
    };
    const secao = document.getElementById('alem');
    let naSecao = false;
    new IntersectionObserver(([it]) => {
      naSecao = it.isIntersecting;
      if (naSecao) escolher();
    }).observe(secao);
    addEventListener(
      'scroll',
      () => {
        if (!naSecao || pedido) return;
        pedido = true;
        requestAnimationFrame(escolher);
      },
      { passive: true },
    );
    // A janela só toca enquanto aparece.
    const tela = document.querySelector('.fluxo-tela');
    new IntersectionObserver(([it]) => {
      const v = quadros[passoAtivo]?.querySelector('video');
      if (!v || !largo.matches) return;
      if (it.isIntersecting && !menos) v.play().catch(() => {});
      else v.pause();
    }).observe(tela);
  }
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
