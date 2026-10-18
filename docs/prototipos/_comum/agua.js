  /* ==========================================================================
     Rodada 15 — tema Água: a cena viva e o giroscópio.
     A água fica "no nível": quando o aparelho inclina, a superfície gira para o
     outro lado e balança até assentar (mola pouco amortecida, como líquido).
     As bolhas sobem para o lado mais alto, os raios de luz acompanham e o brilho
     desliza sobre os cartões. Sem sensor (computador), o ponteiro faz esse papel:
     é a mesma regra do resto do protótipo, onde o giroscópio substitui o mouse.
     Só anima transform e um canvas pequeno; nada mexe no layout.
     ========================================================================== */
  TEMAS.splice(1, 0, ['agua', 'Água', 'seu']);
  main.insertAdjacentHTML(
    'afterbegin',
    '<div class="ag-cena" aria-hidden="true"><div class="ag-raios"><i></i><i></i></div><div class="ag-caustica a"><i></i></div><div class="ag-caustica b"><i></i></div><canvas class="ag-bolhas"></canvas><canvas class="ag-mar"></canvas></div>',
  );
  main.insertAdjacentHTML('beforeend', '<div class="ag-frente" aria-hidden="true"><div class="ag-brilho"></div></div>');
  const ag = {
    on: false, t: 0, ang: 0, vAng: 0, niv: 0, vNiv: 0, w: 0, h: 0, bolhas: [], sacode: 0,
    raios: $('.ag-raios', main), ca: $('.ag-caustica.a', main), cb: $('.ag-caustica.b', main), mar: $('.ag-mar', main), tempo: 0, agito: 0, n: 0, p: new Float32Array(0), v: new Float32Array(0), brilho: $('.ag-brilho', main), frente: $('.ag-frente', main),
    cv: $('.ag-bolhas', main),
  };
  ag.cx = ag.cv.getContext('2d');
  ag.mx = ag.mar.getContext('2d');
  const MAR_ALT = 200;
  const PASSO = 8;
  const aguaLigada = () => html.dataset.theme === 'agua' && polido();
  function medirAgua() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    ag.w = main.clientWidth;
    ag.h = main.clientHeight;
    ag.cv.width = ag.w * dpr;
    ag.cv.height = ag.h * dpr;
    ag.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ag.mar.width = ag.w * dpr;
    ag.mar.height = MAR_ALT * dpr;
    ag.mx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ag.n = Math.ceil(ag.w / PASSO) + 2;
    ag.p = new Float32Array(ag.n);
    ag.v = new Float32Array(ag.n);
  }
  /* A superfície é desenhada a cada quadro, não é um ladrilho repetido:
     - o nível, que inclina com o aparelho (a ponta sobe ou desce até ~64 px);
     - três ondas de tamanhos e velocidades diferentes somadas, para nunca repetir igual;
     - o respingo: uma fileira de molas ligadas entre si. Um toque ou uma bolha que estoura
       empurra um ponto, e a ondulação corre para os lados e morre sozinha. */
  const nivelEm = (x) => 48 + ag.niv + (ag.ang / 7) * Math.min(64, ag.w * 0.1) * ((x - ag.w / 2) / (ag.w / 2));
  const ondaEm = (x, t, k) => (Math.sin(x * 0.0105 + t * 0.85 + k * 1.7) * 7 + Math.sin(x * 0.0236 - t * 1.35 + k * 0.6) * 3.6 + Math.sin(x * 0.049 + t * 2.2 + k * 2.9) * 1.5) * (1 + ag.agito * 1.7);
  function respingo(x, forca) {
    const c = Math.round(x / PASSO);
    for (let d = -4; d <= 4; d++) {
      const i = c + d;
      if (i >= 0 && i < ag.n) ag.v[i] += forca * (1 - Math.abs(d) / 5);
    }
  }
  function desenharMar(dt) {
    const { p, v, n } = ag;
    for (let s = 0; s < 2; s++) {
      const h = dt / 2;
      for (let i = 0; i < n; i++) {
        const e = p[i > 0 ? i - 1 : i];
        const d = p[i < n - 1 ? i + 1 : i];
        v[i] += (-24 * p[i] + 95 * (e + d - 2 * p[i])) * h;
        v[i] *= 1 - 1.5 * h;
      }
      for (let i = 0; i < n; i++) p[i] += v[i] * h;
    }
    const c = ag.mx;
    const escuro = html.classList.contains('dark');
    const luz = escuro ? '130,228,246' : '255,255,255';
    const t = ag.tempo;
    c.clearRect(0, 0, ag.w, MAR_ALT);
    const y = (x, k) => nivelEm(x) + ondaEm(x, t * (1 - k * 0.2), k) + p[Math.min(n - 1, Math.round(x / PASSO))] * (1 - k * 0.3) + k * 8;
    const curva = (k, volta) => {
      if (volta == null) {
        c.moveTo(0, y(0, k));
        for (let x = PASSO; x <= ag.w + PASSO; x += PASSO) c.lineTo(x, y(x, k));
      } else for (let x = ag.w + PASSO; x >= 0; x -= PASSO) c.lineTo(x, y(x, k) + volta);
    };
    /* três camadas, da mais funda para a da frente: o ar visto por baixo d'água */
    [2, 1, 0].forEach((k) => {
      const g = c.createLinearGradient(0, 0, 0, MAR_ALT * 0.7);
      const a = (escuro ? [0.08, 0.13, 0.24] : [0.3, 0.42, 0.7])[2 - k];
      g.addColorStop(0, `rgba(${luz},${a * 1.25})`);
      g.addColorStop(1, `rgba(${luz},${a * 0.5})`);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, y(0, k));
      for (let x = PASSO; x <= ag.w + PASSO; x += PASSO) c.lineTo(x, y(x, k));
      c.lineTo(ag.w + PASSO, 0);
      c.closePath();
      c.fillStyle = g;
      c.fill();
    });
    /* no tema claro, uma sombra azul logo abaixo da linha: é ela que faz a borda da água aparecer sobre o fundo claro */
    if (!escuro) {
      const fundo = nivelEm(ag.w / 2);
      const sombra = c.createLinearGradient(0, fundo - 10, 0, fundo + 70);
      sombra.addColorStop(0, 'rgba(8,120,160,0.26)');
      sombra.addColorStop(1, 'rgba(8,120,160,0)');
      c.beginPath();
      curva(0);
      curva(0, 64);
      c.closePath();
      c.fillStyle = sombra;
      c.fill();
    }
    /* a luz que atravessa a superfície e se espalha logo abaixo dela */
    const base = nivelEm(ag.w / 2);
    const brilho = c.createLinearGradient(0, base - 14, 0, base + 62);
    brilho.addColorStop(0, `rgba(${luz},${escuro ? 0.2 : 0.3})`);
    brilho.addColorStop(1, `rgba(${luz},0)`);
    c.beginPath();
    curva(0);
    curva(0, escuro ? 56 : 18);
    c.closePath();
    c.fillStyle = brilho;
    c.fill();
    /* a linha d'água: um fio claro com halo, sem contorno duro */
    c.lineJoin = c.lineCap = 'round';
    c.beginPath();
    curva(0);
    c.strokeStyle = `rgba(${luz},${escuro ? 0.1 : 0.2})`;
    c.lineWidth = 9;
    c.stroke();
    c.shadowColor = `rgba(${luz},0.9)`;
    c.shadowBlur = 10;
    c.strokeStyle = `rgba(${luz},${escuro ? 0.6 : 0.92})`;
    c.lineWidth = 1.8;
    c.stroke();
    c.shadowBlur = 0;
    /* cintilações nas cristas: acendem e apagam, cada uma no seu tempo */
    for (let x = 30; x < ag.w; x += 74) {
      const xx = x + Math.sin(x * 12.9898) * 26;
      const f = Math.pow(Math.max(0, Math.sin(xx * 0.05 + t * 2.6 + Math.sin(x) * 6)), 10);
      if (f < 0.04) continue;
      c.beginPath();
      c.ellipse(xx, y(xx, 0) - 0.5, 4 + 13 * f, 1.3 + f, 0, 0, 6.283);
      c.fillStyle = `rgba(${luz},${0.95 * f})`;
      c.fill();
    }
  }
  const novaBolha = (x, y, pequena) => ({ x: x ?? Math.random() * ag.w, y: y ?? ag.h + 20 + Math.random() * ag.h, r: pequena ? 1.5 + Math.random() * 3 : 2 + Math.random() * 7, v: 18 + Math.random() * 34, f: Math.random() * 6.28, vx: pequena ? (Math.random() - 0.5) * 90 : 0, vida: pequena ? 1 : Infinity });
  function semearBolhas() {
    ag.bolhas = Array.from({ length: Math.round(Math.min(34, 14 + ag.w / 60)) }, () => novaBolha(undefined, Math.random() * ag.h));
  }
  /* Altura da superfície num ponto x, já com a inclinação: é onde a bolha estoura. */
  const superficieEm = (x) => nivelEm(x) + ondaEm(x, ag.tempo, 0);
  function quadroDaAgua(agora) {
    if (!ag.on) return;
    const dt = Math.min(0.05, (agora - ag.t) / 1000 || 0.016);
    ag.t = agora;
    /* a inclinação vem do giroscópio (que já alimenta "mouse") ou do ponteiro */
    const tx = Math.max(-1, Math.min(1, (mouse[0] / innerWidth - 0.5) / 0.45));
    const ty = Math.max(-1, Math.min(1, (mouse[1] / innerHeight - 0.45) / 0.4));
    if (reduz()) {
      ag.ang = ag.niv = 0;
    } else {
      /* Mola pouco amortecida: a água passa do ponto e volta, duas ou três vezes, antes de assentar. */
      ag.vAng += (46 * (-tx * 7 - ag.ang) - 4.4 * ag.vAng) * dt + ag.sacode * dt * 60;
      ag.ang += ag.vAng * dt;
      ag.vNiv += (40 * (ty * 16 - ag.niv) - 4.2 * ag.vNiv) * dt;
      ag.niv += ag.vNiv * dt;
      ag.sacode *= 0.86;
    }
    const agito = Math.min(1, Math.abs(ag.vAng) / 26);
    ag.tempo += dt * (1 + agito * 1.2);
    ag.agito += (agito - ag.agito) * Math.min(1, dt * 5);
    desenharMar(dt);
    ag.raios.style.transform = `rotate(${(ag.ang * 1.7).toFixed(3)}deg)`;
    /* profundidade: o que está longe anda menos, o que está perto anda mais */
    ag.ca.style.transform = `translate(${(-tx * 14).toFixed(1)}px, ${(-ty * 10).toFixed(1)}px)`;
    ag.cb.style.transform = `translate(${(-tx * 30).toFixed(1)}px, ${(-ty * 20).toFixed(1)}px)`;
    ag.brilho.style.transform = `translate(${(-ag.ang * 2.4).toFixed(2)}%, ${(-ty * 9).toFixed(2)}%)`;
    const c = ag.cx;
    c.clearRect(0, 0, ag.w, ag.h);
    const escuro = html.classList.contains('dark');
    const luz = escuro ? '120,225,245' : '255,255,255';
    for (const b of ag.bolhas) {
      b.f += dt * 2.2;
      /* a bolha sobe "para cima de verdade": se o aparelho inclina, ela escorrega para o lado mais alto */
      b.x += (Math.sin(b.f) * 9 + ag.ang * 9 + b.vx) * dt;
      b.y -= b.v * (1 + b.r / 9) * dt;
      b.vx *= 0.95;
      if (b.vida !== Infinity) b.vida -= dt * 0.7;
      const estourou = b.y < superficieEm(b.x) + b.r || b.vida <= 0;
      if (estourou || b.x < -30 || b.x > ag.w + 30) {
        /* a bolha que chega à superfície faz um respingo pequeno */
        if (estourou && b.vida > 0) respingo(b.x, -b.r * 5);
        if (b.vida === Infinity) Object.assign(b, novaBolha(undefined, ag.h + 20 + Math.random() * 120));
        else b.morta = true;
        continue;
      }
      const a = Math.min(1, b.vida) * (escuro ? 0.5 : 0.75);
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, 6.283);
      c.fillStyle = `rgba(${luz},${0.1 * a})`;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = `rgba(${luz},${0.8 * a})`;
      c.stroke();
      c.beginPath();
      c.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, Math.max(0.6, b.r * 0.22), 0, 6.283);
      c.fillStyle = `rgba(${luz},${0.95 * a})`;
      c.fill();
    }
    if (ag.bolhas.some((b) => b.morta)) ag.bolhas = ag.bolhas.filter((b) => !b.morta);
    requestAnimationFrame(quadroDaAgua);
  }
  function ligarAgua() {
    const deve = aguaLigada();
    $('[data-px-acao="agua"]')?.setAttribute('aria-pressed', html.dataset.theme === 'agua');
    if (deve === ag.on) return;
    ag.on = deve;
    if (!deve) return;
    medirAgua();
    semearBolhas();
    ag.t = performance.now();
    requestAnimationFrame(quadroDaAgua);
  }
  new MutationObserver(ligarAgua).observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-px'] });
  new ResizeObserver(() => ag.on && medirAgua()).observe(main);

  /* Cada toque faz uma onda e solta bolhinhas no ponto tocado. */
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!ag.on || !main.contains(e.target) || reduz()) return;
      const r = main.getBoundingClientRect();
      const [x, y] = [e.clientX - r.left, e.clientY - r.top];
      const o = document.createElement('i');
      o.className = 'ag-onda';
      o.style.left = x + 'px';
      o.style.top = y + 'px';
      o.append(document.createElement('b'));
      ag.frente.append(o);
      /* o toque também mexe a superfície: quanto mais perto do alto, mais forte */
      respingo(x, 220 * Math.max(0.12, 1 - y / 420));
      setTimeout(() => o.remove(), 2400);
      for (let k = 0; k < 7; k++) ag.bolhas.push(novaBolha(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 12, true));
      const M = window.DeviceMotionEvent;
      if (M?.requestPermission && !ag.pediu) {
        ag.pediu = true;
        M.requestPermission().catch(() => {});
      }
    },
    { capture: true, passive: true },
  );
  /* Sacudir o aparelho agita a água. */
  addEventListener('devicemotion', (e) => {
    const a = e.acceleration?.x;
    if (ag.on && a && Math.abs(a) > 1.2) ag.sacode = Math.max(-6, Math.min(6, ag.sacode + a * 0.5));
  });

  /* Som de gota no toque, só neste tema. */
  const toqueSeco = SONS.toque;
  SONS.toque = () => (html.dataset.theme === 'agua' ? (nota(1500 + Math.random() * 300, { d: 0.07, g: 0.045, f2: 620 }), nota(2400, { t: 0.03, d: 0.04, g: 0.018 })) : toqueSeco());
  SONS.mergulho = () => (sopro(0.7, { de: 2600, ate: 220, g: 0.07 }), nota(520, { d: 0.5, g: 0.05, f2: 130 }), [1300, 1700, 2100].forEach((f, i) => nota(f, { t: 0.25 + i * 0.09, d: 0.08, g: 0.03, f2: f * 0.6 })));
  TATO.mergulho = [14, 50, 8, 30, 6];

  /* Equipar de vez (a vitrine do Personalizar só "prova"): usado pelo botão da barra e pelo endereço. */
  function equiparTema(id) {
    const troca = () => {
      temaEquipado = id;
      temaEmProva = null;
      html.dataset.theme = id;
      corDasParticulas();
      if (atual === 'personalizar') {
        const rol = rolagem()?.scrollTop || 0;
        tela.innerHTML = fonteDe('personalizar');
        rolagem().scrollTop = rol;
        $$('.q-abas', tela).forEach((g) => porPilula(g));
      }
      reposicionar();
    };
    if (!polido()) return troca();
    revelar(troca);
    if (id === 'agua') sentir('mergulho');
  }
  const temaAntes = html.dataset.theme || 'babel';
  $('[data-px-acao="tema"]', barra).insertAdjacentHTML('afterend', '<button type="button" data-px-acao="agua" aria-pressed="false" title="Liga e desliga o tema Água. Mova o mouse (ou incline o celular) para a água balançar">Tema Água</button>');
  barra.addEventListener('click', (e) => {
    if (!e.target.closest('[data-px-acao="agua"]')) return;
    ultimoPonto = [e.clientX, e.clientY];
    equiparTema(html.dataset.theme === 'agua' ? temaAntes : 'agua');
  });
  /* ?pele=agua abre já no tema (é assim que as molduras de aparelho herdam o tema da página de fora). */
  /* só vale um tema que existe na lista: o valor do endereço nunca vai direto para a página */
  if (TEMAS.some(([id]) => id === QS.get('pele'))) {
    temaEquipado = QS.get('pele');
    html.dataset.theme = temaEquipado;
    setTimeout(corDasParticulas, 0);
  }
  ligarAgua();
