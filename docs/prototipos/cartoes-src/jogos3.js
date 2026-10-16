  /* ==========================================================================
     Rodada 12 — Rali e Mala refeitos para terem cara de jogo.
     As regras são as mesmas dos componentes reais (TenseTennisGame, KofferGame);
     muda a cena. Substitui as versões simples de jogos2.js.
     ========================================================================== */
  SIMPLES.plane = svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.500 1.500L13 8 4.800 6.200c-.5-.1-.9.1-1.100.5l-.3.5c-.2.5-.1 1 .3 1.300L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.500 5.300c.3.4.8.5 1.300.3l.5-.2c.4-.3.6-.7.5-1.200z"/>');
  /* Um texto voa de um elemento até outro (palavra indo para a etiqueta, por exemplo). */
  function voarTexto(de, para, texto) {
    if (!polido() || reduz() || !de || !para) return;
    const a = de.getBoundingClientRect();
    const b = para.getBoundingClientRect();
    document.body.insertAdjacentHTML('beforeend', `<span class="ganho" style="left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;animation:none;translate:-50% -50%;font-size:20px">${esc(texto)}</span>`);
    const v = document.body.lastElementChild;
    const fim = () => v.remove();
    anima(v, [{ transform: 'translate(0,0) scale(1.1)', opacity: 1 }, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.8)`, opacity: 0.3 }], { d: 380, e: EIO, fill: 'forwards' }).finished.then(fim, fim);
  }

  /* ---- Rali: uma quadra, um adversário e a bola como relógio -------------------- */
  Object.assign(JOGOS.tenis, {
    instr: 'A bola vem com o significado. Escreva a palavra em inglês antes de ela cair: completou certo, a raquete devolve.',
    passos: [
      'O adversário saca. A placa no alto diz o significado da palavra.',
      'Escreva a palavra em inglês. Cada letra certa acende em verde; ao completar, a sua raquete devolve sozinha.',
      'Cada devolução aumenta o rali e a bola seguinte vem mais rápida. Se ela cair, o ponto é do adversário e o rali zera.',
    ],
    montar(m) {
      pj.resposta = () => alvo;
      const fila = emb(VOC).slice(0, 8);
      const BASE = nv(11, 8, 6);
      let i = 0, rali = 0, voce = 0, ele = 0, alvo = '', anims = [], A, B;
      m.innerHTML = `<div class="rl-arena">
          <div class="rl-placar" aria-label="Placar do rali"><span><small>Você</small><b data-voce>0</b></span><span class="rl-rali"><b>${ij('flame')}<i data-rali style="font-style:normal">0</i></b><small>rali</small></span><span><small>Babel</small><b data-ele>0</b></span></div>
          <div class="rl-quadra"><svg class="rl-chao" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="rl-corte"><polygon points="26,0 74,0 98,64 2,64"/></clipPath></defs><g clip-path="url(#rl-corte)"><rect class="g1" width="100" height="64"/><rect class="g2" y="5" width="100" height="7"/><rect class="g2" y="20" width="100" height="10"/><rect class="g2" y="40" width="100" height="12"/></g><g class="ln"><polygon points="26,0 74,0 98,64 2,64"/><line x1="32" y1="0" x2="14" y2="64"/><line x1="68" y1="0" x2="86" y2="64"/><line x1="28.6" y1="12" x2="71.4" y2="12"/><line x1="19.6" y1="44" x2="80.4" y2="44"/><line x1="50" y1="12" x2="50" y2="44"/></g></svg>
            <span class="rl-raq ele"></span><div class="rl-rede"></div><span class="rl-sombra"></span><span class="rl-bola"><i></i></span><span class="rl-raq eu"></span>
            <div class="rl-pista"><small>Devolva escrevendo</small><b></b></div><p class="rl-msg" role="status"></p></div>
          <div class="rl-digita"><div class="rl-letras" aria-hidden="true"></div><input class="rl-campo" type="text" aria-label="Sua devolução" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en"></div>
          <p class="rl-dica">Enter devolve antes de completar. Tocar na quadra chama o teclado.</p></div>`;
      const q = $('.rl-quadra', m);
      const [bola, miolinho, sombra, eu, opp, campo, letras] = ['.rl-bola', '.rl-bola i', '.rl-sombra', '.rl-raq.eu', '.rl-raq.ele', '.rl-campo', '.rl-letras'].map((s) => $(s, m));
      const kf = (p) => `translate(${p.x}px, ${p.y}px) scale(${p.s})`;
      const parar = () => {
        anims.forEach((a) => (a.finished.catch(() => {}), a.cancel()));
        anims = [];
      };
      /* Onde a bola está agora (para devolver de onde ela estiver, sem salto). */
      const aqui = () => {
        const t = new DOMMatrix(getComputedStyle(bola).transform);
        return { x: t.m41, y: t.m42, s: t.a };
      };
      const voar = (de, para, ms, alto) => {
        parar();
        const o = { duration: ms, easing: 'linear', fill: 'forwards' };
        anims = [
          bola.animate([{ transform: kf(de) }, { transform: kf(para) }], o),
          sombra.animate([{ transform: kf(de) }, { transform: kf(para) }], o),
          miolinho.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-alto}px)`, offset: 0.5 }, { transform: 'translateY(0)' }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }),
        ];
      };
      const bater = (r) => !reduz() && r.animate([{ rotate: '-46deg' }, { rotate: '34deg', offset: 0.55 }, { rotate: '0deg' }], { duration: 300, easing: 'ease-out' });
      const msg = (h) => ($('.rl-msg', m).innerHTML = h);
      const placar = () => {
        $('[data-voce]', m).textContent = voce;
        $('[data-ele]', m).textContent = ele;
        $('[data-rali]', m).textContent = rali;
        const r = $('.rl-rali', m);
        r.classList.toggle('quente', rali >= 2);
        if (rali && polido() && !reduz()) anima(r, [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-5deg)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
      };
      const pintar = () => {
        const v = campo.value;
        letras.innerHTML = [...alvo].map((c, k) => `<span class="${v[k] ? (v[k] === c ? 'ok' : 'no') : k === v.length ? 'vez' : ''}">${v[k] || ''}</span>`).join('');
      };
      const focar = () => (!EMBUTIDO || document.hasFocus()) && campo.focus({ preventScroll: true });
      const saque = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        alvo = fila[i][0];
        const seg = Math.max(Math.ceil(BASE / 2), BASE - rali);
        const fx = [0.32, 0.5, 0.68][Math.floor(Math.random() * 3)];
        const [w, h] = [q.clientWidth, q.clientHeight];
        A = { x: w * (0.5 + (fx - 0.5) * 0.4), y: h * 0.4, s: 0.42 };
        B = { x: w * fx, y: h * 0.88, s: 1.12 };
        opp.style.left = A.x + 16 + 'px';
        eu.style.left = B.x + 30 + 'px';
        $('.rl-pista b', m).textContent = fila[i][1];
        campo.value = pjNivel === 'facil' ? alvo[0] : '';
        campo.maxLength = alvo.length;
        pintar();
        focar();
        bater(opp);
        sentir('quique');
        /* A bola é o relógio: sai da raquete do adversário e chega à sua no tempo que você tem. */
        voar(A, B, seg * 1000, h * 0.3);
        pjRelogio(seg, () => {
          pj.trava = true;
          rali = 0;
          ele++;
          placar();
          sentir('quique');
          const de = aqui();
          voar(de, { x: de.x, y: q.clientHeight * 1.2, s: 1.3 }, 420, 26);
          msg(`A bola caiu na quadra. Era: <b>${alvo}</b>`);
          pjErro(q, null, { conta: true });
          i++;
          pjDepois(1700, () => (msg(''), saque()));
        });
      };
      const devolver = () => {
        if (pj.trava || !campo.value) return;
        pj.trava = true;
        pjPararRelogio();
        const de = aqui();
        bater(eu);
        sentir('quique');
        i++;
        if (campo.value === alvo) {
          rali++;
          voce++;
          placar();
          voar(de, A, 460, 70);
          pjAcerto(eu);
          return pjDepois(560, saque);
        }
        rali = 0;
        ele++;
        placar();
        voar(de, { x: q.clientWidth * 1.2, y: de.y - 60, s: 0.7 }, 480, 40);
        msg(`Fora! Era: <b>${alvo}</b>`);
        pjErro(q, null, { conta: true });
        pjDepois(1700, () => (msg(''), saque()));
      };
      campo.addEventListener('input', () => {
        if (pj?.trava) return (campo.value = '');
        campo.value = campo.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, alvo.length);
        sentir('tecla');
        pintar();
        if (campo.value === alvo) return devolver();
        const errada = [...campo.value].findIndex((c, x) => c !== alvo[x]);
        if (errada < 0) return;
        /* Letra errada: fica vermelha um instante e sai sozinha. Não precisa apagar. */
        sentir('erro');
        const vez = campo.value;
        pjDepois(380, () => {
          if (campo.value !== vez || pj.trava) return;
          campo.value = vez.slice(0, errada);
          pintar();
        });
      });
      q.addEventListener('click', () => campo.focus({ preventScroll: true }));
      pj.tecla = (e, emCampo) => {
        if (e.key === 'Enter') return e.preventDefault(), devolver();
        if (emCampo || pj.trava) return;
        /* Sem foco no campo (clicou fora): a tecla vale do mesmo jeito. */
        if (/^[a-zA-Z]$/.test(e.key)) campo.value += e.key;
        else if (e.key === 'Backspace') campo.value = campo.value.slice(0, -1);
        else return;
        campo.focus({ preventScroll: true });
        campo.dispatchEvent(new Event('input'));
      };
      pj.ajuda = () => {
        if (pj.trava) return false;
        campo.value = alvo[0];
        pintar();
        focar();
      };
      pj.aoSair = parar;
      /* +10 s: a bola ganha ar; explicação aberta: a bola para junto com o relógio. */
      pj.aoTempo = () => voar(aqui(), B, Math.max(400, pj.rel.fim - performance.now()), 30);
      pj.aoPausa = (sim) => anims.forEach((a) => (sim ? a.pause() : a.play()));
      placar();
      pjDepois(500, saque);
    },
  });

  /* ---- Mala: abre, recebe a palavra, fecha, e você refaz de memória ------------- */
  Object.assign(JOGOS.koffer, {
    passos: [
      'A mala abre e uma palavra nova entra no próximo compartimento. Guarde a ordem.',
      'A mala fecha. Toque nas etiquetas na ordem em que as palavras entraram.',
      'Cada nível refeito ganha um adesivo de viagem e avança a rota. Cada erro custa uma vida; Espiar reabre a mala, uma vez por nível.',
    ],
    montar(m) {
      const pal = emb(VOC).slice(0, 5);
      const paleta = emb(pal);
      const VIDAS = nv(4, 3, 2);
      let nivel = 1, passo = 0, vidas = VIDAS, fase = '', espiou = false;
      m.innerHTML = `<div class="ml-cena">
          <ol class="ml-rota" aria-label="Rota dos níveis">${pal.map((_, k) => `<li data-n="${k}">${k + 1}</li>`).join('')}</ol>
          <div class="ml-palco"><div class="ml-mala fechada"><span class="ml-alca"></span>
            <div class="ml-corpo"><div class="ml-slots">${pal.map((_, k) => `<div class="ml-slot" data-s="${k}"><i>${k + 1}</i></div>`).join('')}</div></div>
            <div class="ml-tampa"><span class="ml-conta"></span><div class="ml-tags"></div><div class="ml-adesivos"></div></div>
            <span class="ml-fecho e"></span><span class="ml-fecho d"></span></div></div>
          <div class="ml-rodape"><p class="ml-fala" role="status"></p><span class="vidas" aria-label="${VIDAS} vidas">${Array.from({ length: VIDAS }, () => `<span>${ij('heart')}</span>`).join('')}</span></div></div>
        <div class="pj-paleta ml-paleta">${paleta.map((p) => `<button type="button" class="pj-opcao" data-op="${p[0]}" disabled>${p[0]}${pjNivel === 'dificil' ? '' : `<small>${p[1]}</small>`}</button>`).join('')}</div>`;
      const mala = $('.ml-mala', m);
      const fala = $('.ml-fala', m);
      const dizerFala = (t, erro) => {
        fala.textContent = t || (fase === 'lembrando' ? `Passo ${passo + 1} de ${nivel}: qual palavra entrou nesta posição?` : 'Guarde a ordem…');
        fala.classList.toggle('erro', !!erro);
      };
      const rota = () => {
        $$('.ml-rota li', m).forEach((li, k) => {
          li.classList.toggle('feito', k < nivel - 1);
          li.classList.toggle('atual', k === nivel - 1);
          $('.ml-aviao', li)?.remove();
        });
        const li = $(`.ml-rota li[data-n="${nivel - 1}"]`, m);
        li.insertAdjacentHTML('beforeend', `<span class="ml-aviao" aria-hidden="true">${ij('plane')}</span>`);
        if (polido() && !reduz() && nivel > 1) anima($('.ml-aviao', li), [{ transform: `translate(${-li.parentElement.clientWidth / 5}px, 6px) rotate(-12deg)` }, { transform: 'translate(0, -8px) rotate(6deg)', offset: 0.6 }, { transform: 'translate(0,0) rotate(0deg)' }], { d: 900, e: EIO });
      };
      const slots = () =>
        $$('.ml-slot', m).forEach((s, k) => {
          const tem = k < nivel;
          s.className = `ml-slot${tem ? ' cheio' : ''}${k === nivel - 1 && !espiou ? ' nova' : ''}`;
          s.innerHTML = `<i>${k + 1}</i>${tem ? `<b>${pal[k][0]}</b><small>${pal[k][1]}</small>` : ''}`;
        });
      const tags = () => {
        $('.ml-conta', m).textContent = `${nivel} ${nivel === 1 ? 'palavra' : 'palavras'} na mala`;
        $('.ml-tags', m).innerHTML = pal.slice(0, nivel).map((p, k) => `<span class="ml-tag ${k < passo ? 'ok' : k === passo ? 'agora' : ''}" data-t="${k}"><i>${k + 1}</i>${k < passo ? p[0] : '?'}</span>`).join('');
      };
      const abrir = (sim) => {
        mala.classList.toggle('aberta', sim);
        mala.classList.toggle('fechada', !sim);
        sentir(sim ? 'abre' : 'fecha');
        $$('.ml-paleta button', m).forEach((b) => (b.disabled = sim));
      };
      const fechar = () => {
        fase = 'lembrando';
        tags();
        abrir(false);
        dizerFala();
        /* os fechos batem um instante depois de a tampa descer */
        pjDepois(620, () => {
          sentir('encaixa');
          if (polido() && !reduz()) anima(mala, [{ transform: 'translateY(0)' }, { transform: 'translateY(5px) scale(1.01, 0.98)' }, { transform: 'translateY(0)' }], { d: 320, e: MOLA });
        });
      };
      const entrar = () => {
        fase = 'entrando';
        passo = 0;
        espiou = false;
        rota();
        slots();
        tags();
        abrir(true);
        dizerFala();
        const novo = $(`.ml-slot[data-s="${nivel - 1}"]`, m);
        if (polido() && !reduz()) {
          /* a palavra nova cai de cima no compartimento dela */
          anima(novo, [{ transform: 'translateY(-170px) rotate(-12deg) scale(1.3)', opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: 1 }], { d: 700, atraso: 420, e: MOLA_SUAVE });
        }
        pjDepois(520, () => (dizer(pal[nivel - 1][0]), sentir('encaixa')));
        pjDepois(nv(3600, 2700, 1900), fechar);
      };
      pj.clique = (b) => {
        if (fase !== 'lembrando' || b.dataset.op == null) return;
        if (b.dataset.op !== pal[passo][0]) {
          vidas--;
          $$('.vidas span', m).forEach((v, k) => v.classList.toggle('perdida', k >= vidas));
          $('.vidas', m).setAttribute('aria-label', `${vidas} vidas`);
          dizerFala('Não foi esta. A ordem conta, e a tentativa custou uma vida.', true);
          pjErro(mala, '−1 vida');
          if (!vidas) {
            fase = 'fim';
            pjFim();
          }
          return;
        }
        voarTexto(b, $(`.ml-tag[data-t="${passo}"]`, m), b.dataset.op);
        dizer(b.dataset.op);
        passo++;
        tags();
        if (passo < nivel) {
          sentir('encaixa');
          return dizerFala();
        }
        fase = 'pausa';
        $('.ml-adesivos', m).insertAdjacentHTML('beforeend', `<span class="ml-adesivo" style="--r:${Math.round(Math.random() * 30 - 15)}deg">${nivel}</span>`);
        pjAcerto(mala);
        if (nivel >= pal.length) {
          dizerFala('Mala completa!');
          $$('.ml-rota li', m).forEach((li) => (li.classList.add('feito'), li.classList.remove('atual')));
          return pjFim();
        }
        dizerFala('Mala refeita. Entra mais uma palavra.');
        nivel++;
        pjDepois(1200, entrar);
      };
      pj.ajuda = () => {
        if (fase !== 'lembrando' || espiou) return false;
        espiou = true;
        fase = 'espiando';
        slots();
        abrir(true);
        dizerFala('Espiando…');
        pjDepois(1500, () => {
          fase = 'lembrando';
          abrir(false);
          dizerFala();
        });
      };
      pjDepois(350, entrar);
    },
  });

  MINIS.tenis = '<span class="mq"><i class="mq-chao"></i><i class="mq-raq a"></i><i class="mq-rede"></i><i class="mq-bola"></i><i class="mq-raq b"></i><i class="mm-chip mq-chip">word</i></span>';
  MINIS.koffer = '<span class="mk"><i class="mk-alca"></i><span class="mk-corpo"><i class="mm-chip">sol</i><i class="mm-chip">mar</i><i class="mm-chip">lua</i></span><i class="mk-tampa"></i></span>';
