  /* ==========================================================================
     CARTÕES 2 — a revisão (a rodada de estudo), VERSÃO ENXUTA.
     A marcação segue a de RevisaoDoQuest.tsx (q-revisao, qr-topo, qr-cartao flash, resp, fsrs,
     qr-opcoes, qr-producao, qr-fecho, qr-numeros) e o CSS é o questRevisao.css do repositório.
     O que mudou nesta versão:
       topo com voltar, barra, "10 / 26", desfazer e "…"; a instrução só nos 3 primeiros cartões;
       frente com UMA fileira (Fala original, Mostrar resposta); verso com UMA fileira de notas;
       o verso traz a CENA (quadro ou onda, frase, voz de quem falou, Abrir na sessão);
       Fala original e Minha voz viram dois ícones ao lado da frase;
       tudo o mais mora na folha do "…"; avisos em uma linha; palavra que não entra com 4 saídas;
       fim da sessão com 3 números e dois botões.
     As práticas, a gravação da voz e os estados da barra estão em cartoes4.js.
     ========================================================================== */
  Object.assign(SIMPLES, {
    film: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>'),
    square: svg('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    dices: svg('<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>'),
    'log-out': svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'),
    ear: svg('<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>'),
    gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>'),
    lightbulb: svg('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
    'rotate-ccw': svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    'trash-2': svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'),
    shuffle: svg('<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>'),
    headphones: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
    'chevron-right': svg('<path d="m9 18 6-6-6-6"/>'),
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
  });

  let ctR = null;
  const ctAtual = () => ctR && ctCarta(ctR.fila[0]);
  const ctEscRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* O que é desta versão e vale para a revisão e para as práticas (cartoes4.js). */
  const CX = {
    dizer: QS.get('dizer') !== 'nao' /* "Dizer antes de virar": convite em parte dos cartões */,
    guardarVoz: false /* "Guardar minha voz neste cartão": desligado de fábrica */,
    voz: {} /* gravações guardadas, por cartão: só neste aparelho */,
    mic: ['falso', 'negado'].includes(QS.get('mic')) ? QS.get('mic') : 'real',
    bonus: 'ditado' /* a prática com o "Bônus de hoje" */,
    bonusGanho: false,
  };
  /* Palavras de baralho trazido (Anki, lista colada) que também aparecem nas capturas da pessoa. */
  const CX_ACHADOS = {
    'put-off': [["We can't put off the release again.", 'Não podemos adiar o lançamento de novo.', 's-reuniao', 'Leo', '00:52'], ['People put off sleep to finish one more episode.', 'As pessoas adiam o sono para terminar mais um episódio.', 's-podcast', 'Narrador', '12:40']],
    'figure-out': [["Let's figure out what broke before we ship.", 'Vamos descobrir o que quebrou antes de entregar.', 's-reuniao', 'Ana', '00:31']],
    aunque: [['Aunque es tarde, todavía no he terminado.', 'Embora seja tarde, ainda não terminei.', 's-aula', 'Profesora', '13:48']],
  };
  const cxHash = (s) => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7);
  const cxEhVideo = (s) => CT_SESSOES[s]?.[1] === 'monitor';
  /* Tem cena quem nasceu de captura com fala gravada: sessão conhecida e alguém falando. */
  const cxTemCena = (c, k) => !!CT_SESSOES[c.frases[k][2]] && !!c.frases[k][3];

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
    ctR = { fila: ids.slice(), total: ids.length, feitos: 0, hist: [], mostrando: false, k: 0, erradas: [], seguidas: 0, melhor: 0, t0: performance.now(), notas: { e: 0, d: 0, b: 0, f: 0 }, pend: 0, rotulo, livre: !!o.livre, inteiro: !o.ids && !o.n && b === 'tudo', tentativa: '', verificado: false, certo: false, avisado: new Set(), aviso: null, novas: 0, formadas: 0, subiu: [], vistosN: 0, fim: false, seg: 0 };
    ctNovoCartao();
    mostrar('estudo', { origem: o.origem || 'clique' });
  }
  function ctNovoCartao() {
    const R = ctR;
    const c = ctAtual();
    Object.assign(R, { mostrando: false, tentativa: '', verificado: false, certo: false });
    if (!c) return;
    R.vistos ??= {};
    R.vistosN = (R.vistosN || 0) + 1;
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
  const cxEq = '<span class="ct-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  /* De onde a frase veio, em texto pequeno (sem botão): "Reunião de produto · 00:38". */
  function cxOnde(c, k) {
    const [, , s, , tempo] = c.frases[k];
    const sess = CT_SESSOES[s];
    const onde = sess ? `${sess[0]}${tempo ? ' · ' + tempo : ''}` : ctNomeDoBaralho(s);
    return `<p class="cx-onde">${ica(sess ? sess[1] : s === 'trilha' ? 'graduation-cap' : 'wallet-cards')}<span>${esc(onde)}</span></p>`;
  }
  /* O botão de ouvir da frente: a fala gravada quando existe; senão, a voz do aparelho. */
  function cxBotaoOuvir(c, k) {
    const quem = c.frases[k][3];
    return quem
      ? `<button type="button" class="q-ctl ct-som" data-ct="rev-original" aria-label="Fala original" title="A fala gravada da sessão (R)">${ica('audio-lines')}${cxEq}<span>Fala original</span></button>`
      : `<button type="button" class="q-ctl ct-som" data-ct="rev-voz" title="${c.frases[k][2].startsWith('a-') ? 'O áudio do Anki não vem na importação: toca a voz do aparelho (V)' : 'Esta origem não tem gravação: toca a voz do aparelho (V)'}" aria-label="Ouvir na voz do aparelho">${ica('volume-2')}${cxEq}<span>Ouvir</span></button>`;
  }
  /* Compatibilidade: quem ainda pedir a linha antiga de origem recebe a fileira nova. */
  const ctOrigemDaFrase = (c, k) => `${cxOnde(c, k)}<div class="cx-fileira ct-origem">${cxBotaoOuvir(c, k)}</div>`;

  /* A CENA: o que só o Babel Play tem. Só no verso (na frente entregaria a resposta).
     Vídeo: o quadro do momento da fala. Áudio: a onda da fala e quem falou.
     No protótipo é desenho: a imagem de verdade depende de guardar o quadro (decisão do dono). */
  function cxCena(c, k, o = {}) {
    const [f, , s, quem, tempo] = c.frases[k];
    const sess = CT_SESSOES[s];
    const video = cxEhVideo(s);
    const sem = cxHash(f);
    const barras = Array.from({ length: 30 }, (_, i) => {
      const h = 10 + ((sem * (i + 3) * 17) % 43) * (0.45 + 0.55 * Math.sin((i / 29) * Math.PI));
      return `<rect x="${(24 + i * 9.2).toFixed(1)}" y="${(86 - h / 2).toFixed(1)}" width="5" height="${h.toFixed(1)}" rx="2.5"/>`;
    }).join('');
    const desenho = video
      ? `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="var(--surface-sunken)"/><rect y="112" width="320" height="68" fill="color-mix(in srgb, var(--q-acento) 14%, var(--surface-sunken))"/><rect x="196" y="26" width="100" height="68" rx="8" fill="var(--surface)" stroke="var(--border-subtle)" stroke-width="2"/><path d="M210 46h62M210 60h72M210 74h44" stroke="var(--ink-muted)" stroke-width="4" stroke-linecap="round"/><circle cx="108" cy="70" r="28" fill="color-mix(in srgb, var(--q-acento) 46%, var(--surface))"/><path d="M56 180c4-46 26-68 52-68s48 22 52 68z" fill="color-mix(in srgb, var(--q-acento) 46%, var(--surface))"/><rect x="40" y="142" width="240" height="24" rx="6" fill="rgb(20 18 16 / 0.72)"/><path d="M56 154h150M214 154h46" stroke="#f3efe8" stroke-width="5" stroke-linecap="round" opacity="0.9"/></svg>`
      : `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="var(--surface-sunken)"/><circle cx="270" cy="42" r="22" fill="color-mix(in srgb, var(--q-acento) 40%, var(--surface))"/><text x="270" y="50" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)">${esc((quem || '?')[0])}</text><g fill="color-mix(in srgb, var(--q-acento) 70%, var(--surface-sunken))">${barras}</g><path d="M24 146h272" stroke="var(--border-subtle)" stroke-width="3" stroke-linecap="round"/><circle cx="${24 + (sem % 200)}" cy="146" r="6" fill="var(--q-acento)"/></svg>`;
    return `<figure class="cx-cena ${video ? 'video' : 'audio'}" aria-label="${video ? 'Quadro do vídeo no momento da fala' : 'A fala gravada na sessão'}">
        <span class="cx-cena-quadro ct-quadro">${desenho}<i class="cx-cena-tempo">${ica(video ? 'film' : 'mic')}${esc(tempo || '')}</i></span>
        <figcaption><span class="cx-cena-de">${esc(sess ? sess[0] : '')}${quem ? ` · ${esc(quem)}` : ''}</span>${o.semLink ? '' : `<button type="button" class="cx-link" data-ct="rev-sessao">${ica('external-link')}<span>Abrir na sessão</span></button>`}</figcaption>
      </figure>`;
  }
  /* Compatibilidade com o nome antigo. */
  const ctQuadro = (c, k) => (cxTemCena(c, k) ? cxCena(c, k) : '');

  function ctNotas(c) {
    const quatro = CT_AJ.botoes === 4;
    const l = quatro ? [['e', 'Errei', c.iv[0], '1'], ['d', 'Difícil', c.iv[1], '2'], ['b', 'Bom', c.iv[2], '3'], ['f', 'Fácil', c.iv[3], '4']] : [['e', 'Esqueci', c.iv[0], '1'], ['b', 'Lembrei', c.iv[2], '2']];
    return `<div class="fsrs" role="group" aria-label="Quão fácil foi lembrar" style="--n:${l.length}">${l.map(([k, r, iv, t]) => `<button type="button" class="${k}" data-ct-nota="${k}" title="Tecla ${t}">${r}<small>${iv || 'agora'}</small></button>`).join('')}</div>
      ${ctR.vistosN <= 3 ? `<p class="ct-gestos">${ica('hand')} Ou deslize o cartão: esquerda, ${quatro ? 'Errei' : 'Esqueci'}; direita, ${quatro ? 'Bom' : 'Lembrei'}.</p>` : ''}`;
  }
  function ctResultado(texto) {
    const R = ctR;
    return `<div class="resp qr-resultado" data-certo="${R.certo}"><p class="qr-veredito ${R.certo ? 'certo' : 'errado'}" role="status">${ica(R.certo ? 'circle-check' : 'circle-x')}<span>${texto}</span></p>
      <p class="ct-consequencia">${R.certo ? `Conta como “${CT_AJ.botoes === 4 ? 'Bom' : 'Lembrei'}”: volta em ${ctAtual().iv[2] || '1 d'}.` : 'Conta como esquecida: volta ainda nesta sessão.'}</p>
      <button type="button" class="q-ctl pri qr-principal" data-ct="rev-avancar">Avançar ${ica('arrow-right')}</button></div>`;
  }
  /* "Dizer antes de virar": em parte dos cartões (o ganho vem do contraste), sem gravar e sem nota. */
  const cxPedeDizer = (c) => CX.dizer && !ctR.semDizer && ctFormato() === 'lembrar' && (ctR.forcarDizer || cxHash(c.id) % 3 === 0);
  function ctMioloDoCartao(c) {
    const R = ctR;
    const k = R.k;
    const f = ctFormato();
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
        ${R.verificado ? ctResultado(R.certo ? 'Correto!' : `Incorreto. Você selecionou “${esc(R.tentativa)}”. A resposta correta era “${esc(c.p)}”.`) : `<div class="qr-opcoes" role="group" aria-label="Qual palavra completa a frase">${R.alternativas.map((o) => `<button type="button" class="qr-opcao" data-ct-opcao="${esc(o)}" lang="${c.lang}">${esc(o)}</button>`).join('')}</div>`}`;
    const verso = R.mostrando;
    const quem = c.frases[k][3];
    const cena = verso && cxTemCena(c, k);
    /* No verso, Fala original e Minha voz são dois ícones ao lado da frase. */
    const icones = verso
      ? `<span class="cx-icones">${quem ? `<button type="button" class="q-ctl cx-ic ct-som" data-ct="rev-original" aria-label="Fala original: ${esc(quem)}" title="Fala original · ${esc(quem)} (R)">${ica('audio-lines')}${cxEq}</button>` : `<button type="button" class="q-ctl cx-ic ct-som" data-ct="rev-voz" aria-label="Ouvir na voz do aparelho" title="Ouvir na voz do aparelho (V)">${ica('volume-2')}${cxEq}</button>`}<button type="button" class="q-ctl cx-ic" data-ct="minha-voz" aria-label="Minha voz: gravar e comparar" title="Minha voz: gravar e comparar (M)">${ica('mic')}${CX.voz[c.id]?.length ? '<i class="cx-ponto" aria-hidden="true"></i>' : ''}</button></span>`
      : '';
    const topo = `<div class="termo" lang="${c.lang}">${esc(c.p)}</div><p class="ct-ipa tn">${c.ipa}</p>
      <div class="ct-frase cx-frase-linha"><p class="exemplo" lang="${c.lang}">“${ctFrase(c, k, 'marca')}”</p>${icones}</div>${cena ? '' : cxOnde(c, k)}`;
    if (f === 'digitar')
      return `${topo}${
        R.verificado
          ? ctResultado(R.certo ? `Correto! A tradução era “${esc(c.t)}”.` : `Incorreto. A tradução era “${esc(c.t)}”${R.tentativa ? ` (você escreveu “${esc(R.tentativa)}”)` : ''}.`)
          : `<div class="resp qr-sem-linha qr-digitar"><label class="q-campo"><span>Digite a tradução</span><input type="text" autocomplete="off" autocapitalize="off" placeholder="Digite a tradução…" data-ct-campo="tentativa"></label>
              <div class="cx-fileira">${cxBotaoOuvir(c, k)}<button type="button" class="q-ctl pri qr-principal" data-ct="rev-verificar" disabled>${ica('check')} Verificar</button></div></div>`
      }`;
    /* LEMBRAR: a palavra e a frase; a tradução só depois. */
    if (!verso)
      return `${topo}<div class="resp qr-sem-linha">
          ${cxPedeDizer(c) ? `<p class="cx-diga">${ica('mic')}<span>Diga em voz alta antes de virar</span><button type="button" class="cx-link" data-ct="dizer-agora-nao">Agora não</button></p>` : ''}
          <div class="cx-fileira ct-origem">${cxBotaoOuvir(c, k)}<button type="button" class="q-ctl pri qr-principal" data-ct="rev-mostrar">${ica('eye')} Mostrar resposta</button></div></div>`;
    const achados = !cena && !CT_SESSOES[c.frases[k][2]] ? CX_ACHADOS[c.id] : null;
    const soVideo = achados?.every((x) => cxEhVideo(x[2]));
    return `${topo}<div class="resp">
        <div class="cx-resposta ${cena ? 'com-cena' : ''}">
          ${cena ? cxCena(c, k) : ''}
          <div class="cx-resposta-texto"><b>${esc(c.t)}</b><p class="ct-trad-da-frase">“${esc(c.frases[k][1])}”</p>
            ${c.lembrete ? `<p class="cx-lembrete" title="O seu lembrete">${ica('pen-line')}<span>${esc(c.lembrete)}</span></p>` : ''}</div>
        </div>
        ${achados ? `<button type="button" class="cx-juntar" data-ct="cena-juntar">${ica('film')}<span>Esta palavra aparece em ${achados.length} ${soVideo ? 'dos seus vídeos' : 'das suas capturas'}.</span><b>Juntar a cena</b></button>` : ''}
        ${ctNotas(c)}</div>`;
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
  /* A linha entre o topo e o cartão: um aviso (uma linha só) ou, nos 3 primeiros cartões, a instrução.
     O espaço dela existe sempre, então um aviso não empurra o cartão. */
  function cxLinha(R, f) {
    const av = R.aviso && ctCarta(R.aviso);
    if (av)
      return `<div class="cx-aviso ct-aviso-dif" role="status"><button type="button" class="cx-aviso-corpo" data-ct="dif-saidas">${ica('triangle-alert')}<span><b lang="${av.lang}">“${esc(av.p)}”</b> não está entrando.<span class="cx-longo"> Quer tentar de outro jeito?</span></span><i class="cx-aviso-vai"><span class="cx-longo">Ver as saídas</span>${ica('chevron-right')}</i></button><button type="button" class="cx-aviso-x" aria-label="Dispensar o aviso" data-ct="dif-fechar">${ica('x')}</button></div>`;
    if (PL.offline || R.pend)
      return `<div class="cx-aviso ct-sem-rede" role="status"><span class="cx-aviso-corpo">${ica('wifi-off')}<span><b>Sem rede.</b> ${R.pend ? `${R.pend} ${R.pend === 1 ? 'nota guardada' : 'notas guardadas'}` : 'As notas ficam guardadas'}<span class="cx-longo"> neste aparelho: sobem sozinhas quando a internet voltar</span>.</span></span><button type="button" class="cx-aviso-acao" data-ct="rev-sincronizar" aria-label="Tentar enviar agora">${ica('refresh-cw')}<span>Tentar<span class="cx-longo"> agora</span></span></button></div>`;
    if (R.vistosN <= 3 && R.feitos < 3) {
      const dica = { lembrar: 'Tente lembrar a tradução antes de mostrar a resposta. Depois diga como foi.', digitar: 'Escreva a tradução da palavra e confira.', escolher: 'Escolha a palavra que completa a frase.', lacuna: 'Escreva de memória a palavra que falta na frase.' }[f];
      return `<p class="q-texto qr-dica">${dica}</p>`;
    }
    return '';
  }
  function ctHtmlDaRodada() {
    const R = ctR;
    if (!R) return '<div class="q-palco q-revisao"></div>';
    if (R.pr) return cxHtmlDaPratica();
    if (R.fim) return ctHtmlDoFim();
    const c = ctAtual();
    const f = ctFormato();
    const pele = `pele-padrao ${c.est === 'nova' ? 'cartao-nova' : 'cartao-aprendida'}`;
    const eraErrada = R.erradas.includes(c.id);
    const selo = `${c.nv} · ${ctNomeDoBaralho(c.b)}`;
    const semRede = PL.offline || R.pend;
    const teclas = f === 'lembrar' ? (R.mostrando ? `<kbd>1</kbd> a <kbd>${CT_AJ.botoes === 4 ? 4 : 2}</kbd> responde · <kbd>R</kbd> ouve · <kbd>M</kbd> minha voz` : '<kbd>Espaço</kbd> mostra a resposta · <kbd>R</kbd> ouve') : f === 'escolher' ? '<kbd>1</kbd> a <kbd>4</kbd> escolhe' : '<kbd>Enter</kbd> verifica';
    return `<div class="q-palco q-revisao ct-rev cx-rev" data-testid="revisao-no-quest" data-estado="rodada" data-formato="${f}" data-cx-lado="${R.mostrando || R.verificado ? 'verso' : 'frente'}">
      <header class="q-cab qr-topo cx-topo"><button type="button" class="q-ctl q-voltar" aria-label="Voltar para ${ctNome()}" data-ct="rev-voltar">${ica('arrow-left')}</button>
        <div class="qr-progresso"><span class="q-barra" role="progressbar" aria-label="Progresso da sessão: ${esc(R.rotulo)}" aria-valuenow="${R.feitos}" aria-valuemin="0" aria-valuemax="${R.total}"><span style="width:${(R.feitos / Math.max(1, R.total)) * 100}%"></span></span><span class="qr-conta">${Math.min(R.feitos + 1, R.total)} / ${R.total}${semRede && R.aviso ? `<i class="cx-sem-rede-ic" title="Sem rede: as notas ficam guardadas neste aparelho">${ica('wifi-off')}</i>` : ''}</span></div>
        <button type="button" class="q-ctl cx-ic cx-desfazer" aria-label="Desfazer a última nota" title="Desfazer a última nota (Z)" data-ct="rev-desfazer" ${R.hist.length ? '' : 'disabled'}>${ica('undo-2')}</button>
        <button type="button" class="q-ctl cx-ic" aria-label="Mais ações e ajustes" title="Mais ações e ajustes" data-ct="rev-mais">${ica('ellipsis')}</button></header>
      <h1 class="sr">Revisão: ${esc(R.rotulo)}</h1>
      <div class="cx-linha">${cxLinha(R, f)}</div>
      <section class="q-cartao qr-cartao flash ${pele}" aria-label="Cartão" data-ct-carta="${c.id}">
        <span class="ct-selos"><span class="q-tag off qr-selo">${esc(selo)}</span>${c.est === 'nova' && !eraErrada ? '<span class="q-tag ct-nv">nova</span>' : ''}${eraErrada ? '<span class="q-tag ct-ap">de novo</span>' : ''}${ctDificil(c) ? `<span class="q-tag ct-dif">${ica('triangle-alert')} difícil</span>` : ''}${c.band ? `<span class="q-tag ct-band">${ica('flag')} bandeira</span>` : ''}${R.seguidas >= 3 ? `<span class="q-tag ct-combo">${ica('flame')} ${R.seguidas} seguidas</span>` : ''}</span>
        <i class="ct-carimbo e" aria-hidden="true">${CT_AJ.botoes === 4 ? 'Errei' : 'Esqueci'}</i><i class="ct-carimbo b" aria-hidden="true">${CT_AJ.botoes === 4 ? 'Bom' : 'Lembrei'}</i>
        ${ctMioloDoCartao(c)}
      </section>
      <p class="cx-teclas" data-precisa="teclado">${teclas} · <kbd>Z</kbd> desfaz · <kbd>?</kbd> todos os atalhos</p>
    </div>`;
  }
  Object.defineProperty(D.telas, 'estudo', { get: ctHtmlDaRodada });

  /* ---- Pintar: a tela inteira é refeita; só o cartão se move ------------------------- */
  function ctPintarRodada(como, dir = 1) {
    if (atual !== 'estudo' || !ctR) return;
    if (ctR.pr) return cxPintarPratica(como);
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
      $$('.termo, .ct-ipa, .ct-frase, .cx-onde, .qr-lacuna, .qr-producao > *, .resp, .qr-cartao > .exemplo', cartao).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 380, atraso: 90 + i * 40 }));
      const combo = $('.ct-combo', tela);
      if (combo && ctR.seguidas % 3 === 0) anima(combo, [{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
      /* o desfazer "acende" depois de cada nota: é ele que dá confiança para responder depressa */
      const des = $('.cx-desfazer:not(:disabled)', tela);
      if (des && como === 'proximo') anima(des, [{ transform: 'scale(0.7) rotate(-40deg)' }, { transform: 'scale(1) rotate(0)' }], { d: 520, e: MOLA });
    } else if (como === 'resposta') {
      const r = $('.resp', cartao);
      anima(r, [{ opacity: 0, transform: 'translateY(-10px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 420 });
      $$('.cx-icones .q-ctl', cartao).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }], { d: 460, atraso: 80 + i * 70, e: MOLA }));
      const cena = $('.cx-cena-quadro', r);
      if (cena) anima(cena, [{ opacity: 0, transform: 'scale(0.9) rotate(-2deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], { d: 560, atraso: 60, e: MOLA_SUAVE });
      $$('.fsrs button, .qr-principal, .cx-juntar', r).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(14px) scale(0.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 460, atraso: 120 + i * 55, e: MOLA_SUAVE }));
    } else if (como === 'frase') {
      const fz = $('.ct-frase', cartao);
      if (fz) anima(fz, [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { d: 380 });
    } else if (como === 'aviso') {
      const a = $('.cx-aviso', tela);
      if (a) anima(a, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420 });
    }
  }
  aoMostrar.estudo = () => {
    casca.classList.add('ct-em-estudo');
    if (ctR?.pr) cxArmarPratica('entrou');
    else {
      ctArmarCartao();
      if (ctR?.fim) ctEntradaDoFim();
      else if (!celular()) $('[data-ct-campo="tentativa"]', tela)?.focus({ preventScroll: true });
    }
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
    return { fila: R.fila.slice(), feitos: R.feitos, erradas: R.erradas.slice(), seguidas: R.seguidas, melhor: R.melhor, notas: { ...R.notas }, pend: R.pend, k: R.k, novas: R.novas, formadas: R.formadas, subiu: (R.subiu || []).slice(), id: c.id, lapsos: c.lapsos, est: c.est, aviso: R.aviso };
  }
  function ctMostrar() {
    const R = ctR;
    if (!R || R.pr || R.mostrando || ctFormato() !== 'lembrar') return;
    R.mostrando = true;
    sentir('vira');
    ctPintarRodada('resposta');
    const c = ctAtual();
    if (CT_AJ.original && c.frases[R.k][3]) ctOuvirNaRodada('original');
    else if (CT_AJ.ouvir) ctOuvirNaRodada('voz', true);
  }
  function ctOuvirNaRodada(qual, soPalavra) {
    const c = ctAtual();
    if (!c || ctR.pr) return;
    const f = c.frases[ctR.k];
    const original = qual === 'original' && f[3];
    const b = $(`[data-ct="${original ? 'rev-original' : 'rev-voz'}"]`, tela);
    const frase = $('.ct-frase .exemplo', tela);
    $$('.ct-tocando', tela).forEach((x) => x.classList.remove('ct-tocando'));
    b?.classList.add('ct-tocando');
    if (original) frase?.classList.add('ct-tocando'), $('.cx-cena', tela)?.classList.add('ct-tocando');
    const vez = (ctR.vezDoSom = (ctR.vezDoSom || 0) + 1);
    const fim = () => ctR && ctR.vezDoSom === vez && $$('.ct-tocando', tela).forEach((x) => x.classList.remove('ct-tocando'));
    dizer(original ? f[0] : soPalavra ? c.p : c.p, { lang: ctVoz(c) }).then(fim);
    setTimeout(fim, (original ? 3400 : 1400) * K());
  }
  async function ctDarNota(k, origem) {
    const R = ctR;
    const c = ctAtual();
    if (!R || R.pr || !c || R.saindo) return;
    R.hist.push(ctFoto());
    if (R.hist.length > 30) R.hist.shift();
    R.notas[k]++;
    R.aviso = null;
    R.subiu ??= [];
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
      if (c.est === 'nova') (c.est = 'aprendendo'), R.novas++, R.subiu.push([id, 'nova']);
      else if (c.est === 'aprendendo' && k !== 'd') (c.est = 'revisao'), R.formadas++, R.subiu.push([id, 'formada']);
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
      const a = $('.cx-aviso', tela);
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
    Object.assign(R, { fila: h.fila, feitos: h.feitos, erradas: h.erradas, seguidas: h.seguidas, melhor: h.melhor, notas: h.notas, pend: h.pend, novas: h.novas, formadas: h.formadas, subiu: h.subiu || [], aviso: h.aviso, fim: false, mostrando: false, tentativa: '', verificado: false, certo: false, k: h.k });
    if (h.total) R.total = h.total;
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
  function ctTirar(como, qual) {
    /* enterrar (fica para amanhã), suspender e descansar tiram o cartão da sessão; o Desfazer devolve. */
    const R = ctR;
    const c = qual ? ctCarta(qual) : ctAtual();
    if (!R || !c) return;
    const foto = ctFoto();
    Object.assign(foto, { id: c.id, lapsos: c.lapsos, est: c.est, total: R.total, tirou: { est: c.est, descansa: !!c.descansa } });
    R.hist.push(foto);
    const eraAtual = ctAtual()?.id === c.id;
    R.fila = R.fila.filter((id) => id !== c.id);
    R.total = Math.max(R.feitos, R.total - 1);
    R.aviso = R.aviso === c.id ? null : R.aviso;
    if (como === 'suspender') c.est = 'suspensa';
    if (como === 'descansar') c.descansa = true;
    sentir('fecha');
    toast({ suspender: `“${c.p}” suspensa: não aparece na revisão até você reativar. Z desfaz.`, descansar: `“${c.p}” descansa 30 dias e volta sozinha em 9 de novembro. Z desfaz.`, enterrar: `“${c.p}” fica para amanhã, sem contar como erro. Z desfaz.` }[como], 4200);
    if (!R.fila.length) return ctFechar();
    if (eraAtual) ctNovoCartao();
    ctPintarRodada(eraAtual ? 'proximo' : 'seco', 1);
  }
  function ctFechar() {
    const R = ctR;
    R.fim = true;
    R.seg = Math.max(R.seg, Math.round((performance.now() - R.t0) / 1000));
    ctPintarRodada('fim');
  }
  function ctInfoDoCartao(gatilho) {
    const c = ctAtual();
    const linhas = c.est === 'nova' && !ctR.erradas.includes(c.id) ? [] : [['3 out', 'Bom', '2 d'], ['28 set', 'Errei', '< 10 min'], ['28 set', 'Bom', '1 d'], ['24 set', 'Difícil', '1 d'], ['21 set', 'primeira vez', 'sem intervalo']].slice(0, Math.max(2, Math.min(5, c.lapsos + 2)));
    ctAbrir(
      'ct:info',
      ctDlg('info', 'Informações do cartão', esc(`${c.p} · ${c.t}`), `<dl class="q-medidas duas">${[['Estado', CT_ESTADO[c.est][0]], ['Baralho', ctNomeDoBaralho(c.b)], ['Estabilidade', c.estab ? String(c.estab).replace('.', ',') + ' dias' : 'ainda não há'], ['Dificuldade', c.dif ? String(c.dif).replace('.', ',') + ' de 10' : 'ainda não há'], ['Erros', c.lapsos], ['Acertos', c.acertos || 'ainda não há'], ['Frases', c.frases.length], ['Etiquetas', c.tags.map((t) => '#' + t).join(' ') || 'nenhuma']].map(([k, v]) => `<div class="q-medida"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${linhas.length ? `<div class="q-tabela-caixa"><table class="q-tabela"><thead><tr><th>Quando</th><th>Resposta</th><th>Intervalo dado</th></tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="q-texto">Palavra nova: ainda não tem histórico.</p>'}`, `<button type="button" class="q-ctl pri">${ica('check')} Fechar</button>`),
      gatilho,
    );
  }
  /* A folha do "…": o que saiu da tela mora aqui, com hierarquia. Os 3 mais usados são os maiores. */
  const cxInterruptor = (chave, titulo, texto, ligado) =>
    `<div class="cx-ajuste"><span><b>${titulo}</b><small>${texto}</small></span><button type="button" class="q-interruptor" role="switch" aria-checked="${!!ligado}" aria-label="${titulo}" data-a="liga" data-chave="${chave}"></button></div>`;
  function ctMaisAcoes() {
    const R = ctR;
    if (!R || R.pr || R.fim) return;
    const c = ctAtual();
    const temSessao = !!CT_SESSOES[c.frases[R.k][2]];
    const d = folhaDeBaixo(
      `<div class="cx-folha-cab"><div><p class="folha-pal" lang="${c.lang}">${esc(c.p)}</p><p class="folha-glosa">${R.mostrando || R.verificado ? esc(c.t) : 'Ações deste cartão'}</p></div><button type="button" class="q-ctl cx-ic" data-a="fechar" aria-label="Fechar">${ica('x')}</button></div>
       <div class="cx-tres">
         <button type="button" class="cx-grande" data-a="rev-editar">${ica('pencil')}<b>Editar</b><small>palavra, frase, tradução</small></button>
         <button type="button" class="cx-grande" data-a="rev-enterrar">${ica('moon')}<b>Deixar para amanhã</b><small>sem contar como erro</small></button>
         <button type="button" class="cx-grande" data-a="rev-bandeira" aria-pressed="${!!c.band}">${ica('flag')}<b>${c.band ? 'Tirar a bandeira' : 'Bandeira'}</b><small>marcar para ver depois</small></button>
       </div>
       <div class="folha-grade cx-menores">
         <button type="button" class="folha-acao" data-a="rev-suspender">${ica('pause')} Suspender</button>
         <button type="button" class="folha-acao" data-a="rev-info">${ica('info')} Informações e histórico</button>
         <button type="button" class="folha-acao" data-a="rev-sessao" ${temSessao ? '' : 'disabled'}>${ica('external-link')} Abrir na sessão</button>
         <button type="button" class="folha-acao" data-a="rev-frase" ${c.frases.length > 1 ? '' : 'disabled'}>${ica('repeat')} ${c.frases.length > 1 ? `Outra frase · ${R.k + 1} de ${c.frases.length}` : 'Outra frase'}</button>
         <button type="button" class="folha-acao" data-a="tutor">${ica('message-circle')} Perguntar ao tutor</button>
         <button type="button" class="folha-acao" data-a="minha-voz">${ica('mic')} Minha voz</button>
       </div>
       <p class="folha-rotulo">Nesta revisão</p>
       ${cxInterruptor('dizer', 'Dizer antes de virar', 'Em parte dos cartões, um convite para dizer em voz alta. Sem gravar e sem nota.', CX.dizer)}
       ${cxInterruptor('guardarVoz', 'Guardar minha voz no cartão', 'Fica só neste aparelho; você apaga quando quiser.', CX.guardarVoz)}
       <div class="cx-folha-pe">
         <button type="button" class="q-ctl" data-a="ajustes">${ica('sliders-horizontal')} Ajustes da memória</button>
         <button type="button" class="q-ctl" data-a="atalhos" data-precisa="teclado">${ica('keyboard')} Atalhos</button>
         <button type="button" class="q-ctl cx-encerrar" data-a="rev-encerrar">${ica('log-out')} Encerrar a revisão</button>
       </div>`,
      'cx-folha cx-folha-acoes',
    );
    d.setAttribute('aria-label', 'Ações do cartão e ajustes da revisão');
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'liga') {
        const k = b.dataset.chave;
        CX[k] = !CX[k];
        b.setAttribute('aria-checked', CX[k]);
        sentir(CX[k] ? 'liga' : 'desliga');
        if (k === 'dizer') ctR.semDizer = false;
        return void (atual === 'estudo' && ctPintarRodada('seco'));
      }
      fecharFolhaDeBaixo();
      if (a !== 'fechar') setTimeout(() => ctAcaoDaRodada(a, null), 240 * K());
    });
  }
  /* PALAVRA QUE NÃO ENTRA: quatro saídas úteis no lugar de só "suspender". */
  function cxSaidas(id) {
    const c = ctCarta(id);
    if (!c) return;
    const outra = c.frases[1];
    const k0 = 0;
    const lista = () => `<div class="cx-folha-cab"><div><p class="folha-pal" lang="${c.lang}">“${esc(c.p)}” não está entrando</p><p class="folha-glosa">Já escapou ${c.lapsos} vezes. Costuma ser o cartão, não você. Tente de outro jeito:</p></div><button type="button" class="q-ctl cx-ic" data-a="fechar" aria-label="Fechar">${ica('x')}</button></div>
      <div class="cx-saidas">
        <button type="button" class="q-linha" data-a="frase" ${outra ? '' : 'disabled'}><span class="q-ic">${ica('repeat')}</span><span><b>Trocar a frase</b><small>${outra ? `“${esc(outra[0])}” · ${esc(CT_SESSOES[outra[2]]?.[0] || ctNomeDoBaralho(outra[2]))}` : 'Por enquanto esta palavra só apareceu uma vez nas suas capturas.'}</small></span></button>
        <button type="button" class="q-linha" data-a="cena" ${cxTemCena(c, k0) ? '' : 'disabled'}><span class="q-ic">${ica('film')}</span><span><b>Rever a cena</b><small>${cxTemCena(c, k0) ? 'O momento em que você ouviu a palavra, com a voz de quem falou.' : 'Este cartão não nasceu de uma captura.'}</small></span></button>
        <button type="button" class="q-linha" data-a="lembrete"><span class="q-ic">${ica('pen-line')}</span><span><b>Escrever um lembrete seu</b><small>${c.lembrete ? `Hoje: “${esc(c.lembrete)}”` : 'Um truque com as suas palavras. Aparece no verso.'}</small></span></button>
        <button type="button" class="q-linha" data-a="descansar"><span class="q-ic">${ica('moon')}</span><span><b>Descansar 30 dias</b><small>Sai da fila e volta sozinha em 9 de novembro. Dá para desfazer.</small></span></button>
      </div>`;
    const d = folhaDeBaixo(lista(), 'cx-folha cx-folha-saidas');
    d.setAttribute('aria-label', 'Saídas para a palavra que não entra');
    const corpo = $('.folha-corpo', d);
    const trocar = (htmlNovo) => {
      corpo.innerHTML = htmlNovo;
      if (polido() && !reduz()) $$(':scope > *', corpo).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 360, atraso: i * 50 }));
    };
    const voltar = `<button type="button" class="q-ctl" data-a="voltar">${ica('arrow-left')} Outras saídas</button>`;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'fechar') return fecharFolhaDeBaixo();
      if (a === 'voltar') return sentir('aba'), trocar(lista());
      if (a === 'frase') {
        c.frases.push(c.frases.shift());
        if (ctR) ctR.aviso = null;
        fecharFolhaDeBaixo();
        sentir('liga');
        ctPintarRodada('seco');
        return toast(`“${c.p}” passa a usar outra frase: “${c.frases[0][0]}”`, 4600);
      }
      if (a === 'cena') {
        sentir('abre');
        trocar(`<p class="folha-rotulo">A cena de “${esc(c.p)}”</p>${cxCena(c, k0, { semLink: true })}
          <p class="folha-frase cx-frase-da-folha" lang="${c.lang}">“${ctFrase(c, k0, 'marca')}”</p><p class="folha-frase-trad">“${esc(c.frases[k0][1])}” · <b>${esc(c.t)}</b></p>
          <div class="cx-folha-pe">${voltar}<button type="button" class="q-ctl pri" data-a="ouvir-cena">${ica('audio-lines')} Ouvir ${esc(c.frases[k0][3])}</button></div>`);
        return void dizer(c.frases[k0][0], { lang: ctVoz(c) });
      }
      if (a === 'ouvir-cena') return void dizer(c.frases[k0][0], { lang: ctVoz(c) });
      if (a === 'lembrete') {
        sentir('abre');
        trocar(`<p class="folha-rotulo">Seu lembrete para “${esc(c.p)}”</p>
          <label class="q-campo"><span>Com as suas palavras</span><input type="text" maxlength="90" autocomplete="off" data-cx-lembrete value="${esc(c.lembrete || '')}" placeholder="Ex.: thorough tem “rough”: trabalho duro, bem feito"></label>
          <p class="qv-nota">Aparece no verso do cartão, só para você. O app não inventa lembrete por conta própria.</p>
          <div class="cx-folha-pe">${voltar}<button type="button" class="q-ctl pri" data-a="guardar-lembrete">${ica('check')} Guardar</button></div>`);
        return void $('[data-cx-lembrete]', d)?.focus();
      }
      if (a === 'guardar-lembrete') {
        c.lembrete = $('[data-cx-lembrete]', d).value.trim();
        if (ctR) ctR.aviso = null;
        fecharFolhaDeBaixo();
        sentir('acerto');
        ctPintarRodada('seco');
        return toast(c.lembrete ? 'Lembrete guardado: aparece no verso deste cartão.' : 'Lembrete apagado.');
      }
      if (a === 'descansar') {
        fecharFolhaDeBaixo();
        return void setTimeout(() => ctR && ctTirar('descansar', id), 240 * K());
      }
    });
    d.addEventListener('keydown', (e) => e.key === 'Enter' && e.target.matches('[data-cx-lembrete]') && $('[data-a="guardar-lembrete"]', d)?.click());
  }
  function ctAcaoDaRodada(a, b) {
    const R = ctR;
    if (!R) return false;
    if (R.pr) return cxAcao(a, b), true;
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
      case 'minha-voz':
      case 'pronuncia':
        return cxAbrirVoz(c, R.k), true;
      case 'dizer-agora-nao':
        R.semDizer = true;
        ctPintarRodada('seco');
        return toast('Sem o convite nesta revisão. Para desligar de vez: “…” › Dizer antes de virar.', 4200), true;
      case 'cena-juntar': {
        const novas = CX_ACHADOS[c.id];
        if (!novas) return true;
        c.frases = novas.concat(c.frases);
        R.k = 0;
        sentir('chega');
        ctPintarRodada('resposta');
        const q = $('.cx-cena-quadro', tela);
        if (q && polido() && !reduz()) rajada(...centro(q), 14, 0.9);
        return toast(`Cena juntada: “${c.p}” ganhou a frase, a voz de ${novas[0][3]} e o caminho até a sessão. A frase do baralho continua guardada.`, 5200), true;
      }
      case 'tutor':
        return toast('No app, o tutor abre já com esta palavra e a frase de onde ela veio.'), true;
      case 'atalhos':
        return ctAbrirAtalhos(b, 'revisao'), true;
      case 'dif-saidas':
        return cxSaidas(R.aviso), true;
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
      case 'fim-praticar': {
        const n = R.erradas.length;
        if (n) return window.ctPraticar({ origem: 'escaparam', rotulo: n === 1 ? 'A que escapou' : `As ${n} que escaparam`, n, ids: R.erradas.slice() }), true;
        return window.ctPraticar({ origem: 'sessao', rotulo: `As ${R.feitos} desta sessão`, n: R.feitos }), true;
      }
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
    if (d.cx) return cxAcao(d.cx, b, e), true;
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

  /* ---- Teclado: os atalhos continuam; na tela, uma linha discreta no pé (só com teclado) ---- */
  document.addEventListener('keydown', (e) => {
    if (atual !== 'estudo' || !ctR || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('dialog[open]') || folha || document.body.classList.contains('ct-mapa-aberto')) return;
    const R = ctR;
    if (R.pr) return cxTeclaDaPratica(e);
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
    const acoes = { z: 'rev-desfazer', r: 'rev-original', v: 'rev-voz', n: 'rev-frase', b: 'rev-bandeira', e: 'rev-editar', '-': 'rev-enterrar', s: 'rev-suspender', i: 'rev-info', m: 'minha-voz' };
    if (acoes[k]) {
      if (k === 'n' && ctAtual().frases.length < 2) return;
      if (k === 'm' && !R.mostrando) return;
      if (k === 'r' && !ctAtual().frases[R.k][3]) return faz(() => ctOuvirNaRodada('voz'));
      faz(() => ctAcaoDaRodada(acoes[k], null));
    }
  });

  /* ---- Gestos: tocar vira, arrastar dá a nota, segurar abre as ações ------------------- */
  function ctArmarCartao() {
    const cartao = $('.qr-cartao', tela);
    if (!cartao || !ctR || ctR.fim || ctR.pr) return;
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

  /* ---- O fim da sessão, enxuto: 3 números, o ganho, o que mudou, e dois botões ------------- */
  function cxSubiram(R) {
    /* quem subiu de fase nesta sessão; os estados prontos da barra só trazem as contagens */
    const reg = R.subiu || [];
    const de = (tipo, n, est) => {
      const ids = reg.filter((x) => x[1] === tipo).map((x) => x[0]);
      for (const id of CT_FILA) if (ids.length < n && !ids.includes(id) && ctCarta(id).est === est) ids.push(id);
      return ids.slice(0, Math.max(n, 0)).map(ctCarta);
    };
    return { novas: de('nova', R.novas, 'nova'), formadas: de('formada', R.formadas, 'aprendendo') };
  }
  function ctHtmlDoFim() {
    const R = ctR;
    const respostas = R.notas.e + R.notas.d + R.notas.b + R.notas.f;
    const acerto = respostas ? Math.round(((respostas - R.notas.e) / respostas) * 100) : 100;
    const erradas = R.erradas.map(ctCarta);
    const amanha = R.inteiro ? 'A próxima abre amanhã com 8.' : R.livre ? 'Foi estudo livre: a agenda das palavras não mudou.' : 'O resto de hoje continua esperando em ' + ctNome() + '.';
    const numeros = [['Cartões', String(R.feitos), ''], ['Lembradas', acerto + '%', 'bom'], ['Tempo', ctTempoDaSessao(), '']];
    const s = cxSubiram(R);
    const fichas = (l) => l.map((c) => `<button type="button" class="q-chip" data-ct-abrir="${c.id}" lang="${c.lang}">${esc(c.p)}</button>`).join('');
    const grupos = [[s.novas, 'sprout', 'Começaram', 'ct-nv'], [s.formadas, 'trending-up', 'Passaram para “em revisão”', 'ct-rv'], [erradas, 'repeat', 'Escaparam e você reviu aqui', 'ct-ap']].filter((g) => g[0].length);
    const n = erradas.length;
    return `<div class="q-palco q-revisao ct-rev ct-fim cx-fim" data-testid="revisao-no-quest" data-estado="fim">
      <header class="q-cab cx-topo"><button type="button" class="q-ctl q-voltar" aria-label="Voltar para ${ctNome()}" data-ct="fim-voltar">${ica('arrow-left')}</button><div><p class="q-sobre">Revisão</p><h1>Sessão concluída</h1></div>
        <button type="button" class="q-ctl cx-ic cx-desfazer" aria-label="Desfazer a última nota" title="Desfazer a última nota (Z)" data-ct="fim-desfazer" ${R.hist.length ? '' : 'disabled'}>${ica('undo-2')}</button></header>
      <div class="q-cartao fundo qr-fecho"><span class="q-ic">${ica('party-popper')}</span><div><h2>${R.inteiro ? 'Você fechou o dia' : 'Você fechou a sessão'}</h2><p>${R.feitos === 1 ? 'O cartão foi estudado.' : `Os ${R.feitos} cartões foram estudados.`} ${amanha}</p></div></div>
      <div class="qr-numeros">${numeros.map(([r, v, tom]) => `<div class="q-num"><span class="q-rotulo">${r}</span><b class="${tom}">${v}</b></div>`).join('')}</div>
      <p class="cx-ganho" title="O ganho vem da sessão concluída, não de cada cartão: responder depressa não rende nada.">${ica('zap')}<b>+20 XP</b><i>·</i>${ica('sprout')}<b>+5 Seeds</b><span>pela sessão concluída</span></p>
      <section class="q-cartao ct-mudou cx-mudou"><h2>O que mudou</h2>
        ${grupos.length ? `<ul class="cx-subiu">${grupos.map(([l, i, t, k]) => `<li><span class="q-tag ${k}">${ica(i)} ${l.length}</span><span class="cx-subiu-t">${t}</span><span class="q-acoes">${fichas(l)}</span></li>`).join('')}</ul>` : '<p class="qv-nota">Todas lembradas: os intervalos cresceram.</p>'}
      </section>
      <p class="cx-hoje-linha"><span>${ica('target')}<b>Missão</b> 20 de 20 palavras</span><i>·</i><span>${ica('flame')}<b>Sequência</b> ${R.inteiro ? '5 dias' : '4 dias'}</span></p>
      <div class="q-faixa cx-fim-pe" role="toolbar" aria-label="O que fazer agora">
        <button type="button" class="q-ctl pri" data-ct="fim-praticar">${ica('sparkles')} ${n ? `Praticar ${n === 1 ? 'a que escapou' : `as ${n} que escaparam`}` : 'Praticar de outro jeito'}</button>
        <button type="button" class="q-ctl" data-ct="fim-voltar">${ica('layers')} Voltar</button>
      </div></div>`;
  }
  function ctEntradaDoFim() {
    if (!polido() || reduz()) return;
    const quieto = QS.has('quieto');
    $$('.ct-fim > *:not(.q-cab):not(.cx-fim-pe)', tela).forEach((x, i) => anima(x, ENTRA(26), { d: 620, atraso: 80 + i * 70 }));
    const ic0 = $('.qr-fecho .q-ic', tela);
    if (ic0) anima(ic0, [{ transform: 'scale(0.3) rotate(-24deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 820, atraso: 200, e: MOLA });
    $$('.qr-numeros .q-num b', tela).forEach((b, i) => {
      const m = b.textContent.match(/^(\+?)(\d+)(%?)$/);
      if (m) contar((v) => (b.textContent = m[1] + v + m[3]), 0, +m[2], 900 + i * 80);
    });
    $$('.cx-subiu .q-chip', tela).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)' }], { d: 420, atraso: 520 + i * 45, e: MOLA }));
    if (!quieto) setTimeout(() => atual === 'estudo' && ctR?.fim && !ctR.pr && confete(70), 320 * K());
  }
  tela.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct-abrir]');
    if (b && atual === 'estudo') ctAbrirPalavra(b.dataset.ctAbrir, { gatilho: b });
  });
