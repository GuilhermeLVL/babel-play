/**
 * OS PLANOS NA PÁGINA PÚBLICA `/planos` — tudo derivado de `src/core/planos.ts` (preço, horas, capacidades),
 * nunca escrito à mão.
 *
 * QUAIS PLANOS. A venda é decidida por flags do banco (`planosAVenda`), que o build não lê. O build recebe
 * as flags ligadas em `SITE_FLAGS_DE_VENDA` (lista separada por vírgula, por exemplo
 * `venda_planos_v4,ia_de_estudo,voz_natural`); sem ela vale a venda fechada da matriz (o mesmo padrão de
 * `menorPrecoDeAssinatura`). A página pública e o checkout têm de dizer o mesmo: quem liga uma flag de venda
 * na produção ajusta a variável do build e publica de novo.
 *
 * O QUE CADA PLANO TEM. Além das flags de venda, a lista leva as flags de RECURSO de que a página depende
 * (`ia_de_estudo`, `voz_natural`, `anuncios`): recurso com a flag fora da lista sai "em breve", como no app.
 * Com a v4 os itens vêm da mesma fonte do app (`src/core/oQueOPlanoTem.ts`).
 * O ANUAL. Vendido só com `ANUAL_ENABLED=1` no Worker (o app lê `/api/abertura`); o build não lê o Worker, então
 * recebe `SITE_ANUAL_A_VENDA=1` quando o anual abrir. Sem ela, a página não mostra preço anual nem fala do anual.
 */
import {
  EM_BREVE_DA_V4,
  type Frase,
  horasDoAlivioDoGratis,
  type ItemDoPlano,
  itensDaVitrine,
  montarFrase,
  PARA_QUEM_DA_V4,
} from '../../src/core/oQueOPlanoTem';
import {
  DIAS_DO_TESTE_PREMIUM,
  FLAG_IA_DE_ESTUDO,
  FRANQUIA_DO_TESTE,
  PLAN_MATRIX,
  type PlanoPago,
  armazenamentoEmTexto,
  horasDeTranscricao,
  horasDoUsoJusto,
  planoDoTeste,
  planosAVenda,
  planosEmBreve,
} from '../../src/core/planos';
import { escaparHtml } from './markdown';

/** A flag que liga os anúncios (`src/core/anuncios/politicaDeAnuncio.ts`, `FLAG_ANUNCIOS`). */
const FLAG_ANUNCIOS = 'anuncios';
/** A flag da voz neural (`FLAG_VOZ_NATURAL`, `src/lib/flags`): desligada, a voz natural é "em breve". */
const FLAG_VOZ_NATURAL = 'voz_natural';

/** Número em pt-BR (vírgula decimal), como o app mostra para quem lê em português. */
const numeroBr = (n: number): string => n.toLocaleString('pt-BR');
/** A frase da fonte única, com os números no lugar (o site é só em português: sem catálogo). */
const frase = (f: Frase): string =>
  montarFrase(f, (texto, valores) => texto.replace(/\{(\w+)\}/g, (m, k: string) => valores?.[k] ?? m), numeroBr);
/** Um item como linha da lista: "texto (nota)", e "(em breve)" no que ainda não existe. */
const linhaDoItem = (i: ItemDoPlano): string =>
  frase(i.texto) + (i.nota ? ` (${i.nota.map(frase).join(' · ')})` : '') + (i.emBreve ? ' · em breve' : '');

export const brl = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** As flags ligadas declaradas ao build. */
export function lerFlagsDoSite(valor: string | undefined): Set<string> {
  return new Set(
    (valor ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean),
  );
}

export interface PlanoNaPagina {
  id: PlanoPago;
  rotulo: string;
  mensal: number;
  anual: number | null;
  /** Quanto o ano à vista economiza sobre 12 mensalidades, em % inteiro. */
  economiaAnual: number | null;
  /** "Para quem" (v4: o mesmo texto do cartão do app). */
  quem: string;
  beneficios: string[];
}

