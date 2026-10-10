/**
 * A POLÍTICA DE ANÚNCIOS DO GRÁTIS (change `planos-v3-e-rota-inteligente`, `design.md` §7 e §11.13;
 * spec `anuncios-no-gratis`) — decide SE um espaço de anúncio pode aparecer.
 *
 * PURA: sem DOM, sem storage, sem relógio, sem rede. Tudo o que ela sabe entra pelo pedido; quem lê o
 * plano, o perfil, o aparelho, a tela e o consentimento é `src/lib/anuncios/pedido.ts`. É isso que
 * deixa cada regra testável sozinha (`tests/politicaDeAnuncio.test.ts`).
 *
 * NÃO É GUARDA DE SEGURANÇA: é regra de PRODUTO, avaliada no cliente. A recompensa de um premiado,
 * quando existir, é creditada e limitada pelo servidor.
 *
 * AS REGRAS, na ordem em que são aplicadas (a primeira que nega dá o motivo):
 *
 *  1. FLAG `anuncios` desligada: nada. É o estado de fábrica.
 *  2. LISTAS FECHADAS: o espaço e o formato são os do protótipo (`anuncios-no-gratis-src/anuncios.js`,
 *     `ESPACOS`); um nome de fora, ou um formato que não é o do espaço, não aparece.
 *  3. EDIÇÃO ESTÁTICA: sem anúncio (ali todo mundo é "sem conta"; decisão 13 do design).
 *  4. PLANO com `semAnuncios` (os pagos e o self-host) e o TESTE de 14 dias: nada.
 *  5. PERFIL PROTEGIDO (menor, idade não declarada, sem conta): nada, nem premiado (ECA Digital).
 *  6. HEADSET: nada neste aparelho.
 *  7. TELA OCUPADA: captura ativa, intérprete aberto ou rodada em andamento. Vale também para o
 *     premiado: a pessoa escolher não fura a regra.
 *  8. CONTA com menos de três dias (ou de idade desconhecida): os primeiros dias são sem anúncio.
 *  9. CONSENTIMENTO de anúncios: sem o "sim" próprio, nada.
 * 10. INTERSTICIAL: o último há menos de cinco minutos nega.
 */

/** A chave da flag (`docs/flags.md`, migração 0051). Nasce DESLIGADA. */
export const FLAG_ANUNCIOS = 'anuncios';

/** Os espaços do protótipo (`ESPACOS` em `anuncios.js:67-82`). Lista FECHADA. */
export const ESPACOS_DE_ANUNCIO = [
  'inicio-nativo',
  'bib-infeed',
  'fim-premiado',
  'fim-bloco',
  'ajuda-premiada',
  'tema-24h',
  'nuvem-30',
  'loja-seeds',
  'trilha-oferecida',
  'jogar-miniatura',
  'loja-tema',
  'intersticial',
  'ancora',
  'estat-faixa',
] as const;
export type EspacoDeAnuncio = (typeof ESPACOS_DE_ANUNCIO)[number];

/** Os formatos. Lista FECHADA. */
export const FORMATOS_DE_ANUNCIO = ['nativo', 'premiado', 'intersticial'] as const;
export type FormatoDeAnuncio = (typeof FORMATOS_DE_ANUNCIO)[number];

/**
 * O formato de cada espaço. O protótipo fala em in-feed, display, âncora e patrocínio de conteúdo: para
 * a política são todos `nativo` (ficam dentro da tela, sem cobri-la e sem ser pedidos pela pessoa).
 */
export const FORMATO_DO_ESPACO: Readonly<Record<EspacoDeAnuncio, FormatoDeAnuncio>> = {
  'inicio-nativo': 'nativo',
  'bib-infeed': 'nativo',
  'fim-premiado': 'premiado',
  'fim-bloco': 'nativo',
  'ajuda-premiada': 'premiado',
  'tema-24h': 'premiado',
  'nuvem-30': 'premiado',
  'loja-seeds': 'premiado',
  'trilha-oferecida': 'nativo',
  'jogar-miniatura': 'nativo',
  'loja-tema': 'nativo',
  intersticial: 'intersticial',
  ancora: 'nativo',
  'estat-faixa': 'nativo',
};

/** A conta precisa ter pelo menos isto para ver anúncio. */
export const IDADE_MINIMA_DA_CONTA_MS = 3 * 24 * 60 * 60_000;
/** Distância mínima entre dois intersticiais. */
export const INTERVALO_DO_INTERSTICIAL_MS = 5 * 60_000;

