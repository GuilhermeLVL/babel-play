/**
 * A URL COMO ESPELHO DO ESTADO.
 *
 * O app inteiro vivia em `/`. A navegação era `useState<ViewType>` (App.tsx:44) e mais nada, e
 * a auditoria mediu o preço disso: recarregar devolvia ao Hub e perdia a sessão aberta e a aba;
 * o botão "voltar" do navegador SAÍA do app; nenhuma tela era compartilhável; e `Study` — o
 * motor de revisão espaçada, o que o produto existe para fazer — não tinha porta na navegação.
 *
 * A ABORDAGEM É ADITIVA. A máquina de estados continua sendo a implementação; a URL vira o
 * reflexo dela. Não há router, não há re-arquitetura, e desligar isto é remover duas chamadas.
 * Por isso o contrato mora aqui como funções PURAS: dá para travar o comportamento inteiro sem
 * montar o app, e a ida-e-volta (estado → URL → estado) é verificável.
 *
 * Decisões que valem registro:
 *  · `/revisar` existe para dar a `Study` a porta que ela não tinha. É a única rota que não
 *    espelha um `ViewType` — `study` é uma pseudo-view que o App remapeia para `analysis`.
 *  · a aba entra no CAMINHO, não em query. `/sessao/<id>/metricas` põe o escopo na barra de
 *    endereço, o que reforça a separação que a aba de métricas embaralhava.
 *  · caminho desconhecido cai no Hub. Uma URL digitada errado não pode produzir tela em branco.
 */

export type ViewDeRota =
  | 'hub'
  | 'capture'
  | 'play'
  | 'library'
  | 'analysis'
  | 'metrics'
  | 'settings'
  | 'profile'
  | 'sobre'
  | 'loja'
  | 'planos'
  | 'estatisticas'
  | 'ajuda'
  | 'naoencontrado';

/** As duas áreas clássicas de Personalizar (sem a flag `recompensas_v2`). */
export type AbaClassica = 'personalizar' | 'conquistas';
/** Toda aba de Personalizar que tem endereço: as clássicas e as cinco das recompensas v2. */
export type AbaDaLoja = AbaClassica | 'colecao' | 'maestria' | 'temporada' | 'loja';

export interface EstadoDeRota {
  view: ViewDeRota;
  /** Só para `analysis`: qual gravação. */
  sessionId?: string;
  /** Só para `analysis`: qual aba. */
  subTab?: 'transcript' | 'reading' | 'practice' | 'overview' | 'study';
  /**
   * Só para `loja` (Personalizar): qual das DUAS áreas. Sem ela, a tela abre na padrão.
   *
   * Eram quatro até 2026-09-12, quando Loja e Passe deixaram de ser abas e viraram seções dentro
   * de Desafios (decisão do dono). Os nomes antigos seguem resolvendo — em `APELIDO_DE_ABA` —
   * porque links gravados e o histórico do navegador não se atualizam sozinhos.
   */
  lojaTab?: AbaDaLoja;
  /**
   * Só para `play`: o filtro facetado serializado como query string (sem o `?`).
   * OPACO de propósito: quem sabe ler/escrever o formato é `lib/filtroDaPratica` — aqui a rota só
   * transporta. É a única rota com query porque o filtro é a única escolha combinatória do app;
   * tudo o mais continua no caminho (decisão do docblock acima).
   */
  jogarQuery?: string;
  /**
   * Só para `planos`: a sub-tela de pagamento (protótipo aprovado: `T.checkout`, `T.assinado`,
   * `T.cancelar` e a aba "Sua assinatura"). Não são views do App — o menu continua em Planos e
   * quem desenha é `Planos.tsx`. A sub-rota é DA TELA, como a query é da tela de Jogar: o App
   * espelhar "estou em Planos" não a apaga (ver `publicarUrl`).
   */
  planosTela?: SubTelaDePlanos;
}

