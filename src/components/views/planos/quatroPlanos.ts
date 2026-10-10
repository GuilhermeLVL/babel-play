import { type LucideIcon, Monitor, RectangleGoggles, Smartphone } from 'lucide-react';

import {
  DIAS_DO_TESTE_PREMIUM,
  FRANQUIA_DE_ALIVIO,
  horasDeTranscricao,
  horasDoUsoJusto,
  PLAN_MATRIX,
  type PlanoDeAssinatura,
  type PlanoPago,
  PLANOS_PAGOS,
} from '../../../core/planos';
import { brl } from '../../../lib/assinatura';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { numero, t } from '../../../lib/i18n';

/**
 * OS QUATRO PLANOS COMO A TELA OS MOSTRA — porte de `planos4.js:24-112` (aparelhos e planos),
 * `planos4.js:574-593` (comparação, perguntas, recomendado) do protótipo `anuncios-no-gratis`.
 *
 * A FORMA É A DO PROTÓTIPO; O DADO É O DA MATRIZ. Nenhum preço, hora ou capacidade está escrito aqui:
 * o preço vem de `precoMensalBrl`/`precoAnualBrl`, as horas das quotas (`sttSegundosMes`,
 * `sttAoVivoSegundosMes`, `sttSegundosDia`) e o que cada plano tem dos `entitlements` (`traducaoNuance`,
 * `interpreteAutomatico`, `nivelDeVoz`, `sttAoVivo`, `semAnuncios`). Mudar a matriz muda a tela.
 *
 * SÓ O QUE ESTÁ À VENDA. A tela recebe a lista dos planos visíveis (o Grátis, os que o servidor vende
 * agora e o plano que a pessoa já tem) e tudo aqui se monta sobre ela: com o Essencial fora de venda,
 * o Premium passa a dizer "Tudo do Grátis, e:" e herda o que o Essencial acrescentaria (a Nuance), e a
 * linha "Texto durante a fala" só existe com o Ao Vivo à vista.
 *
 * O QUE MUDOU DO PROTÓTIPO POR DECISÃO (`planos-v3-e-rota-inteligente/design.md` §11):
 *   - item 9: "Sincronização entre os seus aparelhos" SAIU do Essencial e da comparação (o Grátis
 *     também guarda no servidor);
 *   - item 13: tudo que fala de anúncio (`comAnuncios`) só aparece com a flag `anuncios` ligada. Hoje ela
 *     não existe, então essas linhas ficam fora;
 *   - item 8: sem anúncios, o Grátis continua com a nuvem de alívio do aparelho fraco, e é ela que
 *     aparece no lugar da "amostra por anúncio";
 *   - Quest: o inglês roda no aparelho; os outros idiomas é que pedem a nuvem. As frases do protótipo
 *     ("sem nuvem não há legenda") foram ajustadas. E o Quest OUVE o som do headset pelo
 *     compartilhamento de tela (medido em 01/10/2026, `lib/dispositivo/perfil.ts`), então a linha "não
 *     deixa um site ouvir o som de outro aplicativo" não vale para ele.
 */

/** Um plano da tela: o Grátis e os pagos da matriz, na ordem dela. */
export type PlanoDaTela = 'gratis' | PlanoPago;

/** A ordem dos cartões e das colunas (`PLANO_IDS`, `anuncios.js:43`): a da matriz. */
export const ORDEM_DOS_PLANOS: readonly PlanoDaTela[] = ['gratis', ...PLANOS_PAGOS];

const chaveDe = (id: PlanoDaTela): PlanoDeAssinatura => (id === 'gratis' ? 'free' : id);
const definicao = (id: PlanoDaTela) => PLAN_MATRIX[chaveDe(id)];

/** O nome do plano (`NOME_DO_PLANO`, `anuncios.js:44`), da matriz. */
export const nomeDoPlano = (id: PlanoDaTela): string => t(definicao(id).rotulo);

/** `ORDEM_DO_PLANO` (`planos4.js:113`): quem vem antes é o plano de baixo. */
export const ordemDoPlano = (id: PlanoDaTela): number => ORDEM_DOS_PLANOS.indexOf(id);

/* ---- Preço (`planos4.js:72-112`, os campos `mensal`, `anual`, `porMesNoAnual`, `economia`) --------- */

