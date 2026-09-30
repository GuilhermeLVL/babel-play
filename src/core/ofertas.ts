/**
 * O PAYLOAD DA FLAG `oferta_planos` — banners, modais e paywall configuráveis sem deploy (Fase 8).
 *
 * Aqui mora só a FORMA (tipos) e o PADRÃO embutido no código. A validação de verdade é o schema zod
 * do servidor (`server/lib/ofertas.ts`), que recusa payload inválido na escrita do admin e descarta
 * o que estiver fora da forma na leitura — então o cliente só recebe payload que já passou por lá.
 * O núcleo não importa zod de propósito: é isomórfico e sem dependência (`src/core/tsconfig.json`).
 *
 * TEXTOS: `titulo`, `texto` e `cta` são CHAVES do i18n (o português é a chave, como no resto do
 * app — `src/lib/i18n.ts`) OU um objeto por idioma (`{ pt: '…', en: '…' }`) quando o texto precisa
 * mudar sem deploy e ainda não existe no catálogo. `resolverTextoRemoto` escolhe.
 *
 * FREQUÊNCIA: `maxPorDia`, `maxPorSemana` e `intervaloMinHoras` são TETOS de exibição por
 * gatilho, contados no aparelho. Não é cota nem segurança — é educação com a pessoa.
 */
import type { PlanoDaFlag } from './flags';
import { ehPlanoPago, normalizarPlano } from './planos';

export const MOMENTOS_DE_OFERTA = [
  'fim_de_cota',
  'modelo_premium',
  'conquista',
  'fim_de_sessao',
  'convidado_para_conta',
  'cota_proxima',
  'fim_do_teste',
] as const;
export type MomentoDeOferta = (typeof MOMENTOS_DE_OFERTA)[number];

export const COMPONENTES_DE_OFERTA = ['banner', 'modal', 'aviso_cota', 'comparacao'] as const;
export type ComponenteDeOferta = (typeof COMPONENTES_DE_OFERTA)[number];

/**
 * OS MOMENTOS FUNCIONAIS — avisos que INFORMAM um fato da conta (a cota acabou, a cota está
 * acabando, o teste de 14 dias do Premium termina em 3 dias ou hoje), e não vendem. Valem com a flag
 * `oferta_planos` DESLIGADA (com os textos embutidos em `GATILHOS_FUNCIONAIS`) e não entram no teto
 * global de ofertas promocionais — só no teto de frequência do próprio gatilho. Todos os outros
 * momentos são PROMOCIONAIS: só com a flag ligada.
 */
export const MOMENTOS_FUNCIONAIS: readonly MomentoDeOferta[] = ['fim_de_cota', 'cota_proxima', 'fim_do_teste'];

export function momentoFuncional(m: MomentoDeOferta): boolean {
  return MOMENTOS_FUNCIONAIS.includes(m);
}

/** Chave do i18n, ou o texto literal por idioma. */
export type TextoRemoto = string | Record<string, string>;

export interface GatilhoDeOferta {
  id: string;
  momento: MomentoDeOferta;
  componente: ComponenteDeOferta;
  titulo: TextoRemoto;
  texto: TextoRemoto;
  cta: TextoRemoto;
  maxPorDia: number;
  maxPorSemana: number;
  intervaloMinHoras: number;
  /** Para quem este gatilho aparece. */
  planos: PlanoDaFlag[];
  /**
   * Rótulo do experimento (A/B) que as métricas carregam (`oferta_eventos_por_plano_total`).
   * Opcional: sem ele, `padrao` (gatilho da flag) ou `embutida` (aviso funcional do código).
   */
  variante?: string;
  /**
   * A ETAPA do momento, para o que acontece em mais de um dia — o fim do teste em D-3 (`d3`) e em D0
   * (`d0`). Só os gatilhos embutidos a usam; sem ela, o gatilho vale em qualquer etapa.
   */
  fase?: string;
}

export interface ConfigDeOfertas {
  gatilhos: GatilhoDeOferta[];
}

/**
 * O PADRÃO EMBUTIDO: sem payload (flag desligada, servidor fora, primeira abertura offline), não há
 * oferta nenhuma. Nunca empurrar venda por falha de rede é o lado seguro.
 */
export const OFERTAS_PADRAO: ConfigDeOfertas = Object.freeze({ gatilhos: [] }) as ConfigDeOfertas;

/**
 * O texto a mostrar. `traduzir` é o `t()` do i18n (injetado: o núcleo não conhece a tela).
 * Objeto por idioma: idioma exato → base (`pt-BR` → `pt`) → `pt` → o primeiro que houver.
 */
export function resolverTextoRemoto(texto: TextoRemoto, idioma: string, traduzir: (chave: string) => string): string {
  if (typeof texto === 'string') return traduzir(texto);
  const base = idioma.toLowerCase().split(/[-_]/)[0];
  return texto[idioma] ?? texto[base] ?? texto.pt ?? Object.values(texto)[0] ?? '';
}

/**
 * OS AVISOS FUNCIONAIS EMBUTIDOS — o que aparece com a flag desligada (e, com ela ligada, quando o
 * payload não define um gatilho para o mesmo momento). Os textos são CHAVES do i18n (português),
 * traduzidas pelo catálogo (`public/i18n/*.json`). `planos` não inclui `selfhost`: lá não há cota.
 *
 * Frequência conservadora: fim de cota no máximo 1 vez por dia e 3 por semana, 12 h entre um e
 * outro; cota próxima 1 por dia, 2 por semana, 24 h entre um e outro.
 */
