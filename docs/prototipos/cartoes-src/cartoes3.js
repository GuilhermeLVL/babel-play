  /* ==========================================================================
     CARTÕES 3 — a navegação (Atual, A, B, C), as portas do que estava escondido,
     a barra do protótipo e o Mapa das portas.

     Navegação (seção 4.2 da proposta):
       Atual  o trilho de hoje; Cartões só existe atrás de Mais › Vocabulário.
       A      conteúdo no trilho (Biblioteca, Cartões), acessório no Mais (Estatísticas, Personalizar).
       B      "Praticar": um destino com duas abas, Cartões e Jogos.
       C      mínima: o trilho não muda; Cartões toma o lugar de Vocabulário no Mais.
     Em todas, o ladrilho de revisão do Início é fixo.
     ========================================================================== */
  const CT_NAV = {
    atual: { nome: 'Atual', itens: ['inicio', 'capturar', 'interprete', 'jogar', 'estatisticas', 'personalizar'], cel: ['inicio', 'jogar', 'capturar', 'interprete'], mais: ['biblioteca', 'vocabulario', 'sobre', 'ajustes', 'perfil', 'ajuda'], maisCel: ['personalizar', 'estatisticas'] },
    a: { nome: 'A', itens: ['inicio', 'capturar', 'interprete', 'biblioteca', 'cartoes', 'jogar'], cel: ['inicio', 'cartoes', 'capturar', 'jogar'], mais: ['estatisticas', 'personalizar', 'ajustes', 'perfil', 'tutor', 'ajuda', 'sobre'], maisCel: ['interprete', 'biblioteca'] },
    b: { nome: 'B', itens: ['inicio', 'capturar', 'interprete', 'biblioteca', 'praticar', 'estatisticas'], cel: ['inicio', 'praticar', 'capturar', 'interprete'], mais: ['personalizar', 'ajustes', 'perfil', 'tutor', 'ajuda', 'sobre'], maisCel: ['biblioteca', 'estatisticas'] },
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
      b.innerHTML = `${icone}<span>${rot}</span>${r === 'cartoes' || r === 'praticar' ? ctSelo() : ''}`;
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
      ir(r === 'praticar' ? CT.praticar || 'cartoes' : r);
    },
    true,
  );

  /* B: "Praticar" é um destino só, com duas abas. Elas aparecem no alto das duas telas. */
  function ctPraticar(qual) {
    if (CT.nav !== 'b') return '';
    return `<div class="q-abas ct-praticar" role="tablist" aria-label="Praticar">${[['cartoes', 'layers', ctNome(), CT.hoje === 'feito' || CT.hoje === 'vazio' ? '' : 26], ['jogar', 'gamepad-2', 'Jogos', 18]].map(([k, i, r, n]) => `<button type="button" role="tab" class="q-aba" aria-selected="${qual === k}" data-ct-praticar="${k}">${ica(i)}${r}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
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
    const n = ctN(ctBaralho('tudo'));
    const total = n[0] + n[1] + n[2];
    const [b, d] = {
      normal: [`${ctNome() === 'Estudar' ? 'Estudar' : ctNome()}: ${total} para hoje`, `${n[2]} a rever, ${n[1]} aprendendo e ${n[0]} novas. ${ctMin(total).replace('uns', 'Uns')}.`],
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
    if (CT.nav === 'b' && nome === 'jogar' && !$('.ct-praticar', tela)) {
      $('.q-palco', tela)?.insertAdjacentHTML('afterbegin', ctPraticar('jogar'));
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
        ['wallet-cards', 'Baralho do Anki', 'Arquivo .apkg, com o relatório do que vem.', 'anki'],
        ['clipboard', 'Lista de palavras', 'Uma por linha, com ou sem tradução.', 'lista'],
      ]
        .map(([i, t, d, k]) => `<button type="button" class="q-tile em-linha" data-ct-fonte="${k}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b><small class="q-d">${d}</small></span></button>`)
        .join('')}</div><p class="qj-nota">Antes: quatro toques para importar uma gravação, e o Anki ficava em outro lugar (Mais › Vocabulário › Trazer do Anki).</p>`, `<button type="button" class="q-ctl">Fechar</button>`, 'ct-importar'),
      gatilho,
      (b, d) => {
        const k = b.dataset.ctFonte;
        if (!k) return;
        if (k === 'anki' || k === 'lista') {
          fecharDialogo(d);
          CT.anki = k === 'anki' ? 0 : CT.anki;
          return ctIrAba(3);
        }
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
    ultimoIrPara?.after(item('layers', ctNome(), 'hoje, baralhos, palavras, trazer e levar', () => ((abaDe.cartoes = 0), ir('cartoes')), false));
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
      item('upload', 'Trazer um baralho do Anki', 'arquivo .apkg', () => ((CT.anki = 0), ctIrAba(3))),
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
    `<div class="px-barra ad-barra ct-barra" role="toolbar" aria-label="Controles dos cartões e da navegação">
      <button type="button" data-ct-b="mapa" class="ad-barra-mapa ct-barra-mapa" aria-pressed="false" title="Cada recurso que estava escondido, onde mora hoje e a porta proposta, com um atalho até ela">Mapa das portas</button>
      <span class="px-sep"></span>
      <span class="ad-barra-t">Navegação</span>
      <div class="px-seg" title="Onde a tela nova mora. Troca o trilho, o painel Mais e a barra de cinco do celular."><i></i>${Object.entries(CT_NAV).map(([k, v]) => `<button type="button" data-ct-nav="${k}" aria-pressed="false" title="${{ atual: 'Como está hoje: a revisão atrás de Mais › Vocabulário', a: 'Recomendada: Biblioteca e Cartões no trilho; Estatísticas e Personalizar no Mais', b: '“Praticar”: um destino com duas abas, Cartões e Jogos', c: 'Mínima: o trilho não muda; Cartões no lugar de Vocabulário no Mais' }[k]}">${v.nome}</button>`).join('')}</div>
      <span class="ad-barra-t">Nome</span>
      <div class="px-seg" title="O nome da tela nova, para comparar"><i></i>${Object.entries(CT_NOMES).map(([k, v]) => `<button type="button" data-ct-nome="${k}" aria-pressed="false">${v}</button>`).join('')}</div>
      <span class="ad-barra-t">Hoje</span>
      <div class="px-seg" title="O estado do dia na tela nova"><i></i>${[['normal', 'Normal', 'Há o que estudar'], ['vazio', 'Vazio', 'Primeiro uso, sem nenhum cartão'], ['primeiro', 'Primeiro', 'Primeiro uso, com palavras das sessões'], ['feito', 'Cumprido', 'Tudo estudado por hoje'], ['pilha', 'Pilha', 'Voltou depois de dias sem estudar']].map(([k, r, t]) => `<button type="button" data-ct-hoje="${k}" aria-pressed="false" title="${t}">${r}</button>`).join('')}</div>
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
    $('[data-ct-b="offline"]', barraCt).setAttribute('aria-pressed', PL.offline);
    $('[data-ct-b="outras"]', barraCt).setAttribute('aria-pressed', document.body.classList.contains('ct-ver-outras'));
    $$('.px-seg [aria-pressed="true"]', barraCt).forEach((b) => b.offsetWidth && marcarSeg(b));
    html.dataset.ctNav = CT.nav;
  }
  const ctEstadoParaQuadros = () => ({ nav: CT.nav, nome: CT.nome, hoje: CT.hoje });
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
      toast({ atual: 'Atual: como está hoje. A revisão só aparece em Mais › Vocabulário.', a: 'A (recomendada): Biblioteca e Cartões no trilho; Estatísticas e Personalizar descem para o Mais.', b: 'B: “Praticar” é um destino só, com duas abas: Cartões e Jogos.', c: 'C (mínima): o trilho não muda; Cartões toma o lugar de Vocabulário no Mais.' }[CT.nav], 4600);
    } else if (d.ctNome) CT.nome = d.ctNome;
    else if (d.ctHoje) {
      CT.hoje = d.ctHoje;
      if (ctR) ctR = null;
      if (atual !== 'cartoes' && atual !== 'inicio') return aplicarCt({ semRedesenho: true }), (abaDe.cartoes = 0), void mostrarSemAds('cartoes', { origem: 'clique' });
    } else return;
    aplicarCt();
  });
  addEventListener('message', (e) => {
    const s = e.data?.pxCt;
    if (!s || !EMBUTIDO || e.source !== parent) return;
    const antes = JSON.stringify(ctEstadoParaQuadros());
    if (CT_NAV[s.nav]) CT.nav = s.nav;
    if (CT_NOMES[s.nome]) CT.nome = s.nome;
    if (CT_HOJES.includes(s.hoje)) CT.hoje = s.hoje;
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
  /* g = grupo; hoje = onde mora hoje e quantos toques; porta = a porta proposta; vai = como chegar aqui. */
  const ctListaDePortas = () => [
    { g: 'A tela nova', id: 'hoje', nome: 'Hoje: o que há para estudar agora', hoje: 'Não existe. O mais perto é o convite dentro de Mais › Vocabulário (3 toques).', porta: `Trilho › ${ctNome()} (1 toque nas variantes A e B) e o ladrilho fixo do Início.`, est: { hoje: 'normal' }, vai: () => ctAbaDosCartoes(0), alvo: '[data-ct-alvo="hoje"]' },
    { g: 'A tela nova', id: 'hoje-vazio', nome: 'Hoje, primeiro uso: três jeitos de ganhar cartões', hoje: 'Tela vazia que só manda capturar.', porta: 'Capturar, trazer do Anki ou começar pela Trilha, lado a lado.', est: { hoje: 'vazio' }, vai: () => ctAbaDosCartoes(0), alvo: '.ct-tres-caminhos' },
    { g: 'A tela nova', id: 'hoje-primeiro', nome: 'Hoje, primeiro uso com palavras', hoje: 'A revisão abre o baralho inteiro, sem explicar.', porta: '“Suas 34 palavras já são cartões. Comece por 10.” Sem falar de algoritmo.', est: { hoje: 'primeiro' }, vai: () => ctAbaDosCartoes(0), alvo: '[data-ct-alvo="hoje"]' },
    { g: 'A tela nova', id: 'hoje-feito', nome: 'Hoje, dia cumprido', hoje: '“Tudo revisado por hoje”, e o botão Revisar abre o baralho inteiro.', porta: 'Comemoração contida; oferece jogo, mais 5 novas ou estudo livre (marcado como fora da agenda).', est: { hoje: 'feito' }, vai: () => ctAbaDosCartoes(0), alvo: '[data-ct-alvo="hoje"]' },
    { g: 'A tela nova', id: 'hoje-pilha', nome: 'Hoje, pilha acumulada', hoje: 'Não existe: aparecem as 240 de uma vez.', porta: '“Você tem 240 esperando. Vamos de 40 hoje?”, com espalhar, adiar, sem novas e o teto.', est: { hoje: 'pilha' }, vai: () => ctAbaDosCartoes(0), alvo: '.ct-pilha' },
    { g: 'A tela nova', id: 'baralhos', nome: 'Baralhos automáticos, com as três contagens', hoje: 'Não existe painel de baralhos. O recorte da revisão só existe por sessão.', porta: `${ctNome()} › Baralhos: por idioma, por sessão, Trilha, Anki, Difíceis e Suspensas, com Revisar este, Jogar com este e Gerenciar.`, est: { hoje: 'normal' }, vai: () => ((CT.baralho = 's-reuniao'), ctAbaDosCartoes(1)), alvo: '[data-ct-alvo="baralho"]' },
    { g: 'A tela nova', id: 'palavras', nome: 'Vocabulário vira o navegador de cartões', hoje: 'Mais › Vocabulário (2 toques); cada palavra, 3. Sem filtro por estado, sessão, baralho ou idioma.', porta: `${ctNome()} › ${ctNomeDaAba(2)}: os filtros novos e a busca que abre a palavra.`, est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: true, sel: false }), ctAbaDosCartoes(2)), alvo: '.ct-estados' },
    { g: 'A tela nova', id: 'palavras-selecao', nome: 'Selecionar várias: suspender, mover, etiquetar', hoje: 'Não existe.', porta: `${ctNome()} › ${ctNomeDaAba(2)} › Selecionar.`, est: { hoje: 'normal' }, vai: () => (Object.assign(CT.f, { estado: 'hoje', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: false, sel: true, marcados: new Set(['thorough', 'though', 'deprive']) }), ctAbaDosCartoes(2)), alvo: '.ct-faixa-sel' },
    { g: 'A tela nova', id: 'palavra', nome: 'A palavra aberta, com a fala original', hoje: 'A gaveta mostra a frase e a sessão, mas não toca a fala nem leva ao trecho.', porta: 'A mesma gaveta, com “Fala original” e “Abrir na sessão” em cada ocorrência.', est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(2), ctDaqui(() => ctAbrirPalavra('dashboard'))) },
    { g: 'A tela nova', id: 'trazer', nome: 'Trazer e levar', hoje: 'Anki em Mais › Vocabulário › Trazer do Anki (3 toques); exportar em outro diálogo.', porta: `${ctNome()} › Trazer e levar: Anki, lista colada, “nasceu da legenda” e as quatro saídas.`, est: { hoje: 'normal' }, vai: () => ((CT.anki = 0), ctAbaDosCartoes(3)), alvo: '[data-ct-alvo="anki"]' },
    { g: 'A tela nova', id: 'anki', nome: 'Importar do Anki: o que vem e o que não vem', hoje: 'A tela diz o que se perde, mas o mapeador de campos está pela metade.', porta: 'Relatório lado a lado, mapear campos, prévia do cartão e “quantas ativar agora”.', est: { hoje: 'normal' }, vai: () => ((CT.anki = 1), ctAbaDosCartoes(3)), alvo: '.ct-vem-nao-vem' },
    { g: 'A tela nova', id: 'memoria', nome: 'Memória: retenção real, carga, calendário, botões', hoje: 'Espalhado: 7 dias de previsão em Estatísticas, retenção por fase no perfil.', porta: `${ctNome()} › ${ctNomeDaAba(4)}.`, est: { hoje: 'normal' }, vai: () => ctAbaDosCartoes(4), alvo: '[data-ct-alvo="retencao"]' },
    { g: 'A tela nova', id: 'ajustes-da-memoria', nome: 'Ajustes da memória', hoje: 'Seis opções no navegador (não acompanham a conta); “novas por dia” vale por rodada.', porta: `Botão Ajustes no alto de ${ctNome()} e “Opções” na revisão.`, est: { hoje: 'normal' }, vai: () => (ctAbaDosCartoes(4), ctDaqui(() => ctAbrirAjustes())) },

    { g: 'A revisão', id: 'revisao', nome: 'O cartão: a frase, a fala original, outra frase', hoje: 'A frase aparece; a fala original não toca; uma frase só.', porta: '“Estudar agora”. No cartão: Fala original, Voz e Outra frase.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({}), alvo: '.ct-origem' },
    { g: 'A revisão', id: 'revisao-verso', nome: 'O verso: quatro botões com o intervalo real', hoje: 'Existe. Faltava a tradução da frase e o caminho até a sessão.', porta: 'Mostrar resposta (Espaço).', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ mostrar: true, ids: CT_FILA.slice(9), feitos: 9, seguidas: 5, hist: true }), alvo: '.fsrs' },
    { g: 'A revisão', id: 'revisao-dois', nome: 'Dois botões: Esqueci e Lembrei', hoje: 'Não existe.', porta: 'Ajustes da memória › Botões da resposta.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ mostrar: true, botoes: 2 }), alvo: '.fsrs' },
    { g: 'A revisão', id: 'revisao-imagem', nome: 'Cartão com o quadro do vídeo', hoje: 'Não existe imagem no cartão.', porta: 'Aparece sozinho quando a palavra veio de uma sessão de vídeo. Depende de guardar o quadro.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ ids: CT_FILA.slice(2), feitos: 2, mostrar: true }), alvo: '.ct-quadro' },
    { g: 'A revisão', id: 'revisao-escolher', nome: 'Formato Escolher', hoje: 'Existe, mas sorteia alternativas de qualquer idioma.', porta: 'Ajustes da memória › Formato do cartão. Alternativas só do mesmo idioma.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'escolher' }), alvo: '.qr-opcoes' },
    { g: 'A revisão', id: 'revisao-digitar', nome: 'Formato Digitar', hoje: 'Existe.', porta: 'Ajustes da memória › Formato do cartão.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'digitar' }), alvo: '.qr-digitar' },
    { g: 'A revisão', id: 'revisao-lacuna', nome: 'Formato Lacuna', hoje: 'Existe como “produção ativa”, escondida: só abre pelo teclado.', porta: 'Vira um formato como os outros.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ formato: 'lacuna', tentativa: 'dashbord', certo: false }), alvo: '.qr-diff' },
    { g: 'A revisão', id: 'revisao-dificil', nome: 'Aviso de palavra difícil (sanguessuga)', hoje: 'A coluna de erros existe no banco, sem tela.', porta: 'Aos 8 erros, três saídas: editar, trocar a frase, suspender.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ ids: CT_FILA.slice(4), feitos: 4, aviso: 'thorough', hist: true }), alvo: '.ct-aviso-dif' },
    { g: 'A revisão', id: 'revisao-sem-rede', nome: 'Sem rede: a nota não foi enviada', hoje: 'A rodada segue sem avisar e a pessoa acha que revisou.', porta: 'Aviso com a contagem e “Tentar agora”.', est: { hoje: 'normal' }, vai: () => ctRevisaoPronta({ offline: true, pend: 3, ids: CT_FILA.slice(3), feitos: 3, hist: true }), alvo: '.ct-sem-rede' },
    { g: 'A revisão', id: 'revisao-acoes', nome: 'Ações do cartão (no celular, segurar o cartão)', hoje: 'Editar e Suspender existem; enterrar, bandeira e info, não.', porta: 'Faixa do pé no computador; folha de baixo no celular.', est: { hoje: 'normal' }, vai: () => (ctRevisaoPronta({ mostrar: true }), ctDaqui(() => ctMaisAcoes(), 1500)) },
    { g: 'A revisão', id: 'revisao-fim', nome: 'Fim da sessão e “virar jogo”', hoje: 'Existe “Jogar com as mesmas”; as erradas ficavam para outra rodada.', porta: 'Resumo, o que mudou na memória e “Virar jogo com as erradas”.', est: { hoje: 'normal' }, vai: () => ctFimPronto(), alvo: '.ct-mudou' },

    { g: 'Navegação', id: 'inicio', nome: 'Ladrilho fixo no Início', hoje: 'O ladrilho “Revisar N palavras” só existe com conta e com palavra vencida.', porta: 'Sempre lá: com o número do dia, ou “tudo em dia”.', est: { hoje: 'normal' }, vai: () => ctIrPara('inicio'), alvo: '[data-ct-alvo="ladrilho"]' },
    { g: 'Navegação', id: 'mais', nome: 'O painel Mais em cada variante', hoje: 'Biblioteca e Vocabulário (conteúdo da pessoa) dentro do Mais.', porta: 'A: Estatísticas e Personalizar descem; B: Personalizar; C: Cartões no lugar de Vocabulário.', est: {}, vai: () => (ctIrPara('inicio'), ctDaqui(() => abrirFolha('mais', maisBtn))) },
    { g: 'Navegação', id: 'legenda-ou-conversa', nome: 'A, no celular: “Legenda | Conversa” no alto do Capturar', hoje: 'O Intérprete tem lugar próprio na barra de cinco (pedido em 30/09).', porta: 'Na variante A ele sai da barra: vira este seletor no Capturar, o ladrilho “Conversar” do Início e um item do Mais. Só aparece no tamanho de celular.', est: { nav: 'a' }, vai: () => ctIrPara('capturar'), alvo: '[data-ct-alvo="legenda-ou-conversa"]' },
    { g: 'Navegação', id: 'praticar', nome: 'B: “Praticar”, com Cartões e Jogos', hoje: 'Jogar é um destino; a revisão não tem menu.', porta: 'Um item no trilho, duas abas no alto da tela.', est: { nav: 'b', hoje: 'normal' }, vai: () => ctAbaDosCartoes(0), alvo: '.ct-praticar' },

    { g: 'O que estava escondido', id: 'biblioteca', nome: 'Biblioteca e “Importar” único', hoje: 'Mais › Biblioteca (2 toques); importar uma gravação, 4; Anki em outro lugar.', porta: 'Biblioteca no trilho (A e B); o botão Importar abre todas as fontes: link, arquivo, texto, Anki, lista.', est: {}, nav: 'a', vai: () => (ctIrPara('biblioteca'), ctDaqui(() => ctAbrirImportar($('[data-ct-porta="importar"]', tela)), 1500)), alvo: '[data-ct-alvo="importar"]' },
    { g: 'O que estava escondido', id: 'anki-baralhos', nome: 'Baralhos do Anki', hoje: 'Mais › Vocabulário › Trazer do Anki (3 toques) ou Jogar › chip da fonte.', porta: `${ctNome()} › Baralhos › Do Anki, com “Revisar este” (hoje só existe “Jogar com este”).`, est: { hoje: 'normal' }, vai: () => ((CT.baralho = 'a-pv'), ctAbaDosCartoes(1)), alvo: '[data-ct-alvo="baralho"]' },
    { g: 'O que estava escondido', id: 'anotacoes', nome: 'Estudos e notas viram “Minhas anotações”', hoje: 'Sessão › Leitura › chip “Estudos & notas” (sessão + 2). Só neste navegador; não vira cartão.', porta: 'Mesmo lugar, com nome que diz o que é, “Virar cartão” em cada uma e guardado na conta. Também em Trazer e levar.', est: {}, vai: () => ((sessao.aba = 1), ctIrPara('sessao'), ctDaqui(() => ctAbrirAnotacoes($('[data-ct-porta="anotacoes"]', tela)), 1500)), alvo: '[data-ct-alvo="anotacoes"]' },
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
    ['Recordes, Mapa do conteúdo, Curadoria', 'Jogar › Opções (3 a 4 toques).', 'Recordes no cabeçalho do Jogar; Mapa e Curadoria em Gerenciar o baralho (os dois aparecem lá, sem a tela).'],
    ['Trilha', 'É uma fonte dentro de Jogar (3 toques).', `Baralho “Trilha” em ${ctNome()} › Baralhos (materializado).`],
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
    const linha = (k) => `<tr><th>${CT_NAV[k].nome}${k === 'a' ? ' (recomendada)' : ''}</th><td>${CT_NAV[k].itens.map((r) => (r === 'cartoes' ? `<b>${ctNome()}</b>` : r === 'praticar' ? '<b>Praticar</b>' : r === 'biblioteca' ? '<b>Biblioteca</b>' : ctDestino(r)[0])).join(' · ')}</td><td>${[CT_NAV[k].cel[0], CT_NAV[k].cel[1], CT_NAV[k].cel[2], CT_NAV[k].cel[3]].map((r, i) => (i === 2 ? `[${ctDestino(r)[0]}]` : r === 'cartoes' || r === 'praticar' ? `<b>${ctDestino(r)[0]}</b>` : ctDestino(r)[0])).join(' · ')} · Mais</td></tr>`;
    return `<button type="button" class="px-fechar ad-mapa-fechar" aria-label="Fechar o mapa">Fechar</button>
      <p class="ad-mapa-sobre">Protótipo conceitual · dados de exemplo · nada grava nem toca áudio gravado</p>
      <h2>Mapa das portas</h2>
      <p>A tela nova, a revisão e cada recurso que estava escondido: onde mora hoje (com os toques contados a partir do Início, no computador) e a porta proposta. “Ver na tela” leva até lá. Cada item tem endereço próprio: <code>?ver=</code> seguido do nome; junte <code>&amp;nav=atual|a|b|c</code>, <code>&amp;nome=cartoes|memoria|estudar</code> e <code>&amp;quieto</code>.</p>
      <div class="ad-mapa-estado">
        <div><span>Navegação</span><b>${nav.nome}${CT.nav === 'a' ? ' (recomendada)' : ''}</b></div>
        <div><span>Nome da tela</span><b>${ctNome()}</b></div>
        <div><span>Hoje</span><b>${{ normal: '26 para estudar', vazio: 'primeiro uso, vazio', primeiro: 'primeiro uso, 34 palavras', feito: 'dia cumprido', pilha: '240 esperando' }[CT.hoje]}</b></div>
        <div class="largo"><span>Portas propostas</span><b>${ctPortas() ? 'ligadas (Importar único, Exportar único, Minhas anotações, Busca ampliada, dica da Nuance, rótulos novos)' : 'desligadas em “Atual”: o app como está hoje, só com a tela nova atrás de Mais › Vocabulário e o ladrilho fixo'}</b></div>
      </div>
      <h3>As três navegações</h3>
      <div class="pl-mapa-tabela"><table><tr><th></th><th>Trilho do computador</th><th>Barra de cinco do celular</th></tr>${['atual', 'a', 'b', 'c'].map(linha).join('')}</table></div>
      <ul class="ad-mapa-lista" style="margin-top:12px">
        <li><b>A:</b> o que é da pessoa e se abre todo dia (sessões e cartões) fica no trilho; Estatísticas e Personalizar descem para o Mais. No celular, o Intérprete sai da barra e fica no Mais e no ladrilho “Conversar” do Início. <i>Decisão do dono.</i></li>
        <li><b>B:</b> “Praticar” junta Cartões e Jogos. Mantém o Intérprete na barra; os cartões ficam a dois toques.</li>
        <li><b>C:</b> o trilho não muda. Barata e reversível; não resolve a Biblioteca.</li>
        <li>Em todas: o ladrilho da revisão no Início é fixo e a Busca oferece “Estudar agora”.</li>
      </ul>
      ${grupos
        .map(
          (g) => `<h3>${g}</h3><div class="ad-mapa-espacos">${CT_PORTAS.filter((p) => p.g === g)
            .map((p) => `<section class="ad-mapa-item ativo"><header><h4>${p.nome}</h4><button type="button" data-ct-ver="${p.id}">Ver na tela</button></header>
              <dl><div><dt>Hoje</dt><dd>${p.hoje}</dd></div><div><dt>Porta</dt><dd>${p.porta}</dd></div><div><dt>Endereço</dt><dd><code>?ver=${p.id}</code></dd></div></dl></section>`)
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
        <li>Importar não lê arquivo: o baralho “Travel English” é de exemplo.</li>
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
  ctPintarTrilho();
  sincronizarBarraCt();
  if (QS.get('mapa') === 'portas') setTimeout(() => ctAbrirMapa(true), 900);
  if (ctPorta(QS.get('ver'))) setTimeout(() => ctVerPorta(QS.get('ver')), 700);
  else if (QS.get('tela') === 'cartoes') setTimeout(() => ((abaDe.cartoes = +QS.get('aba') || 0), mostrarSemAds('cartoes', { origem: 'seco' })), 300);