export interface PrecoDoPlano {
  /** "R$ 19,90" (ou "R$ 0" no Grátis). */
  mensal: string;
  /** "R$ 149,90", ou `null` quando o plano não tem anual (o Grátis e o Ao Vivo). */
  anual: string | null;
  /** O anual dividido por 12: "R$ 12,49". */
  porMesNoAnual: string | null;
  /** Quanto o anual custa a menos que 12 mensalidades, em % inteiro. */
  economia: number | null;
}

export function precoDoPlanoNaTela(id: PlanoDaTela): PrecoDoPlano {
  const { precoMensalBrl: mensal, precoAnualBrl: anual } = definicao(id);
  if (mensal === null) return { mensal: 'R$ 0', anual: null, porMesNoAnual: null, economia: null };
  if (anual === null) return { mensal: brl(mensal), anual: null, porMesNoAnual: null, economia: null };
  return {
    mensal: brl(mensal),
    anual: brl(anual),
    porMesNoAnual: brl(Math.round((anual / 12) * 100) / 100),
    economia: Math.round((1 - anual / (mensal * 12)) * 100),
  };
}

/** "até 37% a menos" do seletor de ciclo (`planos4.js:667`): a maior economia entre os planos à vista. */
export function maiorEconomia(visiveis: readonly PlanoDaTela[]): number {
  return Math.max(0, ...visiveis.map((id) => precoDoPlanoNaTela(id).economia ?? 0));
}

/* ---- Horas, da matriz ------------------------------------------------------------------------------ */

const horas = (segundos: number | null): number => (segundos === null ? 0 : Math.round((segundos / 3600) * 10) / 10);
/** Horas de nuvem por trechos (o nível Precisão) no mês. */
export const horasDePrecisao = (id: PlanoDaTela): number => horasDeTranscricao(chaveDe(id)) ?? 0;
/** Horas de nuvem ao vivo no mês. */
export const horasAoVivo = (id: PlanoDaTela): number => horas(definicao(id).quotas.sttAoVivoSegundosMes);
/** Horas de nuvem por dia (o uso justo), ou `null` sem teto no dia. */
export const horasPorDia = (id: PlanoDaTela): number | null => horasDoUsoJusto(chaveDe(id));
/** As horas de nuvem do Grátis para aparelho fraco (a franquia de alívio). */
export const horasDoAlivioDoGratis = (): number => horas(FRANQUIA_DE_ALIVIO.sttSegundosMes);

/** O que a tela precisa saber para escolher o que diz. */
export interface ContextoDosPlanos {
  /** Os planos que aparecem, na ordem da matriz. */
  visiveis: readonly PlanoDaTela[];
  /** A flag `anuncios` existe e está ligada (decisão 13). */
  comAnuncios: boolean;
}

/* ---- Os cartões (`PLANOS`, `planos4.js:71-112`) ----------------------------------------------------- */

/** Um item de "o que entra": a frase e, quando há, a letra miúda. `tema` deixa o plano de cima trocar o de baixo. */
interface Item {
  tema: string;
  texto: string;
  nota?: string;
}