export const SUBTELAS_DE_PLANOS = ['assinar', 'assinado', 'cancelar', 'assinatura'] as const;
export type SubTelaDePlanos = (typeof SUBTELAS_DE_PLANOS)[number];
const ehSubTelaDePlanos = (s: string | undefined): s is SubTelaDePlanos =>
  !!s && (SUBTELAS_DE_PLANOS as readonly string[]).includes(s);

/** View de topo → segmento. `analysis` é tratada à parte porque carrega id e aba. */
const SEGMENTO: Record<Exclude<ViewDeRota, 'analysis'>, string> = {
  hub: '',
  capture: 'capturar',
  play: 'jogar',
  library: 'biblioteca',
  metrics: 'vocabulario',
  settings: 'ajustes',
  profile: 'perfil',
  sobre: 'sobre',
  loja: 'loja',
  planos: 'plano',
  estatisticas: 'estatisticas',
  ajuda: 'ajuda',
  naoencontrado: 'nao-encontrado',
};

/**
 * ALIASES DE ENTRADA — segmentos que LEEM para uma view, sem serem o endereço canônico dela.
 *
 * `/planos` (plural) caía no Hub em silêncio, e plural é o que qualquer pessoa digita: o singular
 * é a escolha de quem escreveu o mapa, não a de quem digita a URL. `/creditos` é o endereço que
 * `ComprarCreditos` nunca teve — a tela vivia dentro de uma aba que a DESMONTA quando inativa, e
 * não havia link que levasse a ela.
 *
 * Só de leitura: `estadoParaUrl` continua publicando o canônico, senão a mesma tela teria dois
 * endereços na barra e o histórico ficaria ambíguo.
 */
const ALIAS_DE_SEGMENTO: Record<string, { view: ViewDeRota; lojaTab?: EstadoDeRota['lojaTab'] }> = {
  planos: { view: 'planos' },
  // A tela chama-se Personalizar desde o protótipo aprovado (23/09); o endereço canônico segue /loja.
  personalizar: { view: 'loja' },
  creditos: { view: 'loja', lojaTab: 'conquistas' },
};
const VIEW_DE_SEGMENTO = Object.fromEntries(
  Object.entries(SEGMENTO)
    .filter(([, seg]) => seg)
    .map(([v, seg]) => [seg, v as ViewDeRota]),
) as Record<string, ViewDeRota>;

/** Aba da sessão → segmento. `study` não entra: tem rota própria (`/revisar`). */
const ABA: Record<string, string> = {
  transcript: 'transcricao',
  reading: 'leitura',
  practice: 'jogos',
  overview: 'metricas',
};
const ABA_DE_SEGMENTO = Object.fromEntries(Object.entries(ABA).map(([k, v]) => [v, k]));

/**
 * Área de Personalizar → segmento (ux-v2 §1.6: sem isto, recarregar e deep-link caíam sempre na
 * aba padrão). O segmento fala a língua do RÓTULO ("meu-visual", "desafios"), não a do id
 * interno — a URL é interface.
 */
const ABA_DA_LOJA: Record<AbaDaLoja, string> = {
  personalizar: 'meu-visual',
  conquistas: 'desafios',
  // As abas das recompensas v2 (Task 5.4): o id já é a palavra do rótulo.
  colecao: 'colecao',
  maestria: 'maestria',
  temporada: 'temporada',
  loja: 'loja',
};
const ABA_DA_LOJA_DE_SEGMENTO = Object.fromEntries(Object.entries(ABA_DA_LOJA).map(([k, v]) => [v, k])) as Record<
  string,
  NonNullable<EstadoDeRota['lojaTab']>
>;

