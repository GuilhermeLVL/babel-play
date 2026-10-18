  /* ==========================================================================
     Rodada 7 — no celular, Capturar e Intérprete abrem direto na tela de uso.
     A tela de entrada (título, três passos, botão Começar) é um toque a mais
     num aparelho onde a pessoa já chegou decidida. O que ela tinha de útil
     (idiomas, ajustes, ajuda) passa para dentro da tela de uso.
     A captura abre PRONTA, não gravando: o microfone só liga no toque em Iniciar.
     ========================================================================== */
  const DIRETO = { capturar: 'aovivo', interprete: 'interpretando' };
  /* Rodada 8: o dono aprovou no celular e pediu o mesmo em todo aparelho. */
  const direto = () => polido();
  let telaDeOrigem = 'inicio';
  const mostrarComEntrada = mostrar;
  mostrar = function (nome, o) {
    if (direto() && DIRETO[nome]) nome = DIRETO[nome];
    /* Já na captura pronta, tocar de novo no microfone da barra começa a gravar. */
    if (nome === 'aovivo' && atual === 'aovivo') {
      const b = $('[data-px="iniciar"]', tela);
      if (b) iniciarVivo(b);
      return;
    }
    if (atual && !Object.values(DIRETO).includes(atual)) telaDeOrigem = atual;
    return mostrarComEntrada.call(this, nome, o);
  };

  const topoDoVivo = () => `<div class="px-vivo-topo">
      <button type="button" class="q-chip" data-px-vivo="capturar:Detectar">${ic('languages')} Detectar → Português ${ic('chevron-down')}</button>
      <button type="button" class="q-chip px-so-largo" data-px-vivo="capturar:Modelo no dispositivo">${ic('cpu')} Modelo local · 589 MB</button>
      <span class="q-espaco"></span>
      <button type="button" class="q-ctl" role="switch" aria-checked="true" aria-label="Microfone ativo" data-px="mic">${ic('mic')}</button>
      <button type="button" class="q-ctl" aria-label="Ajustes da captura" data-px-vivo="capturar:Ajustes da captura">${ic('sliders-horizontal')}</button>
      <button type="button" class="q-ctl" aria-label="Ajuda" data-px-vivo="capturar:Ajuda">${ic('circle-question-mark')}</button>
    </div>`;
  function prepararVivo() {
    pararVivo();
    const v = $('.px-vivo', tela);
    v.classList.add('px-pronto');
    v.insertAdjacentHTML('afterbegin', topoDoVivo());
    $('.q-historico', v).innerHTML = `<div class="px-pronto-miolo"><span class="q-ic">${ic('mic')}</span><h2>Pronto para legendar</h2>
      <p>${celular() ? 'Toque em Iniciar e deixe o celular perto do som. A legenda nos dois idiomas aparece aqui.' : 'O som do computador entra sozinho. Dê play no vídeo, aula ou chamada e clique em Iniciar. A legenda bilíngue aparece aqui e nas Legendas flutuantes.'}</p></div>`;
    const b = $('[data-px="encerrar"]', v);
    b.dataset.px = 'iniciar';
    b.innerHTML = `${ic('mic')} Iniciar captura`;
    if (polido() && !reduz()) {
      anima($('.px-pronto-miolo .q-ic', v), [{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { d: 700, atraso: 200, e: MOLA });
      $$('.px-vivo-topo > *, .px-pronto-miolo > :not(.q-ic)', v).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 480, atraso: 120 + i * 60 }));
    }
  }
  function iniciarVivo(b) {
    const v = $('.px-vivo', tela);
    const miolo = $('.px-pronto-miolo', v);
    sentir('grava');
    b.dataset.px = 'encerrar';
    b.innerHTML = '<i class="q-quadrado"></i> Encerrar';
    const comecar = () => {
      v.classList.remove('px-pronto');
      $('.q-historico', v).innerHTML = '<p class="q-espera">Ouvindo… a legenda aparece aqui.</p>';
      comecarVivo();
    };
    if (!polido() || reduz()) return comecar();
    anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA });
    anima(miolo, [{ opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }], { d: 260, fill: 'forwards' }).finished.then(comecar, comecar);
  }
  const vivoComEntrada = aoMostrar.aovivo;
  aoMostrar.aovivo = () => {
    if (direto()) return prepararVivo();
    vivoComEntrada();
  };
  const interpretandoAntes = aoMostrar.interpretando;
  aoMostrar.interpretando = () => {
    interpretandoAntes();
    /* O idioma de cada lado troca aqui mesmo, sem voltar a uma tela de entrada. */
    $('.int-esq', tela)?.insertAdjacentHTML('beforeend', `<button type="button" class="int-modo" aria-label="Conversa virtual: traduzir uma chamada" data-px="virtual">${ic('monitor')}<span class="int-modo-txt" aria-hidden="true">Virtual</span></button>`);
    $$('.int-idioma', tela).forEach((p) => p.insertAdjacentHTML('beforeend', ` <button type="button" class="int-modo px-int-idioma" aria-label="Trocar este idioma" data-px="int-idioma">${ic('chevron-down')}</button>`));
  };
  ganchos.unshift((e, b) => {
    if (atual === 'aovivo') {
      if (b.dataset.px === 'iniciar') return iniciarVivo(b), true;
      if (b.dataset.px === 'mic') {
        const ligado = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', ligado);
        b.setAttribute('aria-label', ligado ? 'Microfone ativo' : 'Microfone mudo');
        return toast(ligado ? 'Microfone ativo' : 'Microfone mudo'), true;
      }
      if (b.dataset.pxVivo) return abrirDialogo(b.dataset.pxVivo, b), true;
      if ((b.getAttribute('aria-label') || '') === 'Idiomas da sessão') return abrirDialogo('capturar:Detectar', b), true;
    }
    if (atual === 'interpretando') {
      if (b.dataset.px === 'int-idioma') return abrirDialogo('interprete:idioma', b), true;
      if (b.dataset.px === 'virtual') {
        /* A conversa virtual tem preparo próprio (escolher a chamada): abre a tela de preparo, que continua existindo. */
        mostrarComEntrada('interprete', { origem: 'clique' });
        return alternarEstado('interprete:Conversa virtual'), true;
      }
      if (b.dataset.px === 'sair' && direto()) return ir(telaDeOrigem || 'inicio'), true;
    }
    return false;
  });
