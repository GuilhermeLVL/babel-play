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
    hand: svg('<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  });

  /* ---- Estado da tela ------------------------------------------------------------ */
  const CT_NOMES = { cartoes: 'Cartões', memoria: 'Memória', estudar: 'Estudar' };
  const CT_HOJES = ['normal', 'vazio', 'primeiro', 'feito', 'pilha'];
  const CT = {
    nav: ['atual', 'a', 'b', 'c'].includes(QS.get('nav')) ? QS.get('nav') : 'a',
    nome: CT_NOMES[QS.get('nome')] ? QS.get('nome') : 'cartoes',
    hoje: CT_HOJES.includes(QS.get('hoje')) ? QS.get('hoje') : 'normal',
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
      ? `<span class="ct-tres" aria-label="${n[0]} novas, ${n[1]} aprendendo, ${n[2]} a revisar">${[['nv', 'novas'], ['ap', 'aprendendo'], ['rv', 'a revisar']].map(([k, r], i) => `<b class="${k} ${n[i] ? '' : 'zero'}">${num(n[i])}${comRotulo ? `<small>${r}</small>` : ''}</b>`).join('')}</span>`
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
    if (aoClicar)
      d.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) aoClicar(b, d, e);
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
  function ctCab() {
    const vazio = CT.hoje === 'vazio';
    const sobre = vazio ? 'Sua memória · nenhum cartão ainda' : CT.hoje === 'primeiro' ? 'Sua memória · 34 cartões · 1 idioma' : `${num(CT_FASES.total)} cartões · 2 idiomas · meta de retenção ${CT_AJ.retencao}%`;
    return `<header class="q-cab"><div><p class="q-sobre">${sobre}</p><h1>${ctNome()}</h1></div>
      ${vazio || CT.hoje === 'primeiro' ? '' : `<button type="button" class="q-chip" data-ct="idioma" title="Estudar um idioma por vez">${ica('languages')} ${{ tudo: 'Todos os idiomas', en: 'Inglês', es: 'Espanhol' }[CT.idioma]}</button>`}
      <button type="button" class="q-ctl" data-ct="add">${ica('plus')} Palavra</button>
      <button type="button" class="q-ctl" data-ct="ajustes">${ica('settings-2')} Ajustes</button></header>`;
  }
  function ctAbas(i) {
    const icones = ['calendar-check', 'layers', 'book-open', 'arrow-left-right', 'brain'];
    const ns = [null, CT.hoje === 'vazio' ? 0 : CT.hoje === 'primeiro' ? 2 : 13, CT.hoje === 'vazio' ? 0 : CT.hoje === 'primeiro' ? 34 : CT_FASES.total, null, null];
    return `<div class="q-abas ct-abas" role="tablist" aria-label="Seções de ${ctNome()}">${icones.map((ico, k) => aba(`${ica(ico)}${ctNomeDaAba(k)}${ns[k] != null ? `<span class="n">${num(ns[k])}</span>` : ''}`, k === i, `data-ct-aba="${k}"`)).join('')}</div>`;
  }

  /* ---- Hoje ----------------------------------------------------------------------- */
  const ctHojeN = () => ctN(ctBaralho(CT.idioma));
  function ctSemana(feitoHoje) {
    /* dom 4 a sáb 10 de outubro: terça sem estudo, coberta por um congelamento. */
    const dias = [['dom', 'fora'], ['seg', 'feito'], ['ter', 'gelo'], ['qua', 'feito'], ['qui', 'feito'], ['sex', 'feito'], ['sáb', feitoHoje ? 'feito' : 'hoje']];
    return `<ol class="ct-semana" aria-label="Os últimos sete dias">${dias
      .map(([d, e]) => `<li class="${e}" title="${{ fora: 'Sem estudo', feito: 'Estudou', gelo: 'Sem estudo: um congelamento cobriu o dia', hoje: 'Hoje, ainda por estudar' }[e]}"><i>${e === 'feito' ? ica('check') : e === 'gelo' ? ica('snowflake') : ''}</i><small>${d}</small></li>`)
      .join('')}</ol>`;
  }
  function ctTresCartoes(feitoHoje) {
    const dias = feitoHoje ? 5 : 4;
    return `<div class="q-grade g3 ct-tres-cartoes">
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
  function ctPrevisao7(valores = CT_PREV7, titulo = 'Os próximos dias', sub = 'Quantos cartões voltam em cada dia; a barra destacada é amanhã. Dia sem estudo não vira dívida: o teto segura.') {
    const maior = Math.max(...valores);
    return `<section class="q-cartao ct-prev7" data-ct-alvo="previsao">${ctCabecaDoCartao(titulo, sub, `<button type="button" class="q-ctl" data-ct-ir-aba="4">${ica('calendar-days')} Ver 30 dias</button>`)}
      <div class="qv-barras" role="img" aria-label="Previsão: ${valores.map((v, i) => `${CT_DIAS7[i]} ${v}`).join(', ')}">${valores
        .map((v, i) => `<div class="qv-col"><b>${v}</b><span class="qv-barra ${i === 0 ? 'hoje' : ''}" style="height:${Math.max(4, Math.round((v / maior) * 120))}px"></span><small>${CT_DIAS7[i]}</small></div>`)
        .join('')}</div></section>`;
  }
  const ctDaLegenda = () =>
    `<section class="q-secao" data-ct-alvo="da-legenda"><header><div><h2>Nasceu da legenda</h2><p>O que você tocou nas últimas sessões já é cartão, com a frase e a fala de quem disse.</p></div></header>
      <div class="q-lista">${['s-reuniao', 's-podcast']
        .map((id) => {
          const b = ctBaralho(id);
          return `<button type="button" class="q-linha ct-linha-b" data-ct-estudar="${id}"><span class="q-ic">${ica(b.i)}</span><span><b>${esc(b.nome)}</b><small>${b.total} palavras viraram cartões · ${b.sub.split(' · ')[0]}</small></span>${ctTres(ctN(b))}<span class="q-fim">Estudar ${ica('chevron-right')}</span></button>`;
        })
        .join('')}</div></section>`;
  function ctHoje() {
    const n = ctHojeN();
    const total = n[0] + n[1] + n[2];
    const quem = CT.idioma === 'tudo' ? '' : ` de ${ctBaralho(CT.idioma).nome.toLowerCase()}`;
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio ct-vazio"><span class="q-ic">${ica('brain')}</span><h2>Seus cartões aparecem aqui</h2>
          <p>Cada palavra que você guarda vira um cartão, e o app traz de volta na hora em que você estaria esquecendo. Há três jeitos de começar:</p></div>
        <div class="q-grade g3 ct-tres-caminhos">
          <button type="button" class="q-tile pri" data-ct-rota="capturar"><span class="q-ic">${ica('mic')}</span><b>Capturar uma sessão</b><span class="q-d">Toque numa palavra da legenda e ela vira cartão, com a frase e a fala de quem disse.</span></button>
          <button type="button" class="q-tile" data-ct="importar-anki"><span class="q-ic">${ica('upload')}</span><b>Trazer um baralho do Anki</b><span class="q-d">Arquivo .apkg. Antes de trazer, a tela diz o que vem e o que não vem.</span></button>
          <button type="button" class="q-tile" data-ct="trilha"><span class="q-ic">${ica('graduation-cap')}</span><b>Começar pela Trilha</b><span class="q-d">704 palavras do A1 em ordem de uso. Você ativa aos poucos.</span></button>
        </div>
        <div class="q-aviso"><span class="qv-aviso-texto">${ica('lightbulb')}<span>Também dá para colar uma lista de palavras ou adicionar uma de cada vez.</span></span><button type="button" class="q-ctl" data-ct-ir-aba="3">${ica('arrow-left-right')} Trazer e levar</button></div>`;
    if (CT.hoje === 'primeiro')
      return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">34</span>
          <div><h2>Suas 34 palavras das sessões já são cartões</h2><p>Comece por 10. Leva uns 3 minutos e não precisa acertar tudo.</p></div>
          <button type="button" class="q-ctl pri" data-ct="estudar" data-n="10">${ica('target')} Começar por 10</button></div>
        <section class="q-cartao">${ctCabecaDoCartao('Como funciona', 'Três passos, e o app cuida da agenda.')}
          <ol class="q-passos"><li><span>1</span>Você vê a palavra na frase de onde ela veio e tenta lembrar o que quer dizer.</li>
          <li><span>2</span>Mostra a resposta e diz como foi: lembrei ou esqueci.</li>
          <li><span>3</span>A palavra volta quando estiver quase saindo da memória: amanhã, em quatro dias, em duas semanas.</li></ol></section>
        <div class="q-grade g3 ct-tres-caminhos">
          <button type="button" class="q-tile" data-ct-rota="capturar"><span class="q-ic">${ica('mic')}</span><b>Capturar outra sessão</b><span class="q-d">Mais palavras, com a frase e a fala de quem disse.</span></button>
          <button type="button" class="q-tile" data-ct="importar-anki"><span class="q-ic">${ica('upload')}</span><b>Trazer um baralho do Anki</b><span class="q-d">Arquivo .apkg, com o relatório do que vem.</span></button>
          <button type="button" class="q-tile" data-ct="trilha"><span class="q-ic">${ica('graduation-cap')}</span><b>Ativar a Trilha</b><span class="q-d">704 palavras do A1 em ordem de uso.</span></button>
        </div>`;
    if (CT.hoje === 'feito')
      return `<div class="q-cartao fundo qr-fecho ct-feito" data-ct-alvo="hoje"><span class="q-ic">${ica('party-popper')}</span>
          <div><h2>Tudo em dia</h2><p>Você estudou 26 cartões em 6 minutos. A próxima abre amanhã com 8.</p></div></div>
        <div class="q-acoes ct-depois-do-dia">
          <button type="button" class="q-ctl pri" data-ct="virar-jogo">${ica('gamepad-2')} Jogar com as mesmas</button>
          <button type="button" class="q-ctl" data-ct="mais-novas">${ica('plus')} Mais 5 novas</button>
          <button type="button" class="q-ctl" data-ct="livre" title="Fora da agenda: não muda quando as palavras voltam">${ica('shuffle')} Estudo livre</button>
        </div>
        ${ctTresCartoes(true)}${ctPrevisao7()}`;
    if (CT.hoje === 'pilha') {
      const resto = n[2] - CT.tetoDaPilha;
      const op = {
        teto: ['gauge', `Só o teto de ${CT.tetoDaPilha} por dia`, `Estuda ${CT.tetoDaPilha} hoje e o resto espera. Zera em uns 8 dias.`, [40, 40, 40, 40, 40, 40, 40]],
        espalhar: ['calendar-days', 'Espalhar pelos próximos 7 dias', `Os ${resto} que sobram entram aos poucos: uns 29 a mais por dia.`, [37, 43, 50, 38, 46, 41, 55]],
        adiar: ['moon', 'Adiar as que aguentam esperar', 'As 120 com mais folga voltam em até 10 dias. As frágeis ficam para agora.', [40, 30, 34, 28, 31, 29, 36]],
        semnovas: ['pause', 'Sem novas até zerar', 'Nenhuma palavra nova entra enquanto houver atraso.', [40, 40, 40, 40, 40, 40, 33]],
      };
      return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">${num(n[2])}</span>
          <div><h2>Você tem ${num(n[2])} esperando. Vamos de ${CT.tetoDaPilha} hoje?</h2><p>${ctMin(CT.tetoDaPilha)}, começando pelas que você tem mais chance de lembrar. O resto espera sem pressa.</p></div>
          <button type="button" class="q-ctl pri" data-ct="estudar" data-n="${CT.tetoDaPilha}">${ica('target')} Estudar ${CT.tetoDaPilha} agora</button></div>
        <section class="q-secao ct-pilha"><header><div><h2>E o resto?</h2><p>Escolha uma saída. Dá para mudar amanhã.</p></div>
            <div class="ct-teto-da-pilha"><span class="q-rotulo">Teto de hoje</span>${ctPasso('tetoDaPilha', 'Teto de hoje', CT.tetoDaPilha)}</div></header>
          <div class="q-grade g4" role="radiogroup" aria-label="O que fazer com o resto">${Object.entries(op)
            .map(([k, [i, t, d]]) => `<button type="button" class="q-tile" role="radio" aria-checked="${CT.pilha === k}" data-ct-pilha="${k}"><span class="q-ic">${ica(i)}</span><b>${t}</b><span class="q-d">${d}</span></button>`)
            .join('')}</div></section>
        ${ctPrevisao7(op[CT.pilha][3], 'Como fica a semana', `Com “${op[CT.pilha][1].toLowerCase()}”. A barra destacada é amanhã; nenhum dia passa do que você escolheu.`)}
        ${ctTresCartoes(false)}`;
    }
    return `<div class="q-cartao qv-convite ct-hoje" data-ct-alvo="hoje"><span class="qv-contagem">${total}</span>
        <div><h2>Para estudar agora${quem}</h2><p>${ctMin(total)} · começa pelas que estão para sair da memória</p>
          <p class="ct-tags-do-dia"><span class="q-tag ct-rv">${n[2]} a rever</span><span class="q-tag ct-ap">${n[1]} aprendendo</span><span class="q-tag ct-nv">${n[0]} novas</span></p></div>
        <button type="button" class="q-ctl pri" data-ct="estudar">${ica('target')} Estudar agora</button></div>
      <div class="q-acoes ct-recortes" role="group" aria-label="Outros jeitos de estudar hoje">
        <button type="button" class="q-chip" data-ct="estudar" data-n="10">${ica('timer')} Só 10 agora · uns 2 min</button>
        <button type="button" class="q-chip" data-ct-estudar="dificeis">${ica('triangle-alert')} Só as difíceis · 2</button>
        <button type="button" class="q-chip" data-ct-ir-aba="1">${ica('layers')} Escolher um baralho</button>
      </div>
      ${ctTresCartoes(false)}${ctPrevisao7()}${ctDaLegenda()}`;
  }

  /* ---- Baralhos ------------------------------------------------------------------- */
  function ctLinhaDoBaralho(b) {
    return `<button type="button" class="q-linha ct-linha-b" data-ct-baralho="${b.id}" aria-pressed="${CT.baralho === b.id}"><span class="q-ic">${ica(b.i)}</span><span><b>${esc(b.nome)}</b><small>${b.g === 'tudo' || b.g === 'idioma' || b.g === 'cuidar' ? `${num(b.total)} cartões · ${b.sub}` : b.sub.replace(/^(\S+ de [\d.]+ \S+ ativadas)/, '$1')}</small></span>${ctTres(ctN(b))}</button>`;
  }
  function ctDetalheDoBaralho(b) {
    const n = ctN(b);
    const soma = n ? n[0] + n[1] + n[2] : 0;
    const anki = b.g === 'anki';
    const fatos = [['Cartões', b.de ? `${num(b.total)} de ${num(b.de)}` : num(b.total)], ['A revisar', n ? num(n[2]) : '—'], ['Aprendendo', n ? n[1] : '—'], ['Novas hoje', n ? n[0] : '—'], ['Retenção', b.ret ? b.ret + '%' : '—'], ['Próxima', b.prox]];
    return `<div class="q-bib-topo"><span class="q-ic">${ica(b.i)}</span><div>
        <p class="q-bib-tags"><span class="q-tag">${b.tipo}</span>${b.lang ? `<span class="q-tag off">${b.lang === 'en' ? 'Inglês' : 'Espanhol'}</span>` : ''}${b.id === 'dificeis' ? '<span class="q-tag off">sanguessugas</span>' : ''}</p>
        <h2>${esc(b.nome)}</h2></div></div>
      <dl class="q-bib-fatos">${fatos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="q-bib-acoes" role="toolbar" aria-label="O que fazer com este baralho">
        ${b.id === 'suspensas' ? `<button type="button" class="q-ctl pri" data-ct-ver="${b.id}">${ica('book-open')} Ver as ${b.total} suspensas</button>` : `<button type="button" class="q-ctl pri" data-ct-estudar="${b.id}" ${soma ? '' : 'disabled'}>${ica('target')} ${soma ? `Revisar este · ${num(Math.min(soma, CT.hoje === 'pilha' ? CT.tetoDaPilha : soma))}` : 'Nada vence aqui hoje'}</button>`}
        <div class="q-acoes"><button type="button" class="q-ctl" data-ct="jogar-com" data-id="${b.id}">${ica('gamepad-2')} Jogar com este</button><button type="button" class="q-ctl" data-ct-ver="${b.id}">${ica('book-open')} Ver cartões</button></div>
        <div class="q-acoes q-bib-cuidar">${b.de ? `<button type="button" class="q-ctl" data-ct="ativar-mais" data-id="${b.id}">${ica('plus')} Ativar mais 20</button>` : ''}${b.g === 'sessao' ? `<button type="button" class="q-ctl" data-ct="abrir-sessao" data-id="${b.id}">${ica('external-link')} Abrir a sessão</button>` : ''}<button type="button" class="q-ctl" data-ct="opcoes-do-baralho" data-id="${b.id}">${ica('sliders-horizontal')} Gerenciar</button><button type="button" class="q-ctl" data-ct="exportar" data-id="${b.id}">${ica('download')} Exportar</button></div>
        ${anki ? `<div class="q-acoes q-bib-cuidar"><button type="button" class="q-ctl" data-ct="nao-clonado">Mapear campos</button><button type="button" class="q-ctl" data-ct="nao-clonado">Desativar</button><button type="button" class="q-ctl perigo" data-ct="nao-clonado">Apagar baralho</button></div>` : ''}
      </div>`;
  }
  function ctBaralhos() {
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio"><span class="q-ic">${ica('layers')}</span><h2>Os baralhos se montam sozinhos</h2><p>Um por idioma, um por sessão gravada, a Trilha e cada baralho que você trouxer do Anki. Você não precisa criar nem arrumar nada.</p>
        <button type="button" class="q-ctl pri" data-ct-ir-aba="0">${ica('calendar-check')} Ver como começar</button></div>`;
    const grupo = (g, h, p, extra = '') => {
      const l = CT_BARALHOS.filter((b) => b.g === g && (CT.hoje !== 'primeiro' || ['s-reuniao'].includes(b.id)));
      return l.length ? `<section class="q-secao ct-grupo"><header><div><h3>${h}</h3>${p ? `<p>${p}</p>` : ''}</div>${extra}</header><div class="q-lista">${l.map(ctLinhaDoBaralho).join('')}</div></section>` : '';
    };
    const b = ctBaralho(CT.baralho);
    const sess = CT_BARALHOS.filter((x) => x.g === 'sessao').reduce((s, x) => ctN(x).map((v, i) => v + s[i]), [0, 0, 0]);
    return `<div class="q-acoes ct-legenda"><span class="q-rotulo">Em cada linha</span><span class="q-tag ct-nv">novas</span><span class="q-tag ct-ap">aprendendo</span><span class="q-tag ct-rv">a revisar</span><span class="q-espaco"></span>
        <button type="button" class="q-chip" data-ct="importar-anki">${ica('upload')} Trazer do Anki</button></div>
      <div class="ct-bar-corpo"><div class="ct-bar-col">
        <div class="q-lista">${ctLinhaDoBaralho(CT.hoje === 'primeiro' ? { ...ctBaralho('tudo'), total: 34, n: [10, 0, 0], pilha: 0 } : ctBaralho('tudo'))}</div>
        ${CT.hoje === 'primeiro' ? '' : grupo('idioma', 'Por idioma', '')}
        ${grupo('sessao', 'Das minhas sessões', 'Cada gravação vira um baralho, com a frase e a fala de cada palavra.', CT.hoje === 'primeiro' ? '' : `<span class="q-chip ct-chip-tres">${ctTres(sess)}</span>`)}
        ${CT.hoje === 'primeiro' ? '' : grupo('trilha', 'Trilha', '') + grupo('anki', 'Do Anki', 'Trazidos de arquivos .apkg. A agenda recomeça aqui.')}
        <button type="button" class="q-linha q-bib-nova ct-novo-baralho" data-ct="importar-anki"><span class="q-bib-nova-dentro"><span class="q-ic">${ica('upload')}</span><span><b>Trazer outro baralho</b><small>Arquivo .apkg do Anki, uma lista colada ou um CSV.</small></span></span></button>
        ${CT.hoje === 'primeiro' ? '' : grupo('cuidar', 'Para cuidar', 'O app separa sozinho o que está travando a sua revisão.')}
      </div>
      <section class="q-cartao q-bib-det ct-bar-det" aria-label="Baralho selecionado" data-ct-alvo="baralho">${ctDetalheDoBaralho(b)}</section></div>`;
  }

  /* ---- Palavras: o navegador de cartões ------------------------------------------- */
  const CT_ESTADOS_F = [['todos', 'Todos', () => CT_FASES.total], ['hoje', 'Vencem hoje', () => 18], ['nova', 'Novas', () => CT_FASES.novas], ['aprendendo', 'Aprendendo', () => CT_FASES.aprendendo], ['revisao', 'Em revisão', () => CT_FASES.jovens + CT_FASES.maduras], ['dificeis', 'Difíceis', () => CT_FASES.dificeis], ['suspensa', 'Suspensas', () => CT_FASES.suspensas], ['bandeira', 'Com bandeira', () => CT_CARTOES.filter((c) => c.band).length]];
  const CT_ETIQUETAS = ['trabalho', 'difícil', 'phrasal-verbs', 'anki', 'frecuentes'];
  function ctFiltradas() {
    const f = CT.f;
    const q = f.busca.trim().toLowerCase();
    const l = CT_CARTOES.filter(
      (c) =>
        (f.estado === 'todos' || (f.estado === 'hoje' ? c.hoje && c.est === 'revisao' : f.estado === 'dificeis' ? ctDificil(c) : f.estado === 'bandeira' ? c.band : c.est === f.estado)) &&
        (!f.baralho || ctNoBaralho(c, f.baralho)) &&
        (!f.idioma || c.lang === f.idioma) &&
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
  function ctTotalDoFiltro(l) {
    const f = CT.f;
    if (f.busca.trim() || f.etiqueta || (f.baralho && f.estado !== 'todos') || (f.idioma && f.estado !== 'todos')) return l.length;
    if (f.baralho) return ctBaralho(f.baralho).total;
    if (f.idioma) return ctBaralho(f.idioma).total;
    return CT_ESTADOS_F.find((e) => e[0] === f.estado)[2]();
  }
  function ctTabela() {
    const f = CT.f;
    const l = ctFiltradas();
    const total = ctTotalDoFiltro(l);
    if (!l.length)
      return `<div class="q-vazio"><span class="q-ic">${ica('search')}</span><h3>Nada com esses filtros</h3><p>Tire um filtro de estado, baralho ou etiqueta, ou apague a busca.</p><button type="button" class="q-ctl pri" data-ct="limpar-filtros">${ica('x')} Limpar filtros</button></div>`;
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
    return `${num(ctTotalDoFiltro(l))} de ${num(CT_FASES.total)} no caderno`;
  };
  function ctFaixaDaSelecao() {
    const n = CT.f.marcados.size;
    return CT.f.sel
      ? `<div class="q-faixa q-no-pe ct-faixa-sel" role="toolbar" aria-label="Ações para as selecionadas"><span class="q-tempo"><b>${n}</b>&nbsp;${n === 1 ? 'selecionada' : 'selecionadas'}</span>
          <button type="button" class="q-ctl" data-ct-massa="suspender" ${n ? '' : 'disabled'}>${ica('pause')} Suspender</button>
          <button type="button" class="q-ctl" data-ct-massa="mover" ${n ? '' : 'disabled'}>${ica('layers')} Mover para Difíceis</button>
          <button type="button" class="q-ctl" data-ct-massa="etiquetar" ${n ? '' : 'disabled'}>${ica('tag')} Etiquetar</button>
          <button type="button" class="q-ctl ct-so-pc" data-ct-massa="exportar" ${n ? '' : 'disabled'}>${ica('download')} Exportar</button>
          <span class="q-espaco"></span><button type="button" class="q-ctl" data-ct="selecionar">${ica('x')} Cancelar</button></div>`
      : '';
  }
  function ctFiltros() {
    const f = CT.f;
    const grupo = (rot, chave, itens) => `<div class="qv-grupo" role="group" aria-label="${rot}"><span class="q-rotulo">${rot}</span>${itens.map(([v, r, q]) => `<button type="button" class="q-aba" aria-pressed="${f[chave] === v}" data-ct-filtro="${chave}" data-v="${v}">${r}${q != null ? `<span class="n">${num(q)}</span>` : ''}</button>`).join('')}</div>`;
    const ligados = ['baralho', 'idioma', 'etiqueta'].filter((k) => f[k]).length;
    return `<div class="q-cartao qv-filtros" id="ct-filtros">
      ${grupo('Idioma', 'idioma', [['en', 'Inglês', 318], ['es', 'Espanhol', 104]])}
      ${grupo('Sessão', 'baralho', CT_BARALHOS.filter((b) => b.g === 'sessao').map((b) => [b.id, CT_SESSOES[b.id][0], b.total]))}
      ${grupo('Baralho', 'baralho', [['trilha', 'Trilha · A1', 60], ['a-pv', 'Anki · Phrasal Verbs', 120], ['a-es', 'Anki · 1000 palabras', 80]])}
      ${grupo('Etiqueta', 'etiqueta', CT_ETIQUETAS.map((t) => [t, '#' + t, null]))}
      ${ligados ? `<div class="q-acoes"><button type="button" class="q-ctl" data-ct="limpar-filtros">${ica('x')} Limpar</button></div>` : ''}</div>`;
  }
  function ctPalavras() {
    const f = CT.f;
    if (CT.hoje === 'vazio')
      return `<div class="q-vazio"><span class="q-ic">${ica('book-open')}</span><h2>Seu caderno está vazio</h2><p>Capture uma sessão ou toque numa palavra durante a leitura para começar.</p><button type="button" class="q-ctl pri" data-ct-rota="capturar">${ica('mic')} Capturar uma sessão</button></div>`;
    const ligados = ['baralho', 'idioma', 'etiqueta'].filter((k) => f[k]).length;
    const ordens = [['vence', 'Volta primeiro'], ['recentes', 'Mais recentes'], ['az', 'A–Z'], ['erros', 'Mais erradas']];
    return `<div class="q-grade g4" data-testid="fases-do-baralho">${[['Guardadas', CT_FASES.total, ''], ['Novas', CT_FASES.novas, 'acento'], ['Aprendendo', CT_FASES.aprendendo, 'aviso'], ['Em revisão', CT_FASES.jovens + CT_FASES.maduras, 'bom']].map(([r, v, t]) => `<div class="q-num"><span class="q-rotulo">${r}</span><b class="${t}">${num(v)}</b></div>`).join('')}</div>
      <section class="q-secao qv-catalogo ct-catalogo" aria-label="Todas as palavras">
        <header><div><h2>Todas as palavras</h2><p>Busque e filtre por estado, baralho, sessão, idioma e etiqueta. Toque numa palavra para ouvir, ver de onde veio e editar.</p></div>
          <span class="q-chip qv-quantas" aria-live="polite">${ctQuantas()}</span>
          <button type="button" class="q-ctl" aria-pressed="${f.sel}" data-ct="selecionar">${ica('square-check')} Selecionar</button>
          <button type="button" class="q-ctl" aria-expanded="${f.abertos}" aria-controls="ct-filtros" data-ct="filtros">${ica('sliders-horizontal')} Filtros${ligados ? `<span class="q-tag">${ligados}</span>` : ''}</button></header>
        <div class="qv-busca"><label class="q-campo qv-campo-busca"><span class="sr">Buscar palavra</span>${ica('search')}<input type="search" autocomplete="off" placeholder="Buscar palavra, tradução ou frase" value="${esc(f.busca)}" data-ct-campo="busca"></label>
          <label class="q-campo qv-ordem"><span class="sr">Ordenar</span><select aria-label="Ordenar" data-ct-campo="ordem">${ordens.map(([v, r]) => `<option value="${v}" ${f.ordem === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
        <div class="q-abas ct-estados" role="group" aria-label="Estado do cartão">${CT_ESTADOS_F.map(([v, r, q]) => `<button type="button" class="q-aba" aria-checked="${f.estado === v}" data-ct-filtro="estado" data-v="${v}">${r} <span class="n">${num(q())}</span></button>`).join('')}</div>
        ${f.abertos ? ctFiltros() : ''}
        <div id="ct-tabela">${ctTabela()}</div>
        ${ctFaixaDaSelecao()}
      </section>`;
  }

  /* ---- Trazer e levar ------------------------------------------------------------- */
  const CT_CAMPOS = [['Front', 'Palavra'], ['Back', 'Tradução'], ['Example', 'Frase de exemplo'], ['Audio', 'Não trazer'], ['Notes', 'Explicação']];
  const CT_DESTINOS = ['Palavra', 'Tradução', 'Frase de exemplo', 'Explicação', 'Não trazer'];
  const ctItem = (ok, t, d) => `<li class="${ok ? 'vem' : 'nao'}">${ica(ok ? 'circle-check' : 'circle-x')}<span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span></li>`;
  function ctAnki() {
    if (CT.anki === 0)
      return `<section class="q-cartao ct-anki" data-ct-alvo="anki">${ctCabecaDoCartao('Baralho do Anki (.apkg)', 'Os três formatos do Anki, inclusive o atual. Antes de trazer, você vê o que vem e o que não vem.', '<span class="q-tag">Anki</span>')}
        <button type="button" class="ct-soltar" data-ct="anki-escolher"><span class="q-ic">${ica('upload')}</span><b>Solte o arquivo .apkg aqui</b><small>ou toque para escolher · neste protótipo, um baralho de exemplo</small></button></section>`;
    if (CT.anki === 2)
      return `<section class="q-cartao ct-anki" data-ct-alvo="anki"><div class="q-cartao fundo qr-fecho"><span class="q-ic">${ica('circle-check')}</span><div><h2>480 notas trazidas, 20 ativadas</h2><p>“Travel English: 480 frases” virou um baralho. As 20 primeiras entram como novas, no ritmo do seu teto diário.</p></div></div>
        <div class="q-acoes"><button type="button" class="q-ctl pri" data-ct-ir-aba="1">${ica('layers')} Ver nos baralhos</button><button type="button" class="q-ctl" data-ct="anki-outro">${ica('upload')} Trazer outro</button></div></section>`;
    return `<section class="q-cartao ct-anki" data-ct-alvo="anki">${ctCabecaDoCartao('Travel English: 480 frases.apkg', '2,4 MB · lido neste aparelho · nada foi gravado ainda', `<button type="button" class="q-ctl" data-ct="anki-outro">${ica('x')} Trocar arquivo</button>`)}
      <div class="q-grade g2 ct-vem-nao-vem">
        <div class="q-cartao fundo"><p class="q-rotulo">O que vem</p><ul class="ct-itens">
          ${ctItem(1, '480 notas, todos os campos', 'Guardados pelo nome que têm no Anki: Front, Back, Example, Audio, Notes.')}
          ${ctItem(1, '12 etiquetas', 'Viram etiquetas aqui: aeroporto, hotel, restaurante…')}
          ${ctItem(1, 'O tipo de nota', 'Basic (and reversed card). Reimportar atualiza as notas, sem duplicar.')}</ul></div>
        <div class="q-cartao fundo"><p class="q-rotulo">O que não vem</p><ul class="ct-itens">
          ${ctItem(0, 'Áudio e imagens (312 arquivos)', 'O cartão usa a voz do aparelho. Se a palavra aparecer numa sessão sua, ganha a fala original.')}
          ${ctItem(0, 'A agenda do Anki', 'Intervalos e histórico ficam lá. Aqui as notas entram como novas e a agenda recomeça.')}
          ${ctItem(0, 'O desenho do cartão', 'Modelos com HTML e CSS não são usados: cada nota vira palavra, tradução e frase.')}</ul></div>
      </div>
      <div class="q-secao"><header><div><h3>De qual campo vem cada coisa</h3><p>O app sugeriu pelo nome dos campos. Confira e troque o que precisar.</p></div></header>
        <div class="ct-mapear">${CT_CAMPOS.map(([c, d]) => `<label class="ct-campo-do-anki"><span class="q-tag off">${c}</span>${ica('arrow-right')}<select class="q-campo" aria-label="Destino do campo ${c}">${CT_DESTINOS.map((o) => `<option ${o === d ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('')}</div></div>
      <div class="q-secao"><header><div><h3>Como fica o primeiro cartão</h3></div></header>
        <div class="ct-previa"><div><span class="q-rotulo">Frente</span><b lang="en">boarding pass</b><small lang="en">“May I see your boarding pass, please?”</small></div><div><span class="q-rotulo">Verso</span><b>cartão de embarque</b><small>“Posso ver seu cartão de embarque, por favor?”</small></div></div></div>
      <div class="q-ajuste"><div><b>Quantas ativar agora</b><small>As outras ficam guardadas no baralho e você ativa aos poucos. Nunca entram todas de uma vez.</small></div>${ctPasso('ativar', 'Notas para ativar', 20)}</div>
      <div class="q-acoes"><button type="button" class="q-ctl pri" data-ct="anki-trazer">${ica('check')} Trazer as 480 e ativar 20</button><button type="button" class="q-ctl" data-ct="anki-outro">Cancelar</button></div></section>`;
  }
  function ctLinhasDaLista() {
    const linhas = CT.lista.split('\n').map((l) => l.trim()).filter(Boolean);
    const sem = linhas.filter((l) => !/[;\t]|\s-\s/.test(l)).length;
    return [linhas.length, sem];
  }
  function ctTrazer() {
    const [n, sem] = ctLinhasDaLista();
    const frase = 'Without the commute people gained almost an hour a day';
    const novas = { commute: 1, gained: 1, almost: 1 };
    return `<div class="q-grade g2 ct-trazer-topo ${CT.anki === 1 ? 'ct-lendo' : ''}">
        ${ctAnki()}
        <section class="q-cartao ct-lista" data-ct-alvo="lista">${ctCabecaDoCartao('Colar uma lista', 'Uma palavra por linha. Se houver tradução, separe com ponto e vírgula, tabulação ou hífen.', '<span class="q-tag">Texto ou CSV</span>')}
          <label class="q-campo"><span class="sr">Lista de palavras</span><textarea rows="6" spellcheck="false" data-ct-campo="lista">${esc(CT.lista)}</textarea></label>
          <p class="qv-nota" id="ct-lista-nota">${n} ${n === 1 ? 'linha reconhecida' : 'linhas reconhecidas'}${sem ? ` · ${sem} sem tradução: o app traduz e marca como “a conferir”` : ''}</p>
          <div class="q-acoes"><button type="button" class="q-ctl pri" data-ct="lista-criar">${ica('plus')} Criar ${n} ${n === 1 ? 'cartão' : 'cartões'}</button><button type="button" class="q-ctl" data-ct="nao-clonado">${ica('file-text')} Escolher um CSV</button></div></section>
      </div>
      <section class="q-cartao ct-legenda-demo" data-ct-alvo="legenda">${ctCabecaDoCartao('O caminho mais curto: nasceu da legenda', 'Você não monta cartão. Toque numa palavra da legenda, do intérprete ou da leitura e ela chega aqui com a frase, a sessão e a fala de quem disse.', `<span class="q-chip">${ica('audio-lines')} ${162 + CT.criadosDaLegenda.size} vieram assim</span>`)}
        <div class="ct-fala-demo"><span class="q-rotulo">${ica('book-open')} Artigo: The future of remote work · experimente</span>
          <div class="folha-palavras">${frase.split(' ').map((p) => `<button type="button" data-ct-palavra="${p.toLowerCase()}" ${CT.criadosDaLegenda.has(p.toLowerCase()) ? 'data-aprendida' : novas[p.toLowerCase()] ? 'data-nova' : ''}>${p}</button>`).join('')}</div></div>
        <div class="q-lista"><button type="button" class="q-linha" data-ct="anotacoes"><span class="q-ic">${ica('notebook-pen')}</span><span><b>Minhas anotações</b><small>3 anotações da Leitura (antes “Estudos &amp; notas”). Cada uma pode virar cartão.</small></span><span class="q-fim">${3 - CT.notasViradas.size} por virar ${ica('chevron-right')}</span></button></div></section>
      <section class="q-secao ct-levar" data-ct-alvo="levar"><header><div><h2>Levar</h2><p>Suas palavras são suas. Saem inteiras, em formato aberto, quando você quiser.</p></div>
          ${ctEscolha('levarO', 'O que levar', 'tudo', [['tudo', `Tudo · ${num(CT_FASES.total)}`], ['baralho', 'Um baralho'], ['sel', 'A seleção']])}</header>
        <div class="q-grade g4">${[
          ['wallet-cards', 'Anki (.apkg)', 'Abre no Anki de qualquer aparelho. Vai sem mídia e sem a agenda daqui.', 'anki'],
          ['table-2', 'Planilha (CSV)', 'Palavra, tradução, frase, sessão, estado e próxima revisão.', 'csv'],
          ['file-text', 'Texto para o Quizlet', 'Uma linha por palavra, pronta para colar.', 'txt'],
          ['chart-column', 'Relatório', 'O que você estudou no período, para imprimir ou mandar ao professor.', 'pdf'],
        ]
          .map(([i, t, d, k]) => `<button type="button" class="q-tile" data-ct-levar="${k}"><span class="q-ic">${ica(i)}</span><b>${t}</b><span class="q-d">${d}</span></button>`)
          .join('')}</div></section>`;
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
        <section class="q-cartao ct-mem-ret" data-ct-alvo="retencao">${ctCabecaDoCartao('Retenção real contra a meta', 'De cada 100 revisões, quantas você lembrou. “Errei” conta como esquecida; “Difícil”, “Bom” e “Fácil” contam como lembrada.')}
          <div class="qe-grafico">${ctGraficoDeRetencao()}</div>
          <p class="qv-nota">2 pontos abaixo da meta nos 30 dias, e subindo. Não precisa mexer em nada: o app já encurta os intervalos das palavras que você erra.</p>
          <button type="button" class="q-ctl" data-ct="ajustes">${ica('sliders-horizontal')} Ajustes da memória</button></section>
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
  const CT_PAINEIS = [ctHoje, ctBaralhos, ctPalavras, ctTrazer, ctMemoria];
  function ctTela(i = abaDe.cartoes || 0) {
    return `<div class="q-palco qv ct" data-testid="cartoes" data-ct-aba-atual="${i}" data-ct-hoje="${CT.hoje}">${ctPraticar('cartoes')}${ctCab()}${ctAbas(i)}<div class="qv-painel ct-painel" role="tabpanel">${CT_PAINEIS[i]()}</div></div>`;
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
    if (atual === 'cartoes' && (abaDe.cartoes || 0) === i) return o.seco ? ctRepintar() : ctRepintar('.ct-painel > *');
    mostrar('cartoes', { aba: i, origem: atual === 'cartoes' ? 'aba' : o.origem || 'clique' });
  }
  /* Movimento de entrada do que é desta tela: barras que crescem, anel que enche, números que contam. */
  function ctDepoisDePintar() {
    const anel = $('.ct-ret .px-anel', tela);
    if (anel && polido() && !reduz()) {
      const b = $('b', anel);
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
    const festa = $('.ct-feito .q-ic', tela);
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
  };

  /* ==========================================================================
     Folhas e diálogos da tela
     ========================================================================== */
  /* A palavra aberta: a mesma gaveta de GavetaDaPalavra.tsx, com o que a proposta acrescenta
     (a fala original em "Onde apareceu", todas as ocorrências, abrir na sessão, perguntar ao tutor). */
  function ctAbrirPalavra(id, o = {}) {
    const c = ctCarta(id);
    if (!c) return;
    const [rot] = CT_ESTADO[c.est];
    const editando = !!o.editar;
    const onde = c.frases
      .map(
        ([f, t, s, quem, tempo], k) => `<blockquote class="exemplo-gav" lang="${c.lang}">“${esc(f)}”
          <small class="mut">${ica(CT_SESSOES[s] ? CT_SESSOES[s][1] : s === 'trilha' ? 'graduation-cap' : 'wallet-cards')} ${esc(CT_SESSOES[s] ? ctBaralho(s).nome : ctNomeDoBaralho(s))}${tempo ? ` · ${tempo}` : ''}</small>
          <span class="ct-acoes-da-ocorrencia">${quem ? `<button type="button" class="btn btn-outline peq" data-ct-ouvir="original" data-k="${k}">${ica('audio-lines')} Fala original · ${esc(quem)}</button><button type="button" class="btn btn-outline peq" data-ct="abrir-sessao" data-id="${s}">${ica('external-link')} Abrir na sessão</button>` : `<span class="mut">${s.startsWith('a-') ? 'Veio do Anki: sem fala gravada.' : 'Sem fala gravada.'}</span>`}</span></blockquote>`,
      )
      .join('');
    const corpo = editando
      ? `<form class="cartao p5 pilha" data-ct-form><div><label class="rot" for="pw-t">Tradução</label><input class="campo" id="pw-t" value="${esc(c.t)}"></div>
          <div><label class="rot" for="pw-ex">Frase de exemplo</label><textarea class="campo" id="pw-ex" rows="2" style="padding:10px 14px">${esc(c.frases[0][0])}</textarea></div>
          <div><label class="rot" for="pw-n">Nível</label><select class="campo" id="pw-n">${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => `<option ${n === c.nv ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="linha" style="gap:8px"><button type="button" class="btn btn-solid peq" data-ct="salvar-palavra">${ica('check')} Salvar</button><button type="button" class="btn btn-outline peq" data-ct="cancelar-edicao">Cancelar</button></div></form>`
      : `<section><span class="label-mono">Tradução automática</span><p style="font-size:18px;font-weight:800;margin-top:4px">${esc(c.t)}</p>
          <span class="proveniencia">${ica('sparkles')} ${c.b.startsWith('a-') ? 'Veio do baralho do Anki' : 'Do dicionário · Wikcionário'}</span></section>
        <section><span class="label-mono">Onde apareceu · ${c.frases.length} ${c.frases.length === 1 ? 'vez' : 'vezes'}</span>${onde}</section>
        ${ctDificil(c) ? `<section class="ct-aviso-dificil"><span class="label-mono">${ica('triangle-alert')} Palavra difícil</span><p class="mut">Você errou esta ${c.lapsos} vezes. Costuma ser o cartão, não você: edite a tradução, troque a frase por outra ocorrência ou suspenda por um tempo.</p></section>` : ''}`;
    const d = ctAbrir(
      'ct:palavra',
      `<dialog class="gaveta ct-gaveta" aria-label="${esc(c.p)}"><div class="dlg-cab"><span class="q-ic" aria-hidden="true">${ica('book-open')}</span><div style="min-width:0"><span class="label-mono">Analista de vocabulário · ${c.nv} · ${c.lang === 'en' ? 'inglês' : 'espanhol'}</span><h2 style="font-size:26px" lang="${c.lang}">${esc(c.p)}</h2><p class="mut tn">${c.ipa}</p></div><button type="button" class="x" aria-label="Fechar">${ica('x')}</button></div>
        <div class="gav-corpo pilha-g"><div class="linha" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-outline peq" data-ct-ouvir="voz">${ica('volume-2')} Ouvir</button>
            <div class="seg" role="radiogroup" aria-label="Velocidade da pronúncia"><button type="button" role="radio" aria-checked="false">0,75×</button><button type="button" role="radio" aria-checked="true">1×</button></div>
            <button type="button" class="btn btn-outline peq" data-ct="pronuncia">${ica('mic')} Praticar pronúncia</button><button type="button" class="btn btn-outline peq" data-ct="tutor">${ica('message-circle')} Perguntar ao tutor</button></div>
          ${corpo}
          <section class="cartao p5 sutil pele-padrao ${c.est === 'nova' ? 'cartao-nova' : 'cartao-aprendida'}"><span class="label-mono">Na sua memória · ${rot}</span><div class="memoria-g">${[['Próxima revisão', c.vence === 'nova' ? 'ainda não vista' : c.vence], ['Estabilidade', c.estab ? String(c.estab).replace('.', ',') + ' dias' : '—'], ['Dificuldade', c.dif ? String(c.dif).replace('.', ',') + ' de 10' : '—'], ['Acertos', c.acertos || '—']].map(([k, v]) => `<div><small class="mut">${k}</small><b class="tn">${v}</b></div>`).join('')}</div>
            <p class="mut" style="font-size:12px;margin-top:8px">Calculado pelo FSRS com meta de ${CT_AJ.retencao}% de retenção.${c.tags.length ? ` Etiquetas: ${c.tags.map((t) => '#' + t).join(' ')}.` : ''}</p></section></div>
        <div class="gav-pe col-celular"><button type="button" class="btn btn-outline peq" data-ct="editar-palavra">${ica('pencil')} Editar</button><button type="button" class="btn btn-outline peq" data-ct="suspender-palavra">${ica(c.est === 'suspensa' ? 'play' : 'pause')} ${c.est === 'suspensa' ? 'Reativar' : 'Suspender'}</button><button type="button" class="btn btn-outline peq perigo" data-ct="nao-clonado">${ica('trash-2')} Excluir</button><span style="flex:1"></span>
          <button type="button" class="btn btn-outline" data-ct="exercitar">${ica('gamepad-2')} Exercitar</button><button type="button" class="btn btn-solid" data-ct="revisar-palavra">${ica('target')} Revisar</button></div></dialog>`,
      o.gatilho,
      (b, dlg) => {
        const a = b.dataset.ct;
        if (b.dataset.ctOuvir === 'voz') return void dizer(c.p, { lang: c.lang === 'es' ? 'es-ES' : 'en-US' });
        if (b.dataset.ctOuvir === 'original') return ctTocarOriginal(b, c, +b.dataset.k);
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
        if (a === 'exercitar') return fecharDialogo(dlg), ir('jogar');
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
    return `<p class="q-rotulo ct-rot-secao">Para todo mundo</p>
      ${aj(`Meta de retenção · <span data-ct-v="retencao">${a.retencao}</span>%`, `<span data-ct-v="carga">${ctTextoDaCarga(carga)}</span>`, `<span class="qr-passo"><button type="button" class="q-ctl" aria-label="Diminuir: Meta de retenção" data-ct-ret="-1">${ica('minus')}</button><input type="range" min="80" max="97" value="${a.retencao}" aria-label="Meta de retenção" data-ct-campo="retencao"><button type="button" class="q-ctl" aria-label="Aumentar: Meta de retenção" data-ct-ret="1">${ica('plus')}</button></span>`, 'data-ct-alvo="retencao-aj"')}
      ${aj('Novas por dia', `Quantas palavras nunca vistas entram por dia. Hoje: 5 de <span data-ct-v="novas">${a.novas}</span>. O contador é da conta e vale em todos os aparelhos.`, ctPasso('novas', 'Novas por dia', a.novas))}
      ${aj('Revisões por dia', 'Um teto para dias de atraso. O que passar dele fica para amanhã, sem virar dívida.', ctPasso('revisoes', 'Revisões por dia', a.revisoes))}
      ${aj('Botões da resposta', a.botoes === 2 ? 'Dois: “Esqueci” e “Lembrei”. O app cuida do resto.' : 'Quatro, como no Anki: Errei, Difícil, Bom e Fácil, cada um com o intervalo escrito.', ctEscolha('botoes', 'Botões da resposta', a.botoes, [[2, 'Dois'], [4, 'Quatro']]))}
      ${aj('Formato do cartão', { lembrar: 'Você pensa e mostra a resposta. É o que mais fixa.', escolher: 'Quatro alternativas, do mesmo idioma.', digitar: 'Você escreve a tradução.', lacuna: 'A frase com um buraco: você escreve a palavra.' }[a.formato], ctEscolha('formato', 'Formato do cartão', a.formato, [['lembrar', 'Lembrar'], ['escolher', 'Escolher'], ['digitar', 'Digitar'], ['lacuna', 'Lacuna']]))}
      ${aj('Tocar a fala original ao mostrar', 'Quando a palavra veio de uma sessão gravada. Sem gravação, toca a voz do aparelho.', int('original', 'Tocar a fala original ao mostrar'))}
      ${aj('Alternar a frase a cada revisão', 'Palavra vista em mais de uma sessão aparece cada vez numa frase diferente.', int('alternar', 'Alternar a frase a cada revisão'))}
      ${aj('Lembrar quando houver revisão', 'Um aviso por dia, só se houver cartão vencido. Hoje o lembrete é pela meta de minutos.', int('lembrete', 'Lembrar quando houver revisão'))}
      <p class="q-rotulo ct-rot-secao">Para quem vem do Anki</p>
      ${aj('Passos de aprendizagem', 'Quem erra revê a palavra na mesma sessão. Com FSRS, poucos passos e menores que um dia.', ctEscolha('passos', 'Passos de aprendizagem', a.passos, [['fim', 'No fim da fila'], ['10 min', '10 min'], ['10 min, 1 h', '10 min · 1 h']]))}
      ${aj('Ordem das revisões', '', ctEscolha('ordem', 'Ordem das revisões', a.ordem, [['vencidas', 'Vencidas primeiro'], ['faceis', 'Mais fáceis primeiro'], ['misturar', 'Misturar']]))}
      ${aj('Palavras novas', '', ctEscolha('misturaNovas', 'Palavras novas', a.misturaNovas, [['misturadas', 'Misturadas'], ['depois', 'Depois'], ['antes', 'Antes']]))}
      ${aj('Avisar de palavra difícil', 'Depois de quantos erros o app avisa e sugere o que fazer. No Anki é o limiar de sanguessuga.', ctPasso('dificil', 'Erros até o aviso', a.dificil))}
      ${aj('Dias leves', 'Nesses dias o app agenda menos revisões e empurra o que puder para os vizinhos.', `<div class="ct-dias" role="group" aria-label="Dias leves">${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<button type="button" class="q-aba" aria-pressed="${a.leves.includes(d)}" data-ct-leve="${d}">${d}</button>`).join('')}</div>`)}
      ${aj('Otimizar para a minha memória', 'Ajusta a agenda ao seu histórico (612 revisões). Roda sozinho uma vez por mês; o último foi há 12 dias.', `<button type="button" class="q-ctl" data-ct="otimizar">${ica('wand-sparkles')} Otimizar agora</button>`)}
      <div class="q-acoes ct-pe-dos-ajustes"><button type="button" class="q-ctl" data-ct="padrao">${ica('rotate-ccw')} Voltar ao padrão</button></div>`;
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
      ctDlg('sliders-horizontal', 'Ajustes da memória', 'Valem para todos os baralhos e acompanham a sua conta. A agenda é do FSRS.', ctHtmlDosAjustes(), `<button type="button" class="q-ctl pri">${ica('check')} Pronto</button>`, 'ct-ajustes'),
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
        palavras: [['wallet-cards', 'Anki (.apkg)', 'Sem mídia e sem a agenda daqui.'], ['table-2', 'Planilha (CSV)', 'Palavra, tradução, frase, estado.'], ['file-text', 'Texto para o Quizlet', 'Uma linha por palavra.']],
        relatorio: [['chart-column', 'Relatório da sessão', 'Palavras, tempo, falantes e métricas.'], ['chart-column', 'Relatório de estudo', 'O que você revisou no período.']],
      };
      return ctDlg('download', 'Exportar', esc(o.de || 'Tudo o que é seu, num lugar só'), `<div class="q-abas q-seg ct-abas-exportar" role="group" aria-label="O que exportar">${[['transcricao', 'Transcrição'], ['palavras', 'Palavras e cartões'], ['relatorio', 'Relatório']].map(([k, r]) => `<button type="button" class="q-aba" aria-pressed="${qual === k}" data-ct-exp="${k}">${r}</button>`).join('')}</div>
        <div class="q-grade g2 ct-formatos">${paineis[qual].map(([i, t, d]) => `<button type="button" class="q-tile em-linha" data-ct-formato="${esc(t)}"><span class="q-ic">${ica(i)}</span><span><b>${t}</b><small class="q-d">${d}</small></span></button>`).join('')}</div>`, `<button type="button" class="q-ctl">Fechar</button>`, 'ct-exportar');
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
     Ligações da tela
     ========================================================================== */
  function ctRepintarTabela() {
    const t = $('#ct-tabela', tela);
    if (!t) return ctRepintar();
    t.innerHTML = ctTabela();
    const q = $('.qv-quantas', tela);
    if (q) q.textContent = ctQuantas();
    const fx = $('.ct-faixa-sel', tela);
    if (fx) fx.outerHTML = ctFaixaDaSelecao();
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
  function ctEmMassa(acao) {
    const ids = [...CT.f.marcados];
    const n = ids.length;
    if (!n) return;
    if (acao === 'suspender') ids.forEach((id) => (ctCarta(id).est = 'suspensa'));
    if (acao === 'mover') ids.forEach((id) => ctCarta(id).tags.includes('difícil') || ctCarta(id).tags.push('difícil'));
    if (acao === 'etiquetar') ids.forEach((id) => ctCarta(id).tags.includes('rever') || ctCarta(id).tags.push('rever'));
    CT.f.marcados.clear();
    CT.f.sel = acao === 'exportar' ? CT.f.sel : false;
    if (acao === 'exportar') return ctAbrirExportar(null, { de: `${n} ${n === 1 ? 'palavra selecionada' : 'palavras selecionadas'}` });
    ctRepintar('#ct-tabela tbody tr');
    toast({ suspender: `${n} ${n === 1 ? 'suspensa' : 'suspensas'}: não aparecem na revisão até você reativar.`, mover: `${n} em Difíceis.`, etiquetar: `${n} com a etiqueta #rever.` }[acao]);
  }
  tela.addEventListener('click', (e) => {
    if (atual !== 'cartoes') return;
    const tr = e.target.closest('tr[data-ct-carta]');
    if (!tr) return;
    if (CT.f.sel || e.target.closest('.ct-caixa')) return ctMarcar(tr.dataset.ctCarta, tr);
    ctAbrirPalavra(tr.dataset.ctCarta, { gatilho: tr });
  });
  tela.addEventListener('input', (e) => {
    const k = e.target.dataset?.ctCampo;
    if (k === 'busca') return (CT.f.busca = e.target.value), ctRepintarTabela();
    if (k === 'lista') {
      CT.lista = e.target.value;
      const [n, sem] = ctLinhasDaLista();
      $('#ct-lista-nota', tela).textContent = `${n} ${n === 1 ? 'linha reconhecida' : 'linhas reconhecidas'}${sem ? ` · ${sem} sem tradução: o app traduz e marca como “a conferir”` : ''}`;
      const b = $('[data-ct="lista-criar"]', tela);
      b.innerHTML = `${ica('plus')} Criar ${n} ${n === 1 ? 'cartão' : 'cartões'}`;
      b.disabled = !n;
    }
  });
  tela.addEventListener('change', (e) => {
    if (e.target.dataset?.ctCampo === 'ordem') (CT.f.ordem = e.target.value), ctRepintarTabela();
  });
  ganchos.unshift((e, b) => {
    const d = b.dataset;
    if (d.ctRota) return ir(d.ctRota), true;
    if (atual !== 'cartoes') return false;
    if (b.closest('.ct-abas')) return false; /* as abas da tela são do mecanismo de abas do clone */
    if (b.closest('tr[data-ct-carta]')) return true; /* a linha da tabela já tratou */
    if (d.ctIrAba) return ctIrAba(+d.ctIrAba), true;
    if (d.ctEstudar) return ctEstudar({ baralho: d.ctEstudar }), true;
    if (d.ctVer) return Object.assign(CT.f, { estado: d.ctVer === 'dificeis' ? 'dificeis' : d.ctVer === 'suspensas' ? 'suspensa' : 'todos', baralho: ['tudo', 'dificeis', 'suspensas', 'en', 'es'].includes(d.ctVer) ? '' : d.ctVer, idioma: ['en', 'es'].includes(d.ctVer) ? d.ctVer : '', etiqueta: '', busca: '', abertos: !['tudo', 'dificeis', 'suspensas'].includes(d.ctVer) }), ctIrAba(2), true;
    if (d.ctBaralho) {
      CT.baralho = d.ctBaralho;
      $$('.ct-linha-b', tela).forEach((x) => x.setAttribute('aria-pressed', x.dataset.ctBaralho === CT.baralho));
      const det = $('.ct-bar-det', tela);
      det.innerHTML = ctDetalheDoBaralho(ctBaralho(CT.baralho));
      if (celular()) return ctFolhaDoBaralho(d.ctBaralho), true;
      if (polido() && !reduz()) {
        anima(det, [{ opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { d: 460 });
        $$('.q-bib-fatos > div, .q-bib-acoes > *', det).forEach((x, i) => anima(x, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { d: 420, atraso: 60 + i * 45 }));
      }
      return true;
    }
    if (d.ctFiltro) {
      const f = CT.f;
      f[d.ctFiltro] = d.ctFiltro !== 'estado' && f[d.ctFiltro] === d.v ? '' : d.v;
      if (d.ctFiltro === 'estado') {
        $$('.ct-estados .q-aba', tela).forEach((x) => x.setAttribute('aria-checked', x === b));
        porPilula($('.ct-estados', tela));
        return ctRepintarTabela(), true;
      }
      return ctRepintar('#ct-tabela tbody tr'), true;
    }
    if (d.ctMassa) return ctEmMassa(d.ctMassa), true;
    if (d.ctPilha) return (CT.pilha = d.ctPilha), sentir('aba'), ctRepintar('.ct-prev7 .qv-col'), true;
    if (d.ctPalavra) {
      if (CT.criadosDaLegenda.has(d.ctPalavra)) return true;
      CT.criadosDaLegenda.add(d.ctPalavra);
      b.removeAttribute('data-nova');
      b.setAttribute('data-aprendida', '');
      sentir('sucesso');
      const chip = $('.ct-legenda-demo .q-chip', tela);
      chip.lastChild.nodeValue = ` ${162 + CT.criadosDaLegenda.size} vieram assim`;
      if (polido() && !reduz()) {
        anima(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { d: 520, e: MOLA });
        rajada(...centro(b), 12);
        anima(chip, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { d: 420 });
      }
      return toast(`“${txt(b)}” virou cartão, com esta frase e o artigo de onde veio.`), true;
    }
    if (d.ctLevar) return ctAbrirExportar(b, { aba: d.ctLevar === 'pdf' ? 'relatorio' : 'palavras', de: `${num(CT_FASES.total)} cartões` }), true;
    const p = b.closest('[data-ct-passo]');
    if (p && (d.ctMenos != null || d.ctMais != null)) {
      if (p.dataset.ctPasso === 'tetoDaPilha') {
        CT.tetoDaPilha = Math.min(100, Math.max(10, CT.tetoDaPilha + (d.ctMais != null ? 10 : -10)));
        return sentir('toque'), ctRepintar(), true;
      }
      const inp = $('input', p);
      inp.value = Math.max(5, +inp.value + (d.ctMais != null ? 5 : -5));
      const t = $('[data-ct="anki-trazer"]', tela);
      if (t) t.innerHTML = `${ica('check')} Trazer as 480 e ativar ${inp.value}`;
      return true;
    }
    if (b.closest('[data-ct-escolha]')) return abaLocal(b), $$('.q-aba', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', x === b)), true;
    switch (d.ct) {
      case 'estudar':
        return ctEstudar({ baralho: CT.idioma, n: d.n ? +d.n : 0 }), true;
      case 'idioma':
        CT.idioma = { tudo: 'en', en: 'es', es: 'tudo' }[CT.idioma];
        return ctRepintar('.ct-hoje'), toast(CT.idioma === 'tudo' ? 'Estudando todos os idiomas juntos.' : `Só ${ctBaralho(CT.idioma).nome.toLowerCase()}: a contagem de hoje e a rodada usam só este idioma.`), true;
      case 'ajustes':
        return ctAbrirAjustes(b), true;
      case 'add':
        return ctAbrirAdicionar(b), true;
      case 'importar-anki':
        return (CT.anki = CT.anki === 2 ? 0 : CT.anki), ctIrAba(3), true;
      case 'trilha':
        return toast('No app, a Trilha ativa as 20 primeiras palavras do A1 e vira um baralho aqui.'), true;
      case 'virar-jogo':
        return ir('jogo'), toast('No app, a Memória abre com as 26 palavras de hoje.'), true;
      case 'mais-novas':
        return ctEstudar({ ids: ['restore', 'desarrollar', 'shelf', 'roadmap', 'onboarding'], rotulo: 'Mais 5 novas' }), true;
      case 'livre':
        return ctEstudar({ baralho: 'tudo', n: 10, livre: true }), true;
      case 'jogar-com':
        return ir('jogar'), toast(`No app, os jogos abrem só com “${ctBaralho(d.id).nome}”.`), true;
      case 'abrir-sessao':
        return ctAbrirSessao(d.id), true;
      case 'opcoes-do-baralho':
        return ctAbrirOpcoesDoBaralho(d.id, b), true;
      case 'exportar':
        return ctAbrirExportar(b, { de: ctBaralho(d.id).nome }), true;
      case 'ativar-mais':
        return toast(`Mais 20 notas de “${ctBaralho(d.id).nome}” entram como novas, no ritmo do teto diário.`), true;
      case 'selecionar':
        CT.f.sel = !CT.f.sel;
        CT.f.marcados.clear();
        return ctRepintar(), true;
      case 'marcar-todas':
        return ctMarcar('*'), true;
      case 'filtros':
        return (CT.f.abertos = !CT.f.abertos), ctRepintar('.qv-filtros'), true;
      case 'limpar-filtros':
        return Object.assign(CT.f, { estado: 'todos', baralho: '', idioma: '', etiqueta: '', busca: '' }), ctRepintar('#ct-tabela tbody tr'), true;
      case 'mais-linhas':
        return toast('No app, a lista traz mais 200 de cada vez, direto do servidor.'), true;
      case 'anki-escolher':
        return (CT.anki = 1), sentir('chega'), ctRepintar('.ct-anki > *'), true;
      case 'anki-outro':
        return (CT.anki = 0), ctRepintar('.ct-anki > *'), true;
      case 'anki-trazer':
        CT.anki = 2;
        ctRepintar('.ct-anki > *');
        if (polido() && !reduz()) confete(60);
        return true;
      case 'lista-criar':
        return toast(`${ctLinhasDaLista()[0]} cartões criados no baralho “Inglês”. Os sem tradução ficam marcados como “a conferir”.`), true;
      case 'anotacoes':
        return ctAbrirAnotacoes(b), true;
      case 'nao-clonado':
        return toast(`${txt(b)}: não clonado neste protótipo.`), true;
    }
    return !!b.closest('.ct');
  });
  /* No celular o detalhe do baralho sobe como folha (o painel ao lado não cabe). */
  function ctFolhaDoBaralho(id) {
    const d = folhaDeBaixo(`<div class="ct-bar-det ct-na-folha">${ctDetalheDoBaralho(ctBaralho(id))}</div>`, 'ct-folha-baralho');
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      fecharFolhaDeBaixo();
      setTimeout(() => $(`.ct-bar-det:not(.ct-na-folha) [data-ct="${b.dataset.ct || 'x'}"], .ct-bar-det:not(.ct-na-folha) [data-ct-estudar="${b.dataset.ctEstudar || 'x'}"], .ct-bar-det:not(.ct-na-folha) [data-ct-ver="${b.dataset.ctVer || 'x'}"]`, tela)?.click(), 60);
    });
  }