/**
 * NOMES ANTIGOS DE ABA, resolvidos ANTES de virar URL (auditoria de 2026-09-07, achado A16).
 *
 * A tabela vivia dentro de `Loja.tsx`, que a usava para escolher a aba a mostrar. Só que quem
 * escreve a URL é `estadoParaUrl`, aqui, e ela não conhecia os apelidos: `Play.tsx` navegava com
 * `aba: 'progressao'`, a Loja abria certo (o apelido resolve) e a barra de endereço
 * mostrava `/loja/undefined`. Recarregar aquela página caía na aba padrão.
 *
 * O apelido é do VOCABULÁRIO DE ROTAS, então mora com as rotas. `Loja.tsx` passa a perguntar aqui.
 */
const APELIDO_DE_ABA: Record<string, AbaClassica> = {
  cofre: 'personalizar',
  /* Sem a flag, as abas das recompensas v2 (um link gravado com ela ligada) abrem a área clássica
     que tem o mesmo conteúdo. */
  colecao: 'personalizar',
  maestria: 'conquistas',
  temporada: 'conquistas',
  /* As quatro portas viraram duas em 2026-09-12: Loja e Passe são seções de Desafios. Todo nome
     que apontava para uma delas cai em `conquistas`, que é onde o conteúdo está — um link antigo
     abre a página certa, e não a aba padrão. */
  loja: 'conquistas',
  itens: 'conquistas',
  passe: 'conquistas',
  progressao: 'conquistas',
  recompensas: 'conquistas',
  desafios: 'conquistas',
};

/** A aba canônica CLÁSSICA (sem a flag) para um nome qualquer. `null` = desconhecida. */
export function normalizarAbaDaLoja(bruta: string | null | undefined): AbaClassica | null {
  if (!bruta) return null;
  if (bruta === 'personalizar' || bruta === 'conquistas') return bruta;
  return APELIDO_DE_ABA[bruta] ?? null;
}

/** As cinco abas de Personalizar com as recompensas v2 (spec 10.3). */
export const ABAS_DA_LOJA_V2 = ['colecao', 'maestria', 'temporada', 'conquistas', 'loja'] as const;
export type AbaDaLojaV2 = (typeof ABAS_DA_LOJA_V2)[number];

/**
 * OS NOMES DE SEMPRE, NA TELA NOVA. Com a flag, cada nome antigo abre a aba onde aquele conteúdo
 * mora agora: o Meu visual virou Coleção, o Passe virou Temporada, "Ver progressão" (fim de
 * rodada) abre a Maestria, e a prateleira e os Créditos abrem a Loja.
 */
const APELIDO_DE_ABA_V2: Record<string, AbaDaLojaV2> = {
  personalizar: 'colecao',
  'meu-visual': 'colecao',
  cofre: 'colecao',
  passe: 'temporada',
  progressao: 'maestria',
  desafios: 'conquistas',
  recompensas: 'conquistas',
  itens: 'loja',
  creditos: 'loja',
};

/** A aba canônica das recompensas v2 para um nome qualquer. `null` = desconhecida. */
export function normalizarAbaDaLojaV2(bruta: string | null | undefined): AbaDaLojaV2 | null {
  if (!bruta) return null;
  if ((ABAS_DA_LOJA_V2 as readonly string[]).includes(bruta)) return bruta as AbaDaLojaV2;
  return APELIDO_DE_ABA_V2[bruta] ?? null;
}