/** O que cada plano ACRESCENTA ao de baixo, com o que a matriz diz que ele tem. */
function itensProprios(id: PlanoDaTela, c: ContextoDosPlanos): Item[] {
  const e = definicao(id).entitlements;
  const dia = horasPorDia(id);
  /* O teto do dia vai AO LADO das horas do mês (CDC, art. 6º, III: a limitação não se esconde). O
     protótipo não tem esta frase; o número é o da matriz. */
  const porDia = dia === null ? '' : ` · ${t('até {dia} h por dia', { dia: numero(dia) })}`;
  if (id === 'gratis')
    return [
      { tema: 'legenda', texto: t('Legenda bilíngue no aparelho, sem limite') },
      { tema: 'rapida', texto: t('Tradução rápida ao vivo') },
      { tema: 'jogos', texto: t('Jogos, vocabulário e revisão') },
      c.comAnuncios
        ? {
            tema: 'anuncios',
            texto: t('Com anúncios leves'),
            nota: t('nunca durante a legenda ao vivo, o intérprete ou uma rodada; os premiados são opcionais'),
          }
        : {
            tema: 'nuvem',
            texto: t('Nuvem: até {horas} h por mês, para aparelho fraco, quando disponível', {
              horas: numero(horasDoAlivioDoGratis()),
            }),
          },
    ];
  if (id === 'essencial')
    return [
      ...(c.comAnuncios && e.semAnuncios
        ? [
            {
              tema: 'anuncios',
              texto: t('Sem anúncios'),
              nota: t('nenhum espaço patrocinado, intersticial ou faixa'),
            },
          ]
        : []),
      ...(e.traducaoNuance
        ? [
            {
              tema: 'nuance',
              texto: t('Tradução Nuance rápida'),
              nota: t('outras formas de dizer, formal ou informal'),
            },
          ]
        : []),
      {
        tema: 'nuvem',
        texto: t('{horas} h de nuvem por mês', { horas: numero(horasDePrecisao(id)) }),
        nota: t('no nível Precisão, para o áudio difícil') + porDia,
      },
    ];
  if (id === 'premium')
    return [
      {
        tema: 'nuvem',
        texto: t('{horas} h de nuvem por mês', { horas: numero(horasDePrecisao(id)) }),
        nota: t('transcrição e tradução no nível Precisão') + porDia,
      },
      ...(e.interpreteAutomatico
        ? [
            {
              tema: 'interprete',
              texto: t('Intérprete automático'),
              nota: t('reconhece sozinho quem fala qual idioma'),
            },
          ]
        : []),
      ...(e.nivelDeVoz === 'basica' ? [{ tema: 'voz', texto: t('Voz neural básica no intérprete') }] : []),
    ];
  return [
    ...(e.sttAoVivo
      ? [
          {
            tema: 'aovivo',
            texto: t('{horas} h por mês no nível Ao vivo', { horas: numero(horasAoVivo(id)) }),
            nota: t('o texto aparece enquanto a pessoa ainda fala'),
          },
        ]
      : []),
    ...(e.nivelDeVoz === 'boa' ? [{ tema: 'voz', texto: t('Voz neural boa no intérprete') }] : []),
  ];
}

export interface CartaoDoPlano {
  id: PlanoDaTela;
  nome: string;
  /** O rótulo de cima, quando o cartão não é o da pessoa nem o recomendado. */
  rotulo: string;
  /** "Para quem". */
  quem: string;
  /** "Tudo do {plano}, e:", ou `null` no Grátis. */
  base: string | null;
  itens: { texto: string; nota?: string }[];
  preco: PrecoDoPlano;
}

/** O plano que aparece logo abaixo deste na tela (o "Tudo do … e:"). */
function planoDeBaixo(id: PlanoDaTela, visiveis: readonly PlanoDaTela[]): PlanoDaTela | null {
  const antes = visiveis.filter((v) => ordemDoPlano(v) < ordemDoPlano(id));
  return antes.length ? antes[antes.length - 1] : null;
}

/**
 * O que entra no plano: o que ele acrescenta e, quando um plano do meio NÃO está na tela, o que esse
 * plano acrescentaria (senão o Premium sem o Essencial à vista perderia a Nuance da lista). Um item de
 * cima troca o de baixo do mesmo tema ("20 h de nuvem" no lugar de "5 h").
 */
function itensDoCartao(id: PlanoDaTela, c: ContextoDosPlanos): Item[] {
  const base = planoDeBaixo(id, c.visiveis);
  const escondidos = ORDEM_DOS_PLANOS.filter(
    (p) => ordemDoPlano(p) < ordemDoPlano(id) && (base === null || ordemDoPlano(p) > ordemDoPlano(base)),
  );
  const proprios = itensProprios(id, c);
  const herdados = (id === 'gratis' ? [] : escondidos)
    .flatMap((p) => itensProprios(p, c))
    .filter((h) => !proprios.some((p) => p.tema === h.tema));
  return [...herdados, ...proprios];
}

