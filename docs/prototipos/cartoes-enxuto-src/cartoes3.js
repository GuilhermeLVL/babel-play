  /* ==========================================================================
     CARTÕES 3 — a navegação (Atual, A, B, C), as portas do que estava escondido,
     a barra do protótipo e o Mapa das portas.

     Navegação (seção 4.2 da proposta):
       Atual  o trilho de hoje; Cartões só existe atrás de Mais › Vocabulário.
       A      conteúdo no trilho (Biblioteca, Cartões), acessório no Mais (Estatísticas, Personalizar).
       B      "Praticar": um destino com duas abas, Cartões e Jogos.
       C      mínima: o trilho não muda; Cartões toma o lugar de Vocabulário no Mais.
       D      a decidida (padrão): no computador, o trilho de A; no celular, Início, Praticar, Capturar,
              Intérprete e Mais, com o seletor Cartões | Jogos na linha do título.
     Em todas, o ladrilho de revisão do Início é fixo.
     ========================================================================== */
  const CT_NAV = {
    atual: { nome: 'Atual', itens: ['inicio', 'capturar', 'interprete', 'jogar', 'estatisticas', 'personalizar'], cel: ['inicio', 'jogar', 'capturar', 'interprete'], mais: ['biblioteca', 'vocabulario', 'sobre', 'ajustes', 'perfil', 'ajuda'], maisCel: ['personalizar', 'estatisticas'] },
    a: { nome: 'A', itens: ['inicio', 'capturar', 'interprete', 'biblioteca', 'cartoes', 'jogar'], cel: ['inicio', 'cartoes', 'capturar', 'jogar'], mais: ['estatisticas', 'personalizar', 'ajustes', 'perfil', 'tutor', 'ajuda', 'sobre'], maisCel: ['interprete', 'biblioteca'] },
    b: { nome: 'B', itens: ['inicio', 'capturar', 'interprete', 'biblioteca', 'praticar', 'estatisticas'], cel: ['inicio', 'praticar', 'capturar', 'interprete'], mais: ['personalizar', 'ajustes', 'perfil', 'tutor', 'ajuda', 'sobre'], maisCel: ['biblioteca', 'estatisticas'] },
    d: { nome: 'Decidida', itens: ['inicio', 'capturar', 'interprete', 'biblioteca', 'cartoes', 'jogar'], cel: ['inicio', 'cartoes', 'capturar', 'interprete'], mais: ['estatisticas', 'personalizar', 'ajustes', 'perfil', 'tutor', 'ajuda', 'sobre'], maisCel: ['biblioteca'] },
    c: { nome: 'C', itens: ['inicio', 'capturar', 'interprete', 'jogar', 'estatisticas', 'personalizar'], cel: ['inicio', 'jogar', 'capturar', 'interprete'], mais: ['biblioteca', 'cartoes', 'sobre', 'ajustes', 'perfil', 'ajuda'], maisCel: ['personalizar', 'estatisticas'] },
  };
  const CT_SVG_DO_TRILHO = itens.slice(0, 6).map((b) => $('svg', b).outerHTML);
  const ctDestino = (r) =>
    ({
      inicio: ['Início', CT_SVG_DO_TRILHO[0]],
      capturar: ['Capturar', CT_SVG_DO_TRILHO[1]],
      interprete: ['Intérprete', CT_SVG_DO_TRILHO[2]],
      jogar: ['Jogar', CT_SVG_DO_TRILHO[3]],
      estatisticas: ['Estatísticas', CT_SVG_DO_TRILHO[4]],
      personalizar: ['Personalizar', CT_SVG_DO_TRILHO[5]],
      biblioteca: ['Biblioteca', ica('library')],
      cartoes: [ctNome(), ica('layers')],
      praticar: ['Praticar', ica('target')],
      vocabulario: ['Vocabulário', ica('book-open')],
      sobre: ['Sobre', ica('heart')],
      ajustes: ['Ajustes', ica('settings')],
      perfil: ['Seu perfil', ica('user-round')],
      ajuda: ['Ajuda e suporte', ica('life-buoy')],
      tutor: ['Tutor', ica('message-circle')],
    })[r];
  ROTAS.push('cartoes', 'estudo');
  /* Aberto por endereço (?ver=…), nada vibra antes do primeiro toque: o navegador bloquearia e avisaria no console. */
  if (!navigator.userActivation?.hasBeenActive) {
    const ctVibra = sentidos.vibra;
    sentidos.vibra = false;
    const ctLibera = () => ((sentidos.vibra = ctVibra), removeEventListener('pointerdown', ctLibera, true), removeEventListener('keydown', ctLibera, true));
    addEventListener('pointerdown', ctLibera, true);
    addEventListener('keydown', ctLibera, true);
  }
  for (const n of Object.values(CT_NOMES)) DESTINO[n] = 'cartoes';
  const ctPortas = () => CT.nav !== 'atual'; /* as portas propostas valem nas três variantes */
  const ctRotaDoTrilho = (nome) => ({ jogo: 'jogar', partida: 'jogar', aovivo: 'capturar', interpretando: 'interprete', estudo: 'cartoes', sessao: 'biblioteca' })[nome] || nome;

  function ctPintarTrilho() {
    const nav = CT_NAV[CT.nav];
    html.dataset.ctNav = CT.nav;
    nav.itens.forEach((r, i) => {
      const [rot, icone] = ctDestino(r);
      const b = itens[i];
      b.dataset.ctRota = r;
      /* Na decidida, o mesmo item é "Cartões" no trilho do computador e "Praticar" na barra do celular. */
      b.innerHTML = CT.nav === 'd' && r === 'cartoes' ? `${icone}<span class="ct-rot-pc">${rot}</span><span class="ct-rot-cel">Praticar</span>${ctSelo()}` : `${icone}<span>${rot}</span>${r === 'cartoes' || r === 'praticar' ? ctSelo() : ''}`;
    });
  }
  /* O número do dia no item do trilho: vencidas, novas e aprendendo de hoje. Some quando está em dia. */
  function ctSelo() {
    if (CT.hoje === 'vazio' || CT.hoje === 'feito') return '';
    const n = CT.hoje === 'primeiro' ? 10 : CT.hoje === 'pilha' ? CT.tetoDaPilha : 26;
    return `<i class="q-contagem ct-selo-do-dia" aria-label="${n} cartões para hoje">${n}</i>`;
  }
  marcarTrilho = function (nome) {
    const antes = $('.q-item[aria-current="page"]', trilho);
    itens.forEach((b) => b.removeAttribute('aria-current'));
    const nav = CT_NAV[CT.nav];
    const rota = ctRotaDoTrilho(nome);
    let i = nav.itens.indexOf(rota);
    if (i < 0 && nav.itens.includes('praticar') && ['cartoes', 'jogar'].includes(rota)) i = nav.itens.indexOf('praticar');
    if (CT.nav === 'd' && celular() && polido() && rota === 'jogar') i = nav.itens.indexOf('cartoes');
    const some = i < 0 || (celular() && polido() && !nav.cel.includes(nav.itens[i]));
    const alvo = some ? maisBtn : itens[i];
    alvo?.setAttribute('aria-current', 'page');
    porPilula(trilho);
    if (alvo && alvo !== antes && polido() && !reduz()) anima($('svg', alvo), [{ transform: 'scale(0.6) rotate(-14deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 620, e: MOLA });
  };
  trilho.addEventListener(
    'click',
    (e) => {
      const item = e.target.closest('.q-item');
      if (!item || item === maisBtn || item.classList.contains('q-busca-botao')) return;
      e.stopPropagation();
      const r = item.dataset.ctRota;
      if (r === 'cartoes') abaDe.cartoes = 0;
      ir(r === 'praticar' || (CT.nav === 'd' && r === 'cartoes' && celular() && polido()) ? CT.praticar || 'cartoes' : r);
    },
    true,
  );

  /* B: "Praticar" é um destino só, com duas abas. Elas aparecem no alto das duas telas. */
  /* Na decidida o seletor só existe no celular (no computador, Cartões e Jogar são dois itens do trilho)
     e mora na linha do título, sem ícone nem contagem, para caber. */
  function ctSegPraticar(qual) {
    if (CT.nav !== 'b' && CT.nav !== 'd') return '';
    const d = CT.nav === 'd';
    return `<div class="q-abas ct-praticar ${d ? 'ct-so-celular' : ''}" role="tablist" aria-label="Praticar">${[['cartoes', 'layers', ctNome(), CT.hoje === 'feito' || CT.hoje === 'vazio' ? '' : 26], ['jogar', 'gamepad-2', 'Jogos', 18]].map(([k, i, r, n]) => `<button type="button" role="tab" class="q-aba" aria-selected="${qual === k}" data-ct-praticar="${k}">${d ? '' : ica(i)}${r}${n && !d ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  }

  /* ---- O painel Mais, conforme a variante ---------------------------------------- */
  function ctArrumarMais(painel) {
    const grade = $('.q-grade[role="tabpanel"]', painel);
    if (!grade) return;
    const nav = CT_NAV[CT.nav];
    const lista = [...(celular() && polido() ? nav.maisCel : []), ...nav.mais];
    const n = ctHojeN();
    const sub = { cartoes: CT.hoje === 'feito' ? 'Tudo em dia' : CT.hoje === 'vazio' ? 'Nenhum cartão ainda' : `${n[0] + n[1] + Math.min(n[2], CT.hoje === 'pilha' ? CT.tetoDaPilha : n[2])} para hoje`, tutor: 'Antes “iChat”', vocabulario: ctPortas() ? '' : 'A revisão mora aqui dentro' };
    grade.replaceChildren(
      ...lista.map((r) => {
        const [rot, icone] = ctDestino(r);
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'q-tile em-linha';
        t.dataset.ctMais = r;
        t.innerHTML = `<span class="q-ic">${icone}</span>${sub[r] ? `<span><b>${rot}</b><small class="q-d">${sub[r]}</small></span>` : `<b>${rot}</b>`}`;
        const meu = { cartoes: () => ((abaDe.cartoes = 0), ir('cartoes')), vocabulario: () => ((abaDe.cartoes = 2), ir('cartoes')), interprete: () => ir('interprete'), tutor: () => toast('Tutor (antes “iChat · Context”): no app, abre a conversa sobre o seu material. Não foi clonado neste protótipo.'), perfil: () => toast('Seu perfil não foi clonado neste protótipo.') }[r];
        if (meu)
          t.addEventListener('click', (e) => {
            e.stopPropagation();
            fecharFolha({ semFoco: true });
            meu();
          });
        return t;
      }),
    );
    if (ctPortas() && !$('.ct-idioma-da-interface', painel)) {
      const buscar = $$('.q-cab .q-ctl', painel).find((b) => /^Buscar/.test(txt(b)));
      /* no celular o cabeçalho do painel não tem lugar: o idioma vai para a fileira do tema e do som */
      if (celular()) $('.q-faixa-do-mais', painel)?.insertAdjacentHTML('afterbegin', `<button type="button" class="q-ctl ct-idioma-da-interface">${ica('globe')} Idioma: Português</button>`);
      else buscar?.insertAdjacentHTML('beforebegin', `<button type="button" class="q-chip ct-idioma-da-interface" title="Idioma da interface. Antes: Mais › Ajustes › seletor">${ica('globe')} Português</button>`);
      $('.ct-idioma-da-interface', painel)?.addEventListener('click', (e) => (e.stopPropagation(), toast('No app, troca o idioma da interface aqui. Antes ficava a três toques, em Ajustes.')));
    }
  }
  aoAbrirFolha.push((tipo, painel) => tipo === 'mais' && ctArrumarMais(painel));

  /* ---- O Início: o ladrilho da revisão é fixo ------------------------------------- */
  function ctLadrilhoDoInicio() {
    const geral = ctN(ctBaralho('tudo'));
    const totalGeral = geral[0] + geral[1] + geral[2];
    const n = CT.hoje === 'normal' ? fsHojeN() : geral;
    const total = n[0] + n[1] + n[2];
    const quem = `${fsNome()}${fsLingua() ? ` em ${fsLingua().toLowerCase()}` : ''}`;
    const recorte = total !== totalGeral ? `${quem}: ` : '';
    const [b, d] = {
      normal: [`${ctNome() === 'Estudar' ? 'Estudar' : ctNome()}: ${total} para hoje`, `${recorte}${n[2]} a rever, ${n[1]} aprendendo e ${n[0]} novas.${total !== totalGeral ? ` No total, ${totalGeral}.` : ` ${ctMin(total).replace('uns', 'Uns')}.`}`],
      vazio: [ctNome(), 'Guarde palavras e o app traz cada uma de volta na hora certa.'],
      primeiro: [`${ctNome()}: comece por 10`, 'Suas 34 palavras das sessões já são cartões.'],
      feito: [`${ctNome()}: tudo em dia`, 'A próxima revisão abre amanhã com 8.'],
      pilha: [`${ctNome()}: ${CT.tetoDaPilha} hoje`, `${num(n[2])} esperando, sem pressa. O resto fica para depois.`],
    }[CT.hoje];
    return `<button type="button" class="q-tile ct-ladrilho" data-ct-inicio="cartoes" data-ct-alvo="ladrilho"><span class="q-ic">${ica('layers')}</span><b>${b}</b><span class="q-d">${d}</span></button>`;
  }
  const ctInicioAntes = aoMostrar.inicio;
  aoMostrar.inicio = () => {
    ctInicioAntes?.();
    const grade = $('.q-grade.q-cresce', tela);
    if (!grade || $('.ct-ladrilho', grade)) return;
    grade.classList.add('ct-g4');
    grade.firstElementChild.insertAdjacentHTML('afterend', ctLadrilhoDoInicio());
    const chip = $('[data-testid="progresso-no-inicio"] .q-chip', tela);
    if (chip && ctPortas()) (chip.classList.add('ct-chip-porta'), (chip.title = 'Abre a Temporada'));
  };

  /* ---- Portas plantadas nas telas que já existem ----------------------------------- */
  const ctAchaBotao = (sel, re) => $$(sel, tela).find((b) => re.test(txt(b)));
  function ctDepoisDeTrocar() {
    const nome = atual;
    if ((CT.nav === 'b' || CT.nav === 'd') && nome === 'jogar' && !$('.ct-praticar', tela)) {
      $('.q-palco', tela)?.insertAdjacentHTML('afterbegin', ctSegPraticar('jogar'));
      const g = $('.ct-praticar', tela);
      if (g) porPilula(g);
    }
    /* A, no celular: o Intérprete sai da barra de cinco e vira o seletor "Legenda | Conversa" no alto do Capturar. */
    if (nome === 'aovivo' && CT.nav === 'a' && celular() && polido() && !$('.ct-legenda-ou-conversa', tela)) {
      $('.px-vivo', tela)?.insertAdjacentHTML('afterbegin', `<div class="q-abas q-seg ct-legenda-ou-conversa" role="group" aria-label="Legenda ou conversa" data-ct-alvo="legenda-ou-conversa"><button type="button" class="q-aba" aria-pressed="true" data-ct-porta="legenda-fica">${ica('captions')} Legenda</button><button type="button" class="q-aba" aria-pressed="false" data-ct-porta="conversa-ir">${ica('languages')} Conversa</button></div>`);
      const g = $('.ct-legenda-ou-conversa', tela);
      if (g) porPilula(g);
    }
    if (nome === 'biblioteca') {
      const rev = ctAchaBotao('.q-bib-det .q-ctl', /^Revisar palavras/);
      if (rev) rev.dataset.ctPorta = 'revisar-sessao';
      if (ctPortas()) {
        const imp = ctAchaBotao('.q-cab .q-chip', /Importar/);
        if (imp) (imp.dataset.ctPorta = 'importar'), imp.setAttribute('data-ct-alvo', 'importar');
        const exp = ctAchaBotao('.q-bib-det .q-ctl', /^Exportar transcrição/);
        if (exp) (exp.dataset.ctPorta = 'exportar'), (exp.lastChild.nodeValue = ' Exportar');
      }
    }
    if (nome === 'sessao' && ctPortas()) {
      const exp = ctAchaBotao('.q-cab .q-ctl', /^Exportar/);
      if (exp) exp.dataset.ctPorta = 'exportar';
      const notas = ctAchaBotao('.ql-barra .q-chip', /^Estudos/);
      if (notas) (notas.dataset.ctPorta = 'anotacoes'), (notas.innerHTML = `${ica('notebook-pen')} Minhas anotações <span class="qs-n">3</span>`), notas.setAttribute('data-ct-alvo', 'anotacoes');
      const pal = ctAchaBotao('.qs-barra .q-chip', /^Palavras desta sessão/);
      if (pal) pal.dataset.ctPorta = 'palavras-da-sessao';
    }
    if (nome === 'interpretando' && ctPortas()) {
      /* os dois rótulos que não diziam o que eram: "Virtual" e "Conversa" */
      const v = $('.int-modo[data-px="virtual"]', tela);
      if (v && !v.dataset.ctAlvo) {
        v.dataset.ctAlvo = 'conversa';
        v.setAttribute('aria-label', 'Conversa por chamada: traduzir uma ligação');
        v.innerHTML = `${ica('phone')}<span class="int-modo-txt" aria-hidden="true">Por chamada</span>`;
      }
      const h = $('.int-modo[data-px="lista"] .int-modo-txt', tela);
      if (h) h.textContent = 'Histórico';
    }
    if (nome === 'interprete' && ctPortas()) {
      const b = ctAchaBotao('button', /^Conversa virtual/);
      if (b) {
        b.dataset.ctPorta = 'conversa';
        b.setAttribute('data-ct-alvo', 'conversa');
        const no = [...b.childNodes].find((x) => x.nodeType === 3 && /Conversa virtual/.test(x.nodeValue));
        if (no) no.nodeValue = no.nodeValue.replace('Conversa virtual', 'Conversa por chamada');
        else b.innerHTML = b.innerHTML.replace('Conversa virtual', 'Conversa por chamada');
      }
    }
    if (nome === 'ajuda' && ctPortas() && !$('.ct-ajuda-recursos', tela)) {
      const ver = ctAchaBotao('.q-inst-atalhos .q-ctl', /^Ver todos/);
      if (ver) (ver.dataset.ctPorta = 'atalhos'), (ver.innerHTML = `Ver todos ${ctTecla('?')}`);
      $('.q-inst-par', tela)?.insertAdjacentHTML(
        'beforebegin',
        `<section class="q-secao ct-ajuda-recursos" data-ct-alvo="ajuda-recursos"><header><div><h2>Recursos que vale conhecer</h2><p>Coisas que o app já faz e que ficavam difíceis de achar.</p></div></header><div class="q-grade g4">${[
          ['sparkles', 'Outras formas de dizer', 'Toque numa fala e veja o jeito formal e o informal (Nuance).', 'nuance'],
          ['phone', 'Conversa por chamada', 'O intérprete numa ligação: cada um no seu aparelho.', 'conversa-ir'],
          ['picture-in-picture-2', 'Legendas flutuantes', 'Uma janelinha por cima de qualquer aplicativo.', 'flutuante'],
          ['cpu', 'Diagnóstico do aparelho', 'O que este aparelho roda bem e o que precisa da nuvem.', 'diagnostico'],
        ]
          .map(([i, t, d, k]) => `<button type="button" class="q-tile" data-ct-porta="${k}"><span class="q-ic">${ica(i)}</span><b>${t}</b><span class="q-d">${d}</span></button>`)
          .join('')}</div></section>`,
      );
    }
  }
  /* Tudo que repinta uma tela passa por aqui: as portas são replantadas. */
  const ctDepois = (f) =>
    function (...a) {
      const r = f.apply(this, a);
      ctDepoisDeTrocar();
      return r;
    };
  trocar = ctDepois(trocar);
  repintar = ctDepois(repintar);
  redesenharBib = ctDepois(redesenharBib);
  alternarEstado = ctDepois(alternarEstado);
  function ctNavDepois() {
    /* chamado pelas telas novas depois de pintar: só para manter o selo do trilho em dia */
    $$('.ct-selo-do-dia', trilho).forEach((x) => x.remove());
    itens.forEach((b) => ['cartoes', 'praticar'].includes(b.dataset.ctRota) && b.insertAdjacentHTML('beforeend', ctSelo()));
  }
  /* Nuance: a primeira fala traduzida de uma captura ganha a dica, uma vez. */
  let ctDicaDaNuance = false;
  espelharFlutuante = com(espelharFlutuante, (orig, trad, id) => {
    if (!trad || id !== 0 || ctDicaDaNuance || !ctPortas() || atual !== 'aovivo') return;
    ctDicaDaNuance = true;
    const linha = $('[data-fala="0"]', tela);
    linha?.insertAdjacentHTML('afterend', `<div class="q-aviso ct-dica-nuance" data-ct-alvo="nuance"><span class="qv-aviso-texto">${ica('sparkles')}<span><b>Toque numa fala.</b> Dá para ouvir de novo, guardar palavras como cartão e ver outras formas de dizer.</span></span><button type="button" class="q-ctl" data-ct-porta="fechar-dica">Entendi</button></div>`);
    const d = $('.ct-dica-nuance', tela);
    if (d && polido() && !reduz()) anima(d, [{ opacity: 0, transform: 'translateY(14px) scale(0.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 520, e: MOLA_SUAVE });
  });

  /* ---- Importar único e Atalhos ---------------------------------------------------- */
  function ctAbrirImportar(gatilho) {
    ctAbrir(
      'ct:importar',
      ctDlg('plus', 'Importar', 'Tudo o que entra no app, num lugar só: gravações, textos e cartões.', `<div class="q-grade g2 ct-formatos">${[
        ['link', 'Link', 'YouTube, podcast ou uma página da web.', 'link'],
        ['file-text', 'Arquivo', 'Áudio, vídeo, documento ou legenda.', 'arquivo'],
        ['type', 'Texto colado', 'Um artigo, uma letra de música, um diálogo.', 'texto'],
        ['wallet-cards', 'Baralho do Anki', 'Com a agenda e o histórico. Você vê o ensaio antes de gravar.', 'anki'],
        ['clipboard', 'Lista de palavras', 'Uma por linha, com ou sem tradução.', 'lista'],
      ]
        .map(([i, t, d, k]) => `<button type="button" class="q-tile em-linha" data-ct-fonte="${k}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b><small class="q-d">${d}</small></span></button>`)
        .join('')}</div>`, `<button type="button" class="q-ctl">Fechar</button>`, 'ct-importar'),
      gatilho,
      (b, d) => {
        const k = b.dataset.ctFonte;
        if (!k) return;
        if (k === 'anki') return ctAbrirAnki(1, gatilho);
        if (k === 'lista') return ctAbrirLista(gatilho);
        toast(`${txt($('b', b))}: no app, abre o importador desta fonte. Não clonado neste protótipo.`);
      },
    );
  }
  const CT_ATALHOS = [
    ['Em qualquer tela', [['Buscar gravação, palavra, baralho ou ação', ['Ctrl', 'K']], ['Esta lista de atalhos', ['?']], ['Fechar painel ou diálogo', ['Esc']]]],
    ['Revisão', [['Mostrar a resposta; depois, “Bom”', ['Espaço']], ['Responder', ['1', 'a', '4']], ['Desfazer a última resposta', ['Z']], ['Ouvir a fala original', ['R']], ['Ouvir a voz do aparelho', ['V']], ['Outra frase da mesma palavra', ['N']], ['Bandeira', ['B']], ['Editar o cartão', ['E']], ['Enterrar até amanhã', ['-']], ['Suspender', ['S']], ['Informações do cartão', ['I']]]],
    ['Intérprete', [['Falar do meu lado, do lado do outro', ['1', '2']], ['Repetir a última tradução', ['R']], ['Pausar', ['P']]]],
    ['Captura e leitura', [['Pausar as legendas flutuantes', ['Espaço']], ['Desenho livre: desfazer', ['Ctrl', 'Z']]]],
    ['No celular, na revisão', [['Tocar no cartão', ['mostra a resposta']], ['Deslizar para a direita ou para a esquerda', ['Bom', 'Errei']], ['Segurar o cartão', ['abre as ações']]]],
  ];
  function ctAbrirAtalhos(gatilho, qual) {
    $$('dialog.ct-atalhos').forEach((x) => (x.close(), x.remove()));
    const grupos = qual === 'revisao' ? [CT_ATALHOS[1], CT_ATALHOS[4], CT_ATALHOS[0]] : CT_ATALHOS;
    ctAbrir(
      'ct:atalhos',
      ctDlg('keyboard', 'Atalhos e gestos', 'A lista inteira, por tela. A tecla <kbd>?</kbd> abre isto em qualquer lugar.', `<div class="q-inst ct-atalhos-corpo">${grupos.map(([t, l]) => `<section class="q-cartao q-inst-atalhos"><h3>${t}</h3><div>${l.map(([r, ks]) => `<div class="entre atalho"><span>${r}</span><span>${ks.map((k) => (k === 'a' ? '<span class="mut">a</span>' : `<kbd>${k}</kbd>`)).join(' ')}</span></div>`).join('')}</div></section>`).join('')}</div>`, `<button type="button" class="q-ctl pri">${ica('check')} Fechar</button>`, 'ct-atalhos'),
      gatilho,
    );
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.target.matches?.('input, textarea, select')) return;
    if ($('dialog.ct-atalhos')) return;
    if ($('dialog[open]') || folha) return;
    e.preventDefault();
    ctAbrirAtalhos(null, atual === 'estudo' ? 'revisao' : '');
  });

  /* ---- Busca (Ctrl K): acha palavra, baralho, ação e as telas que ficavam de fora ---- */
  aoAbrirBusca.push((d) => {
    const lista = $('.cmd-lista', d);
    if (!lista) return;
    const item = (icone, titulo, meta, fn, soBusca = true) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmd-item';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      b.dataset.ctCmd = '1';
      if (soBusca) (b.dataset.ctSoBusca = '1'), (b.hidden = true);
      b.innerHTML = `<span class="cmd-ico">${ica(icone)}</span><span class="cmd-t">${titulo}</span>${meta ? `<span class="cmd-meta">${meta}</span>` : ''}`;
      b._ct = fn;
      return b;
    };
    const grupo = (t) => {
      const g = document.createElement('div');
      g.className = 'cmd-grupo';
      g.setAttribute('role', 'presentation');
      g.dataset.ctSoBusca = '1';
      g.hidden = true;
      g.textContent = t;
      return g;
    };
    const n = ctHojeN();
    const total = n[0] + n[1] + n[2];
    /* Sugestão fixa: o que há para estudar agora (em qualquer variante: é a porta que faltava). */
    if (CT.hoje !== 'vazio' && CT.hoje !== 'feito') $('.cmd-item', lista)?.after(item('target', 'Estudar agora', `${Math.min(total, CT.hoje === 'pilha' ? CT.tetoDaPilha : total)} cartões · ${ctMin(Math.min(total, 40))}`, () => ctEstudar({ baralho: 'tudo', n: CT.hoje === 'pilha' ? CT.tetoDaPilha : 0 }), false));
    const ultimoIrPara = $$('.cmd-item', lista).pop();
    ultimoIrPara?.after(item('layers', ctNome(), 'hoje, baralhos, palavras', () => ((abaDe.cartoes = 0), ir('cartoes')), false));
    if (!ctPortas()) return;
    lista.append(
      grupo('Palavras'),
      ...['dashboard', 'thorough', 'commute', 'put-off', 'madrugar', 'roadmap', 'though', 'release', 'aunque', 'layout'].map((id) => {
        const c = ctCarta(id);
        return item('book-open', c.p, `${c.t} · ${ctNomeDoBaralho(c.b)}`, () => ctAbrirPalavra(id));
      }),
      grupo('Baralhos'),
      ...CT_BARALHOS.filter((b) => b.g !== 'tudo').map((b) => item(b.i, b.nome, `${num(b.total)} cartões`, () => ((CT.baralho = b.id), ctIrAba(1)))),
      grupo('Ações'),
      item('triangle-alert', 'Estudar as difíceis', '2 para hoje', () => ctEstudar({ baralho: 'dificeis' })),
      item('upload', 'Trazer um baralho do Anki', 'com a agenda e o histórico', () => ctAbrirAnki(1)),
      item('arrow-left-right', 'Trazer e levar', 'palavra nova, lista, Anki, exportar', () => ctAbrirTrazerELevar()),
      item('plus', 'Importar', 'link, arquivo, texto, Anki', () => ctAbrirImportar()),
      item('download', 'Exportar', 'transcrição, palavras, relatório', () => ctAbrirExportar()),
      item('picture-in-picture-2', 'Abrir legendas flutuantes', 'a janelinha por cima de tudo', () => abrirFlutuante()),
      item('phone', 'Conversa por chamada', 'intérprete numa ligação', () => (ir('interprete'), setTimeout(() => $('[data-px="virtual"], [data-ct-porta="conversa"]', tela)?.click(), 1200 * K()))),
      item('keyboard', 'Atalhos de teclado', 'a lista inteira', () => ctAbrirAtalhos()),
      item('sliders-horizontal', 'Ajustes da memória', 'retenção, novas por dia, botões', () => ctAbrirAjustes()),
      item('notebook-pen', 'Minhas anotações', 'antes “Estudos & notas”', () => ctAbrirAnotacoes()),
      item('sun', 'Trocar o tema', 'claro ou escuro', () => alternarTema()),
      item('gauge', 'Modo desempenho', 'liga ou desliga os efeitos', () => modo(polido() ? 'off' : 'on')),
      grupo('Mais telas'),
      item('life-buoy', 'Ajuda e suporte', '', () => ir('ajuda')),
      item('cpu', 'Diagnóstico do aparelho', 'antes só pelo endereço', () => toast('Diagnóstico do aparelho: no app, abre a tela que hoje só existe pelo endereço /diagnostico.')),
      item('star', 'Temporada', 'Personalizar', () => mostrar('personalizar', { aba: 2, origem: 'clique' })),
      item('shopping-bag', 'Loja', 'Personalizar', () => mostrar('personalizar', { aba: 4, origem: 'clique' })),
      item('chart-column', `${ctNomeDaAba(4)} dos cartões`, 'retenção, previsão, calendário', () => ctIrAba(4)),
    );
  });
  /* O clique e o Enter dos itens novos. O filtro por texto é o da própria busca. */
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('.paleta-cmd .cmd-item[data-ct-cmd]');
      if (!b) return;
      e.stopPropagation();
      fecharBusca();
      setTimeout(b._ct, 40);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      const d = $('.paleta-cmd');
      if (!d || e.key !== 'Enter') return;
      const b = $('.cmd-item.foco[data-ct-cmd]', d);
      if (!b || b.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      fecharBusca();
      setTimeout(b._ct, 40);
    },
    true,
  );
  document.addEventListener('input', (e) => {
    const d = e.target.closest?.('.paleta-cmd');
    if (!d || e.target.value.trim()) return;
    $$('[data-ct-so-busca]', d).forEach((x) => (x.hidden = true));
  });

  /* ---- Cliques das portas ------------------------------------------------------------ */
  ganchos.unshift((e, b) => {
    const d = b.dataset;
    if (d.ctPraticar) return (CT.praticar = d.ctPraticar), d.ctPraticar !== atual && ir(d.ctPraticar), true;
    if (d.ctInicio) return (abaDe.cartoes = 0), ir('cartoes'), true;
    if (atual === 'inicio' && ctPortas() && e.target.closest?.('[data-testid="progresso-no-inicio"] .q-chip')) return mostrar('personalizar', { aba: 2, origem: 'clique' }), true;
    switch (d.ctPorta) {
      case 'importar':
        return ctAbrirImportar(b), true;
      case 'exportar':
        return ctAbrirExportar(b, { aba: 'transcricao', de: (filtradas()[bib.sel] || GRAVACOES[0]).t }), true;
      case 'anotacoes':
        return ctAbrirAnotacoes(b), true;
      case 'atalhos':
        return ctAbrirAtalhos(b), true;
      case 'revisar-sessao':
      case 'palavras-da-sessao': {
        const g = filtradas()[bib.sel] || GRAVACOES[0];
        const bar = CT_BARALHOS.find((x) => x.nome === g.t);
        if (!bar) return toast('Esta gravação ainda não tem palavras guardadas.'), true;
        if (d.ctPorta === 'revisar-sessao') return ctEstudar({ baralho: bar.id }), true;
        return Object.assign(CT.f, { estado: 'todos', baralho: bar.id, idioma: '', etiqueta: '', busca: '', abertos: true }), ctIrAba(2), true;
      }
      case 'conversa':
        return alternarEstado('interprete:Conversa virtual'), true;
      case 'conversa-ir':
        return ir('interprete'), true;
      case 'legenda-fica':
        return true;
      case 'flutuante':
        return abrirFlutuante(), true;
      case 'nuance':
        return ir('aovivo'), toast('Inicie a captura: a dica aparece na primeira fala traduzida.'), true;
      case 'diagnostico':
        return toast('Diagnóstico do aparelho: no app, abre a tela que hoje só existe pelo endereço /diagnostico.'), true;
      case 'fechar-dica':
        return b.closest('.ct-dica-nuance')?.remove(), true;
    }
    return false;
  });

  /* ==========================================================================
     Barra do protótipo: Navegação, Nome, estado do Hoje, Sem rede e o Mapa das portas
     ========================================================================== */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="px-barra ad-barra ct-barra" role="toolbar" aria-label="Controles dos cartões">
      <button type="button" data-ct-b="mapa" class="ad-barra-mapa ct-barra-mapa" aria-pressed="false" title="Cada tela e estado da versão enxuta, o que mudou e um atalho até lá">Mapa das portas</button>
      <span class="px-sep"></span>
      <label class="ct-barra-ir" title="Pula direto para uma tela, um estado ou uma folha"><span class="ad-barra-t">Ir para</span><select data-ct-ir aria-label="Ir direto para uma tela, um estado ou uma folha"><option value="">escolha…</option></select></label>
      <span class="ad-barra-t">Dia</span>
      <div class="px-seg" title="O estado do dia na aba Hoje"><i></i>${[['normal', 'Normal', 'Há o que estudar'], ['vazio', 'Vazio', 'Primeiro uso, sem nenhum cartão'], ['primeiro', 'Primeiras', 'Primeiro uso, com palavras das sessões'], ['feito', 'Cumprido', 'Tudo estudado por hoje'], ['pilha', 'Pilha', 'Voltou depois de dias sem estudar']].map(([k, r, t]) => `<button type="button" data-ct-hoje="${k}" aria-pressed="false" title="${t}">${r}</button>`).join('')}</div>
      <span class="ad-barra-t">Hoje</span>
      <div class="px-seg" title="Sequência, retenção e novas do dia: numa faixa de uma linha (enxuta) ou nos três cartões de antes"><i></i><button type="button" data-ct-resumo="faixa" aria-pressed="false">Faixa</button><button type="button" data-ct-resumo="tres" aria-pressed="false">Três cartões</button></div>
      <button type="button" data-ct-b="offline" aria-pressed="false" title="Sem internet: a revisão avisa que as notas ficaram guardadas no aparelho">Sem rede</button>
      <span class="px-sep"></span>
      <button type="button" data-ct-b="outras" aria-pressed="false" title="Mostra as barras de planos e de anúncios do protótipo de origem">Planos e anúncios</button>
    </div>
    <div class="ad-mapa-fundo ct-mapa-fundo"></div>
    <aside class="ad-mapa ct-mapa" aria-label="Mapa das portas" tabindex="-1"></aside>`,
  );
  const barraCt = $('.ct-barra');
  const mapaCt = $('.ct-mapa');
  function sincronizarBarraCt() {
    $$('[data-ct-nav]', barraCt).forEach((b) => b.setAttribute('aria-pressed', b.dataset.ctNav === CT.nav));
    $$('[data-ct-nome]', barraCt).forEach((b) => b.setAttribute('aria-pressed', b.dataset.ctNome === CT.nome));
    $$('[data-ct-hoje]', barraCt).forEach((b) => b.setAttribute('aria-pressed', b.dataset.ctHoje === CT.hoje));
    $$('[data-ct-resumo]', barraCt).forEach((b) => b.setAttribute('aria-pressed', b.dataset.ctResumo === CT.resumo));
    $('[data-ct-b="offline"]', barraCt).setAttribute('aria-pressed', PL.offline);
    $('[data-ct-b="outras"]', barraCt).setAttribute('aria-pressed', document.body.classList.contains('ct-ver-outras'));
    $$('.px-seg [aria-pressed="true"]', barraCt).forEach((b) => b.offsetWidth && marcarSeg(b));
    html.dataset.ctNav = CT.nav;
  }
  const ctEstadoParaQuadros = () => ({ nav: CT.nav, nome: CT.nome, hoje: CT.hoje, resumo: CT.resumo });
  /* Qualquer mudança da barra passa por aqui: repinta o trilho e a tela em que a pessoa está. */
  function aplicarCt(o = {}) {
    ctPintarTrilho();
    sincronizarBarraCt();
    if (document.body.classList.contains('ct-mapa-aberto')) mapaCt.innerHTML = ctHtmlDoMapa();
    if (!EMBUTIDO) paraOsQuadros({ pxCt: ctEstadoParaQuadros() });
    if (o.semRedesenho || !atual) return;
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    if (folha) fecharFolha({ seco: true, semFoco: true });
    if (atual === 'estudo') return ctR ? ctPintarRodada('seco') : mostrarSemAds('cartoes', { origem: 'seco' });
    mostrarSemAds(atual, { origem: 'seco' });
  }
  barraCt.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.ctB === 'mapa') return ctAbrirMapa(!document.body.classList.contains('ct-mapa-aberto'));
    if (d.ctB === 'outras') {
      document.body.classList.toggle('ct-ver-outras');
      sincronizarBarraCt();
      sincronizarBarraPl();
      return sincronizarBarra();
    }
    if (d.ctB === 'offline') {
      PL.offline = !PL.offline;
      toast(PL.offline ? 'Sem rede: na revisão, as notas ficam guardadas no aparelho e a tela avisa.' : 'Rede de volta.');
      sincronizarBarraPl();
      if (!EMBUTIDO) paraOsQuadros({ pxAds: estadoParaQuadros() });
      return aplicarCt();
    }
    if (d.ctNav) {
      CT.nav = d.ctNav;
      toast({ atual: 'Atual: como está hoje. A revisão só aparece em Mais › Vocabulário.', d: 'Decidida: no computador, Biblioteca, Cartões e Jogar no trilho; no celular, Início, Praticar, Capturar, Intérprete e Mais.', a: 'A: Biblioteca e Cartões no trilho; Estatísticas e Personalizar descem para o Mais.', b: 'B: “Praticar” é um destino só, com duas abas: Cartões e Jogos.', c: 'C (mínima): o trilho não muda; Cartões toma o lugar de Vocabulário no Mais.' }[CT.nav], 4600);
    } else if (d.ctNome) CT.nome = d.ctNome;
    else if (d.ctResumo) {
      CT.resumo = d.ctResumo;
      if (atual !== 'cartoes' || (abaDe.cartoes || 0) !== 0) return aplicarCt({ semRedesenho: true }), (abaDe.cartoes = 0), void mostrarSemAds('cartoes', { origem: 'clique' });
    } else if (d.ctHoje) {
      CT.hoje = d.ctHoje;
      if (ctR) ctR = null;
      if (atual !== 'cartoes' && atual !== 'inicio') return aplicarCt({ semRedesenho: true }), (abaDe.cartoes = 0), void mostrarSemAds('cartoes', { origem: 'clique' });
    } else return;
    aplicarCt();
  });
  barraCt.addEventListener('change', (e) => e.target.dataset.ctIr != null && e.target.value && ctVerPorta(e.target.value));
  addEventListener('message', (e) => {
    const s = e.data?.pxCt;
    if (!s || !EMBUTIDO || e.source !== parent) return;
    const antes = JSON.stringify(ctEstadoParaQuadros());
    if (CT_NAV[s.nav]) CT.nav = s.nav;
    if (CT_NOMES[s.nome]) CT.nome = s.nome;
    if (CT_HOJES.includes(s.hoje)) CT.hoje = s.hoje;
    if (['faixa', 'tres'].includes(s.resumo)) CT.resumo = s.resumo;
    if (JSON.stringify(ctEstadoParaQuadros()) !== antes) aplicarCt();
  });
  /* As molduras de aparelho nascem depois: recebem o estado quando terminam de carregar. */
  const ctVerAparelhoDepois = () => quadros().forEach((f) => f.addEventListener('load', () => f.contentWindow?.postMessage({ pxCt: ctEstadoParaQuadros() }, ORIGEM_DOS_QUADROS)));
  barra.addEventListener('click', (e) => e.target.closest('[data-px-ap]') && ctVerAparelhoDepois());
  addEventListener('resize', () => requestAnimationFrame(sincronizarBarraCt));
  document.fonts?.ready.then(sincronizarBarraCt);

  /* ==========================================================================
     Mapa das portas
     ========================================================================== */
  const ctIrPara = (nome, o = {}) => mostrarSemAds(nome, { origem: 'clique', ...o });
  const ctDaqui = (f, ms = 1300) => setTimeout(f, ms * K());
  const ctAbaDosCartoes = (i) => ((abaDe.cartoes = i), ctIrPara('cartoes'));
  function ctRevisaoPronta(o = {}) {
    Object.assign(CT_AJ, { formato: o.formato || 'lembrar', botoes: o.botoes || 4 });
    PL.offline = !!o.offline;
    CT_CARTOES.forEach((c) => (c.band = false));
    ctEstudar({ baralho: 'tudo', origem: 'clique', ...(o.ids ? { ids: o.ids, rotulo: 'Hoje · tudo' } : {}) });
    if (!ctR) return;
    if (o.ids) (ctR.total = 26), (ctR.feitos = o.feitos ?? 6), (ctR.inteiro = true);
    if (o.mostrar) (ctR.mostrando = true);
    if (o.seguidas) ctR.seguidas = o.seguidas;
    if (o.pend) ctR.pend = o.pend;
    if (o.hist) ctR.hist.push(ctFoto());
    if (o.aviso) (ctR.aviso = o.aviso), (ctCarta(o.aviso).lapsos = 8);
    if (o.tentativa != null) Object.assign(ctR, { tentativa: o.tentativa, verificado: true, certo: !!o.certo });
    ctDaqui(() => atual === 'estudo' && ctPintarRodada('seco'), 500);
  }
  function ctFimPronto() {
    ctRevisaoPronta({});
    if (!ctR) return;
    Object.assign(ctR, { fila: [], feitos: 26, fim: true, notas: { e: 4, d: 3, b: 21, f: 2 }, erradas: ['thorough', 'though', 'deprive', 'madrugar'], melhor: 9, novas: 5, formadas: 3, seg: 348 });
    ctR.hist.push({ ...ctFoto0() });
    ctDaqui(() => atual === 'estudo' && ctPintarRodada('fim'), 500);
  }
  const ctFoto0 = () => ({ fila: ['aunque'], feitos: 25, erradas: ['thorough', 'though', 'deprive', 'madrugar'], seguidas: 3, melhor: 9, notas: { e: 4, d: 3, b: 20, f: 2 }, pend: 0, k: 0, novas: 5, formadas: 3, id: 'aunque', lapsos: 0, est: 'revisao', aviso: null });
  /* Para os itens do seletor de conteúdo: volta ao estado de fábrica (muito conteúdo, Tudo, Grátis). */
  function fsPronto(o = {}) {
    fxAplicarEstado(o.fx || 'cheio', { calado: true });
    FX.lang = o.lang || 'en';
    if (o.fonte) fxEscolher(o.fonte, { calado: true });
    Object.assign(conta, { plano: o.plano || 'gratis', teste: false });
    aplicarPlano({ semRedesenho: true });
    FS.perguntou = false;
  }
  const fsAbrirDaqui = (o) => ctDaqui(() => fxAbrirCatalogo($('[data-fs="abrir"]', tela), o));
  /* g = grupo; hoje = onde mora hoje e quantos toques; porta = a porta proposta; vai = como chegar aqui. */
  const ctListaDePortas = () => [
    { g: 'Conteúdo: um seletor só', id: 'ficha', nome: 'A ficha de conteúdo no cabeçalho (Jogar)', hoje: 'Cada tela tinha o seu jeito: um cartão grande no Jogar, uma aba só de baralhos nos Cartões, filtros na Biblioteca.', porta: 'Uma ficha (ícone, nome, seta) no mesmo lugar do cabeçalho de Jogar, Cartões e Biblioteca. O padrão é “Tudo”.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctIrPara('jogar')), alvo: '[data-fs-ficha]' },
    { g: 'Conteúdo: um seletor só', id: 'ficha-cartoes', nome: 'A mesma ficha nos Cartões, com uma sessão escolhida', hoje: 'Uma aba só de baralhos, e o “Idioma de estudo” dentro do “…”.', porta: 'A ficha fica acesa e ganha o “x” (volta para Tudo em um toque). Hoje e Palavras já vêm filtradas.', est: { hoje: 'normal' }, vai: () => (fsPronto({ fonte: 's-reuniao' }), ctAbaDosCartoes(0)), alvo: '[data-fs-ficha]' },
    { g: 'Conteúdo: um seletor só', id: 'ficha-biblioteca', nome: 'A mesma ficha na Biblioteca', hoje: 'Duas fileiras de filtro: tipo e idioma.', porta: 'O idioma vem da ficha; fica só o filtro de tipo. A sessão em uso tem a marca “em uso”; Revisar e Jogar da sessão definem o conteúdo e levam.', est: {}, vai: () => (fsPronto({ fonte: 's-reuniao' }), ctIrPara('biblioteca')), alvo: '[data-fs-ficha]' },
    { g: 'Conteúdo: um seletor só', id: 'catalogo', nome: 'O catálogo “Escolher o conteúdo”', hoje: '“Com o que você quer jogar?”, só no Jogar; nomes cortados, “pal.” e “fr.”.', porta: 'A mesma folha em toda tela: idioma no alto, Tudo, Difíceis, sessões, Anki e Trilha. Nome inteiro, contagem por extenso, uma ação por linha.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctIrPara('jogar'), fsAbrirDaqui()), alvo: '.fx-cat-lista' },
    { g: 'Conteúdo: um seletor só', id: 'painel', nome: 'O painel da fonte: Revisar, Praticar, Jogar', hoje: 'Um painel do baralho que só existia nos Cartões.', porta: 'No computador, ao lado da lista: três números, quantos jogos abrem, Usar, Revisar, Praticar, Jogar, Ver palavras, o “…” e a cobertura. No celular a linha inteira usa.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctAbaDosCartoes(0), fsAbrirDaqui({ sel: 's-reuniao' })), alvo: '[data-fx-alvo="painel"]' },
    { g: 'Conteúdo: um seletor só', id: 'idioma', nome: 'Dois idiomas: o idioma é o primeiro nível', hoje: 'Um seletor de idioma dentro do painel, que confundia “Tudo” com “Inglês”.', porta: 'A chave Inglês | Espanhol no alto do catálogo. “Tudo” passa a ser “Tudo em espanhol”.', est: { hoje: 'normal' }, vai: () => (fsPronto({ lang: 'es' }), ctIrPara('jogar'), fsAbrirDaqui()), alvo: '.fs-idiomas' },
    { g: 'Conteúdo: um seletor só', id: 'trazer-fonte', nome: '“Trazer uma fonte”, dentro do catálogo', hoje: 'Um “+” em cada cabeçalho.', porta: 'Última linha do catálogo: Anki, lista ou texto, vídeo ou PDF, captura. O que chega já vem escolhido.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctIrPara('jogar'), ctDaqui(() => fxAbrirTrazer($('[data-fs="abrir"]', tela)))) },
    { g: 'Conteúdo: um seletor só', id: 'jogar-gratis', nome: 'Jogar no Grátis: a faixa de anúncio', hoje: 'Cartão “Sugestão para hoje”.', porta: 'A sugestão saiu. No Grátis, uma faixa de anúncio com altura reservada; não aparece no perfil infantil, no Quest nem sem rede.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctIrPara('jogar')), alvo: '[data-fx-alvo="anuncio"]' },
    { g: 'Conteúdo: um seletor só', id: 'jogar-pago', nome: 'Jogar num plano pago: a grade sobe', hoje: 'Cartão “Sugestão para hoje”.', porta: 'Nada no lugar: título, ficha e a grade de jogos.', est: { hoje: 'normal' }, vai: () => (fsPronto({ plano: 'essencial' }), ctIrPara('jogar')), alvo: '.qj-ferramentas' },
    { g: 'Conteúdo: um seletor só', id: 'jogar-trilha', nome: 'Só a Trilha', hoje: 'Cartão da fonte com a Trilha.', porta: 'A ficha diz “Trilha · A1”; um aviso curto convida a trazer uma fonte.', est: {}, vai: () => (fsPronto({ fx: 'trilha' }), ctIrPara('jogar')), alvo: '[data-fx-alvo="aviso"]' },
    { g: 'Conteúdo: um seletor só', id: 'jogar-pequena', nome: 'Fonte pequena: os jogos dizem o que falta', hoje: 'Jogos sumiam ou ficavam presos sem motivo.', porta: 'Nenhum jogo some: os que não servem ficam à vista, com o motivo curto e a saída “Usar Tudo”.', est: { hoje: 'normal' }, vai: () => (fsPronto({ fx: 'pequena' }), ctIrPara('jogar')), alvo: '[data-fx-alvo="aviso"]' },
    { g: 'Conteúdo: um seletor só', id: 'pergunta', nome: 'Opção: a pergunta na entrada', hoje: 'Não existe.', porta: 'Desligada de fábrica (chave “Pergunta na entrada” da barra). Ao entrar em Jogar ou Cartões, uma vez por dia: “Com o que hoje?”. Não tocar vale “Tudo”.', est: { hoje: 'normal' }, vai: () => (fsPronto(), (FS.pergunta = true), (FS.naoPerguntar = false), sincronizarBarraFx(), ctIrPara('jogar'), ctDaqui(() => fsPerguntar(), 900)), alvo: '.fs-pergunta' },

    { g: 'Cartões enxuto: Hoje', id: 'hoje', nome: 'Hoje: herói, três atalhos, faixa de estado, continuar por baralho', hoje: 'Herói, três recortes, três cartões, previsão de 7 dias e “Nasceu da legenda”: 15 botões na primeira dobra.', porta: 'Herói, três atalhos, uma faixa de estado numa linha e “Continuar por baralho”. A previsão foi para a Memória.', est: { hoje: 'normal' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0)), alvo: '[data-ct-alvo="estado"]' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-tres', nome: 'Hoje com os três cartões (para comparar com a faixa)', hoje: 'Sequência, Retenção e Teto em três cartões com parágrafo.', porta: 'Chave “Hoje: faixa | três cartões” na barra do protótipo.', est: { hoje: 'normal' }, vai: () => ((CT.resumo = 'tres'), ctAbaDosCartoes(0)), alvo: '[data-ct-alvo="estado"]' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-vazio', nome: 'Hoje, primeiro uso: três jeitos de ganhar cartões', hoje: 'Tela vazia que só manda capturar.', porta: 'Capturar, trazer do Anki ou começar pela Trilha, lado a lado.', est: { hoje: 'vazio' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0)), alvo: '.ct-tres-caminhos' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-primeiro', nome: 'Hoje, primeiras palavras', hoje: 'A revisão abre o baralho inteiro, sem explicar.', porta: '“Suas 34 palavras já são cartões. Comece por 10.”, três atalhos e o “Como funciona”.', est: { hoje: 'primeiro' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0)), alvo: '[data-ct-alvo="hoje"]' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-feito', nome: 'Hoje, dia cumprido', hoje: 'Destaque em “Jogar com as mesmas”.', porta: 'O destaque passa a ser “Praticar de outro jeito” com as palavras de hoje; mais 5 novas, estudo livre e jogo viram atalhos.', est: { hoje: 'feito' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0)), alvo: '[data-ct-alvo="hoje"]' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-pilha', nome: 'Hoje, pilha acumulada', hoje: 'Quatro ladrilhos de saída e um gráfico na tela.', porta: '“Vamos de 40 hoje?” e um botão “E o resto?” no herói.', est: { hoje: 'pilha' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0)), alvo: '[data-ct-alvo="resto"]' },
    { g: 'Cartões enxuto: Hoje', id: 'hoje-resto', nome: 'Folha “E o resto?”: as quatro saídas da pilha', hoje: 'Ficavam abertas na tela.', porta: 'Herói › “E o resto?”: limite de hoje, as quatro saídas e como fica a semana.', est: { hoje: 'pilha' }, vai: () => ((CT.resumo = 'faixa'), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirResto($('[data-ct="resto"]', tela)))) },
    { g: 'Cartões enxuto: Hoje', id: 'menu', nome: 'O “…” do cabeçalho', hoje: 'Três botões soltos no cabeçalho: idioma, Palavra e Ajustes.', porta: 'Um “…”: palavra nova, trazer e levar, ajustes da memória, memória e exportar. O idioma de estudo passou para o seletor de conteúdo.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(0), ctDaqui(() => ctAbrirMenu($('[data-ct="menu"]', tela)))) },

    { g: 'Cartões enxuto: Palavras', id: 'palavras', nome: 'Palavras: busca fixa, estados numa linha, “Filtros”', hoje: 'Quatro ladrilhos de número, título, parágrafo e 24 botões na primeira dobra.', porta: 'Busca no topo (fica presa ao rolar), chips de estado com “Difíceis” em segundo e um botão “Filtros”.', est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', ordem: 'vence', abertos: false, sel: false }), (CT.desfazer = null), ctAbaDosCartoes(2)), alvo: '[data-ct-alvo="busca"]' },
    { g: 'Cartões enxuto: Palavras', id: 'palavras-filtros', nome: 'Palavras com os filtros finos abertos', hoje: 'Abertos por padrão em parte.', porta: 'Atrás de “Filtros”: ordenar, etiqueta e fora da revisão. Idioma, sessão e baralho saíram daqui: são o seletor de conteúdo.', est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', ordem: 'vence', abertos: true, sel: false }), (CT.desfazer = null), ctAbaDosCartoes(2)), alvo: '.qv-filtros' },
    { g: 'Cartões enxuto: Palavras', id: 'palavras-selecao', nome: 'Selecionar várias: suspender, mover, etiquetar', hoje: 'Existia, sem desfazer.', porta: 'O mesmo, e depois da ação um “Desfazer” no pé da lista.', est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'hoje', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: false, sel: true, marcados: new Set(['thorough', 'though', 'deprive']) }), (CT.desfazer = null), ctAbaDosCartoes(2)), alvo: '.ct-faixa-sel' },
    { g: 'Cartões enxuto: Palavras', id: 'palavras-desfazer', nome: 'Depois da ação em massa: “Desfazer”', hoje: 'Só um aviso que some.', porta: 'Faixa no pé da lista com “Desfazer”.', est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'hoje', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: false, sel: false, marcados: new Set() }), (CT.desfazer = { antes: [], texto: '3 com a etiqueta #rever' }), ctAbaDosCartoes(2)), alvo: '.ct-faixa-desfazer' },
    { g: 'Cartões enxuto: Palavras', id: 'palavra', nome: 'A palavra aberta: Fala original, a cena e o Histórico', hoje: '4 botões no alto e 5 no pé; a cena vinha depois da tradução, uma lista de ocorrências.', porta: '“Fala original” ao lado de “Ouvir”, a cena na dobra, a linha “Histórico” e o pé com Editar, Revisar e “…”.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(2), ctDaqui(() => ctAbrirPalavra('dashboard'))) },
    { g: 'Cartões enxuto: Palavras', id: 'palavra-historico', nome: 'A palavra aberta, com o Histórico aberto', hoje: 'O histórico só existia dentro da revisão (Informações do cartão).', porta: 'Palavra › Histórico: data, nota e o intervalo que a nota deu.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(2), ctDaqui(() => (ctAbrirPalavra('thorough'), ctDaqui(() => $('dialog.ct-gaveta [data-ct="historico"]')?.click(), 700)))) },

    { g: 'Cartões enxuto: Trazer e levar', id: 'trazer', nome: '“Trazer e levar”, dentro do “…”', hoje: 'Uma aba inteira, com cinco blocos.', porta: '“…” › Trazer e levar: palavra nova, colar uma lista, arquivo do Anki, exportar. (Trazer uma FONTE mora no catálogo de conteúdo.)', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(0), ctDaqui(() => ctAbrirTrazerELevar($('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'lista', nome: 'Colar uma lista', hoje: 'Um cartão na aba Trazer e levar.', porta: '“…” › Trazer e levar › Colar uma lista; ou o catálogo de conteúdo › Trazer uma fonte.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(0), ctDaqui(() => ctAbrirLista($('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'anki', nome: 'Anki, passo 1: o ensaio antes de gravar', hoje: 'A agenda do Anki não vinha; a tela ocupava a aba.', porta: 'O que vem e o que não vem, a escolha “com a agenda e o histórico” ou “do zero” com a carga de 7 dias de cada uma, os campos e a prévia.', est: { hoje: 'normal' }, vai: () => ((CT.ankiAgenda = 'agenda'), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirAnki(1, $('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'anki-zero', nome: 'Anki, passo 1, com “Começar do zero”', hoje: 'Era o único jeito.', porta: 'Vira escolha: a agenda passa para “O que não vem” e a carga muda.', est: { hoje: 'normal' }, vai: () => ((CT.ankiAgenda = 'zero'), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirAnki(1, $('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'anki-relatorio', nome: 'Anki, passo 2: o relatório e o desfazer', hoje: '“480 notas trazidas”, sem dizer o que ficou de fora.', porta: 'Quantas vieram, quantas ficaram de fora e por quê, “Desfazer esta importação” e a oferta da cena.', est: { hoje: 'normal' }, vai: () => ((CT.ankiAgenda = 'agenda'), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirAnki(2, $('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'anki-enriquecer', nome: 'Depois de importar: juntar a frase, a voz e a cena', hoje: 'Não existe.', porta: '“37 destas palavras aparecem nos seus vídeos”, com um cartão antes e depois.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(0), ctDaqui(() => ctAbrirEnriquecer($('[data-ct="menu"]', tela)))) },
    { g: 'Cartões enxuto: Trazer e levar', id: 'exportar-cartoes', nome: 'Exportar: de volta ao Anki, inteiro', hoje: 'O .apkg saía sem mídia e sem a agenda.', porta: 'Primeira opção: agenda, histórico e mídia. “O que você traz, você leva.”', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(0), ctDaqui(() => ctAbrirExportar($('[data-ct="menu"]', tela), { de: `${num(CT_FASES.total)} cartões` }))) },

    { g: 'Cartões enxuto: Memória', id: 'memoria', nome: 'Memória: tela de dentro, com voltar', hoje: 'Era a quinta aba.', porta: 'Abre pela faixa de estado e pelo “…”. Ganhou a sequência da semana e a previsão de 7 dias.', est: { hoje: 'normal' }, vai: () => ctAbaDosCartoes(4), alvo: '[data-ct-alvo="retencao"]' },
    { g: 'Cartões enxuto: Memória', id: 'ajustes-da-memoria', nome: 'Ajustes da memória: os 3 principais', hoje: '14 ajustes numa lista só, com três portas.', porta: 'Meta de retenção, novas por dia e revisões por dia à vista; o resto em “Mais ajustes”.', est: { hoje: 'normal' }, vai: () => ((CT.ajMais = false), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirAjustes($('.ct-estado-teto', tela)))) },
    { g: 'Cartões enxuto: Memória', id: 'ajustes-mais', nome: 'Ajustes da memória, com “Mais ajustes” aberto', hoje: 'Tudo à vista.', porta: 'Botões, formato, fala original, lembrete e o que é de quem vem do Anki.', est: { hoje: 'normal' }, vai: () => ((CT.ajMais = true), ctAbaDosCartoes(0), ctDaqui(() => ctAbrirAjustes($('.ct-estado-teto', tela)))), alvo: '[data-ct-alvo="mais-ajustes"]' },

    { g: 'A revisão', id: 'revisao', nome: 'O cartão: a frase, a fala original, outra frase', hoje: 'A frase aparece; a fala original não toca; uma frase só.', porta: '“Estudar agora”. No cartão, uma fileira só: Fala original, Voz, Outra frase e a minha voz (gravar e comparar).', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({}), alvo: '.ct-origem' },
    { g: 'A revisão', id: 'revisao-verso', nome: 'O verso: quatro botões com o intervalo real', hoje: 'Existe. Faltava a tradução da frase e o caminho até a sessão.', porta: 'Mostrar resposta (Espaço).', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ mostrar: true, ids: CT_FILA.slice(9), feitos: 9, seguidas: 5, hist: true }), alvo: '.fsrs' },
    { g: 'A revisão', id: 'revisao-dois', nome: 'Dois botões: Esqueci e Lembrei', hoje: 'Não existe.', porta: 'Ajustes da memória › Botões da resposta.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ mostrar: true, botoes: 2 }), alvo: '.fsrs' },
    { g: 'A revisão', id: 'revisao-imagem', nome: 'A cena no verso do cartão', hoje: 'Não existe imagem no cartão.', porta: 'No verso, a cena de onde a palavra veio (o quadro do vídeo). Depende de guardar o quadro.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ ids: CT_FILA.slice(2), feitos: 2, mostrar: true }), alvo: '.ct-quadro' },
    { g: 'A revisão', id: 'revisao-escolher', nome: 'Formato Escolher', hoje: 'Existe, mas sorteia alternativas de qualquer idioma.', porta: 'Ajustes da memória › Formato do cartão. Alternativas só do mesmo idioma.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'escolher' }), alvo: '.qr-opcoes' },
    { g: 'A revisão', id: 'revisao-digitar', nome: 'Formato Digitar', hoje: 'Existe.', porta: 'Ajustes da memória › Formato do cartão.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'digitar' }), alvo: '.qr-digitar' },
    { g: 'A revisão', id: 'revisao-lacuna', nome: 'Formato Lacuna', hoje: 'Existe como “produção ativa”, escondida: só abre pelo teclado.', porta: 'Vira um formato como os outros.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'lacuna', tentativa: 'dashbord', certo: false }), alvo: '.qr-diff' },
    { g: 'A revisão', id: 'revisao-dificil', nome: 'Aviso de palavra difícil (sanguessuga)', hoje: 'A coluna de erros existe no banco, sem tela.', porta: 'Aos 8 erros, o aviso aparece com as saídas numa fileira e o resto no “…”.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ ids: CT_FILA.slice(4), feitos: 4, aviso: 'thorough', hist: true }), alvo: '.ct-aviso-dif' },
    { g: 'A revisão', id: 'revisao-sem-rede', nome: 'Sem rede: a nota não foi enviada', hoje: 'A rodada segue sem avisar e a pessoa acha que revisou.', porta: 'Aviso com a contagem e “Tentar agora”.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ offline: true, pend: 3, ids: CT_FILA.slice(3), feitos: 3, hist: true }), alvo: '.ct-sem-rede' },
    { g: 'A revisão', id: 'revisao-acoes', nome: 'Ações do cartão: o “…”', hoje: 'Editar e Suspender existem; enterrar, bandeira e info, não.', porta: 'Um “…” na fileira do cartão abre a folha das ações (no celular, também segurando o cartão).', est: { hoje: 'normal' }, vai: () => (ctRevisaoPronta({ mostrar: true }), ctDaqui(() => ctMaisAcoes(), 1500)) },
    { g: 'A revisão', id: 'revisao-fim', nome: 'Fim da sessão e “Praticar de outro jeito”', hoje: 'Existe “Jogar com as mesmas”; as erradas ficavam para outra rodada.', porta: 'Resumo, o que mudou na memória e a folha “Praticar de outro jeito” com as que escaparam.', est: { hoje: 'normal' }, vai: () => ctFimPronto(), alvo: '.ct-mudou' },

    { g: 'Navegação', id: 'inicio', nome: 'Ladrilho fixo no Início', hoje: 'O ladrilho “Revisar N palavras” só existe com conta e com palavra vencida.', porta: 'Sempre lá: com o número do dia, ou “tudo em dia”.', est: { hoje: 'normal' }, vai: () => ctIrPara('inicio'), alvo: '[data-ct-alvo="ladrilho"]' },
    { g: 'Navegação', id: 'mais', nome: 'O painel Mais em cada variante', hoje: 'Biblioteca e Vocabulário (conteúdo da pessoa) dentro do Mais.', porta: 'A: Estatísticas e Personalizar descem; B: Personalizar; C: Cartões no lugar de Vocabulário.', est: {}, vai: () => (ctIrPara('inicio'), ctDaqui(() => abrirFolha('mais', maisBtn))) },
    { g: 'Navegação', id: 'legenda-ou-conversa', nome: 'A, no celular: “Legenda | Conversa” no alto do Capturar', hoje: 'O Intérprete tem lugar próprio na barra de cinco (pedido em 30/09).', porta: 'Na variante A ele sai da barra: vira este seletor no Capturar, o ladrilho “Conversar” do Início e um item do Mais. Só aparece no tamanho de celular.', est: { nav: 'a' }, vai: () => ctIrPara('capturar'), alvo: '[data-ct-alvo="legenda-ou-conversa"]' },
    { g: 'Navegação', id: 'praticar', nome: 'B: “Praticar”, com Cartões e Jogos', hoje: 'Jogar é um destino; a revisão não tem menu.', porta: 'Um item no trilho, duas abas no alto da tela.', est: { nav: 'b', hoje: 'normal' }, vai: () => ctAbaDosCartoes(0), alvo: '.ct-praticar' },

    { g: 'O que estava escondido', id: 'biblioteca', nome: 'Biblioteca e “Trazer ou capturar”', hoje: 'Mais › Biblioteca (2 toques); importar uma gravação, 4; Anki em outro lugar.', porta: 'Biblioteca no trilho; a linha “Trazer ou capturar”, no pé da lista, abre a mesma folha “Trazer uma fonte” do catálogo: link, arquivo, texto, Anki, lista.', est: {}, nav: 'a', vai: () => (ctIrPara('biblioteca'), ctDaqui(() => fxAbrirTrazer($('[data-ct-alvo="importar"]', tela)), 1500)), alvo: '[data-ct-alvo="importar"]' },
    { g: 'O que estava escondido', id: 'anki-baralhos', nome: 'Baralhos do Anki', hoje: 'Mais › Vocabulário › Trazer do Anki (3 toques) ou Jogar › chip da fonte.', porta: 'Ficha de conteúdo › Do Anki: o baralho vira o conteúdo dos Cartões e do Jogar; no painel, Revisar, Praticar e Jogar.', est: { hoje: 'normal' }, vai: () => (fsPronto(), ctAbaDosCartoes(0), ctDaqui(() => fxAbrirCatalogo($('[data-fs="abrir"]', tela), { sel: 'a-pv' }))), alvo: '[data-fx-alvo="painel"]' },
    { g: 'O que estava escondido', id: 'anotacoes', nome: 'Estudos e notas viram “Minhas anotações”', hoje: 'Sessão › Leitura › chip “Estudos & notas” (sessão + 2). Só neste navegador; não vira cartão.', porta: 'Mesmo lugar, com nome que diz o que é, “Virar cartão” em cada uma e guardado na conta.', est: {}, vai: () => ((sessao.aba = 1), ctIrPara('sessao'), ctDaqui(() => ctAbrirAnotacoes($('[data-ct-porta="anotacoes"]', tela)), 1500)), alvo: '[data-ct-alvo="anotacoes"]' },
    { g: 'O que estava escondido', id: 'exportar', nome: 'Um “Exportar” só', hoje: 'Dois: “Exportar” na sessão e “Exportar transcrição” na linha da Biblioteca (4 toques).', porta: 'O mesmo diálogo nos três lugares: transcrição, palavras e cartões, relatório.', est: {}, vai: () => ((sessao.aba = 0), ctIrPara('sessao'), ctDaqui(() => ctAbrirExportar($('[data-ct-porta="exportar"]', tela), { aba: 'transcricao', de: GRAVACOES[0].t }), 1500)) },
    { g: 'O que estava escondido', id: 'nuance', nome: 'Nuance: “outras formas de dizer”', hoje: 'Só aparece depois de tocar numa fala (2 toques ou mais).', porta: 'Uma dica na primeira fala traduzida da captura, uma vez; e um item em Ajuda.', est: {}, vai: () => ((ctDicaDaNuance = false), ctIrPara('aovivo'), ctDaqui(() => $('[data-px="iniciar"]', tela)?.click(), 1400)), alvo: '[data-ct-alvo="nuance"]', espera: 9000 },
    { g: 'O que estava escondido', id: 'flutuantes', nome: 'Legendas flutuantes', hoje: 'Só na tela de Capturar (2 toques).', porta: 'Também como ação na Busca e em Ajuda.', est: {}, vai: () => (ctIrPara('inicio'), ctDaqui(() => ctBuscar('legendas'))) },
    { g: 'O que estava escondido', id: 'conversa', nome: 'Conversa virtual vira “Por chamada”; “Conversa” vira “Histórico”', hoje: 'Intérprete › “Virtual” (3 toques) e “Conversa”: os rótulos não dizem o que são.', porta: 'Rótulos novos na faixa do Intérprete (“Por chamada”, “Histórico”), item em Ajuda e ação na Busca.', est: {}, vai: () => ctIrPara('interprete'), alvo: '[data-ct-alvo="conversa"]' },
    { g: 'O que estava escondido', id: 'busca', nome: 'Busca (Ctrl K) que acha tudo', hoje: 'Não acha Ajuda, Diagnóstico, Anki, exportar, abas de Personalizar; palavra achada abre a lista, não a palavra.', porta: 'Palavras (abre a palavra), baralhos, ações e as telas que ficavam de fora.', est: {}, vai: () => (ctIrPara('inicio'), ctDaqui(() => ctBuscar('th'))) },
    { g: 'O que estava escondido', id: 'atalhos', nome: 'Atalhos de teclado', hoje: 'Mais › Ajuda › cartão com 4 atalhos (2 a 3 toques). Os do Intérprete não estão em lista nenhuma.', porta: 'Tecla “?” em qualquer tela, com a lista inteira; e as teclas escritas nos botões da revisão.', est: {}, vai: () => (ctIrPara('inicio'), ctDaqui(() => ctAbrirAtalhos())) },
    { g: 'O que estava escondido', id: 'ajuda', nome: 'Ajuda: recursos que vale conhecer', hoje: 'Nuance, Conversa virtual e Diagnóstico não aparecem na Ajuda.', porta: 'Uma seção nova em Ajuda e suporte.', est: {}, vai: () => ctIrPara('ajuda'), alvo: '[data-ct-alvo="ajuda-recursos"]' },
    { g: 'O que estava escondido', id: 'temporada', nome: 'Temporada, Conquistas e Loja', hoje: 'Abas de Personalizar, tela cujo nome fala de aparência (2 toques; 3 no celular).', porta: 'O chip de Seeds do Início abre a Temporada.', est: {}, vai: () => ctIrPara('inicio'), alvo: '.ct-chip-porta' },
  ];
  /* Sem tela neste protótipo: ficam descritos, com a porta proposta. */
  const CT_SO_DESCRITOS = [
    ['Leitura, Transcrição e Jogos da sessão', 'Só dentro da sessão, em aba (sessão + 1).', 'Na linha da sessão, três atalhos: Ler, Ouvir, Jogar.'],
    ['Desenho livre', 'Sessão › Leitura › Desenho livre (sessão + 2).', 'Fica na Leitura; entra na Busca como ação.'],
    ['Voz, idioma e tom', 'Botão de texto no fim da faixa da Leitura.', 'Sem proposta nova: decidir se sobe para o cabeçalho da Leitura.'],
    ['Tutor (iChat)', 'Botão flutuante que some em várias telas; o nome não diz o que faz.', 'Item “Tutor” no Mais (está nas variantes A e B) e “Perguntar ao tutor” na palavra aberta e nas ações do cartão.'],
    ['Glossário “Sempre traduzir assim”', 'Grava na folha da palavra; lista no fim de Ajustes › Idiomas.', 'Seção “Meu glossário” com âncora e link na folha da palavra.'],
    ['Histórico do intérprete', 'Intérprete › “Conversa”, vazio fora de conversa em curso.', 'Rótulo “Histórico”; conversas passadas na Biblioteca.'],
    ['Diagnóstico', 'Só pela URL /diagnostico.', 'Item em Ajuda e ação na Busca (os dois existem aqui, com aviso no lugar da tela).'],
    ['Recordes, Mapa do conteúdo, Curadoria', 'Jogar › Opções (3 a 4 toques).', 'Recordes no cabeçalho do Jogar; Mapa e Curadoria no “…” do painel do conteúdo › Gerenciar (os dois aparecem lá, sem a tela).'],
    ['Trilha', 'É uma fonte dentro de Jogar (3 toques).', 'Linha “Trilha do app” no catálogo de conteúdo, em qualquer tela (materializado).'],
    ['Praticar pronúncia', 'Só na folha da frase (sessão + 2).', 'Botão na palavra aberta e nas ações do cartão (os dois existem aqui, com aviso).'],
    ['Menu de prática (botão direito)', 'Só com botão direito: não existe no celular nem no headset.', 'Os mesmos itens na folha da frase, por toque.'],
    ['Idioma da interface', 'Mais › Ajustes › seletor (3 toques).', 'Chip do idioma no alto do Mais (materializado, com aviso).'],
    ['Lembrete de estudo', 'Ajustes › Notificações; lembra pela meta de minutos.', '“Lembrar quando houver revisão”, nos Ajustes da memória (materializado).'],
    ['Polir sessão, Editar a fala, player completo', 'Sem porta nenhuma no desenho novo.', 'Decisão do dono: voltar ou apagar o código.'],
  ];
  const ctPorta = (id) => ctListaDePortas().find((p) => p.id === id);
  function ctBuscar(q) {
    if (!$('.paleta-cmd')) abrirBusca('clique');
    const campo = $('.paleta-cmd input');
    if (!campo) return;
    campo.value = q;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function ctVerPorta(id) {
    const p = ctPorta(id);
    if (!p) return;
    ctAbrirMapa(false);
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    $('.qc-oferta')?.remove();
    if (folha) fecharFolha({ seco: true, semFoco: true });
    ctR = null;
    /* nav, nome e hoje da URL ganham do padrão do item (para as capturas de tela) */
    const daUrl = !ctVerPorta.jaUsou && QS.get('ver') === id;
    ctVerPorta.jaUsou = true;
    if (p.est.nav && !(daUrl && QS.get('nav'))) CT.nav = p.est.nav;
    else if (p.nav && CT.nav === 'atual') CT.nav = p.nav;
    else if (CT.nav === 'atual' && p.g === 'O que estava escondido') CT.nav = 'a';
    if (p.est.hoje && !(daUrl && QS.get('hoje'))) CT.hoje = p.est.hoje;
    if (!/^revisao/.test(id)) (PL.offline = false), Object.assign(CT_AJ, { formato: daUrl && QS.get('formato') ? CT_AJ.formato : 'lembrar' });
    aplicarCt({ semRedesenho: true });
    sincronizarBarraPl();
    p.vai();
    if (!p.alvo) return;
    const procurar = (vez) => {
      const el = $(p.alvo);
      if (!el) return vez < 30 && setTimeout(() => procurar(vez + 1), 400);
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      if (QS.has('quieto')) return; /* para captura de tela: sem o pulso que aponta o lugar */
      el.classList.add('ad-aqui');
      setTimeout(() => el.classList.remove('ad-aqui'), 2600);
    };
    setTimeout(() => procurar(0), 1500 * K());
  }
  function ctHtmlDoMapa() {
    const nav = CT_NAV[CT.nav];
    const CT_PORTAS = ctListaDePortas();
    const grupos = [...new Set(CT_PORTAS.map((p) => p.g))];
    const linha = (k) => `<tr><th>${CT_NAV[k].nome}${k === 'd' ? ' (padrão)' : ''}</th><td>${CT_NAV[k].itens.map((r) => (r === 'cartoes' ? `<b>${ctNome()}</b>` : r === 'praticar' ? '<b>Praticar</b>' : r === 'biblioteca' ? '<b>Biblioteca</b>' : ctDestino(r)[0])).join(' · ')}</td><td>${[CT_NAV[k].cel[0], CT_NAV[k].cel[1], CT_NAV[k].cel[2], CT_NAV[k].cel[3]].map((r, i) => (i === 2 ? `[${ctDestino(r)[0]}]` : r === 'cartoes' || r === 'praticar' ? `<b>${k === 'd' ? 'Praticar' : ctDestino(r)[0]}</b>` : ctDestino(r)[0])).join(' · ')} · Mais</td></tr>`;
    return `<button type="button" class="px-fechar ad-mapa-fechar" aria-label="Fechar o mapa">Fechar</button>
      <p class="ad-mapa-sobre">Protótipo conceitual · dados de exemplo · nada grava nem toca áudio gravado</p>
      <h2>Mapa das portas</h2>
      <p>A versão enxuta de Cartões, a revisão e cada recurso que estava escondido: como era (no protótipo anterior ou no app) e como ficou. O seletor “Ir para” da barra leva a qualquer item. “Ver na tela” leva até lá. Cada item tem endereço próprio: <code>?ver=</code> seguido do nome; junte <code>&amp;nav=d|atual|a|b|c</code>, <code>&amp;resumo=faixa|tres</code> e <code>&amp;quieto</code>.</p>
      <div class="ad-mapa-estado">
        <div><span>Navegação</span><b>${nav.nome}</b></div>
        <div><span>Nome da tela</span><b>${ctNome()}</b></div>
        <div><span>Hoje</span><b>${{ normal: '26 para estudar', vazio: 'primeiro uso, vazio', primeiro: 'primeiro uso, 34 palavras', feito: 'dia cumprido', pilha: '240 esperando' }[CT.hoje]}</b></div>
        <div class="largo"><span>Portas propostas</span><b>${ctPortas() ? 'ligadas (Importar único, Exportar único, Minhas anotações, Busca ampliada, dica da Nuance, rótulos novos)' : 'desligadas em “Atual”: o app como está hoje, só com a tela nova atrás de Mais › Vocabulário e o ladrilho fixo'}</b></div>
      </div>
      <h3>As navegações</h3>
      <div class="pl-mapa-tabela"><table><tr><th></th><th>Trilho do computador</th><th>Barra de cinco do celular</th></tr>${['d', 'atual', 'a', 'b', 'c'].map(linha).join('')}</table></div>
      <ul class="ad-mapa-lista" style="margin-top:12px">
        <li><b>Decidida:</b> no computador, o trilho de A; no celular a barra é Início, Praticar, Capturar, Intérprete e Mais, e “Praticar” abre Cartões com o seletor Cartões | Jogos na linha do título. As outras seguem disponíveis pelo endereço (<code>&amp;nav=atual|a|b|c</code>).</li>
        <li><b>A:</b> o que é da pessoa e se abre todo dia (sessões e cartões) fica no trilho; Estatísticas e Personalizar descem para o Mais. No celular, o Intérprete sai da barra e fica no Mais e no ladrilho “Conversar” do Início. <i>Decisão do dono.</i></li>
        <li><b>B:</b> “Praticar” junta Cartões e Jogos. Mantém o Intérprete na barra; os cartões ficam a dois toques.</li>
        <li><b>C:</b> o trilho não muda. Barata e reversível; não resolve a Biblioteca.</li>
        <li>Em todas: o ladrilho da revisão no Início é fixo e a Busca oferece “Estudar agora”.</li>
      </ul>
      ${grupos
        .map(
          (g) => `<h3>${g}</h3><div class="ad-mapa-espacos">${CT_PORTAS.filter((p) => p.g === g)
            .map((p) => `<section class="ad-mapa-item ativo"><header><h4>${p.nome}</h4><button type="button" data-ct-ver="${p.id}">Ver na tela</button></header>
              <dl><div><dt>Antes</dt><dd>${p.hoje}</dd></div><div><dt>Agora</dt><dd>${p.porta}</dd></div><div><dt>Endereço</dt><dd><code>?ver=${p.id}</code></dd></div></dl></section>`)
            .join('')}</div>`,
        )
        .join('')}
      <h3>Descritos, sem tela neste protótipo</h3>
      <div class="pl-mapa-tabela"><table><tr><th>Recurso</th><th>Hoje</th><th>Porta proposta</th></tr>${CT_SO_DESCRITOS.map((l) => `<tr>${l.map((c, i) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table></div>
      <h3>O que este protótipo finge</h3>
      <ul class="ad-mapa-lista">
        <li>“Fala original” usa a voz do navegador no lugar do trecho gravado da sessão.</li>
        <li>O quadro do vídeo é um desenho: a imagem de verdade depende de guardar o quadro. <i>Decisão do dono.</i></li>
        <li>Os intervalos dos botões, a retenção e a carga são números de exemplo, coerentes entre as abas, não a conta do FSRS.</li>
        <li>A fila de exemplo tem 26 cartões; num recorte maior (a pilha de 40) ela repete.</li>
        <li>Importar não lê arquivo: o baralho “Travel English” é de exemplo, e os números do ensaio e do relatório também.</li>
        <li>“Praticar de outro jeito” abre a mesma folha em Hoje, no dia cumprido, no baralho, na palavra, na seleção de Palavras e no fim da sessão. Os estados da revisão e das práticas têm barra própria (“Revisão e práticas”, <code>?cx=</code>).</li>
      </ul>`;
  }
  function ctAbrirMapa(abre) {
    if (abre) (abrirMapa(false), abrirMapaPl(false));
    document.body.classList.toggle('ct-mapa-aberto', abre);
    $('[data-ct-b="mapa"]', barraCt).setAttribute('aria-pressed', abre);
    if (!abre) return;
    mapaCt.innerHTML = ctHtmlDoMapa();
    mapaCt.scrollTop = 0;
    mapaCt.focus({ preventScroll: true });
  }
  $('.ct-mapa-fundo').addEventListener('click', () => ctAbrirMapa(false));
  mapaCt.addEventListener('click', (e) => {
    if (e.target.closest('.ad-mapa-fechar')) return ctAbrirMapa(false);
    const v = e.target.closest('[data-ct-ver]');
    if (v) ctVerPorta(v.dataset.ctVer);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.contains('ct-mapa-aberto') && ctAbrirMapa(false));

  /* ---- Partida ------------------------------------------------------------------------ */
  /* As fontes de números (mono) só carregam quando aparecem: a pílula das abas é medida de novo quando chegam. */
  document.fonts?.addEventListener?.('loadingdone', () => requestAnimationFrame(reposicionar));
  $('[data-ct-ir]', barraCt).insertAdjacentHTML('beforeend', `${[...new Set(ctListaDePortas().map((p) => p.g))].map((g) => `<optgroup label="${g}">${ctListaDePortas().filter((p) => p.g === g).map((p) => `<option value="${p.id}">${p.nome.replace(/[“”]/g, '')}</option>`).join('')}</optgroup>`).join('')}`);
  ctPintarTrilho();
  sincronizarBarraCt();
  if (QS.get('mapa') === 'portas') setTimeout(() => ctAbrirMapa(true), 900);
  if (ctPorta(QS.get('ver'))) setTimeout(() => ctVerPorta(QS.get('ver')), 700);
  else if (QS.get('tela') === 'cartoes') setTimeout(() => ((abaDe.cartoes = +QS.get('aba') || 0), mostrarSemAds('cartoes', { origem: 'seco' })), 300);