export function estadoParaUrl(e: EstadoDeRota): string {
  if (e.view === 'analysis') {
    // `/revisar` primeiro: é a porta da revisão espaçada, e ela vence a aba genérica.
    if (e.subTab === 'study') return e.sessionId ? `/revisar/${e.sessionId}` : '/revisar';
    // Sem gravação escolhida a aba ainda importa: perdê-la aqui fazia `/sessao/x/metricas`
    // virar `/sessao` no primeiro render, antes de a gravação resolver.
    if (!e.sessionId) return e.subTab && ABA[e.subTab] ? `/sessao/-/${ABA[e.subTab]}` : '/sessao';
    const aba = e.subTab ? ABA[e.subTab] : '';
    return aba ? `/sessao/${e.sessionId}/${aba}` : `/sessao/${e.sessionId}`;
  }
  if (e.view === 'loja' && e.lojaTab) {
    /* Aba desconhecida vira `/loja`, e nunca `/loja/undefined`: uma URL quebrada na barra de
       endereço é pior que uma URL menos específica — ela não recarrega e não se compartilha. */
    const canonica = e.lojaTab in ABA_DA_LOJA ? e.lojaTab : normalizarAbaDaLoja(e.lojaTab);
    return canonica ? `/loja/${ABA_DA_LOJA[canonica]}` : '/loja';
  }
  if (e.view === 'play' && e.jogarQuery) return `/jogar?${e.jogarQuery}`;
  if (e.view === 'planos' && ehSubTelaDePlanos(e.planosTela)) return `/${SEGMENTO.planos}/${e.planosTela}`;
  const seg = SEGMENTO[e.view];
  return seg ? `/${seg}` : '/';
}

export function urlParaEstado(caminho: string): EstadoDeRota {
  const bruto = String(caminho || '').split('#')[0];
  // A query era DESCARTADA aqui (auditoria do seletor, defeito de persistência): um link com
  // filtro abria a tela certa e jogava o filtro fora. Ela sobrevive apenas em `/jogar` — é a
  // única rota que a publica — e sem o `.toLowerCase()` do caminho, porque ids de baralho e
  // códigos de idioma são sensíveis a caixa.
  const query = bruto.split('?')[1] ?? '';
  const partes = bruto.split('?')[0].toLowerCase().split('/').filter(Boolean);

  if (partes.length === 0) return { view: 'hub' };
  // O callback do Supabase tem dono (`lib/authCallback`) e não é rota de tela.
  if (partes[0] === 'auth') return { view: 'hub' };

  if (partes[0] === 'revisar') {
    return partes[1]
      ? { view: 'analysis', sessionId: partes[1], subTab: 'study' }
      : { view: 'analysis', subTab: 'study' };
  }

  if (partes[0] === 'sessao') {
    if (!partes[1]) return { view: 'analysis' };
    if (partes[1] === '-') {
      const abaSemId = partes[2] ? ABA_DE_SEGMENTO[partes[2]] : undefined;
      return abaSemId ? { view: 'analysis', subTab: abaSemId as EstadoDeRota['subTab'] } : { view: 'analysis' };
    }
    const aba = partes[2] ? ABA_DE_SEGMENTO[partes[2]] : undefined;
    return aba
      ? { view: 'analysis', sessionId: partes[1], subTab: aba as EstadoDeRota['subTab'] }
      : { view: 'analysis', sessionId: partes[1] };
  }

  if (partes[0] === 'loja' && partes[1]) {
    /* Segmento canônico primeiro; depois o APELIDO, que é o que salva os endereços gravados das
       abas extintas — `/loja/itens` e `/loja/passe` foram URLs de verdade até 2026-09-12, e sem
       este recuo elas caíam na aba padrão em vez da página onde o conteúdo ficou. */
    const aba = ABA_DA_LOJA_DE_SEGMENTO[partes[1]] ?? normalizarAbaDaLoja(partes[1]);
    // Sub-aba desconhecida degrada para a tela, nunca para o Hub: o usuário pediu Personalizar.
    return aba ? { view: 'loja', lojaTab: aba } : { view: 'loja' };
  }

  const alias = ALIAS_DE_SEGMENTO[partes[0]];
  // Sub-tela de Planos (singular canônico ou plural de leitura). Desconhecida degrada para Planos.
  if ((alias?.view ?? VIEW_DE_SEGMENTO[partes[0]]) === 'planos' && partes[1]) {
    return ehSubTelaDePlanos(partes[1]) ? { view: 'planos', planosTela: partes[1] } : { view: 'planos' };
  }
  if (alias) return alias.lojaTab ? { view: alias.view, lojaTab: alias.lojaTab } : { view: alias.view };

  const view = VIEW_DE_SEGMENTO[partes[0]];
  if (view === 'play' && query) return { view, jogarQuery: query };
  // Caminho desconhecido abre o 404 (protótipo aprovado, 23/09/2026): uma URL errada não vira tela
  // em branco NEM cai calada no Início — diz o que houve e oferece o caminho de volta.
  return view ? { view } : { view: 'naoencontrado' };
}

