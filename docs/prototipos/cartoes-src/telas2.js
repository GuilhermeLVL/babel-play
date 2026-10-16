  /* ==========================================================================
     Rodada 4 — Planos como tela (com acesso fácil), intérprete em conversa,
     Personalizar / Temporada / Loja redesenhados e os submenus reais do app.
     Mesmo escopo de prototipo.js e telas.js.
     ========================================================================== */
  const conta = { premium: false };
  const aba = (rotulo, sel, extra = '') => `<button type="button" role="tab" class="q-aba" aria-selected="${sel}" ${extra}>${rotulo}</button>`;

  /* Troca o miolo da tela mantendo a pílula das abas em movimento. */
  function repintar(html, dir = 1, deOnde = '.q-abas') {
    const antes = $$('.q-abas', tela).map(medir);
    const rol = rolagem()?.scrollTop || 0;
    tela.innerHTML = html;
    const r = rolagem();
    if (r) r.scrollTop = rol;
    $$('.q-abas', tela).forEach((g, i) => porPilula(g, antes[i]));
    if (!polido() || reduz()) return;
    const g = $(deOnde, tela);
    let topo = g;
    while (topo?.parentElement && !topo.parentElement.matches('.q-palco')) topo = topo.parentElement;
    let i = 0;
    for (let n = topo?.nextElementSibling; n; n = n.nextElementSibling) {
      anima(n, [{ opacity: 0, transform: `translateX(${56 * dir}px)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' }], { d: 520, atraso: Math.min(i++, 5) * 55 });
    }
  }
  /* Troca de tema ou de visual com a cor nova se abrindo em círculo a partir do clique. */
  function revelar(muda) {
    if (!polido() || reduz() || !document.startViewTransition) return muda();
    const [x, y] = ultimoPonto;
    const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    html.classList.add('px-vt');
    const vt = document.startViewTransition(muda);
    vt.ready
      .then(() => html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] }, { duration: 800 * K(), easing: EIO, pseudoElement: '::view-transition-new(root)' }))
      .catch(() => {});
    vt.finished.finally(() => html.classList.remove('px-vt'));
  }

  /* ==========================================================================
     Planos: uma tela de verdade, que a pessoa visita quando quiser
     ========================================================================== */
  let planosAba = 0;
  const TABELA = [
    ['Legenda bilíngue ao vivo, no aparelho', 'sem limite', 'sem limite'],
    ['Tradução rápida ao vivo', 1, 1],
    ['Tradução Nuance', 0, 1],
    ['Transcrição e tradução na nuvem', 'até 3 h por mês', 'sem limite no dia a dia*'],
    ['Tutor de IA (iChat)', 0, 1],
    ['Intérprete', 'cada um toca o seu lado', 'automático'],
    ['Jogos, vocabulário e revisão', 1, 1],
    ['Armazenamento', '500 MB', '500 MB'],
  ];
  const FAQ = [
    ['O teste cobra sozinho no fim?', 'Não. São 14 dias, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.'],
    ['Posso cancelar?', 'Pode, quando quiser. E há 7 dias para desistir com reembolso.'],
    ['O Grátis tem limite?', 'A legenda no aparelho não tem limite. A nuvem grátis é de até 3 h por mês, para aparelho fraco, quando disponível.'],
    ['O que é "uso justo"?', 'Até 2 h de nuvem por dia e 40 h por mês. Passando disso, a legenda segue no aparelho.'],
  ];
  const celula = (v) => (v === 1 ? `<span class="px-sim">${ic('check')}<span class="sr">Incluído</span></span>` : v === 0 ? '<span class="px-nao">—<span class="sr">Não incluído</span></span>' : v);
  function cartoesDePlano() {
    const p = conta.premium;
    return `<div class="q-grade g2 px-planos-grade">
      <section class="q-cartao px-plano"><p class="q-rotulo">${p ? '&nbsp;' : 'Seu plano'}</p><h3>Grátis</h3>
        <p class="px-preco"><b>R$ 0</b><span>para sempre</span></p><p class="q-d">Sem cartão, sem conta.</p>
        <ul>${li('Legenda bilíngue ao vivo, no aparelho, sem limite')}${li('Tradução rápida ao vivo')}${li('Jogos, vocabulário e revisão')}${li('Nuvem: até 3 h por mês, para aparelho fraco, quando disponível')}</ul>
        ${p ? '' : '<button type="button" class="q-ctl" data-px="ficar">Continuar grátis</button>'}</section>
      <section class="q-cartao px-plano px-premium"><p class="q-rotulo"><span class="q-tag">${p ? 'Em teste' : 'Recomendado'}</span> Tradução Nuance</p><h3>Premium</h3>
        <p class="px-preco"><b>R$ 19,90</b><span>por mês</span></p><p class="q-d">Para entender o jeito de dizer, não só a palavra.</p>
        <p class="px-tudo">Tudo do Grátis, e:</p>
        <ul>${li('Tradução Nuance: outras formas de dizer, formal ou informal, variantes e glossário')}${li('Nuvem sem limite no dia a dia', 'uso justo: até 2 h de nuvem por dia e 40 h por mês; passando disso, a legenda segue no aparelho')}${li('Tutor de IA (iChat) sobre o seu material')}${li('Intérprete automático: reconhece sozinho quem fala qual idioma')}${li('Voz natural no modo intérprete (em breve)')}</ul>
        ${p ? '<button type="button" class="q-ctl pri" data-px="assinar">Assinar Premium</button><p class="px-nota">Seu teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado.</p>' : '<button type="button" class="q-ctl pri" data-px="teste">Testar 14 dias grátis</button><button type="button" class="q-ctl" data-px="assinar">Assinar Premium</button><p class="px-nota">Sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.</p>'}</section>
    </div>`;
  }
  function htmlDosPlanos() {
    const p = conta.premium;
    const paineis = [
      () => `${cartoesDePlano()}
        <p class="px-garantia">${ic('lock')} Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser</p>
        <section class="q-secao"><header><div><h2>Comparar em detalhe</h2></div></header>
          <div class="q-tabela-caixa"><table class="q-tabela px-compara"><thead><tr><th scope="col">&nbsp;</th><th scope="col">Grátis</th><th scope="col">Premium</th></tr></thead>
          <tbody>${TABELA.map(([a, g, pr]) => `<tr><th scope="row">${a}</th><td>${celula(g)}</td><td>${celula(pr)}</td></tr>`).join('')}</tbody></table></div>
          <p class="px-nota">* uso justo: até 2 h de nuvem por dia e 40 h por mês; passando disso, a legenda segue no aparelho.</p></section>
        <section class="q-secao"><header><div><h2>Perguntas frequentes</h2></div></header>
          <div class="px-faq">${FAQ.map(([q, r]) => `<details class="q-cartao"><summary>${q}${ic('chevron-down')}</summary><p>${r}</p></details>`).join('')}</div></section>`,
      () => `<section class="q-cartao px-assinatura"><span class="q-ic">${ic(p ? 'sparkles' : 'user-round')}</span><div>
          <p class="q-rotulo">Sua assinatura</p><h2>${p ? 'Premium, em teste' : 'Você está no Grátis'}</h2>
          <p class="q-d">${p ? 'O teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.' : 'Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão. Quando quiser ir além, o Premium tem teste de 14 dias, sem cartão.'}</p>
          <div class="q-acoes">${p ? '<button type="button" class="q-ctl pri" data-px="assinar">Assinar Premium</button><button type="button" class="q-ctl" data-px="voltar-gratis">Voltar ao Grátis agora</button>' : '<button type="button" class="q-ctl pri" data-px="teste">Testar 14 dias grátis</button><button type="button" class="q-ctl" data-px-ir-aba="0">Comparar os planos</button>'}</div></div></section>`,
      () => `<div class="q-grade g2">${[
        ['Áudio transcrito na nuvem', p ? '42 min' : '42 min', p ? 'sem limite' : 'de 3 h do limite do plano', p ? 0 : 23],
        ['Chamadas à IA de nuvem', p ? '18' : '—', p ? 'do limite de hoje' : 'não incluído no seu plano', p ? 12 : -1],
        ['Tokens de IA (tradução e tutor)', p ? '24 mil' : '—', p ? 'do limite de hoje' : 'não incluído no seu plano', p ? 9 : -1],
        ['Armazenamento', '128 MB', 'de 500 MB do limite do plano', 26],
      ]
        .map(([t, v, s, pct]) => `<div class="q-cartao q-num px-consumo"><span class="q-rotulo">${t}</span><b>${v}</b>${pct >= 0 ? `<span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t}"><span style="width:${Math.max(pct, 2)}%"></span></span>` : ''}<span>${s}</span></div>`)
        .join('')}</div>
        ${p ? '' : `<div class="q-aviso"><span>${ic('lock')} Chamadas e tokens de IA de nuvem fazem parte do Premium. A legenda no aparelho continua sem limite.</span><button type="button" class="q-ctl" data-px-ir-aba="0">Ver planos</button></div>`}`,
    ];
    return `<div class="q-palco px-planos-tela">
      <header class="q-cab"><div><p class="q-sobre">Planos</p><h1>Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho</h1></div>
        <span class="q-chip px-meu-plano">${ic(p ? 'sparkles' : 'user-round')} ${p ? 'Premium · em teste' : 'Seu plano: Grátis'}</span></header>
      <div class="q-abas px-abas-planos" role="tablist" aria-label="Planos">${['Planos', 'Sua assinatura', 'Consumo do mês'].map((t, i) => aba(t, planosAba === i, `data-px-plano-aba="${i}"`)).join('')}</div>
      ${paineis[planosAba]()}
    </div>`;
  }
  Object.defineProperty(D.telas, 'planos', { get: () => htmlDosPlanos() }); /* por nome: planos4.js troca a tela inteira */

  function ativarTeste() {
    conta.premium = true;
    planosAba = 1;
    repintar(htmlDosPlanos(), 1);
    toast('Premium ativado por 14 dias. Sem cartão; no fim volta ao Grátis sozinho.');
    if (polido() && !reduz()) {
      navigator.vibrate?.([12, 60, 12]);
      confete(120);
    }
  }
  /* Entradas fixas: quem quer ver os planos não depende de uma oferta aparecer. */
  const entradaPremium = () =>
    `<button type="button" class="q-linha px-entrada-premium" data-px="planos"><span class="q-ic">${ic('sparkles')}</span><span><b>Planos e Premium</b><small>${conta.premium ? 'Premium em teste · 14 dias' : 'Você está no Grátis · teste o Premium por 14 dias, sem cartão'}</small></span><span class="q-fim">${ic('chevron-right')}</span></button>`;
  aoAbrirFolha.push((tipo, painel) => {
    if (tipo !== 'mais' || !polido() || $('.px-entrada-premium', painel)) return;
    $('.q-faixa-do-mais', painel)?.insertAdjacentHTML('beforebegin', entradaPremium());
  });
  /* MODO DESEMPENHO (08/10): os efeitos valem para todo mundo; quem tem aparelho fraco, ou prefere a
     tela parada, desliga tudo aqui, junto do tema e do som. Aparece também com a camada desligada,
     senão não haveria como religar. */
  aoAbrirFolha.push((tipo, painel) => {
    const faixa = tipo === 'mais' && $('.q-faixa-do-mais', painel);
    if (!faixa || $('[data-px-desempenho]', faixa)) return;
    const ligado = !polido();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-ctl';
    b.dataset.pxDesempenho = '';
    b.setAttribute('aria-pressed', String(ligado));
    b.title = 'Desliga animações, partículas, desfoque e sombras. Bom para aparelho fraco.';
    b.innerHTML = ic('gauge') + ' Modo desempenho: ' + (ligado ? 'ligado' : 'desligado');
    b.addEventListener('click', () => modo(polido() ? 'off' : 'on'));
    const vibra = $$('.q-ctl', faixa).find((x) => /Vibra/.test(x.textContent));
    faixa.insertBefore(b, vibra || null);
  });
  aoAbrirBusca.push((d) => {
    if (!polido()) return;
    const molde = $$('.cmd-item', d).pop();
    const novo = molde.cloneNode(true);
    novo.id = 'cmd-planos';
    novo.classList.remove('foco');
    $('.cmd-t', novo).textContent = 'Planos';
    $('.cmd-ico', novo).innerHTML = ic('sparkles');
    molde.after(novo);
  });
  DESTINO.Planos = 'planos';
  aoMostrar.inicio = () => {
    if (!polido()) return;
    $('.q-cab', tela).insertAdjacentHTML('beforeend', `<button type="button" class="q-chip px-plano-chip" data-px="planos">${ic('sparkles')} ${conta.premium ? 'Premium · em teste' : 'Grátis · Ver planos'}</button>`);
  };
  aoMostrar.ajustes = () => {
    if (!polido() || (abaDe.ajustes || 0) !== 5) return;
    $(PRIMARIA.ajustes, tela)?.insertAdjacentHTML('afterend', `<div class="q-aviso px-plano-na-conta"><span><b>${conta.premium ? 'Seu plano: Premium, em teste' : 'Seu plano: Grátis'}</b><br>Veja o que cada plano inclui, o seu consumo e a sua assinatura.</span><button type="button" class="q-ctl" data-px="planos">Ver planos</button></div>`);
  };

  /* ==========================================================================
     Intérprete em conversa (ModoInterprete.tsx): duas metades, cada um toca a sua
     ========================================================================== */
  const DIALOGO = {
    meu: [
      ['Oi, tudo bem? Onde fica a estação de trem?', 'Hi, how are you? Where is the train station?'],
      ['Obrigado! Você sabe a que horas sai o próximo trem?', 'Thank you! Do you know what time the next train leaves?'],
      ['Perfeito. Tenha um ótimo dia!', 'Perfect. Have a great day!'],
    ],
    outro: [
      ["It's two blocks away, next to the bakery.", 'Fica a duas quadras daqui, ao lado da padaria.'],
      ['In ten minutes. You should hurry.', 'Em dez minutos. É melhor você se apressar.'],
      ['You too. Safe travels!', 'Você também. Boa viagem!'],
    ],
  };
  let int = null;
  const metade = (lado, idioma, quem) => `<section class="int-metade" data-lado="${lado}" ${lado === 'outro' ? 'data-virada' : ''} aria-label="Lado de quem fala ${idioma}">
      <p class="int-idioma"><span class="int-quem">${quem}</span> · ${idioma}</p>
      <div class="int-frase"><p class="int-dica">Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.</p></div>
      <p class="int-status" role="status"></p>
      <div class="int-acoes">
        <button type="button" class="int-ib" aria-label="Repetir a tradução">${ic('rotate-ccw')}<span>Repetir</span></button>
        <button type="button" class="int-falar" data-px-falar="${lado}" aria-label="Falar em ${idioma}">${ic('mic')}<span aria-hidden="true">Falar</span></button>
        <button type="button" class="int-ib" aria-label="Parar a voz">${ic('volume2')}<span>Parar voz</span></button>
      </div></section>`;
  D.telas.interpretando = `<div class="int px-int" aria-label="Modo intérprete">
    ${metade('outro', 'English (US)', 'A outra pessoa')}
    <div class="int-faixa" data-com-modo>
      <div class="int-esq">
        <button type="button" class="int-ib peq" aria-label="Trocar os lados" data-px="trocar-lados">${ic('arrow-up-down')}</button>
        <button type="button" class="int-modo" aria-pressed="false" aria-label="Modo automático: o app reconhece quem fala qual idioma" data-px="automatico">${ic('lock')}<span aria-hidden="true">Automático</span></button>
        <button type="button" class="int-modo" aria-pressed="false" aria-label="Ver a conversa em lista" data-px="lista">${ic('list-checks')}<span class="int-modo-txt" aria-hidden="true">Conversa</span></button>
      </div>
      <div class="int-centro"><span class="int-voz">${ic('volume2')}<span class="int-voz-txt">Voz do aparelho</span></span><span class="int-aviso" role="status"></span></div>
      <button type="button" class="int-ib peq" aria-label="Sair do modo intérprete" data-px="sair">${ic('x')}</button>
    </div>
    ${metade('meu', 'Português (BR)', 'Você')}
  </div>`;
  const ladoOposto = (l) => (l === 'meu' ? 'outro' : 'meu');
  async function falar(lado) {
    const s = int;
    if (!s || s.ocupado) return;
    const par = DIALOGO[lado][s.n[lado] % DIALOGO[lado].length];
    s.n[lado]++;
    s.ocupado = true;
    const aqui = $(`.int-metade[data-lado="${lado}"]`, tela);
    const la = $(`.int-metade[data-lado="${ladoOposto(lado)}"]`, tela);
    const botao = $('.int-falar', aqui);
    const st = (m, t) => ($('.int-status', m).textContent = t);
    botao.setAttribute('data-ouvindo', '');
    sentir('grava');
    $('span', botao).textContent = 'Parar';
    st(aqui, 'Ouvindo…');
    const frase = $('.int-frase', aqui);
    frase.innerHTML = '<p class="int-ao-vivo"></p>';
    for (const p of par[0].split(' ')) {
      if (int !== s) return;
      const w = document.createElement('span');
      w.className = 'int-w';
      w.textContent = p + ' ';
      frase.firstChild.append(w);
      if (polido() && !reduz()) anima(w, [{ opacity: 0, filter: 'blur(5px)', transform: 'translateY(5px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { d: 300 });
      await espera(polido() ? 170 : 90);
    }
    botao.removeAttribute('data-ouvindo');
    $('span', botao).textContent = 'Falar';
    st(aqui, 'Traduzindo…');
    await espera(700);
    if (int !== s) return;
    st(aqui, '');
    /* A tradução aparece do lado de quem escuta; a original fica pequena embaixo. */
    const alvo = $('.int-frase', la);
    alvo.innerHTML = `<p class="int-traducao">${esc(par[1])}</p><p class="int-original">${esc(par[0])}</p>`;
    st(la, 'Lendo a tradução');
    sentir('chega');
    if (polido() && !reduz()) {
      navigator.vibrate?.(8);
      const faixa = $('.int-faixa', tela);
      anima(faixa, [{ boxShadow: 'inset 0 0 0 0 transparent' }, { boxShadow: 'inset 0 0 40px 0 color-mix(in srgb, var(--accent) 60%, transparent)' }, { boxShadow: 'inset 0 0 0 0 transparent' }], { d: 700, e: 'ease' });
      anima($('.int-traducao', alvo), [{ opacity: 0, transform: 'translateY(26px) scale(0.94)', filter: 'blur(10px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { d: 620, e: MOLA_SUAVE });
      anima($('.int-original', alvo), [{ opacity: 0 }, { opacity: 1 }], { d: 400, atraso: 260, e: 'ease' });
      la.classList.add('px-lendo');
    }
    s.hist.push([lado, par[0], par[1]]);
    await espera(1700);
    if (int !== s) return;
    la.classList.remove('px-lendo');
    st(la, '');
    s.ocupado = false;
    if (s.auto) {
      await espera(500);
      if (int === s && s.auto) falar(ladoOposto(lado));
    }
  }
  function listaDaConversa() {
    const s = int;
    const aberta = $('.int-conversa', tela);
    const b = $('[data-px="lista"]', tela);
    if (aberta) {
      aberta.remove();
      b.setAttribute('aria-pressed', 'false');
      $$('.int-metade', tela).forEach((m) => (m.hidden = false));
      return;
    }
    b.setAttribute('aria-pressed', 'true');
    $$('.int-metade', tela).forEach((m) => (m.hidden = true));
    $('.int-faixa', tela).insertAdjacentHTML(
      'afterend',
      `<section class="int-conversa" aria-label="Conversa"><div class="int-conversa-topo"><button type="button" class="int-modo" data-px="exportar">${ic('download')}<span>Exportar</span></button></div>
       <div class="int-bolhas">${s.hist.length ? s.hist.map(([l, o, t]) => `<div class="int-bolha" data-lado="${l}"><p class="int-bolha-idioma">${l === 'meu' ? 'Você' : 'A outra pessoa'}</p><p class="int-bolha-fala">${esc(o)}</p><p class="int-bolha-trad">${esc(t)}</p></div>`).join('') : '<p class="int-dica">A conversa aparece aqui conforme vocês falam.</p>'}</div></section>`,
    );
    if (polido() && !reduz()) $$('.int-bolha', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: `translateX(${x.dataset.lado === 'meu' ? 30 : -30}px) scale(0.96)` }, { opacity: 1, transform: 'translateX(0) scale(1)' }], { d: 460, atraso: i * 70, e: MOLA_SUAVE }));
  }
  function modoAutomatico(b) {
    const aviso = $('.int-aviso', tela);
    if (!conta.premium) {
      aviso.textContent = 'O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.';
      if (!$('.px-int-conhecer', tela)) $('.int-centro', tela).insertAdjacentHTML('beforeend', '<button type="button" class="int-modo px-int-conhecer" data-px="planos">Conhecer o Premium</button>');
      if (polido() && !reduz()) anima(b, [0, -5, 5, -3, 3, 0].map((v) => ({ transform: `translateX(${v}px)` })), { d: 360, e: 'ease-out' });
      return;
    }
    int.auto = !int.auto;
    b.setAttribute('aria-pressed', int.auto);
    aviso.textContent = int.auto ? 'Automático ligado: é só conversar. O app reconhece quem fala qual idioma.' : '';
    $$('.int-falar span', tela).forEach((x) => (x.textContent = int.auto ? 'Ouvir' : 'Falar'));
    if (int.auto) falar('meu');
  }
  aoMostrar.interpretando = () => {
    int = { n: { meu: 0, outro: 0 }, hist: [], ocupado: false, auto: false };
    if (conta.premium) $('[data-px="automatico"]', tela).firstElementChild.outerHTML = ic('languages');
    if (!polido() || reduz()) return;
    $$('.int-metade', tela).forEach((m, i) => anima(m, [{ opacity: 0, transform: `translateY(${i ? 60 : -60}px)` }, { opacity: 1, transform: 'translateY(0)' }], { d: 700, e: MOLA_SUAVE }));
    anima($('.int-faixa', tela), [{ opacity: 0, transform: 'scaleX(0.6)' }, { opacity: 1, transform: 'scaleX(1)' }], { d: 600, atraso: 150 });
    $$('.int-falar', tela).forEach((b, i) => anima(b, [{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { d: 700, atraso: 300 + i * 120, e: MOLA }));
  };
  aoSair.interpretando = () => (int = null);

  /* ==========================================================================
     Personalizar, Temporada e Loja redesenhados (só no modo Polido)
     ========================================================================== */
  const TEMAS = [
    ['babel', 'Babel Atelier', 'seu'],
    ['linear', 'Linear Indigo', 'nivel'],
    ['papel', 'Papel', 'loja'],
    ['jardim', 'Jardim', 'loja'],
    ['aurora', 'Aurora', 'loja'],
    ['mochi', 'Mochi', 'loja'],
    ['notion', 'Notion', 'loja'],
    ['vercel', 'Vercel', 'loja'],
    ['radio', 'Rádio', 'loja'],
    ['neon', 'Neon', 'loja'],
    ['fliperama', 'Fliperama', 'loja'],
    ['observatorio', 'Observatório', 'temporada'],
  ];
  const ROTULO_DO_TEMA = { seu: 'Na sua coleção', nivel: 'Chega no nível 4', loja: 'Na Loja', temporada: 'Na Temporada 1' };
  let temaEquipado = 'babel';
  let temaEmProva = null;
  /* Lê as cores de cada tema direto do CSS do app (troca o atributo e destroca no mesmo quadro). */
  const amostras = {};
  function lerAmostras() {
    if (amostras.babel) return;
    const era = html.dataset.theme;
    for (const [id] of TEMAS) {
      html.dataset.theme = id;
      const cs = getComputedStyle(html);
      amostras[id] = ['--canvas', '--surface', '--accent', '--ink'].map((v) => cs.getPropertyValue(v).trim() || '#888');
    }
    html.dataset.theme = era;
  }
  const lojaEstado = { cat: 'Tudo', compradas: new Set() };
  const LOJA = [
    ['Legenda Cinema', 'Legendas', 'Faixa por trás da fala e entrada suave; a palavra aprendida muda de cor.', 350, 'legenda'],
    ['Partículas Pixel', 'Partículas e rastros', 'Quadradinhos 8-bits em cada acerto.', 350, 'pixel'],
    ['Acerto Pixel', 'Efeitos de jogo', 'Quadradinhos verdes saltam de cada acerto.', 350, 'pixel'],
    ['Cartão Caderno', 'Cartões', 'Folha pautada: a margem acende ao aprender e a orelha dobra ao dominar.', 360, 'cartao'],
    ['Combo Brasa', 'Efeitos de jogo', 'O multiplicador sobe numa labareda curta.', 360, 'brasa'],
    ['Legenda Fita', 'Legendas', 'Marca-texto sob a fala; a palavra aprendida ganha o seu próprio destaque.', 380, 'fita'],
    ['Paletas Pastel', 'Temas', '30 paletas suaves, uma por matiz.', 380, 'paleta'],
    ['Acerto Confete', 'Efeitos de jogo', 'Um punhado de papel picado na cor do tema.', 380, 'confete'],
    ['Acerto Brasa', 'Efeitos de jogo', 'Faíscas douradas que sobem e somem.', 400, 'brasa'],
  ];
  const ARTE = {
    legenda: '<span class="px-arte-leg"><b>We ship the <u>roadmap</u> today.</b><i>Entregamos o roteiro hoje.</i></span>',
    fita: '<span class="px-arte-leg fita"><b>We ship the <u>roadmap</u> today.</b><i>Entregamos o roteiro hoje.</i></span>',
    pixel: '<span class="px-arte-pixel">' + '<i></i>'.repeat(9) + '</span>',
    cartao: '<span class="px-arte-cartao"><b>roadmap</b><i>roteiro</i></span>',
    brasa: '<span class="px-arte-brasa">×3</span>',
    paleta: '<span class="px-arte-paleta">' + ['#f6c9c0', '#f8e3b5', '#cfe8cf', '#c6dff2', '#dccdf0', '#f3cde1'].map((c) => `<i style="background:${c}"></i>`).join('') + '</span>',
    confete: '<span class="px-arte-confete">' + '<i></i>'.repeat(12) + '</span>',
  };
  const TRILHA = [
    [1, '', 'Sírius'],
    [2, '+60 Seeds', 'Moldura Órion'],
    [3, '', 'Vega'],
    [4, '+70 Seeds', 'Moldura Lira'],
    [5, '', 'Altair'],
    [6, '+80 Seeds', 'Moldura Cisne'],
    [7, '', 'Rigel'],
    [8, 'Luneta', 'Moldura Cruzeiro do Sul'],
    [9, '', 'Antares'],
    [10, '+90 Seeds', 'Moldura Escorpião'],
  ];
  const temporada = { nivel: 3, xp: 60, resgatados: new Set() };
  const cabecaDoPersonalizar = (i) => `<header class="q-cab"><div><p class="q-sobre">Seu visual</p><h1>Personalizar</h1></div><span class="q-chip px-seeds">${ic('sprout')}<span>${ex.seeds}</span> Seeds</span></header>
    <div class="q-abas qp-abas" role="tablist" aria-label="Personalizar">${[['shirt', 'Coleção', '4'], ['trophy', 'Maestria', '0/18'], ['map', 'Temporada', ''], ['trophy', 'Conquistas', '0/40'], ['shopping-bag', 'Loja', '']]
      .map(([icone, t, n], k) => aba(`${ic(icone)}${t}${n ? ` <span class="n">${n}</span>` : ''}`, k === i))
      .join('')}</div>`;
  const htmlDaColecao = () => {
    lerAmostras();
    return `<div class="px-atelie">
      <section class="q-cartao px-vitrine"><p class="q-rotulo">Como está agora${temaEmProva ? ' · em prévia' : ''}</p>
        <div class="px-vitrine-tela"><div class="px-vitrine-leg"><b>We ship the <u>roadmap</u> today.</b><i>Entregamos o roteiro hoje.</i></div>
          <div class="px-vitrine-cartoes"><span>nova</span><span class="ap">aprendida</span><span class="do">dominada</span></div>
          <div class="px-vitrine-barra"><i></i></div></div>
        <div class="px-vitrine-pe"><div><p class="q-rotulo">Tema</p><b>${TEMAS.find((t) => t[0] === (temaEmProva || temaEquipado))[1]}</b></div>
          ${temaEmProva ? `<div class="q-acoes"><button type="button" class="q-ctl" data-px-tema="${temaEquipado}">Voltar ao ${TEMAS.find((t) => t[0] === temaEquipado)[1]}</button>${TEMAS.find((t) => t[0] === temaEmProva)[2] === 'seu' ? '<button type="button" class="q-ctl pri" data-px="equipar">Equipar</button>' : `<button type="button" class="q-ctl pri" data-px="ver-na-loja">${ROTULO_DO_TEMA[TEMAS.find((t) => t[0] === temaEmProva)[2]]}</button>`}</div>` : `<span class="q-tag">${ic('check')} Equipado</span>`}</div></section>
      <section class="q-secao px-temas"><header><div><h2>Temas</h2><p>Toque para experimentar no app inteiro. Nada muda de verdade até você equipar.</p></div></header>
        <div class="px-temas-grade">${TEMAS.map(([id, nome, st]) => `<button type="button" class="q-tile px-tema" data-px-tema="${id}" aria-pressed="${(temaEmProva || temaEquipado) === id}"><span class="px-amostra">${amostras[id].map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>${nome}</b><span class="q-d">${id === temaEquipado ? 'Equipado' : ROTULO_DO_TEMA[st]}${st === 'seu' ? '' : ' ' + ic('lock')}</span></button>`).join('')}</div></section>
    </div>
    <div class="q-grade g4">${[['palette', 'Tema', TEMAS.find((t) => t[0] === temaEquipado)[1]], ['sparkles', 'Partículas', 'Do tema'], ['type', 'Fonte', 'Padrão (Inter)'], ['panel-left', 'Menu', 'Trilho de ícones']].map(([i, r, v]) => `<button type="button" class="q-linha"><span class="q-ic">${ic(i)}</span><span><small class="q-rotulo">${r}</small><b>${v}</b></span></button>`).join('')}</div>`;
  };
  const htmlDaTemporada = () => {
    const pct = Math.round((temporada.xp / 150) * 100);
    return `<section class="q-cartao escuro px-temporada"><div class="px-ceu" aria-hidden="true"></div>
        <div class="px-temp-texto"><p class="q-rotulo">Temporada 1 · Observatório</p><h2>Nível ${temporada.nivel} de 30</h2>
          <p>De 1 de outubro a 25 de novembro · termina em 50 dias. O que você ganha não expira.</p>
          <span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="150" aria-valuenow="${temporada.xp}" aria-label="XP da temporada"><span style="width:${pct}%"></span></span>
          <p class="px-nota">${temporada.xp} / 150 XP · faltam ${150 - temporada.xp} XP · a seguir: +70 Seeds, no nível 4. Sobe com o XP de estudo ganho na temporada.</p></div>
        <div class="px-anel" style="--pct:${pct}"><b>${temporada.nivel}</b><span>nível</span></div></section>
      <section class="q-secao"><header><div><h2>Trilha de recompensas</h2><p>Em cima, o que vem estudando. Embaixo, o que vem com a assinatura.</p></div><span class="q-chip">1–10</span></header>
        <div class="px-trilha"><div class="px-trilha-rotulos"><span>Grátis<small>estudando</small></span><span></span><span>Assinante<small>com a assinatura</small></span></div>
        ${TRILHA.map(([n, g, a]) => {
          const feito = n <= temporada.nivel;
          const pega = (qual, r) => (!r ? '<span class="px-premio vazio">·</span>' : `<button type="button" class="px-premio ${feito ? 'feito' : ''} ${temporada.resgatados.has(qual + n) ? 'pego' : ''} ${qual === 'a' && !conta.premium ? 'trancado' : ''}" data-px-premio="${qual}${n}" data-rotulo="${esc(r)}" ${feito ? '' : 'disabled'}>${qual === 'a' && !conta.premium ? ic('lock') : temporada.resgatados.has(qual + n) ? ic('check') : ic(/Seeds/.test(r) ? 'sprout' : 'star')}<b>${r}</b><small>${temporada.resgatados.has(qual + n) ? 'resgatado' : feito ? (qual === 'a' && !conta.premium ? 'com a assinatura' : 'resgatar') : 'nível ' + n}</small></button>`);
          return `<div class="px-degrau ${feito ? 'feito' : ''} ${n === temporada.nivel + 1 ? 'proximo' : ''}">${pega('g', g)}<span class="px-no">${n}</span>${pega('a', a)}</div>`;
        }).join('')}</div>
        ${conta.premium ? '' : `<div class="q-aviso"><span>${ic('lock')} A trilha de baixo vem com a assinatura. O que é de uma temporada volta à Loja com Seeds um ano depois do fim.</span><button type="button" class="q-ctl" data-px="planos">Conhecer o Premium</button></div>`}
        <p class="px-nota">Não existe compra de nível: a temporada sobe só com o XP de estudo.</p></section>`;
  };
  const htmlDaLoja = () => {
    const cats = ['Tudo', 'Temas', 'Legendas', 'Cartões', 'Efeitos de jogo', 'Partículas e rastros'];
    const itens = LOJA.filter((x) => lojaEstado.cat === 'Tudo' || x[1] === lojaEstado.cat);
    return `<section class="q-cartao px-carteira"><span class="q-ic">${ic('sprout')}</span><div><p class="q-rotulo">Seeds</p><b class="px-saldo">${ex.seeds}</b>
        <p class="q-d">Vêm de estudar e compram tudo o que está na prateleira de Seeds. Não se compram com dinheiro.</p></div>
        <button type="button" class="q-ctl" data-px="ganhar">${ic('gamepad-2')} Ganhar jogando</button></section>
      <div class="q-abas q-seg px-cats" role="group" aria-label="Categoria">${cats.map((c) => `<button type="button" class="q-aba" aria-checked="${lojaEstado.cat === c}" data-px-cat="${c}">${c}</button>`).join('')}</div>
      <div class="px-loja">${
        itens
          .map(([nome, cat, desc, preco, arte]) => {
            const tem = lojaEstado.compradas.has(nome);
            const falta = Math.max(0, preco - ex.seeds);
            return `<article class="q-cartao px-item ${tem ? 'tem' : ''}" data-item="${esc(nome)}"><div class="px-arte" data-arte="${arte}">${ARTE[arte]}</div>
            <p class="q-rotulo"><span class="q-tag">Comum</span> ${cat}</p><h3>${nome}</h3><p class="q-d">${desc}</p>
            <div class="px-item-pe">${tem ? `<span class="q-tag">${ic('check')} Na sua coleção</span>` : `<span class="q-chip px-preco-seeds">${ic('sprout')} ${preco}</span>${falta ? `<span class="px-falta"><span class="q-barra"><span style="width:${Math.round((ex.seeds / preco) * 100)}%"></span></span><small>Faltam ${falta} Seeds</small></span>` : `<button type="button" class="q-ctl pri px-segurar" data-px-comprar="${esc(nome)}"><span class="px-segurar-fundo" aria-hidden="true"></span><span>Segure para comprar</span></button>`}`}
              <button type="button" class="q-ctl" data-px-previa="${arte}">Ver prévia</button></div></article>`;
          })
          .join('') || '<div class="q-vazio"><h2>Nada nesta prateleira ainda</h2></div>'
      }</div>`;
  };
  redesenho.personalizar = () => {
    const i = abaDe.personalizar || 0;
    if (i === 1 || i === 3) return null; /* Maestria e Conquistas ficam como estão em produção */
    return `<div class="q-palco qp px-personalizar">${cabecaDoPersonalizar(i)}${[htmlDaColecao, null, htmlDaTemporada, null, htmlDaLoja][i]()}</div>`;
  };
  function provarTema(id) {
    revelar(() => {
      temaEmProva = id === temaEquipado ? null : id;
      html.dataset.theme = id;
      corDasParticulas();
      if (atual === 'personalizar') {
        const rol = rolagem()?.scrollTop || 0;
        tela.innerHTML = fonteDe('personalizar');
        rolagem().scrollTop = rol;
        $$('.q-abas', tela).forEach((g) => porPilula(g));
      }
      reposicionar();
    });
  }
  aoSair.personalizar = () => {
    if (!temaEmProva) return;
    temaEmProva = null;
    html.dataset.theme = temaEquipado;
    corDasParticulas();
  };
  function previaDoEfeito(arte, deOnde) {
    const [x, y] = centro(deOnde);
    if (arte === 'confete') return confete(90);
    if (arte === 'pixel' || arte === 'brasa') return rajada(x, y, 26, 1.3);
    toast('Prévia aplicada na vitrine da Coleção.');
  }
  /* Segurar para comprar: gastar Seeds não pode acontecer num toque sem querer. */
  function armarCompra(b) {
    const fundo = $('.px-segurar-fundo', b);
    const nome = b.dataset.pxComprar;
    const item = LOJA.find((x) => x[0] === nome);
    const a = anima(fundo, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { d: 1100, e: 'linear', fill: 'forwards' });
    const calar = somSegurar();
    const soltar = () => {
      calar();
      a.finished.catch(() => {});
      a.cancel();
      limpar(fundo);
      anima(fundo, [{ clipPath: 'inset(0 0 0 0)', opacity: 0.6 }, { clipPath: 'inset(0 100% 0 0)', opacity: 0 }], { d: 200 });
    };
    b.addEventListener('pointerup', soltar, { once: true });
    b.addEventListener('pointerleave', soltar, { once: true });
    a.finished.then(() => {
      b.removeEventListener('pointerup', soltar);
      b.removeEventListener('pointerleave', soltar);
      calar();
      sentir('moeda');
      const de = ex.seeds;
      ex.seeds -= item[3];
      lojaEstado.compradas.add(nome);
      const cartao = b.closest('.px-item');
      const [x, y] = centro(cartao);
      repintar(`<div class="q-palco qp px-personalizar">${cabecaDoPersonalizar(4)}${htmlDaLoja()}</div>`, 0, '.px-nada');
      toast(`${nome} agora é seu.`);
      const saldo = $('.px-saldo', tela);
      const chip = $('.px-seeds span', tela);
      contar((v) => ((saldo.textContent = v), (chip.textContent = v)), de, ex.seeds, 900);
      if (polido() && !reduz()) {
        navigator.vibrate?.([10, 40, 16]);
        rajada(x, y, 34, 1.4);
        const novo = $(`.px-item[data-item="${CSS.escape(nome)}"]`, tela);
        if (novo) anima(novo, [{ transform: 'scale(0.94) rotateY(60deg)' }, { transform: 'scale(1) rotateY(0deg)' }], { d: 760, e: MOLA_SUAVE });
      }
    }, () => {});
  }
  raiz.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('[data-px-comprar]');
    if (b) armarCompra(b);
  });

  /* ==========================================================================
     Submenus reais do app (capturados de produção em D.sub)
     ========================================================================== */
  D.telas.sobre = D.sub['tela:Sobre'].html;
  D.telas.ajuda = D.sub['tela:Ajuda e suporte'].html;
  function fecharDialogo(d) {
    const some = () => {
      d.close();
      d.remove();
    };
    if (!polido() || reduz()) return some();
    if (celular()) return anima(d, [{ transform: 'translateY(100%)' }], { d: 300, e: EG, fill: 'forwards' }).finished.then(some, some);
    anima(d, [{ opacity: 0, transform: 'scale(0.94)', filter: 'blur(6px)' }], { d: 200, fill: 'forwards' }).finished.then(some, some);
  }
  function abrirDialogo(chave, gatilho) {
    const item = D.sub[chave];
    if (!item) return;
    app.insertAdjacentHTML('beforeend', item.html.replace(' open=""', ''));
    const d = app.lastElementChild;
    d.showModal();
    d.addEventListener('cancel', (e) => (e.preventDefault(), fecharDialogo(d)));
    d.addEventListener('click', (e) => {
      if (e.target === d) return fecharDialogo(d);
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('x') || b.closest('.dlg-pe')) return fecharDialogo(d);
      if (b.classList.contains('q-interruptor') || b.getAttribute('role') === 'switch') return b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true');
      if (b.classList.contains('q-aba')) return abaLocal(b);
      if (b.getAttribute('role') === 'radio') {
        $$('[role="radio"]', b.parentElement).forEach((x) => x.setAttribute('aria-checked', x === b));
        if (b.closest('[role="listbox"], .lista-idiomas')) fecharDialogo(d);
      }
    });
    $$('.q-abas', d).forEach((g) => porPilula(g));
    if (!polido() || reduz()) return;
    if (celular()) {
      /* No celular o painel é uma folha: sobe de baixo. */
      anima(d, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { d: 600, e: MOLA_SUAVE });
      $$('.dlg-corpo > *, .dlg-pe > *', d).slice(0, 10).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 440, atraso: 140 + i * 45 }));
      return;
    }
    /* Nasce do botão que abriu: a origem do crescimento é o centro do gatilho. */
    const r = d.getBoundingClientRect();
    const g = gatilho?.getBoundingClientRect();
    d.style.transformOrigin = g ? `${g.left + g.width / 2 - r.left}px ${g.top + g.height / 2 - r.top}px` : '50% 50%';
    anima(d, [{ opacity: 0, transform: 'scale(0.6)', filter: 'blur(10px)' }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 560, e: MOLA_SUAVE });
    $$('.dlg-corpo > *, .dlg-pe > *', d).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 140 + Math.min(i, 10) * 45 }));
  }
  /* Estados que se abrem na própria tela (Trilha, "Por que este?", Conversa virtual). */
  let estadoAberto = null;
  function alternarEstado(chave) {
    const abrir = estadoAberto !== chave;
    estadoAberto = abrir ? chave : null;
    const antes = new Set($$('*', tela).map((x) => x.textContent.length + x.tagName));
    const rol = rolagem()?.scrollTop || 0;
    tela.innerHTML = abrir ? D.sub[chave].html : fonteDe(atual);
    const r = rolagem();
    if (r) r.scrollTop = rol;
    $$('.q-abas', tela).forEach((g) => porPilula(g));
    if (!polido() || reduz() || !abrir) return;
    /* Só o que é novo entra animado: o resto da tela não se mexe. */
    const novos = $$('.q-palco *, .tela *', tela).filter((x) => !antes.has(x.textContent.length + x.tagName) && !x.children.length);
    novos.slice(0, 24).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(-10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420, atraso: i * 22 }));
  }
  aoSair.jogar = aoSair.interprete = () => (estadoAberto = null);

  /* ---- Ligações ---------------------------------------------------------------- */
  ganchos.push((e, b) => {
    const t = txt(b);
    const rot = b.getAttribute('aria-label') || '';
    if (b.dataset.px === 'planos') return ir('planos'), true;
    if (atual === 'planos') {
      if (b.dataset.pxPlanoAba) return (planosAba = +b.dataset.pxPlanoAba), repintar(htmlDosPlanos(), 1, '.px-abas-planos'), true;
      if (b.dataset.pxIrAba) return (planosAba = +b.dataset.pxIrAba), repintar(htmlDosPlanos(), -1, '.px-abas-planos'), true;
      if (b.dataset.px === 'teste') return ativarTeste(), true;
      if (b.dataset.px === 'assinar') return toast('No app, aqui abre o pagamento do Premium.'), true;
      if (b.dataset.px === 'ficar') return ir('inicio'), true;
      if (b.dataset.px === 'voltar-gratis') return (conta.premium = false), repintar(htmlDosPlanos(), -1, '.px-abas-planos'), toast('Você voltou ao Grátis. Nada foi cobrado.'), true;
    }
    if (atual === 'interprete') {
      if (b.dataset.testid === 'comecar-conversa') return ir('interpretando'), true;
      if (b.classList.contains('campo-idioma')) return abrirDialogo('interprete:idioma', b), true;
      if (/^Conversa virtual/.test(t)) return alternarEstado('interprete:Conversa virtual'), true;
    }
    if (atual === 'interpretando') {
      if (b.dataset.pxFalar) return falar(b.dataset.pxFalar), true;
      if (b.dataset.px === 'sair') return ir('interprete'), true;
      if (b.dataset.px === 'lista') return listaDaConversa(), true;
      if (b.dataset.px === 'automatico') return modoAutomatico(b), true;
      if (b.dataset.px === 'exportar') return toast('No app, a conversa sai em texto.'), true;
      if (b.dataset.px === 'trocar-lados') {
        const [a, c] = $$('.int-metade', tela);
        const ra = a.getBoundingClientRect().top;
        const rc = c.getBoundingClientRect().top;
        c.parentElement.insertBefore(c, a);
        $('.int-faixa', tela).after(a);
        a.toggleAttribute('data-virada');
        c.toggleAttribute('data-virada');
        if (polido() && !reduz()) {
          anima(a, [{ translate: `0 ${ra - a.getBoundingClientRect().top}px` }, { translate: '0 0' }], { d: 620, e: MOLA_SUAVE });
          anima(c, [{ translate: `0 ${rc - c.getBoundingClientRect().top}px` }, { translate: '0 0' }], { d: 620, e: MOLA_SUAVE });
        }
        return true;
      }
      return true;
    }
    if (atual === 'personalizar' && polido()) {
      if (b.dataset.pxTema) return provarTema(b.dataset.pxTema), true;
      if (b.dataset.px === 'equipar') return (temaEquipado = temaEmProva), (temaEmProva = null), repintar(fonteDe('personalizar'), 0, '.px-nada'), toast('Tema equipado.'), true;
      if (b.dataset.px === 'ver-na-loja') return mostrar('personalizar', { aba: 4, origem: 'aba' }), true;
      if (b.dataset.pxCat) return (lojaEstado.cat = b.dataset.pxCat), repintar(fonteDe('personalizar'), 1, '.px-cats'), true;
      if (b.dataset.pxPrevia) return previaDoEfeito(b.dataset.pxPrevia, b), true;
      if (b.dataset.pxComprar) return true;
      if (b.dataset.px === 'ganhar') return ir('jogar'), true;
      if (b.dataset.pxPremio) {
        const k = b.dataset.pxPremio;
        if (b.classList.contains('trancado')) return toast('Esta recompensa vem com a assinatura.'), true;
        if (temporada.resgatados.has(k)) return true;
        temporada.resgatados.add(k);
        sentir('moeda');
        const ganho = +(b.dataset.rotulo.match(/\+(\d+) Seeds/) || [])[1] || 0;
        const de = ex.seeds;
        ex.seeds += ganho;
        const [x, y] = centro(b);
        repintar(fonteDe('personalizar'), 0, '.px-nada');
        toast(`Resgatado: ${b.dataset.rotulo}`);
        const chip = $('.px-seeds span', tela);
        contar((v) => (chip.textContent = v), de, ex.seeds, 800);
        if (polido() && !reduz()) rajada(x, y, 24, 1.2), navigator.vibrate?.(12);
        return true;
      }
    }
    if (atual === 'jogar') {
      for (const n of ['Buscar e filtrar', 'Favoritos e ordem', 'Opções']) if (t.startsWith(n)) return abrirDialogo('jogar:' + n, b), true;
      if (t.startsWith('Por que este?')) return alternarEstado('jogar:Por que este?'), true;
      if (b.closest('.qj-trilha') && b.matches('.q-linha')) return alternarEstado('jogar:Trilha'), true;
    }
    if (atual === 'capturar') {
      for (const n of ['Modelo no dispositivo', 'Ajustes da captura', 'Ajuda']) if (rot.startsWith(n)) return abrirDialogo('capturar:' + n, b), true;
      if (t.startsWith('Detectar')) return abrirDialogo('capturar:Detectar', b), true;
    }
    return false;
  });
  /* Perguntas frequentes: abrem com altura animada, não num salto. */
  tela.addEventListener('click', (e) => {
    const s = e.target.closest('.px-faq summary');
    if (!s || !polido() || reduz()) return;
    const d = s.parentElement;
    e.preventDefault();
    const h0 = d.offsetHeight;
    d.open = !d.open;
    const h1 = d.offsetHeight;
    d.style.overflow = 'hidden';
    anima(d, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { d: 420, e: MOLA_SUAVE, fill: 'none' }).finished.then(() => (d.style.overflow = ''));
    if (d.open) anima($('p', d), [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 360, atraso: 80 });
  });