export const GATILHOS_FUNCIONAIS: readonly GatilhoDeOferta[] = Object.freeze([
  {
    id: 'funcional_fim_de_cota',
    momento: 'fim_de_cota',
    componente: 'aviso_cota',
    titulo: 'A IA de nuvem do seu plano acabou neste mês',
    texto: 'A tradução e a transcrição locais continuam funcionando. A cota volta no dia 1º.',
    cta: 'Ver planos',
    maxPorDia: 1,
    maxPorSemana: 3,
    intervaloMinHoras: 12,
    planos: ['convidado', 'free', 'premium'],
  },
  {
    id: 'funcional_cota_proxima',
    momento: 'cota_proxima',
    componente: 'aviso_cota',
    titulo: 'Sua cota de IA de nuvem está perto do fim',
    texto: 'Você já usou mais de 80% da cota deste mês. Quando ela acabar, o app segue com os motores locais.',
    cta: 'Ver planos',
    maxPorDia: 1,
    maxPorSemana: 2,
    intervaloMinHoras: 24,
    planos: ['convidado', 'free', 'premium'],
  },
  /* O FIM DO TESTE DE 14 DIAS (C6): quem testa tem o Premium nos entitlements (`premium`), e só quem
     testa recebe o momento (o host o dispara pelo `teste` de `/api/me/entitlements`). Informativo: diz
     quando acaba e que NADA é cobrado — o teste nunca cobra sozinho. Uma vez em cada fase. */
  {
    id: 'funcional_fim_do_teste_d3',
    momento: 'fim_do_teste',
    fase: 'd3',
    componente: 'banner',
    titulo: 'Seu teste do Premium termina em 3 dias',
    texto: 'Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.',
    cta: 'Ver planos',
    maxPorDia: 1,
    maxPorSemana: 1,
    intervaloMinHoras: 24,
    planos: ['premium'],
  },
  {
    id: 'funcional_fim_do_teste_d0',
    momento: 'fim_do_teste',
    fase: 'd0',
    componente: 'banner',
    titulo: 'Seu teste do Premium termina hoje',
    texto: 'Hoje a conta volta ao Grátis, sem cobrança nenhuma. A legenda no aparelho continua sem limite.',
    cta: 'Ver planos',
    maxPorDia: 1,
    maxPorSemana: 1,
    intervaloMinHoras: 24,
    planos: ['premium'],
  },
] satisfies GatilhoDeOferta[]);

/** Ids dos gatilhos embutidos — o servidor os aceita como rótulo de métrica sem consultar a flag. */
export const IDS_FUNCIONAIS: readonly string[] = GATILHOS_FUNCIONAIS.map((g) => g.id);

/**
 * INSTRUMENTAÇÃO DE CONVERSÃO — o funil `oferta_exibida → oferta_clicada → checkout_iniciado →
 * assinatura_concluida`, com as saídas `oferta_dispensada` e `oferta_nao_mostrar`. Anônimo: nenhum
 * id de pessoa, só o gatilho, o componente, o plano atual/sugerido e a variante.
 */
export const EVENTOS_DE_OFERTA = [
  'oferta_exibida',
  'oferta_dispensada',
  'oferta_nao_mostrar',
  'oferta_clicada',
  'checkout_iniciado',
  'assinatura_concluida',
] as const;
export type EventoDeOferta = (typeof EVENTOS_DE_OFERTA)[number];

/**
 * O plano que a oferta sugere: `conta` é "crie a conta" (o convidado vem antes de qualquer plano);
 * `nenhum` é quem não tem para onde subir. Matriz v2: um plano pago só, o Premium (o C8 acrescenta
 * o `teste` de 14 dias).
 */
export const PLANOS_SUGERIDOS = ['conta', 'premium', 'nenhum'] as const;
export type PlanoSugerido = (typeof PLANOS_SUGERIDOS)[number];

/**
 * O plano sugerido de um evento que chegou de FORA (a métrica do funil, um histórico antigo): o nome
 * antigo (`essencial`/`pro`) de uma aba aberta antes do deploy é o Premium; o que não é plano é `null`.
 */
export function planoSugeridoDe(v: unknown): PlanoSugerido | null {
  if (v === 'conta' || v === 'nenhum') return v;
  const plano = normalizarPlano(v);
  return plano && ehPlanoPago(plano) ? 'premium' : null;
}

/** Rótulo de gatilho/componente quando o evento não veio de uma oferta (checkout orgânico). */
export const SEM_OFERTA = 'nenhum';

/** Formato de id de gatilho e de variante (o mesmo do schema zod do servidor). */
export const FORMATO_DO_ID_DE_GATILHO = /^[a-z0-9_-]{1,40}$/;
export const FORMATO_DA_VARIANTE = /^[a-z0-9_-]{1,24}$/;

export interface RegistroDeOferta {
  evento: EventoDeOferta;
  gatilho: string;
  componente: ComponenteDeOferta | typeof SEM_OFERTA;
  plano_atual: PlanoDaFlag;
  plano_sugerido: PlanoSugerido;
  variante: string;
}
