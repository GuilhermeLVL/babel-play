  /* ==========================================================================
     Rodada 10 — miniaturas dos minijogos.
     Hoje o cartão de cada jogo é só texto. Cada miniatura é uma cena pequena,
     desenhada em HTML/CSS com as cores do tema, que MOSTRA a mecânica:
     virar cartas, achar a palavra na grade, encaixar a peça na lacuna...
     Ela se mexe quando o ponteiro passa (no celular, devagar o tempo todo).
     Entra depois de sentidos.js (usa `com`).
     ========================================================================== */
  const letras = (s, marca = () => '') => [...s].map((c, i) => `<i class="mm-l ${marca(i, c)}" style="--i:${i}">${c === ' ' ? '' : c}</i>`).join('');
  const barras = (n = 5) => `<span class="mm-eq">${'<i></i>'.repeat(n).replace(/<i>/g, () => `<i style="--i:${Math.floor(Math.random() * 5)}">`)}</span>`;
  const MINIS = {
    memory: `<i class="mm-carta">?</i><i class="mm-carta ok" style="--i:1">sol</i><i class="mm-carta ok" style="--i:2">sun</i><i class="mm-carta">?</i>`,
    wordsearch: `<span class="mm-grade">${letras('MRCASAPTLUAEOSOLKV', (i) => (i >= 2 && i <= 5 ? 'achou' : ''))}</span>`,
    termo: `<span class="mm-termo">${letras('PORTA', (i) => ['x', 'y', 'x', 'x', 'g'][i])}${letras('CASAS', () => 'g')}</span>`,
    scramble: `<i class="mm-chip e1">today</i><i class="mm-chip e2">We</i><i class="mm-chip e3">ship</i>`,
    blitz: `<span class="mm-raio">${ic('zap')}</span><span class="mm-coluna"><span class="mm-tempo"><i></i></span><span class="mm-linha-chips"><i class="mm-chip ok">sol</i><i class="mm-chip">lua</i></span></span><b class="mm-combo">×3</b>`,
    karuta: `<span class="mm-som">${ic('volume2')}</span><i class="mm-carta clara">lua</i><i class="mm-carta clara pega">sol</i><i class="mm-carta clara">mar</i>`,
    choseong: `<span class="mm-termo uma">${letras('CASA', (i) => (i % 2 ? 'vogal' : 'g'))}</span>`,
    tenis: `<i class="mm-bola"></i><i class="mm-rede"></i><i class="mm-chip rali">word</i>`,
    koffer: `<span class="mm-mala"><i class="mm-chip m1">sol</i><i class="mm-chip m2">mar</i><i class="mm-chip m3">lua</i></span>`,
    bao: `<span class="mm-bao">${'<i></i>'.repeat(8)}<b class="mm-semente"></b></span>`,
    vitendawili: `<span class="mm-frase">We <i class="mm-lacuna"><i class="mm-chip ok">ship</i></i> it today</span>`,
    shiritori: `<span class="mm-elo">cas<b>a</b></span><i class="mm-seta"></i><span class="mm-elo" style="--i:1"><b>a</b>mo<b>r</b></span><i class="mm-seta"></i><span class="mm-elo" style="--i:2"><b>r</b>io</span>`,
    cadavre: `<span class="mm-coluna"><span class="mm-linha-chips"><i class="mm-chip">sol</i><i class="mm-chip">mar</i><i class="mm-chip">rio</i><i class="mm-chip">lua</i></span><span class="mm-escrita"><i></i></span></span>`,
    taboo: `<span class="mm-tabu"><s>casa</s><s>lar</s><s>morar</s><b>?</b></span>`,
    karaoke: `<span class="mm-som grande">${ic('mic')}</span>${barras(7)}<b class="mm-nota">92</b>`,
    escuta: `<span class="mm-som">${ic('volume2')}</span><i class="mm-chip ok pulsa">ship</i><i class="mm-chip">sheep</i>`,
    conectores: `<span class="mm-frase">We ship <i class="mm-chip ok pulsa">but</i> later</span>`,
    ditado: `${barras(4)}<span class="mm-termo uma dita">${letras('CASA', () => 'g')}<i class="mm-cursor"></i></span>`,
  };
  const POR_TITULO = [
    [/Memória/, 'memory'],
    [/Frase embaralhada/, 'scramble'],
    [/Ditado/, 'ditado'],
    [/Qual foi/, 'escuta'],
  ];
  function vestirJogos() {
    if (!polido()) return;
    for (const tile of $$('.q-tile[data-jogo], .qs-jogos .q-tile', tela)) {
      if ($(':scope > .px-mini', tile)) continue;
      const id = tile.dataset.jogo || POR_TITULO.find(([re]) => re.test(tile.textContent))?.[1];
      const cena = MINIS[id] || `<span class="mm-som grande">${ic('gamepad-2')}</span>`;
      const cor = $('.qj-ponto', tile)?.style.background || 'var(--accent)';
      tile.insertAdjacentHTML('afterbegin', `<span class="px-mini" data-mini="${id || 'outro'}" aria-hidden="true" style="--mm:${cor}">${cena}</span>`);
      tile.classList.add('px-com-mini');
    }
  }
  trocar = com(trocar, () => setTimeout(vestirJogos, 0));
  repintar = com(repintar, () => setTimeout(vestirJogos, 0));
  alternarEstado = com(alternarEstado, () => setTimeout(vestirJogos, 0));
