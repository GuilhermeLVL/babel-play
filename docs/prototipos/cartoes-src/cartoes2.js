  /* ==========================================================================
     CARTÕES 2 — a revisão (a rodada de estudo).
     A marcação é a de RevisaoDoQuest.tsx (q-revisao, qr-topo, qr-cartao flash, resp, fsrs,
     qr-opcoes, qr-producao, qr-fecho, qr-numeros) e o CSS é o questRevisao.css do repositório.
     O que a proposta acrescenta: a frase com a palavra marcada e a FALA ORIGINAL da sessão,
     alternar entre frases, o quadro do vídeo, quem erra revê na mesma sessão, enterrar, bandeira,
     aviso de palavra difícil, aviso de nota não enviada (sem rede), dois ou quatro botões,
     gestos no celular, atalhos à vista e o fim com "virar jogo".
     ========================================================================== */
  let ctR = null;
  const ctAtual = () => ctR && ctCarta(ctR.fila[0]);
  const ctEscRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* Onde a palavra está dentro da frase (aceita flexão: "complain" em "complaining"). */
  function ctAchar(frase, palavra) {
    const partes = palavra.split(' ');
    const achados = [];
    let de = 0;
    for (const p of partes) {
      const raiz = p.length > 4 ? p.slice(0, p.length - 2) : p;
      const m = new RegExp(`(^|[^\\p{L}])(${ctEscRe(p)}[\\p{L}]*|${ctEscRe(raiz)}[\\p{L}]*)`, 'iu').exec(frase.slice(de));
      if (!m) continue;
      const ini = de + m.index + m[1].length;
      achados.push([ini, ini + m[2].length]);
      de = ini + m[2].length;
    }
    return achados;
  }
  function ctFrase(c, k, modo) {
    const f = c.frases[k][0];
    const a = ctAchar(f, c.p);
    if (!a.length) return esc(f);
    if (modo === 'vao') return `${esc(f.slice(0, a[0][0]))}<span class="qr-vao ct-vao" aria-label="lacuna">&nbsp;</span>${esc(f.slice(a[a.length - 1][1]))}`;
    let out = '';
    let de = 0;
    for (const [i, j] of a) {
      out += `${esc(f.slice(de, i))}<mark>${esc(f.slice(i, j))}</mark>`;
      de = j;
    }
    return out + esc(f.slice(de));
  }
  const ctAlvoNaFrase = (c, k) => {
    const f = c.frases[k][0];
    const a = ctAchar(f, c.p);
    return a.length ? f.slice(a[0][0], a[a.length - 1][1]) : c.p;
  };
  const ctVoz = (c) => (c.lang === 'es' ? 'es-ES' : 'en-US');

  /* ---- Começar, encerrar ------------------------------------------------------------ */
  function ctEstudar(o = {}) {
    let ids = o.ids;
    const b = o.baralho || 'tudo';
    if (!ids) ids = CT_FILA.filter((id) => ctNoBaralho(ctCarta(id), b) && ctCarta(id).est !== 'suspensa');
    if (o.n) {
      /* a pilha de exemplo tem 26 cartões: para um recorte maior, ela repete */
      const base = ids.slice();
      while (ids.length < o.n && base.length) ids = ids.concat(base);
      ids = ids.slice(0, o.n);
    }
    if (!ids.length) return toast('Nada vence aqui hoje.');
    const rotulo = o.rotulo || (o.livre ? 'Estudo livre · fora da agenda' : b === 'tudo' ? 'Hoje · tudo' : `Hoje · ${ctNomeDoBaralho(b) || ctBaralho(b).nome}`);
    ctR = { fila: ids.slice(), total: ids.length, feitos: 0, hist: [], mostrando: false, k: 0, erradas: [], seguidas: 0, melhor: 0, t0: performance.now(), notas: { e: 0, d: 0, b: 0, f: 0 }, pend: 0, rotulo, livre: !!o.livre, inteiro: !o.ids && !o.n && b === 'tudo', tentativa: '', verificado: false, certo: false, avisado: new Set(), aviso: null, novas: 0, formadas: 0, fim: false, seg: 0 };
    ctNovoCartao();
    mostrar('estudo', { origem: o.origem || 'clique' });
  }
  function ctNovoCartao() {
    const R = ctR;
    const c = ctAtual();
    Object.assign(R, { mostrando: false, tentativa: '', verificado: false, certo: false });
    if (!c) return;
    R.vistos ??= {};
    /* "Alternar a frase a cada revisão": cada vez que a palavra volta, a frase seguinte. */
    R.k = CT_AJ.alternar ? (R.vistos[c.id] || 0) % c.frases.length : 0;
    R.vistos[c.id] = (R.vistos[c.id] || 0) + 1;
    if (ctFormato() === 'escolher') {
      const outras = CT_CARTOES.filter((x) => x.lang === c.lang && x.id !== c.id).map((x) => x.p);
      /* embaralhamento fixo por cartão: o desenho não muda entre uma visita e outra */
      const semente = [...c.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
      const tres = [0, 1, 2].map((i) => outras[(semente * (i + 3) + i * 7) % outras.length]).filter((v, i, l) => l.indexOf(v) === i);
      while (tres.length < 3) tres.push(outras.find((x) => !tres.includes(x)));
      R.alternativas = tres.slice();
      R.alternativas.splice(semente % 4, 0, c.p);
    }
  }
  const ctFormato = () => CT_AJ.formato;
  function ctContadores() {
    const n = [0, 0, 0];
    for (const id of ctR.fila) {
      const c = ctCarta(id);
      n[ctR.erradas.includes(id) || c.est === 'aprendendo' ? 1 : c.est === 'nova' ? 0 : 2]++;
    }
    return n;
  }
  const ctTempoDaSessao = () => {
    const s = ctR.seg || Math.round((performance.now() - ctR.t0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  function ctSairDaRevisao() {
    const R = ctR;
    if (R?.fim && R.inteiro) CT.hoje = 'feito';
    ctR = null;
    if (temVoz) speechSynthesis.cancel();
    abaDe.cartoes = 0;
    mostrar('cartoes', { origem: 'clique' });
    sincronizarBarraCt?.();
  }

  /* ---- O cartão --------------------------------------------------------------------- */
  const ctTecla = (t) => `<kbd data-precisa="teclado">${t}</kbd>`;
  function ctOrigemDaFrase(c, k, verso) {
    const [, , s, quem, tempo] = c.frases[k];
    const sess = CT_SESSOES[s];
    const onde = sess ? `${sess[0]}${tempo ? ' · ' + tempo : ''}` : ctNomeDoBaralho(s);
    return `<div class="ct-origem">
      <span class="ct-onde">${ica(sess ? sess[1] : s === 'trilha' ? 'graduation-cap' : 'wallet-cards')}<span>${esc(onde)}</span></span>
      <div class="q-acoes">
        ${quem ? `<button type="button" class="q-chip ct-som" data-ct="rev-original" title="A fala gravada da sessão">${ica('audio-lines')}<span class="ct-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Fala original<span class="ct-longo"> · ${esc(quem)}</span></span>${ctTecla('R')}</button>` : `<span class="q-chip ct-sem-fala" title="${s.startsWith('a-') ? 'O áudio do Anki não vem na importação' : 'Esta origem não tem gravação'}">${ica('mic-off')}<span>Sem fala gravada</span></span>`}
        <button type="button" class="q-chip ct-som" data-ct="rev-voz" title="A voz do aparelho">${ica('volume-2')}<span>Voz</span>${ctTecla('V')}</button>
        ${c.frases.length > 1 ? `<button type="button" class="q-chip" data-ct="rev-frase" title="A mesma palavra em outra sessão">${ica('repeat')}<span><span class="ct-longo">Outra frase · </span>${k + 1} de ${c.frases.length}</span>${ctTecla('N')}</button>` : ''}
        ${verso && sess ? `<button type="button" class="q-chip ct-so-pc" data-ct="rev-sessao">${ica('external-link')}<span>Abrir na sessão</span></button>` : ''}
      </div></div>`;
  }
  /* O quadro do vídeo no momento da fala. No protótipo é um desenho: a imagem de verdade depende de
     guardar o quadro (decisão do dono). */
  const ctQuadro = (c, k) =>
    c.img
      ? `<figure class="ct-quadro" aria-label="Quadro do vídeo no momento da fala"><svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" rx="14" fill="var(--surface-sunken)"/><rect x="0" y="118" width="320" height="62" fill="color-mix(in srgb, var(--q-acento) 14%, var(--surface-sunken))"/><circle cx="112" cy="74" r="28" fill="color-mix(in srgb, var(--q-acento) 46%, var(--surface))"/><path d="M62 180c4-44 26-66 50-66s46 22 50 66z" fill="color-mix(in srgb, var(--q-acento) 46%, var(--surface))"/><rect x="196" y="34" width="96" height="66" rx="8" fill="var(--surface)" stroke="var(--border-subtle)" stroke-width="2"/><path d="M208 52h60M208 66h72M208 80h44" stroke="var(--ink-muted)" stroke-width="4" stroke-linecap="round"/></svg><figcaption>${ica('image')} quadro do vídeo · ${c.frases[k][4]}</figcaption></figure>`
      : '';
  function ctNotas(c) {
    const quatro = CT_AJ.botoes === 4;
    const l = quatro ? [['e', 'Errei', c.iv[0], '1'], ['d', 'Difícil', c.iv[1], '2'], ['b', 'Bom', c.iv[2], '3'], ['f', 'Fácil', c.iv[3], '4']] : [['e', 'Esqueci', c.iv[0], '1'], ['b', 'Lembrei', c.iv[2], '2']];
    return `<div class="fsrs" role="group" aria-label="Quão fácil foi lembrar" style="--n:${l.length}">${l.map(([k, r, iv, t]) => `<button type="button" class="${k}" data-ct-nota="${k}">${r}<small>${iv || '—'}</small>${ctTecla(t)}</button>`).join('')}</div>
      <p class="ct-gestos">${ica('hand')} Deslize o cartão: para a esquerda, ${quatro ? 'Errei' : 'Esqueci'}; para a direita, ${quatro ? 'Bom' : 'Lembrei'}.</p>`;
  }
  function ctResultado(texto) {
    const R = ctR;
    return `<div class="resp qr-resultado" data-certo="${R.certo}"><p class="qr-veredito ${R.certo ? 'certo' : 'errado'}" role="status">${ica(R.certo ? 'circle-check' : 'circle-x')}<span>${texto}</span></p>
      <p class="ct-consequencia">${R.certo ? `Conta como “${CT_AJ.botoes === 4 ? 'Bom' : 'Lembrei'}”: volta em ${ctAtual().iv[2] || '1 d'}.` : 'Conta como esquecida: volta ainda nesta sessão.'}</p>
      <button type="button" class="q-ctl pri qr-principal" data-ct="rev-avancar">Avançar ${ica('arrow-right')}${ctTecla('Espaço')}</button></div>`;
  }
  function ctMioloDoCartao(c) {
    const R = ctR;
    const k = R.k;
    const f = ctFormato();
    const frase = (modo) => `<div class="ct-frase"><p class="exemplo" lang="${c.lang}">“${ctFrase(c, k, modo)}”</p>`;
    if (f === 'lacuna') {
      const alvo = ctAlvoNaFrase(c, k);
      return `<div class="qr-producao"><span class="q-rotulo">Escreva de memória a palavra que falta</span>
          <p class="qr-frase" lang="${c.lang}">“${ctFrase(c, k, 'vao')}”</p>
          <p class="q-texto">Quer dizer: <b>${esc(c.t)}</b></p>
          ${
            R.verificado
              ? `<div class="qr-diff" aria-label="Sua resposta comparada com a certa">${ctDiff(R.tentativa, alvo)}</div>${ctResultado(R.certo ? `Certo: “${esc(alvo)}”.` : `Era “${esc(alvo)}”${R.tentativa ? ` (você escreveu “${esc(R.tentativa)}”)` : ''}.`)}`
              : `<label class="q-campo"><span>A palavra em ${c.lang === 'en' ? 'inglês' : 'espanhol'}</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Digite a palavra…" data-ct-campo="tentativa" lang="${c.lang}"></label>
                <div class="q-acoes"><button type="button" class="q-ctl pri qr-principal" data-ct="rev-verificar" disabled>${ica('check')} Verificar</button><button type="button" class="q-ctl" data-ct="rev-nao-sei">Não sei</button></div>`
          }</div>`;
    }
    if (f === 'escolher')
      return `<div class="qr-lacuna" lang="${c.lang}"><div>“${ctFrase(c, k, 'vao')}”</div></div><p class="exemplo">${esc(c.t)}</p>
        ${R.verificado ? ctResultado(R.certo ? 'Correto!' : `Incorreto. Você selecionou “${esc(R.tentativa)}”. A resposta correta era “${esc(c.p)}”.`) : `<div class="qr-opcoes" role="group" aria-label="Qual palavra completa a frase">${R.alternativas.map((o, i) => `<button type="button" class="qr-opcao" data-ct-opcao="${esc(o)}" lang="${c.lang}">${esc(o)}${ctTecla(i + 1)}</button>`).join('')}</div>`}`;
    const topo = `${ctQuadro(c, k)}<div class="termo" lang="${c.lang}">${esc(c.p)}</div><p class="ct-ipa tn">${c.ipa}</p>${frase('marca')}${ctOrigemDaFrase(c, k, R.mostrando || R.verificado)}</div>`;
    if (f === 'digitar')
      return `${topo}${
        R.verificado
          ? ctResultado(R.certo ? `Correto! A tradução era “${esc(c.t)}”.` : `Incorreto. A tradução era “${esc(c.t)}”${R.tentativa ? ` (você escreveu “${esc(R.tentativa)}”)` : ''}.`)
          : `<div class="resp qr-sem-linha qr-digitar"><label class="q-campo"><span>Digite a tradução</span><input type="text" autocomplete="off" autocapitalize="off" placeholder="Digite a tradução…" data-ct-campo="tentativa"></label>
              <button type="button" class="q-ctl pri qr-principal" data-ct="rev-verificar" disabled>${ica('check')} Verificar</button></div>`
      }`;
    /* LEMBRAR: a palavra e a frase; a tradução só depois. */
    return `${topo}${
      R.mostrando
        ? `<div class="resp"><b>${esc(c.t)}</b><p class="ct-trad-da-frase">“${esc(c.frases[k][1])}”</p>${ctNotas(c)}</div>`
        : `<div class="resp qr-sem-linha"><button type="button" class="q-ctl pri qr-principal" data-ct="rev-mostrar">${ica('eye')} Mostrar resposta</button><p class="qr-atalho" data-precisa="teclado">ou aperte <kbd>Espaço</kbd></p><p class="ct-gestos">${ica('hand')} Ou toque no cartão.</p></div>`
    }`;
  }
  /* A diferença letra a letra (o `qr-diff` da produção ativa). */
  function ctDiff(dita, certa) {
    const a = dita.trim().toLowerCase();
    const b = certa.toLowerCase();
    let out = '';
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) out += `<span class="igual">${esc(b[i])}</span>`;
      else if (b[i] == null) out += `<span class="sobra">${esc(a[i])}</span>`;
      else out += `<span class="falta">${esc(b[i] === ' ' ? '␣' : b[i])}</span>`;
    }
    return out;
  }
  function ctHtmlDaRodada() {
    const R = ctR;
    if (!R) return '<div class="q-palco q-revisao"></div>';
    if (R.fim) return ctHtmlDoFim();
    const c = ctAtual();
    const f = ctFormato();
    const n = ctContadores();
    const dica = { lembrar: 'Tente lembrar a tradução antes de mostrar a resposta. Depois diga como foi.', digitar: 'Escreva a tradução da palavra e confira.', escolher: 'Escolha a palavra que completa a frase.', lacuna: 'Escreva de memória a palavra que falta na frase.' }[f];
    const pele = `pele-padrao ${c.est === 'nova' ? 'cartao-nova' : 'cartao-aprendida'}`;
    const eraErrada = R.erradas.includes(c.id);
    const selo = `${c.nv} · ${ctNomeDoBaralho(c.b)}`;
    const offline = PL.offline;
    const av = R.aviso && ctCarta(R.aviso);
    return `<div class="q-palco q-revisao ct-rev" data-testid="revisao-no-quest" data-estado="rodada" data-formato="${f}">
      <header class="q-cab qr-topo"><button type="button" class="q-ctl q-voltar" aria-label="Voltar para ${ctNome()}" data-ct="rev-voltar">${ica('arrow-left')}</button>
        <div class="qr-progresso"><span class="q-rotulo">${esc(R.rotulo)}</span><span class="q-barra" role="progressbar" aria-label="Progresso da sessão" aria-valuenow="${R.feitos}" aria-valuemin="0" aria-valuemax="${R.total}"><span style="width:${(R.feitos / Math.max(1, R.total)) * 100}%"></span></span><span class="qr-conta">${Math.min(R.feitos + 1, R.total)} / ${R.total}</span></div>
        <span class="ct-contadores" title="O que falta nesta sessão">${ctTres(n)}</span>
        <button type="button" class="q-ctl qr-botao-opcoes" aria-label="Ajustes da memória" data-ct="ajustes">${ica('settings-2')} Opções</button>
        <button type="button" class="q-ctl" data-ct="rev-encerrar">${ica('x')} Encerrar</button></header>
      <h1 class="sr">Revisão: ${esc(R.rotulo)}</h1>
      <p class="q-texto qr-dica">${dica}${R.seguidas >= 3 ? `<span class="q-tag ct-combo">${ica('flame')} ${R.seguidas} seguidas</span>` : ''}</p>
      ${offline || R.pend ? `<div class="q-aviso ct-sem-rede" role="status"><span class="qv-aviso-texto">${ica('wifi-off')}<span><b>Sem rede.</b> ${R.pend ? `${R.pend} ${R.pend === 1 ? 'nota guardada' : 'notas guardadas'} neste aparelho: sobem sozinhas quando a internet voltar.` : 'Pode estudar: as notas ficam guardadas neste aparelho e sobem quando a internet voltar.'}</span></span><button type="button" class="q-ctl" data-ct="rev-sincronizar">${ica('refresh-cw')} Tentar agora</button></div>` : ''}
      ${av ? `<div class="q-aviso ct-aviso-dif" role="status"><span class="qv-aviso-texto">${ica('triangle-alert')}<span><b>“${esc(av.p)}” já escapou ${av.lapsos} vezes.</b> Costuma ser o cartão, não você. Ela volta ainda nesta sessão; se quiser, mude algo agora.</span></span><div class="q-acoes"><button type="button" class="q-ctl" data-ct="dif-editar">${ica('pencil')} Editar</button><button type="button" class="q-ctl" data-ct="dif-frase" ${av.frases.length > 1 ? '' : 'disabled'}>${ica('repeat')} Trocar a frase</button><button type="button" class="q-ctl" data-ct="dif-suspender">${ica('pause')} Suspender</button><button type="button" class="q-ctl" aria-label="Dispensar o aviso" data-ct="dif-fechar">${ica('x')}</button></div></div>` : ''}
      <section class="q-cartao qr-cartao flash ${pele}" aria-label="Cartão" data-ct-carta="${c.id}">
        <span class="ct-selos"><span class="q-tag off qr-selo">${esc(selo)}</span>${c.est === 'nova' && !eraErrada ? '<span class="q-tag ct-nv">nova</span>' : ''}${eraErrada ? '<span class="q-tag ct-ap">de novo</span>' : ''}${ctDificil(c) ? `<span class="q-tag ct-dif">${ica('triangle-alert')} difícil</span>` : ''}${c.band ? `<span class="q-tag ct-band">${ica('flag')} bandeira</span>` : ''}</span>
        <i class="ct-carimbo e" aria-hidden="true">${CT_AJ.botoes === 4 ? 'Errei' : 'Esqueci'}</i><i class="ct-carimbo b" aria-hidden="true">${CT_AJ.botoes === 4 ? 'Bom' : 'Lembrei'}</i>
        ${ctMioloDoCartao(c)}
      </section>
      <div class="q-faixa ct-faixa-rev" role="toolbar" aria-label="Ações do cartão">
        <button type="button" class="q-ctl" data-ct="rev-desfazer" ${R.hist.length ? '' : 'disabled'}>${ica('undo-2')} Desfazer${ctTecla('Z')}</button>
        <span class="q-espaco"></span>
        <button type="button" class="q-ctl" aria-pressed="${!!c.band}" data-ct="rev-bandeira">${ica('flag')} <span class="ct-so-pc-txt">Bandeira</span>${ctTecla('B')}</button>
        <button type="button" class="q-ctl ct-so-pc" data-ct="rev-editar">${ica('pencil')} Editar${ctTecla('E')}</button>
        <button type="button" class="q-ctl ct-so-pc" data-ct="rev-enterrar" title="Fica para amanhã, sem contar como erro">${ica('moon')} Enterrar${ctTecla('-')}</button>
        <button type="button" class="q-ctl ct-so-pc" data-ct="rev-suspender">${ica('pause')} Suspender${ctTecla('S')}</button>
        <button type="button" class="q-ctl" aria-label="Mais ações do cartão" data-ct="rev-mais">${ica('ellipsis')}<span class="ct-so-cel-txt">Ações</span></button>
      </div>
    </div>`;
  }
  Object.defineProperty(D.telas, 'estudo', { get: ctHtmlDaRodada });

  /* ---- Pintar: a tela inteira é refeita; só o cartão se move ------------------------- */
  function ctPintarRodada(como, dir = 1) {
    if (atual !== 'estudo' || !ctR) return;
    const antes = parseFloat($('.qr-progresso .q-barra > span', tela)?.style.width) || 0;
    const foco = document.activeElement?.dataset?.ctCampo === 'tentativa';
    tela.innerHTML = ctHtmlDaRodada();
    ctArmarCartao();
    const barraP = $('.qr-progresso .q-barra > span', tela);
    const mexe = polido() && !reduz() && como !== 'seco';
    if (barraP && mexe) anima(barraP, [{ width: antes + '%' }, { width: barraP.style.width }], { d: 520, e: MOLA_SUAVE });
    if (foco) $('[data-ct-campo="tentativa"]', tela)?.focus();
    else if (!celular() && ctR && !ctR.fim) $('[data-ct-campo="tentativa"]', tela)?.focus({ preventScroll: true });
    if (ctR.fim) return ctEntradaDoFim();
    if (!mexe) return;
    const cartao = $('.qr-cartao', tela);
    if (como === 'proximo' || como === 'voltar') {
      anima(cartao, [{ opacity: 0, transform: `translateX(${70 * dir}px) scale(0.97)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' }], { d: 520, e: MOLA_SUAVE });
      $$('.termo, .ct-ipa, .ct-frase, .qr-lacuna, .qr-producao > *, .resp, .ct-quadro, .qr-cartao > .exemplo', cartao).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380, atraso: 90 + i * 40 }));
      const combo = $('.ct-combo', tela);
      if (combo && ctR.seguidas % 3 === 0) anima(combo, [{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
    } else if (como === 'resposta') {
      const r = $('.resp', cartao);
      const h1 = cartao.offsetHeight;
      anima(r, [{ opacity: 0, transform: 'translateY(-10px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420 });
      $$('.fsrs button, .qr-principal', r).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px) scale(0.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 460, atraso: 120 + i * 55, e: MOLA_SUAVE }));
      void h1;
    } else if (como === 'frase') {
      const fz = $('.ct-frase', cartao);
      if (fz) anima(fz, [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 380 });
    } else if (como === 'aviso') {
      const a = $('.ct-aviso-dif, .ct-sem-rede', tela);
      if (a) anima(a, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420 });
    }
  }
  aoMostrar.estudo = () => {
    casca.classList.add('ct-em-estudo');
    ctArmarCartao();
    if (ctR?.fim) ctEntradaDoFim();
    else if (!celular()) $('[data-ct-campo="tentativa"]', tela)?.focus({ preventScroll: true });
    ctNavDepois?.();
  };
  aoSair.estudo = () => {
    casca.classList.remove('ct-em-estudo');
    if (temVoz) speechSynthesis.cancel();
  };

  /* ---- Ações da rodada --------------------------------------------------------------- */
  function ctFoto() {
    const R = ctR;
    const c = ctAtual();
    return { fila: R.fila.slice(), feitos: R.feitos, erradas: R.erradas.slice(), seguidas: R.seguidas, melhor: R.melhor, notas: { ...R.notas }, pend: R.pend, k: R.k, novas: R.novas, formadas: R.formadas, id: c.id, lapsos: c.lapsos, est: c.est, aviso: R.aviso };
  }
  function ctMostrar() {
    const R = ctR;
    if (!R || R.mostrando || ctFormato() !== 'lembrar') return;
    R.mostrando = true;
    sentir('vira');
    ctPintarRodada('resposta');
    const c = ctAtual();
    if (CT_AJ.original && c.frases[R.k][3]) ctOuvirNaRodada('original');
    else if (CT_AJ.ouvir) ctOuvirNaRodada('voz', true);
  }
  function ctOuvirNaRodada(qual, soPalavra) {
    const c = ctAtual();
    if (!c) return;
    const f = c.frases[ctR.k];
    const original = qual === 'original' && f[3];
    const b = $(`[data-ct="${original ? 'rev-original' : 'rev-voz'}"]`, tela);
    const frase = $('.ct-frase .exemplo', tela);
    $$('.ct-tocando', tela).forEach((x) => x.classList.remove('ct-tocando'));
    b?.classList.add('ct-tocando');
    if (original) frase?.classList.add('ct-tocando');
    const vez = (ctR.vezDoSom = (ctR.vezDoSom || 0) + 1);
    const fim = () => ctR && ctR.vezDoSom === vez && $$('.ct-tocando', tela).forEach((x) => x.classList.remove('ct-tocando'));
    dizer(original ? f[0] : soPalavra ? c.p : c.p, { lang: ctVoz(c) }).then(fim);
    setTimeout(fim, (original ? 3400 : 1400) * K());
  }
  async function ctDarNota(k, origem) {
    const R = ctR;
    const c = ctAtual();
    if (!R || !c || R.saindo) return;
    R.hist.push(ctFoto());
    if (R.hist.length > 30) R.hist.shift();
    R.notas[k]++;
    R.aviso = null;
    const id = R.fila.shift();
    if (k === 'e') {
      /* Quem erra revê na mesma sessão: um passo de 10 min (aqui, alguns cartões adiante) ou o fim da fila. */
      c.lapsos++;
      if (!R.erradas.includes(id)) R.erradas.push(id);
      R.fila.splice(CT_AJ.passos === 'fim' ? R.fila.length : Math.min(R.fila.length, 4), 0, id);
      R.seguidas = 0;
      if (ctDificil(c) && !R.avisado.has(id)) (R.aviso = id), R.avisado.add(id);
      sentir('desliga');
    } else {
      R.feitos++;
      R.seguidas++;
      R.melhor = Math.max(R.melhor, R.seguidas);
      if (c.est === 'nova') (c.est = 'aprendendo'), R.novas++;
      else if (c.est === 'aprendendo' && k !== 'd') (c.est = 'revisao'), R.formadas++;
      sentir(k === 'd' ? 'aba' : 'liga');
    }
    if (PL.offline) R.pend++;
    const dir = k === 'e' ? -1 : 1;
    const cartao = $('.qr-cartao', tela);
    if (origem?.isConnected && polido() && !reduz()) flutuar(origem, k === 'e' ? 'volta nesta sessão' : `volta em ${c.iv[{ d: 1, b: 2, f: 3 }[k]] || '1 d'}`, k === 'e' ? 'erro' : 'good');
    if (cartao && polido() && !reduz()) {
      R.saindo = true;
      await anima(cartao, [{ opacity: 0, transform: `translateX(${-90 * -dir}px) rotate(${4 * dir}deg) scale(0.96)`, filter: 'blur(4px)' }], { d: 190, e: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      R.saindo = false;
    }
    if (ctR !== R) return;
    if (!R.fila.length) return ctFechar();
    ctNovoCartao();
    ctPintarRodada('proximo', 1);
    if (R.aviso) {
      const a = $('.ct-aviso-dif', tela);
      if (a && polido() && !reduz()) anima(a, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 460, e: MOLA_SUAVE });
      sentir('aviso');
    }
  }
  function ctDesfazer() {
    const R = ctR;
    const h = R?.hist.pop();
    if (!h) return;
    const c = ctCarta(h.id);
    c.lapsos = h.lapsos;
    c.est = h.est;
    Object.assign(R, { fila: h.fila, feitos: h.feitos, erradas: h.erradas, seguidas: h.seguidas, melhor: h.melhor, notas: h.notas, pend: h.pend, novas: h.novas, formadas: h.formadas, aviso: h.aviso, fim: false, mostrando: false, tentativa: '', verificado: false, certo: false, k: h.k });
    if (h.tirou) Object.assign(c, h.tirou);
    sentir('fecha');
    ctPintarRodada('voltar', -1);
    toast(`Desfeito: “${c.p}” voltou sem a nota.`, 2200);
  }
  function ctVerificar(resposta) {
    const R = ctR;
    const c = ctAtual();
    const f = ctFormato();
    R.tentativa = (resposta ?? R.tentativa).trim();
    const limpa = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim();
    const dita = limpa(R.tentativa);
    if (f === 'escolher') R.certo = R.tentativa === c.p;
    else if (f === 'digitar') R.certo = !!dita && c.t.split(/[,;]/).some((t) => limpa(t) === dita || (dita.length > 3 && limpa(t).includes(dita)));
    else R.certo = !!dita && (dita === limpa(ctAlvoNaFrase(c, R.k)) || dita === limpa(c.p));
    R.verificado = true;
    sentir(R.certo ? 'acerto' : 'desliga');
    ctPintarRodada('resposta');
    if (R.certo && polido() && !reduz()) rajada(...centro($('.qr-veredito svg', tela)), 12, 0.8);
  }
  function ctTirar(como) {
    /* enterrar (fica para amanhã) e suspender tiram o cartão da sessão; o Desfazer devolve. */
    const R = ctR;
    const c = ctAtual();
    if (!R || !c) return;
    const foto = ctFoto();
    foto.tirou = { est: c.est };
    R.hist.push(foto);
    R.fila = R.fila.filter((id) => id !== c.id);
    R.total = Math.max(R.feitos, R.total - 1);
    R.aviso = R.aviso === c.id ? null : R.aviso;
    if (como === 'suspender') c.est = 'suspensa';
    sentir('fecha');
    toast(como === 'suspender' ? `“${c.p}” suspensa: não aparece na revisão até você reativar. Z desfaz.` : `“${c.p}” fica para amanhã, sem contar como erro. Z desfaz.`);
    if (!R.fila.length) return ctFechar();
    ctNovoCartao();
    ctPintarRodada('proximo', 1);
  }
  function ctFechar() {
    const R = ctR;
    R.fim = true;
    R.seg = Math.max(R.seg, Math.round((performance.now() - R.t0) / 1000));
    ctPintarRodada('fim');
  }
  function ctInfoDoCartao(gatilho) {
    const c = ctAtual();
    const linhas = c.est === 'nova' && !ctR.erradas.includes(c.id) ? [] : [['3 out', 'Bom', '2 d'], ['28 set', 'Errei', '< 10 min'], ['28 set', 'Bom', '1 d'], ['24 set', 'Difícil', '1 d'], ['21 set', 'primeira vez', '—']].slice(0, Math.max(2, Math.min(5, c.lapsos + 2)));
    ctAbrir(
      'ct:info',
      ctDlg('info', 'Informações do cartão', esc(`${c.p} · ${c.t}`), `<dl class="q-medidas duas">${[['Estado', CT_ESTADO[c.est][0]], ['Baralho', ctNomeDoBaralho(c.b)], ['Estabilidade', c.estab ? String(c.estab).replace('.', ',') + ' dias' : '—'], ['Dificuldade', c.dif ? String(c.dif).replace('.', ',') + ' de 10' : '—'], ['Erros', c.lapsos], ['Acertos', c.acertos || '—'], ['Frases', c.frases.length], ['Etiquetas', c.tags.map((t) => '#' + t).join(' ') || '—']].map(([k, v]) => `<div class="q-medida"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${linhas.length ? `<div class="q-tabela-caixa"><table class="q-tabela"><thead><tr><th>Quando</th><th>Resposta</th><th>Intervalo dado</th></tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="q-texto">Palavra nova: ainda não tem histórico.</p>'}`, `<button type="button" class="q-ctl pri">${ica('check')} Fechar</button>`),
      gatilho,
    );
  }
  function ctMaisAcoes() {
    const c = ctAtual();
    const temSessao = !!CT_SESSOES[c.frases[ctR.k][2]];
    const d = folhaDeBaixo(
      `<p class="folha-pal" lang="${c.lang}">${esc(c.p)}</p><p class="folha-glosa">${ctR.mostrando || ctR.verificado ? esc(c.t) : 'Ações deste cartão'}</p>
       <div class="folha-grade">
         <button type="button" class="folha-acao" data-a="rev-editar">${ica('pencil')} Editar</button>
         <button type="button" class="folha-acao" data-a="rev-enterrar">${ica('moon')} Enterrar até amanhã</button>
         <button type="button" class="folha-acao" data-a="rev-suspender">${ica('pause')} Suspender</button>
         <button type="button" class="folha-acao" data-a="rev-info">${ica('info')} Informações</button>
         <button type="button" class="folha-acao" data-a="rev-sessao" ${temSessao ? '' : 'disabled'}>${ica('external-link')} Abrir na sessão</button>
         <button type="button" class="folha-acao" data-a="pronuncia">${ica('mic')} Praticar pronúncia</button>
         <button type="button" class="folha-acao" data-a="tutor">${ica('message-circle')} Perguntar ao tutor</button>
         <button type="button" class="folha-acao" data-a="atalhos">${ica('keyboard')} Atalhos e gestos</button>
       </div>`,
      'folha-da-palavra ct-folha-acoes',
    );
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      fecharFolhaDeBaixo();
      setTimeout(() => ctAcaoDaRodada(b.dataset.a, null), 240 * K());
    });
  }
  function ctAcaoDaRodada(a, b) {
    const R = ctR;
    if (!R) return false;
    const c = ctAtual();
    switch (a) {
      case 'rev-voltar':
      case 'rev-encerrar':
      case 'fim-voltar':
        return ctSairDaRevisao(), true;
      case 'rev-mostrar':
        return ctMostrar(), true;
      case 'rev-desfazer':
        return ctDesfazer(), true;
      case 'rev-original':
        return ctOuvirNaRodada('original'), true;
      case 'rev-voz':
        return ctOuvirNaRodada('voz'), true;
      case 'rev-frase':
        R.k = (R.k + 1) % c.frases.length;
        sentir('aba');
        return ctPintarRodada('frase'), true;
      case 'rev-sessao':
        return ctAbrirSessao(c.frases[R.k][2]), true;
      case 'rev-bandeira':
        c.band = !c.band;
        sentir(c.band ? 'liga' : 'desliga');
        ctPintarRodada('seco');
        if (c.band && polido() && !reduz()) anima($('.ct-band', tela), [{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
        return true;
      case 'rev-editar':
        return ctAbrirPalavra(c.id, { editar: true, gatilho: b }), true;
      case 'rev-enterrar':
        return ctTirar('enterrar'), true;
      case 'rev-suspender':
        return ctTirar('suspender'), true;
      case 'rev-info':
        return ctInfoDoCartao(b), true;
      case 'rev-mais':
        return ctMaisAcoes(), true;
      case 'rev-verificar':
        return ctVerificar(), true;
      case 'rev-nao-sei':
        return ctVerificar(''), true;
      case 'rev-avancar':
        return ctDarNota(R.certo ? 'b' : 'e', b), true;
      case 'rev-sincronizar':
        if (PL.offline) return toast('Ainda sem rede. As notas continuam guardadas neste aparelho.'), true;
        R.pend = 0;
        return ctPintarRodada('seco'), toast('Notas enviadas. A agenda está em dia.'), true;
      case 'ajustes':
        return ctAbrirAjustes(b), true;
      case 'pronuncia':
        return toast('No app, aqui abre a sombra da fala: você repete e vê a nota de pronúncia.'), true;
      case 'tutor':
        return toast('No app, o tutor abre já com esta palavra e a frase de onde ela veio.'), true;
      case 'atalhos':
        return ctAbrirAtalhos(b, 'revisao'), true;
      case 'dif-editar':
        return ctAbrirPalavra(R.aviso, { editar: true, gatilho: b }), true;
      case 'dif-frase': {
        const x = ctCarta(R.aviso);
        x.frases.push(x.frases.shift());
        R.aviso = null;
        return ctPintarRodada('seco'), toast(`“${x.p}” passa a usar outra frase: “${x.frases[0][0]}”`, 4200), true;
      }
      case 'dif-suspender': {
        const x = ctCarta(R.aviso);
        x.est = 'suspensa';
        R.fila = R.fila.filter((id) => id !== x.id);
        R.total = Math.max(R.feitos, R.total - 1);
        R.aviso = null;
        toast(`“${x.p}” suspensa. Ela fica em ${ctNome()} › Baralhos › Suspensas.`);
        return R.fila.length ? (ctPintarRodada('seco'), true) : (ctFechar(), true);
      }
      case 'dif-fechar':
        R.aviso = null;
        return ctPintarRodada('seco'), true;
      case 'fim-jogo':
        return ir('jogo'), toast(`No app, a Memória abre com as ${R.erradas.length || R.total} palavras ${R.erradas.length ? 'que você errou' : 'da sessão'}.`), true;
      case 'fim-jogar-todas':
        return ir('jogar'), toast('No app, os jogos abrem com as palavras desta sessão.'), true;
      case 'fim-memoria':
        ctR = null;
        if (R.inteiro) CT.hoje = 'feito';
        return mostrar('cartoes', { aba: 4, origem: 'clique' }), sincronizarBarraCt?.(), true;
      case 'fim-desfazer':
        return ctDesfazer(), true;
    }
    return false;
  }
  ganchos.unshift((e, b) => {
    if (atual !== 'estudo') return false;
    const d = b.dataset;
    if (d.ctNota) return ctDarNota(d.ctNota, b), true;
    if (d.ctOpcao) return ctVerificar(d.ctOpcao), true;
    if (d.ct) return ctAcaoDaRodada(d.ct, b), true;
    return true;
  });
  tela.addEventListener('input', (e) => {
    if (atual !== 'estudo' || e.target.dataset?.ctCampo !== 'tentativa' || !ctR) return;
    ctR.tentativa = e.target.value;
    const v = $('[data-ct="rev-verificar"]', tela);
    if (v) v.disabled = !e.target.value.trim();
  });

  /* ---- Teclado: os atalhos da revisão (visíveis nos botões) --------------------------- */
  document.addEventListener('keydown', (e) => {
    if (atual !== 'estudo' || !ctR || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('dialog[open]') || folha || document.body.classList.contains('ct-mapa-aberto')) return;
    const R = ctR;
    const campo = e.target.matches?.('input, textarea, select');
    const f = ctFormato();
    if (campo) {
      if (e.key === 'Enter' && e.target.dataset.ctCampo === 'tentativa' && e.target.value.trim()) e.preventDefault(), ctVerificar();
      return;
    }
    const k = e.key.toLowerCase();
    const faz = (fn) => (e.preventDefault(), fn());
    if (R.fim) {
      if (k === 'z') faz(ctDesfazer);
      return;
    }
    if (k === ' ' || k === 'enter') {
      if (e.target.closest?.('button') && k === 'enter') return;
      if (R.verificado) return faz(() => ctDarNota(R.certo ? 'b' : 'e', $('.qr-principal', tela)));
      if (f === 'lembrar') return faz(() => (R.mostrando ? ctDarNota('b', $('.fsrs .b', tela)) : ctMostrar()));
      return;
    }
    if (/^[1-4]$/.test(k)) {
      if (f === 'escolher' && !R.verificado) return faz(() => R.alternativas[+k - 1] && ctVerificar(R.alternativas[+k - 1]));
      if (f === 'lembrar' && R.mostrando) {
        const nota = CT_AJ.botoes === 4 ? 'edbf'[+k - 1] : { 1: 'e', 2: 'b' }[k];
        if (nota) return faz(() => ctDarNota(nota, $(`.fsrs .${nota}`, tela)));
      }
      return;
    }
    const acoes = { z: 'rev-desfazer', r: 'rev-original', v: 'rev-voz', n: 'rev-frase', b: 'rev-bandeira', e: 'rev-editar', '-': 'rev-enterrar', s: 'rev-suspender', i: 'rev-info' };
    if (acoes[k]) {
      if (k === 'n' && ctAtual().frases.length < 2) return;
      if (k === 'r' && !ctAtual().frases[R.k][3]) return faz(() => ctOuvirNaRodada('voz'));
      faz(() => ctAcaoDaRodada(acoes[k], null));
    }
  });

  /* ---- Gestos: tocar vira, arrastar dá a nota, segurar abre as ações ------------------- */
  function ctArmarCartao() {
    const cartao = $('.qr-cartao', tela);
    if (!cartao || !ctR || ctR.fim) return;
    let a = null;
    let seg = 0;
    const pode = () => ctFormato() === 'lembrar';
    const selos = { e: $('.ct-carimbo.e', cartao), b: $('.ct-carimbo.b', cartao) };
    const por = (dx) => {
      cartao.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 26}deg)` : '';
      const forca = Math.min(1, Math.abs(dx) / 110);
      selos.e.style.opacity = dx < 0 ? forca : 0;
      selos.b.style.opacity = dx > 0 ? forca : 0;
    };
    cartao.addEventListener('pointerdown', (e) => {
      if (a || e.button || e.target.closest('button, input, a, select')) return;
      if (e.pointerType === 'mouse' && !celular()) return;
      a = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, indo: false, hist: [[performance.now(), e.clientX]], t: performance.now() };
      clearTimeout(seg);
      seg = setTimeout(() => {
        if (!a || a.indo) return;
        a = null;
        navigator.vibrate?.(10);
        ctMaisAcoes();
      }, 520);
    });
    cartao.addEventListener('pointermove', (e) => {
      if (!a || e.pointerId !== a.id) return;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (!a.indo) {
        if (Math.hypot(dx, dy) < 8) return;
        clearTimeout(seg);
        if (Math.abs(dy) > Math.abs(dx) || !pode() || !ctR.mostrando) return void (a = null);
        a.indo = true;
        cartao.setPointerCapture(e.pointerId);
        limpar(cartao);
        cartao.classList.add('ct-arrastando');
      }
      a.dx = dx;
      a.hist.push([performance.now(), e.clientX]);
      if (a.hist.length > 6) a.hist.shift();
      por(dx);
    });
    const soltar = (e) => {
      if (!a || e.pointerId !== a.id) return;
      const g = a;
      a = null;
      clearTimeout(seg);
      if (!g.indo) {
        /* toque simples no cartão: mostra a resposta */
        if (e.type === 'pointerup' && pode() && !ctR.mostrando && performance.now() - g.t < 400) ctMostrar();
        return;
      }
      cartao.classList.remove('ct-arrastando');
      const [t0, x0] = g.hist[0];
      const [t1, x1] = g.hist[g.hist.length - 1];
      const vel = t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
      const projetado = g.dx + vel * 0.18;
      if (Math.abs(projetado) > 120 && e.type === 'pointerup') {
        const nota = projetado > 0 ? 'b' : 'e';
        navigator.vibrate?.(nota === 'b' ? 10 : [20, 30, 20]);
        cartao.style.transition = 'transform 180ms ease-in, opacity 180ms ease-in';
        cartao.style.transform = `translateX(${Math.sign(projetado) * 420}px) rotate(${Math.sign(projetado) * 14}deg)`;
        cartao.style.opacity = '0';
        return void setTimeout(() => ctDarNota(nota, null), 150);
      }
      if (reduz() || !polido()) return por(0);
      molaFisica(g.dx, 0, vel, (x) => cartao.isConnected && por(Math.abs(x) < 0.5 ? 0 : x), 0.7, 0.36);
    };
    cartao.addEventListener('pointerup', soltar);
    cartao.addEventListener('pointercancel', soltar);
  }

  /* ---- O fim da sessão ----------------------------------------------------------------- */
  function ctHtmlDoFim() {
    const R = ctR;
    const respostas = R.notas.e + R.notas.d + R.notas.b + R.notas.f;
    const acerto = respostas ? Math.round(((respostas - R.notas.e) / respostas) * 100) : 100;
    const erradas = R.erradas.map(ctCarta);
    const amanha = R.inteiro ? 'A próxima abre amanhã com 8.' : R.livre ? 'Foi estudo livre: a agenda das palavras não mudou.' : 'O resto de hoje continua esperando em ' + ctNome() + '.';
    const numeros = [['Cartões', String(R.feitos), ''], ['Lembradas', acerto + '%', 'bom'], ['Tempo', ctTempoDaSessao(), ''], ['Melhor sequência', String(R.melhor), ''], ['XP da sessão', '+20', 'acento'], ['Seeds', '+5', 'bom']];
    const mudou = [[R.novas, 'sprout', R.novas === 1 ? 'palavra nova começou' : 'palavras novas começaram', 'ct-nv'], [R.formadas, 'trending-up', R.formadas === 1 ? 'passou para “em revisão”' : 'passaram para “em revisão”', 'ct-rv'], [erradas.length, 'repeat', erradas.length === 1 ? 'você errou e reviu aqui mesmo' : 'você errou e reviu aqui mesmo', 'ct-ap']].filter((x) => x[0]);
    return `<div class="q-palco q-revisao ct-rev ct-fim" data-testid="revisao-no-quest" data-estado="fim">
      <header class="q-cab"><button type="button" class="q-ctl q-voltar" aria-label="Voltar para ${ctNome()}" data-ct="fim-voltar">${ica('arrow-left')}</button><div><p class="q-sobre">Revisão · ${esc(R.rotulo)}</p><h1>Sessão concluída</h1></div></header>
      <div class="q-cartao fundo qr-fecho"><span class="q-ic">${ica('party-popper')}</span><div><h2>${R.inteiro ? 'Você fechou o dia' : 'Você fechou a sessão'}</h2><p>${R.feitos === 1 ? 'O cartão foi estudado.' : `Os ${R.feitos} cartões foram estudados.`} ${amanha}</p></div></div>
      <div class="qr-numeros">${numeros.map(([r, v, tom]) => `<div class="q-num"><span class="q-rotulo">${r}</span><b class="${tom}">${v}</b></div>`).join('')}</div>
      <div class="q-grade g2 ct-fim-par">
        <section class="q-cartao ct-mudou">${ctCabecaDoCartao('O que mudou na sua memória', '')}
          ${mudou.length ? `<ul class="ct-mudancas">${mudou.map(([n, i, t, k]) => `<li><span class="q-tag ${k}">${ica(i)} ${n}</span><span>${t}</span></li>`).join('')}</ul>` : '<p class="qv-nota">Todas lembradas: os intervalos cresceram.</p>'}
          ${erradas.length ? `<p class="q-rotulo">As que escaparam</p><div class="q-acoes ct-erradas">${erradas.map((c) => `<button type="button" class="q-chip" data-ct-abrir="${c.id}" lang="${c.lang}">${esc(c.p)}</button>`).join('')}</div>` : ''}</section>
        <section class="q-cartao ct-fim-missao">${ctCabecaDoCartao('Hoje', '')}
          <div class="ct-medida"><span class="q-rotulo">${ica('target')} Missão: revise 20 palavras</span><b>20 de 20 · +5 Seeds</b><span class="q-barra"><span style="width:100%"></span></span></div>
          <div class="ct-medida"><span class="q-rotulo">${ica('flame')} Sequência</span><b>${R.inteiro ? '5 dias seguidos' : '4 dias seguidos'}</b>${ctSemana(R.inteiro)}</div>
          <p class="qv-nota">O XP vem da sessão concluída, não de cada cartão: apertar “Bom” depressa não rende nada.</p></section>
      </div>
      <div class="q-faixa" role="toolbar" aria-label="O que fazer agora">
        <button type="button" class="q-ctl pri" data-ct="fim-jogo">${ica('gamepad-2')} ${erradas.length ? `Virar jogo com as ${erradas.length} ${erradas.length === 1 ? 'errada' : 'erradas'}` : 'Jogar com as mesmas'}</button>
        <button type="button" class="q-ctl" data-ct="fim-memoria">${ica('chart-column')} Ver a ${ctNomeDaAba(4).toLowerCase()}</button>
        <button type="button" class="q-ctl" data-ct="fim-voltar">${ica('layers')} Voltar para ${ctNome()}</button>
        <span class="q-espaco"></span>
        <button type="button" class="q-ctl" data-ct="fim-desfazer" ${R.hist.length ? '' : 'disabled'}>${ica('undo-2')} Desfazer a última${ctTecla('Z')}</button>
      </div></div>`;
  }
  function ctEntradaDoFim() {
    if (!polido() || reduz()) return;
    const quieto = QS.has('quieto');
    $$('.ct-fim > *:not(.q-cab)', tela).forEach((x, i) => anima(x, ENTRA(26), { d: 620, atraso: 80 + i * 70 }));
    anima($('.qr-fecho .q-ic', tela), [{ transform: 'scale(0.3) rotate(-24deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 820, atraso: 200, e: MOLA });
    $$('.qr-numeros .q-num b', tela).forEach((b, i) => {
      const m = b.textContent.match(/^(\+?)(\d+)(%?)$/);
      if (m) contar((v) => (b.textContent = m[1] + v + m[3]), 0, +m[2], 900 + i * 80);
    });
    $$('.ct-fim .q-barra > span', tela).forEach((s) => anima(s, [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], { d: 1000, atraso: 600 }));
    if (!quieto) setTimeout(() => atual === 'estudo' && ctR?.fim && confete(70), 320 * K());
  }
  tela.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct-abrir]');
    if (b && atual === 'estudo') ctAbrirPalavra(b.dataset.ctAbrir, { gatilho: b });
  });