/** Um plano da v4 que ainda não se vende: nome, uma linha e o detalhe, sem preço. */
export interface PlanoEmBreve {
  rotulo: string;
  resumo: string;
  detalhe: string;
}

export interface PlanosDoSite {
  aVenda: PlanoNaPagina[];
  /** O anual está à venda (`SITE_ANUAL_A_VENDA=1`); fechado, `anual` é `null` em todos os planos. */
  anualAVenda: boolean;
  emBreve: PlanoEmBreve[];
  teste: { plano: string; dias: number; horas: number };
  armazenamentoGratis: string;
  /** O que o Grátis tem (v4: os itens do app; antes, a lista de sempre com a nuvem de alívio). */
  gratis: string[];
}

const flagsDaVitrine = (flags: Set<string>) => ({
  iaDeEstudo: flags.has(FLAG_IA_DE_ESTUDO),
  vozNatural: flags.has(FLAG_VOZ_NATURAL),
  comAnuncios: flags.has(FLAG_ANUNCIOS),
});

function beneficios(id: PlanoPago, flags: Set<string>): string[] {
  /* v4: os itens do cartão do app, da mesma fonte. */
  if (id === 'plus')
    return [...itensDaVitrine('plus', flagsDaVitrine(flags)).map(linhaDoItem), 'Tudo o que o Grátis tem'];
  const { entitlements: e } = PLAN_MATRIX[id];
  const lista: string[] = [];
  const horas = horasDeTranscricao(id);
  const dia = horasDoUsoJusto(id);
  if (e.managedCloudStt && horas)
    lista.push(
      `${String(horas).replace('.', ',')} h por mês de legenda e tradução na nuvem, para quando o aparelho não der conta ou você quiser mais qualidade` +
        (dia ? ` (até ${String(dia).replace('.', ',')} h por dia; depois a legenda segue no aparelho)` : ''),
    );
  if (e.traducaoNuance) lista.push('Tradução com mais nuance, que lida melhor com expressões e gírias');
  /* Só com a flag `voz_natural` na lista do build: sem ela a voz neural não chega a ninguém (o app a omite). */
  if (e.vozNatural && flags.has(FLAG_VOZ_NATURAL)) lista.push('Voz natural no modo intérprete');
  if (e.interpreteAutomatico) lista.push('Intérprete automático: o Frasy percebe quem está falando, sem tocar na tela');
  if (flags.has(FLAG_ANUNCIOS) && e.semAnuncios) lista.push('Sem anúncios');
  lista.push('Tudo o que o Grátis tem');
  return lista;
}

export function planosDoSite(flags: Set<string>, anualAVenda = false): PlanosDoSite {
  const ligada = (f: string) => flags.has(f);
  const aVenda = planosAVenda(ligada);
  const teste = planoDoTeste(ligada);
  const v4 = aVenda.includes('plus');
  return {
    anualAVenda,
    aVenda: aVenda.map((id) => {
      const { rotulo, precoMensalBrl } = PLAN_MATRIX[id];
      const precoAnualBrl = anualAVenda ? PLAN_MATRIX[id].precoAnualBrl : null;
      const mensal = precoMensalBrl as number;
      return {
        id,
        rotulo,
        mensal,
        anual: precoAnualBrl,
        economiaAnual: precoAnualBrl === null ? null : Math.round((1 - precoAnualBrl / (mensal * 12)) * 100),
        quem:
          id === 'plus'
            ? PARA_QUEM_DA_V4.plus
            : PLAN_MATRIX[id].entitlements.managedCloudStt
              ? 'Tudo do Grátis, com a nuvem junto.'
              : '',
        beneficios: beneficios(id, flags),
      };
    }),
    emBreve: planosEmBreve(aVenda)
      .filter((id): id is 'familia' | 'pro4' => id === 'familia' || id === 'pro4')
      .map((id) => ({
        rotulo: PLAN_MATRIX[id].rotulo,
        resumo: frase(EM_BREVE_DA_V4[id].resumo),
        detalhe: EM_BREVE_DA_V4[id].detalhe,
      })),
    gratis: v4
      ? itensDaVitrine('gratis', flagsDaVitrine(flags)).map(linhaDoItem)
      : [
          'Legendas e tradução ao vivo, rodando no seu aparelho',
          'Revisão espaçada e jogos com as palavras que você salvou',
          'Importação de baralhos Anki, PDF, DOCX e legendas',
          'Modo intérprete com a voz do aparelho',
          `Nuvem: até ${numeroBr(horasDoAlivioDoGratis())} h por mês, para aparelho fraco, quando disponível`,
        ],
    teste: {
      plano: PLAN_MATRIX[teste].rotulo,
      dias: DIAS_DO_TESTE_PREMIUM,
      horas: Math.round(FRANQUIA_DO_TESTE.sttSegundosMes / 3600),
    },
    armazenamentoGratis: armazenamentoEmTexto('free'),
  };
}

