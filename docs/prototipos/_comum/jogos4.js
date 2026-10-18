  /* ==========================================================================
     Rodada 13 — jogar sem frustração.
     1. Níveis: Fácil, Médio e Difícil, em todos os jogos que comportam.
     2. Mais ajudas: "+10 s" nos jogos com relógio e "Ver resposta" em quase todos;
        depois de dois erros seguidos o jogo aponta uma ajuda.
     3. Primeira vez: uma explicação em três telas antes de o jogo começar,
        que volta quando quiser pelo botão "Como se joga".
     4. Menos atrito: o que a pessoa errou sai sozinho (letra, vogal, palavra);
        o que acertou fica.
     Vem por cima do motor de jogos.js: embrulha as funções, não as reescreve.
     ========================================================================== */
  SIMPLES.timer = svg('<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>');
  SIMPLES.sparkles ??= svg('<path d="M9.937 15.5A2 2 0 0 0 8.500 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.500 9.936A2 2 0 0 0 9.937 8.500l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.500A2 2 0 0 0 15.500 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.500 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>');

  const NOME_NIVEL = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
  let pjNivel = 'medio';
  try {
    pjNivel = NOME_NIVEL[sessionStorage.getItem('px.nivel')] ? sessionStorage.getItem('px.nivel') : 'medio';
  } catch {
    /* sem armazenamento: fica no médio */
  }
  function nv(f, m, d) {
    return pjNivel === 'facil' ? f : pjNivel === 'dificil' ? d : m;
  }
  /* Tempo de cada relógio conforme o nível: metade a mais no Fácil, um quarto a menos no Difícil. */
  function pjSeg(s) {
    return Math.round(s * nv(1.5, 1, 0.75));
  }
  /* O que muda em cada jogo: [no Fácil, no Difícil]. O Médio é a regra do app. */
  const DIF = {
    termo: ['8 tentativas e a primeira letra já vem', '5 tentativas'],
    wordsearch: ['Só na horizontal e na vertical, e a pista mostra a primeira letra', 'Palavras também de trás para a frente'],
    scramble: ['A primeira palavra já vem no lugar', 'Não diz quantas palavras estão certas'],
    blitz: ['90 segundos e 3 alternativas', '45 segundos'],
    karuta: ['4 cartas na mesa e 12 segundos por carta', '6 segundos por carta'],
    choseong: ['A primeira vogal já vem aberta; 22 segundos', '11 segundos por palavra'],
    tenis: ['Bola lenta (11 s) e a primeira letra já vem', 'Bola rápida (6 s)'],
    koffer: ['4 vidas e mais tempo para olhar a mala', '2 vidas, menos tempo e etiquetas sem tradução'],
    bao: ['4 erros por palavra', '2 erros por palavra'],
    vitendawili: ['3 alternativas e a tradução da frase', 'Uma tentativa só por enigma'],
    shiritori: ['A letra exigida já aparece; 22 segundos', '11 segundos por elo'],
    taboo: ['Uma palavra proibida a menos; 45 segundos', '22 segundos por carta'],
    escuta: ['3 alternativas', 'Sem o botão de ouvir devagar'],
    ditado: ['Vale com 70% e há segunda chance', 'Precisa de 90%, sem segunda chance'],
    conectores: ['A tela diz quantos conectores procurar', 'Precisa de 80 pontos de precisão'],
  };
  const TREINA = {
    termo: 'a grafia: lembrar a palavra letra por letra a partir do significado.',
    wordsearch: 'lembrar a palavra antes de vê-la, partindo só da tradução.',
    scramble: 'a ordem das palavras numa frase de verdade.',
    blitz: 'reconhecer rápido: o significado puxa a palavra sem pensar.',
    karuta: 'entender de ouvido e achar a palavra escrita.',
    choseong: 'a grafia das vogais, que é onde mais se erra.',
    tenis: 'escrever a palavra de memória, sob pressão de tempo.',
    koffer: 'a memória de curto prazo: guardar várias palavras em ordem.',
    bao: 'montar a palavra por pedaços, na ordem em que se escreve.',
    vitendawili: 'usar a palavra no contexto de uma frase sua.',
    shiritori: 'a primeira e a última letra de cada palavra.',
    cadavre: 'produção livre: usar as palavras numa frase inventada por você.',
    taboo: 'chegar à palavra pela definição, sem as pistas fáceis.',
    karaoke: 'pronúncia e ritmo: repetir a fala em voz alta.',
    escuta: 'o ouvido: separar palavras de som parecido.',
    ditado: 'ouvir e escrever: do som para a grafia.',
    conectores: 'as palavras que ligam as ideias (but, because, so…).',
  };
  const AJUDA_TXT = { tempo: 'Devolve 10 segundos ao relógio.', resposta: 'Mostra a resposta por um instante. O acerto vale só o mínimo.' };
  ['blitz', 'karuta', 'choseong', 'tenis', 'shiritori', 'taboo'].forEach((id) => (JOGOS[id].tempo = true));
  const SEM_RESPOSTA = new Set(['cadavre', 'karaoke', 'koffer']);
  function ajudasDe(id) {
    const j = JOGOS[id];
    j.base ??= j.ajudas || [];
    const conta = (n) => (Number.isFinite(n) ? Math.max(1, n + nv(1, 0, -1)) : n);
    return [
      ...j.base.map((a) => [a[0], a[1], a[2], conta(a[3]), a[4]]),
      ...(j.tempo ? [['tempo', 'timer', '+10 s', nv(3, 2, 1)]] : []),
      ...(SEM_RESPOSTA.has(id) ? [] : [['resposta', 'eye', 'Ver resposta', nv(2, 1, 1), true]]),
    ];
  }
  function definirNivel(n) {
    pjNivel = n;
    try {
      sessionStorage.setItem('px.nivel', n);
    } catch {
      /* segue sem guardar */
    }
  }

  /* ---- Motor: o que entra por cima ------------------------------------------------ */
  const abrirJogoBase = abrirJogo;
  abrirJogo = function (id) {
    if (JOGOS[id]) JOGOS[id].ajudas = ajudasDe(id);
    return abrirJogoBase(id);
  };
  window.pxJogo = (id) => abrirJogo(id);
  const cascaBase = cascaDaPartida;
  cascaDaPartida = function (id) {
    const chip = DIF[id] ? `<button type="button" class="btn btn-outline peq pj-nivel" data-pj="nivel" data-nivel="${pjNivel}" aria-label="Nível de dificuldade: ${NOME_NIVEL[pjNivel]}. Toque para trocar">${ij('gauge')} ${NOME_NIVEL[pjNivel]}</button>` : '';
    return cascaBase(id).replace('<button type="button" class="btn btn-outline peq" data-pj="como"', chip + '<button type="button" class="btn btn-outline peq" data-pj="como"');
  };
  function pjPausar(sim) {
    if (!pj || pj.fim) return;
    if (sim) {
      if (pj.pausaEm) return;
      pj.pausaEm = performance.now();
      clearInterval(pj.relT);
      pj.aoPausa?.(true);
    } else if (pj.pausaEm) {
      const dt = performance.now() - pj.pausaEm;
      pj.pausaEm = 0;
      if (pj.rel) {
        pj.rel.fim += dt;
        pj.relT = setInterval(pj.rel.passo, 100);
      }
      pj.aoPausa?.(false);
    }
  }
  const acertoBase = pjAcerto;
  pjAcerto = function (el, o = {}) {
    pj.errSeg = 0;
    /* no Difícil cada acerto vale 5 pontos a mais */
    return acertoBase(el, pjNivel === 'dificil' ? { ...o, bonus: (o.bonus || 0) + 5 } : o);
  };
  const erroBase = pjErro;
  pjErro = function (el, msg, o) {
    erroBase(el, msg, o);
    if (!pj || pj.fim) return;
    pj.errSeg = (pj.errSeg || 0) + 1;
    if (pj.errSeg !== 2) return;
    /* Dois erros seguidos: em vez de deixar a pessoa travada, o jogo aponta uma ajuda que ela ainda tem. */
    const livres = $('.hud-ajudas .ajuda-jogo:not(:disabled)', tela).filter((x) => x.dataset.ajuda !== 'tempo');
    /* primeiro a dica do próprio jogo; ver a resposta é o último recurso */
    const b = livres.find((x) => x.title.startsWith('Conta') && x.dataset.ajuda !== 'resposta') || livres[0];
    if (!b) return;
    b.classList.add('pj-chama');
    setTimeout(() => b.classList.remove('pj-chama'), 3600);
    flutuar(b, 'quer uma ajuda?', '');
  };
  const fimBase = pjFim;
  pjFim = function (o = {}) {
    if (!pj || pj.fim) return;
    const vez = pj;
    fimBase(o);
    pjDepois((o.ja ? 200 : 900) + 60, () => {
      const acoes = P('.pj-fim-acoes');
      if (!acoes || !DIF[vez.id]) return;
      const tent = vez.acertos + vez.erros;
      /* A tela de fim sugere o nível seguinte: desce se ficou puxado, sobe se foi fácil demais. */
      const para = tent && vez.acertos / tent < 0.5 && pjNivel !== 'facil' ? (pjNivel === 'dificil' ? 'medio' : 'facil') : vez.acertos && !vez.erros && pjNivel !== 'dificil' ? (pjNivel === 'facil' ? 'medio' : 'dificil') : null;
      if (!para) return;
      const sobe = ['facil', 'medio', 'dificil'].indexOf(para) > ['facil', 'medio', 'dificil'].indexOf(pjNivel);
      acoes.insertAdjacentHTML('afterbegin', `<button type="button" class="btn btn-outline pj-sugere" data-pj="trocar-nivel" data-n="${para}">${ij(sobe ? 'flame' : 'heart')} ${sobe ? `Foi tranquilo? Jogar no ${NOME_NIVEL[para]}` : `Ficou puxado? Jogar no ${NOME_NIVEL[para]}`}</button>`);
    });
  };
  const usarBase = usarAjuda;
  usarAjuda = function (b) {
    const k = b.dataset.ajuda;
    if (k !== 'tempo' && k !== 'resposta') return usarBase(b);
    if (pj.fim || pj.ajudas[k] <= 0) return;
    if (k === 'tempo') {
      if (!pj.rel) return;
      pj.rel.fim += 10000;
      pj.rel.total = Math.max(pj.rel.total, pj.rel.fim - performance.now());
      pj.aoTempo?.();
      flutuar(b, '+10s', 'good');
      sentir('moeda');
    } else {
      const r = pj.resposta?.();
      if (!r) return;
      $('.pj-resp', tela)?.remove();
      palco().insertAdjacentHTML('beforeend', `<div class="pj-resp" role="status">Resposta: <b>${esc(r)}</b></div>`);
      const el = palco().lastElementChild;
      setTimeout(() => el.remove(), 3600 * K());
      pj.seq = 0;
      pj.comDica = true;
      pjHud();
      sentir('liga');
    }
    pj.errSeg = 0;
    pj.ajudas[k]--;
    $('.n', b).textContent = pj.ajudas[k];
    if (pj.ajudas[k] <= 0) b.disabled = true;
  };

  /* ---- Primeira vez e "Como se joga": três telas ---------------------------------- */
  const jaViu = new Set();
  function abrirOnb(pg = 0, primeira = false, aoFechar) {
    const j = JOGOS[pjId];
    const antes = pjNivel;
    pjPausar(true);
    const niveis = DIF[pjId]
      ? `<div class="pj-nivs" role="radiogroup" aria-label="Nível de dificuldade">${[['facil', DIF[pjId][0]], ['medio', 'A regra normal do jogo'], ['dificil', DIF[pjId][1] + '. Cada acerto vale 5 pontos a mais']]
          .map(([n, t]) => `<button type="button" class="pj-niv" role="radio" data-nivel-op="${n}" aria-checked="${n === pjNivel}"><b>${NOME_NIVEL[n]}</b><span>${t}</span></button>`)
          .join('')}</div>`
      : '<p class="pj-como-ajudas">Este jogo não tem níveis: é produção livre, sem certo ou errado contra o relógio.</p>';
    const ajudas = () =>
      ajudasDe(pjId)
        .map(([k, i, r, n, custa]) => `<li>${ij(i)}<span><b>${r}</b>${Number.isFinite(n) ? ` · ${n} por rodada` : ''}${AJUDA_TXT[k] ? `<small>${AJUDA_TXT[k]}</small>` : ''}</span><em class="${custa ? 'custa' : ''}">${custa ? 'zera o combo' : 'de graça'}</em></li>`)
        .join('');
    const paginas = [
      `<span class="px-mini" data-mini="${pjId}" aria-hidden="true" style="--mm:var(--accent)">${MINIS[pjId] || ''}</span><span class="label-mono">Como se joga · 1 de 3</span><h2>${j.titulo}</h2><p class="pj-onb-texto">${j.instr}</p><p class="pj-onb-treina">${ij('sparkles')}<span><b>O que treina:</b> ${TREINA[pjId]}</span></p>`,
      `<span class="label-mono">Passo a passo · 2 de 3</span><h2>Como jogar</h2><ol>${j.passos.map((p) => `<li><span>${p}</span></li>`).join('')}</ol>`,
      `<span class="label-mono">Do seu jeito · 3 de 3</span><h2>Nível e ajudas</h2>${niveis}<ul class="pj-onb-ajudas">${ajudas()}</ul><p class="pj-como-ajudas">O nível vale só para este jogo. Travou? Depois de dois erros seguidos o jogo aponta uma ajuda. E o que você errar sai sozinho: não precisa apagar.</p>`,
    ];
    const d = folhaDeBaixo(
      `<div class="pj-como pj-onb">${paginas.map((p, k) => `<section data-pg="${k}"${k === pg ? '' : ' hidden'}>${p}</section>`).join('')}
        <div class="pj-onb-pe"><span class="pj-onb-pontos" aria-hidden="true"><i></i><i></i><i></i></span><button type="button" class="pj-link" data-onb="fechar">${primeira ? 'Pular explicação' : 'Fechar'}</button><button type="button" class="btn btn-outline" data-onb="voltar">Voltar</button><button type="button" class="btn btn-solid" data-onb="prox" autofocus></button></div></div>`,
      'pj-como-folha',
    );
    const pintar = () => {
      $$('[data-pg]', d).forEach((s) => (s.hidden = +s.dataset.pg !== pg));
      $$('.pj-onb-pontos i', d).forEach((x, k) => x.classList.toggle('on', k === pg));
      $('[data-onb="voltar"]', d).hidden = pg === 0;
      $('[data-onb="prox"]', d).textContent = pg < 2 ? 'Próximo' : primeira ? 'Começar' : pjNivel !== antes ? `Recomeçar no ${NOME_NIVEL[pjNivel]}` : 'Continuar';
    };
    pintar();
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.nivelOp) {
        definirNivel(b.dataset.nivelOp);
        $$('.pj-niv', d).forEach((x) => x.setAttribute('aria-checked', x === b));
        $('.pj-onb-ajudas', d).innerHTML = ajudas();
        sentir('aba');
        return pintar();
      }
      const a = b.dataset.onb;
      if (a === 'fechar' || (a === 'prox' && pg === 2)) return fecharFolhaDeBaixo();
      if (a !== 'prox' && a !== 'voltar') return;
      const dir = a === 'prox' ? 1 : -1;
      pg += dir;
      pintar();
      sentir('aba');
      if (polido() && !reduz()) anima($(`[data-pg="${pg}"]`, d), [{ opacity: 0, transform: `translateX(${28 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }], { d: 320 });
    });
    /* A folha fecha por botão, Esc ou toque fora: em qualquer caso o jogo retoma (ou recomeça, se o nível mudou). */
    const espera = setInterval(() => {
      if (d.isConnected) return;
      clearInterval(espera);
      if (atual !== 'partida') return;
      if (pjNivel !== antes) return abrirJogo(pjId);
      pjPausar(false);
      aoFechar?.();
    }, 120);
  }
  const partidaBase = aoMostrar.partida;
  aoMostrar.partida = () => {
    if (jaViu.has(pjId)) return partidaBase();
    /* Primeira vez neste jogo: a explicação vem antes, e o relógio só anda depois dela. */
    jaViu.add(pjId);
    encerrarPartida();
    P('[data-pj="rotulo"]').textContent = 'Antes de começar';
    setTimeout(() => atual === 'partida' && abrirOnb(0, true, partidaBase), 450 * K());
  };
  ganchos.unshift((e, b) => {
    if (atual !== 'partida') return false;
    if (b.dataset.pj === 'como') return abrirOnb(0), true;
    if (b.dataset.pj === 'nivel') return abrirOnb(2), true;
    if (b.dataset.pj === 'trocar-nivel') return definirNivel(b.dataset.n), abrirJogo(pjId), true;
    return false;
  });

  /* ---- Termo: a linha nova já vem com as letras descobertas ------------------------ */
  Object.assign(JOGOS.termo, {
    montar(m) {
      const DEGRAUS = [[['STORM', 'tempestade']], [['SHELF', 'prateleira'], ['TOWEL', 'toalha']]];
      const PESO = { fora: 1, lugar: 2, certa: 3 };
      let d = 0, tabs, linha, max, teclas, cel, fix;
      const fileira = (k) => $(`[data-tab="${k}"] .linha-termo:nth-child(${linha + 1})`, m);
      /* Com um tabuleiro só, o que já é verde volta escrito: a pessoa só digita o que falta. */
      const novaLinha = () => {
        cel = tabs.length === 1 ? [...tabs[0].sabe] : Array(5).fill('');
        fix = cel.map(Boolean);
        tabs.forEach((t, k) => {
          const r = $(`[data-tab="${k}"] .revela`, m);
          if (r && tabs.length > 1 && t.sabe.some(Boolean)) r.textContent = t.sabe.map((c) => c || '·').join('');
        });
      };
      const pintar = () =>
        tabs.forEach((t, k) => {
          if (t.ok) return;
          $$('.letra', fileira(k)).forEach((c, i) => {
            c.classList.toggle('pj-fixa', !!fix[i]);
            if (c.textContent === cel[i]) return;
            c.textContent = cel[i];
            c.classList.toggle('cheia', !!cel[i]);
          });
        });
      const armar = () => {
        const ws = DEGRAUS[d];
        max = (ws.length === 1 ? 6 : 7) + nv(2, 0, -1);
        linha = 0;
        teclas = {};
        tabs = ws.map(([w, pista]) => ({ w, pista, ok: false, sabe: Array(5).fill('') }));
        if (pjNivel === 'facil') tabs.forEach((t) => (t.sabe[0] = t.w[0]));
        m.innerHTML = `<div class="tabs-termo pj-tabs" data-n="${ws.length}">${tabs
          .map((t, k) => `<div class="tab-termo" data-tab="${k}"><header><span class="pista">${t.pista}</span><span class="revela"></span></header><div class="grade-termo">${Array.from({ length: max }, (_, l) => `<div class="linha-termo${l ? '' : ' atual'}">${Array.from({ length: 5 }, (_, i) => `<span class="letra" style="--i:${i}"></span>`).join('')}</div>`).join('')}</div></div>`)
          .join('')}</div>${tecladoHtml(['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'])}`;
        novaLinha();
        pintar();
      };
      const digitar = (ch) => {
        const k = cel.indexOf('');
        if (pj.trava || k < 0) return;
        cel[k] = ch;
        sentir('tecla');
        pintar();
      };
      const apagar = () => {
        if (pj.trava) return;
        let k = 4;
        while (k >= 0 && (!cel[k] || fix[k])) k--;
        if (k < 0) return;
        cel[k] = '';
        sentir('solta');
        pintar();
      };
      const enviar = () => {
        if (pj.trava) return;
        if (cel.includes('')) {
          tabs.forEach((t, k) => !t.ok && tremer(fileira(k)));
          return sentir('erro');
        }
        pj.trava = true;
        const palpite = cel.join('');
        const fechadas = [];
        tabs.forEach((t, k) => {
          if (t.ok) return;
          const res = julgar(palpite, t.w);
          const f = fileira(k);
          $$('.letra', f).forEach((c, i) => (c.classList.remove('pj-fixa'), c.classList.add(res[i])));
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
          novaLinha();
          pintar();
        });
      };
      pj.resposta = () => tabs.filter((t) => !t.ok).map((t) => t.w).join(' · ');
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
        if (i < 0 || pj.trava) return false;
        t.sabe[i] = t.w[i];
        if (tabs.length === 1) {
          cel[i] = t.w[i];
          fix[i] = true;
          pintar();
        } else $(`[data-tab="${k0}"] .revela`, m).textContent = t.sabe.map((c) => c || '·').join('');
        flutuar($(`[data-tab="${k0}"]`, m), `letra ${i + 1}`, '');
      };
      armar();
    },
  });

  /* ---- Frase embaralhada: o que está errado volta sozinho para o banco ------------- */
  Object.assign(JOGOS.scramble, {
    montar(m) {
      const fr = emb(FRASES).slice(0, 4);
      let i = 0, linha, pecas, pal, certas = 0;
      const desenhar = () => {
        const antes = new Map($$('[data-k]', m).map((x) => [x.dataset.k, x.getBoundingClientRect()]));
        $('[data-linha]', m).innerHTML = linha.length ? linha.map((x, k) => `<button type="button" class="pj-peca na-linha${k < certas ? ' fixa' : ''}" data-k="${x.k}" title="Toque para tirar da frase">${x.p}</button>`).join('') : '<span class="pj-vazio">Toque nas palavras na ordem certa.</span>';
        $('[data-banco]', m).innerHTML = pecas.map((x) => (linha.includes(x) ? `<button type="button" class="pj-peca fantasma" disabled aria-hidden="true">${x.p}</button>` : `<button type="button" class="pj-peca" data-k="${x.k}">${x.p}</button>`)).join('');
        $('[data-pj="conferir"]', m).disabled = linha.length < pecas.length;
        $('[data-pj="limpar"]', m).disabled = !linha.length;
        if (!polido() || reduz()) return;
        for (const x of $$('[data-k]', m)) {
          const de = antes.get(x.dataset.k);
          if (!de) continue;
          const para = x.getBoundingClientRect();
          const [dx, dy] = [de.left - para.left, de.top - para.top];
          if (Math.abs(dx) + Math.abs(dy) > 2) anima(x, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { d: 460, e: MOLA_SUAVE });
        }
      };
      const prefixo = () => {
        let n = 0;
        while (n < linha.length && linha[n].p === pal[n]) n++;
        return n;
      };
      const prox = () => {
        if (i >= fr.length) return pjFim();
        pal = fr[i].en.split(' ');
        certas = 0;
        do pecas = emb(pal.map((p, k) => ({ p, k })));
        while (pecas.every((x, k) => x.k === k));
        /* no Fácil a primeira palavra já vem no lugar */
        linha = pjNivel === 'facil' ? [pecas.find((x) => x.k === 0)] : [];
        certas = linha.length;
        m.innerHTML = `<div class="pj-centro"><span class="label-mono">Esta frase significa</span><p class="pj-traducao">${fr[i].pt}</p></div>
          <div class="pj-linha" data-linha></div><p class="pj-aviso" role="status"></p><div class="pj-pecas" data-banco></div>
          <div class="pj-acoes"><button type="button" class="btn btn-outline" data-pj="limpar">${ij('rotate-ccw')} Recomeçar</button><button type="button" class="btn btn-solid" data-pj="conferir">${ij('check')} Conferir</button></div>
          <button type="button" class="pj-link" data-pj="pular">pular esta frase</button>`;
        desenhar();
      };
      pj.resposta = () => fr[i]?.en;
      pj.clique = (b) => {
        if (pj.trava) return;
        const a = b.dataset.pj;
        if (b.dataset.k != null) {
          const x = pecas.find((y) => y.k === +b.dataset.k);
          const naLinha = linha.includes(x);
          linha = naLinha ? linha.filter((y) => y !== x) : [...linha, x];
          certas = Math.min(certas, prefixo());
          sentir(naLinha ? 'solta' : 'encaixa');
          $('.pj-linha', m).classList.remove('errada');
          $('.pj-aviso', m).textContent = '';
          return desenhar();
        }
        if (a === 'limpar') return (linha = []), (certas = 0), desenhar();
        if (a === 'pular') {
          pjErro(null, null, { conta: true });
          i++;
          return prox();
        }
        if (a !== 'conferir') return;
        const l = $('.pj-linha', m);
        if (linha.map((x) => x.p).join(' ') === fr[i].en) {
          pj.trava = true;
          certas = linha.length;
          desenhar();
          l.classList.add('certa');
          pjAcerto(l);
          dizer(fr[i].en);
          i++;
          return pjDepois(1400, () => ((pj.trava = false), prox()));
        }
        /* Errou a ordem: o começo certo fica verde e preso; o resto volta sozinho para baixo. */
        const n = prefixo();
        pj.trava = true;
        l.classList.add('errada');
        $$('.pj-peca', l).forEach((x, k) => k >= n && x.classList.add('errou'));
        $('.pj-aviso', m).textContent = pjNivel === 'dificil' ? 'Ainda não. As que estavam fora de lugar voltaram.' : n ? `${n} ${n === 1 ? 'palavra ficou' : 'palavras ficaram'} no lugar certo. As outras voltaram: continue daqui.` : 'Ainda não. As palavras voltaram: tente começar por outra.';
        pjErro(l, 'Ordem incorreta');
        pjDepois(750, () => {
          linha = linha.slice(0, n);
          certas = pjNivel === 'dificil' ? 0 : n;
          l.classList.remove('errada');
          pj.trava = false;
          desenhar();
        });
      };
      pj.ajuda = (k) => {
        if (k === 'ouvir') return void dizer(fr[i].en);
        const n = prefixo();
        if (n >= pal.length) return false;
        linha = linha.slice(0, n);
        linha.push(pecas.find((x) => x.p === pal[n] && !linha.includes(x)));
        certas = n + 1;
        sentir('encaixa');
        desenhar();
        flutuar($('.pj-linha', m), `palavra ${n + 1}`, '');
      };
      prox();
    },
  });

  /* ---- Choseong: só a vogal errada sai; as certas ficam ----------------------------- */
  Object.assign(JOGOS.choseong, {
    montar(m) {
      const fila = emb(VOC.filter((v) => v[0].length >= 4 && /[aeiou]/.test(v[0]))).slice(0, 6);
      let i = 0, alvo, pos, vog, presa;
      const caixas = () => $$('.pj-vaga', m);
      const pintar = () =>
        caixas().forEach((c, k) => {
          c.textContent = vog[k] || '';
          c.classList.toggle('cheia', !!vog[k]);
          c.classList.toggle('pj-fixa', !!presa[k]);
        });
      const prox = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        alvo = fila[i][0].toUpperCase();
        pos = [...alvo].map((c, k) => ('AEIOU'.includes(c) ? k : -1)).filter((k) => k >= 0);
        vog = pos.map(() => '');
        presa = pos.map(() => false);
        if (pjNivel === 'facil' && pos.length > 1) {
          vog[0] = alvo[pos[0]];
          presa[0] = true;
        }
        m.innerHTML = `<div class="termo-dica"><span class="label-mono">Significa</span><b>${fila[i][1]}</b></div>
          <div class="linha-termo pj-cho">${[...alvo].map((c, k) => (pos.includes(k) ? `<span class="letra pj-vaga" style="--i:${k}"></span>` : `<span class="letra pj-cons" style="--i:${k}">${c}</span>`)).join('')}</div>
          ${tecladoHtml(['AEIOU'], 'apagar', 'vogais')}`;
        pintar();
        pjRelogio(pjSeg(15), () => {
          pj.trava = true;
          caixas().forEach((c, k) => {
            c.textContent = alvo[pos[k]];
            c.classList.add('lugar');
          });
          pjErro($('.pj-cho', m), 'o tempo acabou', { conta: true });
          i++;
          pjDepois(1300, prox);
        });
      };
      const por = (v) => {
        const k = vog.indexOf('');
        if (pj.trava || k < 0) return;
        vog[k] = v;
        sentir('tecla');
        pintar();
        if (vog.includes('')) return;
        pj.trava = true;
        const erradas = vog.map((x, n) => x !== alvo[pos[n]]);
        if (!erradas.includes(true)) {
          pjPararRelogio();
          caixas().forEach((c) => (c.classList.remove('pj-fixa'), c.classList.add('certa')));
          $('.pj-cho', m).classList.add('venceu');
          pjAcerto($('.pj-cho', m));
          dizer(alvo.toLowerCase());
          i++;
          return pjDepois(1100, prox);
        }
        /* As vogais certas ficam presas; só as erradas piscam em vermelho e saem. */
        caixas().forEach((c, n) => erradas[n] && c.classList.add('pj-no'));
        pjErro($('.pj-cho', m));
        pjDepois(520, () => {
          erradas.forEach((e, n) => (e ? (vog[n] = '') : (presa[n] = true)));
          caixas().forEach((c) => c.classList.remove('pj-no'));
          pintar();
          pj.trava = false;
        });
      };
      const apagar = () => {
        if (pj.trava) return;
        let k = vog.length - 1;
        while (k >= 0 && (!vog[k] || presa[k])) k--;
        if (k < 0) return;
        vog[k] = '';
        sentir('solta');
        pintar();
      };
      pj.resposta = () => alvo;
      pj.clique = (b) => b.dataset.tecla && (b.dataset.tecla === 'Backspace' ? apagar() : por(b.dataset.tecla));
      pj.tecla = (e) => {
        if (e.key === 'Backspace') return apagar();
        if (/^[aeiouAEIOU]$/.test(e.key)) por(e.key.toUpperCase());
      };
      pj.ajuda = () => {
        const k = vog.findIndex((x, n) => x !== alvo[pos[n]]);
        if (pj.trava || k < 0) return false;
        /* a dica abre a primeira vogal que ainda não está certa, e ela fica presa */
        vog[k] = '';
        pjDepois(0, () => {
          presa[k] = true;
          por(alvo[pos[k]]);
        });
      };
      prox();
    },
  });