/**
 * A ROTA DA INTENÇÃO DE LOGIN como estado (funil de venda, 2026-09-29). Quem termina o login
 * navega para ela — e ela foi escrita no `localStorage`, que outra aba também escreve. Por isso
 * passa pelo MESMO parser das URLs: só vira tela o que é rota conhecida do app; o resto (o 404, o
 * próprio `/auth/callback`) cai no Início, que é para onde o login levava antes.
 */
export function estadoDaIntencao(rota: string): EstadoDeRota {
  const e = urlParaEstado(rota);
  return e.view === 'naoencontrado' ? { view: 'hub' } : e;
}

/**
 * O CHECKOUT EM ANDAMENTO: escolher o pagamento (`assinar`) e a volta dele (`assinado`). Enquanto
 * a pessoa está aqui, nada de modal por cima (a migração) nem de tela que a tire dali (a pergunta
 * da idade — o Checkout pergunta no próprio formulário). Cancelar e "Sua assinatura" não entram:
 * não há pagamento para atrapalhar.
 */
const SUBTELAS_DE_CHECKOUT: readonly SubTelaDePlanos[] = ['assinar', 'assinado'];

/** A sub-tela é de checkout? Serve também à sub-tela do boot, que ainda não voltou à barra. */
export function ehSubTelaDeCheckout(tela: SubTelaDePlanos | null | undefined): boolean {
  return !!tela && SUBTELAS_DE_CHECKOUT.includes(tela);
}

export function ehRotaDeCheckout(caminho: string): boolean {
  const e = urlParaEstado(caminho);
  return e.view === 'planos' && ehSubTelaDeCheckout(e.planosTela);
}

/* ── Ligação com o navegador ──────────────────────────────────────────────
   Isolada aqui para o resto do app não falar com `history` diretamente, e para os testes
   acima poderem exercitar o contrato sem tocar em `window`. */

/** Escreve o estado na barra de endereço. `push` quando a navegação foi uma ação do usuário. */
export function publicarUrl(e: EstadoDeRota, push = true): void {
  if (typeof window === 'undefined') return;
  const alvo = estadoParaUrl(e);
  // Alvo COM query compara com caminho+query; alvo SEM query compara só o caminho — assim uma
  // publicação de view que não conhece o filtro (App trocando de aba) não apaga a query que o
  // dono dela (Play) acabou de escrever.
  const atual = alvo.includes('?') ? window.location.pathname + window.location.search : window.location.pathname;
  if (atual === alvo) return;
  /* A sub-tela de Planos é da tela, não do App: quem espelha só "estou em Planos" (sem
     `planosTela`) não a apaga. Sem isto, recarregar `/plano/assinado` — a volta do pagamento —
     caía em `/plano` no primeiro render. */
  if (e.view === 'planos' && !e.planosTela && urlParaEstado(window.location.pathname).planosTela) return;
  // `replaceState` na restauração inicial: entrar no app não deve criar uma entrada de histórico
  // para trás que devolveria o usuário para fora.
  window.history[push ? 'pushState' : 'replaceState']({}, '', alvo);
}

/**
 * Escreve (ou limpa, com '') a query do filtro — SÓ quando a tela de jogar está na barra, e
 * sempre com `replaceState`: cada ajuste de faceta não é uma página nova, e "voltar" deve sair
 * da tela, não desfazer chips um a um. Fora de `/jogar` é não-op: o filtro não manda na rota.
 */
