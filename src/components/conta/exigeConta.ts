/**
 * A REGRA do gate por view, como função pura — é o que o teste exercita.
 *
 * Sem conta, o app abre nas telas que rodam inteiras no navegador (início, capturar, jogar com a
 * sessão atual, ajustes). O que persiste na conta — biblioteca, sessão/análise, vocabulário,
 * perfil — mostra um convite em vez da tela, e NUNCA some do menu: "mostra, explica, não esconde".
 */
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import type { ViewType } from '../../types';

export const EXIGE_CONTA: ReadonlySet<ViewType> = new Set<ViewType>([
  'library',
  'analysis',
  'study',
  'reading',
  'metrics',
  'profile',
  'estatisticas',
]);

export function exigeConta(view: string): boolean {
  return EXIGE_CONTA.has(view as ViewType);
}

/**
 * A área principal mostra o CONVITE no lugar da tela? Sem conta, nas telas de `EXIGE_CONTA` — menos
 * Estatísticas na edição estática, que roda inteira no servidor em memória. O App monta a tela quando
 * isto é `false` e o convite quando é `true`: nunca as duas, nunca nenhuma.
 */
export function conviteNoLugarDaTela(view: string, anonimo: boolean, estatica = edicaoEstatica()): boolean {
  return anonimo && exigeConta(view) && !(estatica && view === 'estatisticas');
}

/* AS ABAS DE PERSONALIZAR SEM CONTA. Maestria, Temporada (o Passe), Desafios e Loja mostram o convite
 * no lugar do conteúdo (`PersonalizarDoPrototipo`), cada uma com o texto dela (`CONVITE.maestria`,
 * `passe`, `conquistas`, `loja`): saldo, posse e passe só são confiáveis quando o servidor arbitra, e
 * uma economia que vive só no navegador é uma economia que se edita. A Coleção continua aberta. A
 * história da trava (as funções `abaExigeConta`, removidas em 08/09 por não terem chamador) está em
 * `openspec/changes/archive/2026-09-08-codigo-morto-removido/design.md`. */

/** Lembra que a pessoa escolheu seguir sem conta — para não perguntar de novo a cada visita. */
export const CHAVE_ANONIMO_ACEITO = 'babel.anonimo_aceito';

export function anonimoAceito(): boolean {
  try {
    return localStorage.getItem(CHAVE_ANONIMO_ACEITO) === '1';
  } catch {
    return false;
  }
}

export function aceitarAnonimo(): void {
  try {
    localStorage.setItem(CHAVE_ANONIMO_ACEITO, '1');
  } catch {
    /* best-effort */
  }
}

export interface EstadoDaPorta {
  authRequired: boolean;
  temSessao: boolean;
  anonimoAceito: boolean;
  /** A pessoa sem conta pediu para entrar (menu, convite, gate). */
  pedindoLogin: boolean;
}

/**
 * O que a porta de entrada mostra. `login` = tela de login; `app` = a aplicação.
 *
 * A PORTA SE INVERTEU EM 01/09. Até então, a primeira visita em modo público via o formulário de
 * login ANTES do app, e usar sem conta exigia achar o botão "Continuar sem conta" — pedágio, não
 * porta. A decisão de produto é a oposta: o primeiro acesso é sem login, e a conta é pedida no
 * momento em que a pessoa tem algo a perder. É o padrão de 2026 (experimentar antes de cadastrar)
 * e é o que os avisos por marco de uso passam a fazer.
 *
 * O login NÃO some: continua alcançável pelo menu, pelo gate de tela e pelos avisos —
 * `pedindoLogin` é justamente esse caminho. O que muda é quem inicia a conversa.
 *
 * `anonimoAceito` deixa de ser pré-requisito para USAR e continua sendo a memória de "já
 * conversamos sobre isto", para o convite não se repetir a cada visita.
 */
export function porta(e: EstadoDaPorta): 'login' | 'app' {
  if (!e.authRequired) return 'app';
  if (e.temSessao) return 'app';
  if (e.pedindoLogin) return 'login';
  return 'app';
}

