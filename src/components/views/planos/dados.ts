import {
  Bot,
  Cloud,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  Languages,
  type LucideIcon,
  MessageSquareQuote,
  Mic,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { armazenamentoEmTexto, horasDeTranscricao, type PlanoDeAssinatura } from '../../../core/planos';
import { irParaSubTelaDePlanos, navegarPara, type SubTelaDePlanos } from '../../../lib/rotas';

/**
 * OS PLANOS COMO A TELA OS MOSTRA — `PLANOS`, `PLANO_NOME` e `PLANO_ICO` do protótipo aprovado
 * (`docs/prototipos/consistencia-telas.html`), com os números do app: preço da `PLAN_MATRIX`,
 * armazenamento da quota e qualidade medida (`docs/auditoria/eval-producao-v1.md`).
 *
 * Mora fora de `Planos.tsx` porque três telas o leem: os cartões de Planos, o "o que ficou
 * liberado" da confirmação e o "você deixa de ter" do cancelamento.
 *
 * SÓ O QUE EXISTE (Fase 2 do lançamento, `tests/planos-so-o-que-existe.test.ts`). Saíram três
 * promessas que o app hospedado não cumpria: "Importar do YouTube" (a rota responde 403 fora do
 * self-host), "Nada para baixar" (os modelos locais continuam sendo a reserva quando a nuvem falha
 * ou a cota acaba) e "Download menor" (número não medido com a transcrição de nuvem). O "modelo
 * maior" do Pro também não aparece aqui: ele só existe quando `LLM_MODEL_GRANDE` está definido no
 * servidor, e a tela não sabe disso — volta à vitrine quando o modelo for escolhido e medido.
 */

export type Coluna = 'gratis' | 'essencial' | 'pro';

/** O download dos modelos locais do plano Grátis — o único plano que depende só deles. */
export const DOWNLOAD_DO_GRATIS = '230–413 MB';

/** "15 h de transcrição de nuvem por mês", derivado da quota. */
const horas = (plano: PlanoDeAssinatura) => `${horasDeTranscricao(plano) ?? 0} h de transcrição de nuvem por mês`;

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
      [Download, `Baixa ${DOWNLOAD_DO_GRATIS} de modelos uma vez`],
      [HardDrive, `${armazenamentoEmTexto('free')} para sessões`],
    ],
  },
  {
    id: 'essencial',
    chave: 'essencial',
    icone: Sparkles,
    nome: 'Essencial',
    tag: 'Tradução e transcrição com IA de nuvem',
    para: 'Para quem quer traduções e transcrições melhores sem trocar de computador.',
    base: 'Grátis',
    itens: [
      [Languages, 'Tradução com IA de nuvem: 85% de qualidade'],
      [MessageSquareQuote, 'Expressões idiomáticas: 83%'],
      [Mic, horas('essencial')],
      [Bot, 'Tutor de IA (iChat) sobre o seu material'],
      [HardDrive, `${armazenamentoEmTexto('essencial')} para sessões`],
    ],
  },
  {
    id: 'pro',
    chave: 'pro',
    icone: Cloud,
    nome: 'Pro',
    tag: 'Mais horas de IA de nuvem',
    para: 'Para quem estuda todo dia e transcreve muito.',
    base: 'Essencial',
    itens: [
      [Mic, horas('pro')],
      [Gauge, 'Limite maior de tradução e tutor de IA'],
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
