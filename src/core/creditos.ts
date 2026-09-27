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
 * O QUE ESTES CRÉDITOS SÃO E NÃO SÃO (decisão do dono, 31/08): compram ENFEITE — variantes e
 * kits. Não compram progresso: nível, XP, Seeds e conquista continuam
 * saindo só de estudo. É a linha que a página Sobre agora declara, e é o que separa este
 * catálogo do de Seeds.
 */

/* O SKU `passe-t1` SAIU com a temporada com datas (recompensas v2, onda 5): a trilha paga agora é
   a do ASSINANTE (`temporada.ts`), e o Passe de 100 casas que ele abria não existe mais. */
export type SkuDeCredito = 'c100' | 'c300' | 'c700'

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

export const CATALOGO_DE_CREDITOS: PacoteDeCredito[] = [
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

/* `precoEmReais` MORA EM `lib/i18n.ts`, não aqui.
   O preço é regra de negócio e fica no core; FORMATAR o preço depende do idioma da interface,
   e o núcleo é isomórfico — sem DOM, sem Node (ver `src/core/tsconfig.json`). Importar
   `lib/i18n` daqui arrastava o `fetch` do carregador de catálogo para dentro da fronteira e
   quebrava `npm run typecheck:core`, que é o gate que existe justamente para impedir isso.
   O core entrega o número; a UI o escreve no idioma de quem lê. */