/** O motivo do gate em linguagem de gente, a partir da view pedida ou da rota recusada. */
export function motivoDoGate(origem: string): string {
  /* Edição estática: um motivo honesto — não há servidor. Os textos abaixo prometem uma conta que
     ali não existe. */
  if (edicaoEstatica()) {
    if (origem.includes('/api/ai/') || origem.includes('/api/tutor/'))
      return t(
        'A inteligência artificial de nuvem depende do servidor, que esta edição de demonstração não tem. A transcrição e a tradução locais continuam livres.',
      );
    return t(
      'Isto depende do servidor, que esta edição de demonstração não tem. Na versão completa do Frasy funciona.',
    );
  }
  const c = CONVITE[origem];
  if (c) return t(c.titulo) + '.';
  if (origem.includes('/api/import/')) return t('Importar conteúdo para a biblioteca precisa de conta.');
  if (origem.includes('/api/ai/') || origem.includes('/api/tutor/'))
    return t(
      'A inteligência artificial de nuvem precisa de conta. A transcrição e a tradução locais continuam livres.',
    );
  if (origem.includes('/api/images/')) return t('Buscar capas precisa de conta.');
  return t('Esta ação guarda dados na sua conta.');
}

/**
 * Texto do convite por tela — diz o que a conta desbloqueia ALI, não genericamente. Em português: o
 * ponto de uso traduz (`t(c.titulo)`), e as frases estão no catálogo.
 */
export const CONVITE: Record<string, { titulo: string; explicacao: string }> = {
  library: {
    titulo: 'Sua biblioteca fica na sua conta',
    explicacao:
      'Sem conta, cada sessão vive só neste navegador. Com conta, suas gravações ficam guardadas, organizadas e disponíveis em qualquer aparelho.',
  },
  analysis: {
    titulo: 'A análise da sessão precisa de conta',
    explicacao:
      'Transcrição editável, leitura guiada, métricas por sessão e os jogos sobre o que você gravou, tudo salvo na sua conta.',
  },
  study: {
    titulo: 'A revisão precisa de conta',
    explicacao: 'A repetição espaçada só faz sentido quando o progresso é lembrado de um dia para o outro.',
  },
  reading: {
    titulo: 'A leitura guiada precisa de conta',
    explicacao: 'Anotações e progresso de leitura ficam na sua conta.',
  },
  metrics: {
    titulo: 'Seu vocabulário fica na sua conta',
    explicacao:
      'As palavras que você captura viram um baralho com revisão espaçada, e isso precisa ser lembrado entre visitas.',
  },
  profile: {
    titulo: 'O perfil é da conta',
    explicacao: 'Nome, objetivo, nível e histórico de XP existem a partir do momento em que você cria a conta.',
  },
  /* As três abas da economia. O texto diz o que a conta destrava ALI, e por que — saldo que vive
     só no navegador é saldo que se edita. */
  loja: {
    titulo: 'A Loja precisa de conta',
    explicacao:
      'Seeds, compras e o que você já tem são guardados no servidor — é o que impede o saldo de ser inventado, e o que faz o que você comprou continuar seu em qualquer aparelho.',
  },
  passe: {
    titulo: 'O Passe precisa de conta',
    explicacao:
      'A trilha de 100 casas acompanha o seu nível ao longo da temporada, e isso só existe quando o progresso é lembrado entre visitas.',
  },
  conquistas: {
    titulo: 'Os Desafios precisam de conta',
    explicacao:
      'Conquista é um feito registrado: sem conta não há onde registrar, e as Seeds que ela paga não teriam de onde vir.',
  },
  maestria: {
    titulo: 'A Maestria precisa de conta',
    explicacao:
      'O nível de cada jogo sobe com as suas rodadas ao longo das semanas, e isso só existe quando o progresso é lembrado entre visitas. Jogar continua livre.',
  },
  /* Ajustes → Conta, sem conta: o que existe é este navegador. */
  conta: {
    titulo: 'Você está usando o Frasy sem conta',
    explicacao:
      'Capturar, traduzir, jogar e ler continuam livres neste navegador. Com uma conta, suas sessões e palavras ficam guardadas e vão com você para qualquer aparelho.',
  },
  /* Ajustes → Privacidade → "Pedir uma cópia", sem conta. */
  exportar: {
    titulo: 'A cópia dos dados vem da conta',
    explicacao:
      'Sem conta, suas sessões e palavras ficam só neste navegador. Com uma conta, você baixa uma cópia de tudo quando quiser.',
  },
  /* Cartões → palavra nova, trazer e levar, exportar. */
  baralho: {
    titulo: 'Criar, trazer e exportar cartões precisa de conta',
    explicacao:
      'Palavra nova à mão, baralho do Anki e exportação guardam cartões na sua conta. Jogar e capturar palavras continuam livres.',
  },
};