/** O JSON-LD `WebApplication` com as ofertas (Grátis + planos à venda, preço mensal em BRL). */
export function webApplicationJsonLd(p: PlanosDoSite, urlDoSite: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Frasy',
    url: `${urlDoSite}/`,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Navegador moderno (Chrome ou Edge no computador para capturar o som de uma aba)',
    inLanguage: 'pt-BR',
    offers: [
      { '@type': 'Offer', name: 'Grátis', price: '0', priceCurrency: 'BRL', url: `${urlDoSite}/planos` },
      ...p.aVenda.map((pl) => ({
        '@type': 'Offer',
        name: pl.rotulo,
        price: pl.mensal.toFixed(2),
        priceCurrency: 'BRL',
        url: `${urlDoSite}/planos`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: pl.mensal.toFixed(2),
          priceCurrency: 'BRL',
          billingDuration: 'P1M',
        },
      })),
    ],
  };
}

/** O HTML dos cartões de plano (no desenho dos cartões de Planos do app: nome, para quem, preço, lista). */
export function cartoesDosPlanos(p: PlanosDoSite): string {
  const lista = (itens: string[]) => `<ul>${itens.map((b) => `<li>${escaparHtml(b)}</li>`).join('')}</ul>`;
  const gratis =
    `<article class="plano peca"><h2>Grátis</h2><p class="quem">Tudo o que roda no seu aparelho.</p>` +
    `<p class="preco"><b>R$ 0</b></p><p class="nota">Sem cartão e sem prazo.</p>` +
    lista([...p.gratis, `${p.armazenamentoGratis} para suas sessões com conta`]) +
    `<a class="botao contorno" href="/app">Começar grátis</a></article>`;
  const pagos = p.aVenda
    .map(
      (pl) =>
        `<article class="plano peca"><h2>${escaparHtml(pl.rotulo)}</h2>` +
        (pl.quem ? `<p class="quem">${escaparHtml(pl.quem)}</p>` : '') +
        `<p class="preco"><b>${brl(pl.mensal)}</b> <span>por mês</span></p>` +
        (pl.anual !== null
          ? `<p class="nota">ou ${brl(pl.anual)} por ano` +
            (pl.economiaAnual && pl.economiaAnual > 0
              ? `, cerca de ${pl.economiaAnual}% a menos que 12 mensalidades`
              : '') +
            '</p>'
          : '') +
        lista(pl.beneficios) +
        `<a class="botao" href="/app/plano">Ver no app</a></article>`,
    )
    .join('');
  return `<div class="planos">${gratis}${pagos}</div>`;
}

/** Os planos "em breve" (Família, Pro): uma linha cada, sem preço nem botão — como no app. */
export function planosEmBreveHtml(p: PlanosDoSite): string {
  if (!p.emBreve.length) return '';
  const linhas = p.emBreve
    .map(
      (e) =>
        `<li><b>${escaparHtml(e.rotulo)}</b> · ${escaparHtml(e.resumo)} · em breve. ${escaparHtml(e.detalhe)}</li>`,
    )
    .join('');
  return `<section class="secao" aria-labelledby="em-breve"><h2 id="em-breve">Em breve</h2><ul class="em-breve">${linhas}</ul><p class="nota">Ainda não estão à venda.</p></section>`;
}