export function cartaoDoPlano(id: PlanoDaTela, c: ContextoDosPlanos): CartaoDoPlano {
  const base = planoDeBaixo(id, c.visiveis);
  const rotulo: Record<PlanoDaTela, string> = {
    gratis: t('Tudo no aparelho'),
    essencial: c.comAnuncios ? t('Sem anúncios · Nuance') : t('Nuance'),
    premium: t('Nuvem · {horas} h', { horas: numero(horasDePrecisao('premium')) }),
    aovivo: t('Texto durante a fala'),
  };
  const quem: Record<PlanoDaTela, string> = {
    gratis: t('Para quem está conhecendo, ou tem um computador com placa de vídeo.'),
    essencial: c.comAnuncios
      ? t('Para o estudante no computador: sem anúncio e com Nuance.')
      : t('Para o estudante no computador, com Nuance.'),
    premium: t('Para quem depende de nuvem: celular, notebook fraco, Quest.'),
    aovivo: t('Para o intérprete na rua, em viagem, reunião e aula ao vivo.'),
  };
  return {
    id,
    nome: nomeDoPlano(id),
    rotulo: rotulo[id],
    quem: quem[id],
    base: base === null ? null : t('Tudo do {plano}, e:', { plano: nomeDoPlano(base) }),
    itens: itensDoCartao(id, c).map(({ texto, nota }) => ({ texto, ...(nota ? { nota } : {}) })),
    preco: precoDoPlanoNaTela(id),
  };
}

/** O que o plano tem, numa linha (para o seletor do checkout). */
export const resumoDoPlano = (id: PlanoPago): string =>
  itensDoCartao(id, { visiveis: ['gratis', id], comAnuncios: false })
    .map((i) => i.texto)
    .join(' · ');

/* ---- O aparelho (`DISPS` e `GRATIS_NO_APARELHO`, `planos4.js:24-69`) ------------------------------- */

export type Aparelho = 'pc' | 'fraco' | 'celular' | 'quest';
export const APARELHOS: readonly Aparelho[] = ['pc', 'fraco', 'celular', 'quest'];

/** O aparelho REAL, pelo perfil medido (`lib/dispositivo/perfil.ts`), nas quatro caixas do protótipo. */
export function aparelhoAtual(): Aparelho {
  const { tipo } = perfilDoDispositivo();
  if (tipo === 'quest') return 'quest';
  if (tipo.startsWith('celular')) return 'celular';
  return tipo === 'desktop-com-gpu' ? 'pc' : 'fraco';
}

/** `1` funciona, `2` funciona com ressalva, `0` não há. */
export type Sinal = 0 | 1 | 2;

export interface NotaDoAparelho {
  aparelho: Aparelho;
  icone: LucideIcon;
  /** "Você está num computador com placa de vídeo". */
  titulo: string;
  frase: string;
  linhas: [string, string, Sinal][];
}

export function notaDoAparelho(aparelho: Aparelho, c: ContextoDosPlanos): NotaDoAparelho {
  const comEssencial = c.visiveis.includes('essencial');
  const mb = numero(113);
  const tradutor = t('Pelo tradutor do navegador ou pelo modelo local.');
  if (aparelho === 'pc')
    return {
      aparelho,
      icone: Monitor,
      titulo: t('Você está num computador com placa de vídeo'),
      frase: `${t(
        'Este computador tem placa de vídeo: a legenda roda aqui mesmo, sem limite e sem custo. Para estudar inglês, o Grátis já resolve.',
      )} ${
        !comEssencial
          ? t('O Premium abre a Nuance e a nuvem para o áudio difícil.')
          : c.comAnuncios
            ? t('O Essencial tira os anúncios e abre a Nuance.')
            : t('O Essencial abre a Nuance.')
      }`,
      linhas: [
        [t('Transcrição'), t('Em tempo real, no aparelho. Inclusive o som de uma aba.'), 1],
        [t('Tradução'), tradutor, 1],
        [t('Voz'), t('A voz do sistema. Boa no Edge.'), 1],
        [t('Onde a nuvem ajuda'), t('Português com menos erro, áudio com barulho, gíria e jeito de falar.'), 2],
      ],
    };
  if (aparelho === 'fraco')
    return {
      aparelho,
      icone: Monitor,
      titulo: t('Você está num computador fraco'),
      frase: t(
        'Este computador é modesto: a legenda roda aqui, mas com um modelo leve, que erra mais. A nuvem do Premium erra menos, sobretudo em português e em áudio com barulho.',
      ),
      linhas: [
        [t('Transcrição'), t('Funciona, com um modelo leve: mais erros e mais espera.'), 2],
        [t('Tradução'), tradutor, 1],
        [t('Voz'), t('A voz do sistema.'), 1],
        [t('Onde a nuvem ajuda'), t('Quase sempre: menos erro e menos espera, sem esquentar o computador.'), 2],
      ],
    };
  if (aparelho === 'celular')
    return {
      aparelho,
      icone: Smartphone,
      titulo: t('Você está num celular'),
      frase: t(
        'No celular a legenda grátis vem em frases curtas, só pelo microfone, e o app precisa baixar um tradutor próprio. A nuvem do Premium dá sessão contínua e tradução sem baixar nada.',
      ),
      linhas: [
        [t('Transcrição'), t('Pelo reconhecimento do navegador: frases curtas, que reiniciam.'), 2],
        [t('Tradução'), t('Não há tradutor embutido: o app baixa um ({mb} MB, uma vez).', { mb }), 2],
        [t('Voz'), t('A voz do sistema. A qualidade varia de um aparelho para outro.'), 1],
        [
          t('O que nenhum plano resolve'),
          t('O celular não deixa um site ouvir o som de outro aplicativo. Ele ouve pelo microfone.'),
          0,
        ],
      ],
    };
  /* QUEST — ajustado por decisão: o inglês roda no aparelho; a nuvem é para os outros idiomas e para o
     intérprete. E o Quest ouve o som do headset (compartilhamento de tela, medido em 01/10/2026). */
  return {
    aparelho,
    icone: RectangleGoggles,
    titulo: t('Você está num Meta Quest'),
    frase: t(
      'No Quest a legenda em inglês roda no aparelho. Os outros idiomas e o intérprete pedem a nuvem; por isso o plano que faz sentido aqui é o Premium. Jogos, vocabulário e revisão funcionam no Grátis.',
    ),
    linhas: [
      [t('Transcrição'), t('Em inglês, no aparelho. Os outros idiomas pedem a nuvem.'), 2],
      [t('Tradução'), t('Só com um modelo próprio, ainda não medido no Quest.'), 2],
      [t('Voz'), t('O navegador do Quest não fala sozinho.'), 0],
      [t('Som do headset'), t('O app ouve o som do headset pelo compartilhamento de tela.'), 1],
    ],
  };
}

