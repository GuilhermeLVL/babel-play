  /* ==========================================================================
     CARTÕES — protótipo CONCEITUAL (clone do protótipo de anúncios e planos).
     Mesmo escopo de prototipo.js e dos outros módulos; entra por último.

     Materializa docs/auditoria/2026-10-10-cartoes-e-descoberta.md (ei-polimento):
       cartoes.js   a tela (Hoje, Baralhos, Palavras, Trazer e levar, Memória), os dados e as folhas;
       cartoes2.js  a revisão (a rodada de estudo, os formatos, os gestos, o fim);
       cartoes3.js  a navegação A, B e C, as portas do que estava escondido, a barra e o Mapa.

     A marcação da revisão e do catálogo é a dos componentes reais do repositório
     (RevisaoDoQuest.tsx, VocabularioDoQuest.tsx, CatalogoDoQuest.tsx, GavetaDaPalavra.tsx) e o CSS
     deles entra sem edição (producao-revisao.css, producao-vocabulario.css). Os dados são de exemplo
     e os mesmos em todas as abas. Nada aqui grava, toca áudio gravado ou lê arquivo de verdade.
     ========================================================================== */

  /* ---- Ícones que a captura não trouxe (os mesmos lucide do app) ---------------- */
  Object.assign(SIMPLES, {
    flag: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>'),
    'undo-2': svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
    snowflake: svg('<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>'),
    image: svg('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
    upload: svg('<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'),
    'circle-x': svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
    'circle-check': svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    'wifi-off': svg('<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>'),
    tag: svg('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
    'pen-line': svg('<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'),
    'square-check': svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>'),
    'external-link': svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    'triangle-alert': svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    clipboard: svg('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    'party-popper': svg('<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    'notebook-pen': svg('<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>'),
    phone: svg('<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'),
    'share-2': svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>'),
    clapperboard: svg('<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    'circle-help': svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
    ellipsis: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    hand: svg('<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  });

  /* ---- Estado da tela ------------------------------------------------------------ */
  const CT_NOMES = { cartoes: 'Cartões', memoria: 'Memória', estudar: 'Estudar' };
  const CT_HOJES = ['normal', 'vazio', 'primeiro', 'feito', 'pilha'];
  const CT = {
    nav: ['atual', 'a', 'b', 'c', 'd'].includes(QS.get('nav')) ? QS.get('nav') : 'd',
    nome: CT_NOMES[QS.get('nome')] ? QS.get('nome') : 'cartoes',
    hoje: CT_HOJES.includes(QS.get('hoje')) ? QS.get('hoje') : 'normal',
    /* Hoje: a faixa de estado numa linha (enxuta) ou os três cartões de antes, para comparar. */
    resumo: QS.get('resumo') === 'tres' ? 'tres' : 'faixa',
    voltaDaMemoria: 0,
    ajMais: false,
    ankiAgenda: 'agenda',
    desfazer: null,
    idioma: 'tudo',
    baralho: 'tudo',
    pilha: 'teto',
    tetoDaPilha: 40,
    anki: 0,
    lista: 'dashboard ; painel\nroadmap ; roteiro, plano de entregas\nto ship ; entregar, lançar\nrelease ; lançamento\nfair enough\ncustomers ; clientes',
    criadosDaLegenda: new Set(),
    notasViradas: new Set(),
    f: { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', ordem: 'vence', abertos: false, sel: false, marcados: new Set() },
  };
  /* Os "Ajustes da memória": valem para a tela e para a revisão. */
  const CT_AJ_PADRAO = { retencao: 90, novas: 10, revisoes: 100, passos: '10 min', ordem: 'vencidas', misturaNovas: 'misturadas', botoes: 4, formato: 'lembrar', alternar: true, original: true, ouvir: true, dificil: 8, lembrete: true, leves: [] };
  const CT_AJ = { ...CT_AJ_PADRAO, leves: [] };
  if (QS.get('botoes') === '2') CT_AJ.botoes = 2;
  if (['lembrar', 'escolher', 'digitar', 'lacuna'].includes(QS.get('formato'))) CT_AJ.formato = QS.get('formato');
  const ctNome = () => CT_NOMES[CT.nome];
  /* Com a tela chamada "Cartões", a aba do navegador não pode ter o mesmo nome; idem para "Memória". */
  const ctNomeDaAba = (i) => ['Hoje', 'Baralhos', CT.nome === 'cartoes' ? 'Palavras' : 'Cartões', 'Trazer e levar', CT.nome === 'memoria' ? 'Números' : 'Memória'][i];

  /* ---- Dados de exemplo: os mesmos em Hoje, Baralhos, Palavras e Memória --------- */
  /* n = [novas de hoje, aprendendo, a revisar hoje]; pilha = vencidas no estado "pilha acumulada". */
  const CT_BARALHOS = [
    { id: 'tudo', g: 'tudo', tipo: 'Automático', nome: 'Tudo', sub: 'Todos os idiomas e todas as origens', i: 'layers', total: 422, n: [5, 3, 18], pilha: 240, ret: 88, prox: 'amanhã, 8' },
    { id: 'en', g: 'idioma', tipo: 'Idioma', nome: 'Inglês', sub: '4 sessões, a Trilha e 1 baralho do Anki', i: 'languages', total: 318, n: [4, 3, 15], pilha: 186, ret: 89, prox: 'amanhã, 6' },
    { id: 'es', g: 'idioma', tipo: 'Idioma', nome: 'Espanhol', sub: '1 sessão e 1 baralho do Anki', i: 'languages', total: 104, n: [1, 0, 3], pilha: 54, ret: 85, prox: 'amanhã, 2' },
    { id: 's-reuniao', g: 'sessao', tipo: 'Sessão de áudio', nome: 'Reunião de produto: roadmap do trimestre', sub: 'hoje · 38 min · Inglês', i: 'mic', lang: 'en', total: 37, n: [3, 2, 4], pilha: 31, ret: 91, prox: 'amanhã, 3' },
    { id: 's-podcast', g: 'sessao', tipo: 'Sessão de áudio', nome: 'Podcast: The science of sleep', sub: 'ontem · 52 min · Inglês', i: 'mic', lang: 'en', total: 52, n: [0, 1, 5], pilha: 44, ret: 86, prox: 'amanhã, 2' },
    { id: 's-aula', g: 'sessao', tipo: 'Sessão de vídeo', nome: 'Aula de espanhol: pretérito perfeito', sub: '3 out · 24 min · Espanhol', i: 'monitor', lang: 'es', total: 24, n: [1, 0, 2], pilha: 20, ret: 84, prox: 'amanhã, 1' },
    { id: 's-lumen', g: 'sessao', tipo: 'Sessão de áudio', nome: 'Entrevista com a designer da Lumen', sub: '1 out · 17 min · Inglês', i: 'mic', lang: 'en', total: 18, n: [0, 0, 1], pilha: 14, ret: 90, prox: 'seg, 2' },
    { id: 's-artigo', g: 'sessao', tipo: 'Texto', nome: 'Artigo: The future of remote work', sub: '28 set · texto · Inglês', i: 'book-open', lang: 'en', total: 31, n: [0, 0, 2], pilha: 23, ret: 89, prox: 'amanhã, 1' },
    { id: 'trilha', g: 'trilha', tipo: 'Trilha', nome: 'Trilha de vocabulário · A1', sub: '60 de 704 palavras ativadas · Inglês', i: 'graduation-cap', lang: 'en', total: 60, de: 704, n: [1, 0, 1], pilha: 22, ret: 93, prox: 'ter, 4' },
    { id: 'a-pv', g: 'anki', tipo: 'Anki', nome: 'English Phrasal Verbs (B1–B2)', sub: '120 de 480 notas ativadas · trazido em 12 set', i: 'wallet-cards', lang: 'en', total: 120, de: 480, n: [0, 0, 2], pilha: 52, ret: 87, prox: 'amanhã, 1' },
    { id: 'a-es', g: 'anki', tipo: 'Anki', nome: 'Español: 1000 palabras frecuentes', sub: '80 de 1.000 notas ativadas · trazido em 20 set', i: 'wallet-cards', lang: 'es', total: 80, de: 1000, n: [0, 0, 1], pilha: 34, ret: 86, prox: 'amanhã, 1' },
    { id: 'dificeis', g: 'cuidar', tipo: 'Automático', nome: 'Difíceis', sub: 'Erradas 8 vezes ou mais: vale reescrever, trocar a frase ou suspender', i: 'triangle-alert', total: 6, n: [0, 0, 2], pilha: 4, ret: 52, prox: 'amanhã, 1' },
    { id: 'suspensas', g: 'cuidar', tipo: 'Automático', nome: 'Suspensas', sub: 'Fora da revisão até você reativar', i: 'pause', total: 9, n: null, pilha: 0, ret: null, prox: '—' },
  ];
  const ctBaralho = (id) => CT_BARALHOS.find((b) => b.id === id) || CT_BARALHOS[0];
  /* As três contagens de um baralho, conforme o estado do dia escolhido na barra. */
  function ctN(b) {
    if (!b.n) return null;
    if (CT.hoje === 'feito') return [0, 0, 0];
    if (CT.hoje === 'pilha') return [b.n[0], b.n[1], b.pilha];
    return b.n;
  }
  const CT_FASES = { total: 422, novas: 96, aprendendo: 41, jovens: 148, maduras: 128, suspensas: 9, dificeis: 6 };
  const CT_PREV7 = [8, 14, 21, 9, 17, 12, 26];
  const CT_DIAS7 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']; /* a partir de amanhã, domingo 11 */
  const CT_PREV30 = [8, 14, 21, 9, 17, 12, 26, 11, 15, 19, 8, 22, 13, 10, 18, 9, 24, 12, 16, 7, 20, 14, 11, 28, 9, 13, 17, 10, 21, 15];
  const CT_RET_SEMANAS = [84, 86, 85, 88, 87, 89, 88, 91];
  const CT_BOTOES = [['Errei', 73, 'e'], ['Difícil', 55, 'd'], ['Bom', 416, 'b'], ['Fácil', 68, 'f']];
  const CT_SESSOES = { 's-reuniao': ['Reunião de produto', 'mic'], 's-podcast': ['The science of sleep', 'mic'], 's-aula': ['Aula de espanhol', 'monitor'], 's-lumen': ['Entrevista da Lumen', 'mic'], 's-artigo': ['The future of remote work', 'book-open'] };

  /* Os cartões de exemplo. est: nova | aprendendo | revisao | suspensa. hoje: entra na fila de hoje.
     frases: [original, tradução, baralho de origem, quem falou, tempo]; sem "quem", não há fala gravada. */
  const ctC = (id, p, ipa, t, lang, nv, b, est, hoje, vence, lapsos, iv, frases, x = {}) => ({ id, p, ipa, t, lang, nv, b, est, hoje, vence, lapsos, iv, frases, tags: [], ...x });
  const CT_CARTOES = [
    ctC('dashboard', 'dashboard', '/ˈdæʃ.bɔːrd/', 'painel', 'en', 'B1', 's-reuniao', 'revisao', true, 'hoje', 1, ['< 10 min', '2 d', '4 d', '9 d'], [['We ship it today, but the dashboard needs one more review.', 'Entregamos hoje, mas o painel precisa de mais uma revisão.', 's-reuniao', 'Leo', '00:11'], ['The dashboard shows how many hours you actually slept.', 'O painel mostra quantas horas você dormiu de verdade.', 's-podcast', 'Narrador', '12:40'], ['Her first job was redesigning the sales dashboard.', 'O primeiro trabalho dela foi redesenhar o painel de vendas.', 's-lumen', 'Marta', '03:15']], { tags: ['trabalho'], estab: 4.2, dif: 5.1, acertos: '6 de 7' }),
    ctC('roadmap', 'roadmap', '/ˈroʊd.mæp/', 'roteiro, plano de entregas', 'en', 'B2', 's-reuniao', 'nova', true, 'nova', 0, ['< 10 min', '1 d', '2 d', '4 d'], [['So, are we still shipping the roadmap today?', 'Então, ainda vamos entregar o roteiro hoje?', 's-reuniao', 'Ana', '00:04']], { tags: ['trabalho'] }),
    ctC('madrugar', 'madrugar', '/ma.ðɾuˈɣaɾ/', 'acordar muito cedo', 'es', 'B1', 's-aula', 'revisao', true, 'hoje', 2, ['< 10 min', '1 d', '3 d', '6 d'], [['Hoy he madrugado para estudiar antes del trabajo.', 'Hoje acordei muito cedo para estudar antes do trabalho.', 's-aula', 'Profesora', '08:22']], { img: true, estab: 2.8, dif: 6.0, acertos: '4 de 6' }),
    ctC('thorough', 'thorough', '/ˈθɝː.oʊ/', 'minucioso, completo', 'en', 'B2', 's-podcast', 'revisao', true, 'hoje', 7, ['< 10 min', '1 d', '2 d', '4 d'], [['The study was thorough, but the group was small.', 'O estudo foi minucioso, mas o grupo era pequeno.', 's-podcast', 'Narrador', '07:58'], ['She did a thorough review of every screen.', 'Ela fez uma revisão minuciosa de cada tela.', 's-lumen', 'Marta', '09:02']], { tags: ['difícil'], estab: 1.1, dif: 8.7, acertos: '5 de 12' }),
    ctC('walk-through', 'walk through', '/wɔːk θruː/', 'explicar passo a passo', 'en', 'B1', 's-reuniao', 'aprendendo', true, 'em 8 min', 0, ['< 10 min', '10 min', '1 d', '3 d'], [['Fair enough. Can you walk me through the changes?', 'Justo. Você pode me explicar as mudanças?', 's-reuniao', 'Ana', '00:19']], { tags: ['trabalho'] }),
    ctC('put-off', 'put off', '/pʊt ɔːf/', 'adiar', 'en', 'B1', 'a-pv', 'revisao', true, 'hoje', 0, ['< 10 min', '3 d', '7 d', '15 d'], [["Don't put off until tomorrow what you can do today.", 'Não deixe para amanhã o que você pode fazer hoje.', 'a-pv', '', '']], { tags: ['phrasal-verbs', 'anki'], estab: 6.9, dif: 4.2, acertos: '5 de 5' }),
    ctC('commute', 'commute', '/kəˈmjuːt/', 'trajeto até o trabalho', 'en', 'B2', 's-artigo', 'revisao', true, 'hoje', 1, ['< 10 min', '2 d', '5 d', '11 d'], [['Without the commute, people gained almost an hour a day.', 'Sem o trajeto, as pessoas ganharam quase uma hora por dia.', 's-artigo', '', '']], { estab: 5.0, dif: 5.5, acertos: '4 de 5' }),
    ctC('nap', 'nap', '/næp/', 'cochilo', 'en', 'A2', 's-podcast', 'aprendendo', true, 'em 4 min', 1, ['< 10 min', '10 min', '1 d', '3 d'], [['A short nap can restore your attention for hours.', 'Um cochilo curto pode devolver a atenção por horas.', 's-podcast', 'Narrador', '15:31']]),
    ctC('onboarding', 'onboarding', '/ˈɑːnˌbɔːr.dɪŋ/', 'entrada, primeiros passos', 'en', 'B2', 's-reuniao', 'nova', true, 'nova', 0, ['< 10 min', '1 d', '2 d', '4 d'], [['We rewrote the onboarding and cut the loading time in half.', 'Reescrevemos a entrada e cortamos o tempo de carregamento pela metade.', 's-reuniao', 'Leo', '00:26']], { tags: ['trabalho'] }),
    ctC('complain', 'complain', '/kəmˈpleɪn/', 'reclamar', 'en', 'B1', 's-reuniao', 'revisao', true, 'hoje', 0, ['< 10 min', '4 d', '9 d', '20 d'], [["That's a big deal. Customers were complaining about it.", 'Isso é importante. Os clientes estavam reclamando disso.', 's-reuniao', 'Ana', '00:38']], { estab: 8.8, dif: 3.9, acertos: '7 de 7' }),
    ctC('deprive', 'deprive', '/dɪˈpraɪv/', 'privar', 'en', 'C1', 's-podcast', 'revisao', true, 'hoje', 3, ['< 10 min', '1 d', '3 d', '7 d'], [['If you deprive the brain of sleep, memory is the first to suffer.', 'Se você priva o cérebro de sono, a memória é a primeira a sofrer.', 's-podcast', 'Narrador', '04:12']], { estab: 2.4, dif: 7.1, acertos: '4 de 7' }),
    ctC('todavia', 'todavía', '/to.ðaˈβi.a/', 'ainda', 'es', 'A2', 's-aula', 'nova', true, 'nova', 0, ['< 10 min', '1 d', '2 d', '4 d'], [['Todavía no he terminado la tarea.', 'Ainda não terminei a tarefa.', 's-aula', 'Profesora', '11:05']], { img: true }),
    ctC('release', 'release', '/rɪˈliːs/', 'lançamento', 'en', 'B1', 's-reuniao', 'revisao', true, 'hoje', 0, ['< 10 min', '5 d', '12 d', '26 d'], [["Then let's celebrate after the release.", 'Então vamos comemorar depois do lançamento.', 's-reuniao', 'Leo', '00:45']], { tags: ['trabalho'], estab: 11.5, dif: 3.2, acertos: '8 de 8' }),
    ctC('drowsy', 'drowsy', '/ˈdraʊ.zi/', 'sonolento', 'en', 'B2', 's-podcast', 'revisao', true, 'hoje', 1, ['< 10 min', '2 d', '4 d', '9 d'], [['You feel drowsy after lunch for a reason.', 'Você fica sonolento depois do almoço por um motivo.', 's-podcast', 'Narrador', '18:47']], { estab: 3.9, dif: 5.8, acertos: '3 de 4' }),
    ctC('big-deal', 'big deal', '/bɪɡ diːl/', 'algo importante, grande coisa', 'en', 'B1', 's-reuniao', 'aprendendo', true, 'em 9 min', 0, ['< 10 min', '10 min', '1 d', '3 d'], [["That's a big deal. Customers were complaining about it.", 'Isso é importante. Os clientes estavam reclamando disso.', 's-reuniao', 'Ana', '00:38']]),
    ctC('layout', 'layout', '/ˈleɪ.aʊt/', 'disposição dos elementos', 'en', 'B1', 's-lumen', 'revisao', true, 'hoje', 0, ['< 10 min', '6 d', '14 d', '30 d'], [['We tried four layouts before this one felt right.', 'Tentamos quatro disposições até esta parecer certa.', 's-lumen', 'Marta', '05:44']], { estab: 13.2, dif: 3.0, acertos: '6 de 6' }),
    ctC('overnight', 'overnight', '/ˌoʊ.vɚˈnaɪt/', 'durante a noite; da noite para o dia', 'en', 'B2', 's-podcast', 'revisao', true, 'hoje', 0, ['< 10 min', '3 d', '8 d', '17 d'], [['Memories are consolidated overnight.', 'As memórias são consolidadas durante a noite.', 's-podcast', 'Narrador', '09:20']], { estab: 7.4, dif: 4.4, acertos: '5 de 5' }),
    ctC('fair-enough', 'fair enough', '/fer ɪˈnʌf/', 'justo, faz sentido', 'en', 'B2', 's-reuniao', 'nova', true, 'nova', 0, ['< 10 min', '1 d', '2 d', '4 d'], [['Fair enough. Can you walk me through the changes?', 'Justo. Você pode me explicar as mudanças?', 's-reuniao', 'Ana', '00:19']]),
    ctC('ship', 'ship', '/ʃɪp/', 'entregar, lançar', 'en', 'B1', 's-reuniao', 'revisao', true, 'hoje', 0, ['< 10 min', '4 d', '10 d', '22 d'], [['We ship it today, but the dashboard needs one more review.', 'Entregamos hoje, mas o painel precisa de mais uma revisão.', 's-reuniao', 'Leo', '00:11']], { tags: ['trabalho'], estab: 9.6, dif: 3.6, acertos: '6 de 6' }),
    ctC('though', 'though', '/ðoʊ/', 'embora; no entanto', 'en', 'B1', 's-podcast', 'revisao', true, 'hoje', 8, ['< 10 min', '1 d', '2 d', '4 d'], [['It works, though nobody knows exactly why.', 'Funciona, embora ninguém saiba exatamente por quê.', 's-podcast', 'Narrador', '21:03']], { tags: ['difícil'], estab: 0.9, dif: 9.1, acertos: '6 de 14' }),
    ctC('tarea', 'tarea', '/taˈɾe.a/', 'tarefa, lição', 'es', 'A2', 's-aula', 'revisao', true, 'hoje', 0, ['< 10 min', '3 d', '7 d', '15 d'], [['Todavía no he terminado la tarea.', 'Ainda não terminei a tarefa.', 's-aula', 'Profesora', '11:05']], { img: true, estab: 6.3, dif: 4.0, acertos: '4 de 4' }),
    ctC('burnout', 'burnout', '/ˈbɝːn.aʊt/', 'esgotamento', 'en', 'B2', 's-artigo', 'revisao', true, 'hoje', 0, ['< 10 min', '4 d', '9 d', '19 d'], [['Remote work did not end burnout; it moved it home.', 'O trabalho remoto não acabou com o esgotamento; levou-o para casa.', 's-artigo', '', '']], { estab: 8.1, dif: 4.1, acertos: '5 de 5' }),
    ctC('shelf', 'shelf', '/ʃelf/', 'prateleira', 'en', 'A1', 'trilha', 'nova', true, 'nova', 0, ['< 10 min', '1 d', '2 d', '4 d'], [['The book is on the top shelf.', 'O livro está na prateleira de cima.', 'trilha', '', '']]),
    ctC('towel', 'towel', '/ˈtaʊ.əl/', 'toalha', 'en', 'A1', 'trilha', 'revisao', true, 'hoje', 0, ['< 10 min', '7 d', '16 d', '34 d'], [['Bring a towel if you want to swim.', 'Traga uma toalha se quiser nadar.', 'trilha', '', '']], { estab: 15.0, dif: 2.6, acertos: '5 de 5' }),
    ctC('figure-out', 'figure out', '/ˈfɪɡ.jɚ aʊt/', 'descobrir, entender', 'en', 'B1', 'a-pv', 'revisao', true, 'hoje', 1, ['< 10 min', '2 d', '5 d', '11 d'], [["I can't figure out how this machine works.", 'Não consigo entender como esta máquina funciona.', 'a-pv', '', '']], { tags: ['phrasal-verbs', 'anki'], estab: 4.8, dif: 5.2, acertos: '4 de 5' }),
    ctC('aunque', 'aunque', '/ˈawŋ.ke/', 'embora, ainda que', 'es', 'B1', 'a-es', 'revisao', true, 'hoje', 0, ['< 10 min', '2 d', '5 d', '10 d'], [['Aunque llueva, saldremos a caminar.', 'Mesmo que chova, vamos sair para caminhar.', 'a-es', '', '']], { tags: ['anki', 'frecuentes'], estab: 4.5, dif: 5.0, acertos: '3 de 4' }),
    /* fora da fila de hoje: aparecem só no navegador */
    ctC('celebrate', 'celebrate', '/ˈsel.ə.breɪt/', 'comemorar', 'en', 'A2', 's-reuniao', 'revisao', false, 'em 3 d', 0, [], [["Then let's celebrate after the release.", 'Então vamos comemorar depois do lançamento.', 's-reuniao', 'Leo', '00:45']], { estab: 12.0, dif: 3.1, acertos: '6 de 6' }),
    ctC('customers', 'customers', '/ˈkʌs.tə.mɚz/', 'clientes', 'en', 'A2', 's-reuniao', 'revisao', false, 'em 12 d', 0, [], [["That's a big deal. Customers were complaining about it.", 'Isso é importante. Os clientes estavam reclamando disso.', 's-reuniao', 'Ana', '00:38']], { tags: ['trabalho'], estab: 21.4, dif: 2.4, acertos: '7 de 7' }),
    ctC('loading', 'loading', '/ˈloʊ.dɪŋ/', 'carregamento', 'en', 'B1', 's-reuniao', 'suspensa', false, 'suspensa', 0, [], [['We rewrote the onboarding and cut the loading time in half.', 'Reescrevemos a entrada e cortamos o tempo de carregamento pela metade.', 's-reuniao', 'Leo', '00:26']]),
    ctC('restore', 'restore', '/rɪˈstɔːr/', 'restaurar, devolver', 'en', 'B2', 's-podcast', 'nova', false, 'nova', 0, [], [['A short nap can restore your attention for hours.', 'Um cochilo curto pode devolver a atenção por horas.', 's-podcast', 'Narrador', '15:31']]),
    ctC('desarrollar', 'desarrollar', '/de.sa.roˈʎaɾ/', 'desenvolver', 'es', 'B1', 'a-es', 'nova', false, 'nova', 0, [], [['Queremos desarrollar un proyecto nuevo.', 'Queremos desenvolver um projeto novo.', 'a-es', '', '']], { tags: ['anki', 'frecuentes'] }),
    ctC('give-up', 'give up', '/ɡɪv ʌp/', 'desistir', 'en', 'A2', 'a-pv', 'revisao', false, 'em 6 d', 2, [], [["Don't give up before the third try.", 'Não desista antes da terceira tentativa.', 'a-pv', '', '']], { tags: ['phrasal-verbs', 'anki'], estab: 9.0, dif: 4.6, acertos: '6 de 8' }),
  ];
  const ctCarta = (id) => CT_CARTOES.find((c) => c.id === id);
  const CT_FILA = ['dashboard', 'roadmap', 'madrugar', 'thorough', 'walk-through', 'put-off', 'commute', 'nap', 'onboarding', 'complain', 'deprive', 'todavia', 'release', 'drowsy', 'big-deal', 'layout', 'overnight', 'fair-enough', 'ship', 'though', 'tarea', 'burnout', 'shelf', 'towel', 'figure-out', 'aunque'];
  const CT_ESTADO = { nova: ['Nova', 'acc'], aprendendo: ['Aprendendo', 'warn'], revisao: ['Em revisão', 'ok'], suspensa: ['Suspensa', 'neu'] };
  const ctDificil = (c) => c.lapsos >= CT_AJ.dificil || c.tags.includes('difícil');
  const ctNomeDoBaralho = (id) => (CT_SESSOES[id] ? CT_SESSOES[id][0] : { trilha: 'Trilha · A1', 'a-pv': 'Anki · Phrasal Verbs', 'a-es': 'Anki · 1000 palabras' }[id] || '');
  /* Um cartão pertence ao baralho "pai" (idioma, tudo, difíceis…) além do baralho de origem. */
  const ctNoBaralho = (c, id) =>
    id === 'tudo' || c.b === id || (id === 'en' && c.lang === 'en') || (id === 'es' && c.lang === 'es') || (id === 'sessoes' && c.b.startsWith('s-')) || (id === 'dificeis' && ctDificil(c)) || (id === 'suspensas' && c.est === 'suspensa');

  /* ---- Peças pequenas ------------------------------------------------------------ */
  const ctTres = (n, comRotulo) =>
    n
      ? `<span class="ct-tres" aria-label="${n[0]} novas, ${n[1]} aprendendo, ${n[2]} a revisar" title="${n[0]} novas · ${n[1]} aprendendo · ${n[2]} a revisar">${[['nv', 'novas'], ['ap', 'aprendendo'], ['rv', 'a revisar']].map(([k, r], i) => `<b class="${k} ${n[i] ? '' : 'zero'}">${num(n[i])}${comRotulo ? `<small>${r}</small>` : ''}</b>`).join('')}</span>`
      : '<span class="ct-tres"><b class="zero">fora da revisão</b></span>';
  const ctMin = (cartoes) => {
    const m = Math.max(1, Math.round((cartoes * 13) / 60));
    return `uns ${m} min`;
  };
  const ctCabecaDoCartao = (h, p, extra = '', n = 2) => `<div class="q-secao"><header><div><h${n}>${h}</h${n}>${p ? `<p>${p}</p>` : ''}</div>${extra}</header></div>`;
  /* Diálogo no mesmo molde dos submenus reais (dlg-cab, dlg-corpo, dlg-pe), aberto pelo abrirDialogo do clone. */
  const ctDlg = (icone, titulo, sub, corpo, pe = '', classe = '') =>
    `<dialog class="qj qj-painel medio m-auto ct-dlg ${classe}" aria-label="${esc(titulo)}"><div class="dlg-cab"><span class="q-ic" aria-hidden="true">${ica(icone)}</span><div><h2>${titulo}</h2>${sub ? `<p class="qj-nota">${sub}</p>` : ''}</div><button type="button" class="x" aria-label="Fechar">${ica('x')}</button></div><div class="dlg-corpo qj-painel-corpo">${corpo}</div>${pe ? `<div class="dlg-pe">${pe}</div>` : ''}</dialog>`;
  function ctAbrir(chave, htmlDoDialogo, gatilho, aoClicar) {
    $$('dialog.ct-dlg, dialog.gaveta').forEach((x) => (x.close(), x.remove()));
    D.sub[chave] = { html: htmlDoDialogo };
    abrirDialogo(chave, gatilho);
    const d = app.lastElementChild;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ctDica) return toast(b.dataset.ctDica, 5200);
      if (aoClicar) aoClicar(b, d, e);
    });
    return d;
  }
  /* Número com menos e mais (o `Passo` de RevisaoDoQuest.tsx). */
  const ctPasso = (chave, rotulo, valor) =>
    `<span class="qr-passo" data-ct-passo="${chave}"><button type="button" class="q-ctl" aria-label="Diminuir: ${rotulo}" data-ct-menos>${ica('minus')}</button><input type="number" inputmode="numeric" value="${valor}" aria-label="${rotulo}" readonly><button type="button" class="q-ctl" aria-label="Aumentar: ${rotulo}" data-ct-mais>${ica('plus')}</button></span>`;
  const ctEscolha = (chave, rotulo, atual, opcoes) =>
    `<div class="q-abas q-seg" role="group" aria-label="${rotulo}" data-ct-escolha="${chave}">${opcoes.map(([v, r]) => `<button type="button" class="q-aba" aria-pressed="${String(atual) === String(v)}" data-v="${v}">${r}</button>`).join('')}</div>`;

  /* ==========================================================================
     A TELA
     ========================================================================== */
  /* Dica no ícone: o parágrafo explicativo de antes mora aqui. No toque, vira aviso. */
  const ctDica = (t) => `<button type="button" class="ct-dica" data-ct-dica="${esc(t)}" title="${esc(t)}" aria-label="O que é isto">${ica('circle-help')}</button>`;
  /* "Praticar de outro jeito": a folha é do outro módulo (cartoes4.js). */
  const ctOutroJeito = (o) => (window.ctPraticar ? window.ctPraticar(o) : toast(`Praticar de outro jeito · ${o.rotulo} · ${o.n} ${o.n === 1 ? 'palavra' : 'palavras'}: a folha das práticas abre aqui.`, 4200));

  function ctCab(dentro, i = 0) {
    if (dentro)
      return `<header class="q-cab ct-cab ct-cab-dentro"><button type="button" class="q-ctl q-voltar" data-ct="voltar-da-memoria" aria-label="Voltar para ${ctNome()}">${ica('arrow-left')}<span>Voltar</span></button><h1>${ctNomeDaAba(4)}</h1><span class="q-espaco"></span>
        <button type="button" class="q-ctl" data-ct="ajustes" aria-label="Ajustes da memória">${ica('sliders-horizontal')}<span>Ajustes</span></button></header>`;
    return `<header class="q-cab ct-cab fs-cab"><h1>${ctNome()}</h1>${ctSegPraticar('cartoes')}${fsFicha()}${ctAbas(i)}<span class="q-espaco"></span>
      <button type="button" class="q-ctl ct-so-icone" data-ct="menu" aria-label="Mais opções: palavra nova, trazer e levar, ajustes da memória, memória" title="Palavra nova, trazer e levar, ajustes da memória, memória">${ica('ellipsis')}</button></header>`;
  }
  function ctAbas(i) {
    const icones = ['calendar-check', 'layers', 'book-open'];
    const ns = [null, CT.hoje === 'vazio' ? 0 : CT.hoje === 'primeiro' ? 2 : fxFontes().length, CT.hoje === 'vazio' ? 0 : CT.hoje === 'primeiro' ? 34 : fsBaralho().total];
    /* A aba Baralhos saiu: o seletor de conteúdo é global e o catálogo dele faz esse papel, de qualquer tela.
       O botão fica no lugar, escondido, só para os índices das abas (0 Hoje, 2 Palavras, 4 Memória) não mudarem. */
    return `<div class="q-abas ct-abas" role="tablist" aria-label="Seções de ${ctNome()}">${icones.map((ico, k) => aba(`${ica(ico)}${ctNomeDaAba(k)}${ns[k] != null ? `<span class="n">${num(ns[k])}</span>` : ''}`, k === i, `data-ct-aba="${k}"${k === 1 ? ' hidden disabled' : ''}`)).join('')}</div>`;
  }

  /* ---- Hoje ----------------------------------------------------------------------- */
  const ctHojeN = () => fsHojeN(); /* a contagem de hoje é a do conteúdo escolhido no seletor */
  function ctSemana(feitoHoje) {
    /* dom 4 a sáb 10 de outubro: terça sem estudo, coberta por um congelamento. */
    const dias = [['dom', 'fora'], ['seg', 'feito'], ['ter', 'gelo'], ['qua', 'feito'], ['qui', 'feito'], ['sex', 'feito'], ['sáb', feitoHoje ? 'feito' : 'hoje']];
    return `<ol class="ct-semana" aria-label="Os últimos sete dias">${dias
      .map(([d, e]) => `<li class="${e}" title="${{ fora: 'Sem estudo', feito: 'Estudou', gelo: 'Sem estudo: um congelamento cobriu o dia', hoje: 'Hoje, ainda por estudar' }[e]}"><i>${e === 'feito' ? ica('check') : e === 'gelo' ? ica('snowflake') : ''}</i><small>${d}</small></li>`)
      .join('')}</ol>`;
  }
  /* A versão de antes (três cartões), guardada para a chave "Hoje: faixa | três cartões" da barra. */
  function ctTresCartoes(feitoHoje) {
    const dias = feitoHoje ? 5 : 4;
    return `<div class="q-grade g3 ct-tres-cartoes" data-ct-alvo="estado">
      <section class="q-cartao ct-seq" data-ct-alvo="sequencia">${ctCabecaDoCartao(`${dias} dias seguidos`, feitoHoje ? 'Hoje já conta. Recorde: 11 dias.' : 'Estudar hoje faz 5. Recorde: 11 dias.', `<span class="q-ic" aria-hidden="true">${ica('flame')}</span>`)}
        ${ctSemana(feitoHoje)}
        <p class="qv-nota ct-com-icone">${ica('snowflake')}<span>2 congelamentos guardados. Na terça você não estudou e um deles cobriu o dia: a sequência não quebrou.</span></p></section>
      <section class="q-cartao ct-ret">${ctCabecaDoCartao('Retenção da semana', 'Do que você revisou, quanto lembrou.', `<span class="q-ic" aria-hidden="true">${ica('brain')}</span>`)}
        <div class="ct-ret-corpo"><div class="px-anel" style="--pct:91"><b>91%</b><span>meta ${CT_AJ.retencao}%</span></div>
        <p class="qv-nota">Dentro da meta. Nos últimos 30 dias ficou em 88%: é o normal enquanto o baralho é novo.</p></div>
        <button type="button" class="q-ctl" data-ct-ir-aba="4">${ica('chart-column')} Ver a ${ctNomeDaAba(4).toLowerCase()}</button></section>
      <section class="q-cartao ct-teto">${ctCabecaDoCartao('Teto de hoje', 'Contado por dia de verdade, não por rodada.', `<span class="q-ic" aria-hidden="true">${ica('gauge')}</span>`)}
        <div class="ct-medida"><span class="q-rotulo">Novas</span><b>${feitoHoje ? CT_AJ.novas : 5} de ${CT_AJ.novas}</b><span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${CT_AJ.novas}" aria-valuenow="${feitoHoje ? CT_AJ.novas : 5}" aria-label="Novas de hoje"><span style="width:${feitoHoje ? 100 : 50}%"></span></span></div>
        <div class="ct-medida"><span class="q-rotulo">Revisões</span><b>${feitoHoje ? 30 : 12} de ${CT_AJ.revisoes}</b><span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${CT_AJ.revisoes}" aria-valuenow="${feitoHoje ? 30 : 12}" aria-label="Revisões de hoje"><span style="width:${feitoHoje ? 30 : 12}%"></span></span></div>
        <button type="button" class="q-ctl" data-ct="ajustes">${ica('sliders-horizontal')} Mudar o teto</button></section>
    </div>`;
  }
  /* A faixa de estado: a chama, o anel e a barra de novas numa linha. O lado da memória abre a Memória;
     o lado das novas abre a folha dos ajustes (mudar o limite do dia continua a dois toques). */
  function ctFaixaDeEstado(feitoHoje) {
    const dias = feitoHoje ? 5 : 4;
    const novas = feitoHoje ? CT_AJ.novas : Math.min(5, CT_AJ.novas);
    const mem = ctNomeDaAba(4);
    return `<div class="q-cartao ct-estado" data-ct-alvo="estado" role="group" aria-label="Como está a sua memória">
      <button type="button" class="ct-estado-mem" data-ct-ir-aba="4" aria-label="${dias} dias seguidos, 91% lembrado na semana. Abrir a ${mem}" title="Abrir a ${mem}: sequência, retenção, previsão e calendário">
        <span class="ct-estado-item ct-chama"><i>${ica('flame')}</i><b>${dias} dias</b></span>
        <span class="ct-estado-item ct-ret"><span class="px-anel ct-anel-mini" style="--pct:91" aria-hidden="true"></span><b data-ct-ret>91%</b></span>
        <span class="ct-estado-ir"><span>${mem}</span>${ica('chevron-right')}</span></button>
      <button type="button" class="ct-estado-teto" data-ct="ajustes" aria-label="${novas} de ${CT_AJ.novas} novas hoje. Mudar o limite do dia" title="Mudar o limite do dia">
        <span class="q-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${CT_AJ.novas}" aria-valuenow="${novas}" aria-label="Novas de hoje"><span style="width:${CT_AJ.novas ? Math.round((novas / CT_AJ.novas) * 100) : 0}%"></span></span>
        <b>${novas} de ${CT_AJ.novas}</b><small>novas</small>${ica('sliders-horizontal')}</button></div>`;
  }
  const ctResumo = (feitoHoje) => (CT.resumo === 'tres' ? ctTresCartoes(feitoHoje) : ctFaixaDeEstado(feitoHoje));
  function ctPrevisao7(valores = CT_PREV7, titulo = 'Os próximos 7 dias', sub = 'Quantos cartões voltam em cada dia; a barra destacada é amanhã.') {
    const maior = Math.max(...valores);
    return `<section class="q-cartao ct-prev7" data-ct-alvo="previsao">${ctCabecaDoCartao(titulo, sub, ctDica('Dia sem estudo não vira dívida: o limite de revisões por dia segura a carga.'))}
      <div class="qv-barras" role="img" aria-label="Previsão: ${valores.map((v, i) => `${CT_DIAS7[i]} ${v}`).join(', ')}">${valores
        .map((v, i) => `<div class="qv-col"><b>${v}</b><span class="qv-barra ${i === 0 ? 'hoje' : ''}" style="height:${Math.max(4, Math.round((v / maior) * 120))}px"></span><small>${CT_DIAS7[i]}</small></div>`)
        .join('')}</div></section>`;
  }
  const ctAtalhos = (l, rotulo = 'Outros jeitos de estudar hoje') => `<div class="ct-atalhos ${rotulo === 'Outros jeitos de estudar hoje' ? '' : 'ct-quebra'}" role="group" aria-label="${rotulo}" data-ct-alvo="atalhos">${l.map(([i, r, attrs]) => `<button type="button" class="q-chip ct-atalho" ${attrs}>${ica(i)}<span>${r}</span></button>`).join('')}</div>`;
  /* Continuar por baralho: a linha inteira é o botão; um toque e a rodada abre. */
  function ctContinuar() {
    if (FX.fonte !== 'tudo' && CT.hoje !== 'primeiro') return '';
    const ids = CT.hoje === 'primeiro' ? ['s-reuniao'] : FX.lang === 'es' ? ['s-aula', 'a-es'] : ['s-reuniao', 's-podcast', 'a-pv'];
    if (CT.hoje === 'feito')
      return `<section class="q-secao ct-continuar" data-ct-alvo="continuar"><header><div><h2>Praticar por baralho</h2></div></header>
        <div class="q-lista">${ids
          .map((id) => {
            const b = ctBaralho(id);
            return `<button type="button" class="q-linha ct-linha-b ct-linha-estudar" data-ct="outro-jeito" data-origem="baralho" data-id="${id}" aria-label="Praticar de outro jeito com ${esc(b.nome)}"><span class="q-ic">${ica(b.i)}</span><span><b>${esc(b.nome)}</b><small>${b.total} cartões · volta ${b.prox.replace(',', ' com')}</small></span><span class="q-fim ct-pilula">${ica('sparkles')}<span>Praticar</span></span></button>`;
          })
          .join('')}</div></section>`;
    return `<section class="q-secao ct-continuar" data-ct-alvo="continuar"><header><div><h2>Continuar por baralho</h2></div></header>
      <div class="q-lista">${ids
        .map((id) => {
          const b = CT.hoje === 'primeiro' ? { ...ctBaralho(id), n: [10, 0, 0], total: 34 } : ctBaralho(id);
          const n = CT.hoje === 'primeiro' ? b.n : ctN(b);
          return `<button type="button" class="q-linha ct-linha-b ct-linha-estudar" data-ct-estudar="${id}" aria-label="Estudar ${esc(b.nome)}: ${n[0] + n[1] + n[2]} para hoje"><span class="q-ic">${ica(b.i)}</span><span><b>${esc(b.nome)}</b><small>${b.g === 'anki' ? 'Anki' : b.sub.split(' · ')[0]} · ${b.total} cartões</small></span>${ctTres(n)}<span class="q-fim ct-pilula">${ica('target')}<span>Estudar</span></span></button>`;
        })
        .join('')}</div></section>`;
  }
  const CT_SAIDAS_DA_PILHA = () => {
    const resto = ctHojeN()[2] - CT.tetoDaPilha;
    return {
      teto: ['gauge', `Só ${CT.tetoDaPilha} por dia`, `Estuda ${CT.tetoDaPilha} hoje e o resto espera. Zera em uns 8 dias.`, [40, 40, 40, 40, 40, 40, 40], 'fica no limite'],
      espalhar: ['calendar-days', 'Espalhar pelos próximos 7 dias', `Os ${resto} que sobram entram aos poucos: uns 29 a mais por dia.`, [37, 43, 50, 38, 46, 41, 55], 'espalhado em 7 dias'],
      adiar: ['moon', 'Adiar as que aguentam esperar', 'As 120 com mais folga voltam em até 10 dias. As frágeis ficam para agora.', [40, 30, 34, 28, 31, 29, 36], 'as com folga adiadas'],
      semnovas: ['pause', 'Sem novas até zerar', 'Nenhuma palavra nova entra enquanto houver atraso.', [40, 40, 40, 40, 40, 40, 33], 'sem novas até zerar'],
    };
  };
  function ctHoje() {
    const n = ctHojeN();
    const total = n[0] + n[1] + n[2];
    const quem = '';
    /* quem estuda dois idiomas vê um por vez: o outro fica a um toque, com a contagem dele */
    const outra = fsLinguas().find((k) => k !== FX.lang);
    const nOutra = outra && FX.fonte === 'tudo' ? (ctN(ctBaralho(outra)) || [0, 0, 0]).reduce((a, b) => a + b, 0) : 0;
    const outroIdioma = nOutra ? `<button type="button" class="ex-lig fs-outro-idioma" data-fs-ir-lingua="${outra}">${ica('languages')}${FX_LING[outra]} tem ${nOutra} para hoje</button>` : '';
    const atalhosDoDia = ctAtalhos([
      ['timer', 'Só 10', 'data-ct="estudar" data-n="10" title="Só 10 agora: uns 2 min"'],
      ['triangle-alert', 'Difíceis · 2', 'data-ct-estudar="dificeis" title="Só as que você mais erra"'],
      ['sparkles', 'Praticar de outro jeito', 'data-ct="outro-jeito" data-origem="hoje" title="Ouvir, falar, escrever ou jogar com as palavras de hoje"'],
    ]);
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio ct-vazio"><span class="q-ic">${ica('brain')}</span><h2>Seus cartões aparecem aqui</h2>
          <p>Cada palavra que você guarda vira um cartão, e o app traz de volta na hora em que você estaria esquecendo.</p></div>
        <div class="q-grade g3 ct-tres-caminhos">
          <button type="button" class="q-tile pri" data-ct-rota="capturar"><span class="q-ic">${ica('mic')}</span><b>Capturar uma sessão</b><span class="q-d">Toque numa palavra da legenda e ela vira cartão, com a frase e a fala de quem disse.</span></button>
          <button type="button" class="q-tile" data-ct="importar-anki"><span class="q-ic">${ica('upload')}</span><b>Trazer um baralho do Anki</b><span class="q-d">Com a agenda e o histórico. Antes de gravar, você vê o que vem e o que não vem.</span></button>
          <button type="button" class="q-tile" data-ct="trilha"><span class="q-ic">${ica('graduation-cap')}</span><b>Começar pela Trilha</b><span class="q-d">704 palavras do A1 em ordem de uso. Você ativa aos poucos.</span></button>
        </div>`;
    if (CT.hoje === 'primeiro')
      return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">34</span>
          <div><h2>Suas 34 palavras das sessões já são cartões</h2><p>Comece por 10: uns 3 minutos, e não precisa acertar tudo.</p></div>
          <button type="button" class="q-ctl pri" data-ct="estudar" data-n="10">${ica('target')} Começar por 10</button></div>
        ${ctAtalhos(
          [
            ['mic', 'Capturar outra sessão', 'data-ct-rota="capturar"'],
            ['upload', 'Trazer do Anki', 'data-ct="importar-anki"'],
            ['graduation-cap', 'Ativar a Trilha', 'data-ct="trilha"'],
          ],
          'Outros jeitos de ganhar cartões',
        )}
        <section class="q-cartao ct-como">${ctCabecaDoCartao('Como funciona', '')}
          <ol class="q-passos"><li><span>1</span>Você vê a palavra na frase de onde ela veio e tenta lembrar o que quer dizer.</li>
          <li><span>2</span>Mostra a resposta e diz como foi: lembrei ou esqueci.</li>
          <li><span>3</span>A palavra volta quando estiver quase saindo da memória: amanhã, em quatro dias, em duas semanas.</li></ol></section>`;
    if (CT.hoje === 'feito')
      return `<div class="q-cartao qv-convite ct-hoje ct-feito" data-ct-alvo="hoje"><span class="qv-contagem ct-festa">${ica('party-popper')}</span>
          <div><h2>Tudo em dia</h2><p>26 cartões em 6 minutos. A próxima abre amanhã com 8.</p>${ctSemana(true)}</div>
          <button type="button" class="q-ctl pri" data-ct="outro-jeito" data-origem="hoje">${ica('sparkles')} Praticar de outro jeito</button></div>
        ${ctAtalhos(
          [
            ['plus', 'Mais 5 novas', 'data-ct="mais-novas"'],
            ['shuffle', 'Estudo livre', 'data-ct="livre" title="Fora da agenda: não muda quando as palavras voltam"'],
            ['gamepad-2', 'Jogar com as mesmas', 'data-ct="virar-jogo"'],
          ],
          'O que mais dá para fazer hoje',
        )}
        ${ctResumo(true)}${ctContinuar()}`;
    if (CT.hoje === 'pilha') {
      const op = CT_SAIDAS_DA_PILHA();
      return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">${num(n[2])}</span>
          <div><h2>Você tem ${num(n[2])} esperando. Vamos de ${CT.tetoDaPilha} hoje?</h2><p>${ctMin(CT.tetoDaPilha)} ${ctDica('Começa pelas que você tem mais chance de lembrar. O resto espera sem pressa: dia sem estudo não vira dívida.')}</p></div>
          <div class="ct-hoje-acoes"><button type="button" class="q-ctl pri" data-ct="estudar" data-n="${CT.tetoDaPilha}">${ica('target')} Estudar ${CT.tetoDaPilha} agora</button>
            <button type="button" class="q-ctl ct-resto" data-ct="resto" data-ct-alvo="resto" title="Escolher o que fazer com as ${num(n[2] - CT.tetoDaPilha)} que sobram">E o resto?<small>${op[CT.pilha][4]}</small>${ica('chevron-right')}</button></div></div>
        ${atalhosDoDia}${ctResumo(false)}${ctContinuar()}`;
    }
    return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">${total}</span>
        <div><h2>Para estudar agora${quem}</h2><p>${ctMin(total)} ${ctDica('Começa pelas que estão para sair da memória. Quem erra revê a palavra na mesma rodada.')}</p>
          <p class="ct-tags-do-dia"><span class="q-tag ct-rv">${n[2]} a rever</span><span class="q-tag ct-ap">${n[1]} aprendendo</span><span class="q-tag ct-nv">${n[0]} novas</span></p></div>
        <button type="button" class="q-ctl pri" data-ct="estudar" ${total ? '' : 'disabled'}>${ica('target')} ${total ? 'Estudar agora' : 'Nada vence aqui hoje'}</button></div>
      ${atalhosDoDia}${outroIdioma}${ctResumo(false)}${ctContinuar()}`;
  }

  /* ---- Baralhos ------------------------------------------------------------------- */
  /* Cobertura: quanto do último vídeo o baralho já cobre. Só onde faz sentido (mesmo idioma do vídeo). */
  const CT_COBERTURA = { tudo: [86, 19], en: [82, 23], 's-reuniao': [41, 96], trilha: [58, 68], 'a-pv': [64, 59] };
  const CT_FALTAM = [['deadline', 'prazo', 'We can still make the deadline.'], ['stakeholder', 'parte interessada', 'Every stakeholder signed off.'], ['rollout', 'lançamento em etapas', 'The rollout starts with ten percent.'], ['backlog', 'fila de pendências', 'That goes straight to the backlog.'], ['sign off', 'aprovar', 'Every stakeholder signed off.'], ['tight', 'apertado', 'The schedule is tight, though.']];
  function ctLinhaDoBaralho(b) {
    const n = ctN(b);
    const soma = n ? n[0] + n[1] + n[2] : 0;
    return `<div class="ct-linha-caixa"><button type="button" class="q-linha ct-linha-b" data-ct-baralho="${b.id}" aria-pressed="${CT.baralho === b.id}"><span class="q-ic">${ica(b.i)}</span><span><b>${esc(b.nome)}</b><small>${b.g === 'tudo' || b.g === 'idioma' || b.g === 'cuidar' ? `${num(b.total)} cartões · ${b.sub}` : b.sub}</small></span>${ctTres(n)}</button>
      ${!n ? '' : soma ? `<button type="button" class="q-ctl ct-revisar" data-ct-estudar="${b.id}" aria-label="Revisar ${esc(b.nome)}: ${num(soma)} para hoje">${ica('target')}<span>Revisar</span></button>` : `<span class="ct-em-dia">${ica('check')}<span>em dia</span></span>`}</div>`;
  }
  function ctDetalheDoBaralho(b) {
    const n = ctN(b);
    const soma = n ? n[0] + n[1] + n[2] : 0;
    const fatos = [['Cartões', b.de ? `${num(b.total)}<small class="fx-de"> de ${num(b.de)}</small>` : num(b.total)], ['Para hoje', n ? num(soma) : '—'], ['Retenção', b.ret ? b.ret + '%' : '—']];
    const cob = CT.hoje === 'primeiro' ? null : CT_COBERTURA[b.id];
    return `<div class="q-bib-topo"><span class="q-ic">${ica(b.i)}</span><div>
        <p class="q-bib-tags"><span class="q-tag">${b.tipo}</span>${b.lang ? `<span class="q-tag off">${b.lang === 'en' ? 'Inglês' : 'Espanhol'}</span>` : ''}</p>
        <h2>${esc(b.nome)}</h2></div>
        <button type="button" class="q-ctl ct-so-icone" data-ct="menu-do-baralho" data-id="${b.id}" aria-label="Mais ações deste baralho" title="${b.g === 'sessao' ? 'Abrir a sessão, gerenciar' : 'Gerenciar'}, exportar, compartilhar por link">${ica('ellipsis')}</button></div>
      <dl class="q-bib-fatos ct-fatos3">${fatos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${n && soma ? `<p class="ct-tres-do-baralho">${ctTres(n, true)}</p>` : ''}
      <div class="q-bib-acoes" role="toolbar" aria-label="O que fazer com este baralho">
        ${b.id === 'suspensas' ? `<button type="button" class="q-ctl pri" data-ct-ver="${b.id}">${ica('book-open')} Ver as ${b.total} suspensas</button>` : `<button type="button" class="q-ctl pri" data-ct-estudar="${b.id}" ${soma ? '' : 'disabled'}>${ica('target')} ${soma ? `Revisar · ${num(Math.min(soma, CT.hoje === 'pilha' ? CT.tetoDaPilha : soma))}` : 'Nada vence aqui hoje'}</button>`}
        ${b.id === 'suspensas' ? '' : `<div class="q-acoes"><button type="button" class="q-ctl" data-ct="outro-jeito" data-origem="baralho" data-id="${b.id}">${ica('sparkles')} Praticar de outro jeito</button><button type="button" class="q-ctl" data-ct-ver="${b.id}">${ica('book-open')} Ver palavras</button><button type="button" class="q-ctl" data-ct="jogar-com" data-id="${b.id}" title="Abre o Jogar com este baralho como fonte das palavras">${ica('gamepad-2')} Jogar com este</button></div>`}
      </div>
      ${cob ? `<div class="q-aviso ct-cobertura" data-ct-alvo="cobertura"><span class="qv-aviso-texto">${ica('clapperboard')}<span>Este baralho cobre <b>${cob[0]}%</b> do seu último vídeo; faltam ${cob[1]} palavras.</span></span><button type="button" class="q-ctl" data-ct="faltam" data-id="${b.id}">Ver as que faltam</button></div>` : ''}`;
  }
  /* A lista segue o catálogo de fontes (fontes.js): Tudo e Difíceis no alto, depois os mesmos grupos,
     na mesma ordem do Jogar. A busca veio da Biblioteca. */
  function ctListaDeBaralhos() {
    const q = (CT.buscaBar || '').trim().toLowerCase();
    const primeiro = CT.hoje === 'primeiro';
    const passa = (b) => !q || b.nome.toLowerCase().includes(q) || b.tipo.toLowerCase().includes(q);
    const grupo = (g, h, dica = '') => {
      const l = CT_BARALHOS.filter((b) => b.g === g && b.id !== 'dificeis' && passa(b) && (!primeiro || ['s-reuniao'].includes(b.id)));
      return l.length ? `<section class="q-secao ct-grupo"><header><div><h3>${h}</h3></div>${dica ? ctDica(dica) : ''}</header><div class="q-lista">${l.map(ctLinhaDoBaralho).join('')}</div></section>` : '';
    };
    const topo = (primeiro ? [{ ...ctBaralho('tudo'), total: 34, n: [10, 0, 0], pilha: 0 }] : [ctBaralho('tudo'), ctBaralho('dificeis')]).filter(passa);
    const html = `${topo.length ? `<div class="q-lista">${topo.map(ctLinhaDoBaralho).join('')}</div>` : ''}
        ${FX_GRUPOS.map(([g, h]) => (primeiro && g !== 'sessao' ? '' : grupo(g, h))).join('')}
        ${primeiro ? '' : grupo('cuidar', 'Fora da revisão')}`;
    return q && !/q-linha/.test(html) ? `<div class="q-vazio fx-vazio"><h2>Nenhum baralho com “${esc(CT.buscaBar)}”</h2><p>Procure pelo nome da sessão, do baralho ou do idioma.</p><button type="button" class="q-ctl" data-ct="limpar-busca-baralho">Limpar a busca</button></div>` : html;
  }
  function ctBaralhos() {
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio"><span class="q-ic">${ica('layers')}</span><h2>Os baralhos se montam sozinhos</h2><p>Um por idioma, um por sessão gravada, a Trilha e cada baralho que você trouxer do Anki.</p>
        <button type="button" class="q-ctl pri" data-ct-ir-aba="0">${ica('calendar-check')} Ver como começar</button></div>`;
    const b = ctBaralho(CT.baralho);
    return `<div class="ct-bar-corpo"><div class="ct-bar-col">
        ${CT.hoje === 'primeiro' ? '' : `<label class="q-campo q-bib-busca fx-busca">${ica('search')}<input type="search" placeholder="Buscar baralho" aria-label="Buscar baralho pelo nome" value="${esc(CT.buscaBar || '')}" data-ct-campo="busca-baralho"></label>`}
        <div class="ct-bar-lista ct-bar-col">${ctListaDeBaralhos()}</div>
        <button type="button" class="q-linha q-bib-nova ct-novo-baralho" data-ct="trazer-e-levar"><span class="q-bib-nova-dentro"><span class="q-ic">${ica('plus')}</span><span><b>Trazer uma fonte</b><small>Arquivo do Anki, lista ou texto colado, vídeo ou PDF.</small></span></span></button>
      </div>
      <section class="q-cartao q-bib-det ct-bar-det" aria-label="Baralho selecionado" data-ct-alvo="baralho">${ctDetalheDoBaralho(b)}</section></div>`;
  }

  /* ---- Palavras: o navegador de cartões ------------------------------------------- */
  const CT_ESTADOS_F = [['todos', 'Todas', () => CT_FASES.total], ['dificeis', 'Difíceis', () => CT_FASES.dificeis], ['hoje', 'Vencem hoje', () => 18], ['nova', 'Novas', () => CT_FASES.novas], ['aprendendo', 'Aprendendo', () => CT_FASES.aprendendo], ['revisao', 'Em revisão', () => CT_FASES.jovens + CT_FASES.maduras], ['suspensa', 'Suspensas', () => CT_FASES.suspensas], ['bandeira', 'Com bandeira', () => CT_CARTOES.filter((c) => c.band).length]];
  const CT_ETIQUETAS = ['trabalho', 'difícil', 'phrasal-verbs', 'anki', 'frecuentes'];
  const CT_ORDENS = [['vence', 'Volta primeiro'], ['recentes', 'Mais recentes'], ['az', 'A–Z'], ['erros', 'Mais erradas']];
  function ctFiltradas() {
    const f = CT.f;
    const q = f.busca.trim().toLowerCase();
    const l = CT_CARTOES.filter(
      (c) =>
        (f.estado === 'todos' || (f.estado === 'hoje' ? c.hoje && c.est === 'revisao' : f.estado === 'dificeis' ? ctDificil(c) : f.estado === 'bandeira' ? c.band : c.est === f.estado)) &&
        fsNaFonte(c) &&
        (!f.etiqueta || c.tags.includes(f.etiqueta)) &&
        (!q || c.p.toLowerCase().includes(q) || c.t.toLowerCase().includes(q) || c.frases.some((x) => x[0].toLowerCase().includes(q))),
    );
    const peso = { 'em 4 min': 0, 'em 8 min': 1, 'em 9 min': 2, hoje: 3, nova: 9, suspensa: 99 };
    const dias = (c) => peso[c.vence] ?? 4 + (+(c.vence.match(/\d+/) || [0])[0] || 0);
    if (f.ordem === 'az') l.sort((a, b) => a.p.localeCompare(b.p));
    else if (f.ordem === 'erros') l.sort((a, b) => b.lapsos - a.lapsos);
    else if (f.ordem === 'recentes') l.reverse();
    else l.sort((a, b) => dias(a) - dias(b));
    return l;
  }
  /* Quantas palavras do conteúdo escolhido estão em cada estado ("Todas" é o total do conteúdo). */
  function ctContaDoEstado(v) {
    if (fsDeck() === 'tudo') return CT_ESTADOS_F.find((e) => e[0] === v)[2]();
    if (v === 'todos') return fsBaralho().total;
    return CT_CARTOES.filter((c) => fsNaFonte(c) && (v === 'hoje' ? c.hoje && c.est === 'revisao' : v === 'dificeis' ? ctDificil(c) : v === 'bandeira' ? c.band : c.est === v)).length;
  }
  function ctTotalDoFiltro(l) {
    const f = CT.f;
    if (f.busca.trim() || f.etiqueta) return l.length;
    return ctContaDoEstado(f.estado);
  }
  function ctTabela() {
    const f = CT.f;
    const l = ctFiltradas();
    const total = ctTotalDoFiltro(l);
    if (!l.length)
      return `<div class="q-vazio"><span class="q-ic">${ica('search')}</span><h3>Nada com esses filtros</h3><p>Tire um filtro ou apague a busca.</p><button type="button" class="q-ctl pri" data-ct="limpar-filtros">${ica('x')} Limpar filtros</button></div>`;
    return `<div class="q-tabela-caixa"><table class="q-tabela qv-tabela ct-tabela ${f.sel ? 'ct-selecionando' : ''}"><thead><tr>${f.sel ? `<th class="ct-th-caixa"><button type="button" class="ct-caixa" role="checkbox" aria-checked="${l.every((c) => f.marcados.has(c.id))}" aria-label="Selecionar todas as ${l.length} da lista" data-ct="marcar-todas"></button></th>` : ''}<th>Palavra</th><th>Tradução</th><th class="qv-extra">Origem</th><th class="qv-extra">Volta</th><th>Estado</th></tr></thead><tbody>${l
      .map((c) => {
        const [rot, tom] = CT_ESTADO[c.est];
        return `<tr class="clicavel" data-ct-carta="${c.id}" data-tocavel ${f.marcados.has(c.id) ? 'data-marcada' : ''}>${f.sel ? `<td class="ct-td-caixa"><button type="button" class="ct-caixa" role="checkbox" aria-checked="${f.marcados.has(c.id)}" aria-label="Selecionar ${esc(c.p)}"></button></td>` : ''}
          <td><button type="button" class="qv-palavra" aria-label="Abrir ${esc(c.p)}" lang="${c.lang}">${esc(c.p)}</button>${ctDificil(c) ? `<span class="ct-marca dif" title="Difícil: errada ${c.lapsos} vezes">${ica('triangle-alert')}</span>` : ''}${c.band ? `<span class="ct-marca band" title="Com bandeira">${ica('flag')}</span>` : ''}</td>
          <td>${esc(c.t)}</td>
          <td class="qv-extra"><span class="ct-origem-da-linha">${ica(c.frases[0][3] ? 'audio-lines' : c.b.startsWith('a-') ? 'wallet-cards' : c.b === 'trilha' ? 'graduation-cap' : 'book-open')}${esc(ctNomeDoBaralho(c.b))}</span>${c.tags.length ? `<small class="qv-fonte">${c.tags.map((t) => '#' + t).join(' ')}</small>` : ''}</td>
          <td class="qv-extra ct-volta">${c.vence === 'nova' ? '—' : c.vence}</td>
          <td><span class="q-tag qv-estado ${tom}">${rot}</span></td></tr>`;
      })
      .join('')}</tbody></table></div>
      ${total > l.length ? `<div class="q-acoes qv-mais"><button type="button" class="q-ctl" data-ct="mais-linhas">Mostrar mais (${l.length} de ${num(total)})</button></div>` : ''}`;
  }
  const ctQuantas = () => {
    const l = ctFiltradas();
    return `${num(ctTotalDoFiltro(l))} de ${num(fsBaralho().total)}${FX.fonte === 'tudo' && !fsLingua() ? '' : ` · ${fsNome()}${fsLingua() ? ` em ${fsLingua().toLowerCase()}` : ''}`}`;
  };
  /* O pé da lista: as ações da seleção, ou o "Desfazer" do que acabou de ser feito em massa. */
  function ctFaixaDaSelecao() {
    const n = CT.f.marcados.size;
    if (CT.desfazer)
      return `<div class="q-faixa q-no-pe ct-faixa-sel ct-faixa-desfazer" role="status" data-ct-alvo="desfazer"><span class="q-tempo">${ica('circle-check')}&nbsp;${CT.desfazer.texto}</span><span class="q-espaco"></span>
          <button type="button" class="q-ctl" data-ct="desfazer-massa">${ica('undo-2')} Desfazer</button><button type="button" class="q-ctl ct-so-icone" data-ct="fechar-desfazer" aria-label="Fechar o aviso">${ica('x')}</button></div>`;
    return CT.f.sel
      ? `<div class="q-faixa q-no-pe ct-faixa-sel" role="toolbar" aria-label="Ações para as selecionadas"><span class="q-tempo"><b>${n}</b>&nbsp;${n === 1 ? 'selecionada' : 'selecionadas'}</span>
          <button type="button" class="q-ctl" data-ct-massa="suspender" ${n ? '' : 'disabled'}>${ica('pause')} Suspender</button>
          <button type="button" class="q-ctl" data-ct-massa="mover" ${n ? '' : 'disabled'}>${ica('layers')} <span><span class="ct-longo">Mover para </span>Difíceis</span></button>
          <button type="button" class="q-ctl" data-ct-massa="etiquetar" ${n ? '' : 'disabled'}>${ica('tag')} Etiquetar</button>
          <button type="button" class="q-ctl" data-ct-massa="praticar" ${n ? '' : 'disabled'}>${ica('sparkles')} Praticar</button>
          <button type="button" class="q-ctl ct-so-pc" data-ct-massa="exportar" ${n ? '' : 'disabled'}>${ica('download')} Exportar</button>
          <span class="q-espaco"></span><button type="button" class="q-ctl ct-cancelar" data-ct="selecionar" aria-label="Cancelar a seleção">${ica('x')}<span>Cancelar</span></button></div>`
      : '';
  }
  const ctFiltrosLigados = () => ['etiqueta'].filter((k) => CT.f[k]).length + (CT.f.ordem !== 'vence' ? 1 : 0) + (['suspensa', 'bandeira'].includes(CT.f.estado) ? 1 : 0);
  function ctFiltros() {
    const f = CT.f;
    const grupo = (rot, chave, itens) => `<div class="qv-grupo" role="group" aria-label="${rot}"><span class="q-rotulo">${rot}</span>${itens.map(([v, r, q]) => `<button type="button" class="q-aba" aria-pressed="${f[chave] === v}" data-ct-filtro="${chave}" data-v="${v}">${r}${q != null ? `<span class="n">${num(q)}</span>` : ''}</button>`).join('')}</div>`;
    return `<div class="q-cartao qv-filtros" id="ct-filtros">
      ${grupo('Ordenar', 'ordem', CT_ORDENS.map(([v, r]) => [v, r, null]))}
      ${grupo('Etiqueta', 'etiqueta', CT_ETIQUETAS.map((t) => [t, '#' + t, null]))}
      ${grupo('Fora da revisão', 'estado', CT_ESTADOS_F.slice(6).map(([v, r]) => [v, r, ctContaDoEstado(v)]))}
      ${ctFiltrosLigados() ? `<div class="q-acoes"><button type="button" class="q-ctl" data-ct="limpar-filtros">${ica('x')} Limpar</button></div>` : ''}</div>`;
  }
  function ctPalavras() {
    const f = CT.f;
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio"><span class="q-ic">${ica('book-open')}</span><h2>Seu caderno está vazio</h2><p>Capture uma sessão ou toque numa palavra durante a leitura para começar.</p><button type="button" class="q-ctl pri" data-ct-rota="capturar">${ica('mic')} Capturar uma sessão</button></div>`;
    const ligados = ctFiltrosLigados();
    return `<section class="q-secao qv-catalogo ct-catalogo" aria-label="Todas as palavras">
        <div class="ct-busca-fixa" data-ct-alvo="busca"><label class="q-campo qv-campo-busca"><span class="sr">Buscar palavra</span>${ica('search')}<input type="search" autocomplete="off" placeholder="Buscar palavra ou frase" value="${esc(f.busca)}" data-ct-campo="busca"></label>
          <button type="button" class="q-ctl ct-filtros-botao" aria-expanded="${f.abertos}" aria-controls="ct-filtros" data-ct="filtros">${ica('sliders-horizontal')}<span>Filtros</span>${ligados ? `<span class="q-tag">${ligados}</span>` : ''}</button>
          <button type="button" class="q-ctl ct-selecionar" aria-pressed="${f.sel}" data-ct="selecionar" aria-label="Selecionar várias" title="Selecionar várias: suspender, mover, etiquetar">${ica('square-check')}<span>Selecionar</span></button></div>
        <div class="ct-estados-caixa"><div class="q-abas ct-estados" role="group" aria-label="Estado do cartão">${CT_ESTADOS_F.slice(0, 6).map(([v, r]) => `<button type="button" class="q-aba" aria-checked="${f.estado === v}" data-ct-filtro="estado" data-v="${v}">${r} <span class="n">${num(ctContaDoEstado(v))}</span></button>`).join('')}</div></div>
        ${f.abertos ? ctFiltros() : ''}
        <p class="ct-quantas"><span class="qv-quantas" aria-live="polite">${ctQuantas()}</span></p>
        <div id="ct-tabela">${ctTabela()}</div>
        ${ctFaixaDaSelecao()}
      </section>`;
  }

  /* ---- Trazer e levar: uma folha só, aberta pelo "+" ------------------------------- */
  const CT_CAMPOS = [['Front', 'Palavra'], ['Back', 'Tradução'], ['Example', 'Frase de exemplo'], ['Audio', 'Não trazer'], ['Notes', 'Explicação']];
  const CT_DESTINOS = ['Palavra', 'Tradução', 'Frase de exemplo', 'Explicação', 'Não trazer'];
  const ctItem = (ok, t, d) => `<li class="${ok ? 'vem' : 'nao'}">${ica(ok ? 'circle-check' : 'circle-x')}<span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span></li>`;
  /* O baralho de exemplo do importador: 480 notas no arquivo, 466 vêm, 14 ficam de fora. */
  const CT_ANKI = { nome: 'Travel English: 480 frases', notas: 480, vieram: 466, fora: 14, comAgenda: 312, novas: 154, casadas: 37 };
  /* Carga dos próximos 7 dias para cada escolha (números de exemplo, na mesma escala). */
  const CT_CARGA7 = { agenda: [34, 28, 41, 22, 30, 26, 37], zero: [10, 18, 24, 29, 33, 36, 38] };
  const ctMini7 = (v, rot, maior = 46) => `<span class="ct-mini7" role="img" aria-label="${rot}: ${v.map((x, i) => `${CT_DIAS7[i]} ${x}`).join(', ')}">${v.map((x, i) => `<span class="ct-m7c ${i === 0 ? 'amanha' : ''}"><b>${x}</b><i style="--h:${(x / maior).toFixed(3)}"></i><small>${CT_DIAS7[i]}</small></span>`).join('')}</span>`;
  function ctLinhasDaLista() {
    const linhas = CT.lista.split('\n').map((l) => l.trim()).filter(Boolean);
    const sem = linhas.filter((l) => !/[;\t]|\s-\s/.test(l)).length;
    return [linhas.length, sem];
  }

  /* ---- Memória: as estatísticas dos cartões ---------------------------------------- */
  function ctGraficoDeRetencao() {
    const estreito = celular();
    const W = estreito ? 330 : 500;
    const H = estreito ? 210 : 236;
    const m = { e: 46, d: 14, t: 26, b: 30 };
    const y = (v) => m.t + (1 - (v - 75) / 25) * (H - m.t - m.b);
    const x = (i) => m.e + (i * (W - m.e - m.d)) / (CT_RET_SEMANAS.length - 1);
    const pts = CT_RET_SEMANAS.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    return `<svg class="ct-graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Retenção real por semana: ${CT_RET_SEMANAS.join(', ')} por cento. Meta: ${CT_AJ.retencao} por cento.">
      ${[80, 90, 100].map((v) => `<line class="g" x1="${m.e}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}"/><text class="e" x="${m.e - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
      <line class="meta" x1="${m.e}" x2="${W - m.d}" y1="${y(CT_AJ.retencao)}" y2="${y(CT_AJ.retencao)}"/><text class="meta-t" x="${m.e + 6}" y="${y(CT_AJ.retencao) - 8}">meta ${CT_AJ.retencao}%</text>
      <polygon class="area" points="${m.e},${H - m.b} ${pts.join(' ')} ${W - m.d},${H - m.b}"/>
      <polyline class="linha" points="${pts.join(' ')}" pathLength="1"/>
      ${CT_RET_SEMANAS.map((v, i) => `<circle class="pt ${i === CT_RET_SEMANAS.length - 1 ? 'agora' : ''}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === CT_RET_SEMANAS.length - 1 ? 6 : 4}"/>`).join('')}
      <text class="v" x="${x(7) + 4}" y="${y(91) - 14}" text-anchor="end">91%</text>
      ${(estreito ? ['17 ago', '', '', '', '14 set', '', '', 'esta'] : ['17 ago', '', '31 ago', '', '14 set', '', '', 'esta semana']).map((r, i) => (r ? `<text class="e" x="${x(i)}" y="${H - 8}" text-anchor="${i === 7 ? 'end' : 'middle'}">${r}</text>` : '')).join('')}</svg>`;
  }
  function ctCalendario() {
    /* 12 semanas, de 19 jul a 10 out; gerador fixo para o desenho não mudar a cada visita. */
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
    const cels = [];
    for (let i = 0; i < 84; i++) {
      const semana = Math.floor(i / 7);
      const r = rnd();
      let n = semana < 2 ? (r > 0.7 ? 1 : 0) : r > 0.84 ? 0 : r > 0.6 ? 1 : r > 0.34 ? 2 : r > 0.12 ? 3 : 4;
      if (i === 79) n = -1; /* a terça coberta pelo congelamento */
      if (i === 77) n = 0;
      if ([78, 80, 81, 82].includes(i)) n = Math.max(n, 2);
      if (i === 83) n = CT.hoje === 'feito' ? 3 : 5; /* hoje */
      cels.push(n);
    }
    const dias = cels.filter((n) => n > 0 && n < 5).length + (CT.hoje === 'feito' ? 0 : 0);
    return [`<div class="ct-cal" role="img" aria-label="Calendário de dias estudados nas últimas 12 semanas: ${dias} dias com revisão">${cels.map((n) => `<i class="${n === -1 ? 'gelo' : n === 5 ? 'hoje' : 'n' + n}"></i>`).join('')}</div>`, dias];
  }
  function ctMemoria() {
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio"><span class="q-ic">${ica('brain')}</span><h2>Os números aparecem depois das primeiras revisões</h2><p>Retenção real contra a meta, previsão de carga, calendário de dias estudados e os botões que você usa.</p><button type="button" class="q-ctl pri" data-ct-ir-aba="0">${ica('calendar-check')} Ver como começar</button></div>`;
    const totalB = CT_BOTOES.reduce((s, b) => s + b[1], 0);
    const maior = Math.max(...CT_PREV30);
    const media = Math.round(CT_PREV30.reduce((s, v) => s + v, 0) / 30);
    const [cal, dias] = ctCalendario();
    const fases = [['Novas', CT_FASES.novas, 'nv'], ['Aprendendo', CT_FASES.aprendendo, 'ap'], ['Jovens', CT_FASES.jovens, 'jv'], ['Maduras', CT_FASES.maduras, 'md'], ['Suspensas', CT_FASES.suspensas, 'sp']];
    return `<div class="qe-kpis ct-kpis">${[
      ['brain', 'Retenção real', '88%', `meta ${CT_AJ.retencao}% · últimos 30 dias`],
      ['target', 'Revisões', '612', 'em 30 dias · 20 por dia'],
      ['clock', 'Tempo', '4 min', 'por dia · 7,2 s por cartão'],
      ['flame', 'Sequência', '4 dias', 'recorde: 11 · 2 congelamentos'],
      ['triangle-alert', 'Difíceis', '6', 'erradas 8 vezes ou mais'],
    ]
      .map(([i, r, v, s]) => `<div class="q-num qe-kpi"><span class="q-rotulo">${ica(i)} ${r}</span><b>${v}</b><span>${s}</span></div>`)
      .join('')}</div>
      <div class="q-grade g2 ct-mem-par">
        <section class="q-cartao ct-seq" data-ct-alvo="sequencia">${ctCabecaDoCartao(`${CT.hoje === 'feito' ? 5 : 4} dias seguidos`, CT.hoje === 'feito' ? 'Hoje já conta. Recorde: 11 dias.' : 'Estudar hoje faz 5. Recorde: 11 dias.', `<span class="q-ic" aria-hidden="true">${ica('flame')}</span>`)}
          ${ctSemana(CT.hoje === 'feito')}
          <p class="qv-nota ct-com-icone">${ica('snowflake')}<span>2 congelamentos guardados. Na terça você não estudou e um deles cobriu o dia: a sequência não quebrou.</span></p></section>
        ${ctPrevisao7()}
      </div>
      <div class="q-grade g2 ct-mem-par">
        <section class="q-cartao ct-mem-ret" data-ct-alvo="retencao">${ctCabecaDoCartao('Retenção real contra a meta', 'De cada 100 revisões, quantas você lembrou. “Errei” conta como esquecida; “Difícil”, “Bom” e “Fácil” contam como lembrada.')}
          <div class="qe-grafico">${ctGraficoDeRetencao()}</div>
          <p class="qv-nota">2 pontos abaixo da meta nos 30 dias, e subindo. Não precisa mexer em nada: o app já encurta os intervalos das palavras que você erra.</p></section>
        <section class="q-cartao ct-mem-prev" data-ct-alvo="previsao30">${ctCabecaDoCartao('Previsão de carga · 30 dias', `Quantos cartões voltam em cada dia. Média de ${media} por dia; o dia mais cheio tem ${maior}.`)}
          <div class="ct-prev30" role="img" aria-label="Previsão de revisões para os próximos 30 dias, média de ${media} por dia"><span class="ct-media" style="bottom:${(media / maior) * 100}%"></span>${CT_PREV30.map((v, i) => `<i class="${v === maior ? 'pico' : ''}" style="--h:${(v / maior) * 100}%" title="${i === 0 ? 'amanhã' : 'em ' + (i + 1) + ' dias'}: ${v}"></i>`).join('')}</div>
          <div class="ct-prev30-eixo"><span>amanhã</span><span>em 10 dias</span><span>em 20 dias</span><span>em 30 dias</span></div>
          <p class="qv-nota">A linha tracejada é a média; a barra destacada, o dia mais cheio. Com o teto de ${CT_AJ.revisoes} revisões por dia, nenhum desses dias passa do que você escolheu.</p></section>
      </div>
      <section class="q-cartao ct-mem-cal" data-ct-alvo="calendario">${ctCabecaDoCartao('Dias estudados', `Últimas 12 semanas: ${dias} dias com revisão. Quanto mais escuro, mais cartões no dia.`, `<div class="legenda-cal ct-leg-cal"><span class="mut">menos</span><i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span class="mut">mais</span><i class="gelo"></i><span class="mut">congelamento</span></div>`)}
        <div class="ct-cal-caixa"><div class="ct-cal-dias" aria-hidden="true"><span>dom</span><span>ter</span><span>qui</span><span>sáb</span></div>${cal}
          <dl class="q-medidas ct-cal-fatos">${[['Dias com revisão', `${dias} de 84`], ['Maior sequência', '11 dias'], ['Congelamentos usados', '3'], ['Dia mais forte', 'quinta-feira']].map(([k, v]) => `<div class="q-medida"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div></section>
      <div class="q-grade g2 ct-mem-par">
        <section class="q-cartao ct-mem-botoes" data-ct-alvo="botoes">${ctCabecaDoCartao('Botões usados', `${totalB} respostas em 30 dias.`)}
          <div class="ct-barras-h">${CT_BOTOES.map(([r, v, k]) => `<div class="ct-bh ${k}"><span>${r}</span><span class="q-barra"><span style="width:${(v / totalB) * 100}%"></span></span><b>${Math.round((v / totalB) * 100)}%</b><small>${v}</small></div>`).join('')}</div>
          <p class="qv-nota">“Difícil” é para quando lembrou com esforço. Se não lembrou, o certo é “Errei”: usar “Difícil” no lugar estica demais os intervalos.</p></section>
        <section class="q-cartao ct-mem-fases" data-ct-alvo="fases">${ctCabecaDoCartao('Cartões por estado', `${num(CT_FASES.total)} no caderno.`)}
          <div class="ct-pilha-h" role="img" aria-label="${fases.map(([r, v]) => `${r} ${v}`).join(', ')}">${fases.map(([r, v, k]) => `<i class="${k}" style="flex:${v}" title="${r}: ${v}"></i>`).join('')}</div>
          <ul class="qv-legenda ct-leg-fases">${fases.map(([r, v, k]) => `<li><i class="${k}"></i><span>${r}</span><b>${num(v)} · ${Math.round((v / CT_FASES.total) * 100)}%</b></li>`).join('')}</ul>
          <button type="button" class="q-ctl" data-ct-ver="dificeis">${ica('triangle-alert')} Ver as 6 difíceis</button></section>
      </div>`;
  }

  /* ---- A tela inteira ---------------------------------------------------------------- */
  /* Três abas (Hoje, Baralhos, Palavras). O índice 4 é a Memória, tela de dentro com voltar;
     o 3 era "Trazer e levar", que virou a folha do "+". */
  const CT_PAINEIS = [ctHoje, ctBaralhos, ctPalavras, ctHoje, ctMemoria];
  function ctTela(i = abaDe.cartoes || 0) {
    if (i === 3) i = abaDe.cartoes = 0;
    /* sem a aba do meio, quem desliza de Hoje cai em Palavras e vice-versa */
    if (i === 1) i = abaDe.cartoes = dirAba < 0 ? 0 : 2;
    const dentro = i === 4;
    return `<div class="q-palco qv ct ${dentro ? 'ct-dentro' : ''}" data-testid="cartoes" data-ct-aba-atual="${i}" data-ct-hoje="${CT.hoje}" data-ct-resumo="${CT.resumo}">${ctCab(dentro, i)}<div class="qv-painel ct-painel" role="tabpanel">${CT_PAINEIS[i]()}</div></div>`;
  }
  PRIMARIA.cartoes = '.ct-abas';
  redesenho.cartoes = () => ctTela();
  for (let i = 0; i < 5; i++) Object.defineProperty(D.abas, `cartoes/${i}`, { get: () => ctTela(i) });
  /* Repinta sem trocar de tela: guarda a rolagem e a pílula das abas; "como" escolhe o que anima. */
  function ctRepintar(como) {
    if (atual !== 'cartoes') return;
    const antes = $$('.q-abas', tela).map(medir);
    const rol = rolagem()?.scrollTop || 0;
    tela.innerHTML = ctTela();
    const r = rolagem();
    if (r) r.scrollTop = rol;
    $$('.q-abas', tela).forEach((g, k) => porPilula(g, antes[k]));
    ctDepoisDePintar();
    if (!polido() || reduz() || !como) return;
    $$(como, tela).forEach((x, k) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: Math.min(k, 10) * 35 }));
  }
  function ctIrAba(i, o = {}) {
    if (i === 3) {
      /* quem pedia a aba "Trazer e levar" recebe a folha do "+" */
      if (atual === 'cartoes') return ctAbrirTrazerELevar();
      CT.aoChegar = () => ctAbrirTrazerELevar();
      i = 0;
    }
    if (i === 1) {
      /* quem pedia a aba Baralhos recebe o catálogo, com o baralho pedido à vista */
      const pedido = CT.baralho;
      CT.aoChegar = () => fxAbrirCatalogo($('[data-fs="abrir"]', tela), { sel: pedido === 'en' || pedido === 'es' ? 'tudo' : pedido });
      if (atual === 'cartoes') return CT.aoChegar(), (CT.aoChegar = null);
      i = 0;
    }
    if (i === 4 && (atual !== 'cartoes' || (abaDe.cartoes || 0) !== 4)) CT.voltaDaMemoria = atual === 'cartoes' ? abaDe.cartoes || 0 : 0;
    if (atual === 'cartoes' && (abaDe.cartoes || 0) === i) return o.seco ? ctRepintar() : ctRepintar('.ct-painel > *');
    mostrar('cartoes', { aba: i, origem: atual === 'cartoes' ? 'aba' : o.origem || 'clique' });
  }
  /* Movimento de entrada do que é desta tela: barras que crescem, anel que enche, números que contam. */
  function ctDepoisDePintar() {
    const anel = $('.ct-ret .px-anel', tela);
    if (anel && polido() && !reduz()) {
      const b = $('b', anel) || $('[data-ct-ret]', tela);
      contar((v) => ((b.textContent = v + '%'), anel.style.setProperty('--pct', v)), 0, 91, 1100);
    }
    $$('.ct-prev30 i', tela).forEach((x, k) => x.style.setProperty('--i', k));
  }
  function ctEntrada() {
    ctDepoisDePintar();
    if (!polido() || reduz()) return;
    $$('.qv-barras .qv-barra', tela).forEach((x, k) => anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { d: 760, atraso: 320 + k * 60, e: MOLA_SUAVE }));
    $$('.ct .q-barra > span', tela).forEach((s, k) => anima(s, [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], { d: 900, atraso: 380 + k * 90 }));
    $$('.ct-semana li i', tela).forEach((x, k) => anima(x, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { d: 520, atraso: 300 + k * 55, e: MOLA }));
    $$('.ct-prev30 i', tela).forEach((x, k) => anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { d: 620, atraso: 200 + k * 18, e: MOLA_SUAVE }));
    $$('.ct-cal i', tela).forEach((x, k) => anima(x, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { d: 380, atraso: 160 + Math.floor(k / 7) * 34 }));
    const linha = $('.ct-graf .linha', tela);
    if (linha) anima(linha, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { d: 1400, atraso: 250, e: 'ease-out' });
    $$('.ct-graf .pt', tela).forEach((x, k) => anima(x, [{ opacity: 0 }, { opacity: 1 }], { d: 300, atraso: 420 + k * 130, e: 'ease' }));
    const c = $('.ct-hoje .qv-contagem', tela);
    if (c && /^\d+$/.test(c.textContent)) contar((v) => (c.textContent = v), 0, +c.textContent, 900);
    /* Dia cumprido: comemoração contida, uma vez, só no ícone. */
    const chama = $('.ct-chama i', tela);
    if (chama) anima(chama, [{ transform: 'scale(0.3) rotate(-18deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 620, atraso: 420, e: MOLA });
    $$('.ct-atalho', tela).forEach((x, k) => anima(x, [{ opacity: 0, transform: 'translateY(10px) scale(0.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { d: 420, atraso: 220 + k * 60 }));
    const festa = $('.ct-festa', tela);
    if (festa && !QS.has('quieto')) {
      anima(festa, [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], { d: 760, atraso: 260, e: MOLA });
      setTimeout(() => festa.isConnected && rajada(...centro(festa), 18, 0.9), 520 * K());
    }
  }
  aoMostrar.cartoes = () => {
    /* em tela estreita as abas rolam de lado: a escolhida vem para a vista e a pílula é medida de novo */
    const g = $('.ct-abas', tela);
    const sel = g && $('[aria-selected="true"]', g);
    if (sel && g.scrollWidth > g.clientWidth) (g.scrollLeft = sel.offsetLeft - (g.clientWidth - sel.offsetWidth) / 2), requestAnimationFrame(reposicionar);
    ctEntrada();
    ctNavDepois?.();
    if (CT.aoChegar) {
      const f = CT.aoChegar;
      CT.aoChegar = null;
      setTimeout(f, 420 * K());
    }
  };

  /* ==========================================================================
     Folhas e diálogos da tela
     ========================================================================== */
  /* A palavra aberta: a mesma gaveta de GavetaDaPalavra.tsx, com o que a proposta acrescenta
     (a fala original em "Onde apareceu", todas as ocorrências, abrir na sessão, perguntar ao tutor). */
  /* O histórico de um cartão: data, nota e o intervalo que a nota deu (exemplo, coerente com os erros do cartão). */
  function ctHistorico(c) {
    if (c.est === 'nova' || !c.estab) return [];
    const iv = c.iv && c.iv.length ? c.iv[2] : c.vence.replace('em ', '');
    return [['3 out', 'Bom', iv], ['28 set', 'Errei', '< 10 min'], ['28 set', 'Bom', '1 d'], ['24 set', 'Difícil', '1 d'], ['21 set', 'Bom', '1 d']].slice(0, Math.max(2, Math.min(5, c.lapsos + 2)));
  }
  const CT_TOM_DA_NOTA = { Errei: 'ct-dif', Difícil: 'ct-ap', Bom: 'ct-rv', Fácil: 'ct-nv' };
  function ctAbrirPalavra(id, o = {}) {
    const c = ctCarta(id);
    if (!c) return;
    const [rot] = CT_ESTADO[c.est];
    const editando = !!o.editar;
    const icone = (s) => (CT_SESSOES[s] ? CT_SESSOES[s][1] : s === 'trilha' ? 'graduation-cap' : 'wallet-cards');
    const nomeDe = (s) => esc(CT_SESSOES[s] ? ctBaralho(s).nome : ctNomeDoBaralho(s));
    const marcada = (k) => (typeof ctFrase === 'function' ? ctFrase(c, k) : esc(c.frases[k][0]));
    /* A cena de onde veio: a primeira ocorrência, logo na dobra. As outras ficam recolhidas. */
    const cena = ([f, t, s, quem, tempo], k) => `<div class="ct-cena ${k ? '' : 'primeira'}"><span class="ct-cena-quadro" aria-hidden="true">${ica(icone(s) === 'monitor' ? 'clapperboard' : icone(s))}${tempo ? `<small>${tempo}</small>` : ''}</span>
        <div class="ct-cena-texto"><blockquote lang="${c.lang}">“${marcada(k)}”</blockquote><p class="mut">${esc(t)}</p>
          <small class="mut">${nomeDe(s)}${quem ? ` · ${esc(quem)}` : s.startsWith('a-') ? ' · sem fala gravada' : ''}</small></div>
        ${quem ? `<span class="ct-cena-acoes">${k ? `<button type="button" class="btn btn-outline peq" data-ct-ouvir="original" data-k="${k}" aria-label="Ouvir a fala original de ${esc(quem)}">${ica('audio-lines')}</button>` : ''}<button type="button" class="btn btn-outline peq" data-ct="abrir-sessao" data-id="${s}">${ica('external-link')} Abrir na cena</button></span>` : ''}</div>`;
    const hist = ctHistorico(c);
    const outras = c.frases.length - 1;
    const corpo = editando
      ? `<form class="cartao p5 pilha" data-ct-form><div><label class="rot" for="pw-t">Tradução</label><input class="campo" id="pw-t" value="${esc(c.t)}"></div>
          <div><label class="rot" for="pw-ex">Frase de exemplo</label><textarea class="campo" id="pw-ex" rows="2" style="padding:10px 14px">${esc(c.frases[0][0])}</textarea></div>
          <div><label class="rot" for="pw-n">Nível</label><select class="campo" id="pw-n">${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => `<option ${n === c.nv ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="linha" style="gap:8px"><button type="button" class="btn btn-solid peq" data-ct="salvar-palavra">${ica('check')} Salvar</button><button type="button" class="btn btn-outline peq" data-ct="cancelar-edicao">Cancelar</button></div></form>`
      : `<div class="ct-coluna"><section class="ct-traducao"><p class="ct-traducao-t">${esc(c.t)}</p>
          <span class="proveniencia">${ica('sparkles')} ${c.b.startsWith('a-') ? 'Veio do baralho do Anki' : 'Do dicionário · Wikcionário'}</span></section>
        <section class="ct-de-onde" data-ct-alvo="cena"><span class="label-mono">De onde veio${outras ? ` · ${c.frases.length} lugares` : ''}</span>${cena(c.frases[0], 0)}
          ${outras ? `<button type="button" class="ct-expande" aria-expanded="false" data-ct="mais-lugares">${ica('chevron-down')}<span>Mais ${outras} ${outras === 1 ? 'lugar' : 'lugares'} onde apareceu</span></button><div class="ct-recolhido" hidden>${c.frases.slice(1).map((f, k) => cena(f, k + 1)).join('')}</div>` : ''}</section>
        ${ctDificil(c) ? `<section class="ct-aviso-dificil"><span class="label-mono">${ica('triangle-alert')} Palavra difícil · errada ${c.lapsos} vezes</span><p class="mut">Costuma ser o cartão, não você: edite a tradução, troque a frase ou suspenda por um tempo.</p></section>` : ''}</div>`;
    const d = ctAbrir(
      'ct:palavra',
      `<dialog class="gaveta ct-gaveta" aria-label="${esc(c.p)}"><div class="dlg-cab"><span class="q-ic" aria-hidden="true">${ica('book-open')}</span><div style="min-width:0"><span class="label-mono">${c.nv} · ${c.lang === 'en' ? 'inglês' : 'espanhol'} · ${rot.toLowerCase()}</span><h2 style="font-size:26px" lang="${c.lang}">${esc(c.p)}</h2><p class="mut tn">${c.ipa}</p></div><button type="button" class="x" aria-label="Fechar">${ica('x')}</button></div>
        <div class="gav-corpo pilha-g"><div class="linha ct-ouvir" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-outline peq" data-ct-ouvir="voz">${ica('volume-2')} Ouvir</button>
            ${c.frases[0][3] ? `<button type="button" class="btn btn-outline peq" data-ct-ouvir="original" data-k="0" data-ct-alvo="fala-original">${ica('audio-lines')} Fala original · ${esc(c.frases[0][3])}</button>` : `<span class="ct-sem-fala mut">${ica('audio-lines')} Sem fala gravada</span>`}
            <div class="seg" role="radiogroup" aria-label="Velocidade da pronúncia"><button type="button" role="radio" aria-checked="false">0,75×</button><button type="button" role="radio" aria-checked="true">1×</button></div></div>
          ${corpo}
          <section class="cartao p5 sutil pele-padrao ${c.est === 'nova' ? 'cartao-nova' : 'cartao-aprendida'}"><span class="label-mono">Na sua memória · ${rot}</span><div class="memoria-g">${[['Próxima revisão', c.vence === 'nova' ? 'ainda não vista' : c.vence], ['Estabilidade', c.estab ? String(c.estab).replace('.', ',') + ' dias' : '—'], ['Dificuldade', c.dif ? String(c.dif).replace('.', ',') + ' de 10' : '—'], ['Acertos', c.acertos || '—']].map(([k, v]) => `<div><small class="mut">${k}</small><b class="tn">${v}</b></div>`).join('')}</div>
            <button type="button" class="ct-expande ct-historico" aria-expanded="false" data-ct="historico" data-ct-alvo="historico" ${hist.length ? '' : 'disabled'}>${ica('history')}<span><b>Histórico</b><small>${hist.length ? `${hist.length} revisões · a última: ${hist[0][0]}, ${hist[0][1]}, voltou em ${hist[0][2]}` : 'Ainda sem revisões'}</small></span>${hist.length ? ica('chevron-down') : ''}</button>
            <div class="ct-recolhido ct-hist" hidden><table class="q-tabela"><thead><tr><th>Quando</th><th>Nota</th><th>Voltou em</th></tr></thead><tbody>${hist.map(([q, nota, iv]) => `<tr><td>${q}</td><td><span class="q-tag ${CT_TOM_DA_NOTA[nota] || ''}">${nota}</span></td><td>${iv}</td></tr>`).join('')}</tbody></table>
              <p class="mut ct-hist-nota">Agenda do FSRS, com meta de ${CT_AJ.retencao}% de retenção.${c.tags.length ? ` Etiquetas: ${c.tags.map((t) => '#' + t).join(' ')}.` : ''}</p></div></section></div>
        <div class="ct-mais-da-palavra" hidden><button type="button" class="btn btn-outline peq" data-ct="suspender-palavra">${ica(c.est === 'suspensa' ? 'play' : 'pause')} ${c.est === 'suspensa' ? 'Reativar' : 'Suspender'}</button><button type="button" class="btn btn-outline peq" data-ct="outro-jeito">${ica('sparkles')} Praticar de outro jeito</button><button type="button" class="btn btn-outline peq" data-ct="pronuncia">${ica('mic')} Praticar pronúncia</button><button type="button" class="btn btn-outline peq" data-ct="tutor">${ica('message-circle')} Perguntar ao tutor</button><button type="button" class="btn btn-outline peq perigo" data-ct="nao-clonado">${ica('trash-2')} Excluir</button></div>
        <div class="gav-pe ct-pe-da-palavra"><button type="button" class="btn btn-outline" data-ct="editar-palavra">${ica('pencil')} Editar</button><button type="button" class="btn btn-outline ct-so-icone" data-ct="mais-da-palavra" aria-expanded="false" aria-label="Mais ações: suspender, praticar, tutor, excluir" title="Suspender, praticar, tutor, excluir">${ica('ellipsis')}</button><span style="flex:1"></span>
          <button type="button" class="btn btn-solid" data-ct="revisar-palavra">${ica('target')} Revisar</button></div></dialog>`,
      o.gatilho,
      (b, dlg) => {
        const a = b.dataset.ct;
        if (b.dataset.ctOuvir === 'voz') return void dizer(c.p, { lang: c.lang === 'es' ? 'es-ES' : 'en-US' });
        if (b.dataset.ctOuvir === 'original') return ctTocarOriginal(b, c, +b.dataset.k);
        if (a === 'mais-lugares' || a === 'historico' || a === 'mais-da-palavra') {
          const alvo = a === 'mais-da-palavra' ? $('.ct-mais-da-palavra', dlg) : b.nextElementSibling;
          const abre = alvo.hidden;
          alvo.hidden = !abre;
          b.setAttribute('aria-expanded', abre);
          sentir('aba');
          if (abre && polido() && !reduz()) {
            anima(alvo, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 320 });
            $$(':scope > *, tbody tr', alvo).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 300, atraso: 40 + Math.min(i, 8) * 35 }));
          }
          if (abre && a !== 'mais-da-palavra') alvo.scrollIntoView({ block: 'nearest', behavior: reduz() ? 'auto' : 'smooth' });
          return;
        }
        if (a === 'editar-palavra') return ctAbrirPalavra(id, { editar: true });
        if (a === 'cancelar-edicao') return ctAbrirPalavra(id);
        if (a === 'salvar-palavra') {
          c.t = $('#pw-t', dlg).value.trim() || c.t;
          toast('Palavra atualizada');
          ctAbrirPalavra(id);
          return atual === 'cartoes' ? ctRepintar() : atual === 'estudo' && ctPintarRodada('seco');
        }
        if (a === 'suspender-palavra') {
          c.est = c.est === 'suspensa' ? (c.estab ? 'revisao' : 'nova') : 'suspensa';
          toast(c.est === 'suspensa' ? `“${c.p}” suspensa: não aparece na revisão até você reativar` : `“${c.p}” volta para a revisão`);
          fecharDialogo(dlg);
          return atual === 'cartoes' && ctRepintar();
        }
        if (a === 'abrir-sessao') return fecharDialogo(dlg), ctAbrirSessao(b.dataset.id);
        if (a === 'outro-jeito') return fecharDialogo(dlg), ctOutroJeito({ origem: 'palavras', rotulo: c.p, n: 1, ids: [id] });
        if (a === 'revisar-palavra') return fecharDialogo(dlg), ctEstudar({ ids: [id], rotulo: c.p });
        if (a === 'pronuncia') return toast('No app, aqui abre a sombra da fala: você repete e vê a nota de pronúncia.');
        if (a === 'tutor') return toast('No app, o tutor abre já com esta palavra e a frase de onde ela veio.');
        if (a === 'nao-clonado') return toast(`${txt(b)}: não clonado neste protótipo.`);
      },
    );
    return d;
  }
  /* "Fala original": no app toca o trecho gravado da sessão. Aqui a voz do navegador faz as vezes dela,
     e as barras do som mostram que está tocando. */
  function ctTocarOriginal(b, c, k = 0) {
    const f = c.frases[k];
    if (!f) return;
    b.classList.add('ct-tocando');
    sentir('grava');
    dizer(f[0], { lang: c.lang === 'es' ? 'es-ES' : 'en-US' }).then(() => b.classList.remove('ct-tocando'));
    setTimeout(() => b.classList.remove('ct-tocando'), 3200 * K());
  }
  function ctAbrirSessao(id) {
    const titulo = ctBaralho(id).nome;
    const i = GRAVACOES.findIndex((g) => g.t === titulo);
    if (i < 0) return toast('Esta origem não é uma sessão gravada.');
    Object.assign(bib, { tipo: 'Todas', busca: '', sel: i, pag: Math.floor(i / 4) });
    sessao.aba = 0;
    ir('sessao');
    toast('No app, a sessão abre no trecho da fala, já tocando.');
  }

  /* Ajustes da memória: o que é de todo mundo em cima; o que é de quem vem do Anki, embaixo. */
  function ctCarga() {
    /* Estimativa de exemplo: sobe devagar até 90% e forte depois (docs.ankiweb.net/deck-options). */
    const r = CT_AJ.retencao;
    const base = 20 * (CT_AJ.novas / 10);
    return Math.round(base * (r <= 90 ? 0.55 + (r - 80) * 0.045 : 1 + Math.pow((r - 90) / 3.2, 2.1) * 0.9));
  }
  function ctHtmlDosAjustes() {
    const a = CT_AJ;
    const carga = ctCarga();
    const aj = (t, s, controle, extra = '') => `<div class="q-ajuste" ${extra}><div><b>${t}</b>${s ? `<small>${s}</small>` : ''}</div>${controle}</div>`;
    const int = (k, rot) => `<button type="button" class="q-interruptor" role="switch" aria-checked="${!!a[k]}" aria-label="${rot}" data-ct-liga="${k}"></button>`;
    /* Os três que quase todo mundo mexe ficam à vista; o resto, atrás de "Mais ajustes". */
    return `${aj(`Meta de retenção · <span data-ct-v="retencao">${a.retencao}</span>%`, `<span data-ct-v="carga">${ctTextoDaCarga(carga)}</span>`, `<span class="qr-passo"><button type="button" class="q-ctl" aria-label="Diminuir: Meta de retenção" data-ct-ret="-1">${ica('minus')}</button><input type="range" min="80" max="97" value="${a.retencao}" aria-label="Meta de retenção" data-ct-campo="retencao"><button type="button" class="q-ctl" aria-label="Aumentar: Meta de retenção" data-ct-ret="1">${ica('plus')}</button></span>`, 'data-ct-alvo="retencao-aj"')}
      ${aj('Novas por dia', `Hoje: ${Math.min(5, a.novas)} de <span data-ct-v="novas">${a.novas}</span>. Vale em todos os aparelhos.`, ctPasso('novas', 'Novas por dia', a.novas), 'data-ct-alvo="novas-aj"')}
      ${aj('Revisões por dia', 'O que passar do limite fica para amanhã, sem virar dívida.', ctPasso('revisoes', 'Revisões por dia', a.revisoes))}
      <button type="button" class="q-linha ct-mais-ajustes" aria-expanded="${CT.ajMais}" data-ct="mais-ajustes" data-ct-alvo="mais-ajustes"><span class="q-ic">${ica('settings-2')}</span><span><b>Mais ajustes</b><small>Botões, formato do cartão, fala original, lembrete e o que é de quem vem do Anki</small></span><span class="q-fim">${ica(CT.ajMais ? 'chevron-down' : 'chevron-down')}</span></button>
      ${
        CT.ajMais
          ? `<div class="ct-ajustes-mais">
      ${aj('Botões da resposta', a.botoes === 2 ? 'Dois: “Esqueci” e “Lembrei”. O app cuida do resto.' : 'Quatro, como no Anki: Errei, Difícil, Bom e Fácil, cada um com o intervalo escrito.', ctEscolha('botoes', 'Botões da resposta', a.botoes, [[2, 'Dois'], [4, 'Quatro']]))}
      ${aj('Formato do cartão', { lembrar: 'Você pensa e mostra a resposta. É o que mais fixa.', escolher: 'Quatro alternativas, do mesmo idioma.', digitar: 'Você escreve a tradução.', lacuna: 'A frase com um buraco: você escreve a palavra.' }[a.formato], ctEscolha('formato', 'Formato do cartão', a.formato, [['lembrar', 'Lembrar'], ['escolher', 'Escolher'], ['digitar', 'Digitar'], ['lacuna', 'Lacuna']]))}
      ${aj('Tocar a fala original ao mostrar', 'Quando a palavra veio de uma sessão gravada. Sem gravação, toca a voz do aparelho.', int('original', 'Tocar a fala original ao mostrar'))}
      ${aj('Alternar a frase a cada revisão', 'Palavra vista em mais de uma sessão aparece cada vez numa frase diferente.', int('alternar', 'Alternar a frase a cada revisão'))}
      ${aj('Lembrar quando houver revisão', 'Um aviso por dia, só se houver cartão vencido.', int('lembrete', 'Lembrar quando houver revisão'))}
      <p class="q-rotulo ct-rot-secao">Para quem vem do Anki</p>
      ${aj('Passos de aprendizagem', 'Quem erra revê a palavra na mesma sessão. Com FSRS, poucos passos e menores que um dia.', ctEscolha('passos', 'Passos de aprendizagem', a.passos, [['fim', 'No fim da fila'], ['10 min', '10 min'], ['10 min, 1 h', '10 min · 1 h']]))}
      ${aj('Ordem das revisões', '', ctEscolha('ordem', 'Ordem das revisões', a.ordem, [['vencidas', 'Vencidas primeiro'], ['faceis', 'Mais fáceis primeiro'], ['misturar', 'Misturar']]))}
      ${aj('Palavras novas', '', ctEscolha('misturaNovas', 'Palavras novas', a.misturaNovas, [['misturadas', 'Misturadas'], ['depois', 'Depois'], ['antes', 'Antes']]))}
      ${aj('Avisar de palavra difícil', 'Depois de quantos erros o app avisa e sugere o que fazer. No Anki é o limiar de sanguessuga.', ctPasso('dificil', 'Erros até o aviso', a.dificil))}
      ${aj('Dias leves', 'Nesses dias o app agenda menos revisões e empurra o que puder para os vizinhos.', `<div class="ct-dias" role="group" aria-label="Dias leves">${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<button type="button" class="q-aba" aria-pressed="${a.leves.includes(d)}" data-ct-leve="${d}">${d}</button>`).join('')}</div>`)}
      ${aj('Otimizar para a minha memória', 'Ajusta a agenda ao seu histórico (612 revisões). Roda sozinho uma vez por mês; o último foi há 12 dias.', `<button type="button" class="q-ctl" data-ct="otimizar">${ica('wand-sparkles')} Otimizar agora</button>`)}
      <div class="q-acoes ct-pe-dos-ajustes"><button type="button" class="q-ctl" data-ct="padrao">${ica('rotate-ccw')} Voltar ao padrão</button></div></div>`
          : ''
      }`;
  }
  const ctTextoDaCarga = (carga) => (CT_AJ.retencao > 93 ? `Com esta meta: cerca de ${carga} revisões por dia. Acima de 90% a carga sobe forte; 90% é o que o método recomenda.` : `Com esta meta: cerca de ${carga} revisões por dia. Mais alta = palavras voltam mais cedo.`);
  function ctAbrirAjustes(gatilho) {
    const pinta = (d) => {
      const corpo = $('.dlg-corpo', d);
      const rol = corpo.scrollTop;
      corpo.innerHTML = ctHtmlDosAjustes();
      corpo.scrollTop = rol;
      $$('.q-abas', d).forEach((g) => porPilula(g));
    };
    const d = ctAbrir(
      'ct:ajustes',
      ctDlg('sliders-horizontal', 'Ajustes da memória', 'Valem para todos os baralhos e acompanham a sua conta.', ctHtmlDosAjustes(), `<button type="button" class="q-ctl pri">${ica('check')} Pronto</button>`, 'ct-ajustes'),
      gatilho,
      (b, dlg) => {
        const ds = b.dataset;
        const p = b.closest('[data-ct-passo]');
        if (p && (ds.ctMenos != null || ds.ctMais != null)) {
          const k = p.dataset.ctPasso;
          const [min, max, passo] = { novas: [0, 200, 5], revisoes: [10, 999, 10], dificil: [3, 20, 1] }[k];
          CT_AJ[k] = Math.min(max, Math.max(min, CT_AJ[k] + (ds.ctMais != null ? passo : -passo)));
          sentir('toque');
          return pinta(dlg);
        }
        if (ds.ctRet) return (CT_AJ.retencao = Math.min(97, Math.max(80, CT_AJ.retencao + +ds.ctRet))), sentir('toque'), pinta(dlg);
        const esc2 = b.closest('[data-ct-escolha]');
        if (esc2) {
          const k = esc2.dataset.ctEscolha;
          CT_AJ[k] = k === 'botoes' ? +ds.v : ds.v;
          return pinta(dlg);
        }
        if (ds.ctLiga) return void (CT_AJ[ds.ctLiga] = !CT_AJ[ds.ctLiga]);
        if (ds.ctLeve) return (CT_AJ.leves = CT_AJ.leves.includes(ds.ctLeve) ? CT_AJ.leves.filter((x) => x !== ds.ctLeve) : [...CT_AJ.leves, ds.ctLeve]), pinta(dlg);
        if (ds.ct === 'mais-ajustes') {
          CT.ajMais = !CT.ajMais;
          sentir('aba');
          pinta(dlg);
          if (CT.ajMais && polido() && !reduz()) $$('.ct-ajustes-mais > *', dlg).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 340, atraso: Math.min(i, 10) * 35 }));
          return;
        }
        if (ds.ct === 'otimizar') return toast('No app, a agenda é recalculada com o seu histórico. Leva alguns segundos e não muda o que já venceu.');
        if (ds.ct === 'padrao') return Object.assign(CT_AJ, CT_AJ_PADRAO, { leves: [] }), pinta(dlg), toast('Ajustes de volta ao padrão.');
      },
    );
    d.addEventListener('input', (e) => {
      if (e.target.dataset.ctCampo !== 'retencao') return;
      CT_AJ.retencao = +e.target.value;
      $('[data-ct-v="retencao"]', d).textContent = CT_AJ.retencao;
      $('[data-ct-v="carga"]', d).textContent = ctTextoDaCarga(ctCarga());
    });
    d.addEventListener('close', () => (atual === 'cartoes' ? ctRepintar() : atual === 'estudo' && ctPintarRodada('seco')));
    return d;
  }
  function ctAbrirAdicionar(gatilho) {
    ctAbrir(
      'ct:add',
      ctDlg('plus', 'Adicionar palavra', 'Para o que você não tocou numa legenda. A frase é opcional, mas ajuda a lembrar.', `<label class="q-campo"><span>Palavra</span><input placeholder="Ex.: deadline" autocomplete="off"></label><label class="q-campo"><span>Tradução</span><input placeholder="Deixe em branco para o app traduzir" autocomplete="off"></label><label class="q-campo"><span>Frase de exemplo</span><textarea rows="2" placeholder="Onde você viu ou ouviu"></textarea></label>`, `<button type="button" class="q-ctl pri" data-ct="criar">${ica('plus')} Criar cartão</button>`),
      gatilho,
      (b) => b.dataset.ct === 'criar' && toast('No app, a palavra entra como nova, no baralho do idioma.'),
    );
  }
  function ctAbrirOpcoesDoBaralho(id, gatilho) {
    const b = ctBaralho(id);
    ctAbrir(
      'ct:baralho',
      ctDlg(b.i, 'Gerenciar o baralho', esc(b.nome), `<div class="q-ajuste"><div><b>Entrar na revisão de hoje</b><small>Desligado, o baralho fica guardado e nada dele vence.</small></div><button type="button" class="q-interruptor" role="switch" aria-checked="true" aria-label="Entrar na revisão de hoje"></button></div>
        <div class="q-ajuste"><div><b>Novas por dia deste baralho</b><small>Dentro do teto geral de ${CT_AJ.novas}.</small></div>${ctPasso('novasDoBaralho', 'Novas por dia deste baralho', 5)}</div>
        <div class="q-ajuste"><div><b>De onde vêm as novas primeiro</b><small>A ordem dos baralhos decide.</small></div>${ctEscolha('prioridade', 'Prioridade', 'normal', [['alta', 'Antes dos outros'], ['normal', 'Na ordem'], ['baixa', 'Por último']])}</div>
        <div class="q-lista"><button type="button" class="q-linha" data-ct="nao-clonado"><span class="q-ic">${ica('map')}</span><span><b>Mapa do conteúdo</b><small>O que já caiu, o que vence e o que nunca apareceu. Morava em Jogar › Opções.</small></span><span class="q-fim">${ica('chevron-right')}</span></button>
          <button type="button" class="q-linha" data-ct="nao-clonado"><span class="q-ic">${ica('scan-search')}</span><span><b>Curadoria do baralho</b><small>Duplicatas, palavras sem tradução e frases longas demais.</small></span><span class="q-fim">${ica('chevron-right')}</span></button></div>`, `<button type="button" class="q-ctl pri">${ica('check')} Pronto</button>`),
      gatilho,
      (x) => x.dataset.ct === 'nao-clonado' && toast(`${txt($('b', x))}: não clonado neste protótipo.`),
    );
  }
  function ctAbrirAnotacoes(gatilho) {
    const notas = [
      ['n1', 'cut … in half', 'Estrutura: cut + coisa + in half = cortar pela metade.', 'We rewrote the onboarding and cut the loading time in half.'],
      ['n2', 'walk someone through', 'Não é “andar”: é explicar passo a passo.', 'Can you walk me through the changes?'],
      ['n3', 'needs one more review', '“one more” antes do substantivo. Não “more one”.', 'The dashboard needs one more review.'],
    ];
    const html = () =>
      ctDlg('notebook-pen', 'Minhas anotações', 'O que você escreveu na Leitura. Antes ficava só neste navegador; aqui acompanha a conta.', `<div class="q-lista">${notas
        .map(([k, t, n, f]) => `<div class="q-ajuste ct-nota"><div><b lang="en">${esc(t)}</b><small>${esc(n)}</small><small class="ct-nota-frase" lang="en">“${esc(f)}” · Reunião de produto</small></div><button type="button" class="q-ctl ${CT.notasViradas.has(k) ? '' : 'pri'}" data-ct-virar="${k}" ${CT.notasViradas.has(k) ? 'disabled' : ''}>${CT.notasViradas.has(k) ? ica('check') + ' Virou cartão' : ica('plus') + ' Virar cartão'}</button></div>`)
        .join('')}</div>`, `<button type="button" class="q-ctl">Fechar</button>`);
    ctAbrir('ct:notas', html(), gatilho, (b, d) => {
      if (!b.dataset.ctVirar) return;
      CT.notasViradas.add(b.dataset.ctVirar);
      b.disabled = true;
      b.classList.remove('pri');
      b.innerHTML = ica('check') + ' Virou cartão';
      sentir('sucesso');
      if (polido() && !reduz()) rajada(...centro(b), 14);
      toast('Anotação virou cartão: a frente é a expressão, o verso é a sua nota e a frase.');
    });
  }
  /* Um "Exportar" só, para a sessão, para a linha da Biblioteca e para os cartões. */
  function ctAbrirExportar(gatilho, o = {}) {
    let qual = o.aba || 'palavras';
    const html = () => {
      const paineis = {
        transcricao: [['captions', 'Legenda (.srt)', 'Com os tempos, para tocar junto do vídeo.'], ['captions', 'Legenda (.vtt)', 'O formato da web.'], ['file-text', 'Texto (.txt)', 'Original e tradução, fala por fala.'], ['file-text', 'Documento (.docx)', 'Para ler e marcar.']],
        palavras: [['wallet-cards', 'De volta ao Anki, inteiro (.apkg)', 'Com a agenda, o histórico e a mídia: a fala original, a sua voz e a cena. O que você traz, você leva.'], ['table-2', 'Planilha (CSV)', 'Palavra, tradução, frase, estado.'], ['file-text', 'Texto para o Quizlet', 'Uma linha por palavra.']],
        relatorio: [['chart-column', 'Relatório da sessão', 'Palavras, tempo, falantes e métricas.'], ['chart-column', 'Relatório de estudo', 'O que você revisou no período.']],
      };
      return ctDlg('download', 'Exportar', esc(o.de || 'Tudo o que é seu, num lugar só'), `<div class="q-abas q-seg ct-abas-exportar" role="group" aria-label="O que exportar">${[['transcricao', 'Transcrição'], ['palavras', 'Palavras e cartões'], ['relatorio', 'Relatório']].map(([k, r]) => `<button type="button" class="q-aba" aria-pressed="${qual === k}" data-ct-exp="${k}">${r}</button>`).join('')}</div>
        <div class="q-grade g2 ct-formatos ${qual === 'palavras' ? 'ct-inteiro-primeiro' : ''}">${paineis[qual].map(([i, t, d]) => `<button type="button" class="q-tile em-linha" data-ct-formato="${esc(t)}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b><small class="q-d">${d}</small></span></button>`).join('')}</div>`, `<button type="button" class="q-ctl">Fechar</button>`, 'ct-exportar');
    };
    ctAbrir('ct:exportar', html(), gatilho, (b, d) => {
      if (b.dataset.ctExp) {
        qual = b.dataset.ctExp;
        const novo = modelo(html()).querySelector('.dlg-corpo');
        $('.dlg-corpo', d).replaceChildren(...novo.childNodes);
        $$('.q-abas', d).forEach((g) => porPilula(g));
        return;
      }
      if (b.dataset.ctFormato) toast(`${b.dataset.ctFormato}: no app, o arquivo é baixado aqui.`);
    });
  }

  /* ==========================================================================
     As folhas da versão enxuta: o "…", o "+" (Trazer e levar), o Anki em dois passos,
     a oferta de juntar a cena, "E o resto?" e o "…" do baralho.
     Todas no molde ctDlg: painel no computador, folha que sobe no celular.
     ========================================================================== */
  const ctLinhasDeMenu = (l) =>
    `<div class="q-lista ct-menu-lista">${l
      .filter(Boolean)
      .map(([i, t, d, k]) => `<button type="button" class="q-linha" data-ct-m="${k}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span><span class="q-fim">${ica('chevron-right')}</span></button>`)
      .join('')}</div>`;
  const ctCorpoDe = (d, html) => {
    const corpo = $('.dlg-corpo', d);
    const rol = corpo.scrollTop;
    corpo.innerHTML = html;
    corpo.scrollTop = rol;
    $$('.q-abas', d).forEach((g) => porPilula(g));
    return corpo;
  };
  /* O "…" do cabeçalho: idioma, ajustes da memória, memória, exportar. */
  function ctAbrirMenu(gatilho) {
    const a = CT_AJ;
    const comDados = CT.hoje !== 'vazio' && CT.hoje !== 'primeiro';
    ctAbrir(
      'ct:menu',
      ctDlg('ellipsis', 'Mais opções', '', `${ctLinhasDeMenu([
          ['plus', 'Palavra nova', 'Uma de cada vez, com a frase se quiser', 'nova'],
          ['arrow-left-right', 'Trazer e levar', 'Lista, arquivo do Anki, exportar', 'trazer'],
          comDados && CT_BARALHOS.some((x) => x.id === fsDeck()) && !['tudo', 'en', 'es', 'dificeis'].includes(fsDeck()) && [fxFonte().i, `Opções de ${esc(fsNome())}`, 'Gerenciar, exportar, compartilhar por link', 'conteudo'],
          ['sliders-horizontal', 'Ajustes da memória', `Meta de ${a.retencao}%, ${a.novas} novas e ${a.revisoes} revisões por dia`, 'ajustes'],
          ['brain', ctNomeDaAba(4), 'Sequência, retenção, previsão e calendário', 'memoria'],
        ])}`, '', 'ct-menu'),
      gatilho,
      (b, d) => {
        const k = b.dataset.ctM;
        if (k === 'nova') return ctAbrirAdicionar(gatilho);
        if (k === 'trazer') return ctAbrirTrazerELevar(gatilho);
        if (k === 'conteudo') return ctAbrirMenuDoBaralho(fsDeck(), gatilho);
        if (k === 'ajustes') return ctAbrirAjustes(gatilho);
        if (k === 'memoria') return fecharDialogo(d), ctIrAba(4);
        if (k === 'exportar') return ctAbrirExportar(gatilho, { de: `${num(CT_FASES.total)} cartões` });
      },
    );
  }
  /* O "+": uma folha só para tudo o que entra e sai. */
  function ctAbrirTrazerELevar(gatilho) {
    ctAbrir(
      'ct:trazer',
      ctDlg('arrow-left-right', 'Trazer e levar', 'Suas palavras entram e saem inteiras.', ctLinhasDeMenu([
        ['plus', 'Palavra nova', 'Uma de cada vez, com a frase se quiser.', 'nova'],
        ['clipboard', 'Colar uma lista', 'Uma por linha, com ou sem tradução. Também lê CSV.', 'lista'],
        ['wallet-cards', 'Arquivo do Anki', 'Com a agenda e o histórico. Você vê o ensaio antes de gravar.', 'anki'],
        ['download', 'Exportar', 'De volta ao Anki inteiro, planilha ou texto. O que você traz, você leva.', 'exportar'],
      ]), '', 'ct-menu ct-trazer'),
      gatilho,
      (b) => {
        const k = b.dataset.ctM;
        if (k === 'nova') return ctAbrirAdicionar(gatilho);
        if (k === 'lista') return ctAbrirLista(gatilho);
        if (k === 'anki') return ctAbrirAnki(1, gatilho);
        if (k === 'exportar') return ctAbrirExportar(gatilho, { de: `${num(CT_FASES.total)} cartões` });
      },
    );
  }
  function ctAbrirLista(gatilho) {
    const nota = () => {
      const [n, sem] = ctLinhasDaLista();
      return `${n} ${n === 1 ? 'linha reconhecida' : 'linhas reconhecidas'}${sem ? ` · ${sem} sem tradução: o app traduz e marca como “a conferir”` : ''}`;
    };
    const criar = () => {
      const n = ctLinhasDaLista()[0];
      return `${ica('plus')} Criar ${n} ${n === 1 ? 'cartão' : 'cartões'}`;
    };
    const d = ctAbrir(
      'ct:lista',
      ctDlg('clipboard', 'Colar uma lista', 'Uma palavra por linha. Se houver tradução, separe com ponto e vírgula, tabulação ou hífen.', `<label class="q-campo ct-lista"><span class="sr">Lista de palavras</span><textarea rows="7" spellcheck="false" data-ct-campo="lista">${esc(CT.lista)}</textarea></label>
        <p class="qv-nota" id="ct-lista-nota">${nota()}</p>
        <div class="q-acoes"><button type="button" class="q-ctl" data-ct="csv">${ica('file-text')} Escolher um CSV</button></div>`, `<button type="button" class="q-ctl">Cancelar</button><button type="button" class="q-ctl pri" data-ct="lista-criar">${criar()}</button>`, 'ct-folha-lista'),
      gatilho,
      (b) => {
        if (b.dataset.ct === 'csv') return toast('No app, abre o seletor de arquivos e lê a planilha coluna por coluna.');
        if (b.dataset.ct === 'lista-criar') return toast(`${ctLinhasDaLista()[0]} cartões criados no baralho “Inglês”. Os sem tradução ficam marcados como “a conferir”.`);
      },
    );
    d.addEventListener('input', (e) => {
      if (e.target.dataset?.ctCampo !== 'lista') return;
      CT.lista = e.target.value;
      $('#ct-lista-nota', d).textContent = nota();
      const b = $('[data-ct="lista-criar"]', d);
      b.innerHTML = criar();
      b.disabled = !ctLinhasDaLista()[0];
    });
  }

  /* ---- Anki em dois passos --------------------------------------------------------- */
  /* Passo 1, o ensaio: nada é gravado. O que vem, o que não vem, a agenda (com a carga de cada escolha) e os campos. */
  function ctHtmlDoEnsaio() {
    const ag = CT.ankiAgenda === 'agenda';
    const A = CT_ANKI;
    const escolha = (k, t, d, rec) =>
      `<button type="button" class="q-tile ct-escolha-agenda" role="radio" aria-checked="${CT.ankiAgenda === k}" data-ct-agenda="${k}"><span class="ct-escolha-topo"><b>${t}</b>${rec ? '<span class="q-tag ct-rv">Recomendada</span>' : ''}</span><span class="q-d">${d}</span><span class="q-rotulo">Carga dos próximos 7 dias</span>${ctMini7(CT_CARGA7[k], t)}</button>`;
    return `<div class="q-secao ct-agenda-sec" data-ct-alvo="agenda"><header><div><h3>Como entram na sua agenda</h3></div></header>
        <div class="q-grade g2 ct-agendas" role="radiogroup" aria-label="Como entram na sua agenda">${escolha('agenda', 'Trazer com a agenda e o histórico do Anki', `As ${A.comAgenda} que você já estudou continuam de onde pararam. Uns 31 cartões por dia, sem pilha no primeiro dia.`, 1)}${escolha('zero', 'Começar do zero', `As ${A.vieram} entram como novas, 10 por dia. O que você já sabia volta como se fosse a primeira vez.`)}</div></div>
      <div class="q-grade g2 ct-vem-nao-vem" data-ct-alvo="vem">
        <div class="q-cartao fundo"><p class="q-rotulo">O que vem</p><ul class="ct-itens">
          ${ctItem(1, `${A.vieram} de ${A.notas} notas, com todos os campos`, 'Guardados pelo nome que têm no Anki: Front, Back, Example, Audio, Notes.')}
          ${ag ? ctItem(1, 'A agenda e o histórico', `${A.comAgenda} notas já estudadas, com as revisões de cada uma. Os intervalos são convertidos para o FSRS.`) : ''}
          ${ctItem(1, '12 etiquetas e o tipo de nota', 'Reimportar atualiza as notas, sem duplicar.')}</ul></div>
        <div class="q-cartao fundo"><p class="q-rotulo">O que não vem</p><ul class="ct-itens">
          ${ag ? '' : ctItem(0, 'A agenda e o histórico', 'Você escolheu começar do zero. Dá para mudar acima.')}
          ${ctItem(0, 'Áudio e imagens (312 arquivos)', 'O cartão usa a voz do aparelho. Se a palavra aparecer num vídeo seu, ganha a fala original.')}
          ${ctItem(0, `${A.fora} notas`, '9 de oclusão de imagem e 5 com a frente vazia.')}
          ${ctItem(0, 'O desenho do cartão', 'Modelos com HTML e CSS não são usados.')}</ul></div>
      </div>
      <div class="q-secao" data-ct-alvo="campos"><header><div><h3>De qual campo vem cada coisa</h3></div>${ctDica('O app sugeriu pelo nome dos campos. Confira e troque o que precisar.')}</header>
        <div class="ct-mapear">${CT_CAMPOS.map(([c, d]) => `<label class="ct-campo-do-anki"><span class="q-tag off">${c}</span>${ica('arrow-right')}<select class="q-campo" aria-label="Destino do campo ${c}">${CT_DESTINOS.map((o) => `<option ${o === d ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="ct-previa"><div><span class="q-rotulo">Frente</span><b lang="en">boarding pass</b><small lang="en">“May I see your boarding pass, please?”</small></div><div><span class="q-rotulo">Verso</span><b>cartão de embarque</b><small>“Posso ver seu cartão de embarque, por favor?”</small></div></div></div>`;
  }
  /* Passo 2, o relatório: quantos vieram, quantos ficaram de fora e por quê, o desfazer e a oferta da cena. */
  function ctHtmlDoRelatorio() {
    const ag = CT.ankiAgenda === 'agenda';
    const A = CT_ANKI;
    return `<div class="q-cartao fundo qr-fecho ct-relatorio-topo"><span class="q-ic">${ica('circle-check')}</span><div><h2>${A.vieram} notas trazidas</h2><p>${ag ? `${A.comAgenda} continuam de onde pararam no Anki; ${A.novas} entram como novas, no seu limite de ${CT_AJ.novas} por dia.` : `Todas entram como novas, ${CT_AJ.novas} por dia.`}</p></div></div>
      <div class="q-grade g3 ct-relatorio-numeros">${[['Vieram', A.vieram, 'bom'], ['Ficaram de fora', A.fora, 'aviso'], [ag ? 'Com a agenda' : 'Como novas', ag ? A.comAgenda : A.vieram, '']].map(([r, v, t]) => `<div class="q-num"><span class="q-rotulo">${r}</span><b class="${t}">${num(v)}</b></div>`).join('')}</div>
      <div class="q-cartao fundo"><p class="q-rotulo">Ficaram de fora, e por quê</p><ul class="ct-itens">
        ${ctItem(0, '9 notas de oclusão de imagem', 'O app ainda não tem esse tipo de cartão. Continuam no seu arquivo.')}
        ${ctItem(0, '5 notas com a frente vazia', 'Estavam em branco no Anki.')}
        ${ctItem(0, '312 arquivos de áudio e imagem', 'Os cartões usam a voz do aparelho.')}</ul></div>
      <div class="q-ajuste ct-desfazer-importacao" data-ct-alvo="desfazer-importacao"><div><b>Desfazer esta importação</b><small>Disponível por 30 dias. Tira as ${A.vieram} notas e devolve a agenda ao que era.</small></div><button type="button" class="q-ctl" data-ct="anki-desfazer">${ica('undo-2')} Desfazer</button></div>
      <div class="q-aviso ct-oferta-cena" data-ct-alvo="oferta-cena"><span class="qv-aviso-texto">${ica('sparkles')}<span><b>${A.casadas} destas palavras aparecem nos seus vídeos.</b> Juntar a frase, a voz e a cena a esses cartões?</span></span><button type="button" class="q-ctl" data-ct="anki-enriquecer">Ver como fica</button></div>`;
  }
  function ctAbrirAnki(passo = 1, gatilho) {
    CT.anki = passo;
    const A = CT_ANKI;
    if (passo === 2)
      return ctAbrir(
        'ct:anki2',
        ctDlg('circle-check', 'Trazer do Anki', `Passo 2 de 2: o relatório · ${A.nome}`, ctHtmlDoRelatorio(), `<button type="button" class="q-ctl" data-ct="anki-ver">${ica('layers')} Ver nos baralhos</button><button type="button" class="q-ctl pri">${ica('check')} Pronto</button>`, 'ct-anki ct-anki-2'),
        gatilho,
        (b, d) => {
          const a = b.dataset.ct;
          if (a === 'anki-desfazer') return fecharDialogo(d), (CT.anki = 0), sentir('desliga'), toast(`Importação desfeita: as ${A.vieram} notas saíram e a agenda voltou ao que era.`, 4600);
          if (a === 'anki-enriquecer') return ctAbrirEnriquecer(gatilho);
          if (a === 'anki-ver') return ctIrAba(1);
        },
      );
    return ctAbrir(
      'ct:anki1',
      ctDlg('upload', 'Trazer do Anki', `Passo 1 de 2: o ensaio · ${A.nome}.apkg · nada foi gravado ainda`, ctHtmlDoEnsaio(), `<button type="button" class="q-ctl">Cancelar</button><button type="button" class="q-ctl pri" data-ct="anki-trazer">${ica('check')} Trazer as ${A.vieram}</button>`, 'ct-anki ct-anki-1'),
      gatilho,
      (b, d) => {
        if (b.dataset.ctAgenda) {
          if (CT.ankiAgenda === b.dataset.ctAgenda) return;
          CT.ankiAgenda = b.dataset.ctAgenda;
          sentir('aba');
          const corpo = ctCorpoDe(d, ctHtmlDoEnsaio());
          if (polido() && !reduz()) {
            $$('.ct-vem-nao-vem li', corpo).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 320, atraso: i * 30 }));
            $$(`[data-ct-agenda="${CT.ankiAgenda}"] .ct-mini7 i`, corpo).forEach((x, i) => anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { d: 520, atraso: i * 40, e: MOLA_SUAVE }));
          }
          return;
        }
        if (b.dataset.ct === 'anki-trazer') {
          ctAbrirAnki(2, gatilho);
          sentir('sucesso');
          if (polido() && !reduz() && !QS.has('quieto')) confete(60);
        }
      },
    );
  }
  /* Depois de importar: as palavras do baralho que aparecem nos vídeos da pessoa ganham a frase, a voz e a cena. */
  function ctAbrirEnriquecer(gatilho) {
    const A = CT_ANKI;
    ctAbrir(
      'ct:enriquecer',
      ctDlg('sparkles', 'Juntar a cena aos cartões', `${A.casadas} das ${A.vieram} palavras trazidas aparecem nos seus vídeos e gravações.`, `<div class="q-grade g2 ct-antes-depois">
          <div class="q-cartao fundo"><p class="q-rotulo">Antes · como veio do Anki</p><b class="ct-ad-palavra" lang="en">to book</b><p class="ct-ad-t">reservar</p>
            <blockquote lang="en">“I'd like to book a table for two.”</blockquote>
            <p class="ct-ad-meta">${ica('volume-2')} Voz do aparelho · sem cena</p></div>
          <div class="q-cartao fundo ct-depois"><p class="q-rotulo">Depois · com a sua cena</p><b class="ct-ad-palavra" lang="en">to book</b><p class="ct-ad-t">reservar</p>
            <div class="ct-cena primeira"><span class="ct-cena-quadro" aria-hidden="true">${ica('clapperboard')}<small>12:08</small></span><div class="ct-cena-texto"><blockquote lang="en">“We should <mark>book</mark> the room before Friday.”</blockquote><small class="mut">Reunião de produto · Ana</small></div></div>
            <p class="ct-ad-meta">${ica('audio-lines')} Fala original · a frase do Anki continua guardada</p>
            <button type="button" class="q-chip ct-som" data-ct="ouvir-cena">${ica('play')} Ouvir a fala</button></div>
        </div>
        <p class="qv-nota ct-com-icone">${ica('info')}<span>As duas frases se alternam na revisão. 4 das ${A.casadas} têm mais de um sentido: o app pede a sua confirmação antes de juntar.</span></p>`, `<button type="button" class="q-ctl">Agora não</button><button type="button" class="q-ctl pri" data-ct="juntar">${ica('sparkles')} Juntar nas ${A.casadas}</button>`, 'ct-enriquecer'),
      gatilho,
      (b) => {
        if (b.dataset.ct === 'ouvir-cena') return void dizer('We should book the room before Friday.', { lang: 'en-US' });
        if (b.dataset.ct === 'juntar') {
          sentir('sucesso');
          if (polido() && !reduz() && !QS.has('quieto')) confete(40);
          toast(`${A.casadas - 4} cartões ganharam a frase, a voz e a cena. 4 esperam a sua confirmação em Baralhos.`, 4600);
        }
      },
    );
  }

  /* Pilha acumulada: as quatro saídas saíram da tela e moram aqui, atrás de "E o resto?". */
  function ctAbrirResto(gatilho) {
    const html = () => {
      const op = CT_SAIDAS_DA_PILHA();
      return `<div class="q-ajuste"><div><b>Limite de hoje</b><small>Quantos cartões você estuda hoje.</small></div>${ctPasso('tetoDaPilha', 'Limite de hoje', CT.tetoDaPilha)}</div>
        <div class="q-lista ct-saidas" role="radiogroup" aria-label="O que fazer com o resto">${Object.entries(op)
          .map(([k, [i, t, d]]) => `<button type="button" class="q-linha" role="radio" aria-checked="${CT.pilha === k}" data-ct-pilha="${k}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b><small>${d}</small></span><span class="q-fim ct-marcado">${ica('check')}</span></button>`)
          .join('')}</div>
        <div class="q-cartao fundo ct-semana-do-resto"><p class="q-rotulo">Como fica a semana</p>${ctMini7(op[CT.pilha][3], 'Como fica a semana', 58)}</div>`;
    };
    const d = ctAbrir(
      'ct:resto',
      ctDlg('layers', 'E o resto?', 'Escolha uma saída. Dá para mudar amanhã.', html(), `<button type="button" class="q-ctl pri">${ica('check')} Pronto</button>`, 'ct-resto-folha'),
      gatilho,
      (b, dlg) => {
        const p = b.closest('[data-ct-passo]');
        if (p) CT.tetoDaPilha = Math.min(100, Math.max(10, CT.tetoDaPilha + (b.dataset.ctMais != null ? 10 : -10)));
        else if (b.dataset.ctPilha) CT.pilha = b.dataset.ctPilha;
        else return;
        sentir(p ? 'toque' : 'aba');
        const corpo = ctCorpoDe(dlg, html());
        if (polido() && !reduz()) $$('.ct-mini7 i', corpo).forEach((x, i) => anima(x, [{ transform: 'scaleY(0.2)' }, { transform: 'scaleY(1)' }], { d: 480, atraso: i * 35, e: MOLA_SUAVE }));
      },
    );
    d.addEventListener('close', () => atual === 'cartoes' && ctRepintar());
  }

  /* O "…" do baralho: o que não é de todo dia. */
  function ctAbrirMenuDoBaralho(id, gatilho) {
    const b = ctBaralho(id);
    ctAbrir(
      'ct:menu-baralho',
      ctDlg(b.i, esc(b.nome), '', ctLinhasDeMenu([
        b.g === 'sessao' && ['external-link', 'Abrir a sessão', 'No trecho da primeira palavra', 'sessao'],
        b.de && ['plus', 'Ativar mais 20', `${num(b.total)} de ${num(b.de)} já ativadas`, 'ativar'],
        ['sliders-horizontal', 'Gerenciar', 'Novas por dia, prioridade, mapa do conteúdo e curadoria', 'gerenciar'],
        ['download', 'Exportar', 'De volta ao Anki inteiro, planilha ou texto', 'exportar'],
        ['share-2', 'Compartilhar por link', 'Quem abrir recebe uma cópia, sem a sua agenda', 'link'],
      ]), '', 'ct-menu'),
      gatilho,
      (x, d) => {
        const k = x.dataset.ctM;
        if (k === 'sessao') return fecharDialogo(d), ctAbrirSessao(id);
        if (k === 'ativar') return fecharDialogo(d), toast(`Mais 20 notas de “${b.nome}” entram como novas, no ritmo do seu limite diário.`);
        if (k === 'gerenciar') return ctAbrirOpcoesDoBaralho(id, gatilho);
        if (k === 'exportar') return ctAbrirExportar(gatilho, { de: b.nome });
        if (k === 'link') return fecharDialogo(d), sentir('sucesso'), toast('Link copiado. Quem abrir recebe uma cópia do baralho, sem a sua agenda.');
      },
    );
  }
  /* Cobertura: as palavras do último vídeo que este baralho ainda não tem. */
  function ctAbrirFaltam(id, gatilho) {
    const b = ctBaralho(id);
    const [pct, n] = CT_COBERTURA[id] || [0, 0];
    ctAbrir(
      'ct:faltam',
      ctDlg('clapperboard', 'As que faltam', `“${esc(b.nome)}” cobre ${pct}% do vídeo “How we plan a product launch”, de ontem.`, `<div class="q-lista ct-faltam">${CT_FALTAM.map(([p, t, f]) => `<div class="q-ajuste"><div><b lang="en">${p}</b><small>${t} · <span lang="en">“${esc(f)}”</span></small></div></div>`).join('')}</div>
        <p class="qv-nota">E mais ${n - CT_FALTAM.length}. Cada uma chega com a frase e a fala do vídeo.</p>`, `<button type="button" class="q-ctl">Fechar</button><button type="button" class="q-ctl pri" data-ct="guardar-faltam">${ica('plus')} Guardar as ${n}</button>`, 'ct-faltam-folha'),
      gatilho,
      (x) => x.dataset.ct === 'guardar-faltam' && (sentir('sucesso'), toast(`${n} palavras guardadas em “${b.nome}”. Entram como novas, no seu limite diário.`, 4200)),
    );
  }

  /* ==========================================================================
     Ligações da tela
     ========================================================================== */
  function ctRepintarTabela() {
    const t = $('#ct-tabela', tela);
    if (!t) return ctRepintar();
    const fx = $('.ct-faixa-sel', tela);
    const faixa = ctFaixaDaSelecao();
    if (!fx && faixa) return ctRepintar();
    t.innerHTML = ctTabela();
    const q = $('.qv-quantas', tela);
    if (q) q.textContent = ctQuantas();
    if (fx) fx.outerHTML = faixa;
    if (polido() && !reduz()) $$('tbody tr', t).slice(0, 14).forEach((x, k) => anima(x, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 320, atraso: k * 22 }));
  }
  function ctMarcar(id, origem) {
    const m = CT.f.marcados;
    if (id === '*') {
      const l = ctFiltradas();
      const todas = l.every((c) => m.has(c.id));
      l.forEach((c) => (todas ? m.delete(c.id) : m.add(c.id)));
    } else if (m.has(id)) m.delete(id);
    else m.add(id);
    sentir('toque');
    const t = $('#ct-tabela', tela);
    t.innerHTML = ctTabela();
    $('.ct-faixa-sel', tela).outerHTML = ctFaixaDaSelecao();
    void origem;
  }
  /* Ação em massa: aplica, sai da seleção e deixa o "Desfazer" no pé da lista por alguns segundos. */
  function ctEmMassa(acao) {
    const ids = [...CT.f.marcados];
    const n = ids.length;
    if (!n) return;
    if (acao === 'exportar') return ctAbrirExportar(null, { de: `${n} ${n === 1 ? 'palavra selecionada' : 'palavras selecionadas'}` });
    if (acao === 'praticar') return ctOutroJeito({ origem: 'palavras', rotulo: `${n} ${n === 1 ? 'palavra selecionada' : 'palavras selecionadas'}`, n, ids });
    const antes = ids.map((id) => ({ id, est: ctCarta(id).est, tags: [...ctCarta(id).tags] }));
    if (acao === 'suspender') ids.forEach((id) => (ctCarta(id).est = 'suspensa'));
    if (acao === 'mover') ids.forEach((id) => ctCarta(id).tags.includes('difícil') || ctCarta(id).tags.push('difícil'));
    if (acao === 'etiquetar') ids.forEach((id) => ctCarta(id).tags.includes('rever') || ctCarta(id).tags.push('rever'));
    CT.f.marcados.clear();
    CT.f.sel = false;
    const feito = (CT.desfazer = { antes, texto: { suspender: `${n} ${n === 1 ? 'suspensa' : 'suspensas'}`, mover: `${n} em Difíceis`, etiquetar: `${n} com a etiqueta #rever` }[acao] });
    sentir('sucesso');
    ctRepintar('#ct-tabela tbody tr');
    setTimeout(() => CT.desfazer === feito && ((CT.desfazer = null), atual === 'cartoes' && $('.ct-faixa-desfazer', tela)?.remove()), 9000 * K());
  }
  function ctDesfazerMassa() {
    const x = CT.desfazer;
    if (!x) return;
    x.antes.forEach(({ id, est, tags }) => Object.assign(ctCarta(id), { est, tags }));
    CT.desfazer = null;
    sentir('desliga');
    ctRepintar('#ct-tabela tbody tr');
    toast('Desfeito: as palavras voltaram a como estavam.');
  }
  tela.addEventListener('click', (e) => {
    if (atual !== 'cartoes') return;
    const tr = e.target.closest('tr[data-ct-carta]');
    if (!tr) return;
    if (CT.f.sel || e.target.closest('.ct-caixa')) return ctMarcar(tr.dataset.ctCarta, tr);
    ctAbrirPalavra(tr.dataset.ctCarta, { gatilho: tr });
  });
  tela.addEventListener('input', (e) => {
    if (e.target.dataset?.ctCampo === 'busca') (CT.f.busca = e.target.value), ctRepintarTabela();
  });
  ganchos.unshift((e, b) => {
    const d = b.dataset;
    if (d.ctRota) return ir(d.ctRota), true;
    if (atual !== 'cartoes') return false;
    if (b.closest('.ct-abas')) return false; /* as abas da tela são do mecanismo de abas do clone */
    if (b.closest('tr[data-ct-carta]')) return true; /* a linha da tabela já tratou */
    if (d.ctDica) return toast(d.ctDica, 5200), true;
    if (d.ctIrAba) return ctIrAba(+d.ctIrAba), true;
    if (d.ctEstudar) return ctEstudar({ baralho: d.ctEstudar }), true;
    if (d.ctVer === 'suspensas') return Object.assign(CT.f, { estado: 'suspensa', baralho: '', idioma: '', etiqueta: '', busca: '', abertos: true }), ctIrAba(2), true;
    if (d.ctVer) return fxVerPalavras(d.ctVer), true;
    if (d.ctBaralho) {
      CT.baralho = d.ctBaralho;
      $$('.ct-linha-b[data-ct-baralho]', tela).forEach((x) => x.setAttribute('aria-pressed', x.dataset.ctBaralho === CT.baralho));
      const det = $('.ct-bar-det', tela);
      det.innerHTML = ctDetalheDoBaralho(ctBaralho(CT.baralho));
      if (celular()) return ctFolhaDoBaralho(d.ctBaralho), true;
      if (polido() && !reduz()) {
        anima(det, [{ opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 460 });
        $$('.q-bib-fatos > div, .q-bib-acoes > *, .ct-cobertura', det).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 60 + i * 45 }));
      }
      return true;
    }
    if (d.ctFiltro) {
      const f = CT.f;
      f[d.ctFiltro] = d.ctFiltro === 'estado' && b.closest('.qv-filtros') && f.estado === d.v ? 'todos' : !['estado', 'ordem'].includes(d.ctFiltro) && f[d.ctFiltro] === d.v ? '' : d.v;
      if (d.ctFiltro === 'estado' && !b.closest('.qv-filtros') && !$('.qv-filtros', tela)) {
        $$('.ct-estados .q-aba', tela).forEach((x) => x.setAttribute('aria-checked', x === b));
        porPilula($('.ct-estados', tela));
        return ctRepintarTabela(), true;
      }
      return ctRepintar('#ct-tabela tbody tr'), true;
    }
    if (d.ctMassa) return ctEmMassa(d.ctMassa), true;
    if (b.closest('[data-ct-escolha]')) return abaLocal(b), $$('.q-aba', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', x === b)), true;
    switch (d.ct) {
      case 'estudar':
        return fsEstudar(d.n ? +d.n : 0), true;
      case 'outro-jeito': {
        if (d.origem === 'baralho') {
          const x = ctBaralho(d.id);
          return ctOutroJeito({ origem: 'baralho', rotulo: x.nome, n: x.total, baralho: x.id }), true;
        }
        const n = ctHojeN();
        const feito = CT.hoje === 'feito';
        return ctOutroJeito({ origem: 'hoje', rotulo: feito ? 'As palavras que você estudou hoje' : 'As palavras de hoje', n: feito ? 26 : n[0] + n[1] + Math.min(n[2], CT.hoje === 'pilha' ? CT.tetoDaPilha : n[2]) }), true;
      }
      case 'menu':
        return ctAbrirMenu(b), true;
      case 'trazer-e-levar':
        return ctAbrirTrazerELevar(b), true;
      case 'ajustes':
        return ctAbrirAjustes(b), true;
      case 'voltar-da-memoria':
        return ctIrAba(CT.voltaDaMemoria || 0), true;
      case 'resto':
        return ctAbrirResto(b), true;
      case 'add':
        return ctAbrirAdicionar(b), true;
      case 'limpar-busca-baralho':
        return (CT.buscaBar = ''), ctRepintar(), true;
      case 'importar-anki':
        return ctAbrirAnki(1, b), true;
      case 'trilha':
        return toast('No app, a Trilha ativa as 20 primeiras palavras do A1 e vira um baralho aqui.'), true;
      case 'virar-jogo':
        return ir('jogo'), toast('No app, a Memória abre com as 26 palavras de hoje.'), true;
      case 'mais-novas':
        return ctEstudar({ ids: ['restore', 'desarrollar', 'shelf', 'roadmap', 'onboarding'], rotulo: 'Mais 5 novas' }), true;
      case 'livre':
        return ctEstudar({ baralho: 'tudo', n: 10, livre: true }), true;
      case 'menu-do-baralho':
        return ctAbrirMenuDoBaralho(d.id, b), true;
      case 'faltam':
        return ctAbrirFaltam(d.id, b), true;
      case 'abrir-sessao':
        return ctAbrirSessao(d.id), true;
      case 'opcoes-do-baralho':
        return ctAbrirOpcoesDoBaralho(d.id, b), true;
      case 'exportar':
        return ctAbrirExportar(b, { de: ctBaralho(d.id).nome }), true;
      case 'selecionar':
        CT.f.sel = !CT.f.sel;
        CT.f.marcados.clear();
        CT.desfazer = null;
        return ctRepintar(), true;
      case 'marcar-todas':
        return ctMarcar('*'), true;
      case 'desfazer-massa':
        return ctDesfazerMassa(), true;
      case 'fechar-desfazer':
        return (CT.desfazer = null), b.closest('.ct-faixa-desfazer')?.remove(), true;
      case 'filtros':
        return (CT.f.abertos = !CT.f.abertos), ctRepintar('.qv-filtros'), true;
      case 'limpar-filtros':
        return Object.assign(CT.f, { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '', ordem: 'vence' }), ctRepintar('#ct-tabela tbody tr'), true;
      case 'mais-linhas':
        return toast('No app, a lista traz mais 200 de cada vez, direto do servidor.'), true;
      case 'nao-clonado':
        return toast(`${txt(b)}: não clonado neste protótipo.`), true;
    }
    return !!b.closest('.ct');
  });
  /* No celular o detalhe do baralho sobe como folha (o painel ao lado não cabe). O toque fecha a folha
     e é repassado ao mesmo botão do painel, que é quem sabe o que fazer. */
  function ctFolhaDoBaralho(id) {
    const d = folhaDeBaixo(`<div class="ct-bar-det ct-na-folha">${ctDetalheDoBaralho(ctBaralho(id))}</div>`, 'ct-folha-baralho');
    /* o foco vai para a folha, não para o "…" (que é o primeiro botão) */
    d.setAttribute('tabindex', '-1');
    d.focus({ preventScroll: true });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      fecharFolhaDeBaixo();
      setTimeout(() => $(`.ct-bar-det:not(.ct-na-folha) [data-ct="${b.dataset.ct || 'x'}"], .ct-bar-det:not(.ct-na-folha) [data-ct-estudar="${b.dataset.ctEstudar || 'x'}"], .ct-bar-det:not(.ct-na-folha) [data-ct-ver="${b.dataset.ctVer || 'x'}"]`, tela)?.click(), 60);
    });
  }
