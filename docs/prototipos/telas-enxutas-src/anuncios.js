  /* ==========================================================================
     ANÚNCIOS NO GRÁTIS — protótipo CONCEITUAL (clone do protótipo de polimento).
     Mesmo escopo de prototipo.js e dos outros módulos; entra por último.

     Princípios (valem para todo espaço daqui):
     1. Nunca durante a captura ao vivo, no meio de uma rodada, no intérprete em
        conversa, por cima de conteúdo, perto de botão principal ou no perfil infantil.
     2. Todo espaço é rotulado ("Patrocinado" / "Anúncio"), tem tamanho RESERVADO
        desde o primeiro quadro e some inteiro no Premium e no teste.
     3. O mais valioso é o OPCIONAL e PREMIADO: a pessoa escolhe ver e ganha algo do app.
     4. Cada espaço mostra o caminho para sair dos anúncios ("Sem anúncios no Essencial").

     Tudo aqui é anúncio DE MENTIRA: as marcas são inventadas e nada é carregado da rede.
     ========================================================================== */
  /* Ícones: os mesmos lucide do app; este banco também lê as abas que o de telas.js não leu. */
  const bancoDasAbas = modelo(Object.values(D.abas).join('') + Object.values(D.sub).map((x) => x.html).join(''));
  const ica = (n) => banco.querySelector('svg.lucide-' + n)?.outerHTML || bancoDasAbas.querySelector('svg.lucide-' + n)?.outerHTML || ic(n);
  const NIVEIS_ADS = ['off', 'leves', 'medios', 'intensos'];
  const NOME_NIVEL_ADS = { off: 'Desligados', leves: 'Leves', medios: 'Médios', intensos: 'Intensos' };
  const LETRA_NIVEL = { leves: 'L', medios: 'M', intensos: 'I' };
  const LIMITE_PREMIADOS = 5; /* por dia */
  const INTERVALO_INTER = { medios: 10, intensos: 4 }; /* minutos entre intersticiais */
  const MIN_POR_TELA = 1.5; /* relógio simulado: cada troca de tela vale 1,5 min de uso */
  const ADS = {
    nivel: NIVEIS_ADS.includes(QS.get('anuncios')) ? QS.get('anuncios') : 'off' /* telas-enxutas: abre sem anúncios */,
    infantil: QS.has('infantil'),
    espacos: QS.has('espacos'),
    consent: ['personalizados', 'contextuais'].includes(QS.get('consent')) ? QS.get('consent') : null,
    primeiraSessao: QS.has('primeira'),
    relogio: 0,
    telas: 0,
    ultimoInter: null,
    motivo: 'ainda não houve troca de tela',
    premiados: 0,
    nuvemMin: 0,
    temas24: new Map(),
    ancoraFechada: false,
    ancoraVolta: 0,
    /* aparelho simulado (planos4.js): no Quest não há anúncio nenhum (ECA Digital cita realidade virtual) */
    disp: ['pc', 'fraco', 'celular', 'quest'].includes(QS.get('aparelho')) ? QS.get('aparelho') : 'pc',
  };
  /* Quatro planos (planos4.js). "conta.premium" passa a querer dizer "qualquer plano pago". */
  const PLANO_IDS = ['gratis', 'essencial', 'premium', 'aovivo'];
  const NOME_DO_PLANO = { gratis: 'Grátis', essencial: 'Essencial', premium: 'Premium', aovivo: 'Ao Vivo' };
  conta.plano = PLANO_IDS.includes(QS.get('plano')) ? QS.get('plano') : 'gratis';
  conta.teste = false;
  Object.defineProperty(conta, 'premium', {
    get: () => conta.plano !== 'gratis',
    set: (v) => {
      if (!v) return void Object.assign(conta, { plano: 'gratis', teste: false });
      if (conta.plano === 'gratis') Object.assign(conta, { plano: 'premium', teste: true }); /* o teste de 14 dias é do Premium */
    },
  });
  const anunciando = () => !conta.premium && !ADS.infantil && ADS.nivel !== 'off' && ADS.disp !== 'quest';

  /* ---- Marcas inventadas (educação e idiomas). Nenhuma existe. ----------------- */
  const MARCAS = {
    escola: { nome: 'Tucano-Lilás Idiomas', icone: 'graduation-cap', cor: '#5b6ee1', titulo: 'Aulas ao vivo de conversação', texto: 'Turmas pequenas com professor nativo. A primeira aula é grátis.', acao: 'Conhecer' },
    curso: { nome: 'Curso Vírgula & Meia', icone: 'book-open', cor: '#3f9b56', titulo: 'Inglês para reuniões em 6 semanas', texto: 'Vocabulário de trabalho, do e-mail à apresentação.', acao: 'Ver o curso' },
    mochila: { nome: 'Mochila Poliglota', icone: 'globe', cor: '#c9820a', titulo: 'Desafio dos 7 idiomas', texto: 'Um jogo de saudações oferecido pela Mochila Poliglota.', acao: 'Jogar' },
    fones: { nome: 'Fones Cochicho', icone: 'headphones', cor: '#b0457a', titulo: 'Fones que isolam o barulho da rua', texto: 'Para ouvir cada sílaba do podcast no ônibus.', acao: 'Ver oferta' },
    rota: { nome: 'Rota Âmbar Intercâmbio', icone: 'compass', cor: '#d9622b', titulo: 'Um mês estudando fora', texto: 'Programas curtos para quem já entende a legenda sem pausar.', acao: 'Saber mais' },
    caderno: { nome: 'Caderneta Zênite', icone: 'bookmark-plus', cor: '#2f8f8a', titulo: 'Flashcards impressos das suas palavras', texto: 'Envie a lista e receba o baralho em casa.', acao: 'Conhecer' },
  };

  /* ---- O catálogo dos espaços: alimenta a tela, os níveis e o Mapa -------------- */
  const ESPACOS = [
    { id: 'inicio-nativo', nome: 'Cartão nativo no Início', curto: 'In-feed nativo', onde: 'Início › seção "Para continuar": é sempre o último cartão da grade, no lugar de um cartão.', formato: 'In-feed nativo', rede: 'AdSense display (in-feed nativo) ou Ad Manager', regra: 'Um por visita. Nunca acima das três ações principais nem das missões do dia.', incomodo: 'Baixo', receita: 'Baixa a média', em: 'LMI', tela: 'inicio' },
    { id: 'bib-infeed', nome: 'In-feed na Biblioteca', curto: 'In-feed nativo', onde: 'Biblioteca › lista de gravações, entre a 2ª e a 3ª sessão, com a mesma altura de uma linha.', formato: 'In-feed nativo', rede: 'AdSense display (in-feed nativo)', regra: 'Um por página da lista; só aparece se a página tem pelo menos 2 sessões. Nunca no detalhe da gravação. No celular não aparece enquanto a gravação escolhida está presa ao pé (o botão "Abrir" ficaria colado nele).', incomodo: 'Baixo a médio', receita: 'Média', em: 'MI', tela: 'biblioteca' },
    { id: 'fim-premiado', nome: 'Premiado no fim da rodada: +10 Seeds', curto: 'Premiado · opcional', onde: 'Jogos › tela de resultado, logo abaixo do XP, como um "bônus opcional".', formato: 'Premiado (a pessoa escolhe ver)', rede: 'AdSense para jogos H5 (rewarded) ou Ad Manager', regra: `Só depois do resultado. Até ${LIMITE_PREMIADOS} premiados por dia, somando todos os pontos. Pulou antes do fim: sem recompensa.`, incomodo: 'Nenhum (opcional)', receita: 'Alta', em: 'LMI', tela: 'fim' },
    { id: 'fim-bloco', nome: 'Bloco patrocinado no fim da rodada', curto: 'Display nativo', onde: 'Jogos › tela de resultado, ABAIXO dos botões, depois de uma linha e de um respiro.', formato: 'Display nativo', rede: 'AdSense para jogos H5 / AdSense display', regra: 'Só com o resultado já na tela. Longe do botão "Próximo jogo" para não haver clique sem querer.', incomodo: 'Baixo', receita: 'Média', em: 'MI', tela: 'fim' },
    { id: 'ajuda-premiada', nome: 'Premiado: +1 ajuda nesta rodada', curto: 'Premiado · opcional', onde: 'Jogos › placar, ao lado de uma ajuda que acabou.', formato: 'Premiado (a pessoa escolhe ver)', rede: 'AdSense para jogos H5 (rewarded)', regra: 'Só aparece quando a ajuda chega a zero; uma vez por rodada. A rodada pausa enquanto o anúncio passa. É a única exceção ao "nunca no meio da rodada", porque quem pede é a pessoa.', incomodo: 'Nenhum (opcional)', receita: 'Média a alta', em: 'LMI', tela: 'ajuda' },
    { id: 'tema-24h', nome: 'Premiado: liberar um tema por 24 h', curto: 'Premiado · opcional', onde: 'Personalizar › Coleção, na vitrine, ao experimentar um tema que está na Loja.', formato: 'Premiado (a pessoa escolhe ver)', rede: 'AdSense para jogos H5 (rewarded) ou Ad Manager', regra: 'Só para temas da Loja. Depois de 24 h o tema volta a ficar trancado; comprar com Seeds continua igual.', incomodo: 'Nenhum (opcional)', receita: 'Média', em: 'LMI', tela: 'colecao' },
    { id: 'nuvem-30', nome: 'Premiado: 30 minutos de Precisão (nuvem) hoje', curto: 'Premiado · opcional', onde: 'Capturar › ao lado do seletor de nível, antes de iniciar (some quando a captura começa); na folha do nível Precisão, que no Grátis tem cadeado; e em Planos › Consumo do mês.', formato: 'Premiado (a pessoa escolhe ver)', rede: 'AdSense para jogos H5 (rewarded) ou Ad Manager', regra: 'Nunca com a captura rodando. Cada anúncio soma 30 min de nuvem válidos até a meia-noite; custo de nuvem por minuto precisa caber no que o anúncio paga.', incomodo: 'Nenhum (opcional)', receita: 'Média (tem custo de nuvem do nosso lado)', em: 'LMI', tela: 'capturar' },
    { id: 'loja-seeds', nome: 'Premiado: +15 Seeds na Loja', curto: 'Premiado · opcional', onde: 'Personalizar › Loja, numa faixa logo abaixo da carteira de Seeds.', formato: 'Premiado (a pessoa escolhe ver)', rede: 'AdSense para jogos H5 (rewarded)', regra: `Dentro do limite de ${LIMITE_PREMIADOS} por dia. Seeds continuam sem ser vendidas por dinheiro.`, incomodo: 'Nenhum (opcional)', receita: 'Alta', em: 'LMI', tela: 'loja' },
    { id: 'trilha-oferecida', nome: 'Trilha oferecida por uma marca', curto: 'Patrocínio de conteúdo', onde: 'Jogar › linha "Trilha de vocabulário", com o selo "Oferecida por".', formato: 'Patrocínio de conteúdo (não programático)', rede: 'Venda direta', regra: 'Um patrocinador por trilha, por período fechado. O conteúdo da trilha não muda.', incomodo: 'Muito baixo', receita: 'Média, previsível (contrato)', em: 'LMI', tela: 'jogar' },
    { id: 'jogar-miniatura', nome: 'Miniatura de jogo patrocinada', curto: 'Patrocínio de conteúdo', onde: 'Jogar › grade de jogos, no 8º lugar (fim da segunda fileira).', formato: 'Patrocínio de conteúdo (não programático)', rede: 'Venda direta, ou Ad Manager (nativo)', regra: 'No máximo uma na grade, nunca na primeira fileira. Mesmo desenho dos outros cartões, com a etiqueta "Patrocinado".', incomodo: 'Baixo', receita: 'Média', em: 'MI', tela: 'jogar' },
    { id: 'loja-tema', nome: 'Tema patrocinado na Loja', curto: 'Patrocínio de conteúdo', onde: 'Personalizar › Loja, como o terceiro item da prateleira.', formato: 'Patrocínio de conteúdo (não programático)', rede: 'Venda direta', regra: 'Um por vez. O tema é de graça por 7 dias, sem gastar Seeds, com o nome de quem oferece.', incomodo: 'Baixo', receita: 'Média, previsível (contrato)', em: 'MI', tela: 'loja' },
    { id: 'intersticial', nome: 'Intersticial entre telas', curto: 'Intersticial', onde: 'Entre duas telas de descanso (Início, Jogar, Biblioteca, Estatísticas, Personalizar).', formato: 'Intersticial (tela cheia, dispensável)', rede: 'AdSense para jogos H5 (interstitial) ou Ad Manager', regra: 'No máximo 1 a cada 10 min (Médios) ou 4 min (Intensos). Nunca na primeira sessão do dia, nas três primeiras telas, ao sair de uma captura ou do intérprete, no meio de uma rodada, nem indo para Capturar, Intérprete ou Planos.', incomodo: 'Alto', receita: 'Alta por exibição', em: 'MI', tela: 'inter' },
    { id: 'ancora', nome: 'Faixa âncora no celular', curto: 'Âncora', onde: 'Só no celular: pé do Início, acima da barra flutuante. No pé da Biblioteca só no nível Intensos (para comparar): lá o botão "Abrir" já fica preso ao pé e a faixa ficaria a uns 35 px dele.', formato: 'Âncora (faixa fixa com fechar)', rede: 'AdSense display (âncora)', regra: 'Tem botão de fechar. Fechada, não volta na sessão (Médios) ou volta depois de 3 telas (Intensos). Some quando um painel abre.', incomodo: 'Médio', receita: 'Média a alta (fica muito tempo na tela)', em: 'MI', tela: 'ancora' },
    { id: 'estat-faixa', nome: 'Linha patrocinada em Estatísticas', curto: 'In-feed nativo', onde: 'Estatísticas › última linha da tela, depois de todos os gráficos.', formato: 'In-feed nativo', rede: 'AdSense display (in-feed nativo)', regra: 'Só no nível Intensos. Sempre o último elemento da tela.', incomodo: 'Baixo a médio', receita: 'Baixa', em: 'I', tela: 'estatisticas' },
  ];
  const ESP = Object.fromEntries(ESPACOS.map((e) => [e.id, e]));
  const tem = (id) => anunciando() && ESP[id].em.includes(LETRA_NIVEL[ADS.nivel]);
  const marca = (id) => `data-ad="${id}" data-ad-n="${ESP[id].curto}"`;
  const rotulo = (t = 'Patrocinado') => `<span class="ad-rotulo">${t}<i> · exemplo</i></span>`;
  const semAds = () => '<button type="button" class="ad-sem">Sem anúncios no Essencial</button>';
  const estadoDaPrivacidade = () =>
    ADS.infantil
      ? 'Perfil infantil: sem anúncios e sem rastreio'
      : conta.premium
        ? `${NOME_DO_PLANO[conta.plano]}: sem anúncios`
        : ADS.disp === 'quest'
          ? 'Quest: sem anúncios neste aparelho'
          : ADS.nivel === 'off'
          ? 'Anúncios desligados neste protótipo'
          : ADS.consent === 'personalizados'
            ? 'Anúncios personalizados'
            : ADS.consent === 'contextuais'
              ? 'Só anúncios contextuais'
              : 'Escolha pendente: só contextuais até você decidir';

  /* ==========================================================================
     Os espaços na tela. Cada função planta os seus e não mexe em mais nada.
     ========================================================================== */
  const arte = (m, extra = '') => `<span class="ad-arte" style="--mm:${m.cor}" aria-hidden="true">${ica(m.icone)}${extra}</span>`;

  const PLANTIO = {
    inicio() {
      if (!tem('inicio-nativo')) return;
      const m = MARCAS.escola;
      /* A primeira dobra fica como está: as três ações guardam a altura que tinham e a seção nova entra abaixo delas. */
      const palco = $('.q-palco', tela);
      const acoes = palco && $('.q-grade.q-cresce', palco);
      const alto = acoes && palco.scrollHeight <= palco.clientHeight + 1 ? acoes.offsetHeight : 0;
      if (alto) acoes.style.minHeight = alto + 'px';
      palco?.insertAdjacentHTML(
        'beforeend',
        `<section class="q-secao ad-continuar"><header><div><h2>Para continuar</h2><p>O que ficou pela metade e o que vence hoje.</p></div></header>
          <div class="q-grade g3">
            <button type="button" class="q-tile" data-ad-ir="biblioteca"><span class="q-ic">${ica('headphones')}</span><b>Continuar: The science of sleep</b><span class="q-d">Podcast · você parou aos 31 de 52 min.</span></button>
            <button type="button" class="q-tile" data-ad-ir="jogar"><span class="q-ic">${ica('repeat')}</span><b>Revisar 12 palavras</b><span class="q-d">As que vencem hoje, numa rodada curta.</span></button>
            <article class="q-tile ad ad-nativo" ${marca('inicio-nativo')}>
              <span class="ad-topo"><span class="q-ic" style="--mm:${m.cor}">${ica(m.icone)}</span>${rotulo()}</span>
              <b>${m.titulo}</b><span class="q-d">${m.texto}</span>
              <span class="ad-pe"><button type="button" class="ad-cta" data-ad-cta="${m.nome}">${m.acao} ${ica('arrow-right')}</button><span class="ad-marca">${m.nome}</span></span>
              ${semAds()}
            </article>
          </div></section>`,
      );
    },
    biblioteca() {
      if (!tem('bib-infeed')) return;
      /* No celular a gravação escolhida fica presa ao pé, com o botão "Abrir": qualquer linha da lista passa
         colada nele ao rolar. Ali o in-feed não entra. */
      if (celular() && $('.q-bib-det', tela)) return;
      const linhas = $$('.q-lista > .q-linha', tela);
      if (linhas.length < 2) return;
      const m = MARCAS.curso;
      linhas[1].insertAdjacentHTML(
        'afterend',
        `<div class="q-linha ad ad-infeed" ${marca('bib-infeed')}><span class="q-ic" style="--mm:${m.cor}">${ica(m.icone)}</span>
          <span class="ad-infeed-texto"><b>${m.titulo}</b><small>${rotulo()}<span class="ad-marca-linha"> · ${m.nome}</span></small></span>
          <span class="ad-infeed-fim"><button type="button" class="ad-cta" data-ad-cta="${m.nome}">${m.acao}</button>${semAds()}</span></div>`,
      );
    },
    jogar() {
      const linha = $('.qj-trilha .q-linha', tela);
      if (linha && tem('trilha-oferecida') && !$('.ad-oferece', linha)) {
        /* no computador o selo fica à direita, antes da seta; no celular não cabe ao lado e desce para baixo do texto */
        const selo = `<span class="q-tag ad-oferece" ${marca('trilha-oferecida')} title="Patrocínio de conteúdo. Exemplo: a marca não existe.">Oferecida por ${MARCAS.escola.nome}</span>`;
        const texto = celular() && $('small', linha)?.parentElement;
        if (texto) texto.insertAdjacentHTML('beforeend', selo.split('ad-oferece').join('ad-oferece ad-oferece-baixo'));
        else $('.q-fim', linha)?.insertAdjacentHTML('beforebegin', selo);
      }
      const grade = $('#grade-de-jogos .q-grade.g4', tela);
      if (!grade || !tem('jogar-miniatura') || grade.children.length < 8) return;
      const m = MARCAS.mochila;
      grade.children[7].insertAdjacentHTML(
        'beforebegin',
        `<div class="qj-jogo ad-jogo-caixa"><article class="q-tile px-com-mini ad ad-jogo" ${marca('jogar-miniatura')}>
          <span class="px-mini" style="--mm:${m.cor}" aria-hidden="true"><i class="mm-chip">hola</i><i class="mm-chip ok">hello</i><i class="mm-chip">ciao</i><i class="mm-chip">olá</i></span>
          <span class="qj-jogo-topo"><i class="qj-ponto" style="background:${m.cor}"></i><span class="q-tag">Patrocinado</span></span>
          <b>${m.titulo}</b><span class="q-d">${m.texto}</span>
          <span class="qj-conta">exemplo · marca fictícia</span>
          <span class="ad-pe"><button type="button" class="ad-cta" data-ad-cta="${m.nome}">${m.acao} ${ica('arrow-right')}</button>${semAds()}</span>
        </article></div>`,
      );
    },
    personalizar() {
      const i = abaDe.personalizar || 0;
      if (i === 0) return plantarColecao();
      if (i === 4) return plantarLoja();
    },
    aovivo() {
      const topo = $('.px-pronto .px-vivo-topo', tela);
      if (!topo || !tem('nuvem-30')) return;
      const vaga = $('.pl-vaga', tela);
      if (vaga) vaga.innerHTML = '';
      const onde = vaga || (celular() ? $('.px-pronto-miolo', tela) : null);
      (onde || $('.q-espaco', topo))?.insertAdjacentHTML(onde ? 'beforeend' : 'beforebegin', `<button type="button" class="q-chip ad-chip ${onde && !vaga ? 'ad-nuvem-linha' : ''}" data-ad-premio="nuvem" ${marca('nuvem-30')} title="Opcional: uma amostra do nível Precisão (nuvem), que erra menos">${ica('server')} <span class="ad-chip-txt">${ADS.nuvemMin ? `Precisão hoje: ${ADS.nuvemMin} min` : 'Precisão: ganhar 30 min'}</span> <span class="ad-mini-tag">Anúncio</span></button>`);
    },
    planos() {
      if (planosAba !== 2 || !tem('nuvem-30')) return;
      $('.q-grade.g2', tela)?.insertAdjacentHTML(
        'afterend',
        `<div class="q-aviso ad ad-aviso" ${marca('nuvem-30')}><span>${ica('server')} <span><b>Quer provar a Precisão hoje?</b> Veja um anúncio de até 30 s e ganhe 30 minutos de nuvem, que erra menos.${ADS.nuvemMin ? ` Você já tem ${ADS.nuvemMin} min de bônus hoje.` : ''} ${rotulo('Anúncio premiado')}</span></span><button type="button" class="q-ctl" data-ad-premio="nuvem">${ica('play')} Ver anúncio</button></div>`,
      );
    },
    estatisticas() {
      if (!tem('estat-faixa')) return;
      const m = MARCAS.fones;
      $('.q-palco', tela)?.insertAdjacentHTML(
        'beforeend',
        `<div class="q-linha ad ad-infeed" ${marca('estat-faixa')}><span class="q-ic" style="--mm:${m.cor}">${ica(m.icone)}</span>
          <span class="ad-infeed-texto"><b>${m.titulo}</b><small>${rotulo()}<span class="ad-marca-linha"> · ${m.nome}</span></small></span>
          <span class="ad-infeed-fim"><button type="button" class="ad-cta" data-ad-cta="${m.nome}">${m.acao}</button>${semAds()}</span></div>`,
      );
    },
  };

  function plantarColecao() {
    /* os temas liberados por anúncio dizem isso no próprio cartão */
    for (const [id] of ADS.temas24) {
      const d = $(`.px-tema[data-px-tema="${id}"] .q-d`, tela);
      if (d) d.textContent = id === temaEquipado ? 'Equipado · liberado por 24 h' : 'Liberado por 24 h';
    }
    if (!tem('tema-24h') || !temaEmProva) return;
    const t = TEMAS.find((x) => x[0] === temaEmProva);
    if (!t || t[2] !== 'loja') return;
    $('.px-vitrine-pe .q-acoes', tela)?.insertAdjacentHTML('beforeend', `<button type="button" class="q-ctl ad-ctl" data-ad-premio="tema" data-tema="${t[0]}" ${marca('tema-24h')} title="Opcional: veja um anúncio e use este tema até amanhã">${ica('play')} Usar por 24 h <span class="ad-mini-tag">Anúncio</span></button>`);
  }
  function plantarLoja() {
    const carteira = $('.px-carteira', tela);
    if (carteira && tem('loja-seeds')) {
      carteira.insertAdjacentHTML(
        'afterend',
        `<div class="q-aviso ad ad-aviso" ${marca('loja-seeds')}><span>${ica('sprout')} <span><b>Faltam Seeds para o que você quer?</b> Veja um anúncio de até 30 s e ganhe +15. ${rotulo('Anúncio premiado')}</span></span><button type="button" class="q-ctl" data-ad-premio="seeds15">${ica('play')} Ver anúncio</button></div>`,
      );
      /* a faixa acompanha a largura da carteira, que o app limita */
      const lim = getComputedStyle(carteira).maxWidth;
      if (lim && lim !== 'none') carteira.nextElementSibling.style.maxWidth = lim;
    }
    const prateleira = $('.px-loja', tela);
    if (!prateleira || !tem('loja-tema') || !['Tudo', 'Temas'].includes(lojaEstado.cat) || !prateleira.children.length) return;
    const m = MARCAS.rota;
    const item = `<article class="q-cartao px-item ad ad-item" ${marca('loja-tema')}><div class="px-arte ad-arte-tema" aria-hidden="true"><span class="px-amostra">${['#1d2433', '#27314a', '#f2a03d', '#fbe9c6'].map((c) => `<i style="background:${c}"></i>`).join('')}</span></div>
        <p class="q-rotulo"><span class="q-tag">Patrocinado</span> Temas</p><h3>Tema Rota Âmbar</h3>
        <p class="q-d">Oferecido por ${m.nome} (exemplo). De graça por 7 dias, sem gastar Seeds.</p>
        <div class="px-item-pe"><button type="button" class="q-ctl" data-ad-cta="${m.nome}" data-ad-msg="No app: o tema entra na sua coleção por 7 dias, com o nome de quem oferece na vitrine.">Usar por 7 dias</button>${semAds()}</div></article>`;
    (prateleira.children[1] || prateleira.lastElementChild).insertAdjacentHTML('afterend', item);
  }

  /* ---- Fim de rodada: o bônus opcional e o bloco discreto abaixo dos botões ---- */
  function plantarFim() {
    $$('.ad-fim-premio, .ad-fim-bloco', tela).forEach((x) => x.remove());
    const acoes = P('.pj-fim-acoes');
    if (!acoes || !anunciando()) return;
    const novos = [];
    if (tem('fim-premiado')) {
      acoes.insertAdjacentHTML(
        'beforebegin',
        `<div class="ad-fim-premio" ${marca('fim-premiado')}><span class="ad-moeda">${ica('sprout')}</span>
          <div><b>Bônus opcional: +10 Seeds</b><span class="ad-sub">Veja um anúncio de até 30 s. Só se você quiser.</span></div>
          <button type="button" class="btn btn-outline peq" data-ad-premio="seeds">${ica('play')} Ver anúncio</button></div>`,
      );
      novos.push(acoes.previousElementSibling);
    }
    if (tem('fim-bloco')) {
      const m = MARCAS.caderno;
      acoes.insertAdjacentHTML(
        'afterend',
        `<aside class="ad-fim-bloco" ${marca('fim-bloco')} aria-label="Patrocinado"><div class="ad-fim-bloco-topo">${rotulo()}${semAds()}</div>
          <div class="ad-fim-bloco-corpo">${arte(m)}<div><b>${m.titulo}</b><span class="ad-sub">${m.texto} · ${m.nome}</span></div><button type="button" class="btn btn-outline peq" data-ad-cta="${m.nome}">${m.acao}</button></div></aside>`,
      );
      novos.push(acoes.nextElementSibling);
    }
    if (polido() && !reduz()) novos.forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 520, atraso: 500 + i * 160 }));
  }
  const fimSemAds = pjFim;
  pjFim = function (o = {}) {
    if (!pj || pj.fim) return;
    fimSemAds(o);
    pjDepois((o.ja ? 200 : 900) + 90, plantarFim);
  };

  /* ---- "+1 ajuda nesta rodada": só quando a ajuda acaba, uma vez por rodada ---- */
  const usarSemAds = usarAjuda;
  usarAjuda = function (b) {
    usarSemAds(b);
    if (!pj || pj.fim || pj.adAjuda || !tem('ajuda-premiada')) return;
    const k = b.dataset.ajuda;
    if (!Number.isFinite(pj.ajudas[k]) || pj.ajudas[k] > 0 || $('.ad-ajuda', tela)) return;
    const nome = (pj.def.ajudas.find((a) => a[0] === k) || [])[2] || 'ajuda';
    b.insertAdjacentHTML('afterend', `<button type="button" class="btn btn-outline peq ad-ajuda" data-ad-premio="ajuda" data-k="${k}" ${marca('ajuda-premiada')} title="Opcional: veja um anúncio e ganhe mais uma ajuda nesta rodada. A rodada fica pausada.">${ica('play')} +1 ${nome} <span class="ad-mini-tag">Anúncio</span></button>`);
    const novo = b.nextElementSibling;
    if (polido() && !reduz()) anima(novo, [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { d: 420, e: MOLA_SUAVE });
  };

  /* ---- Faixa âncora (só celular, só Início e Biblioteca) ---------------------- */
  function plantarAncora() {
    const velha = $('.ad-ancora', main);
    /* Na Biblioteca do celular o botão "Abrir" já fica preso ao pé: a faixa ali só entra no Intensos, para comparar. */
    const cabe = polido() && celular() && tem('ancora') && (atual === 'inicio' || (atual === 'biblioteca' && ADS.nivel === 'intensos')) && !ADS.ancoraFechada;
    if (!cabe) {
      velha?.remove();
      $('.ad-ancora-espaco', tela)?.remove();
      return;
    }
    /* o conteúdo ganha um respiro do tamanho da faixa: ela nunca cobre a última linha */
    const palco = $('.q-palco', tela);
    if (palco && !$('.ad-ancora-espaco', palco)) palco.insertAdjacentHTML('beforeend', '<div class="ad-ancora-espaco" aria-hidden="true"></div>');
    if (velha) return;
    const m = MARCAS.fones;
    main.insertAdjacentHTML(
      'beforeend',
      `<aside class="ad-ancora" ${marca('ancora')} aria-label="Anúncio"><span class="q-ic" style="--mm:${m.cor}">${ica(m.icone)}</span>
        <span class="ad-ancora-texto"><b>${m.titulo}</b><small>${rotulo('Anúncio')} · ${m.nome}</small></span>
        <button type="button" class="ad-cta" data-ad-cta="${m.nome}">Ver</button>
        <button type="button" class="ad-ancora-x" data-ad-acao="fechar-ancora" aria-label="Fechar o anúncio">${ica('x')}</button></aside>`,
    );
    const a = main.lastElementChild;
    if (!reduz()) anima(a, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 520, atraso: 500, e: MOLA_SUAVE });
  }
  function fecharAncora() {
    const a = $('.ad-ancora', main);
    if (!a) return;
    ADS.ancoraFechada = true;
    ADS.ancoraVolta = ADS.nivel === 'intensos' ? ADS.telas + 3 : Infinity;
    const some = () => {
      a.remove();
      $('.ad-ancora-espaco', tela)?.remove();
    };
    toast(ADS.nivel === 'intensos' ? 'Anúncio fechado. No nível Intensos ele volta depois de 3 telas.' : 'Anúncio fechado. Ele não volta nesta sessão.');
    if (reduz()) return some();
    anima(a, [{ opacity: 0, transform: 'translateY(30px)' }], { d: 260, e: EG, fill: 'forwards' }).finished.then(some, some);
  }

  /* ---- Plantio: roda a cada tela nova e é seguro rodar duas vezes -------------- */
  function selos() {
    const cab = atual === 'inicio' && $('.q-cab', tela);
    if (!cab || !ADS.infantil || $('.ad-selo-infantil', cab)) return;
    cab.insertAdjacentHTML('beforeend', `<span class="q-chip ad-selo-infantil" title="Perfil infantil: nenhum anúncio, nem no Grátis">${ica('shield-check')} Perfil infantil · sem anúncios</span>`);
  }
  let plantandoPorFora = false;
  function plantar() {
    if (ADS.ancoraFechada && ADS.telas >= ADS.ancoraVolta) ADS.ancoraFechada = false;
    plantarAncora();
    const r = tela.firstElementChild;
    if (!r || r.dataset.adsOk) return;
    r.dataset.adsOk = '1';
    selos();
    if (!anunciando()) return;
    PLANTIO[atual]?.();
    if (atual === 'partida' && pj?.fim) plantarFim();
    if (plantandoPorFora && polido() && !reduz()) $$('[data-ad]', tela).forEach((x) => anima(x, [{ opacity: 0 }, { opacity: 1 }], { d: 320, e: 'ease' }));
    reposicionar();
  }
  for (const n of ['inicio', 'capturar', 'interprete', 'jogar', 'estatisticas', 'personalizar', 'ajustes', 'biblioteca', 'sessao', 'planos', 'sobre', 'ajuda', 'jogo', 'partida', 'aovivo', 'interpretando']) {
    const antes = aoMostrar[n];
    aoMostrar[n] = () => {
      antes?.();
      plantar();
    };
  }
  /* telas que se repintam sozinhas (Biblioteca, Loja, Planos, prévia de tema) */
  new MutationObserver(() => {
    plantandoPorFora = true;
    plantar();
    plantandoPorFora = false;
  }).observe(tela, { childList: true });

  /* ==========================================================================
     Recompensa: Seeds voando até o saldo, confete e o número contando
     ========================================================================== */
  function voarSeeds(n, alvo) {
    if (!polido() || reduz() || !alvo?.isConnected) return;
    const [ax, ay] = centro(alvo);
    const ox = innerWidth / 2;
    const oy = innerHeight / 2;
    for (let i = 0; i < n; i++) {
      const m = document.createElement('span');
      m.className = 'ad-moeda-voa';
      m.setAttribute('aria-hidden', 'true');
      m.innerHTML = ica('sprout');
      m.style.left = ox + 'px';
      m.style.top = oy + 'px';
      document.body.append(m);
      const dx = (Math.random() - 0.5) * 240;
      const dy = (Math.random() - 0.5) * 170;
      const some = () => m.remove();
      anima(
        m,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.15)`, opacity: 1, offset: 0.32 },
          { transform: `translate(calc(-50% + ${ax - ox}px), calc(-50% + ${ay - oy}px)) scale(0.45)`, opacity: 0.85 },
        ],
        { d: 950, atraso: i * 60, e: EIO, fill: 'both' },
      ).finished.then(some, some);
    }
  }
  function darSeeds(n, origemDoGanho) {
    const de = ex.seeds;
    ex.seeds += n;
    sentir('moeda');
    if (polido() && !reduz()) confete(70);
    if (atual === 'personalizar' && polido()) repintar(fonteDe('personalizar'), 0, '.px-nada');
    const chipDoInicio = $('[data-testid="progresso-no-inicio"] .q-chip', tela);
    const noInicio = chipDoInicio && [...chipDoInicio.childNodes].find((x) => x.nodeType === 3 && /Seeds/.test(x.nodeValue));
    const saldo = $('.px-saldo', tela);
    const chip = $('.px-seeds span', tela);
    const noFim = origemDoGanho?.isConnected ? $('.ad-saldo', origemDoGanho) : null;
    const pinta = (v) => {
      if (noInicio) noInicio.nodeValue = `${v} Seeds`;
      if (saldo) saldo.textContent = v;
      if (chip) chip.textContent = v;
      if (noFim) noFim.textContent = v;
    };
    pinta(de);
    const alvo = chipDoInicio || $('.px-seeds', tela) || noFim?.parentElement;
    voarSeeds(9, alvo);
    setTimeout(() => {
      contar(pinta, de, ex.seeds, 700);
      if (alvo && polido() && !reduz()) {
        anima(alvo, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
        rajada(...centro(alvo), 18, 0.9);
      }
    }, (polido() && !reduz() ? 760 : 0) * K());
    toast(`+${n} Seeds. Obrigado por apoiar o Grátis.`);
  }

  const PREMIOS = {
    seeds: { frase: () => 'ganhar +10 Seeds', premio: () => '+10 Seeds', marca: 'escola' },
    seeds15: { frase: () => 'ganhar +15 Seeds', premio: () => '+15 Seeds', marca: 'curso' },
    ajuda: { frase: (c) => `ganhar +1 ${c.nome || 'ajuda'} nesta rodada`, premio: (c) => `+1 ${c.nome || 'ajuda'}`, marca: 'caderno' },
    tema: { frase: (c) => `usar o tema ${c.nome || ''} por 24 h`, premio: (c) => `Tema ${c.nome || ''} por 24 h`, marca: 'rota' },
    nuvem: { frase: () => 'ganhar 30 minutos de nuvem hoje', premio: () => '30 min de nuvem hoje', marca: 'fones' },
  };
  function entregar(tipo, c) {
    ADS.premiados++;
    if (tipo === 'seeds' || tipo === 'seeds15') {
      const linha = c.botao?.closest('.ad-fim-premio');
      if (linha) {
        linha.classList.add('feito');
        linha.innerHTML = `<span class="ad-moeda">${ica('check')}</span><div><b>+10 Seeds recebidas</b><span class="ad-sub">Obrigado por apoiar o Grátis.</span></div><span class="q-chip ad-saldo-chip">${ica('sprout')} <span class="ad-saldo">${ex.seeds}</span> Seeds</span>`;
      }
      return darSeeds(tipo === 'seeds' ? 10 : 15, linha);
    }
    if (tipo === 'ajuda') {
      const b = pj && $(`.hud-ajudas [data-ajuda="${c.k}"]`, tela);
      if (!b) return;
      pj.adAjuda = true;
      pj.ajudas[c.k] = (pj.ajudas[c.k] || 0) + 1;
      $('.n', b).textContent = pj.ajudas[c.k];
      b.disabled = false;
      $('.ad-ajuda', tela)?.remove();
      sentir('moeda');
      flutuar(b, '+1', 'good');
      if (polido() && !reduz()) {
        rajada(...centro(b), 20, 1);
        anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { d: 620, e: MOLA });
      }
      return toast(`+1 ${c.nome} nesta rodada. Bom jogo.`);
    }
    if (tipo === 'tema') {
      const t = TEMAS.find((x) => x[0] === c.id);
      if (!t) return;
      ADS.temas24.set(t[0], t[2]);
      t[2] = 'seu';
      ultimoPonto = [innerWidth / 2, innerHeight / 2];
      revelar(() => {
        temaEquipado = t[0];
        temaEmProva = null;
        html.dataset.theme = t[0];
        corDasParticulas();
        if (atual === 'personalizar') {
          const rol = rolagem()?.scrollTop || 0;
          tela.innerHTML = fonteDe('personalizar');
          const r = rolagem();
          if (r) r.scrollTop = rol;
          $$('.q-abas', tela).forEach((g) => porPilula(g));
        }
        reposicionar();
      });
      if (polido() && !reduz()) confete(90);
      return toast(`Tema ${t[1]} liberado por 24 h. Depois ele volta para a Loja.`);
    }
    if (tipo === 'nuvem') {
      ADS.nuvemMin += 30;
      sentir('moeda');
      if (polido() && !reduz()) confete(60);
      const chip = $('.ad-chip .ad-chip-txt', tela);
      if (chip) {
        chip.textContent = `Precisão hoje: ${ADS.nuvemMin} min`;
        if (polido() && !reduz()) {
          anima(chip.parentElement, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { d: 560, e: MOLA });
          rajada(...centro(chip.parentElement), 20, 1);
        }
      }
      if (atual === 'planos') repintar(htmlDosPlanos(), 0, '.px-nada');
      aoGanharNuvem();
      return toast(`+30 min de Precisão hoje (total: ${ADS.nuvemMin} min). A transcrição passa pela nuvem até acabar.`);
    }
  }

  /* ---- Tela de anúncio (dialog próprio): o premiado e o intersticial ---------- */
  const criativo = (m, grande) => `<div class="ad-criativo ${grande ? 'grande' : ''}" style="--mm:${m.cor}">
      <span class="ad-criativo-marca"><span class="ad-criativo-ic">${ica(m.icone)}</span>${m.nome}</span>
      <b>${m.titulo}</b><p>${m.texto}</p>
      <button type="button" class="ad-criativo-cta" data-ad-cta="${m.nome}">${m.acao} ${ica('arrow-right')}</button>
      <span class="ad-criativo-aviso">Anúncio de exemplo · marca fictícia</span></div>`;
  function telaDeAnuncio(classe, miolo) {
    $('dialog.ad-tela')?.remove();
    app.insertAdjacentHTML('beforeend', `<dialog class="ad-tela ${classe}" aria-label="Anúncio">${miolo}</dialog>`);
    const d = app.lastElementChild;
    d.setAttribute('tabindex', '-1');
    d.showModal();
    d.focus({ preventScroll: true });
    sentir('abre');
    if (polido() && !reduz()) {
      anima(d.firstElementChild, [{ opacity: 0, transform: 'translateY(26px) scale(0.94)', filter: 'blur(8px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { d: 560, e: MOLA_SUAVE });
    }
    return d;
  }
  function fecharTelaDeAnuncio(d, depois) {
    const some = () => {
      d.close();
      d.remove();
      depois?.();
    };
    sentir('fecha');
    if (!polido() || reduz()) return some();
    anima(d.firstElementChild, [{ opacity: 0, transform: 'scale(0.95)', filter: 'blur(6px)' }], { d: 220, fill: 'forwards' }).finished.then(some, some);
  }
  const avisoDoCta = (b) => toast(b.dataset.adMsg || `Anúncio de exemplo. No app, abriria a página de ${b.dataset.adCta} em outra aba.`);

  /* O anúncio premiado: contagem, "Pular em 5" e a recompensa só no fim. */
  function abrirAnuncioPremiado(p, c, aoFim) {
    const TOTAL = 10; /* no protótipo dura 10 s; no app, até 30 s */
    const PULAR = 5;
    const m = MARCAS[p.marca];
    const d = telaDeAnuncio(
      'ad-video',
      `<div class="ad-player"><header><span class="q-tag">Anúncio</span><span class="ad-player-info">premiado · no app, até 30 s</span><span class="q-espaco"></span>
          <span class="ad-conta" role="timer" aria-label="Tempo restante"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"/><circle class="ad-conta-arco" cx="18" cy="18" r="15.5"/></svg><b>${TOTAL}</b></span>
          <button type="button" class="ad-pular" disabled>Pular em ${PULAR}</button></header>
        ${criativo(m, true)}
        <footer><span class="ad-prog"><i></i></span><p>${ica('gift')} Recompensa quando terminar: <b>${p.premio(c)}</b></p></footer></div>`,
    );
    const t0 = performance.now();
    const arco = $('.ad-conta-arco', d);
    const num = $('.ad-conta b', d);
    const pular = $('.ad-pular', d);
    const prog = $('.ad-prog i', d);
    const C = 2 * Math.PI * 15.5;
    arco.style.strokeDasharray = C;
    let acabou = false;
    const terminar = (viu) => {
      if (acabou) return;
      acabou = true;
      clearInterval(relogio);
      fecharTelaDeAnuncio(d, () => aoFim(viu));
    };
    const relogio = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const falta = Math.max(0, TOTAL - s);
      num.textContent = Math.ceil(falta);
      arco.style.strokeDashoffset = C * (s / TOTAL);
      prog.style.width = Math.min(100, (s / TOTAL) * 100) + '%';
      if (s >= PULAR) {
        pular.disabled = false;
        pular.textContent = 'Pular (sem recompensa)';
      } else pular.textContent = `Pular em ${Math.ceil(PULAR - s)}`;
      if (s >= TOTAL) terminar(true);
    }, 100);
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!pular.disabled) terminar(false);
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b === pular) return terminar(false);
      if (b.dataset.adCta) {
        const antes = b.innerHTML;
        b.textContent = 'No app, abre em outra aba';
        setTimeout(() => b.isConnected && (b.innerHTML = antes), 1600);
      }
    });
  }

  /* O foco inicial fica na folha, não num botão: Enter sem querer não pode abrir um anúncio. */
  const focarFolha = (d) => (d.setAttribute('tabindex', '-1'), d.focus({ preventScroll: true }));
  function premiado(tipo, c = {}) {
    const p = PREMIOS[tipo];
    if (!p) return;
    if (ADS.infantil) return toast('Perfil infantil: nenhum anúncio, nem os premiados.');
    if (conta.premium) return toast(`No ${NOME_DO_PLANO[conta.plano]} não há anúncios. Volte ao Grátis na barra para simular.`);
    if (ADS.disp === 'quest') return toast('No Quest não há anúncios, nem os premiados.');
    if (ADS.nivel === 'off') return toast('Os anúncios estão desligados na barra do protótipo.');
    if (atual === 'aovivo' && !$('.px-pronto', tela)) return toast('Durante a captura não existe anúncio, nem premiado.');
    if (atual === 'interpretando') return toast('No intérprete em conversa não existe anúncio, nem premiado.');
    if ($('dialog[open]')) return;
    if (ADS.premiados >= LIMITE_PREMIADOS) return toast(`Você já viu os ${LIMITE_PREMIADOS} anúncios premiados de hoje. Amanhã tem mais.`);
    const emJogo = atual === 'partida' && pj && !pj.fim;
    const vez = pj;
    if (emJogo) pjPausar(true);
    const retomar = () => emJogo && pj === vez && pjPausar(false);
    let seguiu = false;
    const d = folhaDeBaixo(
      `<div class="pj-como ad-confirma"><span class="label-mono">Anúncio premiado · opcional</span>
        <h2>Ver um anúncio e ${p.frase(c)}?</h2>
        <ul class="ad-lista">
          <li>${ica('clock')}<span>Você vai ver um anúncio de até 30 s.</span></li>
          <li>${ica('gift')}<span>A recompensa cai quando o anúncio termina. Dá para pular depois de 5 s, mas aí ela não vem.</span></li>
          <li>${ica('shield-check')}<span>${estadoDaPrivacidade()}. <a class="ad-sem" role="button" tabindex="0" data-ad-f="consent">Mudar</a></span></li>
        </ul>
        ${emJogo ? '<p class="pj-como-ajudas">A rodada fica pausada enquanto isso.</p>' : ''}
        <div class="ad-confirma-pe"><button type="button" class="btn btn-outline" data-ad-f="nao">Agora não</button><button type="button" class="btn btn-solid" data-ad-f="ver">${ica('play')} Ver anúncio</button></div>
        <p class="ad-confirma-nota">Hoje: ${ADS.premiados} de ${LIMITE_PREMIADOS} premiados. <button type="button" class="ad-sem" data-ad-f="planos">Sem anúncios no Essencial</button></p></div>`,
      'pj-como-folha ad-folha',
    );
    focarFolha(d);
    d.addEventListener('click', (e) => {
      const a = e.target.closest('[data-ad-f]')?.dataset.adF;
      if (!a) return;
      if (a === 'ver') {
        seguiu = true;
        fecharFolhaDeBaixo();
        return setTimeout(
          () =>
            abrirAnuncioPremiado(p, c, (viu) => {
              if (viu) entregar(tipo, c);
              else toast('Você pulou o anúncio: sem recompensa desta vez.');
              retomar();
              atualizarMapa();
            }),
          (polido() && !reduz() ? 300 : 0) * K(),
        );
      }
      fecharFolhaDeBaixo();
      if (a === 'planos') setTimeout(() => ir('planos'), 320 * K());
      if (a === 'consent') setTimeout(abrirConsent, 340 * K());
    });
    const vigia = setInterval(() => {
      if (d.isConnected) return;
      clearInterval(vigia);
      if (!seguiu) retomar();
    }, 120);
  }

  /* ---- Intersticial: entre telas, com regra de frequência à vista -------------- */
  const NOME_DA_TELA = { inicio: 'o Início', jogar: 'Jogar', biblioteca: 'a Biblioteca', estatisticas: 'Estatísticas', personalizar: 'Personalizar', ajustes: 'Ajustes', sobre: 'Sobre', ajuda: 'Ajuda', sessao: 'a sessão', partida: 'o próximo jogo', jogo: 'o jogo' };
  const PROTEGIDAS = ['capturar', 'aovivo', 'interprete', 'interpretando', 'planos'];
  function porQueNao(de, para) {
    if (ADS.infantil) return 'perfil infantil';
    if (conta.premium) return `plano ${NOME_DO_PLANO[conta.plano]}`;
    if (ADS.disp === 'quest') return 'no Quest não há anúncios';
    if (ADS.nivel === 'off') return 'anúncios desligados';
    if (!tem('intersticial')) return 'o nível Leves não tem intersticial';
    if ($('[data-px-acao="demo"]', barra)?.getAttribute('aria-pressed') === 'true') return 'demonstração automática rodando';
    if (ADS.primeiraSessao) return 'primeira sessão do dia';
    if (de === 'aovivo' || de === 'capturar') return 'saindo de uma captura';
    if (de === 'interpretando' || de === 'interprete') return 'saindo do intérprete';
    if (PROTEGIDAS.includes(para)) return 'o destino é Capturar, Intérprete ou Planos';
    if (de === 'partida' || de === 'jogo') {
      if (!pj?.fim) return 'saindo de uma rodada no meio';
      if (para === 'partida' && ADS.nivel !== 'intensos') return 'entre rodadas só no nível Intensos';
    } else if (para === 'partida' || para === 'jogo') return 'entrando num jogo';
    if (ADS.telas < 3) return 'ainda nas três primeiras telas da sessão';
    const n = INTERVALO_INTER[ADS.nivel];
    if (ADS.ultimoInter != null && ADS.relogio - ADS.ultimoInter < n) return `faltam ${(n - (ADS.relogio - ADS.ultimoInter)).toFixed(1).split('.').join(',')} min do intervalo de ${n} min`;
    return null;
  }
  function abrirIntersticial(o = {}) {
    const m = MARCAS[o.marca || 'rota'];
    const n = INTERVALO_INTER[ADS.nivel] || 10;
    const espera = ADS.nivel === 'intensos' ? 3 : 0; /* no Intensos o fechar demora 3 s: é para sentir a diferença */
    ADS.ultimoInter = ADS.relogio;
    const d = telaDeAnuncio(
      'ad-entre',
      `<div class="ad-inter" ${marca('intersticial')}><header><span class="q-tag">Anúncio</span><span class="ad-player-info">entre telas</span><span class="q-espaco"></span>
          <button type="button" class="q-ctl ad-x" data-ad-f="fechar" aria-label="Fechar o anúncio" ${espera ? 'disabled' : ''}>${espera ? `<b>${espera}</b>` : ica('x')}</button></header>
        ${criativo(m)}
        <button type="button" class="q-ctl pri ad-seguir" data-ad-f="fechar" ${espera ? 'disabled' : ''}>Continuar para ${NOME_DA_TELA[o.destino] || 'o app'} ${ica('arrow-right')}</button>
        <p class="ad-regra">${ica('clock')}<span>No máximo 1 a cada ${n} min. Nunca na primeira sessão do dia, ao sair de uma captura ou do intérprete, nem no meio de uma rodada.</span></p>
        <button type="button" class="ad-sem" data-ad-f="planos">Sem anúncios no Essencial</button></div>`,
    );
    let livre = !espera;
    if (espera) {
      const x = $('.ad-x', d);
      const t0 = performance.now();
      const t = setInterval(() => {
        const falta = espera - (performance.now() - t0) / 1000;
        if (!d.isConnected) return clearInterval(t);
        if (falta > 0) return void (x.innerHTML = `<b>${Math.ceil(falta)}</b>`);
        clearInterval(t);
        livre = true;
        x.innerHTML = ica('x');
        $$('[data-ad-f="fechar"]', d).forEach((b) => (b.disabled = false));
      }, 100);
    }
    const sair = (paraPlanos) => {
      if (!livre && !paraPlanos) return;
      fecharTelaDeAnuncio(d, () => {
        if (paraPlanos) return mostrarSemAds('planos', { origem: 'clique' });
        o.depois?.();
        atualizarMapa();
      });
    };
    d.addEventListener('cancel', (e) => (e.preventDefault(), sair(false)));
    d.addEventListener('click', (e) => {
      if (e.target === d) return sair(false);
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.adF === 'fechar') return sair(false);
      if (b.dataset.adF === 'planos') return sair(true);
      if (b.dataset.adCta) {
        const antes = b.innerHTML;
        b.textContent = 'No app, abre em outra aba';
        setTimeout(() => b.isConnected && (b.innerHTML = antes), 1600);
      }
    });
    atualizarMapa();
  }
  /* A troca de tela passa por aqui: conta o relógio simulado e decide se cabe um intersticial. */
  const mostrarSemAds = mostrar;
  mostrar = function (nome, o = {}) {
    const de = atual;
    const clique = (o.origem || 'clique') === 'clique';
    const entreRodadas = nome === 'partida' && de === 'partida';
    if (ADS.pulaUma) {
      ADS.pulaUma = false;
      return mostrarSemAds.call(this, nome, o);
    }
    if (clique && de && (nome !== de || entreRodadas) && !$('dialog.ad-tela')) {
      ADS.relogio += MIN_POR_TELA;
      ADS.telas++;
      ADS.motivo = porQueNao(de, nome);
      if (!ADS.motivo) {
        ADS.motivo = 'acabou de aparecer';
        return abrirIntersticial({ destino: nome, depois: () => mostrarSemAds(nome, o) });
      }
      atualizarMapa();
    }
    return mostrarSemAds.call(this, nome, o);
  };
  function simularIntersticial() {
    if (ADS.infantil) return toast('Perfil infantil: nenhum anúncio para simular.');
    if (conta.premium) return toast(`No ${NOME_DO_PLANO[conta.plano]} não há anúncios. Volte ao Grátis na barra para simular.`);
    if (ADS.disp === 'quest') return toast('No Quest não há anúncios, nem os premiados.');
    if (ADS.nivel === 'off') return toast('Os anúncios estão desligados na barra do protótipo.');
    if ($('dialog[open]')) return;
    if (atual === 'aovivo' || atual === 'interpretando') return toast(`Aqui nunca aparece intersticial (${atual === 'aovivo' ? 'captura' : 'intérprete'}). Vá ao Início e simule de novo.`);
    if ((atual === 'partida' || atual === 'jogo') && !pj?.fim) return toast('No meio de uma rodada nunca aparece intersticial. Termine a rodada ou vá ao Início.');
    if (ADS.nivel === 'leves') toast('O nível Leves não tem intersticial. Este é só para você ver como seria.');
    abrirIntersticial({ destino: atual });
  }

  /* ==========================================================================
     Consentimento (LGPD) e perfil infantil
     ========================================================================== */
  function abrirConsent() {
    if ($('dialog[open]')) return;
    let escolha = ADS.consent || 'contextuais';
    let infantil = ADS.infantil;
    const d = folhaDeBaixo(
      `<div class="pj-como ad-consent"><span class="label-mono">Privacidade · LGPD</span>
        <h2>Anúncios no plano Grátis</h2>
        <p class="ad-consent-texto">O Grátis se paga com anúncios discretos e rotulados. Eles nunca aparecem durante a legenda ao vivo, o intérprete ou uma rodada. Você decide como são escolhidos e pode mudar quando quiser em Mais › Anúncios e privacidade.</p>
        <div class="pj-nivs ad-consent-op" role="radiogroup" aria-label="Como os anúncios são escolhidos">
          <button type="button" class="pj-niv" role="radio" data-op="personalizados" aria-checked="false"><b>Personalizados</b><span>Usam o idioma que você estuda e o identificador de publicidade do aparelho para mostrar anúncios mais úteis.</span></button>
          <button type="button" class="pj-niv" role="radio" data-op="contextuais" aria-checked="false"><b>Só contextuais</b><span>Sem perfil e sem identificador. O anúncio combina apenas com a tela em que está.</span></button>
        </div>
        <div class="ad-consent-infantil"><span>${ica('shield-check')}<span><b>Perfil infantil</b><span class="ad-sub">Para menores de 18 anos: nenhum anúncio e nenhum rastreio de publicidade, mesmo no Grátis.</span></span></span><button type="button" class="q-interruptor" role="switch" aria-checked="false" aria-label="Perfil infantil"><i></i></button></div>
        <p class="pj-como-ajudas ad-consent-nota">O áudio e o texto das suas capturas não são usados para escolher anúncios. No app, nenhum anúncio é carregado antes desta escolha.</p>
        <div class="ad-confirma-pe"><button type="button" class="btn btn-outline" data-ad-f="planos">Ver os planos</button><button type="button" class="btn btn-solid" data-ad-f="salvar">Salvar escolha</button></div></div>`,
      'pj-como-folha ad-folha',
    );
    focarFolha(d);
    const pintar = () => {
      $$('[data-op]', d).forEach((b) => {
        b.setAttribute('aria-checked', !infantil && b.dataset.op === escolha);
        b.disabled = infantil;
      });
      $('[role="switch"]', d).setAttribute('aria-checked', infantil);
      $('.ad-consent-op', d).classList.toggle('apagado', infantil);
    };
    pintar();
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.op) return (escolha = b.dataset.op), sentir('aba'), pintar();
      if (b.getAttribute('role') === 'switch') return (infantil = !infantil), pintar();
      if (b.dataset.adF === 'salvar') {
        ADS.consent = escolha;
        const mudou = ADS.infantil !== infantil;
        ADS.infantil = infantil;
        fecharFolhaDeBaixo();
        toast(infantil ? 'Perfil infantil ligado: nenhum anúncio neste aparelho.' : escolha === 'personalizados' ? 'Combinado: anúncios personalizados.' : 'Combinado: só anúncios contextuais.');
        return aplicarAds({ semRedesenho: !mudou });
      }
      if (b.dataset.adF === 'planos') {
        fecharFolhaDeBaixo();
        setTimeout(() => ir('planos'), 320 * K());
      }
    });
  }
  /* A entrada fixa no painel Mais, junto de "Planos e Premium". */
  aoAbrirFolha.push((tipo, painel) => {
    if (tipo !== 'mais' || $('.ad-linha-privacidade', painel)) return;
    const faixa = $('.q-faixa-do-mais', painel);
    if (!faixa) return;
    faixa.insertAdjacentHTML('beforebegin', `<button type="button" class="q-linha ad-linha-privacidade"><span class="q-ic">${ica('shield-check')}</span><span><b>Anúncios e privacidade</b><small>${estadoDaPrivacidade()}</small></span><span class="q-fim">${ica('chevron-right')}</span></button>`);
    $('.ad-linha-privacidade', painel).addEventListener('click', (e) => {
      e.stopPropagation();
      fecharFolha({ semFoco: true });
      setTimeout(abrirConsent, (polido() ? 380 : 0) * K());
    });
  });

  /* ---- Cliques nos espaços (dentro das telas) --------------------------------- */
  ganchos.unshift((e, b) => {
    if (b.classList.contains('ad-sem')) return ir('planos'), true;
    if (b.dataset.adCta) return avisoDoCta(b), true;
    if (b.dataset.adIr) return ir(b.dataset.adIr), true;
    if (b.dataset.adAcao === 'fechar-ancora') return fecharAncora(), true;
    if (b.dataset.adPremio) {
      const tipo = b.dataset.adPremio;
      const c = { botao: b };
      if (tipo === 'ajuda') {
        c.k = b.dataset.k;
        c.nome = (pj?.def.ajudas.find((a) => a[0] === c.k) || [])[2] || 'ajuda';
      }
      if (tipo === 'tema') {
        c.id = b.dataset.tema;
        c.nome = (TEMAS.find((t) => t[0] === c.id) || [])[1] || '';
      }
      return premiado(tipo, c), true;
    }
    return false;
  });

  /* ==========================================================================
     Barra do protótipo: os controles dos anúncios e o Mapa
     ========================================================================== */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="px-barra ad-barra" role="toolbar" aria-label="Controles dos anúncios">
      <button type="button" data-ad-b="mapa" class="ad-barra-mapa" title="Cada espaço, onde fica, o formato, a rede provável, a regra e o quanto incomoda">Mapa dos anúncios</button>
      <span class="px-sep"></span>
      <span class="ad-barra-t">Anúncios</span>
      <div class="px-seg"><i></i>${NIVEIS_ADS.map((n) => `<button type="button" data-ad-nivel="${n}" aria-pressed="false" title="${{ off: 'Sem nenhum anúncio (como o protótipo de referência)', leves: 'Só premiados opcionais, patrocínio de conteúdo e um cartão nativo no Início', medios: 'O equilíbrio proposto: in-feed, bloco no fim da rodada, âncora no celular e 1 intersticial a cada 10 min', intensos: 'Para comparar o incômodo: tudo do Médios, intersticial a cada 4 min (inclusive entre rodadas) e fechar com espera' }[n]}">${NOME_NIVEL_ADS[n]}</button>`).join('')}</div>
      <button type="button" data-ad-b="infantil" aria-pressed="false" title="Perfil infantil: nenhum anúncio, nem no Grátis">Perfil infantil</button>
      <button type="button" data-ad-b="espacos" aria-pressed="false" title="Contorno tracejado em cada espaço de anúncio da tela">Mostrar espaços</button>
      <span class="px-sep"></span>
      <button type="button" data-ad-b="inter" title="Mostra o intersticial agora, sem esperar a regra de frequência">Simular intersticial</button>
      <button type="button" data-ad-b="premiado" title="Percorre o fluxo inteiro: confirmação, anúncio com contagem e a recompensa">Simular premiado</button>
      <button type="button" data-ad-b="consent" title="A folha de consentimento de anúncios e privacidade (LGPD)">Consentimento</button>
    </div>
    <div class="ad-mapa-fundo"></div>
    <aside class="ad-mapa" aria-label="Mapa dos anúncios" tabindex="-1"></aside>`,
  );
  const barraAds = $('.ad-barra');
  const mapa = $('.ad-mapa');
  function sincronizarBarra() {
    $$('[data-ad-nivel]', barraAds).forEach((b) => b.setAttribute('aria-pressed', b.dataset.adNivel === ADS.nivel));
    $('[data-ad-b="infantil"]', barraAds).setAttribute('aria-pressed', ADS.infantil);
    $('[data-ad-b="espacos"]', barraAds).setAttribute('aria-pressed', ADS.espacos);
    $$('.px-seg [aria-pressed="true"]', barraAds).forEach((b) => b.offsetWidth && marcarSeg(b));
    html.dataset.ads = anunciando() ? ADS.nivel : 'off';
    html.dataset.adsEspacos = ADS.espacos ? 'on' : 'off';
  }
  const estadoParaQuadros = () => ({ nivel: ADS.nivel, infantil: ADS.infantil, espacos: ADS.espacos, consent: ADS.consent, primeiraSessao: ADS.primeiraSessao, ...estadoDosPlanos() });
  /* Mesma origem quando a página é servida por http(s). Aberta como arquivo a origem é opaca ("null") e o
     navegador só entrega com o curinga; o que trafega é só o estado destes controles, nada sensível. */
  /* Em file:// o Chrome informa a origem como "file://", mas trata cada arquivo como origem opaca: só o curinga entrega. */
  const ORIGEM_DOS_QUADROS = /^https?:$/.test(location.protocol) && location.origin && location.origin !== 'null' ? location.origin : '*';
  const paraOsQuadros = (msg) => quadros().forEach((f) => f.contentWindow?.postMessage(msg, ORIGEM_DOS_QUADROS));
  function redesenharAds() {
    $('dialog.ad-tela')?.remove();
    if (!atual) return;
    if (['partida', 'jogo', 'aovivo', 'interpretando'].includes(atual)) {
      $$('[data-ad], .ad-selo-infantil', tela).forEach((x) => (x.closest('.ad-jogo-caixa, .ad-continuar') || x).remove());
      if (tela.firstElementChild) delete tela.firstElementChild.dataset.adsOk;
      return plantar();
    }
    if (folha) fecharFolha({ seco: true, semFoco: true });
    mostrarSemAds(atual, { origem: 'seco' });
  }
  function aplicarAds(o = {}) {
    sincronizarBarra();
    if (!o.semRedesenho) redesenharAds();
    if (!EMBUTIDO) paraOsQuadros({ pxAds: estadoParaQuadros() });
    atualizarMapa();
  }
  barraAds.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.adNivel) {
      ADS.nivel = b.dataset.adNivel;
      ADS.ancoraFechada = false;
      return aplicarAds();
    }
    const a = b.dataset.adB;
    if (a === 'infantil') {
      ADS.infantil = !ADS.infantil;
      toast(ADS.infantil ? 'Perfil infantil: nenhum anúncio, nem no Grátis.' : 'Perfil infantil desligado.');
      return aplicarAds();
    }
    if (a === 'espacos') {
      ADS.espacos = !ADS.espacos;
      return aplicarAds({ semRedesenho: true });
    }
    if (a === 'mapa') return abrirMapa(!document.body.classList.contains('ad-mapa-aberto'));
    if (aparelho !== 'pc') return paraOsQuadros({ pxAdsAcao: a });
    if (a === 'inter') return simularIntersticial();
    if (a === 'premiado') return premiado('seeds', {});
    if (a === 'consent') return abrirConsent();
  });
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d) return;
    /* só conversa com as próprias molduras (a página de fora) ou com a página de fora (a moldura) */
    if (EMBUTIDO ? e.source !== parent : !quadros().some((f) => f.contentWindow === e.source)) return;
    if (d.pxAdsPede && !EMBUTIDO) return e.source.postMessage({ pxAds: estadoParaQuadros() }, ORIGEM_DOS_QUADROS);
    if (!EMBUTIDO) return;
    if (d.pxAds) {
      const antes = JSON.stringify(estadoParaQuadros());
      if (typeof d.pxAds !== 'object') return;
      /* O que vem de outra janela só entra se for um dos valores conhecidos. */
      Object.assign(ADS, { nivel: NIVEIS_ADS.includes(d.pxAds.nivel) ? d.pxAds.nivel : ADS.nivel, infantil: !!d.pxAds.infantil, espacos: !!d.pxAds.espacos, consent: ['personalizados', 'contextuais'].includes(d.pxAds.consent) ? d.pxAds.consent : null, primeiraSessao: !!d.pxAds.primeiraSessao });
      receberPlanos(d.pxAds);
      if (JSON.stringify(estadoParaQuadros()) !== antes) aplicarPlano({ deFora: true });
    }
    if (d.pxAdsAcao === 'inter') simularIntersticial();
    if (d.pxAdsAcao === 'premiado') premiado('seeds', {});
    if (d.pxAdsAcao === 'consent') abrirConsent();
    if (d.plAcao) acaoDosPlanos(d.plAcao);
  });
  addEventListener('resize', () => requestAnimationFrame(sincronizarBarra));
  document.fonts?.ready.then(sincronizarBarra);
  /* o teste de 14 dias e o "voltar ao Grátis" da tela de Planos também mexem na barra */
  ativarTeste = com(ativarTeste, () => setTimeout(() => (sincronizarBarra(), plantarAncora(), atualizarMapa()), 0));

  /* ---- Mapa dos anúncios ------------------------------------------------------- */
  const PASSOS_DO_MAPA = {
    fim: () => {
      jaViu.add('memory');
      abrirJogo('memory');
      setTimeout(() => {
        if (atual !== 'partida' || !pj) return;
        Object.assign(pj, { acertos: 8, erros: 1, feitos: 8, pontos: 150, melhor: 4 });
        pjHud(true);
        pjFim({ ja: true });
      }, 1500 * K());
    },
    ajuda: () => {
      jaViu.add('memory');
      abrirJogo('memory');
      setTimeout(() => {
        const b = $('.hud-ajudas [data-ajuda="espiar"]', tela);
        if (!b || !pj) return;
        pj.ajudas.espiar = 1;
        $('.n', b).textContent = 1;
        b.click();
      }, 1700 * K());
    },
    colecao: () => {
      mostrarSemAds('personalizar', { aba: 0, origem: 'clique' });
      setTimeout(() => atual === 'personalizar' && provarTema('jardim'), 1100 * K());
    },
    loja: () => mostrarSemAds('personalizar', { aba: 4, origem: 'clique' }),
    capturar: () => mostrarSemAds('capturar', { origem: 'clique' }),
    inter: () => simularIntersticial(),
    ancora: () => {
      if (!celular()) return toast('A faixa âncora só existe no celular. Use o botão "Celular" da barra de baixo para ver.');
      ADS.ancoraFechada = false;
      mostrarSemAds('inicio', { origem: 'clique' });
    },
  };
  function verEspaco(id) {
    const e = ESP[id];
    abrirMapa(false);
    if (conta.premium) conta.premium = false;
    if (ADS.disp === 'quest') ADS.disp = 'pc';
    if (ADS.infantil) ADS.infantil = false;
    if (ADS.nivel === 'off' || !e.em.includes(LETRA_NIVEL[ADS.nivel])) ADS.nivel = e.em.includes('M') ? 'medios' : 'intensos';
    ADS.espacos = true;
    aplicarAds({ semRedesenho: true });
    ADS.pulaUma = e.tela !== 'inter'; /* a ida até o espaço não conta para a regra do intersticial */
    (PASSOS_DO_MAPA[e.tela] || (() => mostrarSemAds(e.tela, { origem: 'clique' })))();
    const procurar = (vez) => {
      const el = $(`[data-ad="${id}"]`);
      if (!el) return vez < 12 && setTimeout(() => procurar(vez + 1), 400);
      el.scrollIntoView({ block: 'center', behavior: reduz() ? 'auto' : 'smooth' });
      el.classList.add('ad-aqui');
      setTimeout(() => el.classList.remove('ad-aqui'), 2600);
    };
    setTimeout(() => procurar(0), 900 * K());
  }
  const NIVEIS_DO_ESPACO = (e) => ['leves', 'medios', 'intensos'].map((n) => `<span class="ad-mapa-nivel ${e.em.includes(LETRA_NIVEL[n]) ? 'ad-n-tem' : ''} ${ADS.nivel === n ? 'ad-n-atual' : ''}">${NOME_NIVEL_ADS[n]}</span>`).join('');
  function htmlDoMapa() {
    const n = INTERVALO_INTER[ADS.nivel];
    const fmt = (v) => v.toFixed(1).split('.').join(',');
    const ativos = ESPACOS.filter((e) => tem(e.id)).length;
    return `<button type="button" class="px-fechar ad-mapa-fechar" aria-label="Fechar o mapa">Fechar</button>
      <p class="ad-mapa-sobre">Protótipo conceitual · anúncios de exemplo, marcas inventadas</p>
      <h2>Mapa dos anúncios no Grátis</h2>
      <p>Cada espaço proposto, onde fica, o formato, a rede provável, a regra de quando aparece e uma estimativa qualitativa de incômodo e de receita. "Ver na tela" leva até o espaço e liga o contorno tracejado.</p>
      <div class="ad-mapa-estado">
        <div><span>Nível</span><b>${NOME_NIVEL_ADS[ADS.nivel]}</b></div>
        <div><span>Plano</span><b>${NOME_DO_PLANO[conta.plano]}${ADS.disp === 'quest' ? ' · Quest' : ''}</b></div>
        <div><span>Espaços ativos</span><b>${ativos} de ${ESPACOS.length}</b></div>
        <div><span>Privacidade</span><b>${estadoDaPrivacidade()}</b></div>
        <div><span>Premiados hoje</span><b>${ADS.premiados} de ${LIMITE_PREMIADOS}</b></div>
        <div><span>Relógio simulado</span><b>${fmt(ADS.relogio)} min · ${ADS.telas} telas</b></div>
        <div class="largo"><span>Intersticial</span><b>${n ? `1 a cada ${n} min` : 'não existe neste nível'}${ADS.ultimoInter != null ? ` · último aos ${fmt(ADS.ultimoInter)} min` : ''} · agora: ${ADS.motivo || 'liberado na próxima troca de tela'}</b></div>
        <label class="largo ad-mapa-check"><input type="checkbox" data-ad-m="primeira" ${ADS.primeiraSessao ? 'checked' : ''}> Simular a primeira sessão do dia (nenhum intersticial)</label>
      </div>
      <p class="ad-mapa-nota">O relógio é simulado: cada troca de tela vale ${fmt(MIN_POR_TELA)} min de uso, para dar para ver a regra de frequência sem esperar de verdade.</p>
      <h3>Os quatro princípios</h3>
      <ol class="ad-mapa-lista">
        <li><b>Onde nunca tem anúncio:</b> captura ao vivo, meio de uma rodada, intérprete em conversa, por cima de conteúdo, perto de botão principal, perfil infantil, tela de Planos e de pagamento.</li>
        <li><b>Todo espaço</b> é rotulado, tem o tamanho reservado desde o primeiro quadro (a tela não pula quando o anúncio carrega) e some inteiro em qualquer plano pago (Essencial, Premium, Ao Vivo) e no teste. No Quest e no perfil infantil não há anúncio nem no Grátis.</li>
        <li><b>O mais valioso é o opcional e premiado:</b> a pessoa escolhe ver e ganha algo do próprio app.</li>
        <li><b>Cada espaço</b> mostra o caminho para sair dos anúncios: "Sem anúncios no Essencial".</li>
      </ol>
      <h3>Os ${ESPACOS.length} espaços</h3>
      <div class="ad-mapa-espacos">${ESPACOS.map(
        (e) => `<section class="ad-mapa-item ${tem(e.id) ? 'ativo' : ''}"><header><h4>${e.nome}</h4><button type="button" data-ad-ver="${e.id}">Ver na tela</button></header>
          <p class="ad-mapa-chips"><span>${e.formato}</span><span>${e.rede}</span></p>
          <dl><div><dt>Onde</dt><dd>${e.onde}</dd></div><div><dt>Regra</dt><dd>${e.regra}</dd></div>
            <div class="meio"><dt>Incômodo</dt><dd>${e.incomodo}</dd></div><div class="meio"><dt>Receita</dt><dd>${e.receita}</dd></div>
            <div><dt>Níveis</dt><dd class="ad-mapa-niveis">${NIVEIS_DO_ESPACO(e)}</dd></div></dl></section>`,
      ).join('')}</div>
      <h3>Consentimento e perfil infantil</h3>
      <p>A folha "Anúncios no plano Grátis" (botão Consentimento, ou Mais › Anúncios e privacidade) oferece personalizados ou só contextuais. Perfil infantil desliga tudo: nenhum espaço, nenhum premiado, nenhum identificador.</p>
      <h3>A confirmar antes de implementar</h3>
      <ul class="ad-mapa-lista">
        <li>AdSense exige domínio próprio aprovado e um arquivo ads.txt; um subdomínio compartilhado (pages.dev) provavelmente não é aceito. <i>A confirmar.</i></li>
        <li>Anúncio premiado e intersticial na web são do "AdSense para jogos H5" (Ad Placement API) ou do Ad Manager, com aprovação à parte e voltados a jogos; se valem fora das telas de jogo (tema, nuvem) é dúvida. <i>A confirmar.</i></li>
        <li>Plataforma de consentimento (CMP) certificada pelo Google é obrigatória para EEE, Reino Unido e Suíça; no Brasil a base legal da LGPD para anúncio personalizado precisa de parecer. <i>A confirmar.</i></li>
        <li>O público inclui menores: anúncio personalizado para menor de 18 é vedado pelas políticas do Google e sensível na LGPD (art. 14). O perfil infantil sem anúncios precisa de uma forma confiável de saber a idade. <i>A confirmar.</i></li>
        <li>App instalado (PWA, Quest, loja de aplicativos) não pode usar AdSense: seria AdMob ou outra rede. <i>A confirmar.</i></li>
        <li>Políticas de posicionamento: anúncio não pode ficar colado em botão nem imitar conteúdo sem rótulo; a faixa âncora e o cartão nativo desenhados aqui precisam passar pela revisão de política. <i>A confirmar.</i></li>
        <li>"30 minutos de nuvem" tem custo nosso por minuto: só fecha se a receita por anúncio assistido cobrir esse custo. <i>A medir.</i></li>
        <li>A frase "o áudio e o texto das capturas não são usados para anúncios" é uma promessa de produto proposta aqui, não uma regra já escrita. <i>A decidir.</i></li>
      </ul>`;
  }
  function atualizarMapa() {
    if (!document.body.classList.contains('ad-mapa-aberto')) return;
    const rol = mapa.scrollTop;
    mapa.innerHTML = htmlDoMapa();
    mapa.scrollTop = rol;
  }
  function abrirMapa(abre) {
    document.body.classList.toggle('ad-mapa-aberto', abre);
    $('[data-ad-b="mapa"]', barraAds).setAttribute('aria-pressed', abre);
    if (!abre) return;
    mapa.innerHTML = htmlDoMapa();
    mapa.scrollTop = 0;
    mapa.focus({ preventScroll: true });
  }
  $('.ad-mapa-fundo').addEventListener('click', () => abrirMapa(false));
  mapa.addEventListener('click', (e) => {
    if (e.target.closest('.ad-mapa-fechar')) return abrirMapa(false);
    const v = e.target.closest('[data-ad-ver]');
    if (v) verEspaco(v.dataset.adVer);
  });
  mapa.addEventListener('change', (e) => {
    if (e.target.dataset.adM !== 'primeira') return;
    ADS.primeiraSessao = e.target.checked;
    ADS.motivo = ADS.primeiraSessao ? 'primeira sessão do dia' : 'liberado conforme a regra';
    aplicarAds({ semRedesenho: true });
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.contains('ad-mapa-aberto') && abrirMapa(false));

  /* ---- Partida --------------------------------------------------------------- */
  sincronizarBarra();
  if (EMBUTIDO) parent.postMessage({ pxAdsPede: 1 }, ORIGEM_DOS_QUADROS);
  /* Primeira visita: a escolha de privacidade vem antes de qualquer anúncio (uma vez por aba). */
  let jaPerguntou = false;
  try {
    jaPerguntou = sessionStorage.getItem('px.ads.consent') === '1';
  } catch {
    /* sem armazenamento */
  }
  if (!EMBUTIDO && !ADS.consent && !jaPerguntou && !QS.get('jogo')) {
    setTimeout(() => {
      if (!anunciando() || atual !== 'inicio' || $('dialog[open]') || folha) return;
      try {
        sessionStorage.setItem('px.ads.consent', '1');
      } catch {
        /* segue sem guardar */
      }
      abrirConsent();
    }, 1600);
  }
