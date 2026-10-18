  /* ==========================================================================
     Rodada 14 — decisões que o dono deixou comigo ("o que fizer mais sentido").
     1. O nível é POR JOGO: quem vai bem no Termo pode precisar do Fácil no Ditado.
        Um jogo que a pessoa ainda não ajustou começa no último nível que ela escolheu.
     2. A Memória entra no mesmo motor dos outros: ganha níveis, a explicação
        da primeira vez, o aviso depois de dois erros e a tela de fim comum.
     Ficam como estavam: Difícil paga 5 pontos a mais, "Ver resposta" zera o combo
     e o Ditado tem segunda chance no Fácil e no Médio.
     ========================================================================== */
  let nivelPadrao = pjNivel;
  let nivelPorJogo = {};
  try {
    nivelPorJogo = JSON.parse(sessionStorage.getItem('px.niveis') || '{}');
  } catch {
    /* sem armazenamento */
  }
  definirNivel = function (n) {
    pjNivel = nivelPadrao = nivelPorJogo[pjId] = n;
    try {
      sessionStorage.setItem('px.nivel', n);
      sessionStorage.setItem('px.niveis', JSON.stringify(nivelPorJogo));
    } catch {
      /* segue sem guardar */
    }
  };
  const abrirJogoComNivel = abrirJogo;
  abrirJogo = function (id) {
    if (!JOGOS[id]) return abrirJogoComNivel(id);
    /* na primeira vez o jogo herda o último nível escolhido e fica com ele: mexer em outro jogo depois não muda este */
    if (!NOME_NIVEL[nivelPorJogo[id]]) nivelPorJogo[id] = nivelPadrao;
    pjNivel = nivelPorJogo[id];
    if (id !== 'memory') return abrirJogoComNivel(id);
    /* a Memória agora abre pelo motor, não mais pela tela copiada */
    JOGOS.memory.ajudas = ajudasDe('memory');
    pjId = 'memory';
    D.telas.partida = cascaDaPartida('memory');
    mostrar('partida', { origem: 'clique' });
  };
  window.pxJogo = (id) => abrirJogo(id);

  DIF.memory = ['6 pares, cartas abertas por mais tempo e 3 espiadas', 'As cartas fecham rápido e só há 1 espiada'];
  TREINA.memory = 'ligar a palavra ao significado, e lembrar onde cada uma está.';
  SEM_RESPOSTA.add('memory');
  JOGOS.memory = {
    titulo: 'Memória: palavra e tradução', curto: 'Memória', icone: 'puzzle', rodada: 'Rodada · pares de palavra e tradução', unidade: 'pares', n: 8,
    instr: 'Vire duas cartas por vez e feche os pares: a palavra e a tradução dela.',
    ajudas: [['espiar', 'eye', 'Espiar', 2, true]],
    passos: ['Toque em duas cartas para virá-las.', 'Se forem a palavra e a tradução dela, o par fica aberto. Se não, as duas fecham sozinhas: guarde onde estavam.', 'Espiar mostra todas as cartas por um instante. Feche todos os pares para terminar.'],
    montar(m) {
      const pares = emb(VOC).slice(0, nv(6, 8, 8));
      pj.total = pares.length;
      const cartas = emb(pares.flatMap(([en, pt], k) => [{ t: en, k, en }, { t: pt, k, en }]));
      m.innerHTML = `<div class="tabuleiro w-full" aria-label="Tabuleiro" style="margin:auto;grid-template-columns:repeat(4,1fr);max-width:720px">${cartas.map((c, i) => `<button type="button" aria-label="Carta virada" class="carta" data-texto="${c.t}" data-par="${c.k}" data-en="${c.en}" style="--i:${i}"><span class="verso" aria-hidden="true">?</span></button>`).join('')}</div>`;
      const todas = $$('.carta', m);
      const vistas = new Set();
      let abertas = [];
      if (polido() && !reduz()) {
        /* as cartas saem de um monte embaixo do tabuleiro, uma a uma */
        const [mx, my] = centro($('.tabuleiro', m));
        todas.forEach((c, i) => {
          const [x, y] = centro(c);
          anima(c, [{ opacity: 0, transform: `translate(${mx - x}px, ${my - y + 240}px) rotate(${(i % 2 ? 1 : -1) * (10 + i * 2)}deg) scale(0.5)` }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' }], { d: 700, atraso: 120 + i * 45, e: MOLA_SUAVE });
        });
      }
      pj.clique = (c) => {
        if (!c.classList.contains('carta') || pj.trava || abertas.includes(c) || c.classList.contains('virada') || c.classList.contains('par')) return;
        abertas.push(c);
        girar(c, true);
        if (abertas.length < 2) return;
        pj.trava = true;
        const [a, b] = abertas;
        abertas = [];
        pjDepois(nv(900, 760, 560), () => {
          if (a.dataset.par === b.dataset.par) {
            a.classList.add('par');
            b.classList.add('par');
            pj.trava = false;
            pjAcerto(b);
            dizer(a.dataset.en);
            if (pj.feitos >= pj.total) pjFim();
            return;
          }
          /* Só conta como erro quando a pessoa já tinha visto uma das duas: virar carta nova é explorar, não errar. */
          if (vistas.has(a) || vistas.has(b)) pjErro(null);
          else {
            pj.seq = 0;
            pjHud();
            sentir('solta');
          }
          vistas.add(a).add(b);
          [a, b].forEach(tremer);
          /* as duas fecham sozinhas; no Fácil ficam abertas mais tempo para dar para guardar */
          pjDepois(nv(1100, 520, 300), () => {
            girar(a, false);
            girar(b, false);
            pj.trava = false;
          });
        });
      };
      pj.ajuda = () => {
        if (pj.trava) return false;
        pj.trava = true;
        const fechadas = todas.filter((c) => !c.classList.contains('par') && !c.classList.contains('virada'));
        fechadas.forEach((c) => (girar(c, true), vistas.add(c)));
        pjDepois(nv(2400, 1700, 1300), () => {
          fechadas.forEach((c) => !abertas.includes(c) && girar(c, false));
          pj.trava = false;
        });
      };
    },
  };
  ganchos.unshift((e, b) => {
    if (atual !== 'jogar' && atual !== 'sessao') return false;
    const t = b.closest('.q-tile[data-jogo], .qs-jogos .q-tile');
    const id = t && (t.dataset.jogo || POR_TITULO.find(([re]) => re.test(t.textContent))?.[1]);
    if (id === 'memory') return abrirJogo('memory'), true;
    if (atual === 'jogar' && !t && /^(Partida rápida|Começar)/.test(txt(b))) return abrirJogo('memory'), true;
    return false;
  });
