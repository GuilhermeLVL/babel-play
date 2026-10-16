  /* ==========================================================================
     FONTES — o "catálogo de fontes": um padrão só para Biblioteca, Baralhos e Jogar.
     Mesmo escopo de prototipo.js e dos outros módulos; entra por último (depois de cartoes4.js).

     O que mora aqui:
       1. O catálogo: os mesmos grupos, na mesma ordem, nas três telas
          (Tudo, Difíceis · Por idioma · Das minhas sessões · Do Anki · Trilha do app).
       2. A tela JOGAR refeita sobre a versão enxuta aprovada (telas-enxutas-src/enxuto.js):
          a fonte das palavras fica à vista no topo, troca em um toque, e cada jogo diz se serve
          para ela ("precisa de 3 frases; esta fonte tem 2"). Nenhum jogo some.
       3. A porta "+" única ("Trazer uma fonte"): a mesma folha em Cartões, Biblioteca e Jogar.
          O que entra por ela já vira fonte, e no Jogar já vem escolhida.
       4. As ligações: Biblioteca e Baralhos abrem o Jogar com a fonte escolhida; do Jogar,
          "Revisar esta fonte" leva à revisão.
     As regras de cada jogo (mínimo de itens, palavra ou frase) são as de src/core/minigames/types.ts.
     Barra: Jogar: Muito conteúdo | Dois idiomas | Só a Trilha | Fonte pequena | Sem rede   Pergunta na entrada: não | sim
     Endereços: ?fx=cheio|dois|trilha|pequena|offline   ?fonte=<id>   ?ir=jogar|catalogo|trazer   ?pergunta=sim   ?fontes=200
     O seletor de conteúdo, o catálogo e a escolha (uma só para o app inteiro) estão em seletor.js.
     ========================================================================== */
  Object.assign(SIMPLES, {
    lock: svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    'arrow-left-right': svg('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
    youtube: svg('<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>'),
  });
  const FX_ESTADOS = [
    ['cheio', 'Muito conteúdo', 'Sessões, baralhos do Anki e a Trilha; a última fonte usada vem escolhida'],
    ['dois', 'Dois idiomas', 'A fonte "Tudo" tem inglês e espanhol: o jogo pede um idioma por vez'],
    ['trilha', 'Só a Trilha', 'Quem ainda não trouxe nada: joga com as palavras prontas do app'],
    ['pequena', 'Fonte pequena', 'Uma lista de 3 palavras: quase nenhum jogo abre, e cada um diz o que falta'],
    ['offline', 'Sem rede', 'Sem internet: o que já está no aparelho continua jogável'],
  ];
  const FX = {
    estado: FX_ESTADOS.some((e) => e[0] === QS.get('fx')) ? QS.get('fx') : 'cheio',
    fonte: 'tudo' /* o padrão do app inteiro; a escolha acompanha a pessoa de tela em tela */,
    lang: 'en',
    recentes: ['a-pv', 's-reuniao'],
    antes: null,
    recorte: null,
    sug: 0,
    busca: '',
    sel: null,
    paraJogo: null,
    de: 'jogar',
    novas: 0,
  };
  const FX_LING = { en: 'Inglês', es: 'Espanhol' };
  /* O SELETOR DE CONTEÚDO (seletor.js): a ficha no cabeçalho. A pergunta na entrada é uma opção,
     desligada de fábrica (barra do protótipo, ou ?pergunta=sim). */
  const FS = { pergunta: QS.get('pergunta') === 'sim', perguntou: false, naoPerguntar: false, ultima: 'a-pv', nova: 's-reuniao', relogio: null };
  /* Os grupos e a ordem do catálogo: valem para Baralhos, para o Jogar e (no que cabe) para a Biblioteca. */
  const FX_GRUPOS = [
    ['sessao', 'Das minhas sessões'],
    ['anki', 'Do Anki'],
    ['trilha', 'Trilha do app'],
  ];
  /* Quantas FRASES cada fonte tem (as palavras são os cartões do baralho). A Trilha só tem palavras soltas. */
  const FX_FRASES = { tudo: 311, dificeis: 6, en: 236, es: 75, 's-reuniao': 31, 's-podcast': 44, 's-aula': 19, 's-lumen': 2, 's-artigo': 27, trilha: 0, 'a-pv': 96, 'a-es': 0, 'l-viagem': 0 };
  /* Fontes que juntam dois idiomas: [palavras, frases] de cada um. O jogo usa um idioma por vez. */
  const FX_POR_IDIOMA = { tudo: { en: [318, 236], es: [104, 75] }, dificeis: { en: [5, 5], es: [1, 1] } };
  const FX_PEQUENA = { id: 'l-viagem', g: 'sessao', tipo: 'Lista colada', nome: 'Lista: viagem de março', sub: 'ontem · lista · Inglês', i: 'clipboard', lang: 'en', total: 3, n: [3, 0, 0], pilha: 0, ret: null, prox: 'amanhã, 3' };
  /* types.ts › MINIGAMES: [mínimo, do que vive, aceita palavra falada no lugar da frase, precisa de rede] */
  const FX_REGRA = {
    memory: [4, 'palavra'], wordsearch: [4, 'palavra'], blitz: [4, 'palavra'], termo: [3, 'palavra'], karuta: [4, 'palavra'], choseong: [4, 'palavra'], tenis: [4, 'palavra'], koffer: [4, 'palavra'],
    bao: [4, 'palavra'], vitendawili: [4, 'palavra'], shiritori: [4, 'palavra'], cadavre: [4, 'palavra'], taboo: [4, 'palavra'],
    scramble: [3, 'frase'], conectores: [3, 'frase'], karaoke: [3, 'fala', true, true], escuta: [4, 'fala', true], ditado: [3, 'fala', true],
  };
  const fxSoTrilha = () => FX.estado === 'trilha';
  const fxNomeCurto = (f) => (f.recorte ? f.nome : ctNomeDoBaralho(f.id).replace(/^Anki · /, '') || f.nome.replace(/^Trilha de vocabulário/, 'Trilha'));
  const fxPlural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;

  /* ---- As fontes ------------------------------------------------------------------- */
  /* Todas as fontes que existem; e as do idioma escolhido (o idioma é o primeiro nível do seletor:
     "Tudo" quer dizer "tudo em inglês", e os baralhos "Inglês" e "Espanhol" deixam de ser linhas). */
  function fsTodas() {
    if (fxSoTrilha()) return CT_BARALHOS.filter((b) => b.id === 'trilha');
    const l = CT_BARALHOS.filter((b) => b.id !== 'suspensas');
    return FX.estado === 'pequena' ? l.concat(FX_PEQUENA) : l;
  }
  const fsDois = () => !fxSoTrilha();
  function fxFontes() {
    const l = fsTodas();
    return fsDois() ? l.filter((b) => b.id !== 'en' && b.id !== 'es' && (!b.lang || b.lang === FX.lang)) : l;
  }
  function fxFonte(id = FX.fonte) {
    if (id === 'recorte' && FX.recorte) return FX.recorte;
    return fxFontes().find((b) => b.id === id) || fxFontes().find((b) => b.id === 'tudo') || ctBaralho('trilha');
  }
  const fxIdiomas = (f) => (f.lang || fxSoTrilha() || !FX_POR_IDIOMA[f.id] ? null : FX_POR_IDIOMA[f.id]);
  /* O material de uma fonte: palavras e frases (no idioma escolhido, quando ela tem dois). */
  function fxMat(f, inteira) {
    if (f.recorte) return { pal: f.total, fra: f.fra };
    const dois = fxIdiomas(f);
    if (dois) return { pal: dois[FX.lang][0], fra: dois[FX.lang][1] };
    return { pal: f.g === 'trilha' ? f.de : f.total, fra: f.fra ?? FX_FRASES[f.id] ?? 0 };
  }
  /* Um jogo serve para uma fonte? Se não, o motivo em poucas palavras e o que falta. */
  function fxServe(id, f = fxFonte()) {
    const [min, vive, falada, rede] = FX_REGRA[id] || [4, 'palavra'];
    const m = fxMat(f);
    if (rede && PL.offline) return { ok: false, motivo: 'Precisa de internet para ouvir a sua voz.', rede: true };
    if (vive === 'palavra') return m.pal >= min ? { ok: true, disp: m.pal, de: 'palavras' } : { ok: false, motivo: `Precisa de ${min} palavras; aqui há ${m.pal}.`, pede: 'palavras' };
    if (m.fra >= min) return { ok: true, disp: m.fra, de: 'frases' };
    if (falada && m.pal >= min) return { ok: true, disp: m.pal, de: 'palavras', nota: 'com palavras faladas' };
    if (falada) return { ok: false, motivo: `Precisa de ${min} frases ou palavras; aqui há ${Math.max(m.fra, m.pal)}.`, pede: 'palavras' };
    return { ok: false, motivo: f.g === 'trilha' ? `Precisa de ${min} frases; a Trilha só tem palavras soltas.` : `Precisa de ${min} frases; aqui há ${m.fra}.`, pede: 'frases' };
  }
  const fxQuantosServem = (f) => ORDEM_JOGOS.filter((id) => fxServe(id, f).ok).length;
  const fxLinguaDe = (f) => (f.lang ? FX_LING[f.lang] : fxIdiomas(f) ? 'Inglês e espanhol' : fxSoTrilha() ? 'Inglês' : 'Inglês e espanhol');
  const fxContagem = (f) => {
    const m = fxMat(f, true);
    return `${fxPlural(m.pal, 'palavra', 'palavras')} · ${m.fra ? fxPlural(m.fra, 'frase', 'frases') : 'sem frases'}`;
  };
  /* Quantas palavras guardadas tem uma gravação da Biblioteca (o mesmo número do baralho da sessão). */
  const fxDaGravacao = (g) => CT_BARALHOS.find((b) => b.nome === g.t) || null;

  /* A porta das outras telas: abre o Jogar já com a fonte (uma sessão, um baralho, um recorte dos Cartões). */
  function fxJogarCom(id) {
    if (FX.estado === 'trilha' || FX.estado === 'pequena') FX.estado = 'cheio';
    fxEscolher(id, { calado: true });
    sincronizarBarraFx();
    $$('dialog.fx-catalogo').forEach((d) => fecharDialogo(d));
    if (atual === 'jogar') fxRepintarJogar('fonte');
    else ir('jogar');
  }
  function fxJogarComRecorte(rec) {
    FX.recorte = { id: 'recorte', recorte: true, g: 'recorte', tipo: 'Recorte dos Cartões', nome: rec.rotulo, i: 'layers', lang: 'en', total: rec.n, fra: Math.max(0, rec.n - 2), n: null };
    if (FX.fonte !== 'recorte') FX.antes = FX.fonte;
    FX.fonte = 'recorte';
    FX.sug = 0;
    ir('jogar');
  }
  function fxRevisar(id = FX.fonte) {
    const f = fxFonte(id);
    if (f.recorte) return (abaDe.cartoes = 0), ir('cartoes');
    const deck = fsDeck(f.id);
    if (CT_FILA.some((c) => ctNoBaralho(ctCarta(c), deck))) return ctEstudar({ baralho: deck });
    return ctEstudar({ baralho: 'tudo', n: Math.min(10, f.total), rotulo: `Hoje · ${fxNomeCurto(f)}` });
  }
  const fxParaHoje = (f) => {
    const b = CT_BARALHOS.find((x) => x.id === fsDeck(f.id)) || f;
    const n = b.n ? ctN(b) : null;
    return n ? n[0] + n[1] + n[2] : 0;
  };

  /* ==========================================================================
     JOGAR
     Enxuta (aprovada): [fonte] / sugestão com UM botão cheio / [3 abas] ... [Buscar e organizar] / grade
     Agora:  Jogar [seletor de conteúdo, conforme a variante] / aviso do estado (só quando há)
             / sugestão / [3 abas] ... [Buscar e organizar] / grade dos que servem / os que não servem, com o motivo
     ========================================================================== */
  html.dataset.telas = 'enxuta';
  /* A "Sugestão para hoje" saiu do Jogar. No lugar dela, só no plano Grátis, uma faixa de anúncio no
     molde dos in-feed de anuncios.js (rótulo, marca inventada, "Sem anúncios no Essencial").
     As regras são as daquela camada: perfil infantil (conta de menor) não vê, no Quest não há, e sem
     rede não aparece. A altura é reservada desde o primeiro quadro (fontes.css › .fx-anuncio).
     Nos planos pagos não entra nada ali: a grade sobe. */
  const fxTemFaixaDeAnuncio = () => !conta.premium && !ADS.infantil && ADS.disp !== 'quest' && !PL.offline;
  function fxFaixaDeAnuncio() {
    if (!fxTemFaixaDeAnuncio()) return '';
    const m = MARCAS.curso;
    return `<div class="q-linha ad ad-infeed fx-anuncio" data-fx-alvo="anuncio" ${marca('jogar-faixa')} role="complementary" aria-label="Anúncio"><span class="q-ic" style="--mm:${m.cor}">${ica(m.icone)}</span>
      <span class="ad-infeed-texto"><b>${m.titulo}</b><small>${rotulo('Anúncio')}<span class="ad-marca-linha"> · ${m.nome}</span></small></span>
      <span class="ad-infeed-fim"><button type="button" class="ad-cta" data-ad-cta="${m.nome}" aria-label="${m.acao}: ${m.nome}"><span class="fx-cta-longo">${m.acao}</span><span class="fx-cta-curto">Ver</span></button>${semAds()}</span></div>`;
  }

  function fxAviso() {
    const f = fxFonte();
    const serve = fxQuantosServem(f);
    const caixa = (icone, texto, botoes = '', tom = '') => `<div class="q-aviso fx-aviso ${tom}" data-fx-alvo="aviso"><span class="qv-aviso-texto">${ica(icone)}<span>${texto}</span></span>${botoes ? `<span class="fx-aviso-acoes">${botoes}</span>` : ''}</div>`;
    const l = [];
    if (PL.offline) l.push(caixa('wifi-off', '<b>Sem internet.</b> Você joga com o que já está no aparelho. Só o Karaokê da fala espera a rede; link de vídeo também. Anki e lista colada funcionam.', '', 'fx-aviso-rede'));
    if (fxSoTrilha())
      l.push(caixa('graduation-cap', '<b>Você joga com as palavras prontas da Trilha.</b> Traga as suas e o jogo fica com a sua cara.', `<button type="button" class="q-ctl pri" data-fx="trazer">${ica('plus')} Trazer uma fonte</button>`, 'fx-aviso-trilha'));
    else if (serve <= 6) {
      const m = fxMat(f);
      l.push(caixa('triangle-alert', `<b>Conteúdo pequeno: ${fxPlural(m.pal, 'palavra', 'palavras')}${m.fra ? ` e ${fxPlural(m.fra, 'frase', 'frases')}` : ''}.</b> ${serve ? `Só ${serve === 1 ? '1 jogo abre' : `${serve} jogos abrem`} com ele; os outros dizem o que falta.` : 'Nenhum jogo abre com ele; cada um diz o que falta.'}`, `<button type="button" class="q-ctl pri" data-fx-usar="tudo">${ica('layers')} Usar Tudo</button><button type="button" class="q-ctl" data-fx="trazer">${ica('plus')} Trazer mais</button>`, 'fx-aviso-pequena'));
    } else if (f.recorte) l.push(caixa('layers', `<b>Recorte vindo dos Cartões.</b> Vale para esta visita; depois volta para ${esc(fsNome(fxFonte(FX.antes)))}.`));
    return l.join('');
  }
  function fxArrumarJogar() {
    const palco = $('.quest-jogar', tela);
    if (!palco || !polido() || palco.classList.contains('fx-jogar')) return;
    palco.classList.add('ex-jogar', 'fx-jogar');
    const f = fxFonte();
    const m = fxMat(f);

    /* 1. O cabeçalho no molde do de Cartões: título, seletor Cartões | Jogos (celular) e o seletor de
          conteúdo no MESMO lugar das outras telas. O "+" saiu: "Trazer uma fonte" mora no catálogo. */
    const cab = $('.q-cab', palco);
    cab.classList.add('ct-cab', 'fx-cab', 'fs-cab');
    cab.innerHTML = `<h1>Jogar</h1>${ctSegPraticar('jogar')}${fsFicha()}<span class="q-espaco"></span>`;

    /* 2. O aviso do estado (só quando há) e, no Grátis, a faixa de anúncio. A sugestão do dia saiu. */
    cab.insertAdjacentHTML('afterend', fxAviso() + fxFaixaDeAnuncio());
    const ancora = () => $('.fx-anuncio', palco) || $$('.fx-aviso', palco).pop() || cab;
    $('.qj-sugestao', palco)?.remove();
    const trilha = $('.qj-trilha', palco);
    if (trilha && f.g !== 'trilha') trilha.remove();
    else if (trilha) ancora().after(trilha);

    /* 3. Três chips viram um: "Buscar e organizar". */
    const ferr = $('.qj-ferramentas', palco);
    $$(':scope > .q-chip', ferr).forEach((x) => x.remove());
    /* "Sortear um jogo" sobrevive pequeno, ao lado de "Buscar e organizar" */
    ferr.insertAdjacentHTML('beforeend', `<button type="button" class="q-chip fx-sortear" data-ex="sortear" aria-label="Sortear um jogo" title="Sorteia um jogo dentre os que servem para este conteúdo e começa na hora">${icp('zap')}<span>Sortear</span></button>`);
    ferr.insertAdjacentHTML('beforeend', `<button type="button" class="q-chip ex-organizar" aria-haspopup="dialog" data-ex="organizar" aria-label="Buscar e organizar os jogos" title="Buscar e filtrar, favoritos e ordem, opções">${icp('search')}<span>Buscar e organizar</span></button>`);

    /* 4. A grade responde à fonte: os que servem ficam prontos; os que não servem descem para
          "Precisam de outro material" (a seção que a produção já tem) e dizem o que falta. */
    const painel = $('#grade-de-jogos', palco);
    const grade = $('.q-grade', painel);
    const caixas = $$('.qj-jogo', painel);
    $('.qj-presos', painel)?.remove();
    const fora = [];
    for (const caixa of caixas) {
      const tile = $('.q-tile', caixa);
      const id = tile.dataset.jogo;
      const s = fxServe(id, f);
      /* a captura veio com a Trilha: o Caça-conectores chegou preso; aqui ele volta a ser um jogo como os outros */
      $('.qj-porta', caixa)?.remove();
      tile.disabled = false;
      tile.classList.remove('apagado');
      if (id === 'conectores') {
        $('.qj-jogo-topo .q-tag', tile).className = 'q-tag';
        $('.qj-jogo-topo .q-tag', tile).textContent = 'Clicar';
        $('.q-d', tile).textContent = 'Ache a palavra que liga as duas partes da frase';
      }
      let conta = $('.qj-conta', tile);
      if (!conta) (tile.insertAdjacentHTML('beforeend', '<span class="qj-conta">4 nesta rodada</span>'), (conta = $('.qj-conta', tile)));
      if (s.ok) {
        const rodada = Math.min(parseInt(conta.textContent, 10) || 8, s.disp);
        conta.textContent = `${rodada} nesta rodada · ${num(s.disp)} ${s.disp === 1 ? 'disponível' : 'disponíveis'}${s.nota ? ` · ${s.nota}` : ''}`;
        grade.append(caixa);
        continue;
      }
      caixa.classList.add('fx-falta');
      tile.classList.add('apagado');
      tile.dataset.fxFalta = s.motivo;
      tile.setAttribute('aria-label', `${txt($('b', tile))}. Não serve para este conteúdo: ${s.motivo}`);
      const tag = $('.qj-jogo-topo .q-tag', tile);
      tag.className = 'q-tag off fx-tag-falta';
      tag.innerHTML = `${ica(s.rede ? 'wifi-off' : 'lock')}${s.rede ? 'Sem rede' : 'Falta<span class="fx-so-pc">&nbsp;material</span>'}`;
      $('.q-d', tile).remove();
      conta.outerHTML = `<span class="q-d fx-motivo">${esc(s.motivo)}</span>`;
      fora.push(caixa);
    }
    if (fora.length) {
      /* poucos presos: cada um tem a sua saída; muitos (fonte pequena): uma saída só, no título da seção */
      const muitos = fora.length > 4;
      if (!muitos) for (const caixa of fora) if (!/internet/.test($('.q-tile', caixa).dataset.fxFalta)) caixa.insertAdjacentHTML('beforeend', `<button type="button" class="q-ctl qj-porta" data-fx-para="${$('.q-tile', caixa).dataset.jogo}" aria-label="Ver o conteúdo que serve para ${esc(txt($('.q-tile b', caixa)))}">${ica('layers')} Ver o que serve</button>`);
      painel.insertAdjacentHTML('beforeend', `<section class="q-secao qj-presos fx-faltam" data-fx-alvo="faltam"><header><div><h2>${fora.length === 1 ? 'Precisa de outro material' : 'Precisam de outro material'}</h2><p>${fora.length === 1 ? 'Não está quebrado: pede algo que este conteúdo não tem.' : 'Não estão quebrados: pedem algo que este conteúdo não tem. Cada um diz o que falta.'}</p></div>${muitos ? `<button type="button" class="q-ctl" data-fs="abrir">${ica('layers')} Trocar o conteúdo</button>` : ''}</header><div class="q-grade g4 fx-grade-falta"></div></section>`);
      $('.fx-grade-falta', painel).append(...fora);
    }
    if (!$$('.qj-jogo', grade).length) grade.remove();
    const todos = $('#aba-todos .n', palco);
    if (todos) (todos.textContent = caixas.length - fora.length), todos.setAttribute('title', `${caixas.length - fora.length} servem para este conteúdo, de ${caixas.length}`);
    $$('.q-abas', palco).forEach((g) => porPilula(g));
    reposicionar();
  }
  aoMostrar.jogar = fxArrumarJogar;
  const fxAlternarAntes = alternarEstado;
  alternarEstado = function (chave) {
    fxAlternarAntes(chave);
    if (atual !== 'jogar') return;
    fxArrumarJogar();
    if (polido() && !reduz()) $$('.qj-porque li', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 480, atraso: i * 60 }));
  };
  /* Trocou a fonte, o idioma ou o estado: a tela se refaz no lugar, e só o que mudou se mexe. */
  function fxRepintarJogar(como) {
    if (atual !== 'jogar') return;
    const rol = rolagem()?.scrollTop || 0;
    if (estadoAberto === 'jogar:Trilha' && fxFonte().g !== 'trilha') estadoAberto = null;
    tela.innerHTML = estadoAberto && D.sub[estadoAberto] ? D.sub[estadoAberto].html : fonteDe('jogar');
    fxArrumarJogar();
    vestirJogos();
    const r = rolagem();
    if (r) r.scrollTop = como === 'fonte' ? 0 : rol;
    if (!polido() || reduz() || como === 'seco') return;
    if (como === 'sugestao') return $$('.qj-sugestao-texto b, .qj-sugestao-texto small', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420, atraso: i * 60 }));
    $$('.fx-aviso', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 60 + i * 40 }));
    $$('.qj-jogo', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(16px) scale(0.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 440, atraso: 160 + Math.min(i, 12) * 35 }));
  }
  function fxSortear() {
    const ids = ORDEM_JOGOS.filter((id) => fxServe(id).ok && (id === 'memory' || JOGOS[id]));
    if (!ids.length) return toast('Nenhum jogo abre com este conteúdo. Troque o conteúdo ou traga mais palavras.');
    abrirJogo(ids[Math.floor(Math.random() * ids.length)]);
  }
  /* Dentro da partida, o cabeçalho diz de onde vêm as palavras. */
  const fxPartidaAntes = aoMostrar.partida;
  aoMostrar.partida = () => {
    fxPartidaAntes?.();
    const s = $('.cab .sobrancelha', tela);
    if (s && !$('.fx-na-partida', s)) s.insertAdjacentHTML('beforeend', `<span class="fx-na-partida" title="O conteúdo desta rodada">${ica(fxFonte().i)}${esc(fsNome(fxFonte()))}</span>`);
  };

  /* ---- Uma folha só: Buscar e filtrar · Favoritos e ordem · Opções (da versão enxuta) ----- */
  const FX_SECOES = [
    ['Buscar e filtrar', 'Buscar', 'search'],
    ['Favoritos e ordem', 'Favoritos e ordem', 'star'],
    ['Opções', 'Opções', 'settings-2'],
  ];
  function fxAbrirOrganizar(gatilho, qual = 0) {
    if ($('dialog[open]')) return;
    const partes = FX_SECOES.map(([nome]) => {
      const t = document.createElement('template');
      t.innerHTML = D.sub['jogar:' + nome].html;
      const d = t.content.firstElementChild;
      return { corpo: $('.dlg-corpo', d)?.innerHTML || '', pe: $('.dlg-pe', d)?.innerHTML || '', nota: txt($('.qj-nota', d)) };
    });
    const por = (d, i, animar) => {
      $('.qj-nota', d).textContent = partes[i].nota;
      $('.dlg-corpo', d).innerHTML = partes[i].corpo;
      $('.dlg-corpo', d).scrollTop = 0;
      $('.dlg-pe', d).innerHTML = partes[i].pe;
      $$('.dlg-corpo .q-abas', d).forEach((g) => porPilula(g));
      if (animar && polido() && !reduz()) $$('.dlg-corpo > *, .dlg-pe > *', d).forEach((x, n) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380, atraso: Math.min(n, 10) * 40 }));
    };
    const t = document.createElement('template');
    t.innerHTML = `<dialog class="qj qj-painel largo ex-organizar-dlg m-auto" aria-labelledby="ex-org-t">
        <div class="dlg-cab"><span class="q-ic" aria-hidden="true">${icp('sliders-horizontal')}</span><div style="min-width:0;flex:1 1 0%"><h2 id="ex-org-t">Buscar e organizar</h2><p class="qj-nota"></p></div><button type="button" class="x" aria-label="Fechar">${icp('x')}</button></div>
        <div class="ex-org-abas"><div class="q-abas q-seg" role="tablist" aria-label="Seções">${FX_SECOES.map(([nome, curto, icone], i) => `<button type="button" role="tab" class="q-aba" aria-selected="${i === qual}" data-ex-secao="${i}" aria-label="${nome}">${icp(icone)}<span>${curto}</span></button>`).join('')}</div></div>
        <div class="dlg-corpo qj-painel-corpo" role="tabpanel"></div>
        <div class="dlg-pe"></div></dialog>`;
    por(t.content.firstElementChild, qual, false);
    D.sub['jogar:Buscar e organizar'] = { html: t.innerHTML };
    abrirDialogo('jogar:Buscar e organizar', gatilho);
    const d = app.lastElementChild;
    d.addEventListener('click', (e) => {
      const aba = e.target.closest('[data-ex-secao]');
      if (aba) por(d, +aba.dataset.exSecao, true);
    });
    if (qual === 0 && !celular()) $('input[type="search"]', d)?.focus({ preventScroll: true });
  }

  /* ==========================================================================
     A PORTA "+": TRAZER UMA FONTE. Uma folha só, a mesma em Cartões, Biblioteca e Jogar.
     O que é comum vem primeiro e na mesma ordem; o que é só dos Cartões (palavra nova, exportar)
     vem depois, e só lá.
     ========================================================================== */
  function fxAbrirTrazer(gatilho, de = atual === 'cartoes' ? 'cartoes' : atual === 'biblioteca' ? 'biblioteca' : 'jogar') {
    FX.de = de;
    const comuns = [
      ['wallet-cards', 'Arquivo do Anki', 'Com a agenda e o histórico. Você vê o ensaio antes de gravar.', 'anki'],
      ['clipboard', 'Colar uma lista ou um texto', 'Uma palavra por linha, com ou sem tradução. Também lê CSV.', 'lista'],
      ['youtube', 'Vídeo, áudio ou PDF', PL.offline ? 'Do aparelho funciona agora. Link (YouTube, página) espera a internet.' : 'Link do YouTube ou arquivo do aparelho. Vira uma sessão com legenda.', 'arquivo'],
      ['mic', 'Capturar agora', 'Legende o que está tocando ou uma conversa. Ao encerrar, a sessão vira fonte.', 'capturar'],
    ];
    const dosCartoes = [
      ['plus', 'Palavra nova', 'Uma de cada vez, com a frase se quiser.', 'nova'],
      ['download', 'Exportar', 'De volta ao Anki inteiro, planilha ou texto. O que você traz, você leva.', 'exportar'],
    ];
    const sub = { jogar: 'O que você trouxer já vem escolhido como conteúdo, nos Cartões e no Jogar.', biblioteca: 'O que você trouxer já vem escolhido como conteúdo, nos Cartões e no Jogar.', cartoes: 'Suas palavras entram e saem inteiras.' }[de];
    ctAbrir(
      'fx:trazer',
      ctDlg('plus', de === 'cartoes' ? 'Trazer e levar' : 'Trazer uma fonte', sub, `${ctLinhasDeMenu(comuns)}${de === 'cartoes' ? `<p class="q-rotulo fx-rotulo-menu">Só dos cartões</p>${ctLinhasDeMenu(dosCartoes)}` : ''}`, '', 'ct-menu ct-trazer fx-trazer'),
      gatilho,
      (b, d) => {
        const k = b.dataset.ctM;
        if (k === 'anki') return ctAbrirAnki(1, gatilho);
        if (k === 'lista') return ctAbrirLista(gatilho);
        if (k === 'arquivo') return fxAbrirArquivo(gatilho);
        if (k === 'capturar') return fecharDialogo(d), ir('capturar');
        if (k === 'nova') return ctAbrirAdicionar(gatilho);
        if (k === 'exportar') return ctAbrirExportar(gatilho, { de: `${num(CT_FASES.total)} cartões` });
      },
    );
  }
  /* As duas portas antigas ("Trazer e levar" dos Cartões e "Importar" da Biblioteca) passam a abrir a mesma folha. */
  ctAbrirTrazerELevar = (gatilho) => fxAbrirTrazer(gatilho, 'cartoes');
  ctAbrirImportar = (gatilho) => fxAbrirTrazer(gatilho, 'biblioteca');

  /* A fonte nova entra no catálogo e já vira o conteúdo escolhido, em qualquer tela. */
  function fxChegou(b, frases, o = {}) {
    const i = CT_BARALHOS.findIndex((x) => x.id === b.id);
    if (i >= 0) CT_BARALHOS.splice(i, 1);
    const ancora = CT_BARALHOS.findIndex((x) => x.g === 'cuidar');
    CT_BARALHOS.splice(ancora < 0 ? CT_BARALHOS.length : ancora, 0, b);
    FX_FRASES[b.id] = frases;
    if (o.gravacao && !GRAVACOES.some((g) => g.t === b.nome)) GRAVACOES.unshift(o.gravacao);
    if (FX.estado === 'trilha' || FX.estado === 'pequena') (FX.estado = 'cheio'), CT.hoje === 'vazio' && (CT.hoje = 'normal'), sincronizarBarraFx(), aplicarCt({ semRedesenho: true });
    FS.nova = b.id;
    fxEscolher(b.id, { calado: true });
    if (o.calado) return fsAplicar('seco');
    fsAplicar('fonte');
    toast(`Conteúdo novo, já escolhido: ${b.nome}. ${fxContagem(b)}.`, 4600);
  }
  function fxSaiu(id) {
    const i = CT_BARALHOS.findIndex((x) => x.id === id);
    if (i >= 0) CT_BARALHOS.splice(i, 1);
    FX.recentes = FX.recentes.filter((x) => x !== id);
    if (FX.fonte === id) (FX.fonte = FX.antes && FX.antes !== id ? FX.antes : 'tudo'), fsAplicar('fonte');
  }
  /* Anki: no passo 2 (o relatório) o baralho já existe. No Jogar, o botão final diz o que acontece. */
  const fxAnkiAntes = ctAbrirAnki;
  ctAbrirAnki = function (passo = 1, gatilho) {
    if (passo === 1 && atual !== 'cartoes' && atual !== 'biblioteca') FX.de = 'jogar';
    const d = fxAnkiAntes(passo, gatilho);
    if (passo !== 2 || !d) return d;
    const A = CT_ANKI;
    const zero = CT.ankiAgenda !== 'agenda';
    fxChegou({ id: 'a-novo', g: 'anki', tipo: 'Anki', nome: A.nome, sub: `${num(A.vieram)} de ${num(A.notas)} notas · trazido hoje`, i: 'wallet-cards', lang: 'en', total: A.vieram, n: zero ? [10, 0, 0] : [10, 4, 17], pilha: 0, ret: zero ? null : 88, prox: 'amanhã, 10' }, A.vieram, { calado: true });
    if (FX.de === 'jogar') {
      $('[data-ct="anki-ver"]', d)?.remove();
      const pronto = $('.dlg-pe .q-ctl.pri', d);
      if (pronto) pronto.innerHTML = `${ica('gamepad-2')} Jogar com este baralho`;
      pronto?.addEventListener('click', () => atual !== 'jogar' && ir('jogar'));
      $('.qj-nota', d).insertAdjacentHTML('beforeend', ' · já escolhido como conteúdo');
    }
    d.addEventListener('click', (e) => e.target.closest('[data-ct="anki-desfazer"]') && fxSaiu('a-novo'));
    return d;
  };
  /* Lista ou texto colado: vira uma fonte com o nome das primeiras palavras. */
  const fxListaAntes = ctAbrirLista;
  ctAbrirLista = function (gatilho) {
    const de = FX.de;
    fxListaAntes(gatilho);
    const d = app.lastElementChild;
    if (!d?.matches?.('dialog')) return;
    if (de === 'jogar') {
      const nota = $('.qj-nota', d);
      if (nota) nota.textContent = 'Uma palavra por linha (com tradução, se tiver) ou um texto inteiro: o app separa as palavras. A lista já vem escolhida como conteúdo.';
    }
    d.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest('[data-ct="lista-criar"]')) return;
        const linhas = CT.lista.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!linhas.length) return;
        if (de === 'jogar') e.stopImmediatePropagation(), fecharDialogo(d); /* o aviso de "criados no baralho Inglês" não vale aqui */
        const nomes = linhas.slice(0, 2).map((l) => l.split(/[;\t]|\s-\s/)[0].trim());
        FX.de = de;
        FX.novas++;
        fxChegou({ id: `l-colada-${FX.novas}`, g: 'sessao', tipo: 'Lista colada', nome: `Lista: ${nomes.join(', ')}${linhas.length > 2 ? '…' : ''}`, sub: 'hoje · lista · Inglês', i: 'clipboard', lang: 'en', total: linhas.length, n: [Math.min(10, linhas.length), 0, 0], pilha: 0, ret: null, prox: `amanhã, ${Math.min(10, linhas.length)}` }, 0, { calado: de !== 'jogar' });
      },
      true,
    );
  };
  /* Vídeo, áudio ou PDF: o importador da Biblioteca, aberto no lugar. */
  function fxAbrirArquivo(gatilho) {
    const de = FX.de;
    ctAbrir(
      'fx:arquivo',
      ctDlg('youtube', 'Trazer vídeo, áudio ou PDF', 'O app transcreve, separa as palavras e guarda como uma sessão na Biblioteca.', `<label class="q-campo fx-campo-link"><span>Link do YouTube, de um podcast ou de uma página</span><input type="url" inputmode="url" spellcheck="false" value="${PL.offline ? '' : 'https://youtu.be/feedback-at-work'}" placeholder="https://" aria-label="Link do vídeo ou da página" ${PL.offline ? 'disabled' : ''}></label>
        ${PL.offline ? `<p class="qv-nota fx-sem-rede">${ica('wifi-off')} Sem internet: o link fica para depois. Um arquivo do aparelho funciona agora.</p>` : ''}
        <div class="q-acoes"><button type="button" class="q-ctl" data-fx="arquivo-do-aparelho">${ica('file-text')} Escolher um arquivo do aparelho</button></div>
        <p class="qv-nota">Aceita PDF, DOCX, TXT, legenda, áudio e vídeo. Vídeo e áudio longos levam alguns minutos; você pode jogar enquanto isso.</p>`, `<button type="button" class="q-ctl">Cancelar</button><button type="button" class="q-ctl pri" data-fx="trazer-link" ${PL.offline ? 'disabled' : ''}>${ica('check')} Trazer</button>`, 'fx-arquivo'),
      gatilho,
      (b, d) => {
        const pdf = b.dataset.fx === 'arquivo-do-aparelho';
        if (!pdf && b.dataset.fx !== 'trazer-link') return;
        if (pdf) fecharDialogo(d);
        toast(pdf ? 'Lendo “Guia de entrevistas.pdf”: separando as palavras e as frases…' : 'Trazendo o vídeo: transcrevendo e separando as palavras…', 2200);
        setTimeout(() => {
          FX.de = de;
          FX.novas++;
          const nome = pdf ? 'PDF: Guia de entrevistas' : 'YouTube: How to give feedback at work';
          fxChegou(
            { id: `s-nova-${FX.novas}`, g: 'sessao', tipo: pdf ? 'Texto' : 'Sessão de vídeo', nome, sub: pdf ? 'hoje · texto · Inglês' : 'hoje · 12 min · Inglês', i: pdf ? 'book-open' : 'monitor', lang: 'en', total: pdf ? 41 : 28, n: [10, 0, 0], pilha: 0, ret: null, prox: 'amanhã, 10' },
            pdf ? 36 : 22,
            { gravacao: { t: nome, tipo: pdf ? 'Texto' : 'Vídeo', i: pdf ? 'book-open' : 'monitor', d: 'hoje', min: pdf ? 0 : 12, id: 'Inglês', pal: pdf ? 2140 : 1480 } },
          );
        }, 1500 * K());
      },
    );
  }

  /* ==========================================================================
     Cliques
     ========================================================================== */
  ganchos.unshift((e, b) => {
    const x = b.dataset;
    /* o seletor de conteúdo: o mesmo em toda tela */
    if (x.fs === 'abrir') return fxAbrirCatalogo(b), true;
    if (x.fs === 'tudo') return fxEscolher('tudo'), true;
    if (x.fs === 'pergunta-fechar') return fsFecharPergunta(), true;
    if (x.fs === 'nao-perguntar') return (FS.naoPerguntar = true), fsFecharPergunta(), toast('Combinado: sem pergunta na entrada. A ficha continua aqui para trocar.', 4200), true;
    if (x.fsRapida) return fxEscolher(x.fsRapida), true;
    if (x.fsIrLingua) return fsMudarIdioma(x.fsIrLingua), true;
    /* de qualquer tela: revisar ou jogar com uma fonte define o conteúdo e leva */
    if (x.fxJogar) return fxJogarCom(x.fxJogar), true;
    if (x.ct === 'jogar-com') return fxJogarCom(x.id), true;
    if (x.fxRevisarSessao) return fxEscolher(x.fxRevisarSessao, { calado: true }), fxRevisar(x.fxRevisarSessao), true;
    if (x.fx === 'trazer') return fxAbrirTrazer(b), true;
    if (x.fxUsar) return fxEscolher(x.fxUsar), true;
    if (atual !== 'jogar') return false;
    if (x.fx === 'catalogo') return fxAbrirCatalogo(b), true;
    if (x.fx === 'capturar') return ir('capturar'), true;
    if (x.ex === 'organizar') return fxAbrirOrganizar(b), true;
    if (x.ex === 'sortear') return fxSortear(), true;
    if (x.fxPara) return fxAbrirCatalogo(b, { paraJogo: x.fxPara }), true;
    const tile = b.closest('.q-tile[data-jogo]');
    if (tile?.dataset.fxFalta) {
      sentir('aviso');
      if (/internet/.test(tile.dataset.fxFalta)) return toast(`${txt($('b', tile))}: ${tile.dataset.fxFalta} Os outros jogos continuam.`, 4200), true;
      return fxAbrirCatalogo(tile, { paraJogo: tile.dataset.jogo }), true;
    }
    return false;
  });
  /* Baralhos: a busca (o que a Biblioteca tinha e os Baralhos não). */
  tela.addEventListener('input', (e) => {
    if (e.target.dataset?.ctCampo !== 'busca-baralho') return;
    CT.buscaBar = e.target.value;
    const lista = $('.ct-bar-lista', tela);
    if (lista) lista.innerHTML = ctListaDeBaralhos();
  });

  /* ==========================================================================
     Barra do protótipo: os estados do Jogar
     ========================================================================== */
  const barraFx = $('.ct-barra');
  if (barraFx)
    barraFx.insertAdjacentHTML(
      'beforeend',
      `<span class="px-sep"></span><span class="ad-barra-t">Jogar</span>
       <div class="px-seg fx-seg" title="O estado de quem abre o Jogar"><i></i>${FX_ESTADOS.map(([k, r, t]) => `<button type="button" data-fx-estado="${k}" aria-pressed="false" title="${t}">${r}</button>`).join('')}</div>
       <button type="button" data-fx-ir="catalogo" title="A folha Escolher o conteúdo: a mesma em toda tela">Catálogo</button>
       <button type="button" data-fx-ir="trazer" title="A folha Trazer uma fonte, que mora dentro do catálogo">Trazer</button>
       <span class="px-sep"></span><span class="ad-barra-t">Pergunta na entrada</span>
       <div class="px-seg fs-seg" title="Opção, desligada de fábrica: ao entrar em Jogar ou Cartões, um aviso pequeno pergunta “Com o que hoje?”"><i></i><button type="button" data-fs-pergunta="nao" aria-pressed="false">não</button><button type="button" data-fs-pergunta="sim" aria-pressed="false">sim</button></div>`,
    );
  function sincronizarBarraFx() {
    if (!barraFx) return;
    const e = PL.offline ? 'offline' : FX.estado === 'offline' ? 'cheio' : FX.estado;
    $$('[data-fx-estado]', barraFx).forEach((b) => b.setAttribute('aria-pressed', b.dataset.fxEstado === e));
    $$('[data-fs-pergunta]', barraFx).forEach((b) => b.setAttribute('aria-pressed', (b.dataset.fsPergunta === 'sim') === FS.pergunta));
    $$('.fx-seg [aria-pressed="true"], .fs-seg [aria-pressed="true"]', barraFx).forEach((b) => b.offsetWidth && marcarSeg(b));
  }
  function fxAplicarEstado(k, o = {}) {
    FX.estado = k;
    PL.offline = k === 'offline';
    FX.recorte = null;
    FX.fonte = { cheio: 'tudo', dois: 'tudo', trilha: 'trilha', pequena: 'l-viagem', offline: 'tudo' }[k];
    FX.lang = 'en';
    FX.sug = 0;
    FX.recentes = ['a-pv', 's-reuniao'];
    FS.perguntou = false;
    CT.hoje = k === 'trilha' ? 'vazio' : CT.hoje === 'vazio' ? 'normal' : CT.hoje;
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    if (folha) fecharFolha({ seco: true, semFoco: true });
    sincronizarBarraPl();
    aplicarCt({ semRedesenho: true });
    sincronizarBarraFx();
    if (o.calado) return;
    toast(FX_ESTADOS.find((e) => e[0] === k)[2] + '.', 4200);
    mostrarSemAds('jogar', { origem: atual === 'jogar' ? 'seco' : 'clique' });
    if (atual === 'jogar') fxRepintarJogar('fonte');
  }
  const FX_IR = {
    jogar: () => mostrarSemAds('jogar', { origem: 'clique' }),
    catalogo: () => (!['jogar', 'cartoes', 'biblioteca'].includes(atual) && mostrarSemAds('jogar', { origem: 'seco' }), setTimeout(() => fxAbrirCatalogo($('[data-fs="abrir"]')), 500 * K())),
    trazer: () => (!['jogar', 'cartoes', 'biblioteca'].includes(atual) && mostrarSemAds('jogar', { origem: 'seco' }), setTimeout(() => fxAbrirTrazer($('[data-fs="abrir"]'), 'jogar'), 500 * K())),
  };
  barraFx?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fxEstado) return fxAplicarEstado(b.dataset.fxEstado);
    if (b.dataset.fsPergunta) return fsLigarPergunta(b.dataset.fsPergunta === 'sim');
    if (b.dataset.fxIr) return $$('dialog[open]').forEach((d) => (d.close(), d.remove())), FX_IR[b.dataset.fxIr]();
    /* "Sem rede" da barra dos Cartões e o estado daqui são o mesmo interruptor */
    if (b.dataset.ctB === 'offline') setTimeout(() => (sincronizarBarraFx(), atual === 'jogar' && fxRepintarJogar('seco')), 0);
  });
  addEventListener('resize', () => requestAnimationFrame(sincronizarBarraFx));
  document.fonts?.ready.then(sincronizarBarraFx);
  window.__fontes = { estado: () => ({ ...FX, atual, pergunta: FS.pergunta, deck: fsDeck(), aba: abaDe.cartoes || 0 }), serve: fxServe, usar: fxEscolher, perguntar: () => ((FS.perguntou = false), fsPerguntar()), ir: (nome, aba) => (aba != null && (abaDe[nome] = aba), mostrarSemAds(nome, { origem: 'clique' })) };

  /* ---- Partida ---------------------------------------------------------------------- */
  if (QS.has('limpo')) html.dataset.fxLimpo = '1';
  if (FX.estado !== 'cheio') fxAplicarEstado(FX.estado, { calado: true });
  if (QS.get('fonte') && fsTodas().some((f) => f.id === QS.get('fonte'))) fxEscolher(QS.get('fonte'), { calado: true });
  sincronizarBarraFx();
  if (FX_IR[QS.get('ir')] && !QS.get('ver') && !QS.get('cx')) setTimeout(() => FX_IR[QS.get('ir')](), 700);
