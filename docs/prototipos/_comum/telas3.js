  /* ==========================================================================
     Rodada 6 — a tela da sessão aberta (SessaoDoQuest.tsx) e a trilha inteira
     da temporada, do nível 1 ao 30, com os prêmios reais de produção.
     Mesmo escopo dos outros módulos.
     ========================================================================== */
  SIMPLES.download = svg('<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>');
  SIMPLES.play = svg('<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>');
  SIMPLES['skip-back'] = svg('<path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><path d="M3 20V4"/>');
  SIMPLES['skip-forward'] = svg('<path d="M21 4v16"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/>');

  /* ---- Sessão ------------------------------------------------------------------ */
  const QUEM = ['Ana', 'Leo', 'Ana', 'Leo', 'Ana', 'Leo'];
  const TEMPOS = ['00:04', '00:11', '00:19', '00:26', '00:38', '00:45'];
  const sessao = { aba: 0, visao: 0, toca: null };
  const palavrasDe = (frase) => frase.split(' ').map((p) => `<span class="w">${esc(p)}</span>`).join(' ');
  function pararPlayer() {
    if (!sessao.toca) return;
    clearTimeout(sessao.toca.t);
    sessao.toca = null;
    $$('.qs-fala.ativa, .ql-frase.narrando', tela).forEach((x) => x.classList.remove('ativa', 'narrando'));
    $$('.w.dita', tela).forEach((x) => x.classList.remove('dita'));
    const b = $('[data-px="tocar"]', tela);
    if (b) b.innerHTML = ic('play') + ' ' + (sessao.aba === 1 ? 'Narrar' : 'Ouvir');
    const onde = $('.px-onde', tela);
    if (onde) onde.textContent = sessao.aba === 1 ? 'Frase 1 de 6' : 'Fala 1 de 6';
  }
  /* O player percorre as falas: a linha ativa acende e as palavras vão sendo "ditas" uma a uma. */
  function tocar(i = 0) {
    pararPlayer();
    const linhas = $$(sessao.aba === 1 ? '.ql-frase' : '.qs-fala', tela);
    if (!linhas[i]) return;
    const classe = sessao.aba === 1 ? 'narrando' : 'ativa';
    sessao.toca = { i };
    const s = sessao.toca;
    const b = $('[data-px="tocar"]', tela);
    b.innerHTML = ic('pause') + ' Pausar';
    sentir('grava');
    const passo = (k) => {
      if (sessao.toca !== s) return;
      const linha = linhas[s.i];
      if (!linha) return pararPlayer();
      if (k === 0) {
        linhas.forEach((x) => x.classList.remove(classe));
        linha.classList.add(classe);
        linha.scrollIntoView({ block: 'center', behavior: polido() && !reduz() ? 'smooth' : 'auto' });
        $('.px-onde', tela).textContent = `${sessao.aba === 1 ? 'Frase' : 'Fala'} ${s.i + 1} de 6`;
        const tr = $('.qs-posicao', tela);
        if (tr) tr.style.width = ((s.i + 1) / 6) * 100 + '%';
        if (polido() && !reduz()) anima(linha, [{ transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA_SUAVE });
      }
      const ws = $$('.w', linha);
      if (k < ws.length) {
        ws[k].classList.add('dita');
        s.t = setTimeout(() => passo(k + 1), 210 * K());
      } else {
        s.i++;
        s.t = setTimeout(() => passo(0), 520 * K());
      }
    };
    s.i = i;
    passo(0);
  }
  const PAINEIS_DA_SESSAO = [
    () => `<div class="q-acoes qs-barra"><button type="button" class="q-chip">${ic('circle-question-mark')} Procedência</button><button type="button" class="q-chip">${ic('book-open')} Palavras desta sessão <span class="qs-n">37</span></button><button type="button" class="q-chip">${ic('sliders-horizontal')} Ajustar exibição</button></div>
      <div class="transcrito qs-falas">${FALAS.map(
        ([o, t], i) => `<div class="qs-fala" data-fala="${i}"><button type="button" class="qs-fala-texto"><span class="qs-meta"><span class="qs-quem">${QUEM[i]}</span><span class="qs-tempo tn">${TEMPOS[i]}</span>${i === 1 ? '<span class="q-tag">Polida</span>' : ''}</span><span class="qs-o" lang="en">${palavrasDe(o)}</span><span class="qs-t" lang="pt">${esc(t)}</span></button>
        <div class="qs-acoes-da-fala"><button type="button" class="q-ctl" aria-label="Ouvir este trecho" data-px-ouvir="${i}">${ic('volume2')}</button><button type="button" class="q-ctl" aria-label="Opções da fala" data-px-opcoes="${i}">${ic('ellipsis')}</button></div></div>`,
      ).join('')}</div>
      <div class="q-faixa px-player"><button type="button" class="q-ctl" aria-label="Fala anterior" data-px="antes">${ic('skip-back')}</button><button type="button" class="q-ctl pri" data-px="tocar">${ic('play')} Ouvir</button><button type="button" class="q-ctl" aria-label="Próxima fala" data-px="depois">${ic('skip-forward')}</button>
        <span class="qs-trilho px-trilho-do-player"><span class="qs-posicao" style="width:0%"></span></span><span class="q-tempo px-onde">Fala 1 de 6</span></div>`,
    () => `<div class="ql"><div class="q-acoes ql-barra"><div class="q-abas q-seg" role="group" aria-label="Modo de leitura"><button type="button" class="q-aba" aria-checked="true">Modo interativo</button><button type="button" class="q-aba" aria-checked="false">Desenho livre</button></div><button type="button" class="q-chip">Estudos &amp; notas</button><button type="button" class="q-chip">${ic('sliders-horizontal')} Ajustar exibição</button></div>
      <section class="q-cartao ql-texto"><div class="ql-frases">${FALAS.map(([o, t], i) => `<button type="button" class="ql-frase" data-fala="${i}"><span class="ql-o" lang="en">${palavrasDe(o)}</span><span class="ql-t" lang="pt">${esc(t)}</span></button>`).join('')}</div></section>
      <div class="q-faixa ql-narrador px-player"><button type="button" class="q-ctl" aria-label="Frase anterior" data-px="antes">${ic('skip-back')}</button><button type="button" class="q-ctl pri" data-px="tocar">${ic('play')} Narrar</button><button type="button" class="q-ctl" aria-label="Próxima frase" data-px="depois">${ic('skip-forward')}</button><span class="q-espaco"></span><span class="q-tempo ql-onde px-onde">Frase 1 de 6</span><button type="button" class="q-ctl">Voz, idioma e tom</button></div></div>`,
    () => `<div class="q-secao qs-jogos"><header><div><h2>Jogos com esta sessão</h2><p>As rodadas usam só as palavras e as falas desta gravação.</p></div></header>
      <div class="q-grade g4">${[
        ['Memória: palavra e tradução', 'Clicar', 'Vire as cartas e feche os pares palavra ↔ tradução', 1],
        ['Frase embaralhada', 'Clicar', 'Uma frase real desta sessão, fora de ordem', 0],
        ['Ditado', 'Digitar', 'Ouça a fala e escreva o que entendeu', 0],
        ['Qual foi a fala?', 'Clicar', 'Ouça o trecho e escolha a frase certa', 0],
      ]
        .map(([n, tag, d, abre]) => `<button type="button" class="q-tile" ${abre ? 'data-px="jogar-memoria"' : 'data-px="jogo-fechado"'}><span class="qj-jogo-topo"><i class="qj-ponto"></i><span class="q-tag">${tag}</span></span><b>${n}</b><span class="q-d">${d}</span></button>`)
        .join('')}</div></div>`,
    () => {
      const sub = [
        () => `<div class="q-grade g4 qs-ladrilhos">${[['Palavras', '1.234'], ['Duração', '38 min'], ['Palavras novas', '37'], ['Falantes', '2']].map(([r, v]) => `<div class="q-cartao q-num"><span class="q-rotulo">${r}</span><b>${v}</b></div>`).join('')}</div>
          <section class="q-cartao"><p class="qs-titulo-do-cartao q-rotulo">Palavras-chave da sessão</p><div class="q-acoes">${Object.keys(GLOSA).slice(0, 9).map((p) => `<span class="q-chip">${p}</span>`).join('')}</div></section>`,
        () => `<div class="q-grade g2 qs-lexical"><section class="q-cartao"><p class="qs-titulo-do-cartao q-rotulo">Topologia lexical da sessão</p><div class="px-nuvem">${Object.keys(GLOSA).map((p, i) => `<span style="font-size:${14 + ((i * 7) % 16)}px">${p}</span>`).join('')}</div></section>
          <section class="q-cartao"><p class="qs-titulo-do-cartao q-rotulo">Microdados lexicais</p><div class="q-lista">${Object.entries(GLOSA).slice(0, 4).map(([p, [, g]], i) => `<div class="q-linha qs-ocorrencia"><span><b class="qs-palavra-do-micro">${p}</b><small>${g}</small></span><span class="q-fim">${5 - i}×</span></div>`).join('')}</div></section></div>`,
        () => `<div class="q-grade g3">${[['Silêncio total', '2 min 10 s'], ['Vícios de linguagem', '14'], ['Pausas longas', '6']].map(([r, v]) => `<div class="q-cartao q-num"><span class="q-rotulo">${r}</span><b>${v}</b></div>`).join('')}</div>
          <section class="q-cartao qs-ritmo"><p class="qs-titulo-do-cartao q-rotulo">Ritmo por falante</p>${[['Ana', 148, 74], ['Leo', 162, 81]].map(([n, ppm, pct]) => `<div class="qs-falante"><b>${n}</b><span class="q-barra"><span style="width:${pct}%"></span></span><span class="qs-ppm tn">${ppm} ppm</span></div>`).join('')}</section>`,
      ];
      return `<div class="qs-visao"><div class="q-abas q-seg px-abas-visao" role="group" aria-label="Visão">${['Painel', 'Inteligência lexical', 'Fluência'].map((t, i) => `<button type="button" class="q-aba" aria-checked="${sessao.visao === i}" data-px-visao="${i}">${t}</button>`).join('')}</div>${sub[sessao.visao]()}</div>`;
    },
  ];
  function htmlDaSessao() {
    const g = filtradas()[bib.sel] || GRAVACOES[0];
    return `<div class="q-palco qs px-sessao">
      <header class="q-cab"><button type="button" class="q-ctl q-voltar" aria-label="Voltar à Biblioteca" data-px="voltar-bib">${ic('arrow-left')}</button>
        <div class="qs-titulo"><p class="q-sobre">Sessão de ${g.tipo.toLowerCase()} · ${g.min ? g.min + ' min' : 'texto'}</p><h1>${esc(g.t)}</h1><p class="qs-sub">Análise do texto, prática ativa e exercícios criados a partir desta mídia.</p></div>
        <button type="button" class="q-chip" data-px="voltar-bib">${ic('arrow-left-right')} Trocar de sessão</button><button type="button" class="q-ctl">${ic('download')} Exportar</button></header>
      <div class="q-abas qs-abas px-abas-sessao" role="tablist" aria-label="Sessão">${['Transcrição', 'Leitura', 'Jogos <span class="n">4</span>', 'Visão geral &amp; métricas'].map((t, i) => aba(t, sessao.aba === i, `data-px-sessao-aba="${i}"`)).join('')}</div>
      <div class="qs-painel">${PAINEIS_DA_SESSAO[sessao.aba]()}</div>
    </div>`;
  }
  Object.defineProperty(D.telas, 'sessao', { get: htmlDaSessao });
  aoSair.sessao = pararPlayer;

  /* ---- Temporada: a trilha inteira, do 1 ao 30 ---------------------------------- */
  TRILHA.push(
    [11, '', 'Canopus'], [12, 'Legenda Letreiro', 'Moldura Cassiopeia'], [13, '', 'Arcturus'], [14, '+100 Seeds', 'Moldura Andrômeda'], [15, '', 'Aldebarã'],
    [16, '+110 Seeds', 'Moldura Pégaso'], [17, '', 'Betelgeuse'], [18, 'Moldura Órbita', 'Moldura Fênix'], [19, '', 'Spica'], [20, '+120 Seeds', 'Moldura Dragão'],
    [21, '', 'Deneb'], [22, 'Cartão Constelação', 'Moldura Centauro'], [23, '', 'Polaris'], [24, '+130 Seeds', 'Moldura Águia'], [25, '', 'Achernar'],
    [26, '+140 Seeds', 'Moldura Leão'], [27, '', 'Fomalhaut'], [28, '+150 Seeds', 'Moldura Ursa Maior'], [29, '', 'Capella'], [30, 'Tema Observatório', 'Moldura Via Láctea'],
  );
  const raridade = (n, lado) => (n === 30 && lado === 'a' ? 'Lendário' : n > 20 ? 'Épico' : n > 10 ? 'Raro' : 'Comum');
  function irParaNivel(n) {
    const alvo = $(`.px-degrau[data-nivel="${n}"]`, tela);
    const trilhaEl = $('.px-trilha', tela);
    if (!alvo || !trilhaEl) return;
    trilhaEl.scrollTo({ left: alvo.offsetLeft - 120, behavior: polido() && !reduz() ? 'smooth' : 'auto' });
    if (polido() && !reduz()) $$('.px-premio', alvo).forEach((p, i) => anima(p, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { d: 620, atraso: 420 + i * 90, e: MOLA }));
  }
  redesenho.temporada = () => {
    const pct = Math.round((temporada.xp / 150) * 100);
    const doAssinante = TRILHA.filter((x) => x[2]).length;
    const doGratis = TRILHA.filter((x) => x[1]).length;
    const premio = (qual, n, r) => {
      if (!r) return '<span class="px-premio vazio">·</span>';
      const feito = n <= temporada.nivel;
      const pego = temporada.resgatados.has(qual + n);
      const tranca = qual === 'a' && !conta.premium;
      return `<button type="button" class="px-premio r-${raridade(n, qual).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')} ${feito ? 'feito' : ''} ${pego ? 'pego' : ''} ${tranca ? 'trancado' : ''}" data-px-premio="${qual}${n}" data-rotulo="${esc(r)}">${tranca ? ic('lock') : pego ? ic('check') : ic(/Seeds/.test(r) ? 'sprout' : 'star')}<b>${r}</b><small>${pego ? 'resgatado' : feito ? (tranca ? 'com a assinatura' : 'resgatar') : raridade(n, qual)}</small></button>`;
    };
    return `<section class="q-cartao px-temporada"><div class="px-ceu" aria-hidden="true"></div>
        <div class="px-temp-texto"><p class="q-rotulo">Temporada 1 · Observatório</p><h2>Nível ${temporada.nivel} de 30</h2>
          <p>De 1 de outubro a 25 de novembro · termina em 50 dias. O que você ganha não expira.</p>
          <span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="150" aria-valuenow="${temporada.xp}" aria-label="XP da temporada"><span style="width:${pct}%"></span></span>
          <p class="px-nota">${temporada.xp} / 150 XP · faltam ${150 - temporada.xp} XP · a seguir: +70 Seeds, no nível 4. Sobe com o XP de estudo ganho na temporada.</p></div>
        <div class="px-anel" style="--pct:${pct}"><b>${temporada.nivel}</b><span>nível</span></div></section>
      <button type="button" class="q-linha px-final" data-px-nivel="30"><span class="q-ic">${ic('star')}</span><span><small class="q-rotulo">No fim da trilha · nível 30</small><b>Tema Observatório</b><small>Para quem estuda até o fim. Com a assinatura, também a Moldura Via Láctea, a única Lendária da temporada.</small></span><span class="q-fim">Ver o fim ${ic('chevron-right')}</span></button>
      <section class="q-secao"><header><div><h2>Trilha de recompensas</h2><p>${doGratis} recompensas estudando · mais ${doAssinante} com a assinatura. Dá para ver todas, até a última.</p></div>
          <div class="q-abas q-seg px-faixas" role="group" aria-label="Ir para os níveis">${[['1–10', 1], ['11–20', 11], ['21–30', 21]].map(([t, n], i) => `<button type="button" class="q-aba" aria-checked="${i === 0}" data-px-nivel="${n}">${t}</button>`).join('')}</div></header>
        <div class="px-trilha"><div class="px-trilha-rotulos"><span>Grátis<small>estudando</small></span><span></span><span>Assinante<small>com a assinatura</small></span></div>
        ${TRILHA.map(([n, g, a]) => `<div class="px-degrau ${n <= temporada.nivel ? 'feito' : ''} ${n === temporada.nivel + 1 ? 'proximo' : ''} ${n === 30 ? 'ultimo' : ''}" data-nivel="${n}">${premio('g', n, g)}<span class="px-no">${n}</span>${premio('a', n, a)}</div>`).join('')}</div>
        ${conta.premium ? '' : `<div class="q-aviso"><span>${ic('lock')} A trilha de baixo tem ${doAssinante} recompensas e vem com a assinatura. O que é de uma temporada volta à Loja com Seeds um ano depois do fim.</span><button type="button" class="q-ctl" data-px="planos">Conhecer o Premium</button></div>`}
        <p class="px-nota">Não existe compra de nível: a temporada sobe só com o XP de estudo.</p></section>`;
  };
  /* A aba Temporada do Personalizar passa a usar a trilha inteira. */
  const personalizarAntigo = redesenho.personalizar;
  redesenho.personalizar = () => ((abaDe.personalizar || 0) === 2 ? `<div class="q-palco qp px-personalizar">${cabecaDoPersonalizar(2)}${redesenho.temporada()}</div>` : personalizarAntigo());

  ganchos.unshift((e, b) => {
    if (atual === 'biblioteca' && /^Abrir/.test(txt(b)) && b.closest('.q-bib-det')) return (sessao.aba = 0), ir('sessao'), true;
    if (atual === 'personalizar' && polido()) {
      if (b.dataset.pxNivel) {
        if (b.classList.contains('q-aba')) abaLocal(b);
        return irParaNivel(+b.dataset.pxNivel), true;
      }
      const p = b.dataset.pxPremio;
      if (p && !b.classList.contains('feito')) return toast(`${b.dataset.rotulo}: chega no nível ${p.slice(1)}${b.classList.contains('trancado') ? ', com a assinatura' : ''}.`), true;
    }
    if (atual !== 'sessao') return false;
    if (b.dataset.px === 'voltar-bib') return ir('biblioteca'), true;
    if (b.dataset.pxSessaoAba) {
      const i = +b.dataset.pxSessaoAba;
      const dir = i < sessao.aba ? -1 : 1;
      pararPlayer();
      sessao.aba = i;
      return repintar(htmlDaSessao(), dir, '.px-abas-sessao'), true;
    }
    if (b.dataset.pxVisao) return (sessao.visao = +b.dataset.pxVisao), repintar(htmlDaSessao(), 1, '.px-abas-sessao'), true;
    if (b.dataset.px === 'tocar') return sessao.toca ? pararPlayer() : tocar(0), true;
    if (b.dataset.px === 'antes' || b.dataset.px === 'depois') return tocar(Math.max(0, Math.min(5, (sessao.toca?.i ?? 0) + (b.dataset.px === 'antes' ? -1 : 1)))), true;
    if (b.dataset.pxOuvir) return tocar(+b.dataset.pxOuvir), true;
    if (b.dataset.pxOpcoes) return abrirFrase(+b.dataset.pxOpcoes), true;
    const linha = b.closest('.qs-fala, .ql-frase');
    if (linha) return abrirFrase(+linha.dataset.fala), true;
    if (b.dataset.px === 'jogar-memoria') return ir('jogo'), true;
    if (b.dataset.px === 'jogo-fechado') return toast('Neste protótipo, só a Memória abre.'), true;
    if (b.classList.contains('q-aba')) return false;
    return toast(`${txt(b) || b.getAttribute('aria-label')}: não clonado neste protótipo.`), true;
  });
