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

export const MOMENTOS_DE_OFERTA = [
  'fim_de_cota',
  'modelo_premium',
  'conquista',
  'fim_de_sessao',
  'convidado_para_conta',
  'cota_proxima',
] as const;
export type MomentoDeOferta = (typeof MOMENTOS_DE_OFERTA)[number];

export const COMPONENTES_DE_OFERTA = ['banner', 'modal', 'aviso_cota', 'comparacao'] as const;
export type ComponenteDeOferta = (typeof COMPONENTES_DE_OFERTA)[number];

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
