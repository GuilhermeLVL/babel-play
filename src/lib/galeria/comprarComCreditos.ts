import { gastarCreditosEx } from '../../data/api';
import { t } from '../i18n';
import type { ItemDaLoja } from '../loja';

/**
 * A COMPRA DE UMA PEÇA COM CRÉDITOS (recompensas v2, onda 6) — a transação e o motivo da recusa.
 *
 * Gêmeo de `comprarPecaComSeeds`: `spendId` fixo por item (`premium-<id>`), então repetir o clique
 * não cobra duas vezes. A posse NÃO é marcada aqui: o que se paga com dinheiro vem sempre do
 * servidor, na próxima leitura da carteira (`useCarteira` → `hidratarPremium`).
 *
 * O MOTIVO importa porque o servidor recusa o perfil protegido com 403 (`menor_nao_compra`, ou
 * `idade_nao_informada` quando a idade ainda não foi dita): "tente de novo" seria mentir para quem
 * nunca vai conseguir por esta conta.
 */
export type MotivoDaRecusaDeCreditos = 'menor' | 'idade' | 'saldo' | 'falha';

export interface ResultadoDaCompraComCreditos {
  ok: boolean;
  /** Por que não deu — só quando `ok` é falso. */
  motivo?: MotivoDaRecusaDeCreditos;
}

export async function comprarPecaComCreditos(item: ItemDaLoja): Promise<ResultadoDaCompraComCreditos> {
  if (item.precoCreditos === undefined) return { ok: false, motivo: 'falha' };
  const { resultado, erro } = await gastarCreditosEx({
    spendId: `premium-${item.id}`,
    amount: item.precoCreditos,
    reason: `premium:${item.id}`,
  });
  if (resultado) return { ok: true };
  if (erro?.code === 'menor_nao_compra') return { ok: false, motivo: 'menor' };
  if (erro?.code === 'idade_nao_informada') return { ok: false, motivo: 'idade' };
  if (erro?.status === 402) return { ok: false, motivo: 'saldo' };
  return { ok: false, motivo: 'falha' };
}

/** O que a tela diz em cada recusa. Nada foi cobrado em nenhuma delas. */
export function mensagemDaRecusaDeCreditos(motivo: MotivoDaRecusaDeCreditos): string {
  switch (motivo) {
    case 'menor':
      return t('Nesta conta, compras com Créditos são feitas pelo responsável, na conta dele. Nada foi cobrado.');
    case 'idade':
      return t('Informe a sua data de nascimento em Seu perfil antes de comprar. Nada foi cobrado.');
    case 'saldo':
      return t('Faltam Créditos para esta peça. Nada foi cobrado.');
    case 'falha':
      return t('Não deu para completar a compra agora. Nada foi cobrado.');
  }
}
