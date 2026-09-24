import {
  Cloud,
  Cpu,
  Download,
  HardDrive,
  Languages,
  type LucideIcon,
  MessageSquareQuote,
  Mic,
  ShieldCheck,
  Sparkles,
  Youtube,
} from 'lucide-react';

import { armazenamentoEmTexto, type PlanoDeAssinatura } from '../../../core/planos';
import { irParaSubTelaDePlanos, navegarPara, type SubTelaDePlanos } from '../../../lib/rotas';

/**
 * OS PLANOS COMO A TELA OS MOSTRA — `PLANOS`, `PLANO_NOME` e `PLANO_ICO` do protótipo aprovado
 * (`docs/prototipos/consistencia-telas.html`), com os números do app: preço da `PLAN_MATRIX`,
 * armazenamento da quota e qualidade medida (`docs/auditoria/eval-producao-v1.md`).
 *
 * Mora fora de `Planos.tsx` porque três telas o leem: os cartões de Planos, o "o que ficou
 * liberado" da confirmação e o "você deixa de ter" do cancelamento.
 */

export type Coluna = 'gratis' | 'essencial' | 'pro';

export const MODELOS: Record<Coluna, string> = { gratis: '230–413 MB', essencial: '230–300 MB', pro: 'nenhum' };

export interface Plano {
  id: Coluna;
  /** A chave do plano na matriz do servidor. */
  chave: PlanoDeAssinatura;
  icone: LucideIcon;
  nome: string;
  tag: string;
  para: string;
  base: string | null;
  itens: [LucideIcon, string][];
  destaque?: boolean;
}

export const PLANOS: Plano[] = [
  {
    id: 'gratis',
    chave: 'free',
    icone: Cpu,
    nome: 'Grátis',
    tag: 'Tudo local, sem custo',
    para: 'Para estudar no seu computador, sem conta e sem pagar.',
    base: null,
    itens: [
      [Cpu, 'Tudo roda no seu aparelho'],
      [ShieldCheck, 'Nada do que você fala sai do computador'],
      [Download, `Baixa ${MODELOS.gratis} de modelos uma vez`],
      [HardDrive, `${armazenamentoEmTexto('free')} para sessões`],
    ],
  },
  {
    id: 'essencial',
    chave: 'essencial',
    icone: Sparkles,
    nome: 'Essencial',
    tag: 'Tradução com IA de nuvem',
    para: 'Para quem quer traduções melhores sem trocar de computador.',
    base: 'Grátis',
    itens: [
      [Languages, 'Tradução com IA de nuvem: 85% de qualidade'],
      [MessageSquareQuote, 'Expressões idiomáticas: 83%'],
      [Download, `Download menor: ${MODELOS.essencial}`],
      [HardDrive, `${armazenamentoEmTexto('essencial')} para sessões`],
    ],
  },
  {
    id: 'pro',
    chave: 'pro',
    icone: Cloud,
    nome: 'Pro',
    tag: 'Tudo processado no servidor',
    para: 'Para quem estuda todo dia, em qualquer aparelho.',
    base: 'Essencial',
    itens: [
      [Cloud, 'Nada para baixar: roda no servidor'],
      [Mic, 'Transcrição com menos erro: 24% no português falado'],
      [Youtube, 'Importar do YouTube'],
      [HardDrive, `${armazenamentoEmTexto('pro')} para sessões`],
    ],
    destaque: true,
  },
];

export const PLANO_NOME: Record<Coluna, string> = { gratis: 'Grátis', essencial: 'Essencial', pro: 'Pro' };
export const PLANO_ICO: Record<Coluna, LucideIcon> = { gratis: Cpu, essencial: Sparkles, pro: Cloud };

export const planoPorId = (id: Coluna): Plano => PLANOS.find((p) => p.id === id)!;

/** Troca a sub-tela de Planos (`null` = a tela principal). */
export const irSub = (planosTela: SubTelaDePlanos | null): void => irParaSubTelaDePlanos(planosTela);

/** O suporte é a tela Ajuda ("Fale com a gente"). */
export const irAjuda = (): void => navegarPara({ view: 'ajuda' });
