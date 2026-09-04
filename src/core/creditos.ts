import { moeda } from '../lib/i18n';
/**
 * O CATÁLOGO DO QUE SE COMPRA COM DINHEIRO — fonte única, cliente e servidor.
 *
 * Mora no core pelo mesmo motivo de `planos.ts`: preço é regra de negócio, e regra duplicada
 * diverge. A tela lê daqui para desenhar os cartões; a rota lê daqui para cobrar. Se o preço
 * mudasse só num lado, o usuário veria R$ 24,90 e pagaria outra coisa.
 *
 * PREÇOS EM CENTAVOS, sempre. Dinheiro em ponto flutuante é como se perde um centavo por
 * transação — e o Asaas recebe reais, então a conversão acontece numa linha só, aqui.
 *
 * O QUE ESTES CRÉDITOS SÃO E NÃO SÃO (decisão do dono, 31/08): compram ENFEITE — variantes,
 * kits, o Passe de Temporada. Não compram progresso: nível, XP, Seeds e conquista continuam
 * saindo só de estudo. É a linha que a página Sobre agora declara, e é o que separa este
 * catálogo do de Seeds.
 */

export type SkuDeCredito = 'c100' | 'c300' | 'c700' | 'passe-t1'

export interface PacoteDeCredito {
  sku: SkuDeCredito
  nome: string
  /** Créditos concedidos na confirmação do pagamento. */
  creditos: number
  precoCentavos: number
  /** Só para os pacotes: quanto se ganha a mais por real, contra o pacote base. */
  bonusPct?: number
  descricao: string
}

/** O passe é um SKU como os outros: mesma cobrança avulsa, mesmo webhook, mesma idempotência. */
export const PRECO_DO_PASSE_CENTAVOS = 1490

export const CATALOGO_DE_CREDITOS: PacoteDeCredito[] = [
  {
    sku: 'passe-t1',
    nome: 'Passe da Temporada 1',
    // O passe devolve 1.134 créditos ao longo da trilha premium (`totalPremiumEmCreditos`) —
    // mais do que custa, que é o modelo que o dono pediu: quem termina compra o próximo.
    creditos: 0,
    precoCentavos: PRECO_DO_PASSE_CENTAVOS,
    descricao: 'Abre a segunda trilha das 100 casas e devolve 1.134 Créditos ao longo dela.',
  },
  { sku: 'c100', nome: '100 Créditos', creditos: 100, precoCentavos: 990, descricao: 'Para começar.' },
  { sku: 'c300', nome: '300 Créditos', creditos: 300, precoCentavos: 2490, bonusPct: 8, descricao: 'O mais escolhido.' },
  { sku: 'c700', nome: '700 Créditos', creditos: 700, precoCentavos: 4990, bonusPct: 21, descricao: 'Para a temporada inteira.' },
]

export function pacotePorSku(sku: string): PacoteDeCredito | undefined {
  return CATALOGO_DE_CREDITOS.find((p) => p.sku === sku)
}

/** Reais para o provedor (que cobra em BRL) — a única conversão do sistema. */
export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100
}

/** "R$ 24,90" — uma formatação só, para o preço não divergir entre telas. */
export function precoEmReais(centavos: number): string {
  return moeda(centavosParaReais(centavos), 'BRL')
}
