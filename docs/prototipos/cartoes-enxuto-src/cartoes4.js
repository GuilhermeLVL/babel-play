  /* ==========================================================================
     CARTÕES 4 — o que é novo na versão enxuta, fora da rodada em si:
       MINHA VOZ      gravar a própria fala, ver a onda, ouvir a original e a sua, comparar no olho.
                      Sem nota e sem reprovar; "entendi: …" é palpite do aparelho, opcional.
                      Microfone de verdade (getUserMedia + MediaRecorder + AnalyserNode);
                      sem permissão ou sem suporte, cai numa simulação do mesmo fluxo.
       PRATICAR DE OUTRO JEITO   uma folha só, aberta por window.ctPraticar({ origem, rotulo, n }):
                      Falar, Ouvir e escrever, Completar, Jogo rápido, Treinar o ouvido.
                      Recordar conta como revisão; reconhecer não mexe na agenda (regra, com selo).
       A BARRA        "Revisão e práticas": pula direto para cada estado (ou ?cx=<estado> na URL).
     Mesmo escopo dos outros módulos; usa CX, cxCena, cxInterruptor e os ct* de cartoes2.js.
     Baseado em docs/auditoria/2026-10-10-cartoes-diversao-e-atracao.md (ei-polimento).
     ========================================================================== */

  /* ---- Ondas: barras em HTML; a camada colorida varre por cima enquanto toca ----------- */
  const CX_N = 44;
  function cxPicos(texto, n = CX_N) {
    let s = cxHash(texto) + 11;
    const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const sil = Math.max(3, Math.round(texto.split(/\s+/).length * 1.5));
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const env = Math.sin(Math.PI * Math.min(1, t * 1.06)) ** 0.6;
      const syl = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * sil));
      return Math.max(0.08, Math.min(1, env * syl * (0.5 + r() * 0.65)));
    });
  }
  const cxBarras = (picos) => picos.map((p) => `<i style="height:${Math.round(p * 100)}%"></i>`).join('');
  const cxOnda = (picos, classe = '') => `<span class="cx-onda ${classe}"><span class="cx-onda-base">${cxBarras(picos)}</span><span class="cx-onda-cor" aria-hidden="true">${cxBarras(picos)}</span></span>`;
  function cxReamostrar(picos, n = CX_N) {
    if (!picos.length) return Array(n).fill(0.08);
    const max = Math.max(0.25, ...picos);
    return Array.from({ length: n }, (_, i) => {
      const a = Math.floor((i / n) * picos.length);
      const b = Math.max(a + 1, Math.floor(((i + 1) / n) * picos.length));
      return Math.max(0.08, Math.min(1, Math.max(...picos.slice(a, b)) / max));
    });
  }
  const cxPausa = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Embaralha com semente: o desenho é o mesmo entre uma visita e outra (bom para captura de tela). */
  function cxEmbaralhar(lista, semente) {
    const l = lista.slice();
    let s = cxHash(String(semente)) * 2654435761 + 97;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }
  /* Exemplos de gravações guardadas, para a linha do tempo ter o que mostrar no protótipo. */
  CX.voz.complain = [
    { r: 'você em março', picos: cxPicos('complain em marco').map((p) => p * 0.72), url: null, dur: 3100 },
    { r: 'você em agosto', picos: cxPicos('complain em agosto').map((p) => p * 0.9), url: null, dur: 2700 },
  ];
  /* O que o reconhecimento "ouviu": no protótipo é texto de exemplo (às vezes com um tropeço). */
  const CX_PARECE = { thorough: 'through', though: 'dough', ship: 'sheep', deprive: 'the prive', madrugado: 'madrugada', drowsy: 'dry sea' };
  function cxPalpite(c, k) {
    const alvo = ctAlvoNaFrase(c, k);
    const troca = CX_PARECE[alvo.toLowerCase()];
    return c.frases[k][0].replace(alvo, troca || alvo).replace(/[.?!]$/, '').toLowerCase();
  }

  /* ---- O gravador: um componente só, usado na folha "Minha voz" e na prática "Falar" ---- */
  function cxGravador(caixa, o) {
    const { c, k } = o;
    const frase = c.frases[k][0];
    const quem = c.frases[k][3];
    const durO = Math.min(3600, Math.max(1300, frase.length * 62));
    const g = { fase: 'pronto', picos: [], picosN: null, url: null, dur: 0, simulado: false, vivo: true, vez: 0, guardada: false, apertou: 0 };
    caixa.innerHTML = `<div class="cx-voz" data-fase="pronto">
        <div class="cx-trilha orig"><span class="cx-quem">${ica(quem ? 'audio-lines' : 'volume-2')}<span>${quem ? `Fala original · ${esc(quem)}` : 'Voz do aparelho'}</span></span>${cxOnda(cxPicos(frase))}</div>
        <div class="cx-trilha eu"><span class="cx-quem">${ica('mic')}<span class="cx-quem-eu">Você</span><em class="cx-tempo"></em></span>${cxOnda([], 'vazia')}</div>
        <p class="cx-voz-status" role="status"></p>
        <div class="cx-voz-acoes"><button type="button" class="cx-mic" data-g="gravar" aria-label="Gravar a minha voz">${ica('mic')}</button><div class="cx-voz-mais"></div></div>
        <div class="cx-palpite" hidden></div>
      </div>`;
    const raiz = $('.cx-voz', caixa);
    const trilhaO = $('.cx-trilha.orig', raiz);
    const trilhaE = $('.cx-trilha.eu', raiz);
    const mic = $('.cx-mic', raiz);
    const mais = $('.cx-voz-mais', raiz);
    const status = $('.cx-voz-status', raiz);
    const tempoEl = $('.cx-tempo', raiz);
    const palpite = $('.cx-palpite', raiz);
    const porOnda = (picos, vivo) => {
      const onda = $('.cx-onda', trilhaE);
      onda.classList.toggle('vazia', !picos.length);
      onda.classList.toggle('ao-vivo', !!vivo);
      $('.cx-onda-base', onda).innerHTML = cxBarras(picos);
      $('.cx-onda-cor', onda).innerHTML = vivo ? '' : cxBarras(picos);
    };
    const TEXTO = {
      pronto: () => o.convite || 'Toque no microfone e diga a frase. Ninguém dá nota: você ouve e compara.',
      pedindo: () => 'Pedindo o microfone ao navegador…',
      gravando: () => 'Gravando. Toque de novo (ou solte) quando terminar.',
      ouvindo: () => 'Primeiro a fala original, depois a sua.',
      feito: () => (g.simulado ? `Simulação${g.semMic ? ': este aparelho não tem microfone disponível' : ''}. A onda de baixo é de exemplo; no app é a sua voz.` : 'Compare no olho e no ouvido. Sem nota: quem julga é você.'),
      negado: () => 'O navegador não deixou usar o microfone. Toque no cadeado ao lado do endereço, permita o microfone e tente de novo. O que você grava não sai deste aparelho.',
    };
    function fase(f) {
      g.fase = f;
      if (!g.vivo) return;
      raiz.dataset.fase = f;
      status.textContent = TEXTO[f]();
      const gravando = f === 'gravando';
      mic.dataset.g = gravando ? 'parar' : 'gravar';
      mic.innerHTML = ica(gravando ? 'square' : 'mic');
      mic.setAttribute('aria-label', gravando ? 'Parar de gravar' : g.picosN ? 'Gravar de novo' : 'Gravar a minha voz');
      mic.disabled = f === 'pedindo' || f === 'ouvindo';
      mic.hidden = f === 'feito' || f === 'negado';
      mais.innerHTML =
        f === 'feito'
          ? `<button type="button" class="q-ctl pri" data-g="ouvir">${ica('play')} Ouvir de novo</button><button type="button" class="q-ctl" data-g="gravar">${ica('rotate-ccw')} Gravar de novo</button><button type="button" class="cx-link" data-g="palpite">${ica('ear')} O que o aparelho entendeu?</button>`
          : f === 'negado'
            ? `<button type="button" class="q-ctl pri" data-g="gravar">${ica('rotate-ccw')} Tentar de novo</button><button type="button" class="q-ctl" data-g="simular">${ica('play')} Ver com uma simulação</button>`
            : '';
      if (f !== 'feito') palpite.hidden = true;
      o.aoMudar?.(g);
    }
    function amostra(v) {
      g.picos.push(Math.max(0.06, v));
      porOnda(g.picos.slice(-CX_N), true);
    }
    function terminar() {
      if (!g.vivo) return;
      g.picosN = cxReamostrar(g.picos);
      porOnda(g.picosN);
      tempoEl.textContent = (g.dur / 1000).toFixed(1).replace('.', ',') + ' s';
      sentir('liga');
      o.aoGravar?.(g);
      tocar();
    }
    function parar() {
      if (g.fase !== 'gravando') return;
      clearTimeout(g.laco);
      g.dur = performance.now() - g.t0;
      if (g.rec && g.rec.state !== 'inactive') g.rec.stop();
      else terminar();
    }
    function simular() {
      g.simulado = true;
      g.url = null;
      g.rec = null;
      g.t0 = performance.now();
      fase('gravando');
      sentir('grava');
      const alvo = cxPicos(frase + c.id + ' eu');
      let i = 0;
      const passo = () => {
        if (g.fase !== 'gravando' || !g.vivo) return;
        amostra(alvo[i++ % alvo.length] * (0.7 + Math.random() * 0.3));
        tempoEl.textContent = ((performance.now() - g.t0) / 1000).toFixed(1).replace('.', ',') + ' s';
        if (i >= alvo.length && !o.semParar) return parar();
        g.laco = setTimeout(passo, 60);
      };
      passo();
    }
    async function gravar(forcarSimulacao) {
      if (g.fase === 'gravando' || g.fase === 'pedindo') return;
      g.vez++;
      if (temVoz) speechSynthesis.cancel();
      g.audio?.pause();
      $$('.tocando', raiz).forEach((x) => x.classList.remove('tocando'));
      if (g.url && !g.guardada) URL.revokeObjectURL(g.url);
      Object.assign(g, { picos: [], picosN: null, url: null, guardada: false });
      porOnda([]);
      tempoEl.textContent = '';
      if (CX.mic === 'negado' && !forcarSimulacao) return fase('negado');
      const temMic = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder === 'function';
      if (forcarSimulacao || CX.mic === 'falso' || !temMic) return (g.semMic = !temMic), simular();
      fase('pedindo');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (erro) {
        if (!g.vivo) return;
        if (erro?.name === 'NotAllowedError' || erro?.name === 'SecurityError') return fase('negado');
        g.semMic = true;
        return simular();
      }
      if (!g.vivo) return stream.getTracks().forEach((t) => t.stop());
      g.simulado = false;
      g.stream = stream;
      const a = audio();
      let fonte = null;
      let an = null;
      if (a) {
        fonte = a.createMediaStreamSource(stream);
        an = a.createAnalyser();
        an.fftSize = 512;
        fonte.connect(an);
      }
      const partes = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        fonte?.disconnect();
        g.stream = null;
        if (!g.vivo) return;
        g.url = URL.createObjectURL(new Blob(partes, { type: rec.mimeType || 'audio/webm' }));
        terminar();
      };
      g.rec = rec;
      rec.start();
      g.t0 = performance.now();
      fase('gravando');
      sentir('grava');
      const buf = an && new Uint8Array(an.fftSize);
      const passo = () => {
        if (g.fase !== 'gravando' || !g.vivo) return;
        const dt = performance.now() - g.t0;
        if (an) {
          an.getByteTimeDomainData(buf);
          let m = 0;
          for (const v of buf) m = Math.max(m, Math.abs(v - 128));
          amostra(Math.min(1, m / 80));
        } else amostra(0.2 + Math.random() * 0.6);
        tempoEl.textContent = (dt / 1000).toFixed(1).replace('.', ',') + ' s';
        if (dt > 8000) return parar(); /* uma frase não passa de 8 s */
        g.laco = setTimeout(passo, 60);
      };
      passo();
      if (g.soltouCedo) (g.soltouCedo = false), parar();
    }
    /* A varredura: a camada colorida da onda aparece da esquerda para a direita no tempo do som. */
    function varrer(trilha, ms) {
      $$('.tocando', raiz).forEach((x) => x.classList.remove('tocando'));
      trilha.classList.add('tocando');
      const cor = $('.cx-onda-cor', trilha);
      if (polido() && !reduz()) cor.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: ms, easing: 'linear' });
    }
    async function tocar(so, gravacao) {
      if (!g.picosN && !gravacao) return;
      const vez = ++g.vez;
      g.audio?.pause();
      fase('ouvindo');
      if (so !== 'eu') {
        varrer(trilhaO, durO);
        await Promise.all([Promise.race([dizer(frase, { lang: ctVoz(c) }), cxPausa(durO + 2200)]), cxPausa(durO)]);
        if (vez !== g.vez || !g.vivo) return;
        await cxPausa(220);
      }
      const url = gravacao ? gravacao.url : g.url;
      const durE = Math.min(8000, Math.max(900, gravacao ? gravacao.dur : g.dur));
      varrer(trilhaE, durE);
      if (url) {
        g.audio = new Audio(url);
        const acabou = new Promise((r) => (g.audio.onended = g.audio.onerror = r));
        try {
          await g.audio.play();
        } catch {
          /* sem som neste navegador: a onda varre do mesmo jeito */
        }
        await Promise.race([acabou, cxPausa(durE + 900)]);
      } else await cxPausa(durE);
      if (vez !== g.vez || !g.vivo) return;
      $$('.tocando', raiz).forEach((x) => x.classList.remove('tocando'));
      fase('feito');
      o.aoComparar?.(g);
    }
    /* Ouvir uma gravação guardada ("você em março"): a onda dela entra na trilha de baixo. */
    function ouvirGuardada(v) {
      if (g.fase === 'gravando' || g.fase === 'pedindo') return;
      $('.cx-quem-eu', raiz).textContent = v.r[0].toUpperCase() + v.r.slice(1);
      g.picosN ??= v.picos;
      porOnda(v.picos);
      tempoEl.textContent = (v.dur / 1000).toFixed(1).replace('.', ',') + ' s';
      tocar('', v);
    }
    /* Estado pronto para captura de tela: já gravado, as duas ondas à vista, nada tocando. */
    function exemplo() {
      g.simulado = true;
      g.picos = cxPicos(frase + c.id + ' eu');
      g.picosN = g.picos;
      g.dur = 2640;
      porOnda(g.picosN);
      tempoEl.textContent = '2,6 s';
      fase('feito');
      o.aoGravar?.(g);
      o.aoComparar?.(g);
    }
    raiz.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.cx-mic');
      if (!b || b.disabled) return;
      if (b.dataset.g !== 'gravar') return void (g.apertou = 0);
      /* segurar e soltar também vale: começa ao apertar, para ao soltar */
      g.apertou = performance.now();
      g.soltouCedo = false;
      gravar();
      addEventListener(
        'pointerup',
        () => {
          const segurou = performance.now() - g.apertou > 450;
          if (!segurou) return;
          if (g.fase === 'gravando') parar();
          else if (g.fase === 'pedindo') g.soltouCedo = true;
        },
        { once: true },
      );
    });
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (!b || b.disabled) return;
      const a = b.dataset.g;
      if (b === mic) {
        if (performance.now() - g.apertou < 700) return; /* o pointerdown já tratou este toque */
        return a === 'parar' ? parar() : void gravar();
      }
      if (a === 'gravar') return void gravar();
      if (a === 'simular') return void gravar(true);
      if (a === 'ouvir') return void tocar();
      if (a === 'palpite') {
        palpite.hidden = false;
        palpite.innerHTML = `<p>${ica('ear')}<span>Entendi: <b lang="${c.lang}">“${esc(cxPalpite(c, k))}”</b></span></p><small>Palpite do aparelho${g.simulado ? ' (aqui, de exemplo)' : ''}. Ele erra bastante e às vezes é só o microfone. Não vale nota e não muda o cartão.</small>`;
        b.remove();
        if (polido() && !reduz()) anima(palpite, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 360 });
      }
    });
    function destruir() {
      g.vivo = false;
      g.vez++;
      clearTimeout(g.laco);
      if (g.rec && g.rec.state !== 'inactive') g.rec.stop();
      g.stream?.getTracks().forEach((t) => t.stop());
      g.audio?.pause();
      if (temVoz) speechSynthesis.cancel();
    }
    fase('pronto');
    return Object.assign(g, { gravar, parar, tocar, ouvirGuardada, exemplo, destruir });
  }

  /* ---- A folha "Minha voz" ---------------------------------------------------------------- */
  function cxAbrirVoz(c, k, o = {}) {
    const d = folhaDeBaixo(
      `<div class="cx-folha-cab"><div><p class="folha-rotulo">Minha voz</p><p class="folha-frase cx-frase-da-folha" lang="${c.lang}">“${ctFrase(c, k, 'marca')}”</p></div><button type="button" class="q-ctl cx-ic" data-a="fechar" aria-label="Fechar">${ica('x')}</button></div>
       <div class="cx-voz-caixa"></div>
       <div class="cx-tempos"></div>
       ${cxInterruptor('guardarVoz', 'Guardar minha voz neste cartão', 'Fica só neste aparelho; você apaga quando quiser.', CX.guardarVoz)}`,
      'cx-folha cx-folha-voz',
    );
    d.setAttribute('aria-label', 'Minha voz: gravar e comparar com a fala original');
    const tempos = $('.cx-tempos', d);
    const pintaTempos = () => {
      const l = CX.voz[c.id] || [];
      tempos.innerHTML = l.length
        ? `<p class="folha-rotulo">A sua evolução neste cartão</p><div class="cx-linha-do-tempo">${l.map((v, i) => `<button type="button" class="q-chip" data-a="tempo" data-i="${i}">${ica('play')}<span>${esc(v.r)}</span></button>`).join('<i aria-hidden="true"></i>')}<button type="button" class="cx-link cx-apagar" data-a="apagar">${ica('trash-2')}<span>Apagar</span></button></div>`
        : '';
    };
    const guarda = () => {
      if (!g.picosN) return;
      const l = (CX.voz[c.id] ??= []);
      const i = l.findIndex((v) => v.hoje);
      if (i >= 0) l.splice(i, 1);
      l.push({ r: 'você hoje', hoje: true, picos: g.picosN.slice(), url: g.url, dur: g.dur });
      g.guardada = true;
      pintaTempos();
      const novo = $('.cx-linha-do-tempo .q-chip:last-of-type', tempos);
      if (novo && polido() && !reduz()) anima(novo, [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { d: 480, e: MOLA });
    };
    const g = cxGravador($('.cx-voz-caixa', d), { c, k, semParar: o.semParar, aoGravar: () => CX.guardarVoz && guarda() });
    pintaTempos();
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'fechar') return fecharFolhaDeBaixo();
      if (a === 'liga') {
        CX.guardarVoz = !CX.guardarVoz;
        b.setAttribute('aria-checked', CX.guardarVoz);
        sentir(CX.guardarVoz ? 'liga' : 'desliga');
        if (CX.guardarVoz && g.picosN) guarda(), toast('Guardada neste aparelho. Ela aparece na sua evolução deste cartão.');
        return;
      }
      if (a === 'tempo') return sentir('toque'), g.ouvirGuardada(CX.voz[c.id][+b.dataset.i]);
      if (a === 'apagar') {
        (CX.voz[c.id] || []).forEach((v) => v.url && URL.revokeObjectURL(v.url));
        delete CX.voz[c.id];
        g.guardada = false;
        pintaTempos();
        sentir('fecha');
        return toast('Gravações deste cartão apagadas do aparelho.');
      }
    });
    d.addEventListener('close', () => {
      g.destruir();
      if (atual === 'estudo' && ctR && !ctR.pr && !ctR.fim) ctPintarRodada('seco');
    });
    if (o.exemplo) g.exemplo();
    else if (!o.parado) g.gravar(o.simular);
    return g;
  }

  /* ==========================================================================
     PRATICAR DE OUTRO JEITO
     ========================================================================== */
  const CX_PR = {
    falar: { nome: 'Falar', ic: 'mic', conta: true, n: 3, desc: 'Diga a frase e compare a sua voz com a fala original.', mini: () => `<span class="mm-som grande">${ic('mic')}</span><span class="cx-mini-ondas">${barras(7)}${barras(7)}</span>` },
    ditado: { nome: 'Ouvir e escrever', ic: 'headphones', conta: true, n: 3, desc: 'A fala original toca. Você escreve o que ouviu.', mini: () => MINIS.ditado },
    completar: { nome: 'Completar', ic: 'pen-line', conta: true, n: 4, desc: 'A fala toca até a lacuna. Você completa a frase.', mini: () => MINIS.vitendawili },
    jogo: { nome: 'Jogo rápido', ic: 'dices', conta: false, n: 4, desc: 'Sorteia um jogo de palavras com estes cartões.', mini: () => MINIS.memory },
    ouvido: { nome: 'Treinar o ouvido', ic: 'ear', conta: false, n: 5, desc: 'Pares parecidos: qual dos dois você ouviu?', mini: () => MINIS.escuta },
  };
  const CX_JOGOS = { pares: ['Casar pares', 'memory'], frase: ['Frase embaralhada', 'scramble'], escolha: ['Qual é a palavra', 'conectores'] };
  /* Pares de som parecido tirados do acervo de exemplo. No app, com vozes diferentes. */
  const CX_PARES = [
    ['ship', '/ʃɪp/', 'sheep', '/ʃiːp/'],
    ['though', '/ðoʊ/', 'thought', '/θɔːt/'],
    ['thorough', '/ˈθɝː.oʊ/', 'through', '/θruː/'],
    ['walk', '/wɔːk/', 'work', '/wɝːk/'],
    ['shelf', '/ʃelf/', 'self', '/self/'],
  ];
  const cxSelo = (conta) => `<span class="cx-selo ${conta ? 'conta' : 'leve'}">${ica(conta ? 'circle-check' : 'calendar-clock')}<span>${conta ? 'conta como revisão' : 'não mexe na sua agenda'}</span></span>`;
  const cxIdioma = (c) => (c.lang === 'es' ? 'espanhol' : 'inglês');

  function cxRecorte(o = {}) {
    let ids = o.ids;
    if (!ids && o.baralho) ids = CT_FILA.filter((id) => ctNoBaralho(ctCarta(id), o.baralho));
    if (!ids || !ids.length) ids = CT_FILA.slice();
    return { origem: o.origem || 'hoje', rotulo: o.rotulo || `As ${ids.length} de hoje`, n: o.n ?? ids.length, ids };
  }
  function cxAbrirPraticar(o = {}) {
    const rec = cxRecorte(o);
    const ladrilho = (t) => {
      const p = CX_PR[t];
      const bonus = CX.bonus === t;
      return `<button type="button" class="q-tile px-com-mini cx-ladrilho" data-a="${t}">
          <span class="px-mini" data-mini="${t}" aria-hidden="true">${p.mini()}</span>
          ${bonus ? `<span class="q-tag cx-bonus ${CX.bonusGanho ? 'ganho' : ''}">${ica(CX.bonusGanho ? 'check' : 'gift')} ${CX.bonusGanho ? 'Bônus ganho' : 'Bônus de hoje'}</span>` : ''}
          <b>${p.nome}</b><span class="q-d">${p.desc}</span>${cxSelo(p.conta)}</button>`;
    };
    const d = folhaDeBaixo(
      `<div class="cx-folha-cab"><div><p class="folha-pal">Praticar de outro jeito</p><p class="cx-recorte"><span class="q-tag">${ica('layers')} ${esc(rec.rotulo)}</span><span>${rec.n} ${rec.n === 1 ? 'cartão' : 'cartões'}</span></p></div><button type="button" class="q-ctl cx-ic" data-a="fechar" aria-label="Fechar">${ica('x')}</button></div>
       <div class="cx-ladrilhos">${['falar', 'ditado', 'completar', 'jogo'].map(ladrilho).join('')}</div>
       <button type="button" class="q-linha cx-linha-ouvido" data-a="ouvido"><span class="q-ic">${ica('ear')}</span><span><b>Treinar o ouvido</b><small>${CX_PR.ouvido.desc}</small>${cxSelo(false)}</span></button>
       <div class="cx-folha-pe cx-pe-praticar"><button type="button" class="cx-link" data-a="todos">${ica('gamepad-2')}<span>Ver todos os jogos</span></button><button type="button" class="cx-link" data-a="desafio">${ica('users')}<span>Desafiar um amigo com 10 cartas</span></button></div>`,
      'cx-folha cx-folha-praticar',
    );
    d.setAttribute('aria-label', `Praticar de outro jeito: ${rec.rotulo}`);
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      e.stopPropagation(); /* os ladrilhos usam q-tile: o clique não deve chegar aos ganchos das telas */
      const a = b.dataset.a;
      if (a === 'fechar') return fecharFolhaDeBaixo();
      if (a === 'desafio') return fecharFolhaDeBaixo(), void setTimeout(() => cxAbrirDesafio(rec), 300 * K());
      if (a === 'todos') {
        fecharFolhaDeBaixo();
        ctR = null;
        return fxJogarComRecorte(rec);
      }
      if (!CX_PR[a]) return;
      sentir('nav');
      fecharFolhaDeBaixo();
      setTimeout(() => cxComecar(a, rec), 260 * K());
    });
    return d;
  }
  /* O contrato com a tela de Cartões (cartoes.js chama): abre a folha já com o recorte recebido. */
  window.ctPraticar = function ({ origem, rotulo, n, ...resto } = {}) {
    return cxAbrirPraticar({ origem, rotulo, n, ...resto });
  };
  function cxAbrirDesafio(rec) {
    const d = folhaDeBaixo(
      `<div class="cx-folha-cab"><div><p class="folha-pal">Desafiar um amigo</p><p class="folha-glosa">É assim que o convite chega para a outra pessoa.</p></div><button type="button" class="q-ctl cx-ic" data-a="fechar" aria-label="Fechar">${ica('x')}</button></div>
       <div class="cx-convite"><span class="cx-convite-cartas" aria-hidden="true">${'<i></i>'.repeat(10)}</span>
         <p class="q-rotulo">Babel Play · desafio de dez</p><h3>Guilherme mandou 10 cartas para você</h3>
         <p>Tiradas de “${esc(rec.rotulo)}”. Responda quando quiser. No fim, vocês veem os acertos de cada um, lado a lado.</p>
         <span class="q-ctl pri cx-convite-botao">${ica('play')} Responder as 10</span></div>
       <label class="q-campo"><span>Link do convite</span><input type="text" readonly value="babel-play.pages.dev/d/7kq2-m4t9" aria-label="Link do convite"></label>
       <p class="qv-nota">Vai a palavra, a frase e a tradução. Não vai a sua agenda, nem a sua voz, nem o quadro do vídeo. Sem ranking e sem prazo.</p>
       <div class="cx-folha-pe"><button type="button" class="q-ctl" data-a="fechar">Agora não</button><button type="button" class="q-ctl pri" data-a="copiar">${ica('copy')} Copiar o link</button></div>`,
      'cx-folha cx-folha-desafio',
    );
    d.setAttribute('aria-label', 'Desafiar um amigo com 10 cartas');
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a === 'copiar') {
        navigator.clipboard?.writeText('https://babel-play.pages.dev/d/7kq2-m4t9').catch(() => {});
        sentir('acerto');
        toast('Link copiado. No app, ele abre as mesmas 10 cartas para o seu amigo.');
      }
      fecharFolhaDeBaixo();
    });
  }

  /* ---- A escolha dos cartões de cada prática -------------------------------------------- */
  function cxItens(tipo, rec) {
    const pool = rec.ids.map(ctCarta).filter((c, i, l) => c && l.indexOf(c) === i);
    const todos = pool.concat(CT_FILA.map(ctCarta).filter((c) => !pool.includes(c)));
    const n = CX_PR[tipo].n;
    const comFala = (l) => l.filter((c) => c.frases[0][3]);
    const curtas = (l) => l.slice().sort((a, b) => a.frases[0][0].length - b.frases[0][0].length);
    const pega = (l0, q = n) => {
      /* duas palavras podem ter nascido da mesma fala: a frase entra uma vez só */
      const l = l0.filter((c, i) => l0.findIndex((x) => x.frases[0][0] === c.frases[0][0]) === i);
      const base = l.filter((c) => pool.includes(c));
      return (base.length >= Math.min(q, 3) ? base : base.concat(l.filter((c) => !base.includes(c)))).slice(0, q);
    };
    if (tipo === 'ouvido') return CX_PARES.map((p, i) => ({ par: p, toca: cxHash(p[0] + i) % 2 }));
    if (tipo === 'falar') return pega(curtas(comFala(todos))).map((c) => ({ c, k: 0 }));
    if (tipo === 'ditado') return pega(curtas(comFala(todos)).filter((c) => c.frases[0][0].length <= 48)).map((c) => ({ c, k: 0 }));
    if (tipo === 'completar') return pega(todos.filter((c) => (ctAchar(c.frases[0][0], c.p)[0]?.[0] || 0) > 5)).map((c) => ({ c, k: 0 }));
    return pega(todos, 4).map((c) => ({ c, k: 0 }));
  }
  function cxComecar(tipo, rec0) {
    const rec = rec0?.ids ? rec0 : cxRecorte(rec0);
    const antes = ctR && !ctR.pr ? ctR : ctR?.pr?.antes || null;
    ctR?.pr?.grav?.destruir();
    const itens = cxItens(tipo, rec);
    const P = { tipo, rec, itens, total: itens.length, i: 0, certos: 0, quase: 0, erros: 0, fase: tipo === 'jogo' ? 'sorteio' : 'frente', texto: '', res: null, dica: false, antes, fim: false, bonus: CX.bonus === tipo && !CX.bonusGanho };
    ctR = { pr: P, fim: false, hist: [], rotulo: rec.rotulo };
    if (atual === 'estudo') ctPintarRodada('entra');
    else mostrar('estudo', { origem: 'clique' });
  }
  const cxP = () => ctR?.pr;
  const cxItem = () => cxP().itens[cxP().i];

  /* ---- O miolo de cada prática -------------------------------------------------------------- */
  const cxLimpa = (s) => s.toLowerCase().replace(/[’`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  function cxDist(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /* Digitação tolerante: 2 = igual, 1 = quase (um deslize de digitação), 0 = outra coisa. */
  const cxPerto = (dita, certa) => (dita === certa ? 2 : certa.length > 3 && cxDist(dita, certa) <= (certa.length > 7 ? 2 : 1) ? 1 : 0);
  function cxConferirDitado(texto, c, k) {
    const alvo = cxLimpa(c.frases[k][0]).split(' ');
    const dita = cxLimpa(texto).split(' ').filter(Boolean);
    const exibe = c.frases[k][0].replace(/[“”"]/g, '').split(/\s+/);
    let j = 0;
    const marcas = alvo.map((w) => {
      for (let x = j; x < Math.min(dita.length, j + 3); x++) {
        const q = cxPerto(dita[x], w);
        if (q) return (j = x + 1), q === 2 ? 'ok' : 'quase';
      }
      return 'falta';
    });
    const partes = cxLimpa(ctAlvoNaFrase(c, k)).split(' ');
    const pegouAPalavra = partes.every((p) => alvo.some((w, i) => w === p && marcas[i] !== 'falta'));
    const nota = marcas.filter((m) => m !== 'falta').length / alvo.length;
    const quase = marcas.includes('quase');
    const veredito = nota >= 0.85 && pegouAPalavra ? 'certo' : nota >= 0.5 ? 'parcial' : 'errado';
    return { marcas, exibe, veredito, quase, pegouAPalavra, lembrou: veredito === 'certo' || (veredito === 'parcial' && pegouAPalavra) };
  }
  const cxAvancar = `<button type="button" class="q-ctl pri qr-principal" data-cx="pr-avancar">Avançar ${ica('arrow-right')}</button>`;
  const cxTocarBotao = (rotulo, extra = '') => `<div class="cx-pr-tocar"><button type="button" class="q-ctl ct-som cx-toca" data-cx="pr-ouvir">${ica('audio-lines')}${cxEq}<span>${rotulo}</span></button>${extra}</div>`;
  const CX_CORPO = {
    falar(P) {
      const { c, k } = cxItem();
      return `<span class="q-rotulo">Diga em ${cxIdioma(c)}</span>
        <p class="cx-pr-pista">“${esc(c.frases[k][1])}”</p>
        <p class="cx-pr-sub">A palavra do cartão: <b>${esc(c.t)}</b></p>
        <p class="exemplo cx-pr-frase" lang="${c.lang}" hidden>“${ctFrase(c, k, 'marca')}”</p>
        <div class="cx-voz-caixa"></div>
        <button type="button" class="cx-link cx-pr-pular" data-cx="pr-sem-falar">Agora não posso falar: só ver a frase</button>
        <div class="cx-pr-nota" hidden><p class="q-rotulo">Você lembrou da frase?</p><div class="fsrs" role="group" aria-label="Você lembrou da frase?" style="--n:2"><button type="button" class="e" data-cx="pr-nota" data-v="0">Ainda não<small>volta amanhã</small></button><button type="button" class="b" data-cx="pr-nota" data-v="1">Lembrei<small>conta como revisão</small></button></div></div>`;
    },
    ditado(P) {
      const { c, k } = cxItem();
      const sess = CT_SESSOES[c.frases[k][2]];
      if (P.fase === 'frente')
        return `<span class="q-rotulo">Escreva o que você ouviu</span>
          ${cxTocarBotao('Ouvir a fala', `<button type="button" class="q-ctl" data-cx="pr-devagar">${ica('gauge')} Devagar</button>`)}
          <p class="cx-onde">${ica(sess ? sess[1] : 'volume-2')}<span>${esc(sess ? `${sess[0]} · ${c.frases[k][3]}` : 'Voz do aparelho')}</span></p>
          <label class="q-campo"><span>A frase em ${cxIdioma(c)}</span><input type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Escreva a frase…" data-cx-campo="texto" lang="${c.lang}"></label>
          <div class="cx-fileira"><button type="button" class="q-ctl" data-cx="pr-nao-sei">Não sei</button><button type="button" class="q-ctl pri qr-principal" data-cx="pr-verificar" disabled>${ica('check')} Verificar</button></div>`;
      const r = P.res;
      const texto = { certo: r.quase ? 'Certo. Só um deslize de digitação, que não conta.' : 'Certo, palavra por palavra.', parcial: r.pegouAPalavra ? `Quase. A palavra do cartão, “${esc(ctAlvoNaFrase(c, k))}”, você pegou.` : 'Quase. Faltou justo a palavra do cartão.', errado: P.texto ? 'Ainda não. Veja a frase e ouça de novo.' : 'Tudo bem. Veja a frase e ouça de novo.' }[r.veredito];
      return `<p class="qr-veredito ${r.veredito}" role="status">${ica(r.veredito === 'errado' ? 'circle-x' : 'circle-check')}<span>${texto}</span></p>
        <p class="cx-pr-palavras" lang="${c.lang}" aria-label="A frase, palavra por palavra">${r.exibe.map((w, i) => `<span class="${r.marcas[i] || 'ok'}">${esc(w)}</span>`).join(' ')}</p>
        <p class="exemplo">“${esc(c.frases[k][1])}”</p>
        ${cxTocarBotao('Ouvir de novo')}
        <p class="ct-consequencia">${r.lembrou ? 'Conta como lembrada.' : 'Conta como esquecida: volta amanhã.'}</p>${cxAvancar}`;
    },
    completar(P) {
      const { c, k } = cxItem();
      const alvo = ctAlvoNaFrase(c, k);
      if (P.fase === 'frente')
        return `<span class="q-rotulo">Complete a frase</span>
          <p class="qr-frase cx-pr-frase-vao" lang="${c.lang}">“${ctFrase(c, k, 'vao')}”</p>
          <p class="q-texto cx-pr-quer">Quer dizer: <b>${esc(c.t)}</b>${P.dica ? `<span class="cx-pr-dica"> · começa com “${esc(alvo.slice(0, Math.min(2, alvo.length - 1)))}”</span>` : ''}</p>
          ${cxTocarBotao('Ouvir até a lacuna', `<button type="button" class="q-ctl" data-cx="pr-dica" ${P.dica ? 'disabled' : ''}>${ica('lightbulb')} Dica</button>`)}
          <label class="q-campo"><span>A palavra que falta</span><input type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Digite a palavra…" data-cx-campo="texto" lang="${c.lang}"></label>
          <div class="cx-fileira"><button type="button" class="q-ctl" data-cx="pr-nao-sei">Não sei</button><button type="button" class="q-ctl pri qr-principal" data-cx="pr-verificar" disabled>${ica('check')} Verificar</button></div>`;
      const q = P.res;
      const texto = q === 2 ? `Certo: “${esc(alvo)}”.` : q === 1 ? `Quase: foi só um deslize de digitação. O certo é “${esc(alvo)}”.` : `Era “${esc(alvo)}”${P.texto ? ` (você escreveu “${esc(P.texto)}”)` : ''}.`;
      return `<p class="qr-veredito ${q === 2 ? 'certo' : q === 1 ? 'parcial' : 'errado'}" role="status">${ica(q ? 'circle-check' : 'circle-x')}<span>${texto}</span></p>
        <p class="exemplo cx-pr-frase cx-encaixou" lang="${c.lang}">“${ctFrase(c, k, 'marca')}”</p>
        <p class="exemplo">“${esc(c.frases[k][1])}”</p>
        ${cxTocarBotao('Ouvir a frase inteira')}
        <p class="ct-consequencia">${q ? `Conta como lembrada${P.dica ? ', com dica' : ''}.` : 'Conta como esquecida: volta amanhã.'}</p>${cxAvancar}`;
    },
    jogo(P) {
      if (P.fase === 'sorteio')
        return `<span class="q-rotulo">Sorteando um jogo com estes cartões</span>
          <div class="cx-sorteio">${Object.entries(CX_JOGOS).map(([id, [nome, mini]]) => `<button type="button" class="q-tile px-com-mini cx-sorte" data-cx="pr-jogo" data-v="${id}"><span class="px-mini" aria-hidden="true">${MINIS[mini]}</span><b>${nome}</b></button>`).join('')}</div>
          <p class="q-texto cx-pr-quer">Ou toque em um para escolher.</p>`;
      const j = P.j;
      if (j.tipo === 'pares')
        return `<span class="q-rotulo">Casar pares: palavra e tradução</span>
          <div class="cx-pares">${j.fichas.map((f, i) => `<button type="button" class="cx-ficha ${f.lado}" data-cx="pr-ficha" data-i="${i}" ${f.lado === 'p' ? `lang="${f.lang}"` : ''}>${esc(f.txt)}</button>`).join('')}</div>`;
      if (j.tipo === 'frase') {
        const { c, k } = P.itens[P.i];
        return `<span class="q-rotulo">Monte a frase na ordem</span>
          <p class="cx-pr-pista pequena">“${esc(c.frases[k][1])}”</p>
          <div class="cx-montada" lang="${c.lang}" aria-label="A frase montada"></div>
          <div class="cx-banco" lang="${c.lang}">${j.ordem.map((n) => `<button type="button" class="cx-ficha" data-cx="pr-palavra" data-n="${n}">${esc(j.palavras[n])}</button>`).join('')}</div>`;
      }
      const { c } = P.itens[P.i];
      return `<span class="q-rotulo">Qual palavra quer dizer</span>
        <p class="cx-pr-pista">${esc(c.t)}</p>
        <div class="qr-opcoes cx-tres-opcoes" role="group" aria-label="Qual é a palavra">${j.opcoes.map((o) => `<button type="button" class="qr-opcao" data-cx="pr-opcao" data-v="${esc(o)}" lang="${c.lang}">${esc(o)}</button>`).join('')}</div>`;
    },
    ouvido(P) {
      const it = cxItem();
      const [a, ia, b, ib] = it.par;
      const semSom = !temVoz || !sentidos.som;
      const feito = P.fase === 'depois';
      const opcao = (txt, ipa, v) => `<button type="button" class="qr-opcao cx-par ${feito ? (v === it.toca ? 'certa' : P.res === v ? 'errada' : '') : ''}" data-cx="pr-par" data-v="${v}" ${feito ? 'disabled' : ''} lang="en"><b>${esc(txt)}</b><small>${ipa}</small></button>`;
      return `<span class="q-rotulo">Qual dos dois você ouviu?</span>
        <button type="button" class="cx-ouvir-grande ct-som" data-cx="pr-ouvir" aria-label="Ouvir de novo">${ica('volume-2')}${cxEq}</button>
        ${semSom ? `<p class="q-texto cx-pr-quer">${ica('volume-2')} Ligue o som do protótipo para treinar o ouvido.</p>` : ''}
        <div class="cx-dois" role="group" aria-label="Qual dos dois você ouviu">${opcao(a, ia, 0)}${opcao(b, ib, 1)}</div>
        ${feito ? `<p class="qr-veredito ${P.res === it.toca ? 'certo' : 'errado'}" role="status">${ica(P.res === it.toca ? 'circle-check' : 'circle-x')}<span>${P.res === it.toca ? 'Isso. Agora ouça os dois, um depois do outro.' : `Era “${esc(it.par[it.toca * 2])}”. Ouça os dois, um depois do outro.`}</span></p>
          <div class="cx-fileira"><button type="button" class="q-ctl" data-cx="pr-os-dois">${ica('repeat')} Ouvir os dois</button>${cxAvancar}</div>` : ''}`;
    },
  };
  function cxHtmlDoFecho(P) {
    const def = CX_PR[P.tipo];
    const t = P.total;
    const resto = t - P.certos;
    const feito = { falar: `${P.certos} de ${t} ${t === 1 ? 'frase lembrada' : 'frases lembradas'}, ditas em voz alta.`, ditado: `${P.certos} de ${t} ${t === 1 ? 'frase' : 'frases'} de ouvido${P.quase ? `; ${P.quase} com deslize de digitação, que não conta` : ''}.`, completar: `${P.certos} de ${t} lacunas completadas${P.quase ? `; ${P.quase} com deslize de digitação, que não conta` : ''}.`, jogo: `${CX_JOGOS[P.j?.tipo]?.[0] || 'Jogo'}: ${P.erros ? `${P.erros} ${P.erros === 1 ? 'tropeço' : 'tropeços'} no caminho` : 'sem nenhum tropeço'}.`, ouvido: `${P.certos} de ${t} pares de ouvido.` }[P.tipo];
    const conta = def.conta
      ? `<p class="cx-fecho-conta conta">${ica('circle-check')}<span><b>Contou como revisão.</b> ${P.certos ? `${P.certos} ${P.certos === 1 ? 'cartão sai' : 'cartões saem'} da fila de hoje` : 'Nenhum cartão saiu da fila de hoje'}${resto ? `; ${resto} ${resto === 1 ? 'volta' : 'voltam'} amanhã` : ''}.</span></p>`
      : `<p class="cx-fecho-conta leve">${ica('calendar-clock')}<span><b>Não mexeu na sua agenda.</b> Reconhecer ajuda a aquecer, mas é recordar que fixa: os cartões continuam na fila.</span></p>`;
    return `<div class="q-palco q-revisao ct-rev ct-fim cx-fim cx-pr cx-pr-fim" data-estado="pratica-fim" data-pr="${P.tipo}">
      <header class="q-cab cx-topo"><button type="button" class="q-ctl q-voltar" aria-label="Voltar" data-cx="pr-voltar">${ica('arrow-left')}</button><div><p class="q-sobre">${esc(P.rec.rotulo)}</p><h1>Prática concluída</h1></div></header>
      <div class="q-cartao fundo qr-fecho"><span class="q-ic">${ica(def.ic)}</span><div><h2>${def.nome}</h2><p>${feito}</p></div></div>
      ${conta}
      ${P.ganhouBonus ? `<p class="cx-ganho cx-bonus-ganho">${ica('gift')}<b>Bônus de hoje</b><i>·</i>${ica('sprout')}<b>+10 Seeds</b><span>por concluir a prática</span></p>` : ''}
      <div class="q-faixa cx-fim-pe" role="toolbar" aria-label="O que fazer agora">
        <button type="button" class="q-ctl pri" data-cx="pr-trocar">${ica('sparkles')} Praticar de outro jeito</button>
        <button type="button" class="q-ctl" data-cx="pr-voltar">${ica('layers')} Voltar</button>
      </div></div>`;
  }
  function cxHtmlDaPratica() {
    const P = cxP();
    if (P.fim) return cxHtmlDoFecho(P);
    const def = CX_PR[P.tipo];
    const t = P.total;
    const teclas = { falar: 'Sem pressa: aqui não há relógio', ditado: '<kbd>Enter</kbd> verifica e avança', completar: '<kbd>Enter</kbd> verifica e avança', jogo: 'Sem relógio e sem ranking', ouvido: '<kbd>1</kbd> ou <kbd>2</kbd> escolhe · <kbd>R</kbd> ouve de novo' }[P.tipo];
    return `<div class="q-palco q-revisao ct-rev cx-rev cx-pr" data-estado="pratica" data-pr="${P.tipo}" data-fase="${P.fase}">
      <header class="q-cab qr-topo cx-topo"><button type="button" class="q-ctl q-voltar" aria-label="Sair da prática" data-cx="pr-voltar">${ica('arrow-left')}</button>
        <div class="qr-progresso"><span class="q-barra" role="progressbar" aria-label="Progresso da prática" aria-valuenow="${P.i}" aria-valuemin="0" aria-valuemax="${t}"><span style="width:${(P.i / Math.max(1, t)) * 100}%"></span></span><span class="qr-conta">${P.fase === 'sorteio' ? def.nome : `${Math.min(P.i + 1, t)} / ${t}`}</span></div>
        <button type="button" class="q-ctl cx-ic" aria-label="Praticar de outro jeito" title="Praticar de outro jeito" data-cx="pr-trocar">${ica('sparkles')}</button></header>
      <h1 class="sr">${def.nome}: ${esc(P.rec.rotulo)}</h1>
      <div class="cx-linha"><p class="cx-pr-linha"><span class="q-tag off">${ica('layers')} ${esc(P.rec.rotulo)}</span>${cxSelo(def.conta)}${P.bonus ? `<span class="q-tag cx-bonus">${ica('gift')} Bônus de hoje</span>` : ''}</p></div>
      <section class="q-cartao qr-cartao flash pele-padrao cartao-aprendida cx-pr-cartao" aria-label="${def.nome}">${CX_CORPO[P.tipo](P)}</section>
      <p class="cx-teclas" data-precisa="teclado">${teclas}</p>
    </div>`;
  }
  /* ---- Pintar e armar ------------------------------------------------------------------------ */
  function cxPintarPratica(como) {
    const P = cxP();
    if (!P) return;
    const antes = parseFloat($('.qr-progresso .q-barra > span', tela)?.style.width) || 0;
    P.grav?.destruir();
    P.grav = null;
    clearTimeout(P.relogio);
    tela.innerHTML = cxHtmlDaPratica();
    const barraP = $('.qr-progresso .q-barra > span', tela);
    if (barraP && polido() && !reduz() && como !== 'seco') anima(barraP, [{ width: antes + '%' }, { width: barraP.style.width }], { d: 520, e: MOLA_SUAVE });
    cxArmarPratica(como);
  }
  function cxSom(texto, o = {}) {
    /* toca e acende o botão de ouvir enquanto toca */
    const P = cxP();
    const b = $('.cx-toca, .cx-ouvir-grande', tela);
    b?.classList.add('ct-tocando');
    const vez = (P.vezDoSom = (P.vezDoSom || 0) + 1);
    const fim = () => cxP() === P && P.vezDoSom === vez && b?.classList.remove('ct-tocando');
    const p = dizer(texto, o).then(fim);
    setTimeout(fim, Math.min(5200, 900 + texto.length * 70) * (o.devagar ? 1.6 : 1));
    return p;
  }
  function cxOuvir(o = {}) {
    const P = cxP();
    if (P.tipo === 'ouvido') return cxSom(cxItem().par[cxItem().toca * 2], { lang: 'en-US' });
    const { c, k } = cxItem();
    const frase = c.frases[k][0];
    const ate = P.tipo === 'completar' && P.fase === 'frente' ? frase.slice(0, ctAchar(frase, c.p)[0]?.[0] ?? frase.length).trim() : frase;
    return cxSom(ate || c.p, { lang: ctVoz(c), ...o });
  }
  function cxArmarPratica(como) {
    const P = cxP();
    if (!P) return;
    const mexe = polido() && !reduz() && como !== 'seco';
    if (P.fim) {
      if (!mexe) return;
      $$('.cx-pr-fim > *:not(.q-cab):not(.cx-fim-pe)', tela).forEach((x, i) => anima(x, ENTRA(26), { d: 620, atraso: 80 + i * 80 }));
      anima($('.qr-fecho .q-ic', tela), [{ transform: 'scale(0.3) rotate(-24deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 820, atraso: 200, e: MOLA });
      const bonus = $('.cx-bonus-ganho', tela);
      if (bonus) setTimeout(() => cxP() === P && (sentir('moeda'), bonus.isConnected && rajada(...centro(bonus), 16, 0.9)), 700 * K());
      if (!QS.has('quieto')) setTimeout(() => cxP() === P && confete(P.ganhouBonus ? 70 : 36), 320 * K());
      return;
    }
    const cartao = $('.qr-cartao', tela);
    if (mexe && (como === 'proximo' || como === 'entra' || como === 'entrou')) {
      anima(cartao, [{ opacity: 0, transform: 'translateX(70px) scale(0.97)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' }], { d: 520, e: MOLA_SUAVE });
      $$(':scope > *', cartao).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380, atraso: 90 + i * 45 }));
    } else if (mexe && como === 'resposta') {
      $$(':scope > *', cartao).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 400, atraso: i * 55 }));
      const enc = $('.cx-encaixou mark', cartao);
      if (enc) anima(enc, [{ transform: 'translateY(26px) scale(1.5)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { d: 620, atraso: 120, e: MOLA });
    }
    const novo = como !== 'seco' && como !== 'resposta';
    if (P.tipo === 'falar') {
      const { c, k } = cxItem();
      const revela = () => {
        const f = $('.cx-pr-frase', tela);
        if (f?.hidden) (f.hidden = false), mexe && anima(f, [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(5px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420 });
        $('.cx-pr-pular', tela)?.remove();
        $('.cx-pr-sub', tela)?.remove();
      };
      const pedeNota = () => {
        const n = $('.cx-pr-nota', tela);
        if (!n?.hidden) return;
        n.hidden = false;
        n.scrollIntoView({ block: 'nearest', behavior: reduz() ? 'auto' : 'smooth' });
        if (polido() && !reduz()) $$('button', n).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px) scale(0.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 460, atraso: i * 60, e: MOLA_SUAVE }));
      };
      P.revela = () => (revela(), pedeNota());
      P.grav = cxGravador($('.cx-voz-caixa', tela), { c, k, convite: 'Toque no microfone e diga a frase. Depois você ouve a original e a sua.', aoGravar: revela, aoComparar: pedeNota });
      return;
    }
    if (P.tipo === 'jogo') {
      if (P.fase !== 'sorteio') return P.j.tipo === 'frase' && cxPorMontada();
      /* a roleta: acende um, outro, outro, e para no sorteado */
      const cartas = $$('.cx-sorte', tela);
      const alvo = cxHash(P.rec.rotulo) % cartas.length;
      const para = () => cxP() === P && P.fase === 'sorteio' && cxEscolherJogo(cartas[alvo].dataset.v);
      if (!novo) return;
      if (!mexe) return void (cartas[alvo].classList.add('acesa'), (P.relogio = setTimeout(para, 1100)));
      let n = 0;
      const voltas = cartas.length * 2 + alvo;
      const gira = () => {
        if (cxP() !== P || P.fase !== 'sorteio') return;
        cartas.forEach((x, i) => x.classList.toggle('acesa', i === n % cartas.length));
        sentir('toque');
        if (n === voltas) return void (sentir('acerto'), anima(cartas[alvo], [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA }), (P.relogio = setTimeout(para, 900 * K())));
        n++;
        P.relogio = setTimeout(gira, (110 + n * 26) * K());
      };
      P.relogio = setTimeout(gira, 500 * K());
      return;
    }
    if (novo && P.fase === 'frente') {
      P.relogio = setTimeout(() => cxP() === P && cxOuvir(), 520 * K());
      if (!celular()) $('[data-cx-campo]', tela)?.focus({ preventScroll: true });
    }
    if (como === 'resposta') {
      const v = $('.qr-veredito.certo svg', tela);
      if (v && polido() && !reduz()) rajada(...centro(v), 12, 0.8);
      if (P.tipo === 'ouvido') cxOsDois();
      else if (P.tipo === 'completar' || (P.tipo === 'ditado' && !P.res.lembrou)) P.relogio = setTimeout(() => cxP() === P && cxOuvir(), 420 * K());
    }
  }
  /* Treinar o ouvido, depois da resposta: toca um, acende; toca o outro, acende. */
  async function cxOsDois() {
    const P = cxP();
    const it = cxItem();
    const vez = (P.vezDoSom = (P.vezDoSom || 0) + 1);
    for (const v of [0, 1]) {
      await cxPausa(v ? 260 : 520);
      if (cxP() !== P || P.vezDoSom !== vez || P.fase !== 'depois') return;
      const b = $(`.cx-par[data-v="${v}"]`, tela);
      b?.classList.add('ouvindo');
      await Promise.all([Promise.race([dizer(it.par[v * 2], { lang: 'en-US' }), cxPausa(1800)]), cxPausa(850)]);
      b?.classList.remove('ouvindo');
    }
  }
  /* ---- Jogo rápido: três jogos pequenos; nenhum conta como revisão ---------------------------- */
  function cxEscolherJogo(id) {
    const P = cxP();
    clearTimeout(P.relogio);
    const cs = P.itens.map((x) => x.c);
    if (id === 'pares') {
      const fichas = cs.flatMap((c) => [{ id: c.id, lado: 'p', txt: c.p, lang: c.lang }, { id: c.id, lado: 't', txt: c.t.split(/[,;]/)[0] }]);
      let ordem = cxEmbaralhar(fichas, cs.map((c) => c.id).join());
      /* se algum par ficou lado a lado, tenta outra semente: casar vizinhos não tem graça */
      for (let t = 1; t < 8 && ordem.some((f, i) => i % 2 === 0 && ordem[i + 1]?.id === f.id); t++) ordem = cxEmbaralhar(fichas, cs.map((c) => c.id).join() + t);
      P.j = { tipo: 'pares', fichas: ordem, sel: null };
      P.total = cs.length;
    } else if (id === 'frase') {
      P.itens = P.itens.slice().sort((a, b) => a.c.frases[0][0].length - b.c.frases[0][0].length).slice(0, 3);
      P.total = P.itens.length;
      P.j = { tipo: 'frase' };
      cxNovaFrase();
    } else {
      P.j = { tipo: 'escolha' };
      P.total = cs.length;
      cxNovaEscolha();
    }
    P.fase = 'jogando';
    P.i = 0;
    sentir('nav');
    ctPintarRodada('proximo');
  }
  function cxNovaFrase() {
    const P = cxP();
    const { c, k } = P.itens[P.i];
    const palavras = c.frases[k][0].split(/\s+/);
    let ordem = cxEmbaralhar(palavras.map((_, i) => i), c.id + palavras.length);
    if (ordem.every((n, i) => n === i)) ordem = ordem.reverse();
    Object.assign(P.j, { palavras, ordem, postas: [] });
  }
  function cxPorMontada() {
    const P = cxP();
    const m = $('.cx-montada', tela);
    if (m) m.innerHTML = P.j.postas.map((n) => `<span class="cx-ficha posta">${esc(P.j.palavras[n])}</span>`).join('') + (P.j.postas.length < P.j.palavras.length ? '<i class="cx-cursor" aria-hidden="true"></i>' : '');
  }
  function cxNovaEscolha() {
    const P = cxP();
    const { c } = P.itens[P.i];
    const outras = CT_CARTOES.filter((x) => x.lang === c.lang && x.id !== c.id).map((x) => x.p);
    const sem = cxHash(c.id);
    const duas = [outras[sem % outras.length], outras[(sem * 7 + 3) % outras.length]].filter((v, i, l) => l.indexOf(v) === i);
    while (duas.length < 2) duas.push(outras.find((x) => !duas.includes(x)));
    const opcoes = duas.slice();
    opcoes.splice(sem % 3, 0, c.p);
    P.j.opcoes = opcoes;
    P.j.respondeu = false;
  }
  function cxPassoDoJogo(certo, atraso = 700) {
    /* avança uma rodada do jogo; no fim, o fecho */
    const P = cxP();
    P.i++;
    const b = $('.qr-progresso .q-barra > span', tela);
    if (b) b.style.width = `${(P.i / P.total) * 100}%`;
    P.relogio = setTimeout(() => {
      if (cxP() !== P) return;
      if (P.i >= P.total) return cxFecharPratica();
      if (P.j.tipo === 'frase') cxNovaFrase();
      if (P.j.tipo === 'escolha') cxNovaEscolha();
      ctPintarRodada('proximo');
    }, atraso * K());
  }
  function cxFecharPratica() {
    const P = cxP();
    P.fim = true;
    if (P.bonus) (P.ganhouBonus = true), (CX.bonusGanho = true);
    sentir('sucesso');
    ctPintarRodada('fim');
  }
  function cxProximo() {
    const P = cxP();
    P.i++;
    if (P.i >= P.total) return cxFecharPratica();
    Object.assign(P, { fase: 'frente', texto: '', res: null, dica: false });
    ctPintarRodada('proximo');
  }
  function cxVerificar(texto) {
    const P = cxP();
    if (P.fase !== 'frente' || !['ditado', 'completar'].includes(P.tipo)) return;
    const { c, k } = cxItem();
    P.texto = (texto ?? P.texto).trim();
    if (temVoz) speechSynthesis.cancel();
    let lembrou;
    if (P.tipo === 'ditado') {
      P.res = cxConferirDitado(P.texto, c, k);
      lembrou = P.res.lembrou;
      if (P.res.quase && lembrou) P.quase++;
    } else {
      const dita = cxLimpa(P.texto);
      P.res = dita ? Math.max(cxPerto(dita, cxLimpa(ctAlvoNaFrase(c, k))), cxPerto(dita, cxLimpa(c.p)) === 2 ? 2 : 0) : 0;
      lembrou = P.res > 0;
      if (P.res === 1) P.quase++;
    }
    if (lembrou) P.certos++;
    P.fase = 'depois';
    sentir(lembrou ? 'acerto' : 'desliga');
    ctPintarRodada('resposta');
  }
  function cxSairDaPratica() {
    const P = cxP();
    if (!P) return;
    P.grav?.destruir();
    clearTimeout(P.relogio);
    if (temVoz) speechSynthesis.cancel();
    if (!P.fim && (P.i > 0 || P.fase === 'depois')) toast('Prática interrompida: o que você já respondeu não foi contado.', 3200);
    if (P.antes) {
      ctR = P.antes;
      return ctPintarRodada('seco');
    }
    ctSairDaRevisao();
  }
  /* ---- As ações (data-cx) ---------------------------------------------------------------------- */
  function cxAcao(a, b) {
    const P = cxP();
    if (!P) return;
    switch (a) {
      case 'pr-voltar':
      case 'rev-voltar':
        return cxSairDaPratica();
      case 'pr-trocar':
        P.grav?.destruir();
        return void cxAbrirPraticar(P.rec);
      case 'pr-ouvir':
        return void cxOuvir();
      case 'pr-devagar':
        return void cxOuvir({ devagar: true });
      case 'pr-os-dois':
        return void cxOsDois();
      case 'pr-dica':
        P.dica = true;
        sentir('toque');
        b.disabled = true;
        return void $('.cx-pr-quer', tela)?.insertAdjacentHTML('beforeend', `<span class="cx-pr-dica"> · começa com “${esc(ctAlvoNaFrase(cxItem().c, cxItem().k).slice(0, 2))}”</span>`);
      case 'pr-verificar':
        return cxVerificar();
      case 'pr-nao-sei':
        return cxVerificar('');
      case 'pr-avancar':
        return cxProximo();
      case 'pr-sem-falar':
        P.grav?.destruir();
        $('.cx-voz-caixa', tela)?.remove();
        return void P.revela?.();
      case 'pr-nota':
        if (b.dataset.v === '1') P.certos++;
        sentir(b.dataset.v === '1' ? 'liga' : 'desliga');
        if (polido() && !reduz()) flutuar(b, b.dataset.v === '1' ? 'lembrada' : 'volta amanhã', b.dataset.v === '1' ? 'good' : 'erro');
        return cxProximo();
      case 'pr-par': {
        if (P.fase !== 'frente') return;
        P.res = +b.dataset.v;
        const certo = P.res === cxItem().toca;
        if (certo) P.certos++;
        P.fase = 'depois';
        sentir(certo ? 'acerto' : 'erro');
        return ctPintarRodada('resposta');
      }
      case 'pr-jogo':
        return cxEscolherJogo(b.dataset.v);
      case 'pr-ficha': {
        const j = P.j;
        const f = j.fichas[+b.dataset.i];
        if (f.ok || j.trava) return;
        if (j.sel == null) return (j.sel = +b.dataset.i), b.classList.add('sel'), sentir('toque');
        const outro = $(`.cx-ficha[data-i="${j.sel}"]`, tela);
        const g = j.fichas[j.sel];
        if (j.sel === +b.dataset.i) return (j.sel = null), b.classList.remove('sel');
        j.sel = null;
        if (g.id === f.id && g.lado !== f.lado) {
          f.ok = g.ok = true;
          [b, outro].forEach((x) => (x.classList.remove('sel'), x.classList.add('ok'), (x.disabled = true)));
          sentir('acerto');
          if (polido() && !reduz()) rajada(...centro(b), 10, 0.7), [b, outro].forEach((x) => anima(x, [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA }));
          P.certos++;
          P.i++;
          const barraP = $('.qr-progresso .q-barra > span', tela);
          if (barraP) barraP.style.width = `${(P.i / P.total) * 100}%`;
          const conta = $('.qr-conta', tela);
          if (conta) conta.textContent = `${Math.min(P.i + 1, P.total)} / ${P.total}`;
          if (j.fichas.every((x) => x.ok)) P.relogio = setTimeout(() => cxP() === P && cxFecharPratica(), 800 * K());
          return;
        }
        P.erros++;
        sentir('erro');
        j.trava = true;
        [b, outro].forEach((x) => (x.classList.add('errou'), tremer(x)));
        return void setTimeout(() => ((j.trava = false), [b, outro].forEach((x) => x.classList.remove('errou', 'sel'))), 460);
      }
      case 'pr-palavra': {
        const j = P.j;
        const n = +b.dataset.n;
        const vez = j.postas.length;
        /* vale qualquer ficha com a mesma palavra da vez (frases com palavra repetida) */
        if (j.palavras[n] !== j.palavras[vez]) return P.erros++, sentir('erro'), tremer(b);
        j.postas.push(n);
        b.disabled = true;
        b.classList.add('usada');
        sentir('toque');
        cxPorMontada();
        const ultima = $('.cx-montada .cx-ficha:last-of-type', tela);
        if (ultima && polido() && !reduz()) anima(ultima, [{ transform: 'translateY(18px) scale(0.8)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { d: 360, e: MOLA });
        if (j.postas.length < j.palavras.length) return;
        sentir('acerto');
        P.certos++;
        const m = $('.cx-montada', tela);
        m.classList.add('ok');
        if (polido() && !reduz()) rajada(...centro(m), 14, 0.8);
        dizer(j.palavras.join(' '), { lang: ctVoz(P.itens[P.i].c) });
        return cxPassoDoJogo(true, 1500);
      }
      case 'pr-opcao': {
        if (P.j.respondeu) return;
        const c = P.itens[P.i].c;
        const certo = b.dataset.v === c.p;
        P.j.respondeu = true;
        b.classList.add(certo ? 'certa' : 'errada');
        if (!certo) P.erros++, $$('.cx-tres-opcoes .qr-opcao', tela).find((x) => x.dataset.v === c.p)?.classList.add('certa'), tremer(b);
        else P.certos++, polido() && !reduz() && rajada(...centro(b), 10, 0.7);
        sentir(certo ? 'acerto' : 'erro');
        return cxPassoDoJogo(certo, certo ? 700 : 1300);
      }
    }
  }
  tela.addEventListener('input', (e) => {
    const P = cxP();
    if (atual !== 'estudo' || !P || !e.target.dataset?.cxCampo) return;
    P.texto = e.target.value;
    const v = $('[data-cx="pr-verificar"]', tela);
    if (v) v.disabled = !e.target.value.trim();
  });
  function cxTeclaDaPratica(e) {
    const P = cxP();
    if (!P || P.fim) return;
    const campo = e.target.matches?.('input, textarea');
    if (campo) {
      if (e.key === 'Enter' && e.target.value.trim()) e.preventDefault(), cxVerificar();
      return;
    }
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === ' ') && P.fase === 'depois' && !e.target.closest?.('button')) return e.preventDefault(), cxProximo();
    if (k === 'r' && P.tipo !== 'falar' && P.tipo !== 'jogo') return e.preventDefault(), void cxOuvir();
    if (P.tipo === 'ouvido' && P.fase === 'frente' && (k === '1' || k === '2')) return e.preventDefault(), void $(`.cx-par[data-v="${+k - 1}"]`, tela)?.click();
  }

  /* ==========================================================================
     A barra do protótipo: "Revisão e práticas" pula direto para cada estado.
     Também pela URL: ?cx=<estado> (com &embutido para a captura sem as barras).
     ========================================================================== */
  const cxDepois = (f, ms = 700) => setTimeout(f, ms * K());
  function cxRevisao(o = {}) {
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    Object.assign(CT_AJ, { formato: 'lembrar', botoes: o.botoes || 4 });
    PL.offline = !!o.offline;
    CT_CARTOES.forEach((c) => (c.band = false));
    const de = o.de || 0;
    ctR = null;
    ctEstudar({ ids: CT_FILA.slice(de), rotulo: 'Hoje · tudo', origem: 'seco' });
    Object.assign(ctR, { total: 26, feitos: de, inteiro: true, mostrando: !!o.mostrar, seguidas: o.seguidas || 0, pend: o.pend || 0, forcarDizer: !!o.dizer, vistosN: de ? 9 : 1 });
    if (de) ctR.hist.push(ctFoto());
    if (o.aviso) (ctR.aviso = o.aviso), (ctCarta(o.aviso).lapsos = 8);
    ctPintarRodada('seco');
    sincronizarBarraCt?.();
  }
  function cxFim() {
    cxRevisao({});
    Object.assign(ctR, { fila: [], feitos: 26, fim: true, notas: { e: 4, d: 3, b: 21, f: 2 }, erradas: ['thorough', 'though', 'deprive', 'madrugar'], melhor: 9, novas: 5, formadas: 3, seg: 348 });
    ctPintarRodada('seco');
  }
  const cxRecorteDeHoje = { origem: 'hoje', rotulo: 'As 26 de hoje', n: 26 };
  const cxPratica = (tipo, rec = cxRecorteDeHoje) => (cxRevisao({}), (ctR = null), cxComecar(tipo, cxRecorte(rec)));
  const CX_ESTADOS = [
    ['A revisão', 'frente', 'Frente', () => cxRevisao({ de: 9, seguidas: 5 })],
    ['A revisão', 'frente-inicio', 'Frente, 1º cartão (com a instrução)', () => cxRevisao({})],
    ['A revisão', 'dizer', 'Dizer antes de virar', () => cxRevisao({ de: 9, dizer: true })],
    ['A revisão', 'verso-cena', 'Verso com a cena (áudio)', () => cxRevisao({ de: 9, mostrar: true, seguidas: 5 })],
    ['A revisão', 'verso-video', 'Verso com a cena (vídeo)', () => cxRevisao({ de: 2, mostrar: true })],
    ['A revisão', 'verso-sem-cena', 'Verso sem cena (Anki), com o convite', () => cxRevisao({ de: 5, mostrar: true })],
    ['A revisão', 'dois-botoes', 'Verso com dois botões', () => cxRevisao({ de: 9, mostrar: true, botoes: 2 })],
    ['A revisão', 'mais', 'A folha do “…”', () => (cxRevisao({ de: 9, mostrar: true }), cxDepois(ctMaisAcoes))],
    ['A revisão', 'dificil', 'Palavra que não entra (a linha)', () => cxRevisao({ de: 4, aviso: 'thorough' })],
    ['A revisão', 'dificil-saidas', 'Palavra que não entra (as 4 saídas)', () => (cxRevisao({ de: 4, aviso: 'thorough' }), cxDepois(() => cxSaidas('thorough')))],
    ['A revisão', 'sem-rede', 'Sem rede (a linha)', () => cxRevisao({ de: 3, offline: true, pend: 3 })],
    ['A revisão', 'fim', 'Fim da sessão', cxFim],
    ['Minha voz', 'voz-gravando', 'Gravando', () => (cxRevisao({ de: 9, mostrar: true }), cxDepois(() => cxAbrirVoz(ctAtual(), 0, { simular: true, semParar: true })))],
    ['Minha voz', 'voz-comparando', 'Comparando as duas ondas', () => (cxRevisao({ de: 9, mostrar: true }), cxDepois(() => cxAbrirVoz(ctAtual(), 0, { exemplo: true })))],
    ['Minha voz', 'voz-de-verdade', 'Com o microfone de verdade', () => ((CX.mic = 'real'), cxRevisao({ de: 9, mostrar: true }), cxDepois(() => cxAbrirVoz(ctAtual(), 0, { parado: true })))],
    ['Minha voz', 'voz-negada', 'Microfone negado', () => (cxRevisao({ de: 9, mostrar: true }), cxDepois(() => ((CX.mic = 'negado'), cxAbrirVoz(ctAtual(), 0), (CX.mic = 'real'))))],
    ['Praticar', 'praticar', 'A folha “Praticar de outro jeito”', () => (cxFim(), cxDepois(() => cxAbrirPraticar(cxRecorteDeHoje)))],
    ['Praticar', 'pr-falar', 'Falar', () => cxPratica('falar')],
    ['Praticar', 'pr-ditado', 'Ouvir e escrever', () => cxPratica('ditado')],
    ['Praticar', 'pr-completar', 'Completar', () => cxPratica('completar')],
    ['Praticar', 'pr-jogo', 'Jogo rápido', () => cxPratica('jogo')],
    ['Praticar', 'pr-ouvido', 'Treinar o ouvido', () => cxPratica('ouvido')],
    ['Praticar', 'pr-fim', 'Fecho de uma prática (com o bônus)', () => (cxPratica('ditado'), Object.assign(cxP(), { i: 3, certos: 2, quase: 1 }), (CX.bonusGanho = false), (cxP().bonus = true), cxFecharPratica())],
    ['Praticar', 'desafio', 'Desafiar um amigo (o convite)', () => (cxFim(), cxDepois(() => cxAbrirDesafio(cxRecorte(cxRecorteDeHoje))))],
  ];
  function cxIrPara(id) {
    const e = CX_ESTADOS.find((x) => x[1] === id);
    if (!e) return;
    ctAbrirMapa?.(false);
    $$('dialog[open]').forEach((d) => (d.close(), d.remove()));
    if (folha) fecharFolha({ seco: true, semFoco: true });
    ctR?.pr?.grav?.destruir();
    if (CT.hoje !== 'normal') CT.hoje = 'normal';
    e[3]();
  }
  const cxBarra = $('.ct-barra');
  if (cxBarra && !EMBUTIDO) {
    cxBarra.insertAdjacentHTML('beforeend', '<span class="px-sep"></span><button type="button" class="cx-barra-estados" data-cx-b="estados" aria-expanded="false" title="Pula direto para cada estado da revisão enxuta, da minha voz e das práticas">Revisão e práticas</button>');
    const grupos = [...new Set(CX_ESTADOS.map((e) => e[0]))];
    document.body.insertAdjacentHTML('beforeend', `<div class="cx-estados" role="menu" aria-label="Estados da revisão e das práticas" hidden>${grupos.map((g) => `<div><p>${g}</p>${CX_ESTADOS.filter((e) => e[0] === g).map((e) => `<button type="button" role="menuitem" data-cx-estado="${e[1]}">${e[2]}</button>`).join('')}</div>`).join('')}</div>`);
    const menu = $('.cx-estados');
    const botao = $('[data-cx-b="estados"]', cxBarra);
    const abre = (sim) => ((menu.hidden = !sim), botao.setAttribute('aria-expanded', sim), botao.setAttribute('aria-pressed', sim));
    botao.addEventListener('click', (e) => (e.stopPropagation(), abre(menu.hidden)));
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cx-estado]');
      if (!b) return;
      e.stopPropagation();
      abre(false);
      cxIrPara(b.dataset.cxEstado);
    });
    document.addEventListener('click', (e) => !menu.hidden && !menu.contains(e.target) && abre(false));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !menu.hidden && abre(false));
  }
  if (QS.get('cx')) setTimeout(() => cxIrPara(QS.get('cx')), 600);
