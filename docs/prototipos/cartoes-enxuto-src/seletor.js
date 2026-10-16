  /* ==========================================================================
     SELETOR DE CONTEÚDO — o acesso à fonte, IGUAL em todas as telas.
     Mesmo escopo dos outros módulos; entra por último (depois de fontes.js).

     Decidido pelo dono: a FICHA NO CABEÇALHO. Uma ficha (ícone + nome + seta), sempre no mesmo
     lugar do cabeçalho de Jogar, Cartões e Biblioteca. Um toque abre o catálogo.

     A escolha é UMA para o app inteiro (FX.fonte + FX.lang, em fontes.js): escolheu "Reunião de
     produto" nos Cartões, o Jogar já abre com ela. O padrão é "Tudo". O catálogo que abre é sempre
     o mesmo ("Escolher o conteúdo"), e "Trazer uma fonte" mora dentro dele.

     O idioma é o primeiro nível do catálogo: o jogo usa um idioma por vez, então "Tudo" quer dizer
     "tudo em inglês"; os baralhos "Inglês" e "Espanhol" deixam de ser linhas e viram a chave do alto.

     Opção desligada de fábrica (barra do protótipo "Pergunta na entrada: não | sim", ?pergunta=sim):
     ao entrar em Jogar ou Cartões, uma vez por dia, um aviso pequeno pergunta "Com o que hoje?".
     ========================================================================== */
  Object.assign(SIMPLES, { 'chevron-down': svg('<path d="m6 9 6 6 6-6"/>') });

  /* ---- Leituras -------------------------------------------------------------------- */
  const fsLinguas = () => (fsDois() ? ['en', 'es'].filter((k) => fsTodas().some((b) => b.lang === k)) : []);
  /* O baralho dos Cartões que corresponde à escolha ("Tudo" em inglês é o baralho "Inglês"). */
  function fsDeck(id = FX.fonte) {
    if (id === 'tudo' || id === 'recorte') return fsDois() ? FX.lang : 'tudo';
    return id;
  }
  const fsBaralho = (id = FX.fonte) => CT_BARALHOS.find((b) => b.id === fsDeck(id)) || (fsDeck(id) === FX_PEQUENA.id ? FX_PEQUENA : ctBaralho('tudo'));
  const fsHojeN = () => ctN(fsBaralho()) || [0, 0, 0];
  const fsNome = (f = fxFonte()) => (f.id === 'tudo' ? 'Tudo' : fxNomeCurto(f).replace(/^(Lista|PDF|YouTube): /, ''));
  const fsLingua = (f = fxFonte()) => (fsLinguas().length > 1 && !f.lang ? FX_LING[FX.lang] : '');
  const fsNomeNaLista = (f) => (f.id === 'tudo' && fsLinguas().length > 1 ? `Tudo em ${FX_LING[FX.lang].toLowerCase()}` : f.nome);
  const fsDeOnde = (f) =>
    f.id === 'tudo' ? (fsDois() ? ctBaralho(FX.lang).sub : 'Todas as origens') : f.id === 'dificeis' ? 'As que você mais erra, de todo o conteúdo' : fxSoTrilha() && f.g === 'trilha' ? '704 palavras do A1, prontas para começar' : f.sub.replace(/ · (Inglês|Espanhol)$/, '');
  /* A carta pertence ao conteúdo escolhido? (a lista de Palavras e a fila de hoje respeitam a escolha) */
  const fsNaFonte = (c) => {
    const d = fsDeck();
    if (d === 'dificeis') return ctDificil(c) && (!fsDois() || c.lang === FX.lang);
    return ctNoBaralho(c, d);
  };
  function fsEstudar(n) {
    const d = fsDeck();
    if (CT_FILA.some((c) => ctNoBaralho(ctCarta(c), d))) return ctEstudar({ baralho: d, n: n || 0 });
    const h = fsHojeN();
    const q = h[0] + h[1] + h[2];
    if (!q) return toast('Nada vence aqui hoje.');
    return ctEstudar({ baralho: 'tudo', n: Math.min(n || q, q), rotulo: `Hoje · ${fsNome()}` });
  }

  /* ---- A escolha: uma só, para o app inteiro ------------------------------------------ */
  function fxEscolher(id, o = {}) {
    if (id === 'en' || id === 'es') (FX.lang = id), (id = 'tudo'); /* os baralhos de idioma são "Tudo" naquele idioma */
    const alvo = id === 'recorte' ? FX.recorte : fsTodas().find((b) => b.id === id);
    if (!alvo) return;
    if (alvo.lang) FX.lang = alvo.lang;
    if (id !== FX.fonte) {
      if (FX.fonte !== 'recorte') FX.recentes = [FX.fonte, ...FX.recentes.filter((x) => x !== FX.fonte && x !== id)].slice(0, 4);
      FX.antes = FX.fonte;
      FX.fonte = id;
    }
    if (id !== 'recorte') FX.recorte = null;
    if (id !== 'tudo' && id !== 'recorte') FS.ultima = id;
    FX.sug = 0;
    FX.sel = id;
    if (o.calado) return;
    const daFicha = !!$('dialog.fx-catalogo') || document.activeElement?.closest?.('[data-fs-ficha]');
    $$('dialog.fx-catalogo').forEach((d) => fecharDialogo(d));
    sentir('aba');
    fsAplicar('fonte');
    /* a ficha foi refeita: o foco volta para ela (quem usa o teclado não se perde) */
    if (daFicha) fsFocarFicha();
  }
  function fsMudarIdioma(k) {
    if (k === FX.lang || !FX_LING[k]) return;
    FX.lang = k;
    /* a fonte de um idioma não existe no outro: volta para "Tudo" (deste idioma) */
    const f = fsTodas().find((b) => b.id === FX.fonte);
    if (f?.lang && f.lang !== k) (FX.antes = FX.fonte), (FX.fonte = 'tudo');
    FX.sel = FX.fonte === 'recorte' ? 'tudo' : FX.fonte;
    FX.sug = 0;
    sentir('aba');
    fsAplicar('fonte');
  }
  /* Mudou o conteúdo: a tela em que a pessoa está se refaz no lugar, e a ficha dá o sinal. */
  function fsAplicar(como = 'fonte') {
    fsFecharPergunta();
    if (atual === 'jogar') fxRepintarJogar(como);
    else if (atual === 'cartoes') ctRepintar(como === 'seco' ? '' : '.ct-painel > *');
    else if (atual === 'biblioteca') (bib.sel = 0), (bib.pag = 0), redesenharBib('lista');
    else if (atual === 'inicio') mostrarSemAds('inicio', { origem: 'seco' });
    if (como !== 'seco') fsSinal(true);
  }
  const fsFocarFicha = () => setTimeout(() => !$('dialog[open]') && $('[data-fs="abrir"]', tela)?.focus({ preventScroll: true }), 0);
  /* O retorno curto: a ficha "respira" uma vez (e o nome entra de novo quando mudou). Sem aviso. */
  function fsSinal(mudou) {
    if (!polido() || reduz()) return;
    for (const x of $$('[data-fs-ficha]', tela)) {
      anima(x, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { d: 560, e: MOLA });
      x.classList.remove('fs-brilho');
      void x.offsetWidth;
      x.classList.add('fs-brilho');
      if (mudou) $$('.fs-nome', x).forEach((t) => anima(t, [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 380, atraso: 60 }));
    }
  }

  /* ---- A ficha ----------------------------------------------------------------------------
     Com "Tudo": [ícone] Tudo [idioma] [seta]. Com outro conteúdo ela fica acesa e ganha o "x",
     que volta para "Tudo" em um toque. */
  const fsRotulo = (f = fxFonte()) => `Conteúdo: ${fsNome(f)}${fsLingua(f) ? ` em ${fsLingua(f).toLowerCase()}` : ''}`;
  const fsTemVolta = (f = fxFonte()) => f.id !== 'tudo' && !fxSoTrilha();
  function fsFicha() {
    const f = fxFonte();
    const lingua = fsLingua(f);
    return `<span class="fs-ficha ${fsTemVolta(f) ? 'fs-com-volta' : ''}" data-fs-ficha>
      <button type="button" class="q-chip fs-abrir" data-fs="abrir" aria-haspopup="dialog" aria-label="${esc(fsRotulo(f))}. Trocar" title="${esc(fsRotulo(f))}. Toque para trocar">${ica(f.i)}<span class="fs-nome"><b>${esc(fsNome(f))}</b>${lingua ? `<small>${lingua}</small>` : ''}</span>${ica('chevron-down')}</button>${fsTemVolta(f) ? `<button type="button" class="q-chip fs-volta" data-fs="tudo" aria-label="Voltar para Tudo" title="Voltar para Tudo">${ica('x')}</button>` : ''}</span>`;
  }

  /* ---- Opção: a pergunta na entrada (desligada de fábrica) ---------------------------------
     Uma vez por dia, ao entrar em Jogar ou Cartões. Não bloqueia: não tem fundo, não prende o
     foco, some sozinha. Não tocar vale "Tudo". No celular sobe do pé, para não cobrir o botão
     principal do alto. */
  function fsFecharPergunta(o = {}) {
    clearTimeout(FS.relogio);
    const p = $('.fs-pergunta');
    if (!p) return;
    if (!polido() || reduz() || o.seco) return p.remove();
    anima(p, [{ opacity: 0, transform: 'translateY(-8px) scale(0.97)', filter: 'blur(4px)' }], { d: 220, fill: 'forwards' }).finished.then(() => p.remove(), () => p.remove());
  }
  function fsPerguntar() {
    if (!FS.pergunta || FS.perguntou || FS.naoPerguntar || fxSoTrilha() || !['jogar', 'cartoes'].includes(atual) || $('dialog[open]')) return;
    const ancora = $('.fs-ficha', tela);
    if (!ancora || !ancora.offsetWidth) return;
    FS.perguntou = true;
    const existe = (id) => fsTodas().some((b) => b.id === id);
    const ops = [
      ['tudo', 'Tudo', 'vale se você não tocar'],
      existe(FS.ultima) && [FS.ultima, fxNomeCurto(fsTodas().find((b) => b.id === FS.ultima)), 'a última que você usou'],
      existe(FS.nova) && FS.nova !== FS.ultima && [FS.nova, fxNomeCurto(fsTodas().find((b) => b.id === FS.nova)), 'chegou hoje'],
      existe('dificeis') && ['dificeis', 'Difíceis', 'as que você mais erra'],
    ].filter(Boolean);
    const icone = (id) => (id === 'tudo' ? 'layers' : fsTodas().find((b) => b.id === id).i);
    $('.fs-pergunta')?.remove();
    main.insertAdjacentHTML(
      'beforeend',
      `<div class="q-cartao fs-pergunta" role="group" aria-label="Com o que hoje?">
        <div class="fs-pergunta-cab"><b>Com o que hoje?</b><button type="button" class="q-ctl ct-so-icone fs-pergunta-x" data-fs="pergunta-fechar" aria-label="Fechar: fica em ${esc(fsNome())}">${ica('x')}</button></div>
        <div class="fs-pergunta-ops">${ops.map(([id, nome, nota]) => `<button type="button" class="q-chip fs-op" data-fs-rapida="${id}" aria-pressed="${id === FX.fonte}">${ica(icone(id))}<span><b>${esc(nome)}</b><small>${nota}</small></span></button>`).join('')}</div>
        <div class="fs-pergunta-pe"><button type="button" class="ex-lig" data-fs="abrir">${ica('search')}Ver tudo</button><button type="button" class="ex-lig" data-fs="nao-perguntar">Não perguntar mais</button></div>
        <i class="fs-pergunta-tempo" aria-hidden="true"></i></div>`,
    );
    const p = $('.fs-pergunta');
    const rm = main.getBoundingClientRect();
    const ra = ancora.getBoundingClientRect();
    if (celular()) Object.assign(p.style, { left: '12px', right: '12px' });
    else Object.assign(p.style, { left: Math.max(16, ra.left - rm.left - 8) + 'px', top: ra.bottom - rm.top + 10 + 'px' });
    p.style.setProperty('--fs-seta', Math.max(22, ra.left - rm.left - p.offsetLeft + ra.width / 2) + 'px');
    const dura = 9000 * K();
    p.style.setProperty('--fs-dura', dura + 'ms');
    const armar = () => (FS.relogio = setTimeout(() => fsFecharPergunta(), dura));
    armar();
    /* quem aponta ou foca está lendo: o relógio recomeça quando sai */
    p.addEventListener('pointerenter', () => (clearTimeout(FS.relogio), p.setAttribute('data-parada', '')));
    p.addEventListener('pointerleave', () => (p.removeAttribute('data-parada'), armar()));
    p.addEventListener('focusin', () => (clearTimeout(FS.relogio), p.setAttribute('data-parada', '')));
    if (polido() && !reduz()) {
      anima(p, [{ opacity: 0, transform: `translateY(${celular() ? 24 : -10}px) scale(0.94)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { d: 480, e: MOLA_SUAVE });
      $$('.fs-op', p).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 360, atraso: 120 + i * 50 }));
    }
  }
  function fsLigarPergunta(liga) {
    FS.pergunta = liga;
    FS.perguntou = FS.naoPerguntar = false;
    fsFecharPergunta({ seco: true });
    sincronizarBarraFx();
    toast(liga ? 'Pergunta na entrada ligada: aparece ao entrar em Jogar ou Cartões, uma vez por dia. Não tocar vale “Tudo”.' : 'Pergunta na entrada desligada. A ficha do cabeçalho continua igual.', 4600);
    if (liga) setTimeout(fsPerguntar, 500 * K());
  }

  /* ---- A cada troca de tela: o sinal e (se ligada) a pergunta ----------------------------- */
  const fsDepois = (f) =>
    function (...a) {
      const antes = atual;
      const r = f.apply(this, a);
      if (atual !== antes) {
        fsFecharPergunta({ seco: true });
        /* chegou numa tela com um conteúdo que não é "Tudo": a ficha dá o sinal, uma vez */
        if (FX.fonte !== 'tudo' && !fxSoTrilha()) setTimeout(() => fsSinal(false), 420 * K());
        setTimeout(fsPerguntar, 650 * K());
      }
      return r;
    };
  trocar = fsDepois(trocar);

  /* ==========================================================================
     O CATÁLOGO ("Escolher o conteúdo"): a MESMA folha em toda tela.
     Idioma no alto (quando há mais de um). Depois: Tudo, Difíceis · Das minhas sessões · Do Anki ·
     Trilha do app. Cada linha: o nome inteiro (duas linhas se preciso), a contagem por extenso e
     de onde veio. UMA ação por linha: Usar. No celular a linha inteira usa; no computador a linha
     mostra o painel ao lado (Revisar, Praticar, Jogar, Ver palavras) e o botão da ponta usa.
     ========================================================================== */
  function fxLinhaDaFonte(f) {
    const s = FX.paraJogo ? fxServe(FX.paraJogo, f) : null;
    const emUso = f.id === FX.fonte;
    const fim =
      s && !s.ok
        ? `<span class="ct-em-dia fx-nao">${ica('lock')}<span>não serve</span></span>`
        : emUso
          ? `<span class="ct-em-dia fx-em-uso">${ica('check')}<span>em uso</span></span>`
          : `<button type="button" class="q-ctl ct-revisar fx-usar" data-fx-usar="${f.id}" aria-label="Usar ${esc(fsNomeNaLista(f))}: ${fxContagem(f)}"><span>Usar</span>${ica('chevron-right')}</button>`;
    return `<div class="ct-linha-caixa fx-linha-caixa ${s && !s.ok ? 'fx-nao-serve' : ''} ${emUso ? 'fx-linha-em-uso' : ''}"><button type="button" class="q-linha ct-linha-b fx-linha" data-fx-fonte="${f.id}" aria-pressed="${FX.sel === f.id}" ${emUso ? 'data-em-uso="1"' : ''}><span class="q-ic">${ica(f.i)}</span><span class="fx-linha-texto"><b>${esc(fsNomeNaLista(f))}</b><small class="fx-linha-conta">${s && !s.ok ? esc(s.motivo) : fxContagem(f)}</small><small class="fx-linha-de">${esc(fsDeOnde(f))}</small></span></button>${fim}</div>`;
  }
  function fxListaDoCatalogo() {
    const q = FX.busca.trim().toLowerCase();
    const todas = fxFontes().filter((f) => !q || f.nome.toLowerCase().includes(q) || f.tipo.toLowerCase().includes(q));
    const de = (g) => todas.filter((f) => (g === 'topo' ? f.id === 'tudo' || f.id === 'dificeis' : f.g === g && f.id !== 'dificeis'));
    if (q && !todas.length) return `<div class="q-vazio fx-vazio"><h2>Nada com “${esc(FX.busca)}”</h2><p>Procure pelo nome da sessão ou do baralho.</p><button type="button" class="q-ctl" data-fx="limpar-busca">Limpar a busca</button></div>`;
    const vazio = {
      sessao: `<p class="fx-grupo-vazio">Nenhuma sessão ainda. Uma captura, um vídeo ou um texto viram conteúdo.<span><button type="button" class="ex-lig" data-fx="capturar">${ica('mic')}Capturar</button><button type="button" class="ex-lig" data-fx="trazer">${ica('plus')}Trazer</button></span></p>`,
      anki: `<p class="fx-grupo-vazio">Nenhum baralho do Anki.<span><button type="button" class="ex-lig" data-fx="trazer-anki">${ica('wallet-cards')}Trazer um arquivo do Anki</button></span></p>`,
    };
    const grupo = ([g, h]) => {
      const l = de(g);
      if (!l.length && (q || !fxSoTrilha() || !vazio[g])) return '';
      return `<section class="q-secao ct-grupo"><header><div><h3>${h}${l.length > 8 ? ` <span class="fx-grupo-n">${num(l.length)}</span>` : ''}</h3></div>${g === 'trilha' ? ctDica('Palavras prontas do app, por nível. Servem para quem ainda não tem as suas e para completar o que falta.') : ''}</header>${l.length ? `<div class="q-lista">${l.map(fxLinhaDaFonte).join('')}</div>` : vazio[g]}</section>`;
    };
    return `${de('topo').length ? `<div class="q-lista">${de('topo').map(fxLinhaDaFonte).join('')}</div>` : ''}${FX_GRUPOS.map(grupo).join('')}`;
  }
  function fxDetalheDaFonte(f) {
    const m = fxMat(f);
    const serve = fxQuantosServem(f);
    const fora = ORDEM_JOGOS.filter((id) => !fxServe(id, f).ok);
    const hoje = fxParaHoje(f);
    const deck = CT_BARALHOS.find((b) => b.id === fsDeck(f.id));
    const cob = CT.hoje === 'primeiro' ? null : CT_COBERTURA[fsDeck(f.id)];
    const emUso = f.id === FX.fonte;
    const nomeDoJogo = (id) => JOGOS[id]?.curto || 'Memória';
    return `<div class="q-bib-topo"><span class="q-ic">${ica(f.i)}</span><div>
        <p class="q-bib-tags"><span class="q-tag">${f.tipo}</span>${fsDois() ? `<span class="q-tag off">${FX_LING[f.lang || FX.lang]}</span>` : ''}${emUso ? '<span class="q-tag ct-rv">Em uso</span>' : ''}</p>
        <h2>${esc(fsNomeNaLista(f))}</h2></div>
        ${deck ? `<button type="button" class="q-ctl ct-so-icone" data-fs-menu="${deck.id}" aria-label="Mais ações deste conteúdo" title="${deck.g === 'sessao' ? 'Abrir a sessão, gerenciar' : 'Gerenciar'}, exportar, compartilhar por link">${ica('ellipsis')}</button>` : ''}</div>
      <dl class="q-bib-fatos ct-fatos3">${[['Palavras', num(m.pal)], ['Frases', num(m.fra)], ['Para hoje', deck?.n ? num(hoje) : '—']].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${fora.length ? `<ul class="fx-fora"><li class="fx-fora-t">${ica('gamepad-2')}<span><b>${serve} de 18 jogos</b> abrem com ele.</span></li>${fora.slice(0, 2).map((id) => `<li>${ica('lock')}<span><b>${nomeDoJogo(id)}</b> ${esc(fxServe(id, f).motivo.replace(/^Precisa/, 'precisa'))}</span></li>`).join('')}${fora.length > 2 ? `<li class="mais">${ica('lock')}<span>e mais ${fora.length - 2} ${fora.length - 2 === 1 ? 'jogo' : 'jogos'} pelo mesmo motivo</span></li>` : ''}</ul>` : `<p class="fx-todos">${ica('check')}<span>Os 18 jogos abrem com ele.</span></p>`}
      <div class="q-bib-acoes" role="toolbar" aria-label="O que fazer com este conteúdo">
        <button type="button" class="q-ctl pri" data-fx-usar="${f.id}">${ica('check')} ${emUso ? 'Continuar com este' : 'Usar este conteúdo'}</button>
        <div class="q-acoes fs-acoes"><button type="button" class="q-ctl" data-fx-revisar="${f.id}" ${hoje ? '' : 'disabled'} title="${hoje ? 'Abre a revisão por cartões' : 'Nada vence aqui hoje'}">${ica('target')} Revisar${hoje ? ` · ${num(hoje)}` : ''}</button><button type="button" class="q-ctl" data-fs-praticar="${f.id}">${ica('sparkles')} Praticar</button><button type="button" class="q-ctl" data-fx-jogar="${f.id}" ${serve ? '' : 'disabled'}>${ica('gamepad-2')} Jogar</button><button type="button" class="q-ctl" data-fx-ver="${f.id}">${ica('book-open')} Ver palavras</button></div>
      </div>
      ${cob ? `<p class="fs-cobertura" data-ct-alvo="cobertura">${ica('clapperboard')}<span>Cobre <b>${cob[0]}%</b> do seu último vídeo. Faltam ${cob[1]} palavras.</span><button type="button" class="ex-lig" data-fs-faltam="${fsDeck(f.id)}">Ver as que faltam</button></p>` : ''}`;
  }
  function fsCorpoDoCatalogo() {
    const ls = fsLinguas();
    return `<div class="fx-cat-col">
        ${ls.length > 1 ? `<div class="fs-idiomas"><span class="q-rotulo">Idioma</span><div class="q-abas q-seg" role="group" aria-label="Idioma do conteúdo">${ls.map((k) => `<button type="button" class="q-aba" aria-pressed="${FX.lang === k}" data-fx-lang="${k}">${FX_LING[k]}<span class="n">${num(ctBaralho(k).total)}</span></button>`).join('')}</div></div>` : ''}
        ${fxSoTrilha() ? '' : `<label class="q-campo q-bib-busca fx-busca">${ica('search')}<input type="search" placeholder="Buscar sessão ou baralho" aria-label="Buscar conteúdo pelo nome" value="${esc(FX.busca)}" data-fx-campo="busca"></label>`}
        <div class="fx-cat-lista ct-bar-col">${fxListaDoCatalogo()}</div>
        <button type="button" class="q-linha q-bib-nova ct-novo-baralho fx-nova" data-fx="trazer" data-fx-alvo="trazer"><span class="q-bib-nova-dentro"><span class="q-ic">${ica('plus')}</span><span><b>Trazer uma fonte</b><small>Arquivo do Anki, lista ou texto colado, vídeo ou PDF. Ela já vem escolhida.</small></span></span></button>
      </div>
      <section class="q-cartao q-bib-det ct-bar-det fx-cat-det" aria-label="Conteúdo selecionado" data-fx-alvo="painel">${fxDetalheDaFonte(fxFonte(FX.sel))}</section>`;
  }
  function fxPintarCatalogo(raiz) {
    $('.fx-cat-lista', raiz).innerHTML = fxListaDoCatalogo();
    $('.fx-cat-det', raiz).innerHTML = fxDetalheDaFonte(fxFonte(FX.sel));
    $$('.fs-idiomas .q-aba', raiz).forEach((b) => b.setAttribute('aria-pressed', b.dataset.fxLang === FX.lang));
    $$('.q-abas', raiz).forEach((g) => porPilula(g));
  }
  /* Um clique dentro do catálogo. */
  function fsCliqueNoCatalogo(b, raiz, gatilho) {
    const x = b.dataset;
    const fecha = () => fecharDialogo(raiz);
    if (x.fxLang) return fsMudarIdioma(x.fxLang), raiz.isConnected && fxPintarCatalogo(raiz);
    if (x.fxUsar) return fxEscolher(x.fxUsar);
    if (x.fxFonte) {
      if (celular()) return b.closest('.fx-nao-serve') ? toast('Este não serve para o jogo que você tocou. Escolha um sem cadeado.') : fxEscolher(x.fxFonte);
      FX.sel = x.fxFonte;
      $$('.fx-linha', raiz).forEach((l) => l.setAttribute('aria-pressed', l.dataset.fxFonte === FX.sel));
      const det = $('.fx-cat-det', raiz);
      det.innerHTML = fxDetalheDaFonte(fxFonte(FX.sel));
      if (polido() && !reduz()) {
        anima(det, [{ opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 460 });
        $$('.q-bib-fatos > div, .fx-fora li, .fx-todos, .q-bib-acoes > *, .fs-cobertura', det).forEach((el, i) => anima(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 60 + i * 40 }));
      }
      return;
    }
    /* as ações do painel definem o conteúdo e levam */
    if (x.fxRevisar) return fecha(), fxEscolher(x.fxRevisar, { calado: true }), fxRevisar(x.fxRevisar);
    if (x.fxJogar) return fecha(), fxJogarCom(x.fxJogar);
    if (x.fxVer) return fecha(), fxVerPalavras(x.fxVer);
    if (x.fsPraticar) {
      const f = fxFonte(x.fsPraticar);
      fecha();
      fxEscolher(x.fsPraticar, { calado: true });
      if (atual !== 'cartoes') (abaDe.cartoes = 0), mostrarSemAds('cartoes', { origem: 'seco' });
      else fsAplicar('seco');
      return setTimeout(() => ctOutroJeito({ origem: 'baralho', rotulo: fsNomeNaLista(f), n: fxMat(f).pal, baralho: fsDeck(f.id) }), 320 * K());
    }
    if (x.fsMenu) return ctAbrirMenuDoBaralho(x.fsMenu, gatilho);
    if (x.fsFaltam) return ctAbrirFaltam(x.fsFaltam, gatilho);
    if (x.fx === 'limpar-busca') return (FX.busca = ''), ($('[data-fx-campo="busca"]', raiz).value = ''), fxPintarCatalogo(raiz);
    if (x.fx === 'capturar') return fecha(), ir('capturar');
    if (x.fx === 'trazer-anki') return ctAbrirAnki(1, gatilho);
    if (x.fx === 'trazer') return fxAbrirTrazer(gatilho);
  }
  function fxAbrirCatalogo(gatilho, o = {}) {
    fsFecharPergunta({ seco: true });
    FX.paraJogo = o.paraJogo || null;
    FX.busca = '';
    FX.sel = o.sel && fxFontes().some((f) => f.id === o.sel) ? o.sel : FX.fonte === 'recorte' ? 'tudo' : FX.fonte;
    const jogo = FX.paraJogo && (JOGOS[FX.paraJogo]?.titulo || 'Memória: palavra e tradução');
    const sub = jogo ? `<b>${jogo}</b> ${esc($(`[data-jogo="${FX.paraJogo}"]`, tela)?.dataset.fxFalta?.replace(/^Precisa/, 'precisa') || '')} O que não serve para ele está marcado.` : 'Vale para os Cartões e para o Jogar, e fica guardado.';
    const d = ctAbrir(
      'fx:catalogo',
      `<dialog class="qj qj-painel largo m-auto ct-dlg fx-catalogo" aria-label="Escolher o conteúdo"><div class="dlg-cab"><span class="q-ic" aria-hidden="true">${ica('layers')}</span><div><h2>Escolher o conteúdo</h2><p class="qj-nota">${sub}</p></div><button type="button" class="x" aria-label="Fechar">${ica('x')}</button></div>
        <div class="dlg-corpo qj-painel-corpo fx-cat-corpo">${fsCorpoDoCatalogo()}</div></dialog>`,
      gatilho,
      (b, dlg) => fsCliqueNoCatalogo(b, dlg, gatilho),
    );
    d.addEventListener('input', (e) => {
      if (e.target.dataset?.fxCampo !== 'busca') return;
      FX.busca = e.target.value;
      $('.fx-cat-lista', d).innerHTML = fxListaDoCatalogo();
    });
    /* fechou (Esc, "x", fora): o foco volta para a ficha, mesmo que ela tenha sido refeita */
    d.addEventListener('close', () => setTimeout(() => !$('dialog[open]') && (!document.activeElement || document.activeElement === document.body) && $('[data-fs="abrir"]', tela)?.focus({ preventScroll: true }), 0));
    return d;
  }
  /* "Ver palavras" de um conteúdo: ele vira a escolha e a lista de Palavras abre já filtrada. */
  function fxVerPalavras(id) {
    fxEscolher(id, { calado: true });
    Object.assign(CT.f, { estado: id === 'dificeis' ? 'dificeis' : 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: false });
    if (atual === 'cartoes' && (abaDe.cartoes || 0) === 2) return fsAplicar('fonte');
    abaDe.cartoes = 2;
    if (atual === 'cartoes') return mostrar('cartoes', { aba: 2, origem: 'aba' });
    ir('cartoes');
  }
  /* Para conferir uma lista longa (?fontes=200): sessões de exemplo a mais, só no protótipo. */
  function fsEncher(n) {
    const temas = ['Reunião semanal', 'Podcast de produto', 'Aula de pronúncia', 'Entrevista de emprego', 'Série, episódio', 'Palestra sobre design', 'Vídeo de receita', 'Chamada com cliente'];
    const ancora = CT_BARALHOS.findIndex((x) => x.g === 'cuidar');
    const novas = Array.from({ length: n }, (_, i) => ({ id: `s-x${i}`, g: 'sessao', tipo: i % 3 ? 'Sessão de áudio' : 'Sessão de vídeo', nome: `${temas[i % temas.length]} ${i + 1}: ${['planos do trimestre', 'the science of habits', 'present perfect na prática', 'perguntas difíceis'][i % 4]}`, sub: `${(i % 27) + 1} set · ${10 + (i % 50)} min · Inglês`, i: i % 3 ? 'mic' : 'monitor', lang: 'en', total: 8 + ((i * 7) % 60), n: [i % 3, 0, i % 5], pilha: 0, ret: 80 + (i % 15), prox: 'amanhã, 1' }));
    novas.forEach((b) => (FX_FRASES[b.id] = Math.max(0, b.total - 6)));
    CT_BARALHOS.splice(ancora < 0 ? CT_BARALHOS.length : ancora, 0, ...novas);
  }
  if (+QS.get('fontes') > 0) fsEncher(Math.min(500, +QS.get('fontes')));

  /* ---- Partida ---------------------------------------------------------------------- */
  sincronizarBarraFx();
  addEventListener('resize', () => requestAnimationFrame(() => fsFecharPergunta({ seco: true })));
