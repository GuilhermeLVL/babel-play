/**
 * O QUE CADA PLANO DA v4 TEM, EM PALAVRAS — a fonte única do texto que a tela de Planos do app
 * (`components/views/planos/quatroPlanos.ts`) e a página pública `/planos` (`scripts/site/planosDoSite.ts`)
 * mostram. Antes cada uma escrevia o seu, e o site prometia o que o app dizia "em breve" (voz natural com a
 * flag `voz_natural` desligada) e números que o app não mostra.
 *
 * Puro: devolve as frases em português com os números à parte (`valores`). O app passa cada frase pelo
 * `t()` (o português é a chave do catálogo) e formata os números no idioma da pessoa; o site formata em
 * pt-BR. O número vem sempre da matriz (`planos.ts`), nunca escrito aqui.
 *
 * Só promete o que existe: item cuja flag está desligada sai com `emBreve` (o app desenha o relógio; o site
 * escreve "em breve").
 */
import { AMOSTRA_DE_IA, FRANQUIA_DE_ALIVIO, horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from './planos';

/** Uma frase do catálogo e os números que entram nela (`{horas}`, `{n}`…). */
export interface Frase {
  texto: string;
  valores?: Record<string, number>;
}

export interface ItemDoPlano {
  /** Deixa o plano de cima trocar o item do de baixo com o mesmo tema. */
  tema: string;
  texto: Frase;
  /** A letra miúda; mais de uma frase vai junta, separada por " · ". */
  nota?: Frase[];
  /** Ainda não existe para ninguém: o item diz "em breve". */
  emBreve?: boolean;
}

/** As flags que mudam o que se promete. */
interface FlagsDaVitrine {
  /** `ia_de_estudo`: explicação da frase e resumo da sessão existem (e a amostra do Grátis). */
  iaDeEstudo: boolean;
  /** `voz_natural`: a voz neural chega a quem tem o plano. */
  vozNatural: boolean;
  /** `anuncios`: o Grátis tem anúncio, então "sem anúncios" é um benefício. */
  comAnuncios: boolean;
}

/** Os planos da v4 que a vitrine descreve item a item. */
type PlanoDaVitrine = 'gratis' | 'plus' | 'pro4';

/** Quantas pessoas cabem na Família ("até 4" da spec dos planos v4). */
export const PESSOAS_NA_FAMILIA = 4;

/** Horas com uma casa decimal, como a tela mostra. */
const horas = (segundos: number | null): number => (segundos === null ? 0 : Math.round((segundos / 3600) * 10) / 10);

/** As horas de nuvem do Grátis para aparelho fraco (a franquia de alívio). */
export const horasDoAlivioDoGratis = (): number => horas(FRANQUIA_DE_ALIVIO.sttSegundosMes);

export function itensDaVitrine(id: PlanoDaVitrine, f: FlagsDaVitrine): ItemDoPlano[] {
  if (id === 'gratis')
    return [
      {
        tema: 'legenda',
        texto: { texto: 'Legenda bilíngue no aparelho, sem limite' },
        nota: [{ texto: 'com o modelo Preciso nos aparelhos que o rodam' }],
      },
      { tema: 'jogos', texto: { texto: 'Jogos, vocabulário e revisão' } },
      { tema: 'biblioteca', texto: { texto: 'Cartões, leitura, biblioteca e Anki' } },
      ...(f.iaDeEstudo
        ? [
            {
              tema: 'amostra-ia',
              texto: {
                texto: 'Amostra da IA: {explicacoes} explicações por dia e {resumos} resumo por semana',
                valores: { explicacoes: AMOSTRA_DE_IA.explicacoesDia, resumos: AMOSTRA_DE_IA.resumosSemana },
              },
            },
          ]
        : []),
      {
        tema: 'nuvem',
        texto: {
          texto: 'Nuvem: até {horas} h por mês, para aparelho fraco, quando disponível',
          valores: { horas: horasDoAlivioDoGratis() },
        },
      },
    ];
  if (id === 'pro4')
    return [
      {
        tema: 'conversa',
        texto: { texto: 'Conversa por voz com um tutor, a partir da cena' },
        nota: [{ texto: 'com pronúncia e intérprete automático; só para adultos no começo' }],
        emBreve: true,
      },
    ];
  const { entitlements: e, quotas: q } = PLAN_MATRIX.plus;
  const dia = horasDoUsoJusto('plus');
  const voz = e.vozNatural ? q.vozCaracteresMes : null;
  return [
    ...(e.traducaoNuance
      ? [
          {
            tema: 'nuance',
            texto: { texto: 'Nuance, polir a sessão e glossário' },
            nota: [{ texto: 'outras formas de dizer, formal ou informal' }],
          },
        ]
      : []),
    ...(e.managedCloudLlm
      ? [
          {
            tema: 'tutor',
            texto: { texto: 'Tutor de IA por texto (iChat)' },
            nota: [{ texto: 'sobre o seu material' }],
          },
        ]
      : []),
    ...(voz
      ? [
          {
            tema: 'voz',
            texto: { texto: 'Voz natural para ouvir as frases' },
            nota: [{ texto: 'até {mil} mil caracteres por mês', valores: { mil: Math.round(voz / 1000) } }],
            ...(f.vozNatural ? {} : { emBreve: true }),
          },
        ]
      : []),
    {
      tema: 'nuvem',
      texto: { texto: '{horas} h de nuvem por mês', valores: { horas: horasDeTranscricao('plus') ?? 0 } },
      /* O teto do dia vai AO LADO das horas do mês (CDC, art. 6º, III: a limitação não se esconde). */
      nota: [
        { texto: 'no nível Precisão, para o áudio difícil' },
        ...(dia === null ? [] : [{ texto: 'até {dia} h por dia', valores: { dia } }]),
      ],
    },
    ...(f.comAnuncios && e.semAnuncios
      ? [
          {
            tema: 'anuncios',
            texto: { texto: 'Sem anúncios' },
            nota: [{ texto: 'nenhum espaço patrocinado, intersticial ou faixa' }],
          },
        ]
      : []),
    {
      tema: 'contexto',
      texto: { texto: 'Explicação da frase no contexto' },
      nota: [{ texto: 'por que essa tradução, gramática, formal ou informal, gíria' }],
      ...(f.iaDeEstudo ? {} : { emBreve: true }),
    },
    {
      tema: 'resumo',
      texto: { texto: 'Resumo da sessão que vira cartões' },
      nota: [{ texto: 'com a frase da cena' }],
      ...(f.iaDeEstudo ? {} : { emBreve: true }),
    },
  ];
}

/** "Para quem" de cada plano da v4 (o cartão do app e a página pública dizem o mesmo). */
export const PARA_QUEM_DA_V4 = {
  plus: 'Para quem quer transformar o que assiste em estudo, com tutor, Nuance e nuvem para o áudio difícil.',
  pro4: 'Para quem quer praticar falando com um tutor de voz. Só para adultos no começo.',
} as const;

/**
 * Os planos "em breve" da v4, numa linha cada: o mesmo texto no app e no site, SEM preço (o que não se
 * vende não anuncia valor).
 */
export const EM_BREVE_DA_V4: Record<'familia' | 'pro4', { resumo: Frase; detalhe: string }> = {
  familia: {
    resumo: { texto: 'para até {n} pessoas', valores: { n: PESSOAS_NA_FAMILIA } },
    detalhe: 'Um perfil para cada pessoa e o responsável cuidando da conta, sem ver o que foi ouvido.',
  },
  pro4: {
    resumo: { texto: 'conversa por voz com um tutor' },
    detalhe: PARA_QUEM_DA_V4.pro4,
  },
};

/** Monta a frase com os números já formatados (`numero` decide vírgula e idioma). */
export function montarFrase(
  f: Frase,
  traduzir: (texto: string, valores?: Record<string, string>) => string,
  numero: (n: number) => string,
): string {
  if (!f.valores) return traduzir(f.texto);
  const valores: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.valores)) valores[k] = numero(v);
  return traduzir(f.texto, valores);
}