export function publicarQueryDoJogar(query: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== `/${SEGMENTO.play}`) return;
  const alvo = query ? `?${query}` : '';
  if (window.location.search === alvo) return;
  window.history.replaceState({}, '', window.location.pathname + alvo);
}

/**
 * NAVEGA SEM PROP DO APP — escreve o endereço e avisa quem escuta a URL (`popstate`).
 *
 * É o caminho das telas que precisam levar a outra (Planos → Ajuda, Captura, Ajustes) sem que o
 * App lhes passe um `navigateTo`: `useNavegacao` escuta o `popstate` e troca a view, e a própria
 * tela de Planos escuta para trocar de sub-tela.
 */
export function navegarPara(e: EstadoDeRota): void {
  if (typeof window === 'undefined') return;
  const alvo = estadoParaUrl(e);
  if (window.location.pathname + window.location.search !== alvo) window.history.pushState({}, '', alvo);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Evento que a tela de Planos escuta para trocar de sub-tela (além do `popstate`). */
export const EVENTO_SUBTELA_DE_PLANOS = 'babel:planos-subtela';

/**
 * LEVA PLANOS À SUB-TELA PEDIDA (`null` = a tela principal). É o que faz o "Planos" do menu, com
 * a pessoa no checkout, voltar à tela de planos como no protótipo: para o App a view não muda, e
 * sem isto o clique não fazia nada. Escreve o endereço (se mudou) e avisa a tela.
 */
export function irParaSubTelaDePlanos(planosTela: SubTelaDePlanos | null): void {
  if (typeof window === 'undefined') return;
  const alvo = estadoParaUrl(planosTela ? { view: 'planos', planosTela } : { view: 'planos' });
  if (window.location.pathname !== alvo) window.history.pushState({}, '', alvo);
  window.dispatchEvent(new Event(EVENTO_SUBTELA_DE_PLANOS));
}

export function lerUrlAtual(): EstadoDeRota {
  if (typeof window === 'undefined') return { view: 'hub' };
  return urlParaEstado(window.location.pathname + window.location.search);
}

/**
 * A QUERY DO /jogar COMO ELA CHEGOU, capturada na avaliação deste módulo — antes de o React
 * escrever qualquer coisa na barra. A dança de boot do App (o efeito "navegação → URL" roda uma
 * vez com a view antiga antes de a restauração aplicar) reescreve a URL no meio do caminho: o
 * CAMINHO volta na passada seguinte, a query não. Consumo ÚNICO: um link vale para a abertura
 * que ele causou, não para toda visita futura à tela.
 */
let queryDoBoot =
  typeof window === 'undefined'
    ? ''
    : (urlParaEstado(window.location.pathname + window.location.search).jogarQuery ?? '');

/**
 * A SUB-TELA DE PLANOS COMO ELA CHEGOU — pelo mesmo motivo da query do /jogar acima: na dança de
 * boot o App espelha a view antiga (`/`) antes de restaurar, e o caminho volta como `/plano`, sem
 * a sub-tela. É assim que `/plano/assinado` (a volta do pagamento) sobrevive a um recarregamento.
 * Consumo único, mas só quando a tela MONTA de verdade (no efeito): o React pode descartar uma
 * renderização (Suspense, StrictMode), e consumir na renderização perderia o valor.
 */
let planosTelaDoBoot: SubTelaDePlanos | null =
  typeof window === 'undefined' ? null : (urlParaEstado(window.location.pathname).planosTela ?? null);

export const lerPlanosTelaDoBoot = (): SubTelaDePlanos | null => planosTelaDoBoot;

export function esquecerPlanosTelaDoBoot(): void {
  planosTelaDoBoot = null;
}

export function consumirQueryDoBoot(): string {
  const q = queryDoBoot;
  queryDoBoot = '';
  return q;
}