/**
 * O plano recomendado para o aparelho (`recomendadoAqui`, `planos4.js:593`, e `DISPS[...].recomendado`):
 * o Essencial no computador com placa de vídeo, o Premium nos outros. Se o indicado não está à vista,
 * vale o primeiro plano pago de cima dele que estiver; sem nenhum, não há recomendado.
 */
export function recomendadoPara(aparelho: Aparelho, visiveis: readonly PlanoDaTela[]): PlanoDaTela | null {
  const indicado: PlanoDaTela = aparelho === 'pc' ? 'essencial' : 'premium';
  return visiveis.find((v) => v !== 'gratis' && ordemDoPlano(v) >= ordemDoPlano(indicado)) ?? null;
}

/* ---- A comparação (`TABELA4`, `planos4.js:574-584`) ------------------------------------------------- */

/** `1` incluído, `0` não incluído, ou o texto da célula. */
export type Celula = 0 | 1 | string;

/** As linhas, uma célula por plano à vista. Linha em que ninguém à vista tem nada não aparece. */
export function linhasDaComparacao(c: ContextoDosPlanos): [string, Celula[]][] {
  const voz = { aparelho: t('do aparelho'), basica: t('neural básica'), boa: t('neural boa') };
  const por = (f: (id: PlanoDaTela) => Celula): Celula[] => c.visiveis.map(f);
  const h = (n: number): string => `${numero(n)} h`;
  const linhas: ([string, Celula[]] | false)[] = [
    c.comAnuncios && [
      t('Anúncios'),
      por((id) => (definicao(id).entitlements.semAnuncios ? t('sem anúncios') : t('leves e rotulados'))),
    ],
    [t('Legenda bilíngue no aparelho'), por(() => t('sem limite'))],
    [
      t('Horas de nuvem por mês (Precisão)'),
      por((id) =>
        id !== 'gratis'
          ? h(horasDePrecisao(id))
          : c.comAnuncios
            ? t('amostra por anúncio')
            : t('até {horas} h, em aparelho fraco', { horas: numero(horasDoAlivioDoGratis()) }),
      ),
    ],
    [t('Texto durante a fala (Ao vivo)'), por((id) => (definicao(id).entitlements.sttAoVivo ? h(horasAoVivo(id)) : 0))],
    [t('Tradução Nuance'), por((id) => (definicao(id).entitlements.traducaoNuance ? t('rápida') : 0))],
    [
      t('Intérprete'),
      por((id) => (definicao(id).entitlements.interpreteAutomatico ? t('automático') : t('cada um toca o seu lado'))),
    ],
    [t('Voz do intérprete'), por((id) => voz[definicao(id).entitlements.nivelDeVoz])],
    [t('Jogos, vocabulário e revisão'), por(() => 1)],
  ];
  return linhas.filter((l): l is [string, Celula[]] => !!l && l[1].some((v) => v !== 0));
}