/** O que a tela está fazendo. Qualquer um destes ocupa a tela. */
export interface TelaDoAnuncio {
  capturaAtiva: boolean;
  interpreteAberto: boolean;
  rodadaEmAndamento: boolean;
}

export interface PedidoDeAnuncio {
  /** `string` de propósito: o nome pode vir de fora (config, provedor) e a política confere a lista. */
  espaco: string;
  formato: string;
  /** A flag `anuncios`, como o servidor a avaliou para esta pessoa. */
  flagLigada: boolean;
  /** A capacidade `semAnuncios` do plano (`getEntitlements()`), nunca o nome do plano. */
  semAnuncios: boolean;
  /** O teste de 14 dias do Premium está valendo. */
  emTeste: boolean;
  /** Menor, idade não declarada ou sem conta (`perfilProtegido()`). */
  perfilProtegido: boolean;
  noHeadset: boolean;
  edicaoEstatica: boolean;
  tela: TelaDoAnuncio;
  /** Quando a conta foi criada (ms). `null` = não se sabe, e quem não se sabe não vê anúncio. */
  contaCriadaEm: number | null;
  /** O consentimento `anuncios` (`src/lib/preferencias.ts`). */
  consentimento: boolean;
  /** O último intersticial mostrado neste aparelho (ms), ou `null`. */
  ultimoIntersticialEm: number | null;
  agora: number;
}

export type MotivoDoAnuncio =
  | 'pode'
  | 'flag_desligada'
  | 'espaco_desconhecido'
  | 'formato_desconhecido'
  | 'formato_nao_cabe'
  | 'edicao_estatica'
  | 'sem_anuncios_no_plano'
  | 'em_teste'
  | 'perfil_protegido'
  | 'headset'
  | 'captura_ativa'
  | 'interprete_aberto'
  | 'rodada_em_andamento'
  | 'conta_nova'
  | 'sem_consentimento'
  | 'intersticial_recente';

export interface DecisaoDeAnuncio {
  pode: boolean;
  motivo: MotivoDoAnuncio;
}

const nega = (motivo: MotivoDoAnuncio): DecisaoDeAnuncio => ({ pode: false, motivo });

const ehEspacoDeAnuncio = (v: unknown): v is EspacoDeAnuncio => (ESPACOS_DE_ANUNCIO as readonly unknown[]).includes(v);
const ehFormatoDeAnuncio = (v: unknown): v is FormatoDeAnuncio =>
  (FORMATOS_DE_ANUNCIO as readonly unknown[]).includes(v);

export function podeMostrar(p: PedidoDeAnuncio): DecisaoDeAnuncio {
  // 1. A flag: o estado de fábrica.
  if (!p.flagLigada) return nega('flag_desligada');

  // 2. Listas fechadas.
  if (!ehEspacoDeAnuncio(p.espaco)) return nega('espaco_desconhecido');
  if (!ehFormatoDeAnuncio(p.formato)) return nega('formato_desconhecido');
  if (FORMATO_DO_ESPACO[p.espaco] !== p.formato) return nega('formato_nao_cabe');

  // 3. Edição estática.
  if (p.edicaoEstatica) return nega('edicao_estatica');

  // 4. Quem paga, e quem está no teste.
  if (p.semAnuncios) return nega('sem_anuncios_no_plano');
  if (p.emTeste) return nega('em_teste');

  // 5. Perfil protegido: antes do consentimento, que nem se pede a ele.
  if (p.perfilProtegido) return nega('perfil_protegido');

  // 6. O aparelho.
  if (p.noHeadset) return nega('headset');

  // 7. Tela ocupada (vale para o premiado também).
  if (p.tela.capturaAtiva) return nega('captura_ativa');
  if (p.tela.interpreteAberto) return nega('interprete_aberto');
  if (p.tela.rodadaEmAndamento) return nega('rodada_em_andamento');

  // 8. A idade da conta. Data no futuro (relógio errado) dá idade negativa, e nega.
  if (p.contaCriadaEm === null || p.agora - p.contaCriadaEm < IDADE_MINIMA_DA_CONTA_MS) return nega('conta_nova');

  // 9. O consentimento próprio.
  if (!p.consentimento) return nega('sem_consentimento');

  // 10. O intervalo do intersticial.
  if (
    p.formato === 'intersticial' &&
    p.ultimoIntersticialEm !== null &&
    p.agora - p.ultimoIntersticialEm < INTERVALO_DO_INTERSTICIAL_MS
  )
    return nega('intersticial_recente');

  return { pode: true, motivo: 'pode' };
}
