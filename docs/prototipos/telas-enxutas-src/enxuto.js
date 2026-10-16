  /* ==========================================================================
     TELAS ENXUTAS — Capturar e Jogar com menos coisas à vista.
     Mesmo escopo de prototipo.js e dos outros módulos; entra depois de planos4.js.

     Regra da casa (o dono já reprovou um protótipo "minimalista"): nada de peça nova.
     As mesmas peças (q-chip, q-ctl, q-abas, q-cartao, folha de baixo, dlg), os mesmos
     ícones e a mesma camada de movimento. O que muda é a ORGANIZAÇÃO:
       - junta o que é do mesmo assunto,
       - mostra primeiro o que se usa sempre,
       - guarda o resto a um toque, sem sumir com função nenhuma.
     A única peça acrescentada é o "link discreto" (.ex-lig): texto com ícone, sem caixa.

     Barra: Telas: Atual | Enxuta   ·   endereço: ?telas=atual|enxuta
     Outros endereços: ?ir=capturar|gravando|estado|jogar|organizar|porque
                       ?fonte=gravacoes|trilha   ?limpo (sem as barras do protótipo)
     ========================================================================== */
  const EX = {
    modo: QS.get('telas') === 'atual' ? 'atual' : 'enxuta',
    fonte: QS.get('fonte') === 'trilha' ? 'trilha' : 'gravacoes',
    barras: QS.has('barras') || QS.has('anuncios') || QS.has('ver') || QS.has('mapa'),
    sug: 0,
    pausado: false,
    pendente: false,
    letra: 1,
  };
  /* A versão enxuta mora no modo Polido (é nele que o Capturar abre direto na tela de uso). */
  const enxuta = () => EX.modo === 'enxuta' && polido();
  html.dataset.telas = EX.modo;
  if (QS.has('limpo')) html.dataset.exLimpo = '1';
  const EX_ICONES = {
    pause: svgl('<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>'),
  };
  const ice = (n) => EX_ICONES[n] || icp(n);
  const entraSuave = (els, atraso = 0) => {
    if (!polido() || reduz()) return;
    els.filter(Boolean).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 480, atraso: atraso + i * 60 }));
  };

  /* ==========================================================================
     CAPTURAR
     Hoje: [idioma] [modelo] [marca] ... [mic] [ajustes] [ajuda] / [3 níveis] / [iniciar] [flutuantes] [A−] [A+] [EN → PT]
     Enxuta: [idioma] [estado ▾] ... [mic] [ajustes] / [iniciar] [flutuantes]
     ========================================================================== */
  const gravandoAgora = () => {
    const v = $('.px-vivo', tela);
    return !!v && !v.classList.contains('px-pronto');
  };
  /* O chip de estado: uma frase curta que junta o chip do modelo, a marca e o seletor de nível. */
  function estadoDoChip() {
    const m = marcaDeOnde('capturar');
    let forte = m.forte;
    let resto = m.resto.replace(/^grátis · /, '');
    const med = m.nivel && m.nivel !== 'aparelho' && !comAmostra() ? medidor(m.nivel) : null;
    if (med && !m.caiu?.length) resto = `restam ${horas(med.resta)} neste mês`;
    if (gravandoAgora() && m.nivel) {
      const onde = m.nivel === 'aparelho' ? (ADS.disp === 'celular' ? 'pelo recurso do aparelho' : 'no aparelho') : `na nuvem (${NIVEIS[m.nivel].nome})`;
      forte = EX.pausado ? 'Pausado' : 'Legendando';
      resto = EX.pausado ? 'nada está sendo ouvido' : `${onde} · ${celular() ? 'EN → PT' : 'inglês → português'}`;
    }
    return { ...m, forte, resto };
  }
  function chipDeEstado() {
    const m = estadoDoChip();
    return `<button type="button" class="q-chip ex-estado" data-pl="como" data-tom="${m.tom}" aria-haspopup="dialog" aria-label="${esc(`${m.forte}, ${m.resto}. Abrir o nível, o modelo e as horas de nuvem`)}" title="${esc(m.razao)}">${icp(m.icone)}<span class="ex-estado-txt"><b>${m.forte}</b> · ${m.resto}</span>${icp('chevron-down')}</button>`;
  }
  const botaoDePausa = () => `<button type="button" class="q-ctl q-fica ex-pausar" data-ex="pausar" aria-pressed="${EX.pausado}" aria-label="${EX.pausado ? 'Retomar a captura' : 'Pausar a captura'}">${EX.pausado ? ice('play') : ice('pause')}<span class="ex-pausar-t">${EX.pausado ? 'Retomar' : 'Pausar'}</span></button>`;
  function enxugarCapturar() {
    const v = $('.px-vivo', tela);
    const topo = v && $('.px-vivo-topo', v);
    if (!topo) return;
    $('.ex-estado', topo)?.remove();
    $('.ex-pausar', v)?.remove();
    if (!enxuta()) {
      if (EX.pausado) retomar();
      v.classList.remove('ex-pausado');
      const h = $('.q-historico', v);
      if (h) h.style.zoom = '';
      return;
    }
    $('[data-px-vivo="capturar:Detectar"]', topo)?.insertAdjacentHTML('afterend', chipDeEstado());
    const gravando = gravandoAgora();
    if (gravando) $('[data-px="encerrar"]', v)?.insertAdjacentHTML('afterend', botaoDePausa());
    v.classList.toggle('ex-pausado', gravando && EX.pausado);
  }
  /* Toda repintura da fileira de níveis passa por aqui (plano, aparelho, horas, internet). */
  const pintarNivelAtual = pintarNivelNoVivo;
  pintarNivelNoVivo = function () {
    pintarNivelAtual();
    enxugarCapturar();
  };
  const prepararSemEnxugar = prepararVivo;
  prepararVivo = function () {
    EX.pausado = false;
    EX.pendente = false;
    prepararSemEnxugar();
    if (enxuta()) entraSuave([$('.ex-estado', tela)], 180);
  };

  /* ---- Gravando: pausar, retomar e o tamanho da letra -------------------------- */
  const comecarSemEnxugar = comecarVivo;
  comecarVivo = function () {
    EX.pausado = false;
    EX.pendente = false;
    comecarSemEnxugar();
    enxugarCapturar();
    if (enxuta()) entraSuave([$('.ex-pausar', tela), ...$$('.px-vivo .q-faixa [aria-label$="a letra"]', tela)], 80);
  };
  /* Pausado, a próxima fala espera: a que está no meio termina, como numa captura de verdade. */
  const proximaFalaSemPausa = proximaFala;
  proximaFala = function () {
    if (EX.pausado) return void (EX.pendente = true);
    return proximaFalaSemPausa();
  };
  function retomar() {
    EX.pausado = false;
    if (!vivo) return;
    clearInterval(vivo.r);
    vivo.r = setInterval(() => {
      const el = $('.q-tempo .tn', tela);
      if (el) el.textContent = relogio(++vivo.seg);
    }, 1000 * K());
    if (EX.pendente) vivo.t = setTimeout(proximaFala, 700 * K());
    EX.pendente = false;
  }
  function pausarOuRetomar() {
    if (!vivo) return;
    if (EX.pausado) {
      retomar();
      toast('Captura retomada.');
    } else {
      EX.pausado = true;
      clearInterval(vivo.r);
      toast('Captura pausada: nada está sendo ouvido. O que já foi legendado continua na tela.');
    }
    sentir('aba');
    enxugarCapturar();
    const b = $('.ex-pausar', tela);
    if (b && polido() && !reduz()) anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA });
  }
  function mudarLetra(mais) {
    EX.letra = Math.min(1.3, Math.max(0.85, +(EX.letra + (mais ? 0.15 : -0.15)).toFixed(2)));
    const h = $('.px-vivo .q-historico', tela);
    if (h) h.style.zoom = EX.letra;
    toast(`Tamanho da legenda: ${Math.round(EX.letra * 100)}%`, 1600);
  }

  /* ---- A ajuda passa para dentro de Ajustes (e da folha do estado) ----------------- */
  const abrirDialogoAtual = abrirDialogo;
  abrirDialogo = function (chave, gatilho) {
    abrirDialogoAtual(chave, gatilho);
    if (!enxuta() || chave !== 'capturar:Ajustes da captura') return;
    const d = app.lastElementChild;
    const fechar = d?.matches?.('dialog') && $('.dlg-cab .x', d);
    if (!fechar) return;
    /* o mesmo botão redondo do cabeçalho do diálogo, com o ícone de ajuda de sempre */
    fechar.insertAdjacentHTML('beforebegin', `<button type="button" class="x ex-ajuda-no-dlg" aria-label="Ajuda da captura" title="Ajuda da captura">${icp('circle-question-mark')}</button>`);
    $('.ex-ajuda-no-dlg', d).addEventListener('click', () => setTimeout(() => abrirDialogoAtual('capturar:Ajuda'), 340 * K()));
  };

  /* ---- A folha "Como isto funciona" ganha o que saiu da tela -------------------------
     Os três níveis já estavam nela. Entram: a nuvem do mês também no Grátis (para dizer
     que não há), o modelo local como uma linha (era um chip) e a ajuda da captura. */
  function enxugarComo(d) {
    const corpo = $('.pl-como', d);
    if (!corpo || $('.ex-neste', corpo)) return;
    const rot = $$('.folha-rotulo', corpo).find((p) => /três níveis/.test(p.textContent));
    if (rot) rot.textContent = 'Escolha o nível';
    const nivs = $('.pl-nivs', corpo);
    const m = marcaDeOnde('capturar');
    let depois = $('.pl-med', corpo) || nivs;
    if (!$('.pl-med', corpo)) {
      nivs.insertAdjacentHTML('afterend', `<p class="folha-rotulo">Nuvem deste mês</p><p class="pj-como-ajudas ex-sem-nuvem">${comAmostra() ? `Amostra de hoje: ${ADS.nuvemMin} min de Precisão, até a meia-noite.` : 'O Grátis não tem horas de nuvem: a legenda roda no aparelho, sem limite. O Essencial tem 5 h por mês; o Premium, 20 h.'}</p>`);
      depois = $('.ex-sem-nuvem', corpo);
    }
    const comModelo = m.nivel === 'aparelho' && ADS.disp !== 'celular';
    depois.insertAdjacentHTML(
      'afterend',
      `<p class="folha-rotulo ex-neste">Neste aparelho</p>
       <div class="q-lista ex-lista-da-folha">
         ${comModelo ? `<button type="button" class="q-linha" data-ex-f="modelo"><span class="q-ic" aria-hidden="true">${icp('cpu')}</span><span><b>Modelo local · 589 MB</b><small>Já baixado. Ver, trocar ou apagar o modelo.</small></span><span class="q-fim" aria-hidden="true">${icp('chevron-right')}</span></button>` : ''}
         <button type="button" class="q-linha" data-ex-f="ajuda"><span class="q-ic" aria-hidden="true">${icp('circle-question-mark')}</span><span><b>Ajuda da captura</b><small>Como o som chega ao app e o que fazer quando a legenda não aparece.</small></span><span class="q-fim" aria-hidden="true">${icp('chevron-right')}</span></button>
       </div>`,
    );
    /* a linha de cima substitui a nota de rodapé "Modelo baixado neste aparelho" */
    $$('.ad-confirma-nota', corpo)
      .filter((p) => $('[data-pl-f="modelo"]', p))
      .forEach((p) => p.remove());
  }
  const abrirComoAtual = abrirComo;
  abrirComo = function () {
    abrirComoAtual();
    const d = $('dialog.pl-como-folha');
    if (!d || d.dataset.ex || !enxuta() || atual !== 'aovivo') return;
    d.dataset.ex = '1';
    enxugarComo(d);
    entraSuave($$('.ex-neste, .ex-lista-da-folha > *, .ex-sem-nuvem', d), 260);
    /* a folha se repinta quando a pessoa troca de nível: o que entrou volta junto */
    new MutationObserver(() => enxugarComo(d)).observe($('.folha-corpo', d), { childList: true });
    d.addEventListener('click', (e) => {
      const f = e.target.closest('[data-ex-f]')?.dataset.exF;
      if (!f) return;
      fecharFolhaDeBaixo();
      setTimeout(() => abrirDialogoAtual(f === 'modelo' ? 'capturar:Modelo no dispositivo' : 'capturar:Ajuda'), 360 * K());
    });
  };

  /* ==========================================================================
     JOGAR
     Hoje: [fonte] [Partida rápida] / [3 abas] ... [Buscar e filtrar] [Favoritos e ordem] [Opções]
           / cartão: [Por que este?] [Outra sugestão] [Começar] / grade
     Enxuta: [fonte] / cartão da sugestão com UM botão cheio: links discretos + [Começar]
             / [3 abas] ... [Buscar e organizar] / grade
     ========================================================================== */
  const SUGESTOES = [
    ['Praticar 2784 palavras', 'Com Duelo relâmpago (contra o tempo) · rodada curta', 'blitz', null],
    ['Rever as palavras que estão vencendo', 'Com Memória: palavra e tradução · 8 pares', 'memory', 'Memória: palavra e tradução é o jogo mais calmo para rever o que você já viu.'],
    ['Montar frases inteiras', 'Com Frase embaralhada · 5 frases reais', 'scramble', 'Frase embaralhada treina a ordem das palavras, que os outros jogos não cobram.'],
  ];
  const NOME_DA_FONTE = { gravacoes: 'Inglês · Minhas gravações', trilha: 'Inglês · Trilha' };
  function enxugarJogar() {
    const palco = $('.quest-jogar', tela);
    if (!palco) return;
    const cab = $('.q-cab', palco);
    /* A fonte das palavras (nos dois modos). A captura de produção veio com a Trilha; a tela que o dono
       mostrou usa "Minhas gravações", sem a linha da Trilha. O protótipo deixa escolher na barra. */
    const fonte = $('[aria-label^="Trocar"]', cab);
    if (fonte && !$('.ex-fonte-txt', fonte)) {
      fonte.innerHTML = `${$('svg', fonte)?.outerHTML || ''}<span class="ex-fonte-txt">${NOME_DA_FONTE[EX.fonte]}</span>`;
      fonte.setAttribute('aria-label', `Trocar: ${NOME_DA_FONTE[EX.fonte]}`);
    }
    if (EX.fonte === 'gravacoes') {
      $('.qj-trilha', palco)?.remove();
      $$('.qj-porque span', palco).forEach((s) => (s.textContent = s.textContent.replace('Vem de Trilha.', 'Vem de Minhas gravações.')));
    }
    if (!enxuta()) return;
    palco.classList.add('ex-jogar');

    /* 1. Um botão cheio só: "Partida rápida" sai do cabeçalho e vira ação discreta do cartão. */
    $('.q-ctl.pri', cab)?.remove();

    /* 2. Três chips viram um: "Buscar e organizar". */
    const ferr = $('.qj-ferramentas', palco);
    $$(':scope > .q-chip', ferr).forEach((x) => x.remove());
    ferr.insertAdjacentHTML('beforeend', `<button type="button" class="q-chip ex-organizar" aria-haspopup="dialog" data-ex="organizar" aria-label="Buscar e organizar os jogos" title="Buscar e filtrar, favoritos e ordem, opções">${icp('search')}<span>Buscar e organizar</span></button>`);

    /* 3. O cartão da sugestão sobe para o topo, com "Começar" como único principal. */
    const sug = $('.qj-sugestao', palco);
    const linha = sug && $('.qj-sugestao-linha', sug);
    if (linha) {
      const [titulo, como, jogo, porque] = SUGESTOES[EX.sug];
      const razao = $$('.qj-porque li span', sug)[1];
      if (razao && porque) razao.textContent = porque;
      $('.qj-sugestao-texto b', sug).textContent = titulo;
      $('.qj-sugestao-texto small', sug).textContent = como;
      const aberto = !!$('.qj-porque', sug);
      $('.q-acoes', linha)?.remove();
      linha.insertAdjacentHTML(
        'beforeend',
        `<span class="ex-ligs">
           <button type="button" class="ex-lig" data-ex="porque" aria-expanded="${aberto}">${icp('circle-question-mark')}${aberto ? 'Esconder o porquê' : 'Por que este?'}</button>
           <button type="button" class="ex-lig" data-ex="outra">${icp('shuffle')}Outra sugestão</button>
           <button type="button" class="ex-lig" data-ex="sortear" title="Sorteia um jogo dentre os disponíveis e começa na hora (era a Partida rápida)">${icp('zap')}Sortear um jogo</button>
         </span>
         <button type="button" class="q-ctl pri" data-ex="comecar" data-sugestao="${jogo}">${icp('play')}Começar</button>`,
      );
      cab.after(sug);
      const trilha = $('.qj-trilha', palco);
      if (trilha) sug.after(trilha);
    }
    $$('.q-abas', palco).forEach((g) => porPilula(g));
    reposicionar();
  }
  const jogarSemEnxugar = aoMostrar.jogar;
  aoMostrar.jogar = () => {
    jogarSemEnxugar?.();
    enxugarJogar();
  };
  /* "Por que este?" e a Trilha trocam o miolo da tela inteira: a arrumação volta junto. */
  const alternarEstadoAtual = alternarEstado;
  alternarEstado = function (chave) {
    alternarEstadoAtual(chave);
    if (atual !== 'jogar') return;
    enxugarJogar();
    if (enxuta()) entraSuave($$('.qj-porque li', tela));
  };
  function outraSugestao() {
    EX.sug = (EX.sug + 1) % SUGESTOES.length;
    sentir('aba');
    if (estadoAberto === 'jogar:Por que este?') alternarEstado('jogar:Por que este?');
    else enxugarJogar();
    const texto = $('.qj-sugestao-texto', tela);
    if (texto && polido() && !reduz()) $$('b, small', texto).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420, atraso: i * 60 }));
  }
  function sortearJogo() {
    const ids = ORDEM_JOGOS.filter((id) => id === 'memory' || JOGOS[id]);
    const id = ids[Math.floor(Math.random() * ids.length)] || 'memory';
    abrirJogo(id);
  }

  /* ---- Uma folha só: Buscar e filtrar · Favoritos e ordem · Opções ------------------
     O miolo de cada seção é o dos três painéis de produção, sem tirar nem pôr. */
  const SECOES = [
    ['Buscar e filtrar', 'Buscar', 'search'],
    ['Favoritos e ordem', 'Favoritos e ordem', 'star'],
    ['Opções', 'Opções', 'settings-2'],
  ];
  function parteDoPainel(nome) {
    const t = document.createElement('template');
    t.innerHTML = D.sub['jogar:' + nome].html;
    const d = t.content.firstElementChild;
    return { corpo: $('.dlg-corpo', d)?.innerHTML || '', pe: $('.dlg-pe', d)?.innerHTML || '', nota: txt($('.qj-nota', d)) };
  }
  function abrirOrganizar(gatilho, qual = 0) {
    if ($('dialog[open]')) return;
    const partes = SECOES.map(([nome]) => parteDoPainel(nome));
    D.sub['jogar:Buscar e organizar'] = {
      html: `<dialog class="qj qj-painel largo ex-organizar-dlg m-auto" aria-labelledby="ex-org-t">
        <div class="dlg-cab"><span class="q-ic" aria-hidden="true">${icp('sliders-horizontal')}</span><div style="min-width:0;flex:1 1 0%"><h2 id="ex-org-t">Buscar e organizar</h2><p class="qj-nota"></p></div><button type="button" class="x" aria-label="Fechar">${icp('x')}</button></div>
        <div class="ex-org-abas"><div class="q-abas q-seg" role="tablist" aria-label="Seções">${SECOES.map(([nome, curto, icone], i) => `<button type="button" role="tab" class="q-aba" aria-selected="${i === qual}" data-ex-secao="${i}" aria-label="${nome}">${icp(icone)}<span>${curto}</span></button>`).join('')}</div></div>
        <div class="dlg-corpo qj-painel-corpo" role="tabpanel"></div>
        <div class="dlg-pe"></div></dialog>`,
    };
    const por = (d, i, animar) => {
      $('.qj-nota', d).textContent = partes[i].nota;
      $('.dlg-corpo', d).innerHTML = partes[i].corpo;
      $('.dlg-corpo', d).scrollTop = 0;
      $('.dlg-pe', d).innerHTML = partes[i].pe;
      $$('.dlg-corpo .q-abas', d).forEach((g) => porPilula(g));
      if (animar && polido() && !reduz()) $$('.dlg-corpo > *, .dlg-pe > *', d).forEach((x, n) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380, atraso: Math.min(n, 10) * 40 }));
    };
    /* o miolo entra antes de abrir, para a animação de entrada do diálogo pegar as linhas */
    const t = document.createElement('template');
    t.innerHTML = D.sub['jogar:Buscar e organizar'].html;
    por(t.content.firstElementChild, qual, false);
    D.sub['jogar:Buscar e organizar'].html = t.innerHTML;
    abrirDialogoAtual('jogar:Buscar e organizar', gatilho);
    const d = app.lastElementChild;
    d.addEventListener('click', (e) => {
      const aba = e.target.closest('[data-ex-secao]');
      if (aba) por(d, +aba.dataset.exSecao, true);
    });
    if (qual === 0 && !celular()) $('input[type="search"]', d)?.focus({ preventScroll: true });
  }

  /* ---- Cliques --------------------------------------------------------------------- */
  ganchos.unshift((e, b) => {
    const x = b.dataset.ex;
    if (x === 'organizar') return abrirOrganizar(b), true;
    if (x === 'porque') return alternarEstado('jogar:Por que este?'), true;
    if (x === 'outra') return outraSugestao(), true;
    if (x === 'sortear') return sortearJogo(), true;
    if (x === 'pausar') return pausarOuRetomar(), true;
    if (atual === 'aovivo' && enxuta() && /a letra$/.test(b.getAttribute('aria-label') || '')) return mudarLetra(/^Aumentar/.test(b.getAttribute('aria-label'))), true;
    return false;
  });

  /* ==========================================================================
     Barra do protótipo: Telas: Atual | Enxuta, a fonte do Jogar e o painel "O que mudou"
     ========================================================================== */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="px-barra ad-barra ex-barra" role="toolbar" aria-label="Telas enxutas">
      <button type="button" data-ex-b="mapa" class="ad-barra-mapa ex-barra-mapa" aria-pressed="false" title="A contagem de controles (atual × enxuta) e onde foi parar cada coisa">O que mudou</button>
      <span class="px-sep"></span>
      <span class="ad-barra-t">Telas</span>
      <div class="px-seg" title="Capturar e Jogar como estão hoje, ou na versão com menos coisas à vista"><i></i><button type="button" data-ex-telas="atual" aria-pressed="false">Atual</button><button type="button" data-ex-telas="enxuta" aria-pressed="false">Enxuta</button></div>
      <span class="ad-barra-t">Ver</span>
      <button type="button" data-ex-ir="capturar" title="Capturar, pronta para gravar">Capturar</button>
      <button type="button" data-ex-ir="gravando" title="Capturar, gravando">Gravando</button>
      <button type="button" data-ex-ir="estado" title="A folha do estado: nível, modelo e horas de nuvem">Folha do estado</button>
      <button type="button" data-ex-ir="jogar" title="O topo do Jogar">Jogar</button>
      <button type="button" data-ex-ir="organizar" title="Buscar e organizar (na versão atual: Buscar e filtrar)">Buscar e organizar</button>
      <span class="ad-barra-t">Fonte</span>
      <div class="px-seg" title="Com que palavras se joga. Com a Trilha, o Jogar ganha a linha da Trilha de vocabulário."><i></i><button type="button" data-ex-fonte="gravacoes" aria-pressed="false">Minhas gravações</button><button type="button" data-ex-fonte="trilha" aria-pressed="false">Trilha</button></div>
      <span class="px-sep"></span>
      <button type="button" data-ex-b="barras" aria-pressed="false" title="Mostra as barras de planos e de anúncios do protótipo de origem">Planos e anúncios</button>
    </div>
    <div class="ad-mapa-fundo ex-mapa-fundo"></div>
    <aside class="ad-mapa ex-mapa" aria-label="O que mudou nas telas enxutas" tabindex="-1"></aside>`,
  );
  const barraEx = $('.ex-barra');
  const mapaEx = $('.ex-mapa');
  function sincronizarBarraEx() {
    html.dataset.telas = EX.modo;
    document.body.classList.toggle('ex-barras', EX.barras);
    $$('[data-ex-telas]', barraEx).forEach((b) => b.setAttribute('aria-pressed', b.dataset.exTelas === EX.modo));
    $$('[data-ex-fonte]', barraEx).forEach((b) => b.setAttribute('aria-pressed', b.dataset.exFonte === EX.fonte));
    $('[data-ex-b="barras"]', barraEx).setAttribute('aria-pressed', EX.barras);
    $$('.px-seg [aria-pressed="true"]', barraEx).forEach((b) => b.offsetWidth && marcarSeg(b));
    if (EX.barras) {
      sincronizarBarraPl();
      sincronizarBarra();
    }
  }
  /* O estado vai junto para as molduras de Tablet e Celular da barra de baixo. */
  const estadoSemTelas = estadoDosPlanos;
  estadoDosPlanos = function () {
    return { ...estadoSemTelas(), telas: EX.modo, fonteDoJogar: EX.fonte };
  };
  const receberSemTelas = receberPlanos;
  receberPlanos = function (s) {
    receberSemTelas(s);
    if (['atual', 'enxuta'].includes(s.telas)) EX.modo = s.telas;
    if (['gravacoes', 'trilha'].includes(s.fonteDoJogar)) EX.fonte = s.fonteDoJogar;
    html.dataset.telas = EX.modo;
  };
  function aplicarTelas() {
    sincronizarBarraEx();
    atualizarMapaEx();
    aplicarPlano(); /* redesenha a tela aberta (ou só a fileira, se estiver gravando) e avisa as molduras */
    if (atual === 'aovivo') enxugarCapturar();
  }
  const IR = {
    capturar: () => irPara('capturar'),
    gravando: () => (irPara('capturar'), abrirFolhaDepois(() => $('[data-px="iniciar"]', tela)?.click(), 1400)),
    estado: () => (irPara('capturar'), abrirFolhaDepois(abrirComo)),
    jogar: () => irPara('jogar'),
    organizar: () => (irPara('jogar'), abrirFolhaDepois(() => (enxuta() ? abrirOrganizar($('.ex-organizar', tela)) : abrirDialogo('jogar:Buscar e filtrar', $$('.qj-ferramentas .q-chip', tela)[0])))),
    favoritos: () => (irPara('jogar'), abrirFolhaDepois(() => (enxuta() ? abrirOrganizar($('.ex-organizar', tela), 1) : abrirDialogo('jogar:Favoritos e ordem', $$('.qj-ferramentas .q-chip', tela)[1])))),
    porque: () => (irPara('jogar'), abrirFolhaDepois(() => estadoAberto !== 'jogar:Por que este?' && alternarEstado('jogar:Por que este?'))),
  };
  function irAte(qual) {
    if (!IR[qual]) return;
    abrirMapaEx(false);
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    if (folha) fecharFolha({ seco: true, semFoco: true });
    /* já na captura, "ir para Capturar" começaria a gravar (regra do microfone da barra): volta ao pronto antes */
    if (atual === 'aovivo') trocar('aovivo', {}, 'seco', 1);
    if (qual === 'capturar' && atual === 'aovivo') return;
    if (qual === 'gravando' && atual === 'aovivo') return void abrirFolhaDepois(() => $('[data-px="iniciar"]', tela)?.click(), 300);
    if (qual === 'estado' && atual === 'aovivo') return void abrirFolhaDepois(abrirComo, 300);
    if (atual === 'jogar' && ['jogar', 'organizar', 'favoritos', 'porque'].includes(qual)) {
      if (qual === 'jogar') return;
      return void { organizar: IR.organizar, favoritos: IR.favoritos, porque: IR.porque }[qual]();
    }
    IR[qual]();
  }
  barraEx.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.exB === 'mapa') return abrirMapaEx(!document.body.classList.contains('ex-mapa-aberto'));
    if (d.exB === 'barras') return (EX.barras = !EX.barras), sincronizarBarraEx(), void requestAnimationFrame(reposicionar);
    if (d.exIr) return irAte(d.exIr);
    if (d.exTelas) {
      EX.modo = d.exTelas;
      if (EX.modo === 'enxuta' && !polido()) toast('A versão enxuta vale no modo Polido (barra de baixo: Atual | Polido).', 4600);
      else toast(EX.modo === 'enxuta' ? 'Enxuta: as mesmas peças, com menos coisas à vista. Nada sumiu: veja "O que mudou".' : 'Atual: Capturar e Jogar como estão hoje.');
    } else if (d.exFonte) EX.fonte = d.exFonte;
    else return;
    aplicarTelas();
  });
  addEventListener('resize', () => requestAnimationFrame(sincronizarBarraEx));
  document.fonts?.ready.then(sincronizarBarraEx);

  /* ---- O painel "O que mudou": contagem e destino de cada controle --------------------- */
  /* Conta o que a pessoa pode tocar na tela aberta, antes de qualquer ação (a grade de jogos e o menu ficam de fora). */
  function contarControles() {
    const visiveis = $$('button, [role="tab"], [role="radio"], input, a[href]', tela).filter((b) => {
      if (b.closest('#grade-de-jogos, .q-historico, [data-ad], dialog')) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
    });
    const largura = tela.getBoundingClientRect();
    return {
      total: visiveis.length,
      cheios: visiveis.filter((b) => b.matches('.q-ctl.pri')).length,
      discretos: visiveis.filter((b) => b.matches('.ex-lig')).length,
      cortados: visiveis.filter((b) => b.getBoundingClientRect().right > largura.right + 1).length,
      nomes: visiveis.map((b) => b.getAttribute('aria-label') || txt(b)),
    };
  }
  window.__enxuto = { contar: contarControles, estado: () => ({ ...EX, atual, enxuta: enxuta() }) };
  const CONTAGEM = [
    /* [tela, atual, enxuta, observação] — conferidos com contarControles() nas duas larguras */
    ['Capturar · computador', '14', '6', 'de 2 fileiras em cima para 1; a barra de baixo passa de 5 para 2 botões'],
    ['Capturar · celular', '9', '5', 'de 3 fileiras em cima para 2; o estado cabe numa linha'],
    ['Capturar gravando · computador', '11', '9', 'saem modelo, ajuda e EN → PT; entra o Pausar, que hoje não existe'],
    ['Capturar gravando · celular', '7', '7', 'empata: sai a ajuda, entra o Pausar'],
    ['Jogar · computador', '11', '9', '11 botões com caixa viram 6, mais 3 links de texto; "Começar" passa a ser o único botão cheio'],
    ['Jogar · celular', '11', '9', 'hoje 5 dos 11 ficam fora da tela, de lado; na enxuta, nenhum. A grade começa na mesma altura'],
  ];
  const DESTINOS = {
    Capturar: [
      ['Detectar → Português', 'fica', 'No mesmo lugar, primeiro da fileira.'],
      ['Modelo local · 589 MB', '1 toque', 'Chip de estado › folha: linha "Modelo local · 589 MB" (abre o mesmo painel do modelo).'],
      ['Marca "No aparelho · seu áudio não sai daqui"', 'fica', 'Vira o texto do chip de estado, na mesma fileira do idioma.'],
      ['Seletor No aparelho | Precisão | Ao vivo', '1 toque', 'Chip de estado › folha: "Escolha o nível", com os cadeados e o plano de cada um.'],
      ['Medidor de horas de nuvem (planos pagos)', 'fica + 1 toque', 'O chip diz "restam 13 h 30 neste mês"; a barra completa está na folha.'],
      ['Microfone', 'fica', 'No mesmo lugar.'],
      ['Ajustes', 'fica', 'No mesmo lugar.'],
      ['Ajuda', '2 toques', 'Ajustes › botão de ajuda no cabeçalho do painel. Também: chip de estado › "Ajuda da captura".'],
      ['Iniciar captura', 'fica', 'No mesmo lugar, único botão cheio.'],
      ['Legendas flutuantes', 'fica', 'No mesmo lugar.'],
      ['A− e A+', 'aparece gravando', 'Só quando há legenda na tela. Antes de gravar não há texto para aumentar.'],
      ['EN → PT (Auto → PT)', 'sai da barra', 'Repetia o chip de idioma de cima, que abre o mesmo painel.'],
      ['Pausar (novo)', 'aparece gravando', 'Ao lado de Encerrar. Hoje a tela não tem pausa: é uma proposta.'],
    ],
    Jogar: [
      ['Inglês · Minhas gravações', 'fica', 'No cabeçalho. No celular sobe para a linha do título.'],
      ['Partida rápida', 'fica, discreto', 'Cartão da sugestão: "Sortear um jogo" (link com o mesmo raio).'],
      ['Todos · Clássicos · Favoritos', 'fica', 'Logo acima da grade, que é o que as abas filtram.'],
      ['Buscar e filtrar', '1 toque', '"Buscar e organizar" › abre nesta seção, com o campo de busca em foco.'],
      ['Favoritos e ordem', '2 toques', '"Buscar e organizar" › seção Favoritos e ordem.'],
      ['Opções', '2 toques', '"Buscar e organizar" › seção Opções.'],
      ['Por que este?', 'fica, discreto', 'Link de texto no cartão da sugestão.'],
      ['Outra sugestão', 'fica, discreto', 'Link de texto no cartão da sugestão.'],
      ['Começar', 'fica', 'Único botão cheio da tela. O cartão sobe para logo abaixo do título.'],
      ['Trilha de vocabulário (com a fonte Trilha)', 'fica', 'A mesma linha, entre a sugestão e as abas.'],
    ],
  };
  function htmlDoMapaEx() {
    const c = atual === 'aovivo' || atual === 'jogar' ? contarControles() : null;
    const lista = (nome) =>
      `<div class="ad-mapa-espacos">${DESTINOS[nome].map(([o, quando, onde]) => `<section class="ad-mapa-item ativo ex-destino"><header><h4>${o}</h4><span class="ex-quando" data-q="${/2 toques/.test(quando) ? 'longe' : /1 toque|sai|aparece/.test(quando) ? 'meio' : 'fica'}">${quando}</span></header><p>${onde}</p></section>`).join('')}</div>`;
    return `<button type="button" class="px-fechar ad-mapa-fechar" aria-label="Fechar">Fechar</button>
      <p class="ad-mapa-sobre">Protótipo · Capturar e Jogar com menos coisas à vista</p>
      <h2>O que mudou</h2>
      <p>O desenho é o mesmo: as mesmas peças, raios, fontes, ícones e a mesma camada de movimento. Muda a arrumação: o que é do mesmo assunto fica junto, o que se usa sempre fica à vista e o resto fica a um toque. Nenhuma função saiu.</p>
      <div class="ad-mapa-estado">
        <div><span>Telas</span><b>${EX.modo === 'enxuta' ? 'Enxuta' : 'Atual'}${EX.modo === 'enxuta' && !polido() ? ' (precisa do modo Polido)' : ''}</b></div>
        <div><span>Tela aberta</span><b>${{ aovivo: gravandoAgora() ? 'Capturar, gravando' : 'Capturar', jogar: 'Jogar' }[atual] || 'outra'}</b></div>
        <div><span>Controles à vista agora</span><b>${c ? `${c.total}${c.discretos ? ` (${c.discretos} são links de texto)` : ''}${c.cortados ? ` · ${c.cortados} fora da tela, de lado` : ''}` : 'abra Capturar ou Jogar'}</b></div>
      </div>
      <p class="ad-mapa-nota">A contagem é de tudo o que dá para tocar antes de fazer qualquer coisa, sem o menu lateral e sem os cartões dos jogos. O relógio 00:00 não conta: não é botão.</p>
      <h3>Contagem: atual × enxuta</h3>
      <div class="pl-mapa-tabela"><table><tr><th>Tela</th><th>Atual</th><th>Enxuta</th><th>O que pesa</th></tr>${CONTAGEM.map(([t, a, x, o]) => `<tr><th>${t}</th><td>${a}</td><td><b>${x}</b></td><td class="ex-obs">${o}</td></tr>`).join('')}</table></div>
      <p class="ad-mapa-nota">Medido no plano Grátis, computador com placa de vídeo, fonte "Minhas gravações". Com a fonte Trilha, o Jogar tem um controle a mais nas duas versões.</p>
      <h3>Ver lado a lado</h3>
      <p>Troque em <b>Telas: Atual | Enxuta</b> na barra. Os atalhos abaixo levam ao mesmo ponto nas duas versões.</p>
      <p class="ex-atalhos">${[['capturar', 'Capturar pronta'], ['gravando', 'Capturar gravando'], ['estado', 'Folha do estado'], ['jogar', 'Topo do Jogar'], ['organizar', 'Buscar e organizar'], ['favoritos', 'Favoritos e ordem'], ['porque', 'Por que este?']].map(([k, n]) => `<button type="button" data-ex-ir="${k}">${n}</button>`).join('')}</p>
      <h3>Capturar: onde foi parar cada coisa</h3>
      ${lista('Capturar')}
      <h3>Jogar: onde foi parar cada coisa</h3>
      ${lista('Jogar')}
      <h3>O que ficou mais longe (para decidir)</h3>
      <ul class="ad-mapa-lista">
        <li><b>Trocar de nível na captura:</b> era 1 toque no seletor, agora são 2 (chip de estado, depois o nível). No Grátis dois dos três níveis têm cadeado, então quase ninguém troca; num plano pago a troca fica mais longe. <i>A decidir.</i></li>
        <li><b>Favoritar um jogo:</b> era 2 toques (Favoritos e ordem, estrela), agora são 3. Um caminho mais curto seria a estrela no próprio cartão do jogo. <i>A decidir.</i></li>
        <li><b>Ajuda da captura:</b> era 1 toque, agora são 2. <i>A decidir.</i></li>
        <li><b>A− e A+ antes de gravar:</b> quem quer acertar o tamanho antes de começar só consegue depois do primeiro texto. <i>A decidir.</i></li>
        <li><b>Pausar:</b> é função nova. Se a captura de verdade não pausa, o botão sai e a tela gravando fica com 8 controles no computador. <i>A confirmar.</i></li>
        <li><b>Jogar no celular:</b> a grade não sobe (começa na mesma altura de hoje). Para subir uns 40 px, "Por que este?" e "Outra sugestão" teriam de virar só ícone no celular. <i>A decidir.</i></li>
        <li><b>Jogar no computador, janela de 1280:</b> o texto pequeno da sugestão quebra em duas linhas e a grade desce 15 px. Em janela mais larga não quebra.</li>
      </ul>
      <h3>Endereços</h3>
      <ul class="ad-mapa-lista">
        <li><code>?telas=atual</code> ou <code>?telas=enxuta</code></li>
        <li><code>?ir=capturar</code>, <code>gravando</code>, <code>estado</code>, <code>jogar</code>, <code>organizar</code>, <code>favoritos</code>, <code>porque</code></li>
        <li><code>?fonte=trilha</code> · <code>?plano=premium</code> · <code>?aparelho=celular</code> · <code>?limpo</code> (sem as barras)</li>
      </ul>`;
  }
  function atualizarMapaEx() {
    if (!document.body.classList.contains('ex-mapa-aberto')) return;
    const rol = mapaEx.scrollTop;
    mapaEx.innerHTML = htmlDoMapaEx();
    mapaEx.scrollTop = rol;
  }
  function abrirMapaEx(abre) {
    if (abre) {
      abrirMapa(false);
      abrirMapaPl(false);
    }
    document.body.classList.toggle('ex-mapa-aberto', abre);
    $('[data-ex-b="mapa"]', barraEx).setAttribute('aria-pressed', abre);
    if (!abre) return;
    mapaEx.innerHTML = htmlDoMapaEx();
    mapaEx.scrollTop = 0;
    mapaEx.focus({ preventScroll: true });
  }
  $('.ex-mapa-fundo').addEventListener('click', () => abrirMapaEx(false));
  mapaEx.addEventListener('click', (e) => {
    if (e.target.closest('.ad-mapa-fechar')) return abrirMapaEx(false);
    const v = e.target.closest('[data-ex-ir]');
    if (v) irAte(v.dataset.exIr);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.contains('ex-mapa-aberto') && abrirMapaEx(false));
  $('[data-ad-b="mapa"]', barraAds).addEventListener('click', () => abrirMapaEx(false));
  $('[data-pl-b="mapa"]', barraPl).addEventListener('click', () => abrirMapaEx(false));

  /* ---- Partida --------------------------------------------------------------------- */
  sincronizarBarraEx();
  if (QS.get('mapa') === 'telas') setTimeout(() => abrirMapaEx(true), 900);
  if (!EMBUTIDO && !QS.get('ver') && !QS.get('jogo') && QS.get('ir') !== 'inicio') {
    /* este protótipo é sobre duas telas: abre na primeira delas */
    const alvo = IR[QS.get('ir')] ? QS.get('ir') : 'capturar';
    setTimeout(() => IR[alvo](), 700);
  }