/** A nota embaixo da tabela (`planos4.js:627`), com o teto do dia da matriz. */
export function notaDaComparacao(c: ContextoDosPlanos): string {
  const comAoVivo = c.visiveis.some((id) => definicao(id).entitlements.sttAoVivo);
  const niveis = comAoVivo
    ? t(
        'A nuvem tem dois níveis: Precisão (por trechos, erra menos) e Ao vivo (texto enquanto a pessoa fala). Quando as horas acabam, a legenda segue no aparelho.',
      )
    : t(
        'A nuvem trabalha no nível Precisão (por trechos, erra menos). Quando as horas acabam, a legenda segue no aparelho.',
      );
  const comTetoNoDia = c.visiveis.filter((id) => horasPorDia(id) !== null);
  if (!comTetoNoDia.length) return niveis;
  return `${niveis} ${t('No {planos}, a nuvem por trechos vai até {dia} h por dia.', {
    planos: comTetoNoDia.map(nomeDoPlano).join(` ${t('e')} `),
    dia: numero(horasPorDia(comTetoNoDia[0]) ?? 0),
  })}`;
}

/* ---- Perguntas frequentes (`FAQ4`, `planos4.js:585-592`) -------------------------------------------- */

export function perguntasDosPlanos(c: ContextoDosPlanos, diasDoTeste = DIAS_DO_TESTE_PREMIUM): [string, string][] {
  const todas: ([string, string] | false)[] = [
    [
      t('O que quer dizer "no aparelho"?'),
      t(
        'Que a transcrição e a tradução rodam no seu computador ou celular, sem mandar o áudio para fora. É grátis, não tem limite e funciona sem internet. Em aparelho fraco erra mais; no Quest, só o inglês roda no aparelho.',
      ),
    ],
    [
      t('O que acontece quando as horas de nuvem acabam?'),
      t(
        'Nada trava. A legenda volta para o aparelho e segue sem limite, e nada é cobrado a mais. As horas voltam no dia 1º. No Quest, a legenda em inglês segue no aparelho; os outros idiomas esperam até lá.',
      ),
    ],
    [
      t('Posso cancelar?'),
      t(
        'Pode, quando quiser, em Planos › Sua assinatura. O plano vale até o fim do período pago e há 7 dias para desistir com reembolso. O que você gravou continua seu.',
      ),
    ],
    c.comAnuncios && [
      t('Por que o Grátis tem anúncio?'),
      t(
        'Porque é ele que paga o Grátis sem limite. Os anúncios são poucos, rotulados e nunca aparecem durante a legenda ao vivo, o intérprete ou uma rodada. No Quest e no perfil infantil não há anúncio nenhum.',
      ),
    ],
    [
      t('O teste cobra sozinho no fim?'),
      t('Não. São {dias} dias de Premium, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.', {
        dias: diasDoTeste,
      }),
    ],
    [
      t('Meu áudio fica guardado na nuvem?'),
      c.comAnuncios
        ? t(
            'Não. Vai só o trecho que está sendo legendado, para o nosso servidor, e ele nunca é usado para escolher anúncio. No nível No aparelho, nada sai daqui.',
          )
        : t(
            'Não. Vai só o trecho que está sendo legendado, para o nosso servidor. No nível No aparelho, nada sai daqui.',
          ),
    ],
  ];
  return todas.filter((x): x is [string, string] => !!x);
}

/* ---- Horas no medidor (`horas`, `planos4.js:139-143`) ---------------------------------------------- */

/** Segundos na forma do protótipo: "13 h 40", "5 h", "40 min". */
export function horasEmTexto(segundos: number): string {
  const min = Math.max(0, Math.round(segundos / 60));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${String(m).padStart(2, '0')}` : h ? `${h} h` : `${m} min`;
}
