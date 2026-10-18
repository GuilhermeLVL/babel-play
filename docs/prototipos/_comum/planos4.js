  /* ==========================================================================
     QUATRO PLANOS, APARELHOS E NUVEM — protótipo CONCEITUAL.
     Mesmo escopo de prototipo.js e dos outros módulos; entra depois de anuncios.js.
     Base: docs/auditoria/2026-10-09-aparelhos-planos-e-nuvem.md (worktree ei-polimento).

     O que este módulo acrescenta:
     1. Plano (Grátis, Essencial, Premium, Ao Vivo) e APARELHO simulado (computador com
        placa de vídeo, computador fraco, celular, Quest), na terceira barra do protótipo.
     2. A tela Planos refeita para os quatro, com o recomendado para o aparelho.
     3. O app reagindo ao plano: seletor do nível de serviço, marca de onde a fala é
        processada, medidor de nuvem, folha "Como isto funciona" e momentos de oferta.
     4. O Mapa dos planos, com um endereço (?ver=) para cada tela ou estado novo.

     Nada aqui chama servidor: horas, medidores e ofertas são de mentira.
     ========================================================================== */
  const svgl = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /* Dois lucide que a captura de produção não trouxe (mesmo traço dos outros). */
  const ICONES_A_MAIS = {
    'wifi-off': svgl('<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>'),
    oculos: svgl('<path d="M20 6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-1.6-.8l-1.6-2.13a1 1 0 0 0-1.6 0L9.6 16.2A2 2 0 0 1 8 17H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>'),
  };
  const icp = (n) => ICONES_A_MAIS[n] || ica(n);

  const DISP_IDS = ['pc', 'fraco', 'celular', 'quest'];
  const DISPS = {
    pc: { nome: 'Computador com placa de vídeo', curto: 'PC com placa', icone: 'monitor', recomendado: 'essencial' },
    fraco: { nome: 'Computador fraco', curto: 'PC fraco', icone: 'monitor', recomendado: 'premium' },
    celular: { nome: 'Celular', curto: 'Celular', icone: 'smartphone', recomendado: 'premium' },
    quest: { nome: 'Meta Quest', curto: 'Quest', icone: 'oculos', recomendado: 'premium' },
  };
  /* Seção 1 do estudo: o que o Grátis consegue em cada aparelho. [texto, funciona?] */
  const GRATIS_NO_APARELHO = {
    pc: {
      frase: 'Este computador tem placa de vídeo: a legenda roda aqui mesmo, sem limite e sem custo. Para estudar inglês, o Grátis já resolve. O Essencial tira os anúncios e abre a Nuance.',
      linhas: [
        ['Transcrição', 'Em tempo real, no aparelho. Inclusive o som de uma aba.', 1],
        ['Tradução', 'Pelo tradutor do navegador ou pelo modelo local.', 1],
        ['Voz', 'A voz do sistema. Boa no Edge.', 1],
        ['Onde a nuvem ajuda', 'Português com menos erro, áudio com barulho, gíria e jeito de falar.', 2],
      ],
    },
    fraco: {
      frase: 'Este computador é modesto: a legenda roda aqui, mas com um modelo leve, que erra mais. A nuvem do Premium erra menos, sobretudo em português e em áudio com barulho.',
      linhas: [
        ['Transcrição', 'Funciona, com um modelo leve: mais erros e mais espera.', 2],
        ['Tradução', 'Pelo tradutor do navegador ou pelo modelo local.', 1],
        ['Voz', 'A voz do sistema.', 1],
        ['Onde a nuvem ajuda', 'Quase sempre: menos erro e menos espera, sem esquentar o computador.', 2],
      ],
    },
    celular: {
      frase: 'No celular a legenda grátis vem em frases curtas, só pelo microfone, e o app precisa baixar um tradutor próprio. A nuvem do Premium dá sessão contínua e tradução sem baixar nada.',
      linhas: [
        ['Transcrição', 'Pelo reconhecimento do navegador: frases curtas, que reiniciam.', 2],
        ['Tradução', 'Não há tradutor embutido: o app baixa um (113 MB, uma vez).', 2],
        ['Voz', 'A voz do sistema. A qualidade varia de um aparelho para outro.', 1],
        ['O que nenhum plano resolve', 'O celular não deixa um site ouvir o som de outro aplicativo. Ele ouve pelo microfone.', 0],
      ],
    },
    quest: {
      frase: 'No Quest o navegador não transcreve nem fala sozinho. Sem nuvem não há legenda nem intérprete aqui; por isso o plano que faz sentido é o Premium. Jogos, vocabulário e revisão funcionam no Grátis.',
      linhas: [
        ['Transcrição', 'Não existe de graça neste aparelho.', 0],
        ['Tradução', 'Só com um modelo próprio, ainda não medido no Quest.', 2],
        ['Voz', 'O navegador do Quest não fala sozinho.', 0],
        ['O que nenhum plano resolve', 'O Quest não deixa um site ouvir o som de outro aplicativo. Ele ouve pelo microfone.', 0],
      ],
    },
  };

  const PLANOS = {
    gratis: {
      mensal: 'R$ 0', anual: null, rotulo: 'Tudo no aparelho',
      quem: 'Para quem está conhecendo, ou tem um computador com placa de vídeo.',
      itens: [
        ['Legenda bilíngue no aparelho, sem limite'],
        ['Tradução rápida ao vivo'],
        ['Jogos, vocabulário e revisão'],
        ['Com anúncios leves', 'nunca durante a legenda ao vivo, o intérprete ou uma rodada; os premiados são opcionais'],
      ],
    },
    essencial: {
      mensal: 'R$ 9,90', anual: 'R$ 79,90', porMesNoAnual: 'R$ 6,66', economia: '33%', rotulo: 'Sem anúncios · Nuance',
      quem: 'Para o estudante no computador: sem anúncio e com Nuance.',
      base: 'Tudo do Grátis, e:',
      itens: [
        ['Sem anúncios', 'nenhum espaço patrocinado, intersticial ou faixa'],
        ['Tradução Nuance rápida', 'outras formas de dizer, formal ou informal'],
        ['Sincronização entre os seus aparelhos'],
        ['5 h de nuvem por mês', 'no nível Precisão, para o áudio difícil'],
      ],
    },
    premium: {
      mensal: 'R$ 19,90', anual: 'R$ 149,90', porMesNoAnual: 'R$ 12,49', economia: '37%', rotulo: 'Nuvem · 20 h',
      quem: 'Para quem depende de nuvem: celular, notebook fraco, Quest.',
      base: 'Tudo do Essencial, e:',
      itens: [
        ['20 h de nuvem por mês', 'transcrição e tradução no nível Precisão'],
        ['Intérprete automático', 'reconhece sozinho quem fala qual idioma'],
        ['Voz neural básica no intérprete'],
      ],
    },
    aovivo: {
      mensal: 'R$ 39,90', anual: null, soMensal: true, rotulo: 'Texto durante a fala',
      quem: 'Para o intérprete na rua, em viagem, reunião e aula ao vivo.',
      base: 'Tudo do Premium, e:',
      itens: [
        ['10 h por mês no nível Ao vivo', 'o texto aparece enquanto a pessoa ainda fala'],
        ['Voz neural boa no intérprete'],
      ],
    },
  };
  const ORDEM_DO_PLANO = { gratis: 0, essencial: 1, premium: 2, aovivo: 3 };

  const NIVEIS = {
    aparelho: { nome: 'No aparelho', icone: 'cpu', plano: 'gratis', curto: 'Roda aqui. Grátis, sem limite, funciona sem internet.', longo: 'O modelo roda no seu aparelho. É grátis, não tem limite, funciona sem internet e o áudio não sai daqui.' },
    precisao: { nome: 'Precisão', icone: 'server', plano: 'essencial', curto: 'Nuvem por trechos. Erra menos.', longo: 'Cada trecho de fala vai para um servidor que erra menos, sobretudo em português e em áudio com barulho. O texto chega logo depois de cada frase.' },
    aovivo: { nome: 'Ao vivo', icone: 'zap', plano: 'aovivo', curto: 'Nuvem com texto durante a fala.', longo: 'O texto aparece enquanto a pessoa ainda está falando. É o nível para conversa, viagem, reunião e aula ao vivo.' },
  };
  const NIVEL_IDS = ['aparelho', 'precisao', 'aovivo'];

  const PL = {
    nuvem: ['sobra', 'pouco', 'acabou'].includes(QS.get('nuvem')) ? QS.get('nuvem') : 'sobra',
    offline: QS.has('offline'),
    dificil: QS.has('dificil'),
    escolha: 'auto' /* 'auto' ou um nível escolhido pela pessoa */,
    ciclo: QS.get('ciclo') === 'anual' ? 'anual' : 'mensal',
    comparar: null /* no celular, a tabela compara o seu plano com este */,
    destaque: null /* o cartão de plano que a porta de um cadeado quer mostrar */,
    tradutorBaixado: false,
  };

  /* ---- Horas de nuvem do mês (de mentira) --------------------------------------- */
  const MINUTOS = {
    sobra: { essencial: [100, 300], premium: [390, 1200], aovivoP: [390, 1200], aovivoV: [135, 600] },
    pouco: { essencial: [280, 300], premium: [1130, 1200], aovivoP: [820, 1200], aovivoV: [560, 600] },
    acabou: { essencial: [300, 300], premium: [1200, 1200], aovivoP: [840, 1200], aovivoV: [600, 600] },
  };
  const horas = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h && m ? `${h} h ${String(m).padStart(2, '0')}` : h ? `${h} h` : `${m} min`;
  };
  /* Os medidores do plano atual: [{ nivel, usado, total, resta, pct, acabou }] */
  function medidores() {
    const t = MINUTOS[PL.nuvem];
    const um = (nivel, [usado, total]) => ({ nivel, usado, total, resta: total - usado, pct: Math.round((usado / total) * 100), acabou: usado >= total });
    if (conta.plano === 'essencial') return [um('precisao', t.essencial)];
    if (conta.plano === 'premium') return [um('precisao', t.premium)];
    if (conta.plano === 'aovivo') return [um('precisao', t.aovivoP), um('aovivo', t.aovivoV)];
    return [];
  }
  const medidor = (n) => medidores().find((m) => m.nivel === n);
  const noPlano = (n) => n === 'aparelho' || (n === 'precisao' ? conta.plano !== 'gratis' : conta.plano === 'aovivo');
  /* No Grátis, a amostra do dia (anúncio premiado) abre a Precisão até a meia-noite. */
  const comAmostra = () => conta.plano === 'gratis' && ADS.nuvemMin > 0;
  const temHoras = (n) => n === 'aparelho' || (n === 'precisao' && comAmostra()) || (noPlano(n) && !medidor(n)?.acabou);
  const aparelhoLegenda = () => ADS.disp !== 'quest'; /* no Quest o nível "No aparelho" não existe */

  /* O nível que está valendo agora, e a razão em uma frase. contexto: 'capturar' | 'interprete' */
  function nivelAgora(contexto = 'capturar') {
    const semLocal = !aparelhoLegenda();
    if (PL.offline) return { nivel: semLocal ? null : 'aparelho', razao: semLocal ? 'Sem internet, e no Quest a legenda precisa da nuvem. Jogos e revisão continuam.' : 'Sem internet: tudo roda no aparelho até a conexão voltar.', porque: 'offline' };
    let quer = PL.escolha;
    let auto = quer === 'auto';
    if (!auto && (!temHoras(quer) || (quer === 'aparelho' && semLocal))) auto = true;
    if (auto) quer = conta.plano === 'aovivo' && contexto === 'interprete' ? 'aovivo' : ADS.disp === 'pc' && !comAmostra() ? 'aparelho' : 'precisao';
    const caiu = [];
    if (quer === 'aovivo' && !temHoras('aovivo')) {
      if (noPlano('aovivo')) caiu.push('aovivo');
      quer = 'precisao';
    }
    if (quer === 'precisao' && !temHoras('precisao')) {
      if (noPlano('precisao')) caiu.push('precisao');
      quer = 'aparelho';
    }
    if (quer === 'aparelho' && semLocal) {
      return { nivel: null, razao: caiu.length ? 'As horas de nuvem deste mês acabaram, e no Quest a legenda precisa da nuvem. Elas voltam no dia 1º.' : 'No Quest o navegador não transcreve sozinho: aqui a legenda precisa da nuvem.', porque: caiu.length ? 'acabou' : 'quest', caiu };
    }
    let razao;
    if (caiu.includes('precisao')) razao = 'As horas de nuvem deste mês acabaram. Voltou para o aparelho, sem travar nada. Elas voltam no dia 1º.';
    else if (caiu.includes('aovivo')) razao = 'As horas do nível Ao vivo acabaram. Voltou para a Precisão, que ainda tem horas.';
    else if (!auto) razao = 'Você escolheu este nível.';
    else if (quer === 'aparelho' && conta.plano === 'gratis') razao = ADS.disp === 'pc' ? 'Este computador dá conta sozinho: é grátis e o áudio não sai daqui.' : 'No Grátis tudo roda no aparelho. É grátis e não tem limite.';
    else if (quer === 'aparelho') razao = 'Este computador dá conta sozinho. A nuvem do seu plano fica guardada para quando você pedir.';
    else if (comAmostra()) razao = `Você ganhou ${ADS.nuvemMin} min de Precisão hoje, por um anúncio. Depois disso volta para o aparelho.`;
    else if (quer === 'aovivo') razao = 'Numa conversa, o texto durante a fala faz diferença. O seu plano tem horas para isso.';
    else if (ADS.disp === 'quest') razao = 'No Quest o navegador não transcreve sozinho. O seu plano tem horas de nuvem.';
    else razao = `${ADS.disp === 'celular' ? 'No celular a legenda grátis vem em frases curtas' : 'Este computador é fraco para o modelo local'}. A nuvem erra menos e o seu plano tem horas.`;
    return { nivel: quer, razao, porque: caiu.length ? 'acabou' : auto ? 'auto' : 'manual', caiu, auto };
  }
  /* A marca pequena e sempre visível: onde a fala está sendo processada, e por quê. */
  function marcaDeOnde(contexto) {
    const a = nivelAgora(contexto);
    if (PL.offline) return { ...a, icone: 'wifi-off', forte: 'Sem internet', resto: a.nivel ? 'no aparelho' : 'sem legenda neste aparelho', tom: 'alerta' };
    if (!a.nivel) return { ...a, icone: 'lock', forte: 'Sem legenda', resto: a.porque === 'acabou' ? 'as horas de nuvem acabaram' : 'neste aparelho ela precisa da nuvem', tom: 'alerta' };
    if (a.nivel === 'aparelho') {
      const acabou = a.porque === 'acabou';
      if (ADS.disp === 'celular') return { ...a, icone: 'smartphone', forte: 'Recurso do aparelho', resto: acabou ? 'as horas de nuvem acabaram' : 'grátis · a fala passa pelo navegador', tom: acabou ? 'alerta' : '' };
      return { ...a, icone: 'cpu', forte: 'No aparelho', resto: acabou ? 'as horas de nuvem acabaram' : ADS.disp === 'fraco' ? 'grátis · modelo leve, pode errar mais' : 'grátis · seu áudio não sai daqui', tom: acabou ? 'alerta' : '' };
    }
    if (a.nivel === 'precisao') return { ...a, icone: 'server', forte: 'Nuvem · Precisão', resto: comAmostra() ? `amostra de hoje: ${ADS.nuvemMin} min` : a.caiu?.includes('aovivo') ? 'as horas do Ao vivo acabaram' : 'por trechos · nada fica guardado', tom: a.caiu?.length ? 'alerta' : 'nuvem' };
    return { ...a, icone: 'zap', forte: 'Nuvem · Ao vivo', resto: 'texto durante a fala · nada fica guardado', tom: 'nuvem' };
  }
  const htmlDaMarca = (contexto, classe = '') => {
    const m = marcaDeOnde(contexto);
    return `<button type="button" class="pl-onde ${classe}" data-pl="como" data-tom="${m.tom}" aria-label="Onde a fala é processada: ${m.forte}, ${m.resto}. Abrir Como isto funciona" title="${esc(m.razao)}"><span class="pl-onde-ic">${icp(m.icone)}</span><span class="pl-onde-txt"><b>${m.forte}</b> · ${m.resto}</span>${icp('info')}</button>`;
  };

  /* ==========================================================================
     Capturar: seletor do nível, marca de onde processa e medidor discreto
     ========================================================================== */
  const etiquetaDoNivel = (n) => {
    if (n === 'aparelho') return aparelhoLegenda() ? '' : `<span class="pl-cad" title="Não existe neste aparelho">${icp('x')}</span>`;
    if (n === 'precisao' && conta.plano === 'gratis') return ADS.nuvemMin ? '<span class="ad-mini-tag">amostra</span>' : `<span class="pl-cad">${icp('lock')}</span>`;
    if (!noPlano(n)) return `<span class="pl-cad">${icp('lock')}</span>`;
    return '';
  };
  const seletorDeNivel = (contexto) => {
    const a = nivelAgora(contexto);
    return `<div class="q-abas q-seg pl-niveis" role="radiogroup" aria-label="Nível de serviço">${NIVEL_IDS.map((n) => {
      const tranca = !noPlano(n) && !(n === 'precisao' && comAmostra());
      return `<button type="button" role="radio" class="q-aba" aria-checked="${a.nivel === n}" data-pl-nivel="${n}" ${tranca ? 'data-pl-tranca' : ''} title="${NIVEIS[n].curto}${tranca ? ` Faz parte do ${NOME_DO_PLANO[NIVEIS[n].plano]}.` : ''}">${icp(NIVEIS[n].icone)}<span>${NIVEIS[n].nome}</span>${etiquetaDoNivel(n)}</button>`;
    }).join('')}</div>`;
  };
  /* O medidor discreto do Capturar: um chip com uma barrinha. Abre a folha. */
  function chipDoMedidor() {
    const ms = medidores();
    if (!ms.length) return '';
    const a = nivelAgora('capturar');
    const m = (a.nivel === 'aovivo' && ms.find((x) => x.nivel === 'aovivo')) || ms[0];
    const fim = ms[0].acabou;
    const texto = fim ? 'Nuvem do mês acabou · no aparelho' : `Nuvem: restam ${horas(m.resta)} de ${horas(m.total)}`;
    return `<button type="button" class="q-chip pl-medidor" data-pl="como" data-tom="${fim ? 'fim' : m.pct >= 85 ? 'pouco' : ''}" title="Horas de nuvem deste mês. Quando acabam, a legenda segue no aparelho.">${icp('server')}<span class="pl-medidor-txt">${texto}<i class="pl-mini-barra" aria-hidden="true"><i style="width:${Math.max(4, 100 - m.pct)}%"></i></i></span></button>`;
  }
  /* Notas da tela "Pronto para legendar": uma por vez, sempre com o caminho grátis à vista. */
  function notaDoPronto() {
    const a = nivelAgora('capturar');
    if (!a.nivel) return '';
    const ms = medidores();
    if (ms.length && ms[0].acabou && !PL.offline) {
      const prox = conta.plano === 'essencial';
      return `<div class="q-aviso pl-nota" data-pl-momento="fim_horas"><span>${icp('server')}<span><b>As ${horas(ms[0].total)} de nuvem deste mês acabaram.</b> A legenda continua no aparelho, sem limite. As horas voltam no dia 1º.</span></span>${prox ? '<button type="button" class="q-ctl" data-pl-porta="premium">Ver o Premium · 20 h</button>' : ''}</div>`;
    }
    if (PL.offline) return `<div class="q-aviso pl-nota"><span>${icp('wifi-off')}<span><b>Você está sem internet.</b> A legenda roda no aparelho e nada se perde. A nuvem volta sozinha com a conexão.</span></span></div>`;
    if (ADS.disp === 'celular' && a.nivel === 'aparelho' && !PL.tradutorBaixado) {
      return `<div class="q-aviso pl-nota" data-pl-momento="celular_tradutor"><span>${icp('languages')}<span><b>Este celular não tem tradutor embutido.</b> O app baixa um tradutor próprio (113 MB, uma vez só) ou traduz pela nuvem.</span></span><span class="pl-nota-acoes"><button type="button" class="q-ctl" data-pl="baixar-tradutor">${icp('download')} Baixar · grátis</button>${conta.plano === 'gratis' ? '<button type="button" class="ad-sem" data-pl-porta="premium">Traduzir pela nuvem: ver o Premium</button>' : ''}</span></div>`;
    }
    return '';
  }
  function pintarNivelNoVivo() {
    const v = $('.px-vivo', tela);
    const topo = v && $('.px-vivo-topo', v);
    if (!topo) return;
    const pronto = v.classList.contains('px-pronto');
    const a = nivelAgora('capturar');
    let linha = $('.pl-linha', v);
    if (!linha) {
      topo.insertAdjacentHTML('afterend', '<div class="pl-linha"></div>');
      linha = topo.nextElementSibling;
    }
    linha.innerHTML = `${seletorDeNivel('capturar')}${htmlDaMarca('capturar', 'pl-so-estreito')}<span class="q-espaco"></span><span class="pl-vaga">${chipDoMedidor()}</span>`;
    $('.pl-onde', topo)?.remove();
    $('.q-espaco', topo)?.insertAdjacentHTML('beforebegin', htmlDaMarca('capturar', 'pl-so-largo'));
    porPilula($('.pl-niveis', linha));
    /* o chip "Modelo local" só diz a verdade quando o modelo local está em uso */
    const modelo = $('[data-px-vivo="capturar:Modelo no dispositivo"]', topo);
    if (modelo) modelo.hidden = a.nivel !== 'aparelho' || ADS.disp === 'celular';
    if (!pronto) return;
    const miolo = $('.px-pronto-miolo', v);
    const iniciar = $('[data-px="iniciar"], [data-pl="sem-legenda"]', v);
    $$('.pl-nota, .pl-sem', miolo).forEach((x) => x.remove());
    if (!a.nivel) {
      /* Quest sem nuvem: a tela diz a verdade em vez de deixar apertar um botão que não faz nada */
      miolo.classList.add('pl-miolo-sem');
      $('.q-ic', miolo).innerHTML = icp('oculos');
      $('h2', miolo).textContent = a.porque === 'offline' ? 'Sem internet, sem legenda no Quest' : a.porque === 'acabou' ? 'As horas de nuvem acabaram' : 'No Quest, a legenda precisa da nuvem';
      $('p', miolo).textContent = a.porque === 'offline' ? 'O navegador do Quest não transcreve sozinho. Assim que a conexão voltar, a legenda volta. Jogos, vocabulário e revisão seguem funcionando.' : a.porque === 'acabou' ? 'Neste aparelho não há legenda sem nuvem. As horas voltam no dia 1º. Jogos, vocabulário e revisão seguem funcionando.' : 'O navegador do Quest não transcreve nem fala sozinho. Jogos, vocabulário e revisão funcionam aqui de graça.';
      if (a.porque === 'quest') miolo.insertAdjacentHTML('beforeend', `<div class="pl-sem" data-pl-momento="quest"><button type="button" class="q-ctl pri" data-pl="teste">Testar o Premium por 14 dias</button><button type="button" class="q-ctl" data-pl-porta="premium">Ver os planos</button><p class="px-nota">Sem cartão. No fim, a conta volta ao Grátis sozinha.</p></div>`);
      else if (a.porque === 'acabou' && conta.plano === 'essencial') miolo.insertAdjacentHTML('beforeend', '<div class="pl-sem" data-pl-momento="fim_horas"><button type="button" class="q-ctl pri" data-pl-porta="premium">Ver o Premium · 20 h por mês</button></div>');
      if (iniciar) {
        iniciar.dataset.pl = 'sem-legenda';
        delete iniciar.dataset.px;
        iniciar.setAttribute('aria-disabled', 'true');
        iniciar.innerHTML = `${icp('lock')} Legenda indisponível aqui`;
      }
      return;
    }
    if (ADS.disp === 'quest') $('p', miolo).textContent = 'Toque em Iniciar e deixe o Quest ouvir o ambiente. A legenda nos dois idiomas aparece aqui.';
    miolo.insertAdjacentHTML('beforeend', notaDoPronto());
  }
  /* A fileira nova nasce junto com a tela pronta, antes de os anúncios plantarem o chip da amostra. */
  const prepararSemNivel = prepararVivo;
  prepararVivo = function () {
    prepararSemNivel();
    pintarNivelNoVivo();
    if (polido() && !reduz()) $$('.pl-linha > *, .pl-nota, .pl-sem', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 480, atraso: 260 + i * 60 }));
  };
  /* Trocar algo com a tela aberta: repinta a fileira e devolve o chip da amostra ao lugar. */
  function repintarNivel() {
    if (atual === 'aovivo') {
      pintarNivelNoVivo();
      if (anunciando() && $('.px-pronto', tela)) PLANTIO.aovivo();
    }
    if (atual === 'interpretando') pintarInterprete();
    if (atual === 'ajustes' && (abaDe.ajustes || 0) === 3) mostrarSemAds('ajustes', { origem: 'seco' });
  }
  function aoGanharNuvem() {
    PL.escolha = 'precisao';
    setTimeout(() => {
      repintarNivel();
      sincronizarBarraPl();
      atualizarMapaPl();
    }, 0);
  }

  function escolherNivel(n, contexto) {
    const N = NIVEIS[n];
    if (n === 'aparelho' && !aparelhoLegenda()) return toast('No Quest o navegador não transcreve sozinho: o nível No aparelho não existe aqui.');
    if (!noPlano(n) && !(n === 'precisao' && comAmostra())) return abrirTranca(n);
    if (PL.offline && n !== 'aparelho') return toast('Sem internet: agora só o nível No aparelho funciona.');
    if (!temHoras(n)) return toast(`As horas do nível ${N.nome} deste mês acabaram. Elas voltam no dia 1º.`);
    PL.escolha = n;
    sentir('aba');
    repintarNivel();
    const a = nivelAgora(contexto);
    toast(a.nivel === n ? `${N.nome}: ${N.curto}` : a.razao);
  }

  /* ---- Folha do nível com cadeado: o que é, quem tem, e a porta para o plano certo ---- */
  function abrirTranca(n) {
    if ($('dialog[open]')) return;
    const N = NIVEIS[n];
    const plano = N.plano;
    const amostra = n === 'precisao' && tem('nuvem-30') && !(atual === 'aovivo' && !$('.px-pronto', tela)) && atual !== 'interpretando';
    const vale =
      n === 'aovivo'
        ? 'Vale a pena numa conversa de verdade: rua, viagem, reunião, aula. Para estudar com vídeo, a Precisão já basta.'
        : { pc: 'Neste computador, vale para português, áudio com barulho e várias pessoas falando. Para inglês limpo, o aparelho já chega perto.', fraco: 'Neste computador vale quase sempre: menos erro e menos espera.', celular: 'No celular vale para sessão longa e contínua, sem a legenda reiniciar a cada frase.', quest: 'No Quest é o único jeito de ter legenda e intérprete.' }[ADS.disp];
    const quem = n === 'aovivo' ? 'Só o plano Ao Vivo tem: 10 h por mês.' : 'No Essencial são 5 h por mês. No Premium, 20 h.';
    const d = folhaDeBaixo(
      `<div class="pj-como ad-confirma pl-tranca"><span class="label-mono">Nível de serviço · com cadeado no seu plano</span>
        <h2>${n === 'aovivo' ? 'O nível Ao vivo é do plano Ao Vivo' : 'A Precisão começa no plano Essencial'}</h2>
        <ul class="ad-lista">
          <li>${icp(N.icone)}<span><b>O que é.</b> ${N.longo}</span></li>
          <li>${icp('target')}<span><b>Quando vale a pena.</b> ${vale}</span></li>
          <li>${icp('wallet-cards')}<span><b>Quem tem.</b> ${quem}</span></li>
          <li>${icp('cpu')}<span><b>O que você já tem.</b> ${aparelhoLegenda() ? 'O nível No aparelho continua grátis e sem limite. Nada do que você usa hoje depende disto.' : 'Jogos, vocabulário e revisão seguem grátis. A legenda, neste aparelho, só com nuvem.'}</span></li>
        </ul>
        ${amostra ? `<div class="q-aviso ad ad-aviso pl-amostra" ${marca('nuvem-30')}><span>${icp('gift')} <span><b>Quer provar antes?</b> Veja um anúncio de até 30 s e ganhe 30 min de Precisão hoje. ${rotulo('Anúncio premiado')}</span></span><button type="button" class="q-ctl" data-pl-f="amostra">${icp('play')} Ver anúncio</button></div>` : ''}
        <div class="ad-confirma-pe"><button type="button" class="btn btn-outline" data-pl-f="nao">Agora não</button><button type="button" class="btn btn-solid" data-pl-f="porta">Ver o ${NOME_DO_PLANO[plano]} · ${PLANOS[plano].mensal}</button></div>
        <p class="ad-confirma-nota"><span>Trocar de plano nunca apaga o que você já gravou.</span><button type="button" class="ad-sem" data-pl-f="como">Como isto funciona</button></p></div>`,
      'pj-como-folha ad-folha',
    );
    focarFolha(d);
    d.addEventListener('click', (e) => {
      const f = e.target.closest('[data-pl-f]')?.dataset.plF;
      if (!f) return;
      fecharFolhaDeBaixo();
      if (f === 'porta') setTimeout(() => irAoPlano(plano), 320 * K());
      if (f === 'como') setTimeout(abrirComo, 360 * K());
      if (f === 'amostra') setTimeout(() => premiado('nuvem', {}), 360 * K());
    });
  }
  function irAoPlano(plano) {
    PL.destaque = plano;
    planosAba = 0;
    ir('planos');
  }

  /* ---- Folha "Como isto funciona": a escolha automática e o que é enviado ---------- */
  const linhaDoMedidor = (m) =>
    `<div class="pl-med-linha" data-tom="${m.acabou ? 'fim' : m.pct >= 85 ? 'pouco' : ''}"><span class="pl-med-topo"><b>${icp(NIVEIS[m.nivel].icone)} ${NIVEIS[m.nivel].nome}</b><span>${m.acabou ? `acabou · ${horas(m.total)} usadas` : `${horas(m.usado)} de ${horas(m.total)}`}</span></span><span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.pct}" aria-label="Nuvem no nível ${NIVEIS[m.nivel].nome} neste mês"><span style="width:${Math.max(m.pct, 2)}%"></span></span></div>`;
  function abrirComo() {
    if ($('dialog[open]')) return;
    const contexto = atual === 'interpretando' ? 'interprete' : 'capturar';
    const pintar = () => {
      const m = marcaDeOnde(contexto);
      const ms = medidores();
      return `<div class="pj-como pl-como"><span class="label-mono">Onde a sua fala é processada</span>
        <h2>Como isto funciona</h2>
        <div class="pl-agora" data-tom="${m.tom}"><span class="q-ic">${icp(m.icone)}</span><div><b>Agora: ${m.forte}</b><span class="ad-sub">${m.razao}</span></div></div>
        <p class="folha-rotulo">Os três níveis</p>
        <div class="pj-nivs pl-nivs" role="radiogroup" aria-label="Nível de serviço">${NIVEL_IDS.map((n) => {
          const tranca = !noPlano(n) && !(n === 'precisao' && comAmostra());
          const fora = n === 'aparelho' && !aparelhoLegenda();
          const selo = fora ? 'não existe aqui' : tranca ? `${NOME_DO_PLANO[NIVEIS[n].plano]}` : n === 'aparelho' ? 'grátis' : comAmostra() && n === 'precisao' ? 'amostra de hoje' : 'no seu plano';
          return `<button type="button" class="pj-niv" role="radio" aria-checked="${m.nivel === n}" data-pl-nivel="${n}" ${fora ? 'aria-disabled="true"' : ''}><b>${icp(tranca ? 'lock' : NIVEIS[n].icone)} ${NIVEIS[n].nome}</b><span>${NIVEIS[n].curto}</span><i class="pl-selo ${tranca || fora ? 'off' : ''}">${selo}</i></button>`;
        }).join('')}</div>
        ${ms.length ? `<p class="folha-rotulo">Nuvem deste mês</p><div class="pl-med">${ms.map(linhaDoMedidor).join('')}<p class="pj-como-ajudas">Quando as horas acabam, a legenda segue no aparelho, sem travar nada. Elas voltam no dia 1º.</p></div>` : ''}
        <p class="folha-rotulo">Como o app escolhe sozinho</p>
        <ol class="ad-lista pl-passos">
          <li>${icp('cpu')}<span><b>Primeiro, o que é grátis.</b> O modelo que roda no seu aparelho.</span></li>
          <li>${icp('smartphone')}<span><b>Depois, um recurso do próprio aparelho.</b> O reconhecimento de fala e o tradutor do navegador, quando existem.</span></li>
          <li>${icp('server')}<span><b>Nuvem, só quando o seu plano tem horas e vale a pena.</b> Aparelho fraco, português, áudio com barulho.</span></li>
          <li>${icp('wifi-off')}<span><b>Sem internet ou sem horas, volta para o aparelho.</b> Nada trava e nada é cobrado a mais.</span></li>
        </ol>
        <p class="folha-rotulo">O que é enviado</p>
        <ul class="ad-lista">
          <li>${icp('shield-check')}<span><b>No aparelho:</b> nada. O áudio e o texto ficam aqui.</span></li>
          <li>${icp('server')}<span><b>Na nuvem:</b> só o trecho de fala que está sendo legendado e o texto a traduzir. O pedido vai com a ordem de não guardar, e nunca é usado para escolher anúncio.</span></li>
          <li>${icp('smartphone')}<span><b>Recurso do aparelho (celular):</b> a fala passa pelo fabricante do navegador, Google ou Apple, pelas regras dele.</span></li>
        </ul>
        <div class="ad-confirma-pe"><button type="button" class="btn btn-outline" data-pl-f="auto" ${PL.escolha === 'auto' ? 'disabled' : ''}>${PL.escolha === 'auto' ? 'Escolha automática ligada' : 'Voltar à escolha automática'}</button><button type="button" class="btn btn-solid" data-pl-f="planos">Ver os planos</button></div>
        ${m.nivel === 'aparelho' && ADS.disp !== 'celular' ? '<p class="ad-confirma-nota"><span>Modelo baixado neste aparelho: 589 MB.</span><button type="button" class="ad-sem" data-pl-f="modelo">Ver o modelo</button></p>' : ''}</div>`;
    };
    const d = folhaDeBaixo(pintar(), 'pj-como-folha ad-folha pl-como-folha');
    focarFolha(d);
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.plNivel) {
        const n = b.dataset.plNivel;
        if (b.getAttribute('aria-disabled') === 'true') return toast('No Quest o navegador não transcreve sozinho: este nível não existe aqui.');
        if (!noPlano(n) && !(n === 'precisao' && comAmostra())) {
          fecharFolhaDeBaixo();
          return setTimeout(() => abrirTranca(n), 360 * K());
        }
        escolherNivel(n, contexto);
        const rol = d.scrollTop;
        $('.folha-corpo', d).innerHTML = pintar();
        d.scrollTop = rol;
        return;
      }
      const f = b.dataset.plF;
      if (!f) return;
      if (f === 'auto') {
        PL.escolha = 'auto';
        repintarNivel();
        $('.folha-corpo', d).innerHTML = pintar();
        return toast('Escolha automática: o app decide a cada sessão, começando pelo que é grátis.');
      }
      fecharFolhaDeBaixo();
      if (f === 'planos') setTimeout(() => irAoPlano(null), 320 * K());
      if (f === 'modelo') setTimeout(() => abrirDialogo('capturar:Modelo no dispositivo'), 360 * K());
    });
  }

  /* ==========================================================================
     Intérprete: a mesma marca na faixa do meio, a voz por plano e o Ao vivo
     ========================================================================== */
  const VOZ_DO_PLANO = { gratis: 'Voz do aparelho', essencial: 'Voz do aparelho', premium: 'Voz neural básica', aovivo: 'Voz neural boa' };
  function pintarInterprete() {
    const faixa = $('.int-faixa', tela);
    if (!faixa) return;
    const m = marcaDeOnde('interprete');
    const centro = $('.int-centro', faixa);
    $('.pl-int-onde', centro)?.remove();
    const curto = PL.offline ? (m.nivel ? 'Sem internet: no aparelho' : 'Sem internet') : !m.nivel ? 'Precisa da nuvem' : m.nivel === 'aparelho' ? (ADS.disp === 'celular' ? 'Recurso do aparelho' : 'No aparelho') : m.forte;
    centro.insertAdjacentHTML('afterbegin', `<button type="button" class="int-voz pl-int-onde" data-pl="como" data-tom="${m.tom}" aria-label="Onde a fala é processada: ${m.forte}, ${m.resto}. Trocar o nível ou ver como isto funciona" title="${esc(m.razao)}">${icp(m.icone)}<span class="pl-int-txt">${curto}</span>${icp('chevron-down')}</button>`);
    /* a voz também é parte do plano */
    const voz = $('.int-voz:not(.pl-int-onde)', centro);
    if (voz) {
      const semVoz = ADS.disp === 'quest' && !m.nivel;
      const neural = !semVoz && !PL.offline && ['premium', 'aovivo'].includes(conta.plano);
      $('.int-voz-txt', voz).textContent = semVoz ? 'Sem voz neste aparelho' : neural ? VOZ_DO_PLANO[conta.plano] : 'Voz do aparelho';
      voz.toggleAttribute('data-natural', neural);
    }
    /* o automático é do Premium em diante: no Essencial o cadeado continua */
    const auto = $('[data-px="automatico"]', faixa);
    const temAuto = ['premium', 'aovivo'].includes(conta.plano);
    if (auto && !int?.auto) auto.firstElementChild.outerHTML = ic(temAuto ? 'languages' : 'lock');
    /* Quest sem nuvem: o intérprete diz por que não fala */
    const aviso = $('.int-aviso', faixa);
    $('.pl-int-porta', faixa)?.remove();
    if (!m.nivel && !int?.hist.length) {
      $$('.int-dica', tela).forEach((p) => (p.textContent = 'No Quest o intérprete precisa da nuvem: o navegador daqui não transcreve nem fala sozinho.'));
      aviso.textContent = m.razao;
      if (m.porque === 'quest') centro.insertAdjacentHTML('beforeend', '<button type="button" class="int-modo pl-int-porta" data-pl-porta="premium">Conhecer o Premium</button>');
    } else if (aviso.dataset.pl) aviso.textContent = '';
    aviso.dataset.pl = !m.nivel ? '1' : '';
    $$('.int-falar', tela).forEach((b) => b.toggleAttribute('data-pl-sem', !m.nivel));
  }
  const interpretandoSemPlanos = aoMostrar.interpretando;
  aoMostrar.interpretando = () => {
    interpretandoSemPlanos?.();
    pintarInterprete();
  };
  /* Automático: Premium e Ao Vivo. Grátis e Essencial veem o cadeado e a porta. */
  const automaticoDoPremium = modoAutomatico;
  modoAutomatico = function (b) {
    if (['premium', 'aovivo'].includes(conta.plano)) return automaticoDoPremium(b);
    const aviso = $('.int-aviso', tela);
    aviso.textContent = `O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.${conta.plano === 'essencial' ? ' No Essencial, cada um toca o seu lado.' : ''}`;
    aviso.dataset.pl = '';
    if (!$('.px-int-conhecer', tela)) $('.int-centro', tela).insertAdjacentHTML('beforeend', '<button type="button" class="int-modo px-int-conhecer" data-pl-porta="premium">Conhecer o Premium</button>');
    if (polido() && !reduz()) anima(b, [0, -5, 5, -3, 3, 0].map((v) => ({ transform: `translateX(${v}px)` })), { d: 360, e: 'ease-out' });
  };
  /* No nível Ao vivo a tradução vai aparecendo do outro lado ENQUANTO a pessoa fala. */
  const falarPorTrechos = falar;
  falar = function (lado) {
    const s = int;
    if (!s || s.ocupado) return;
    if (!nivelAgora('interprete').nivel) return toast('No Quest o intérprete precisa da nuvem. Veja o Premium, ou troque o aparelho na barra do protótipo.');
    const aoVivo = nivelAgora('interprete').nivel === 'aovivo';
    const par = DIALOGO[lado][s.n[lado] % DIALOGO[lado].length];
    const r = falarPorTrechos(lado);
    if (!aoVivo) return r;
    const alvo = $(`.int-metade[data-lado="${ladoOposto(lado)}"] .int-frase`, tela);
    const st = $(`.int-metade[data-lado="${ladoOposto(lado)}"] .int-status`, tela);
    if (!alvo) return r;
    alvo.innerHTML = '<p class="int-traducao pl-parcial"></p>';
    st.textContent = 'Ao vivo: traduzindo enquanto fala';
    const palavras = par[1].split(' ');
    const total = par[0].split(' ').length * (polido() ? 170 : 90);
    palavras.forEach((p, i) =>
      setTimeout(
        () => {
          const linha = $('.pl-parcial', alvo);
          if (int !== s || !linha) return;
          const w = document.createElement('span');
          w.textContent = p + ' ';
          linha.append(w);
          if (polido() && !reduz()) anima(w, [{ opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0)' }], { d: 260 });
        },
        (220 + (i / palavras.length) * total) * K(),
      ),
    );
    return r;
  };

  /* ==========================================================================
     Momentos de oferta: raros, honestos e nunca no meio de uma fala
     ========================================================================== */
  const noMeioDeUmaFala = () => (atual === 'aovivo' && !$('.px-pronto', tela)) || (atual === 'interpretando' && int?.ocupado) || (atual === 'partida' && pj && !pj.fim);
  const MOMENTOS = {
    fim_horas: () => ({ icone: 'server', tag: 'Suas horas de nuvem acabaram neste mês', titulo: 'A legenda seguiu no aparelho', corpo: 'Nada travou e nada foi cobrado a mais. No Premium são 20 h de nuvem por mês; as suas 5 h voltam no dia 1º.', acao: 'Conhecer o Premium', faz: () => irAoPlano('premium') }),
    audio_dificil: () => {
      const comAnuncio = tem('nuvem-30');
      return { icone: 'audio-lines', tag: 'Este áudio estava difícil', titulo: 'A nuvem erraria menos aqui', corpo: `Havia barulho ou mais de uma pessoa falando. O nível Precisão acerta mais nesse tipo de som. ${comAnuncio ? 'Dá para provar hoje, por um anúncio.' : 'Ele faz parte do Essencial.'}`, acao: comAnuncio ? 'Provar 30 min (anúncio)' : 'Conhecer o Essencial', faz: () => (comAnuncio ? premiado('nuvem', {}) : irAoPlano('essencial')) };
    },
  };
  function ofertaDePlano(id) {
    if (naoMostrar.has(id) || $('.qc-oferta') || folha || $('dialog[open]') || noMeioDeUmaFala()) return false;
    const m = MOMENTOS[id]();
    app.insertAdjacentHTML(
      'beforeend',
      `<aside class="qc-oferta pl-oferta" role="complementary" aria-label="Sugestão de plano" data-pl-momento="${id}">
        <span class="q-ic">${icp(m.icone)}</span>
        <div class="qc-oferta-texto"><span class="q-tag">${m.tag}</span><b>${m.titulo}</b><p>${m.corpo}</p></div>
        <button type="button" class="q-ctl qc-fechar" aria-label="Fechar" data-px="agora-nao">${ic('x')}</button>
        <div class="q-acoes"><button type="button" class="q-ctl pri" data-px="conhecer">${m.acao}</button><button type="button" class="q-ctl" data-px="agora-nao">Agora não</button><button type="button" class="q-ctl" data-px="nunca">Não mostrar novamente</button></div>
      </aside>`,
    );
    const o = $('.qc-oferta');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.px === 'nunca') naoMostrar.add(id), toast('Combinado: esta sugestão não aparece mais.');
      fecharOferta();
      if (b.dataset.px === 'conhecer') setTimeout(m.faz, 300 * K());
    });
    if (!polido() || reduz()) return true;
    anima(o, [{ opacity: 0, translate: '0 120%' }, { opacity: 1, translate: '0 0' }], { d: 680, e: MOLA_SUAVE });
    anima($('.q-ic', o), [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 700, atraso: 180, e: MOLA });
    $$('.qc-oferta-texto > *, .q-acoes > *', o).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 200 + i * 55 }));
    return true;
  }
  /* A sugestão antiga falava só do Premium. Agora: quem paga não recebe convite genérico, e o
     fim de uma captura pode trazer um dos dois momentos novos. */
  const ofertaDoPremium = oferta;
  oferta = function (momento) {
    if (momento === 'fim_de_sessao') {
      if (conta.plano === 'essencial' && PL.nuvem === 'acabou') return ofertaDePlano('fim_horas');
      if (conta.plano === 'gratis' && PL.dificil && ADS.disp !== 'quest') return ofertaDePlano('audio_dificil');
    }
    if (conta.plano !== 'gratis') return;
    return ofertaDoPremium(momento);
  };

  /* ==========================================================================
     Planos: quatro cartões, o recomendado para o aparelho, comparação e perguntas
     ========================================================================== */
  const TABELA4 = [
    ['Anúncios', 'leves e rotulados', 'sem anúncios', 'sem anúncios', 'sem anúncios'],
    ['Legenda bilíngue no aparelho', 'sem limite', 'sem limite', 'sem limite', 'sem limite'],
    ['Horas de nuvem por mês (Precisão)', 'amostra por anúncio', '5 h', '20 h', '20 h'],
    ['Texto durante a fala (Ao vivo)', 0, 0, 0, '10 h'],
    ['Tradução Nuance', 0, 'rápida', 'rápida', 'rápida'],
    ['Intérprete', 'cada um toca o seu lado', 'cada um toca o seu lado', 'automático', 'automático'],
    ['Voz do intérprete', 'do aparelho', 'do aparelho', 'neural básica', 'neural boa'],
    ['Sincronização entre aparelhos', 0, 1, 1, 1],
    ['Jogos, vocabulário e revisão', 1, 1, 1, 1],
  ];
  const FAQ4 = [
    ['O que quer dizer "no aparelho"?', 'Que a transcrição e a tradução rodam no seu computador ou celular, sem mandar o áudio para fora. É grátis, não tem limite e funciona sem internet. Em aparelho fraco erra mais; no Quest não existe.'],
    ['O que acontece quando as horas de nuvem acabam?', 'Nada trava. A legenda volta para o aparelho e segue sem limite, e nada é cobrado a mais. As horas voltam no dia 1º. No Quest, que depende da nuvem, a legenda espera até lá.'],
    ['Posso cancelar?', 'Pode, quando quiser, em Planos › Sua assinatura. O plano vale até o fim do período pago e há 7 dias para desistir com reembolso. O que você gravou continua seu.'],
    ['Por que o Grátis tem anúncio?', 'Porque é ele que paga o Grátis sem limite. Os anúncios são poucos, rotulados e nunca aparecem durante a legenda ao vivo, o intérprete ou uma rodada. No Quest e no perfil infantil não há anúncio nenhum.'],
    ['O teste cobra sozinho no fim?', 'Não. São 14 dias de Premium, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.'],
    ['Meu áudio fica guardado na nuvem?', 'Não. Vai só o trecho que está sendo legendado, com a ordem de não guardar, e ele nunca é usado para escolher anúncio. No nível No aparelho, nada sai daqui.'],
  ];
  const recomendadoAqui = () => DISPS[ADS.disp].recomendado;
  function cartaoDoPlano(id) {
    const p = PLANOS[id];
    const meu = conta.plano === id;
    const rec = recomendadoAqui() === id;
    const anual = PL.ciclo === 'anual' && p.anual;
    const rot = meu ? `Seu plano${conta.teste ? ' · em teste' : ''}${rec ? ' · indicado aqui' : ''}` : rec ? '<span class="q-tag">Recomendado aqui</span>' : p.rotulo;
    const preco = anual ? `<p class="px-preco"><b>${p.anual}</b><span>por ano</span></p><p class="pl-preco-nota">dá ${p.porMesNoAnual} por mês · ${p.economia} a menos</p>` : `<p class="px-preco"><b>${p.mensal}</b><span>${id === 'gratis' ? 'para sempre' : 'por mês'}</span></p><p class="pl-preco-nota">${id === 'gratis' ? 'sem cartão, sem conta' : p.soMensal ? 'só mensal, por enquanto' : `ou ${p.anual} por ano`}</p>`;
    let acoes;
    if (meu) acoes = id === 'gratis' ? '<button type="button" class="q-ctl" data-px="ficar">Continuar grátis</button>' : conta.teste ? '<button type="button" class="q-ctl pri" data-pl-assinar="premium">Assinar Premium</button><p class="px-nota">Seu teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha.</p>' : '<button type="button" class="q-ctl" disabled>Este é o seu plano</button>';
    else if (id === 'gratis') acoes = '<button type="button" class="q-ctl" data-px="voltar-gratis">Voltar ao Grátis</button>';
    else if (id === 'premium' && conta.plano === 'gratis') acoes = `<button type="button" class="q-ctl ${rec ? 'pri' : ''}" data-px="teste">Testar 14 dias grátis</button><button type="button" class="q-ctl" data-pl-assinar="premium">Assinar Premium</button><p class="px-nota">Sem cartão. No fim, volta ao Grátis sozinha.</p>`;
    else acoes = `<button type="button" class="q-ctl ${rec ? 'pri' : ''}" data-pl-assinar="${id}">${ORDEM_DO_PLANO[id] < ORDEM_DO_PLANO[conta.plano] ? 'Mudar para o' : 'Assinar'} ${NOME_DO_PLANO[id]}</button>`;
    return `<section class="q-cartao px-plano pl-plano ${rec ? 'px-premium' : ''} ${meu ? 'pl-meu' : ''}" data-pl-plano="${id}" aria-label="Plano ${NOME_DO_PLANO[id]}"><p class="q-rotulo">${rot}</p><h3>${NOME_DO_PLANO[id]}</h3>
        ${preco}<p class="q-d pl-quem">${p.quem}</p>
        ${p.base ? `<p class="px-tudo">${p.base}</p>` : ''}
        <ul>${p.itens.map(([t, n]) => li(t, n)).join('')}</ul>
        <div class="pl-plano-pe">${acoes}</div></section>`;
  }
  function notaDoAparelho() {
    const d = DISPS[ADS.disp];
    const g = GRATIS_NO_APARELHO[ADS.disp];
    const sinal = (v) => (v === 1 ? `<span class="pl-sinal ok">${icp('check')}</span>` : v === 2 ? `<span class="pl-sinal meio">${icp('info')}</span>` : `<span class="pl-sinal nao">${icp('x')}</span>`);
    return `<section class="q-cartao pl-aparelho" data-pl-aparelho="${ADS.disp}"><div class="pl-aparelho-topo"><span class="q-ic">${icp(d.icone)}</span><div><p class="q-rotulo">Você está num ${d.nome.toLowerCase().replace('meta quest', 'Meta Quest')}</p><p class="pl-aparelho-frase">${g.frase}</p></div></div>
      <details class="pl-aparelho-det"><summary>O que o Grátis consegue neste aparelho${ic('chevron-down')}</summary><ul>${g.linhas.map(([t, x, v]) => `<li>${sinal(v)}<span><b>${t}.</b> ${x}</span></li>`).join('')}</ul></details></section>`;
  }
  function comparacao() {
    const ver = PL.comparar && PL.comparar !== conta.plano ? PL.comparar : recomendadoAqui() !== conta.plano ? recomendadoAqui() : PLANO_IDS.find((x) => x !== conta.plano);
    return `<section class="q-secao pl-comparar"><header><div><h2>Comparar em detalhe</h2></div></header>
      <div class="q-abas q-seg pl-compara-escolha" role="radiogroup" aria-label="Comparar o seu plano com">${PLANO_IDS.map((id) => `<button type="button" role="radio" class="q-aba" aria-checked="${id === ver}" data-pl-comparar="${id}" ${id === conta.plano ? 'disabled' : ''}>${NOME_DO_PLANO[id]}</button>`).join('')}</div>
      <div class="q-tabela-caixa"><table class="q-tabela pl-compara" data-meu="${conta.plano}" data-ver="${ver}"><thead><tr><th scope="col">&nbsp;</th>${PLANO_IDS.map((id) => `<th scope="col" data-c="${id}">${NOME_DO_PLANO[id]}${id === conta.plano ? '<small>seu plano</small>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${TABELA4.map(([a, ...v]) => `<tr><th scope="row">${a}</th>${v.map((x, i) => `<td data-c="${PLANO_IDS[i]}">${celula(x)}</td>`).join('')}</tr>`).join('')}
      <tr class="pl-compara-preco"><th scope="row">Por mês</th>${PLANO_IDS.map((id) => `<td data-c="${id}"><b>${PLANOS[id].mensal}</b></td>`).join('')}</tr>
      <tr class="pl-compara-preco"><th scope="row">Por ano</th>${PLANO_IDS.map((id) => `<td data-c="${id}">${PLANOS[id].anual || (id === 'gratis' ? celula(0) : 'só mensal')}</td>`).join('')}</tr></tbody></table></div>
      <p class="px-nota">A nuvem tem dois níveis: Precisão (por trechos, erra menos) e Ao vivo (texto enquanto a pessoa fala). Quando as horas acabam, a legenda segue no aparelho.</p></section>`;
  }
  const textoDoMeuPlano = () => `${NOME_DO_PLANO[conta.plano]}${conta.teste ? ' · em teste' : ''}`;
  function consumoDoMes() {
    const ms = medidores();
    const pago = conta.plano !== 'gratis';
    const cartao = (t, v, s, pct, tom = '') => `<div class="q-cartao q-num px-consumo" data-tom="${tom}"><span class="q-rotulo">${t}</span><b>${v}</b>${pct >= 0 ? `<span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t}"><span style="width:${Math.max(pct, 2)}%"></span></span>` : ''}<span>${s}</span></div>`;
    const P = ms.find((m) => m.nivel === 'precisao');
    const V = ms.find((m) => m.nivel === 'aovivo');
    return `<div class="q-grade g2 pl-consumo">${[
      P ? cartao('Nuvem · Precisão', horas(P.usado), P.acabou ? `de ${horas(P.total)} · acabou: a legenda segue no aparelho` : `de ${horas(P.total)} do plano · restam ${horas(P.resta)}`, P.pct, P.acabou ? 'fim' : P.pct >= 85 ? 'pouco' : '') : cartao('Nuvem · Precisão', ADS.nuvemMin ? `${ADS.nuvemMin} min` : '—', ADS.nuvemMin ? 'amostra de hoje, por anúncio; vale até a meia-noite' : 'não faz parte do Grátis', -1),
      V ? cartao('Nuvem · Ao vivo', horas(V.usado), V.acabou ? `de ${horas(V.total)} · acabou: voltou para a Precisão` : `de ${horas(V.total)} do plano · restam ${horas(V.resta)}`, V.pct, V.acabou ? 'fim' : V.pct >= 85 ? 'pouco' : '') : cartao('Nuvem · Ao vivo', '—', 'faz parte do plano Ao Vivo', -1),
      cartao('Tradução Nuance', pago ? '18' : '—', pago ? 'consultas neste mês · incluída no plano' : 'faz parte do Essencial', -1),
      cartao('Armazenamento', '128 MB', 'de 500 MB do limite do plano', 26),
    ].join('')}</div>
    ${pago ? `<p class="px-nota pl-renova">${icp('calendar-clock')} As horas de nuvem voltam no dia 1º. O que roda no aparelho não entra nesta conta.</p>` : `<div class="q-aviso pl-aviso-linha"><span>${ic('lock')}<span>As horas de nuvem fazem parte dos planos pagos. A legenda no aparelho continua sem limite.</span></span><button type="button" class="q-ctl" data-px-ir-aba="0">Ver planos</button></div>`}`;
  }
  function suaAssinatura() {
    const id = conta.plano;
    const p = PLANOS[id];
    const titulo = id === 'gratis' ? 'Você está no Grátis' : conta.teste ? 'Premium, em teste' : `Plano ${NOME_DO_PLANO[id]}`;
    const texto =
      id === 'gratis'
        ? 'Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão. Quando quiser ir além, o Premium tem teste de 14 dias, sem cartão.'
        : conta.teste
          ? 'O teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.'
          : `${p.mensal} por mês, renovado no dia 9. ${p.quem} Cancele quando quiser: o plano vale até o fim do período pago.`;
    const acoes =
      id === 'gratis'
        ? '<button type="button" class="q-ctl pri" data-px="teste">Testar 14 dias grátis</button><button type="button" class="q-ctl" data-px-ir-aba="0">Comparar os planos</button>'
        : conta.teste
          ? '<button type="button" class="q-ctl pri" data-pl-assinar="premium">Assinar Premium</button><button type="button" class="q-ctl" data-px="voltar-gratis">Voltar ao Grátis agora</button>'
          : `<button type="button" class="q-ctl pri" data-px-ir-aba="0">Mudar de plano</button>${p.anual ? `<button type="button" class="q-ctl" data-pl-assinar="${id}" data-pl-anual>Passar para o anual · ${p.anual}</button>` : ''}<button type="button" class="q-ctl" data-px="voltar-gratis">Cancelar a assinatura</button>`;
    return `<section class="q-cartao px-assinatura"><span class="q-ic">${ic(id === 'gratis' ? 'user-round' : 'sparkles')}</span><div>
      <p class="q-rotulo">Sua assinatura</p><h2>${titulo}</h2><p class="q-d">${texto}</p><div class="q-acoes">${acoes}</div></div></section>`;
  }
  htmlDosPlanos = function () {
    const pago = conta.plano !== 'gratis';
    const paineis = [
      () => `${notaDoAparelho()}
        <div class="pl-ciclo-linha"><div class="q-abas q-seg pl-ciclo" role="radiogroup" aria-label="Cobrança">${[['mensal', 'Mensal'], ['anual', 'Anual']].map(([k, t]) => `<button type="button" role="radio" class="q-aba" aria-checked="${PL.ciclo === k}" data-pl-ciclo="${k}">${t}${k === 'anual' ? ' <span class="ad-mini-tag">até 37% a menos</span>' : ''}</button>`).join('')}</div>
          <p class="pl-dica-arraste">${icp('arrow-left-right')} Quatro planos: arraste para o lado</p></div>
        <div class="q-grade g4 px-planos-grade pl-planos-grade">${PLANO_IDS.map(cartaoDoPlano).join('')}</div>
        <p class="px-garantia">${ic('lock')} Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser</p>
        ${comparacao()}
        <section class="q-secao pl-faq"><header><div><h2>Perguntas frequentes</h2></div></header>
          <div class="px-faq">${FAQ4.map(([q, r]) => `<details class="q-cartao"><summary>${q}${ic('chevron-down')}</summary><p>${r}</p></details>`).join('')}</div></section>`,
      suaAssinatura,
      consumoDoMes,
    ];
    return `<div class="q-palco px-planos-tela pl-planos-tela">
      <header class="q-cab"><div><p class="q-sobre">Planos</p><h1>Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho</h1></div>
        <span class="q-chip px-meu-plano">${ic(pago ? 'sparkles' : 'user-round')} ${pago ? textoDoMeuPlano() : 'Seu plano: Grátis'}</span></header>
      <div class="q-abas px-abas-planos" role="tablist" aria-label="Planos">${['Planos', 'Sua assinatura', 'Consumo do mês'].map((t, i) => aba(t, planosAba === i, `data-px-plano-aba="${i}"`)).join('')}</div>
      ${paineis[planosAba]()}
    </div>`;
  };
  /* Depois de pintar: pílulas dos seletores e, no celular, o carrossel parado no cartão certo. */
  function arrumarPlanos(o = {}) {
    if (atual !== 'planos') return;
    $$('.pl-ciclo, .pl-compara-escolha', tela).forEach((g) => porPilula(g));
    const grade = $('.pl-planos-grade', tela);
    if (!grade) return;
    const alvoId = PL.destaque || (o.manter ? null : recomendadoAqui());
    const cartao = alvoId && $(`[data-pl-plano="${alvoId}"]`, grade);
    if (cartao && celular()) grade.scrollLeft = cartao.offsetLeft - (grade.clientWidth - cartao.offsetWidth) / 2;
    if (PL.destaque && cartao) {
      PL.destaque = null;
      setTimeout(
        () => {
          cartao.scrollIntoView({ block: 'center', inline: 'center', behavior: reduz() ? 'auto' : 'smooth' });
          cartao.classList.add('ad-aqui');
          setTimeout(() => cartao.classList.remove('ad-aqui'), 2600);
        },
        (polido() && !reduz() ? 700 : 60) * K(),
      );
    }
  }
  function repintarPlanos(dir = 1, o = {}) {
    const rolX = $('.pl-planos-grade', tela)?.scrollLeft;
    repintar(htmlDosPlanos(), dir, o.de || '.px-abas-planos');
    arrumarPlanos({ manter: true });
    const g = $('.pl-planos-grade', tela);
    if (g && rolX != null && !PL.destaque) g.scrollLeft = rolX;
  }
  const planosSemArrumar = aoMostrar.planos;
  aoMostrar.planos = () => {
    planosSemArrumar?.();
    arrumarPlanos();
  };
  ativarTeste = com(ativarTeste, () => {
    if (conta.plano !== 'premium') Object.assign(conta, { plano: 'premium', teste: true });
    else if (!conta.teste) conta.teste = true;
    setTimeout(() => (sincronizarBarraPl(), aplicarAds({ semRedesenho: true }), arrumarPlanos({ manter: true }), atualizarMapaPl()), 0);
  });

  /* ==========================================================================
     Ajustes › Processamento: os três níveis e o medidor de nuvem do mês
     ========================================================================== */
  function pintarProcessamento() {
    const painel = $('#painel-contas', tela);
    if (!painel || $('.pl-proc', painel)) return;
    const grade = $('.q-grade', painel);
    const local = grade && $('.q-aju-opcao', grade);
    if (!local) return;
    const a = nivelAgora('capturar');
    const tags = (n) => {
      const tranca = !noPlano(n) && !(n === 'precisao' && comAmostra());
      const m = medidor(n);
      const plano = tranca ? `<span class="q-tag off">${icp('lock')} ${NOME_DO_PLANO[NIVEIS[n].plano]}</span>` : `<span class="q-tag">${m ? (m.acabou ? 'acabou neste mês' : `restam ${horas(m.resta)}`) : comAmostra() ? `amostra: ${ADS.nuvemMin} min` : 'no seu plano'}</span>`;
      return plano + (a.nivel === n ? '<span class="q-tag">Em uso</span>' : '');
    };
    /* o cartão que já existe ("Rodar no seu aparelho") vira o primeiro dos três níveis */
    grade.classList.add('g3', 'pl-proc');
    local.dataset.plNivel = 'aparelho';
    local.setAttribute('aria-pressed', a.nivel === 'aparelho');
    $('.q-aju-tags', local).innerHTML = aparelhoLegenda() ? `<span class="q-tag">Grátis · privado</span>${a.nivel === 'aparelho' ? '<span class="q-tag">Em uso</span>' : ''}` : '<span class="q-tag off">não existe no Quest</span>';
    if (ADS.disp === 'celular') $('.q-d', local).textContent = 'No celular usa o reconhecimento de fala do navegador e um tradutor baixado (113 MB, uma vez). Sem custo.';
    if (ADS.disp === 'quest') $('.q-d', local).textContent = 'O navegador do Quest não transcreve nem fala sozinho. Aqui só os jogos e a revisão rodam no aparelho.';
    grade.insertAdjacentHTML(
      'beforeend',
      ['precisao', 'aovivo']
        .map((n) => `<button type="button" class="q-tile q-aju-opcao" aria-pressed="${a.nivel === n}" data-pl-nivel="${n}"><span class="q-ic">${icp(NIVEIS[n].icone)}</span><b>${n === 'precisao' ? 'Nuvem: Precisão' : 'Nuvem: Ao vivo'}</b><span class="q-aju-tags">${tags(n)}</span><span class="q-d">${NIVEIS[n].longo}</span></button>`)
        .join(''),
    );
    const secao = grade.closest('.q-secao');
    $('header p', secao).textContent = 'O app escolhe sozinho, começando pelo que é grátis. Você pode mudar quando quiser.';
    const ms = medidores();
    const cartaoM = (m) => `<div class="q-cartao q-num px-consumo" data-tom="${m.acabou ? 'fim' : m.pct >= 85 ? 'pouco' : ''}"><span class="q-rotulo">${NIVEIS[m.nivel].nome}</span><b>${horas(m.usado)}</b><span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.pct}" aria-label="Nuvem no nível ${NIVEIS[m.nivel].nome}"><span style="width:${Math.max(m.pct, 2)}%"></span></span><span>${m.acabou ? `de ${horas(m.total)} · acabou: ${m.nivel === 'aovivo' ? 'voltou para a Precisão' : aparelhoLegenda() ? 'voltou para o aparelho' : 'a legenda espera o dia 1º'}` : `de ${horas(m.total)} do plano ${NOME_DO_PLANO[conta.plano]} · restam ${horas(m.resta)}`}</span></div>`;
    secao.insertAdjacentHTML(
      'afterend',
      `<section class="q-secao pl-nuvem-do-mes"><header><div><h2>Nuvem deste mês</h2><p>${ms.length ? 'Quando as horas acabam, a legenda segue no aparelho, sem travar nada. Elas voltam no dia 1º.' : 'As horas de nuvem fazem parte dos planos pagos. No Grátis tudo roda no aparelho, sem limite.'}</p></div>
        <button type="button" class="q-ctl" data-pl="como">${icp('info')} Como isto funciona</button></header>
        ${ms.length ? `<div class="q-grade g2">${ms.map(cartaoM).join('')}</div>` : `<div class="q-aviso"><span>${icp('server')} ${ADS.nuvemMin ? `<b>Amostra de hoje: ${ADS.nuvemMin} min de Precisão.</b> Vale até a meia-noite.` : aparelhoLegenda() ? '<b>Você está no Grátis.</b> O Essencial tem 5 h de nuvem por mês; o Premium, 20 h.' : '<b>No Quest a legenda precisa da nuvem.</b> O Premium tem 20 h por mês e teste de 14 dias, sem cartão.'}</span><button type="button" class="q-ctl" data-px="planos">Ver planos</button></div>`}
        <div class="q-ajuste pl-onde-ajuste"><div><b>Onde a fala está sendo processada agora</b><small>${a.razao}</small></div>${htmlDaMarca('capturar')}</div></section>`,
    );
  }
  const ajustesSemPlanos = aoMostrar.ajustes;
  aoMostrar.ajustes = () => {
    ajustesSemPlanos?.();
    if (!polido()) return;
    if ((abaDe.ajustes || 0) === 3) pintarProcessamento();
    const b = $('.px-plano-na-conta b', tela);
    if (b) b.textContent = `Seu plano: ${textoDoMeuPlano()}`;
  };
  const inicioSemPlanos = aoMostrar.inicio;
  aoMostrar.inicio = () => {
    inicioSemPlanos?.();
    const chip = $('.px-plano-chip', tela);
    if (chip && conta.plano !== 'gratis') chip.innerHTML = `${ic('sparkles')} ${textoDoMeuPlano()}`;
  };
  aoAbrirFolha.push((tipo, painel) => {
    const s = tipo === 'mais' && $('.px-entrada-premium small', painel);
    if (!s) return;
    $('.px-entrada-premium b', painel).textContent = 'Planos';
    s.textContent = conta.plano === 'gratis' ? 'Você está no Grátis · veja os quatro planos e teste o Premium por 14 dias' : `Você está no ${textoDoMeuPlano()} · consumo de nuvem e assinatura`;
  });

  /* ---- Cliques dentro das telas --------------------------------------------------- */
  ganchos.unshift((e, b) => {
    const d = b.dataset;
    if (d.plNivel) return escolherNivel(d.plNivel, atual === 'interpretando' ? 'interprete' : 'capturar'), true;
    if (d.pl === 'como') return abrirComo(), true;
    if (d.plPorta) return irAoPlano(d.plPorta), true;
    if (d.pl === 'sem-legenda') return toast('Neste aparelho a legenda precisa da nuvem. Veja os planos, ou troque o aparelho na barra do protótipo.'), true;
    if (d.pl === 'baixar-tradutor') {
      PL.tradutorBaixado = true;
      toast('No app, aqui o tradutor (113 MB) é baixado uma vez só. A partir daí, a tradução é grátis e funciona sem internet.');
      return repintarNivel(), true;
    }
    if (d.pl === 'teste') {
      irAoPlano('premium');
      return setTimeout(() => atual === 'planos' && ativarTeste(), 900 * K()), true;
    }
    if (atual !== 'planos') return false;
    if (d.pxPlanoAba) return (planosAba = +d.pxPlanoAba), repintarPlanos(1), true;
    if (d.pxIrAba) return (planosAba = +d.pxIrAba), repintarPlanos(-1), true;
    if (d.plCiclo) return (PL.ciclo = d.plCiclo), sentir('aba'), repintarPlanos(0, { de: '.px-nada' }), true;
    if (d.plComparar) return (PL.comparar = d.plComparar), sentir('aba'), repintarPlanos(0, { de: '.px-nada' }), true;
    if (d.plAssinar) {
      const p = PLANOS[d.plAssinar];
      const anual = (PL.ciclo === 'anual' || 'plAnual' in d) && p.anual;
      return toast(`No app, aqui abre o pagamento do ${NOME_DO_PLANO[d.plAssinar]} (${anual ? `${p.anual} por ano` : `${p.mensal} por mês`}). Para ver o app neste plano, use "Plano" na barra do protótipo.`, 5200), true;
    }
    if (d.px === 'voltar-gratis') {
      Object.assign(conta, { plano: 'gratis', teste: false });
      planosAba = 0;
      aplicarPlano();
      return toast('Você voltou ao Grátis. Nada foi cobrado.'), true;
    }
    return false;
  });

  /* ==========================================================================
     Barra do protótipo: Plano, Aparelho, horas de nuvem, internet e o Mapa dos planos
     ========================================================================== */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="px-barra ad-barra pl-barra" role="toolbar" aria-label="Controles dos planos">
      <button type="button" data-pl-b="mapa" class="ad-barra-mapa pl-barra-mapa" aria-pressed="false" title="Cada tela e estado novo dos quatro planos, com um atalho até ele">Mapa dos planos</button>
      <span class="px-sep"></span>
      <div class="px-seg" title="Plano da conta. Os anúncios só existem no Grátis."><i></i>${PLANO_IDS.map((id) => `<button type="button" data-pl-plano="${id}" aria-pressed="false" title="${PLANOS[id].mensal}${id === 'gratis' ? '' : ' por mês'} · ${PLANOS[id].quem}">${NOME_DO_PLANO[id]}</button>`).join('')}</div>
      <span class="ad-barra-t">Aparelho</span>
      <div class="px-seg" title="O aparelho que o app acha que está usando. Muda o que o Grátis consegue e o plano recomendado. (Para ver em tamanho de celular, use Computador / Tablet / Celular na barra de baixo.)"><i></i>${DISP_IDS.map((id) => `<button type="button" data-pl-disp="${id}" aria-pressed="false" title="${DISPS[id].nome}">${DISPS[id].curto}</button>`).join('')}</div>
      <span class="ad-barra-t">Nuvem</span>
      <div class="px-seg" title="Quantas horas de nuvem do plano já foram usadas neste mês"><i></i><button type="button" data-pl-nuvem="sobra" aria-pressed="false">Sobrando</button><button type="button" data-pl-nuvem="pouco" aria-pressed="false">No fim</button><button type="button" data-pl-nuvem="acabou" aria-pressed="false" title="As horas acabaram: a legenda volta para o aparelho, sem travar nada">Acabou</button></div>
      <button type="button" data-pl-b="offline" aria-pressed="false" title="Sem internet: tudo volta para o aparelho">Sem internet</button>
      <button type="button" data-pl-b="dificil" aria-pressed="false" title="Simula uma captura com barulho. No Grátis, a sugestão da Precisão só aparece DEPOIS de encerrar, nunca no meio da fala.">Áudio difícil</button>
    </div>
    <div class="ad-mapa-fundo pl-mapa-fundo"></div>
    <aside class="ad-mapa pl-mapa" aria-label="Mapa dos planos" tabindex="-1"></aside>`,
  );
  const barraPl = $('.pl-barra');
  const mapaPl = $('.pl-mapa');
  function sincronizarBarraPl() {
    $$('[data-pl-plano]', barraPl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.plPlano === conta.plano));
    $$('[data-pl-disp]', barraPl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.plDisp === ADS.disp));
    $$('[data-pl-nuvem]', barraPl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.plNuvem === PL.nuvem));
    $('[data-pl-b="offline"]', barraPl).setAttribute('aria-pressed', PL.offline);
    $('[data-pl-b="dificil"]', barraPl).setAttribute('aria-pressed', PL.dificil);
    $$('.px-seg [aria-pressed="true"]', barraPl).forEach((b) => b.offsetWidth && marcarSeg(b));
    html.dataset.plano = conta.plano;
    html.dataset.aparelho = ADS.disp;
  }
  function estadoDosPlanos() {
    return { plano: conta.plano, teste: conta.teste, disp: ADS.disp, nuvem: PL.nuvem, offline: PL.offline, dificil: PL.dificil, nuvemMin: ADS.nuvemMin };
  }
  function receberPlanos(s) {
    if (!PLANO_IDS.includes(s.plano)) return;
    Object.assign(conta, { plano: s.plano, teste: !!s.teste });
    /* O que vem de outra janela só entra se for um dos valores conhecidos. */
    ADS.disp = DISP_IDS.includes(s.disp) ? s.disp : 'pc';
    ADS.nuvemMin = Number.isFinite(+s.nuvemMin) ? Math.max(0, Math.floor(+s.nuvemMin)) : 0;
    Object.assign(PL, { nuvem: ['sobra', 'pouco', 'acabou'].includes(s.nuvem) ? s.nuvem : 'sobra', offline: !!s.offline, dificil: !!s.dificil });
  }
  /* Qualquer mudança de plano, aparelho ou horas passa por aqui. */
  function aplicarPlano(o = {}) {
    if (PL.escolha !== 'auto' && !temHoras(PL.escolha) && !noPlano(PL.escolha)) PL.escolha = 'auto';
    sincronizarBarraPl();
    aplicarAds({ semRedesenho: true });
    atualizarMapaPl();
    if (!atual || o.semRedesenho) return;
    $('dialog.ad-tela')?.remove();
    $('.qc-oferta')?.remove();
    if (noMeioDeUmaFala() && atual !== 'partida') return repintarNivel(); /* gravando ou falando: só a marca muda */
    if (['partida', 'jogo'].includes(atual)) return redesenharAds();
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    if (folha) fecharFolha({ seco: true, semFoco: true });
    if (atual === 'aovivo' || atual === 'interpretando') return trocar(atual, {}, 'seco', 1);
    mostrarSemAds(atual, { origem: 'seco' });
  }
  function acaoDosPlanos(a) {
    if (a === 'como') return abrirComo();
  }
  barraPl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.plB === 'mapa') return abrirMapaPl(!document.body.classList.contains('pl-mapa-aberto'));
    if (d.plPlano) {
      Object.assign(conta, { plano: d.plPlano, teste: false });
      PL.escolha = 'auto';
      toast(d.plPlano === 'gratis' ? 'Grátis: tudo no aparelho, com anúncios leves.' : `${NOME_DO_PLANO[d.plPlano]} (${PLANOS[d.plPlano].mensal} por mês): sem anúncios. ${PLANOS[d.plPlano].itens[d.plPlano === 'essencial' ? 3 : 0][0]}.`);
    } else if (d.plDisp) {
      ADS.disp = d.plDisp;
      PL.escolha = 'auto';
      PL.tradutorBaixado = false;
      toast(`Aparelho simulado: ${DISPS[d.plDisp].nome}. Recomendado aqui: ${NOME_DO_PLANO[DISPS[d.plDisp].recomendado]}.`);
    } else if (d.plNuvem) {
      PL.nuvem = d.plNuvem;
      if (conta.plano === 'gratis') toast('As horas de nuvem são dos planos pagos. Escolha Essencial, Premium ou Ao Vivo para ver o medidor.');
    } else if (d.plB === 'offline') PL.offline = !PL.offline;
    else if (d.plB === 'dificil') {
      PL.dificil = !PL.dificil;
      toast(PL.dificil ? 'Áudio difícil ligado. No Grátis: inicie uma captura e encerre para ver a sugestão. Ela nunca aparece no meio da fala.' : 'Áudio difícil desligado.', 5200);
      sincronizarBarraPl();
      return aplicarAds({ semRedesenho: true });
    } else return;
    aplicarPlano();
  });
  addEventListener('resize', () => requestAnimationFrame(sincronizarBarraPl));
  document.fonts?.ready.then(sincronizarBarraPl);

  /* ==========================================================================
     Mapa dos planos: cada tela e estado novo, com o caminho até ele
     ========================================================================== */
  const abrirFolhaDepois = (f, ms = 1500) => setTimeout(f, ms * K());
  const irPara = (nome, o = {}) => mostrarSemAds(nome, { origem: 'clique', ...o });
  const irPlanosAba = (i) => ((planosAba = i), irPara('planos'));
  const rolarAte = (sel) => setTimeout(() => $(sel, tela)?.scrollIntoView({ block: 'start', behavior: 'auto' }), 1300 * K());
  const E = (plano, disp, extra = {}) => ({ plano, disp, nuvem: 'sobra', offline: false, dificil: false, nuvemMin: 0, ...extra });
  const TELAS_NOVAS = [
    { g: 'Tela Planos', id: 'planos-pc', nome: 'Quatro cartões no computador com placa de vídeo', est: E('gratis', 'pc'), onde: 'Mais › Planos; chip do Início; Ajustes › Conta; busca.', mostra: 'Recomendado: Essencial, com a frase "para estudar inglês, o Grátis já resolve".', vai: () => irPlanosAba(0), alvo: '.pl-planos-grade' },
    { g: 'Tela Planos', id: 'planos-fraco', nome: 'Planos num computador fraco', est: E('gratis', 'fraco'), onde: 'A mesma tela, com o aparelho "PC fraco" na barra.', mostra: 'Recomendado: Premium. A frase diz que o modelo leve erra mais.', vai: () => irPlanosAba(0), alvo: '.pl-aparelho' },
    { g: 'Tela Planos', id: 'planos-celular', nome: 'Planos no celular', est: E('gratis', 'celular'), onde: 'A mesma tela, com o aparelho "Celular". No tamanho de celular os cartões viram carrossel.', mostra: 'Recomendado: Premium. A frase avisa do limite que nenhum plano resolve (som de outro aplicativo).', vai: () => irPlanosAba(0), alvo: '.pl-aparelho' },
    { g: 'Tela Planos', id: 'planos-quest', nome: 'Planos no Quest', est: E('gratis', 'quest'), onde: 'A mesma tela, com o aparelho "Quest".', mostra: 'Recomendado: Premium, com a frase honesta: sem nuvem não há legenda nem intérprete ali.', vai: () => irPlanosAba(0), alvo: '.pl-aparelho' },
    { g: 'Tela Planos', id: 'planos-anual', nome: 'Preços no ciclo anual', est: E('gratis', 'pc'), onde: 'Planos › seletor Mensal / Anual, acima dos cartões.', mostra: 'Essencial R$ 79,90 e Premium R$ 149,90 por ano; Ao Vivo só mensal.', vai: () => ((PL.ciclo = 'anual'), irPlanosAba(0)), alvo: '.pl-ciclo' },
    { g: 'Tela Planos', id: 'planos-comparar', nome: 'Comparação linha a linha', est: E('essencial', 'pc'), onde: 'Planos › "Comparar em detalhe", abaixo dos cartões.', mostra: 'Anúncios, horas de nuvem, texto durante a fala, Nuance, intérprete, voz, sincronização e preços. No celular compara o seu plano com um de cada vez.', vai: () => (irPlanosAba(0), rolarAte('.pl-comparar')), alvo: '.pl-comparar' },
    { g: 'Tela Planos', id: 'planos-faq', nome: 'Perguntas frequentes', est: E('gratis', 'pc'), onde: 'Planos › fim da tela.', mostra: 'O que é "no aparelho", o que acontece quando as horas acabam, cancelar, por que o Grátis tem anúncio.', vai: () => (irPlanosAba(0), rolarAte('.pl-faq'), setTimeout(() => $$('.pl-faq details', tela).slice(0, 2).forEach((x) => (x.open = true)), 1400 * K())), alvo: '.pl-faq' },
    { g: 'Tela Planos', id: 'assinatura', nome: 'Sua assinatura, num plano pago', est: E('premium', 'celular'), onde: 'Planos › aba "Sua assinatura".', mostra: 'Mudar de plano, passar para o anual, cancelar.', vai: () => irPlanosAba(1), alvo: '.px-assinatura' },
    { g: 'Tela Planos', id: 'consumo', nome: 'Consumo do mês, com os dois medidores', est: E('aovivo', 'celular', { nuvem: 'pouco' }), onde: 'Planos › aba "Consumo do mês".', mostra: 'Precisão (20 h) e Ao vivo (10 h), cada um com a sua barra.', vai: () => irPlanosAba(2), alvo: '.pl-consumo' },

    { g: 'Capturar', id: 'capturar-gratis', nome: 'Seletor de nível e marca, no Grátis', est: E('gratis', 'pc'), onde: 'Capturar › fileira logo abaixo dos idiomas.', mostra: 'No aparelho em uso; Precisão e Ao vivo com cadeado; a marca "No aparelho · grátis · seu áudio não sai daqui"; o chip da amostra por anúncio.', vai: () => irPara('capturar'), alvo: '.pl-linha' },
    { g: 'Capturar', id: 'capturar-tranca', nome: 'Folha do nível com cadeado (Precisão no Grátis)', est: E('gratis', 'fraco'), onde: 'Capturar › toque em "Precisão" no seletor.', mostra: 'O que é, quando vale a pena neste aparelho, quem tem, a amostra por anúncio e a porta para o Essencial.', vai: () => (irPara('capturar'), abrirFolhaDepois(() => abrirTranca('precisao'))) },
    { g: 'Capturar', id: 'capturar-tranca-aovivo', nome: 'Folha do nível com cadeado (Ao vivo no Premium)', est: E('premium', 'celular'), onde: 'Capturar › toque em "Ao vivo" no seletor.', mostra: 'A porta leva ao cartão do plano Ao Vivo.', vai: () => (irPara('capturar'), abrirFolhaDepois(() => abrirTranca('aovivo'))) },
    { g: 'Capturar', id: 'capturar-amostra', nome: 'Grátis com a amostra de nuvem do dia', est: E('gratis', 'fraco', { nuvemMin: 30 }), onde: 'Capturar › depois do anúncio premiado da Precisão.', mostra: 'Precisão liberada com a etiqueta "amostra"; a marca diz "amostra de hoje: 30 min".', vai: () => ((PL.escolha = 'precisao'), irPara('capturar')), alvo: '.pl-linha' },
    { g: 'Capturar', id: 'capturar-essencial', nome: 'Essencial no computador: nuvem guardada', est: E('essencial', 'pc'), onde: 'Capturar, no plano Essencial.', mostra: 'O app fica no aparelho (grátis) e mostra as 5 h de nuvem disponíveis. Sem anúncio.', vai: () => irPara('capturar'), alvo: '.pl-linha' },
    { g: 'Capturar', id: 'capturar-premium', nome: 'Premium no celular: Precisão automática', est: E('premium', 'celular'), onde: 'Capturar, no plano Premium.', mostra: 'A marca "Nuvem · Precisão" e o medidor de 20 h.', vai: () => irPara('capturar'), alvo: '.pl-linha' },
    { g: 'Capturar', id: 'capturar-aovivo', nome: 'Ao Vivo: os três níveis abertos', est: E('aovivo', 'celular'), onde: 'Capturar, no plano Ao Vivo.', mostra: 'Nenhum cadeado; o medidor mostra as horas do nível em uso.', vai: () => ((PL.escolha = 'aovivo'), irPara('capturar')), alvo: '.pl-linha' },
    { g: 'Capturar', id: 'capturar-gravando', nome: 'Gravando: só a marca fica', est: E('premium', 'fraco'), onde: 'Capturar › Iniciar captura.', mostra: 'O seletor e o medidor somem; a marca continua dizendo onde a fala é processada.', vai: () => (irPara('capturar'), abrirFolhaDepois(() => $('[data-px="iniciar"]', tela)?.click(), 1400)), alvo: '.pl-onde' },
    { g: 'Capturar', id: 'capturar-acabou', nome: 'As horas acabaram: voltou para o aparelho', est: E('essencial', 'fraco', { nuvem: 'acabou' }), onde: 'Capturar, com "Nuvem do mês: Acabou" na barra.', mostra: 'Nada trava: a legenda segue no aparelho. Aviso com a data em que as horas voltam e a porta para o Premium.', vai: () => irPara('capturar'), alvo: '.pl-nota' },
    { g: 'Capturar', id: 'capturar-acabou-premium', nome: 'As horas acabaram no Premium', est: E('premium', 'celular', { nuvem: 'acabou' }), onde: 'Capturar, Premium, "Acabou".', mostra: 'Só a informação e a data: não há oferta, porque não existe plano com mais horas de Precisão.', vai: () => irPara('capturar'), alvo: '.pl-nota' },
    { g: 'Capturar', id: 'capturar-offline', nome: 'Sem internet', est: E('premium', 'celular', { offline: true }), onde: 'Capturar, com "Sem internet" na barra.', mostra: 'A marca "Sem internet · no aparelho" e a nota de que a nuvem volta sozinha.', vai: () => irPara('capturar'), alvo: '.pl-onde' },
    { g: 'Capturar', id: 'capturar-celular', nome: 'Celular sem tradutor embutido', est: E('gratis', 'celular'), onde: 'Capturar, Grátis, aparelho "Celular".', mostra: 'A nota oferece primeiro o caminho grátis (baixar o tradutor) e só depois a nuvem do Premium.', vai: () => irPara('capturar'), alvo: '.pl-nota' },
    { g: 'Capturar', id: 'capturar-quest', nome: 'Quest no Grátis: sem legenda', est: E('gratis', 'quest'), onde: 'Capturar, Grátis, aparelho "Quest".', mostra: 'A tela diz a verdade: aqui a legenda precisa da nuvem. Teste de 14 dias e planos; nenhum anúncio.', vai: () => irPara('capturar'), alvo: '.px-pronto-miolo' },
    { g: 'Capturar', id: 'capturar-quest-premium', nome: 'Quest no Premium', est: E('premium', 'quest'), onde: 'Capturar, Premium, aparelho "Quest".', mostra: 'Precisão em uso; o nível "No aparelho" aparece como inexistente.', vai: () => irPara('capturar'), alvo: '.pl-linha' },

    { g: 'Transparência', id: 'como', nome: 'Folha "Como isto funciona"', est: E('premium', 'fraco'), onde: 'Toque na marca (Capturar ou Intérprete), no medidor, ou em Ajustes › Processamento.', mostra: 'O nível de agora e o porquê, os três níveis, a nuvem do mês, como o app escolhe sozinho e o que é enviado.', vai: () => (irPara('capturar'), abrirFolhaDepois(abrirComo)) },
    { g: 'Transparência', id: 'como-gratis', nome: '"Como isto funciona" no Grátis', est: E('gratis', 'pc'), onde: 'O mesmo, no plano Grátis.', mostra: 'Dois níveis com cadeado e o nome do plano que abre cada um.', vai: () => (irPara('capturar'), abrirFolhaDepois(abrirComo)) },
    { g: 'Transparência', id: 'ajustes', nome: 'Ajustes › Processamento: níveis e medidor do mês', est: E('aovivo', 'pc', { nuvem: 'pouco' }), onde: 'Mais › Ajustes › Processamento.', mostra: 'Os três níveis como opções, o medidor de cada um e onde a fala está sendo processada agora.', vai: () => irPara('ajustes', { aba: 3 }), alvo: '.pl-nuvem-do-mes' },
    { g: 'Transparência', id: 'ajustes-gratis', nome: 'Ajustes › Processamento no Grátis', est: E('gratis', 'celular'), onde: 'O mesmo, no Grátis.', mostra: 'Precisão e Ao vivo com cadeado e o plano de cada um; sem medidor.', vai: () => irPara('ajustes', { aba: 3 }), alvo: '.pl-proc' },
    { g: 'Transparência', id: 'ajustes-acabou', nome: 'Ajustes com as horas no fim', est: E('essencial', 'fraco', { nuvem: 'acabou' }), onde: 'Ajustes › Processamento, com "Acabou".', mostra: 'O medidor cheio e a frase "voltou para o aparelho".', vai: () => irPara('ajustes', { aba: 3 }), alvo: '.pl-nuvem-do-mes' },

    { g: 'Intérprete', id: 'interprete-gratis', nome: 'Marca na faixa do meio, no Grátis', est: E('gratis', 'pc'), onde: 'Intérprete › faixa entre as duas metades.', mostra: '"No aparelho" ao lado de "Voz do aparelho"; Automático com cadeado.', vai: () => irPara('interprete'), alvo: '.pl-int-onde' },
    { g: 'Intérprete', id: 'interprete-nivel', nome: 'Seletor de nível no Intérprete', est: E('premium', 'celular'), onde: 'Intérprete › toque na marca.', mostra: 'A mesma folha, com os três níveis: Ao vivo com cadeado e a porta para o plano Ao Vivo.', vai: () => (irPara('interprete'), abrirFolhaDepois(abrirComo)) },
    { g: 'Intérprete', id: 'interprete-aovivo', nome: 'Ao Vivo: a tradução aparece durante a fala', est: E('aovivo', 'celular'), onde: 'Intérprete, plano Ao Vivo › Falar.', mostra: 'O outro lado vai recebendo a tradução enquanto a pessoa ainda fala; "Voz neural boa".', vai: () => (irPara('interprete'), abrirFolhaDepois(() => falar('meu'), 1600)), alvo: '.pl-int-onde' },
    { g: 'Intérprete', id: 'interprete-essencial', nome: 'Essencial: automático ainda com cadeado', est: E('essencial', 'pc'), onde: 'Intérprete, Essencial › toque em Automático.', mostra: 'O aviso diz que o automático é do Premium e abre a porta.', vai: () => (irPara('interprete'), abrirFolhaDepois(() => $('[data-px="automatico"]', tela)?.click(), 1600)) },
    { g: 'Intérprete', id: 'interprete-quest', nome: 'Quest no Grátis: intérprete precisa da nuvem', est: E('gratis', 'quest'), onde: 'Intérprete, Grátis, aparelho "Quest".', mostra: 'A faixa explica por que não fala e leva ao Premium.', vai: () => irPara('interprete'), alvo: '.int-faixa' },

    { g: 'Momentos de oferta', id: 'oferta-dificil', nome: 'Áudio difícil no Grátis', est: E('gratis', 'fraco', { dificil: true }), onde: 'Biblioteca, logo depois de encerrar uma captura com "Áudio difícil" ligado.', mostra: '"A nuvem erraria menos aqui", com a prova por anúncio. Nunca aparece no meio da fala.', vai: () => (irPara('biblioteca'), abrirFolhaDepois(() => ofertaDePlano('audio_dificil'), 1500)), alvo: '.pl-oferta' },
    { g: 'Momentos de oferta', id: 'oferta-fim-horas', nome: 'Fim das horas, no Essencial', est: E('essencial', 'fraco', { nuvem: 'acabou' }), onde: 'Biblioteca, depois de encerrar uma captura com as horas esgotadas.', mostra: '"A legenda seguiu no aparelho", com a porta para o Premium.', vai: () => (irPara('biblioteca'), abrirFolhaDepois(() => ofertaDePlano('fim_horas'), 1500)), alvo: '.pl-oferta' },

    { g: 'Anúncios nos quatro planos', id: 'inicio-gratis', nome: 'Início no Grátis: com anúncios', est: E('gratis', 'pc'), onde: 'Início.', mostra: 'O cartão nativo em "Para continuar".', vai: () => irPara('inicio'), alvo: '[data-ad]' },
    { g: 'Anúncios nos quatro planos', id: 'inicio-essencial', nome: 'Início no Essencial: sem anúncios', est: E('essencial', 'pc'), onde: 'Início, com o plano Essencial (ou Premium, ou Ao Vivo).', mostra: 'Nenhum espaço; o chip do alto diz o plano.', vai: () => irPara('inicio'), alvo: '.px-plano-chip' },
    { g: 'Anúncios nos quatro planos', id: 'inicio-quest', nome: 'Início no Quest, Grátis: sem anúncios', est: E('gratis', 'quest'), onde: 'Início, Grátis, aparelho "Quest".', mostra: 'Nenhum anúncio no Quest, por causa das regras para realidade virtual e menores.', vai: () => irPara('inicio') },
  ];
  const TELA_NOVA = Object.fromEntries(TELAS_NOVAS.map((t) => [t.id, t]));
  function verNoMapa(id) {
    const t = TELA_NOVA[id];
    if (!t) return;
    abrirMapaPl(false);
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    $('.qc-oferta')?.remove();
    if (folha) fecharFolha({ seco: true, semFoco: true });
    Object.assign(conta, { plano: t.est.plano, teste: false });
    ADS.disp = t.est.disp;
    ADS.nuvemMin = t.est.nuvemMin;
    if (t.g === 'Anúncios nos quatro planos' || /amostra|anúncio/.test(t.mostra)) {
      /* estes só fazem sentido com os anúncios ligados */
      if (ADS.nivel === 'off') ADS.nivel = 'medios';
      ADS.infantil = false;
    }
    Object.assign(PL, { nuvem: t.est.nuvem, offline: t.est.offline, dificil: t.est.dificil, escolha: 'auto', ciclo: 'mensal', comparar: null, tradutorBaixado: false });
    aplicarPlano({ semRedesenho: true });
    t.vai();
    if (!t.alvo) return;
    const procurar = (vez) => {
      const el = $(t.alvo);
      if (!el) return vez < 12 && setTimeout(() => procurar(vez + 1), 400);
      if (!el.closest('.pl-planos-tela') || t.alvo === '.pl-comparar' || t.alvo === '.pl-faq') el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      if (QS.has('quieto')) return; /* para captura de tela: sem o pulso que aponta o lugar */
      el.classList.add('ad-aqui');
      setTimeout(() => el.classList.remove('ad-aqui'), 2600);
    };
    setTimeout(() => procurar(0), 1700 * K());
  }
  const NUMEROS_DO_ESTUDO = [
    ['', 'Grátis', 'Essencial', 'Premium', 'Ao Vivo'],
    ['Mensal', 'R$ 0', 'R$ 9,90', 'R$ 19,90', 'R$ 39,90'],
    ['Anual', '—', 'R$ 79,90', 'R$ 149,90', 'só mensal'],
    ['Nuvem por mês', 'amostra por anúncio', '5 h', '20 h', '20 h + 10 h ao vivo'],
    ['Custo no uso típico', 'R$ 0,03 a 0,25', 'R$ 0,75', 'R$ 3,50', 'R$ 7,00'],
    ['Custo no teto', 'R$ 0,37', 'R$ 2,90', 'R$ 7 a 10,50', 'R$ 19 a 27,50'],
    ['Margem típica', '—', '~78%', '~71%', '~72%'],
  ];
  function htmlDoMapaPl() {
    const a = nivelAgora(atual === 'interpretando' ? 'interprete' : 'capturar');
    const grupos = [...new Set(TELAS_NOVAS.map((t) => t.g))];
    const chips = (e) => `<span>${NOME_DO_PLANO[e.plano]}</span><span>${DISPS[e.disp].curto}</span>${e.nuvem !== 'sobra' ? `<span>Nuvem: ${e.nuvem === 'pouco' ? 'no fim' : 'acabou'}</span>` : ''}${e.offline ? '<span>Sem internet</span>' : ''}${e.dificil ? '<span>Áudio difícil</span>' : ''}${e.nuvemMin ? '<span>Amostra de 30 min</span>' : ''}`;
    return `<button type="button" class="px-fechar ad-mapa-fechar" aria-label="Fechar o mapa">Fechar</button>
      <p class="ad-mapa-sobre">Protótipo conceitual · horas, preços e medidores de exemplo</p>
      <h2>Mapa dos planos</h2>
      <p>Cada tela ou estado novo dos quatro planos. "Ver na tela" acerta o plano, o aparelho e as horas na barra e leva até lá. Cada item também tem um endereço próprio: <code>?ver=</code> seguido do nome entre parênteses.</p>
      <div class="ad-mapa-estado">
        <div><span>Plano</span><b>${textoDoMeuPlano()}</b></div>
        <div><span>Aparelho</span><b>${DISPS[ADS.disp].nome}</b></div>
        <div><span>Recomendado aqui</span><b>${NOME_DO_PLANO[recomendadoAqui()]}</b></div>
        <div><span>Nuvem do mês</span><b>${medidores().map((m) => `${NIVEIS[m.nivel].nome}: ${horas(m.usado)} de ${horas(m.total)}`).join(' · ') || (ADS.nuvemMin ? `amostra de ${ADS.nuvemMin} min` : 'não faz parte do Grátis')}</b></div>
        <div><span>Nível em uso</span><b>${a.nivel ? NIVEIS[a.nivel].nome : 'nenhum (sem legenda)'}</b></div>
        <div><span>Anúncios</span><b>${anunciando() ? NOME_NIVEL_ADS[ADS.nivel] : 'nenhum'}</b></div>
        <div class="largo"><span>Por quê</span><b>${a.razao}</b></div>
      </div>
      <h3>Os quatro planos em números (seção 4 do estudo)</h3>
      <div class="pl-mapa-tabela"><table>${NUMEROS_DO_ESTUDO.map((l, i) => `<tr>${l.map((c, j) => (i === 0 || j === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</table></div>
      <p class="ad-mapa-nota">Custos e margens são estimativas do estudo de 09/10/2026, antes de custos fixos. Só o dono vê esta tabela: ela não aparece no app.</p>
      <h3>Os três níveis de serviço que a pessoa enxerga</h3>
      <ul class="ad-mapa-lista">
        <li><b>No aparelho:</b> grátis, sem limite, roda no dispositivo. Não existe no Quest.</li>
        <li><b>Precisão:</b> nuvem por trechos, menos erro. Essencial (5 h), Premium e Ao Vivo (20 h). No Grátis, amostra de 30 min por anúncio premiado.</li>
        <li><b>Ao vivo:</b> nuvem com texto durante a fala. Só no plano Ao Vivo (10 h).</li>
      </ul>
      ${grupos
        .map(
          (g) => `<h3>${g}</h3><div class="ad-mapa-espacos">${TELAS_NOVAS.filter((t) => t.g === g)
            .map(
              (t) => `<section class="ad-mapa-item ativo"><header><h4>${t.nome}</h4><button type="button" data-pl-ver="${t.id}">Ver na tela</button></header>
              <p class="ad-mapa-chips">${chips(t.est)}</p>
              <dl><div><dt>Onde</dt><dd>${t.onde}</dd></div><div><dt>Mostra</dt><dd>${t.mostra}</dd></div><div><dt>Endereço</dt><dd><code>?ver=${t.id}</code></dd></div></dl></section>`,
            )
            .join('')}</div>`,
        )
        .join('')}
      <h3>Regras dos momentos de oferta</h3>
      <ol class="ad-mapa-lista">
        <li><b>Nunca no meio de uma fala:</b> nem gravando, nem com o intérprete ouvindo, nem numa rodada.</li>
        <li><b>Um por vez</b>, sempre com "Agora não" e "Não mostrar novamente".</li>
        <li><b>O caminho grátis aparece primeiro</b> quando existe (baixar o tradutor, provar por anúncio, seguir no aparelho).</li>
        <li><b>Quem já paga não recebe convite genérico:</b> só o do fim das horas, e só se existe um plano com mais horas.</li>
      </ol>
      <h3>A decidir antes de implementar</h3>
      <ul class="ad-mapa-lista">
        <li>O Quest no Grátis fica sem legenda nenhuma, ou ganha alguns minutos de nuvem por dia sem anúncio? Aqui ficou sem. <i>A decidir.</i></li>
        <li>No Quest, quando as horas acabam, a legenda para até o dia 1º. Vender horas avulsas? <i>A decidir.</i></li>
        <li>No Premium, quando as 20 h acabam, não há plano com mais horas de Precisão. <i>A decidir.</i></li>
        <li>Onde entram o Tutor de IA e o armazenamento, que estavam na tabela antiga e não estão no estudo. <i>A decidir.</i></li>
        <li>A Nuance é "rápida" nos três planos pagos, ou o Premium tem uma versão mais completa? <i>A decidir.</i></li>
        <li>O teste de 14 dias continua sendo só do Premium? <i>A decidir.</i></li>
        <li>"O pedido vai com a ordem de não guardar" depende de exigir retenção zero em todo pedido ao provedor. <i>A confirmar.</i></li>
        <li>O que cada aparelho consegue de graça precisa de medição própria (seção 6 do estudo), sobretudo Quest e celular. <i>A medir.</i></li>
        <li>A amostra de nuvem por anúncio come a margem no cenário conservador (seção 4). <i>A decidir.</i></li>
      </ul>`;
  }
  function atualizarMapaPl() {
    if (!document.body.classList.contains('pl-mapa-aberto')) return;
    const rol = mapaPl.scrollTop;
    mapaPl.innerHTML = htmlDoMapaPl();
    mapaPl.scrollTop = rol;
  }
  function abrirMapaPl(abre) {
    if (abre) abrirMapa(false);
    document.body.classList.toggle('pl-mapa-aberto', abre);
    $('[data-pl-b="mapa"]', barraPl).setAttribute('aria-pressed', abre);
    if (!abre) return;
    mapaPl.innerHTML = htmlDoMapaPl();
    mapaPl.scrollTop = 0;
    mapaPl.focus({ preventScroll: true });
  }
  $('.pl-mapa-fundo').addEventListener('click', () => abrirMapaPl(false));
  mapaPl.addEventListener('click', (e) => {
    if (e.target.closest('.ad-mapa-fechar')) return abrirMapaPl(false);
    const v = e.target.closest('[data-pl-ver]');
    if (v) verNoMapa(v.dataset.plVer);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.contains('pl-mapa-aberto') && abrirMapaPl(false));
  $('[data-ad-b="mapa"]', barraAds).addEventListener('click', () => abrirMapaPl(false));

  /* ---- Partida --------------------------------------------------------------------- */
  sincronizarBarraPl();
  sincronizarBarra();
  if (QS.get('mapa') === 'planos') setTimeout(() => abrirMapaPl(true), 900);
  if (TELA_NOVA[QS.get('ver')]) {
    /* ?ver=<nome> abre direto numa tela do mapa; plano, aparelho e nuvem da URL ganham do padrão do item */
    const t = TELA_NOVA[QS.get('ver')];
    const daUrl = { plano: QS.get('plano'), disp: QS.get('aparelho'), nuvem: QS.get('nuvem') };
    const est = { ...t.est };
    if (PLANO_IDS.includes(daUrl.plano)) est.plano = daUrl.plano;
    if (DISP_IDS.includes(daUrl.disp)) est.disp = daUrl.disp;
    if (['sobra', 'pouco', 'acabou'].includes(daUrl.nuvem)) est.nuvem = daUrl.nuvem;
    if (QS.has('offline')) est.offline = true;
    TELA_NOVA[t.id] = { ...t, est };
    setTimeout(() => verNoMapa(t.id), 700);
  }
