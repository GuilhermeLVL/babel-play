import {
  AudioLines,
  Bot,
  Cloud,
  Cpu,
  Download,
  HardDrive,
  Languages,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  armazenamentoEmTexto,
  FRANQUIA_DE_ALIVIO,
  horasDeTranscricao,
  horasDoUsoJusto,
  type PlanoDeAssinatura,
} from '../../../core/planos';
import { t } from '../../../lib/i18n';
import { irParaSubTelaDePlanos, navegarPara, type SubTelaDePlanos } from '../../../lib/rotas';

/**
 * OS PLANOS COMO A TELA OS MOSTRA — `PLANOS`, `PLANO_NOME` e `PLANO_ICO` do protótipo aprovado
 * (`docs/prototipos/consistencia-telas.html`), com os números do app: preço da `PLAN_MATRIX`, as
 * horas e o armazenamento das quotas, as horas de alívio do Grátis da `FRANQUIA_DE_ALIVIO`.
 *
 * Mora fora de `Planos.tsx` porque três telas o leem: os cartões de Planos, o "o que ficou
 * liberado" da confirmação e o "você deixa de ter" do cancelamento.
 *
 * SÓ O QUE EXISTE (Fase 2 do lançamento, `tests/planos-so-o-que-existe.test.ts`). Saíram três
 * promessas que o app hospedado não cumpria: "Importar do YouTube" (a rota responde 403 fora do
 * self-host), "Nada para baixar" (os modelos locais continuam sendo a reserva quando a nuvem falha
 * ou a cota acaba) e "Download menor" (número não medido com a transcrição de nuvem). O que ainda não
 * chegou — a voz natural do modo intérprete, Fase E — é dito como "em breve", nunca como pronto.
 *
 * A TELA NOVA (C7 da change `planos-v2`, ADR 0011): o Grátis é apresentado pelo que ele JÁ tem
 * ("Tradução rápida ao vivo", o aparelho sem limite e a nuvem de alívio do aparelho fraco) e o Premium
 * pelo que ele soma ("Tradução Nuance"). Nada de "% de qualidade": vender qualidade pega mal
 * (decisão do dono), e os números medidos saíram da tela.
 *
 * O "SEM LIMITE NO DIA A DIA" LEVA A NOTA AO LADO (Código de Defesa do Consumidor, art. 6º, III, e 31:
 * a limitação não pode ficar escondida). O item traz a `nota` do uso justo — o dia E o mês, derivados
 * das quotas —, e toda tela que desenha o item desenha a nota junto (`tests/planos-tela-v2.test.tsx`).
 *
 * OS TEXTOS SÃO CHAVES DO i18n (o português), traduzidos no ponto de uso por `textoDoItem`: uma tabela
 * de módulo traduzida na carga congelaria o idioma de quando o arquivo foi lido.
 */

export type Coluna = 'gratis' | 'premium';

/** O download dos modelos locais do plano Grátis — o único plano que depende só deles. */
export const DOWNLOAD_DO_GRATIS = '230–413 MB';

/** As horas de nuvem por mês do Grátis para aparelho fraco (A10), da franquia — nunca à mão. */
export const horasDoAlivio = (): number => Math.round(FRANQUIA_DE_ALIVIO.sttSegundosMes / 360) / 10;

/** Um item de "o que você tem": ícone, a frase (chave do i18n) e, quando há limite, a nota AO LADO. */
export interface ItemDoPlano {
  icone: LucideIcon;
  texto: string;
  /** A letra miúda que acompanha o texto onde ele aparecer (o uso justo do "sem limite"). */
  nota?: string;
  /** Os números do texto e da nota. */
  vars?: Record<string, string | number>;
}

export interface Plano {
  id: Coluna;
  /** A chave do plano na matriz do servidor. */
  chave: PlanoDeAssinatura;
  icone: LucideIcon;
  nome: string;
  tag: string;
  para: string;
  base: string | null;
  itens: ItemDoPlano[];
  destaque?: boolean;
}

/** As variáveis do uso justo: o dia e o mês, das quotas do Premium. */
const USO_JUSTO = (plano: PlanoDeAssinatura) => ({
  dia: horasDoUsoJusto(plano) ?? 0,
  mes: horasDeTranscricao(plano) ?? 0,
});

export const PLANOS: Plano[] = [
  {
    id: 'gratis',
    chave: 'free',
    icone: Cpu,
    nome: 'Grátis',
    tag: 'Tradução rápida ao vivo',
    para: 'Para ver a legenda bilíngue ao vivo no seu aparelho, sem pagar nada.',
    base: null,
    itens: [
      { icone: Languages, texto: 'Tradução rápida ao vivo, no seu aparelho, sem limite' },
      {
        icone: Cloud,
        texto: '{horas} h por mês de nuvem grátis para aparelho fraco',
        vars: { horas: horasDoAlivio() },
      },
      { icone: ShieldCheck, texto: 'Na legenda do aparelho, o que você fala não sai dele' },
      {
        icone: Download,
        texto: 'Os modelos do aparelho ({tamanho}) baixam uma vez',
        vars: { tamanho: DOWNLOAD_DO_GRATIS },
      },
      { icone: HardDrive, texto: '{espaco} para sessões', vars: { espaco: armazenamentoEmTexto('free') } },
    ],
  },
  {
    id: 'premium',
    chave: 'premium',
    icone: Sparkles,
    nome: 'Premium',
    tag: 'Tradução Nuance',
    para: 'Para entender o jeito de dizer, não só a palavra.',
    base: 'Grátis',
    itens: [
      {
        icone: Languages,
        texto: 'Tradução Nuance: outras formas de dizer, formal ou informal, variantes e glossário',
      },
      {
        icone: Cloud,
        texto: 'Nuvem sem limite no dia a dia',
        nota: 'uso justo: até {dia} h de nuvem por dia e {mes} h por mês; passando disso, a legenda segue no aparelho',
        vars: USO_JUSTO('premium'),
      },
      { icone: Bot, texto: 'Tutor de IA (iChat) sobre o seu material' },
      { icone: Languages, texto: 'Intérprete automático: reconhece sozinho quem fala qual idioma' },
      { icone: AudioLines, texto: 'Voz natural no modo intérprete (em breve)' },
      { icone: HardDrive, texto: '{espaco} para sessões', vars: { espaco: armazenamentoEmTexto('premium') } },
    ],
    destaque: true,
  },
];

/** A frase do item no idioma da tela. */
export const textoDoItem = (i: ItemDoPlano): string => t(i.texto, i.vars);

/** A nota do item (o uso justo), ou `null`. */
export const notaDoItem = (i: ItemDoPlano): string | null => (i.nota ? t(i.nota, i.vars) : null);

/** A frase com a nota entre parênteses — para as listas corridas (confirmação, cancelamento). */
export function itemCompleto(i: ItemDoPlano): string {
  const nota = notaDoItem(i);
  return nota ? `${textoDoItem(i)} (${nota})` : textoDoItem(i);
}

export const PLANO_NOME: Record<Coluna, string> = { gratis: 'Grátis', premium: 'Premium' };
export const PLANO_ICO: Record<Coluna, LucideIcon> = { gratis: Cpu, premium: Sparkles };

export const planoPorId = (id: Coluna): Plano => PLANOS.find((p) => p.id === id)!;

/** Troca a sub-tela de Planos (`null` = a tela principal). */
export const irSub = (planosTela: SubTelaDePlanos | null): void => irParaSubTelaDePlanos(planosTela);

/** O suporte é a tela Ajuda ("Fale com a gente"). */
export const irAjuda = (): void => navegarPara({ view: 'ajuda' });
