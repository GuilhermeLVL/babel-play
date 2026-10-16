  /* ==========================================================================
     Rodada 11 — os minijogos jogáveis.
     Antes só a Memória abria. Aqui entram os outros 17, cada um com a regra
     do componente real (src/components/minigames) e a casca do desenho novo
     de produção (.cab, .palco-jogo, .hud, .combo, .fim).
     Um motor só cuida do que é igual em todos: placar, combo, relógio, ajudas,
     retorno de acerto e erro (som, vibração, partículas) e a tela de fim.
     Entra depois de minis.js (usa MINIS e POR_TITULO).
     ========================================================================== */
  Object.assign(SIMPLES, {
    'chevron-left': svg('<path d="m15 18-6-6 6-6"/>'),
    scissors: svg('<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'),
    delete: svg('<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>'),
    radar: svg('<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>'),
    'pen-line': svg('<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'),
    'link-2': svg('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>'),
    briefcase: svg('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'),
    'lock-open': svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
    'skip-forward': svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>'),
    'triangle-alert': svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    gauge: svg('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
    'rotate-ccw': svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    'circle-question-mark': svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
    lightbulb: svg('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
    'volume-2': svg('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'),
    mic: svg('<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>'),
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
    zap: svg('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'),
    heart: svg('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
    eye: svg('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    'corner-down-left': svg('<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>'),
    star: svg('<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>'),
    flame: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    shuffle: svg('<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>'),
    'arrow-right': svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
    lock: svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    sprout: svg('<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>'),
    search: svg('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'),
    keyboard: svg('<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>'),
    puzzle: svg('<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>'),
  });
  /* Só os ícones que a captura não trouxe usam o traço acima; os demais continuam os de produção. */
  const ij = (n) => (banco.querySelector('svg.lucide-' + n)?.outerHTML || SIMPLES[n] || SIMPLES.check).replace('<svg ', '<svg data-pj-i="" ');
  Object.assign(SONS, {
    tique: () => nota(1040, { d: 0.04, g: 0.05, tipo: 'square' }),
    conta: () => nota(520, { d: 0.14, g: 0.1, tipo: 'triangle' }),
    vai: () => (nota(784, { d: 0.3, g: 0.1, tipo: 'triangle' }), nota(1175, { d: 0.3, g: 0.08, tipo: 'triangle' })),
    tecla: () => nota(820 + Math.random() * 260, { d: 0.03, g: 0.04, tipo: 'triangle' }),
    encaixa: () => nota(560, { d: 0.07, g: 0.08, f2: 840, tipo: 'triangle' }),
    solta: () => nota(700, { d: 0.06, g: 0.06, f2: 460, tipo: 'triangle' }),
    quique: () => nota(240, { d: 0.1, g: 0.11, f2: 520 }),
    sobe: () => [392, 523, 659, 784].forEach((f, i) => nota(f, { t: i * 0.06, d: 0.18, g: 0.09, tipo: 'triangle' })),
  });
  Object.assign(TATO, { tique: 5, conta: 10, vai: 22, tecla: 5, encaixa: 8, solta: 6, quique: 12, sobe: [10, 30, 10, 30, 20] });

  /* ---- Material de exemplo (no app vem das gravações do usuário) ------------- */
  const VOC = [
    ['storm', 'tempestade'], ['shelf', 'prateleira'], ['towel', 'toalha'], ['coast', 'costa'],
    ['spill', 'derramar'], ['medicine', 'medicina'], ['hate', 'ódio'], ['female', 'fêmea'],
    ['bridge', 'ponte'], ['cloud', 'nuvem'], ['dream', 'sonho'], ['light', 'luz'],
    ['earth', 'terra'], ['river', 'rio'], ['bread', 'pão'], ['window', 'janela'],
  ];
  const FRASES = [
    { en: 'The storm hit the coast last night', pt: 'A tempestade atingiu a costa ontem à noite', alvo: 'storm' },
    { en: 'Put the towel on the shelf', pt: 'Coloque a toalha na prateleira', alvo: 'towel' },
    { en: 'Do not spill the medicine', pt: 'Não derrame o remédio', alvo: 'spill' },
    { en: 'We crossed the bridge at dawn', pt: 'Cruzamos a ponte ao amanhecer', alvo: 'bridge' },
    { en: 'She had a strange dream', pt: 'Ela teve um sonho estranho', alvo: 'dream' },
    { en: 'A dark cloud covered the light', pt: 'Uma nuvem escura cobriu a luz', alvo: 'cloud' },
  ];
  const emb = (a) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const liso = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const multDe = (s) => (s >= 15 ? 5 : s >= 10 ? 4 : s >= 6 ? 3 : s >= 3 ? 2 : 1);
  const distr = (certa, pool, n = nv(2, 3, 3)) => emb([certa, ...emb(pool.filter((x) => x !== certa)).slice(0, n)]);
  const opcoesHtml = (ops, o = {}) =>
    `<div class="opcoes-blitz ${o.classe || ''}">${ops.map((t, i) => `<button type="button" data-op="${esc(t)}" style="--i:${i}">${o.teclas ? `<kbd>${i + 1}</kbd>` : ''}${esc(t)}</button>`).join('')}</div>`;
  const tecladoHtml = (linhas, acoes = 'ambas', classe = '') =>
    `<div class="teclado ${classe}">${linhas
      .map((l, i) => {
        const fim = i === linhas.length - 1;
        return `<div class="fila">${fim && acoes === 'ambas' ? `<button type="button" class="largo" data-tecla="Enter" aria-label="Enviar palpite">${ij('corner-down-left')}</button>` : ''}${[...l].map((c) => `<button type="button" data-tecla="${c}">${c}</button>`).join('')}${fim ? `<button type="button" class="largo" data-tecla="Backspace" aria-label="Apagar">${ij('delete')}</button>` : ''}</div>`;
      })
      .join('')}</div>`;
  const eqHtml = (n = 5) => `<span class="pj-eq" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>`;

  /* ---- Voz: a do próprio navegador (no app é a voz de leitura) ---------------- */
  const temVoz = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  function dizer(t, o = {}) {
    /* Na vista de aparelhos há duas cópias da página lado a lado: só fala a que tem o foco. */
    if (!temVoz || !sentidos.som || (EMBUTIDO && !document.hasFocus())) return Promise.resolve(false);
    return new Promise((ok) => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t);
        u.lang = o.lang || 'en-US';
        u.rate = o.devagar ? 0.6 : 0.95;
        u.onend = u.onerror = () => ok(true);
        speechSynthesis.speak(u);
        setTimeout(() => ok(true), 7000);
      } catch {
        ok(false);
      }
    });
  }

  /* ---- Motor ------------------------------------------------------------------ */
  const JOGOS = {};
  const ORDEM_JOGOS = ['memory', 'wordsearch', 'termo', 'scramble', 'blitz', 'karuta', 'choseong', 'tenis', 'koffer', 'bao', 'vitendawili', 'shiritori', 'cadavre', 'taboo', 'karaoke', 'escuta', 'ditado', 'conectores'];
  let pj = null;
  let pjId = 'termo';
  const P = (s) => $(s, tela);
  const palco = () => $('#palco', tela);
  const miolo = () => $('.pj-miolo', tela);

  function cascaDaPartida(id) {
    const j = JOGOS[id];
    const ajudas = (j.ajudas || [])
      .map(([k, i, r, n, custa]) => `<button type="button" class="btn btn-outline peq ajuda-jogo" data-ajuda="${k}" title="${custa ? 'Conta como dica: zera o combo' : 'De graça'}">${ij(i)} ${r}${Number.isFinite(n) ? `<span class="n">${n}</span>` : ''}</button>`)
      .join('');
    return `<div class="rolagem w-full"><div class="tela larga entra"><header class="cab"><button type="button" class="voltar">${ij('chevron-left')} Jogar</button><div class="cab-linha"><div class="cab-texto"><span class="sobrancelha">${ij(j.icone)}<span>${j.rodada}</span></span><h1>${j.titulo}</h1></div><div class="cab-acoes"><button type="button" class="btn btn-outline peq" data-pj="como" aria-label="Como se joga">${ij('circle-question-mark')} Como se joga</button><button type="button" class="btn btn-outline peq" data-acao="recomecar">${ij('rotate-ccw')} Recomeçar</button></div></div></header>
      <section class="palco-jogo px-partida" id="palco" data-qj="${id}">
        <div class="hud" role="group" aria-label="Placar da rodada">
          <div class="hud-bloco"><small>Pontos</small><b class="tn" data-pj="pontos">0</b></div>
          <div><div class="entre" style="font-size:12px;margin-bottom:5px"><span class="mut" data-pj="rotulo"></span><span data-pj="relogio" hidden></span></div>
            <div class="hud-progresso pj-progresso" role="progressbar" aria-label="Progresso da rodada" aria-valuenow="0" aria-valuemax="100"><span style="width:0%"></span></div>
            <div class="hud-progresso hud-tempo" hidden><span style="width:100%"></span></div></div>
          <div class="hud-ajudas">${ajudas}</div>
          <span class="combo"><small>×</small>1<em></em></span>
        </div>
        <p class="pj-instr">${j.instr}</p>
        <div class="pj-miolo"></div>
      </section></div></div>`;
  }
  function abrirJogo(id) {
    if (id === 'memory') return ir('jogo');
    if (!JOGOS[id]) return toast('Este jogo ainda não abre no protótipo.');
    pjId = id;
    D.telas.partida = cascaDaPartida(id);
    mostrar('partida', { origem: 'clique' });
  }
  function encerrarPartida() {
    if (!pj) return;
    pj.timers.forEach(clearTimeout);
    clearInterval(pj.relT);
    pj.aoSair?.();
    pj.morto = true;
    pj = null;
    if (temVoz) speechSynthesis.cancel();
    $$('.fx-vinheta, .ganho').forEach((x) => x.remove());
  }
  aoMostrar.partida = () => {
    encerrarPartida();
    const def = JOGOS[pjId];
    pj = { id: pjId, def, pontos: 0, mostrado: 0, seq: 0, melhor: 0, multVisto: 1, acertos: 0, erros: 0, feitos: 0, total: def.n, timers: [], t0: performance.now(), ajudas: Object.fromEntries((def.ajudas || []).map((a) => [a[0], a[3]])) };
    def.montar(miolo());
    pjHud(true);
  };
  aoSair.partida = encerrarPartida;

  /* Todo atraso do jogo passa por aqui: se a pessoa sair ou recomeçar, nada dispara depois. */
  function pjDepois(ms, fn) {
    const vez = pj;
    vez.timers.push(setTimeout(() => vez === pj && !vez.morto && fn(), ms * K()));
  }
  function pjHud(seco) {
    const pts = P('[data-pj="pontos"]');
    if (!pts || !pj) return;
    if (polido() && !seco) contar((v) => (pts.textContent = v), pj.mostrado, pj.pontos, 420);
    else pts.textContent = pj.pontos;
    pj.mostrado = pj.pontos;
    P('[data-pj="rotulo"]').textContent = `${Math.min(pj.feitos, pj.total)} de ${pj.total} ${pj.def.unidade}`;
    const pct = pj.total ? Math.min(100, (pj.feitos / pj.total) * 100) : 0;
    const barra = P('.pj-progresso');
    barra.firstElementChild.style.width = pct + '%';
    barra.setAttribute('aria-valuenow', Math.round(pct));
    const m = multDe(pj.seq);
    const c = P('.combo');
    c.classList.toggle('quente', m > 1);
    c.setAttribute('aria-label', `Multiplicador ${m}, ${pj.seq} seguidas`);
    c.innerHTML = `<small>×</small>${m}<em>${pj.seq > 1 ? pj.seq + ' seguidas' : ''}</em>${m > 1 ? ij('flame').replace('data-pj-i=""', 'class="combo-chama"') : ''}`;
    if (m > pj.multVisto) {
      selo(`Combo ×${m}`);
      vinheta('combo');
      if (polido() && !reduz()) anima(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1)' }], { d: 640, e: MOLA });
    }
    pj.multVisto = m;
  }
  function flutuar(el, texto, tom = 'good') {
    const [x, y] = centro(el?.isConnected ? el : palco());
    document.body.insertAdjacentHTML('beforeend', `<span class="ganho ${tom}" style="left:${x}px;top:${y - 8}px">${esc(texto)}</span>`);
    const g = document.body.lastElementChild;
    setTimeout(() => g.remove(), 1200);
  }
  /* A vinheta é um clarão na borda da tela; some sozinha em 0,6 s e é sempre removida. */
  function vinheta(tipo) {
    if (reduz()) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="fx-vinheta ${tipo}" aria-hidden="true"></div>`);
    const v = document.body.lastElementChild;
    setTimeout(() => v.remove(), 650);
  }
  function tremer(el) {
    if (!el || reduz()) return;
    el.classList.remove('pj-treme');
    void el.offsetWidth;
    el.classList.add('pj-treme');
    setTimeout(() => el.classList.remove('pj-treme'), 450);
  }
  function selo(t, classe = '') {
    const p = palco();
    if (!p || reduz()) return;
    p.insertAdjacentHTML('beforeend', `<div class="selo-combo ${classe}" aria-hidden="true">${esc(t)}</div>`);
    const s = p.lastElementChild;
    setTimeout(() => s.remove(), 1050);
  }
  /* Acerto: 10 pontos vezes o combo (3 seguidas = ×2, 6 = ×3, 10 = ×4, 15 = ×5). Com dica vale 10 e não soma combo. */
  function pjAcerto(el, o = {}) {
    const dica = pj.comDica;
    pj.comDica = false;
    pj.acertos++;
    pj.seq = dica ? 0 : pj.seq + 1;
    pj.melhor = Math.max(pj.melhor, pj.seq);
    const m = dica ? 1 : multDe(pj.seq);
    const g = 10 * m + (o.bonus || 0);
    pj.pontos += g;
    if (!o.semProgresso) pj.feitos++;
    sentir('acerto');
    pjHud();
    flutuar(el, `+${g}${m > 1 ? ' ×' + m : ''}`, 'good');
    vinheta('acerto');
    if (polido() && !reduz() && el?.isConnected) rajada(...centro(el), 14, 1);
  }
  function pjErro(el, msg, o = {}) {
    pj.erros++;
    pj.seq = 0;
    pj.comDica = false;
    if (o.conta) pj.feitos++;
    sentir('erro');
    pjHud();
    vinheta('erro');
    tremer(el);
    if (msg) flutuar(el, msg, 'erro');
  }
  function pjRelogio(seg, aoZerar) {
    pjPararRelogio();
    const r = (pj.rel = { fim: performance.now() + seg * 1000, total: seg * 1000, ult: 99 });
    const b = P('.hud-tempo');
    const t = P('[data-pj="relogio"]');
    b.hidden = t.hidden = false;
    const passo = (r.passo = () => {
      if (!pj || pj.rel !== r) return;
      const resto = Math.max(0, r.fim - performance.now());
      const s = Math.ceil(resto / 1000);
      b.firstElementChild.style.width = Math.min(100, (resto / r.total) * 100) + '%';
      t.textContent = s + 's';
      const pouco = resto <= Math.min(10000, r.total * 0.34);
      b.classList.toggle('pouco', pouco);
      palco().classList.toggle('tenso', pouco);
      if (pouco && s < r.ult && resto > 0) sentir('tique');
      r.ult = pouco ? s : 99;
      if (resto <= 0) {
        pjPararRelogio();
        aoZerar();
      }
    });
    pj.relT = setInterval(passo, 100);
    passo();
  }
  function pjPararRelogio() {
    if (!pj) return;
    clearInterval(pj.relT);
    pj.rel = null;
    palco()?.classList.remove('tenso');
  }
  /* 3, 2, 1, vai: só nos jogos contra o relógio. */
  function contagem(depois) {
    const p = palco();
    p.insertAdjacentHTML('beforeend', '<div class="fx-contagem" aria-hidden="true"><span>3</span></div>');
    const c = p.lastElementChild;
    const passos = ['3', '2', '1', 'Vai!'];
    const dar = (i) => {
      if (i === passos.length) return c.remove(), depois();
      c.innerHTML = `<span class="${i === 3 ? 'vai' : ''}">${passos[i]}</span>`;
      sentir(i === 3 ? 'vai' : 'conta');
      pjDepois(i === 3 ? 480 : 620, () => dar(i + 1));
    };
    dar(0);
  }
  function pjFim(o = {}) {
    if (!pj || pj.fim) return;
    pj.fim = true;
    pjPararRelogio();
    pj.clique = pj.tecla = pj.ajuda = null;
    P('.hud-tempo').hidden = P('[data-pj="relogio"]').hidden = true;
    const seg = Math.round((performance.now() - pj.t0) / 1000);
    pjDepois(o.ja ? 200 : 900, () => {
      const tent = pj.acertos + pj.erros;
      const pct = tent ? pj.acertos / tent : 0;
      const est = !pj.acertos ? 0 : pj.erros === 0 ? 3 : pct >= 0.7 ? 2 : 1;
      const xp = Math.round(pj.pontos / 5) + est * 2;
      const prox = ORDEM_JOGOS[(ORDEM_JOGOS.indexOf(pj.id) + 1) % ORDEM_JOGOS.length];
      const nomeProx = prox === 'memory' ? 'Memória' : JOGOS[prox].curto;
      palco().classList.remove('fever');
      palco().classList.add('pj-acabou');
      miolo().innerHTML = `<div class="fim"><span class="label-mono">Rodada concluída · ${pj.def.curto}</span>
        <h2>${['Não foi desta vez', 'Rodada concluída', 'Boa rodada', 'Rodada perfeita'][est]}</h2>
        <div class="estrelas-fim" aria-label="${est} de 3 estrelas">${[0, 1, 2].map((i) => `<span class="${i < est ? 'on' : ''}" style="--i:${i}">${ij('star')}</span>`).join('')}</div>
        <div class="fim-numeros"><div style="--i:0"><small>Acertos</small><b>${pj.acertos} de ${Math.max(tent, pj.acertos)}</b></div><div style="--i:1"><small>Tempo</small><b>${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}</b></div><div style="--i:2"><small>Pontos</small><b>${pj.pontos}</b></div><div style="--i:3"><small>Melhor combo</small><b>×${multDe(pj.melhor)}</b></div></div>
        ${est === 3 ? `<div class="carimbo">${ij('check')} sem nenhum erro</div>` : ''}
        <div class="xp-fim"><div class="entre"><b>+${xp} XP</b><span class="mut">Nível ${ex.nivel} · ${ex.xp + xp} de 400</span></div><div class="hud-progresso"><span style="width:${ex.pct}%"></span></div></div>
        <div class="pj-fim-acoes"><button type="button" class="btn btn-solid" data-pj="proximo" data-id="${prox}">Próximo jogo: ${nomeProx} ${ij('arrow-right')}</button><button type="button" class="btn btn-outline" data-acao="recomecar">${ij('rotate-ccw')} Jogar de novo</button><button type="button" class="btn btn-outline" data-pj="jogos">${ij('chevron-left')} Voltar aos jogos</button></div></div>`;
      requestAnimationFrame(() => {
        const b = P('.xp-fim .hud-progresso > span');
        if (b) b.style.width = Math.min(100, ((ex.xp + xp) / 400) * 100) + '%';
      });
      if (est >= 2) {
        if (polido()) confete(est === 3 ? 170 : 70);
        else sentir('sucesso');
      } else sentir('aviso');
    });
  }
  function usarAjuda(b) {
    const k = b.dataset.ajuda;
    const def = pj.def.ajudas.find((a) => a[0] === k);
    if (pj.fim || pj.trava || pj.ajudas[k] <= 0 || !pj.ajuda) return;
    if (pj.ajuda(k, b) === false) return;
    if (def[4]) {
      pj.seq = 0;
      pj.comDica = true;
      pjHud();
    }
    if (Number.isFinite(pj.ajudas[k])) {
      pj.ajudas[k]--;
      $('.n', b).textContent = pj.ajudas[k];
      if (pj.ajudas[k] <= 0) b.disabled = true;
    }
  }
  function comoSeJoga() {
    const j = JOGOS[pjId];
    const ajudas = (j.ajudas || []).map(([, , r, n, custa]) => `<b>${r}</b>${Number.isFinite(n) ? ` (${n} por rodada)` : ''} <em class="${custa ? 'custa' : ''}">${custa ? 'zera o combo' : 'de graça'}</em>`).join(' · ');
    const d = folhaDeBaixo(
      `<div class="pj-como"><span class="px-mini" data-mini="${pjId}" aria-hidden="true" style="--mm:var(--accent)">${MINIS[pjId] || ''}</span>
        <span class="label-mono">Como se joga</span><h2>${j.titulo}</h2>
        <ol>${j.passos.map((p) => `<li><span>${p}</span></li>`).join('')}</ol>
        ${ajudas ? `<p class="pj-como-ajudas">O que você tem aí: ${ajudas}</p>` : ''}
        <button type="button" class="btn btn-solid" data-pj-fechar>Entendi</button></div>`,
      'pj-como-folha',
    );
    $('[data-pj-fechar]', d).addEventListener('click', () => fecharFolhaDeBaixo());
  }

  ganchos.unshift((e, b) => {
    if (atual === 'jogar' || atual === 'sessao') {
      const t = b.closest('.q-tile[data-jogo], .qs-jogos .q-tile');
      if (!t) return false;
      const id = t.dataset.jogo || POR_TITULO.find(([re]) => re.test(t.textContent))?.[1];
      if (!id || id === 'memory' || !JOGOS[id]) return false;
      return abrirJogo(id), true;
    }
    if (atual !== 'partida') return false;
    if (b.classList.contains('voltar') || b.dataset.pj === 'jogos') return ir('jogar'), true;
    if (b.dataset.acao === 'recomecar') return abrirJogo(pjId), true;
    if (b.dataset.pj === 'proximo') return abrirJogo(b.dataset.id), true;
    if (b.dataset.pj === 'como') return comoSeJoga(), true;
    if (!pj) return true;
    if (b.dataset.ajuda) return usarAjuda(b), true;
    pj.clique?.(b, e);
    return true;
  });
  document.addEventListener('keydown', (e) => {
    if (atual !== 'partida' || !pj || e.ctrlKey || e.metaKey || e.altKey || $('dialog[open]')) return;
    pj.tecla?.(e, !!e.target.matches?.('input, textarea'));
  });
  oferta = ((f) =>
    function (...a) {
      if (atual === 'partida') return;
      return f.apply(this, a);
    })(oferta);

  /* ---- Soletrar (Termo): escada de 1 e depois 2 tabuleiros -------------------- */
  function julgar(p, w) {
    const r = Array(w.length).fill('fora');
    const resto = {};
    [...w].forEach((c, i) => (p[i] === c ? (r[i] = 'certa') : (resto[c] = (resto[c] || 0) + 1)));
    [...p].forEach((c, i) => {
      if (r[i] !== 'certa' && resto[c]) {
        r[i] = 'lugar';
        resto[c]--;
      }
    });
    return r;
  }
  JOGOS.termo = {
    titulo: 'Soletrar (Termo)', curto: 'Termo', icone: 'keyboard', rodada: 'Escada · 3 palavras', unidade: 'palavras', n: 3,
    instr: 'A pista é o significado. Escreva a palavra; as cores dizem quais letras estão certas.',
    ajudas: [['letra', 'lightbulb', 'Dica', 2, true], ['ouvir', 'volume-2', 'Ouvir', Infinity]],
    passos: ['Leia a pista e escreva uma palavra de 5 letras. Enter envia.', 'Verde: letra no lugar certo. Amarelo: existe, mas em outro lugar. Cinza: não tem.', 'Acertou? A escada sobe: no degrau seguinte são duas palavras ao mesmo tempo, com o mesmo palpite.'],
    montar(m) {
      const DEGRAUS = [[['STORM', 'tempestade']], [['SHELF', 'prateleira'], ['TOWEL', 'toalha']]];
      const PESO = { fora: 1, lugar: 2, certa: 3 };
      let d = 0, tabs, linha, palpite, max, teclas;
      const fileira = (k) => $(`[data-tab="${k}"] .linha-termo:nth-child(${linha + 1})`, m);
      const armar = () => {
        const ws = DEGRAUS[d];
        max = ws.length === 1 ? 6 : 7;
        linha = 0;
        palpite = '';
        teclas = {};
        tabs = ws.map(([w, pista]) => ({ w, pista, ok: false, sabe: Array(5).fill('') }));
        m.innerHTML = `<div class="tabs-termo pj-tabs" data-n="${ws.length}">${tabs
          .map((t, k) => `<div class="tab-termo" data-tab="${k}"><header><span class="pista">${t.pista}</span><span class="revela"></span></header><div class="grade-termo">${Array.from({ length: max }, (_, l) => `<div class="linha-termo${l ? '' : ' atual'}">${Array.from({ length: 5 }, (_, i) => `<span class="letra" style="--i:${i}"></span>`).join('')}</div>`).join('')}</div></div>`)
          .join('')}</div>${tecladoHtml(['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'])}`;
      };
      const pintar = () =>
        tabs.forEach((t, k) => {
          if (t.ok) return;
          $$('.letra', fileira(k)).forEach((c, i) => {
            const ch = palpite[i] || '';
            if (c.textContent === ch) return;
            c.textContent = ch;
            c.classList.toggle('cheia', !!ch);
          });
        });
      const digitar = (ch) => {
        if (pj.trava || palpite.length >= 5) return;
        palpite += ch;
        sentir('tecla');
        pintar();
      };
      const apagar = () => {
        if (pj.trava || !palpite) return;
        palpite = palpite.slice(0, -1);
        sentir('solta');
        pintar();
      };
      const enviar = () => {
        if (pj.trava) return;
        if (palpite.length < 5) {
          tabs.forEach((t, k) => !t.ok && tremer(fileira(k)));
          return sentir('erro');
        }
        pj.trava = true;
        const fechadas = [];
        tabs.forEach((t, k) => {
          if (t.ok) return;
          const res = julgar(palpite, t.w);
          const f = fileira(k);
          $$('.letra', f).forEach((c, i) => c.classList.add(res[i]));
          res.forEach((x, i) => {
            if ((PESO[teclas[palpite[i]]] || 0) < PESO[x]) teclas[palpite[i]] = x;
            if (x === 'certa') t.sabe[i] = palpite[i];
          });
          if (palpite === t.w) {
            t.ok = true;
            fechadas.push(k);
            f.classList.add('venceu');
          }
        });
        if (polido()) [0, 1, 2, 3, 4].forEach((i) => pjDepois(i * 110, () => sentir('vira')));
        pjDepois(5 * 110 + 420, () => {
          $$('.teclado [data-tecla]', m).forEach((b) => teclas[b.dataset.tecla] && (b.className = teclas[b.dataset.tecla]));
          fechadas.forEach((k) => {
            const tab = $(`[data-tab="${k}"]`, m);
            tab.classList.add('resolvido');
            $('.revela', tab).outerHTML = `<span class="selo ok">${ij('check')} certa</span>`;
            pjAcerto(tab);
          });
          if (!fechadas.length) {
            pj.seq = 0;
            pjHud();
          }
          tabs.forEach((t, k) => !t.ok && fileira(k)?.classList.remove('atual'));
          linha++;
          palpite = '';
          pj.trava = false;
          if (tabs.every((t) => t.ok)) {
            if (++d >= DEGRAUS.length) return pjFim();
            pj.trava = true;
            selo('Subiu!');
            sentir('sobe');
            P('.pj-instr').textContent = 'Subiu! Agora são duas ao mesmo tempo: o mesmo palpite vale para as duas.';
            return pjDepois(1500, () => {
              pj.trava = false;
              armar();
            });
          }
          if (linha >= max) {
            tabs.forEach((t, k) => {
              if (t.ok) return;
              const tab = $(`[data-tab="${k}"]`, m);
              tab.classList.add('falhou');
              $('.revela', tab).outerHTML = `<span class="selo erro">${t.w}</span>`;
              pjErro(tab, null, { conta: true });
            });
            return pjFim();
          }
          tabs.forEach((t, k) => !t.ok && fileira(k).classList.add('atual'));
        });
      };
      pj.clique = (b) => {
        const t = b.dataset.tecla;
        if (!t) return;
        if (t === 'Enter') enviar();
        else if (t === 'Backspace') apagar();
        else digitar(t);
      };
      pj.tecla = (e) => {
        if (e.key === 'Enter') return e.preventDefault(), enviar();
        if (e.key === 'Backspace') return apagar();
        if (/^[a-zA-Z]$/.test(e.key)) digitar(e.key.toUpperCase());
      };
      pj.ajuda = (k) => {
        const k0 = tabs.findIndex((t) => !t.ok);
        const t = tabs[k0];
        if (k === 'ouvir') return void dizer(t.w.toLowerCase());
        const i = t.sabe.findIndex((c) => !c);
        if (i < 0) return false;
        t.sabe[i] = t.w[i];
        $(`[data-tab="${k0}"] .revela`, m).textContent = t.sabe.map((c) => c || '·').join('');
        flutuar($(`[data-tab="${k0}"]`, m), `letra ${i + 1}`, '');
      };
      armar();
    },
  };

  /* ---- Caça-palavras: a pista é a tradução ------------------------------------ */
  JOGOS.wordsearch = {
    titulo: 'Caça-palavras por definição', curto: 'Caça-palavras', icone: 'search', rodada: 'Rodada · 5 palavras', unidade: 'palavras', n: 5,
    instr: 'A lista mostra o significado, não a palavra. Lembre dela e arraste o dedo sobre as letras.',
    ajudas: [['radar', 'radar', 'Radar', 3]],
    passos: ['Leia uma pista da lista e lembre da palavra em inglês.', 'Arraste sobre as letras: na horizontal, na vertical ou na diagonal.', 'Travou? O Radar faz as duas pontas de uma palavra piscarem.'],
    montar(m) {
      pj.resposta = () => jog.find((x) => !x.ok)?.w;
      const N = 8;
      const rand = (n) => Math.floor(Math.random() * n);
      const g = Array(N * N).fill('');
      const itens = emb(VOC.filter((v) => v[0].length <= 6)).slice(0, 5).map(([w, pt]) => ({ w: w.toUpperCase(), pt }));
      for (const it of itens) {
        for (let t = 0; t < 300 && !it.cel; t++) {
          const dirs = nv([[0, 1], [1, 0]], [[0, 1], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0]]);
          const [dr, dc] = dirs[rand(dirs.length)];
          const L = it.w.length;
          const r0 = dr < 0 ? L - 1 + rand(N - L + 1) : rand(N - dr * (L - 1));
          const c0 = dc < 0 ? L - 1 + rand(N - L + 1) : rand(N - dc * (L - 1));
          const cel = [...it.w].map((_, i) => (r0 + dr * i) * N + c0 + dc * i);
          if (cel.every((p, i) => !g[p] || g[p] === it.w[i])) {
            cel.forEach((p, i) => (g[p] = it.w[i]));
            it.cel = cel;
          }
        }
      }
      const jog = itens.filter((it) => it.cel);
      pj.total = jog.length;
      g.forEach((c, i) => c || (g[i] = 'ABCDEFGHILMNOPRSTUW'[rand(19)]));
      m.innerHTML = `<div class="caca"><div class="grade-caca" style="--n:${N}">${g.map((c, i) => `<span data-c="${i}">${c}</span>`).join('')}</div>
        <div><span class="label-mono">Ache a palavra que significa:</span><ul class="pistas">${jog.map((it, k) => `<li data-k="${k}">${ij('search')}<span>${it.pt}${pjNivel === 'facil' ? ` <em class="pj-ini">${it.w[0]}…</em>` : ''}</span></li>`).join('')}</ul></div></div>`;
      const grade = $('.grade-caca', m);
      const cels = $$('span', grade);
      let ini = -1, sel = [];
      const reta = (a, b) => {
        const [r0, c0, r1, c1] = [Math.floor(a / N), a % N, Math.floor(b / N), b % N];
        const [dr, dc] = [r1 - r0, c1 - c0];
        if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return null;
        const n = Math.max(Math.abs(dr), Math.abs(dc));
        return Array.from({ length: n + 1 }, (_, i) => (r0 + Math.sign(dr) * i) * N + c0 + Math.sign(dc) * i);
      };
      const marcar = (lista) => {
        if (lista.length !== sel.length && lista.length > 1) sentir('tecla');
        sel.forEach((i) => cels[i].classList.remove('sel'));
        sel = lista;
        sel.forEach((i) => cels[i].classList.add('sel'));
      };
      const soltar = () => {
        if (ini < 0) return;
        ini = -1;
        const chave = sel.join(',');
        const it = jog.find((x) => !x.ok && (x.cel.join(',') === chave || [...x.cel].reverse().join(',') === chave));
        const era = sel;
        marcar([]);
        if (it) {
          it.ok = true;
          it.cel.forEach((i, k) => {
            cels[i].style.setProperty('--k', k);
            cels[i].classList.remove('dica');
            cels[i].classList.add('achada');
          });
          const li = $(`[data-k="${jog.indexOf(it)}"]`, m);
          li.classList.add('feita');
          li.insertAdjacentHTML('beforeend', `<b>${it.w}</b>`);
          pjAcerto(cels[it.cel[Math.floor(it.cel.length / 2)]]);
          dizer(it.w.toLowerCase());
          if (jog.every((x) => x.ok)) pjFim();
        } else if (era.length > 1) {
          pj.seq = 0;
          pjHud();
          sentir('erro');
          tremer(grade);
          flutuar(cels[era[era.length - 1]], 'Tente de novo', 'erro');
        }
      };
      grade.addEventListener('pointerdown', (e) => {
        const c = e.target.closest('[data-c]');
        if (!c || pj?.fim) return;
        e.preventDefault();
        try {
          grade.setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro sintético */
        }
        ini = +c.dataset.c;
        marcar([ini]);
      });
      grade.addEventListener('pointermove', (e) => {
        if (ini < 0) return;
        const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.grade-caca [data-c]');
        const l = c && reta(ini, +c.dataset.c);
        if (l) marcar(l);
      });
      grade.addEventListener('pointerup', soltar);
      grade.addEventListener('pointercancel', () => ((ini = -1), marcar([])));
      pj.ajuda = () => {
        const it = emb(jog.filter((x) => !x.ok))[0];
        if (!it) return false;
        const pontas = [it.cel[0], it.cel[it.cel.length - 1]].map((i) => cels[i]);
        pontas.forEach((c) => c.classList.add('dica'));
        flutuar(pontas[0], 'achei as pontas', '');
        pjDepois(4000, () => pontas.forEach((c) => c.classList.remove('dica')));
      };
    },
  };

  /* ---- Frase embaralhada ------------------------------------------------------ */
  JOGOS.scramble = {
    titulo: 'Frase embaralhada', curto: 'Frase embaralhada', icone: 'puzzle', rodada: 'Rodada · 4 frases', unidade: 'frases', n: 4,
    instr: 'Uma frase real, fora de ordem. Toque nas palavras na ordem certa e confira.',
    ajudas: [['dica', 'lightbulb', 'Dica', 3, true], ['ouvir', 'volume-2', 'Ouvir', Infinity]],
    passos: ['Leia o que a frase significa.', 'Toque nas palavras na ordem certa. Tocar numa palavra da linha devolve.', 'Com todas na linha, toque em Conferir. A Dica encaixa a próxima palavra.'],
    montar(m) {
      const fr = emb(FRASES).slice(0, 4);
      let i = 0, linha, pecas, pal;
      const desenhar = () => {
        const antes = new Map($$('[data-k]', m).map((x) => [x.dataset.k, x.getBoundingClientRect()]));
        $('[data-linha]', m).innerHTML = linha.length ? linha.map((x) => `<button type="button" class="pj-peca na-linha" data-k="${x.k}" title="Clique para tirar da frase">${x.p}</button>`).join('') : '<span class="pj-vazio">Toque nas palavras na ordem certa.</span>';
        $('[data-banco]', m).innerHTML = pecas.map((x) => (linha.includes(x) ? `<button type="button" class="pj-peca fantasma" disabled aria-hidden="true">${x.p}</button>` : `<button type="button" class="pj-peca" data-k="${x.k}">${x.p}</button>`)).join('');
        $('[data-pj="conferir"]', m).disabled = linha.length < pecas.length;
        $('[data-pj="limpar"]', m).disabled = !linha.length;
        if (!polido() || reduz()) return;
        /* FLIP: cada palavra parte de onde estava e pousa no lugar novo. */
        for (const x of $$('[data-k]', m)) {
          const de = antes.get(x.dataset.k);
          if (!de) continue;
          const para = x.getBoundingClientRect();
          const [dx, dy] = [de.left - para.left, de.top - para.top];
          if (Math.abs(dx) + Math.abs(dy) > 2) anima(x, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { d: 460, e: MOLA_SUAVE });
        }
      };
      const prox = () => {
        if (i >= fr.length) return pjFim();
        pal = fr[i].en.split(' ');
        linha = [];
        do pecas = emb(pal.map((p, k) => ({ p, k })));
        while (pecas.every((x, k) => x.k === k));
        m.innerHTML = `<div class="pj-centro"><span class="label-mono">Esta frase significa</span><p class="pj-traducao">${fr[i].pt}</p></div>
          <div class="pj-linha" data-linha></div><p class="pj-aviso" role="status"></p><div class="pj-pecas" data-banco></div>
          <div class="pj-acoes"><button type="button" class="btn btn-outline" data-pj="limpar">${ij('rotate-ccw')} Recomeçar</button><button type="button" class="btn btn-solid" data-pj="conferir">${ij('check')} Conferir</button></div>
          <button type="button" class="pj-link" data-pj="pular">pular esta frase</button>`;
        desenhar();
      };
      pj.clique = (b) => {
        if (pj.trava) return;
        const a = b.dataset.pj;
        if (b.dataset.k != null) {
          const x = pecas.find((y) => y.k === +b.dataset.k);
          const naLinha = linha.includes(x);
          linha = naLinha ? linha.filter((y) => y !== x) : [...linha, x];
          sentir(naLinha ? 'solta' : 'encaixa');
          $('.pj-linha', m).classList.remove('errada');
          return desenhar();
        }
        if (a === 'limpar') return (linha = []), desenhar();
        if (a === 'pular') {
          pjErro(null, null, { conta: true });
          i++;
          return prox();
        }
        if (a !== 'conferir') return;
        const l = $('.pj-linha', m);
        if (linha.map((x) => x.p).join(' ') === fr[i].en) {
          pj.trava = true;
          l.classList.add('certa');
          pjAcerto(l);
          dizer(fr[i].en);
          i++;
          return pjDepois(1400, () => ((pj.trava = false), prox()));
        }
        const n = linha.filter((x, k) => x.p === pal[k]).length;
        l.classList.add('errada');
        $('.pj-aviso', m).textContent = n ? `${n} ${n === 1 ? 'palavra está' : 'palavras estão'} no lugar certo, continue.` : 'Ainda não. Tente começar por outra palavra.';
        pjErro(l, 'Ordem incorreta');
      };
      pj.ajuda = (k) => {
        if (k === 'ouvir') return void dizer(fr[i].en);
        let n = 0;
        while (n < linha.length && linha[n].p === pal[n]) n++;
        if (n >= pal.length) return false;
        linha = linha.slice(0, n);
        linha.push(pecas.find((x) => x.p === pal[n] && !linha.includes(x)));
        sentir('encaixa');
        desenhar();
        flutuar($('.pj-linha', m), `palavra ${n + 1}`, '');
      };
      prox();
    },
  };

  /* ---- Duelo relâmpago -------------------------------------------------------- */
  JOGOS.blitz = {
    titulo: 'Duelo relâmpago (contra o tempo)', curto: 'Duelo relâmpago', icone: 'zap', rodada: 'Rodada · 60 segundos', unidade: 'palavras', n: 12,
    instr: 'Sessenta segundos. Acerto rápido devolve tempo; erro tira 2 segundos.',
    ajudas: [['cortar', 'scissors', 'Cortar 2', 2, true]],
    passos: ['Aparece o significado e quatro alternativas. Toque na palavra certa (ou use as teclas 1 a 4).', 'Acertar em até 1,5 s devolve 2 s ao relógio. Errar tira 2 s.', 'Oito acertos seguidos ligam o FEVER: tudo vale em dobro.'],
    montar(m) {
      pj.resposta = () => fila[i]?.[0];
      const fila = emb(VOC).slice(0, 12);
      let i = 0, t0 = 0, cortou;
      const prox = () => {
        if (i >= fila.length) return pjFim();
        cortou = false;
        t0 = performance.now();
        m.innerHTML = `<div class="blitz-palavra"><span class="label-mono">Que palavra é</span><b>${fila[i][1]}</b></div>${opcoesHtml(distr(fila[i][0], VOC.map((v) => v[0])), { teclas: true })}`;
      };
      const escolher = (b) => {
        if (pj.trava || !b || b.disabled) return;
        pj.trava = true;
        const certa = fila[i][0];
        const ok = b.dataset.op === certa;
        $$('.opcoes-blitz button', m).forEach((x) => {
          if (x.dataset.op === certa) x.classList.add('certa');
          x.disabled = true;
        });
        const ms = performance.now() - t0;
        if (ok) {
          const fever = pj.seq + 1 >= 8;
          pjAcerto(b, { bonus: (Math.max(0, Math.round(10 * (1 - ms / 3000))) + (fever ? 10 * multDe(pj.seq + 1) : 0)) });
          const ganho = ms < 1500 ? 2 : ms < 3000 ? 1 : 0;
          if (pj.rel && ganho) {
            pj.rel.fim = Math.min(pj.rel.fim + ganho * 1000, performance.now() + pj.rel.total);
            flutuar(P('[data-pj="relogio"]'), `+${ganho}s`, 'good');
          }
          if (pj.seq === 8) {
            selo('FEVER ×2', 'fever');
            palco().classList.add('fever');
          }
        } else {
          b.classList.add('errada');
          palco().classList.remove('fever');
          pjErro(b, '−2s', { conta: true });
          if (pj.rel) pj.rel.fim -= 2000;
        }
        i++;
        pjDepois(ok ? 420 : 650, () => ((pj.trava = false), prox()));
      };
      pj.clique = (b) => b.dataset.op != null && escolher(b);
      pj.tecla = (e) => /^[1-4]$/.test(e.key) && escolher($$('.opcoes-blitz button', m)[+e.key - 1]);
      pj.ajuda = () => {
        if (cortou) return false;
        cortou = true;
        emb($$('.opcoes-blitz button', m).filter((x) => x.dataset.op !== fila[i][0])).slice(0, nv(1, 2, 2)).forEach((x) => {
          x.classList.add('pj-fora');
          x.disabled = true;
        });
        flutuar($('.opcoes-blitz', m), 'sobraram 2', '');
      };
      pj.trava = true;
      m.innerHTML = '<div class="blitz-palavra"><span class="label-mono">Prepare-se</span><b>···</b></div>';
      contagem(() => {
        pj.trava = false;
        pj.t0 = performance.now();
        prox();
        pjRelogio(pjSeg(60), () => pjFim({ ja: true }));
      });
    },
  };
