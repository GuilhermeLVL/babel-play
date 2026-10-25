/**
 * OS PLANOS NA PÁGINA PÚBLICA `/planos` — tudo derivado de `src/core/planos.ts` (preço, horas, capacidades),
 * nunca escrito à mão.
 *
 * QUAIS PLANOS. A venda é decidida por flags do banco (`planosAVenda`), que o build não lê. O build recebe
 * as flags ligadas em `SITE_FLAGS_DE_VENDA` (lista separada por vírgula, por exemplo
 * `venda_planos_v4,ia_de_estudo`); sem ela vale a venda fechada da matriz (o mesmo padrão de
 * `menorPrecoDeAssinatura`). A página pública e o checkout têm de dizer o mesmo: quem liga uma flag de venda
 * na produção ajusta a variável do build e publica de novo.
 */
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
  beneficios: string[];
}

export interface PlanosDoSite {
  aVenda: PlanoNaPagina[];
  emBreve: string[];
  teste: { plano: string; dias: number; horas: number };
  armazenamentoGratis: string;
}

function beneficios(id: PlanoPago, flags: Set<string>): string[] {
  const { entitlements: e, quotas: q } = PLAN_MATRIX[id];
  const lista: string[] = [];
  const horas = horasDeTranscricao(id);
  const dia = horasDoUsoJusto(id);
  if (e.managedCloudStt && horas)
    lista.push(
      `${String(horas).replace('.', ',')} h por mês de legenda e tradução na nuvem, para quando o aparelho não der conta ou você quiser mais qualidade` +
        (dia ? ` (até ${String(dia).replace('.', ',')} h por dia; depois a legenda segue no aparelho)` : ''),
    );
  if (e.traducaoNuance) lista.push('Tradução com mais nuance, que lida melhor com expressões e gírias');
  if (e.vozNatural) lista.push('Voz natural no modo intérprete');
  if (e.interpreteAutomatico) lista.push('Intérprete automático: o Frasy percebe quem está falando, sem tocar na tela');
  if (flags.has(FLAG_IA_DE_ESTUDO) && q.explicacoesMes)
    lista.push(`Até ${q.explicacoesMes} explicações de frase e ${q.resumosMes ?? 0} resumos de sessão por mês`);
  if (flags.has(FLAG_ANUNCIOS) && e.semAnuncios) lista.push('Sem anúncios');
  lista.push('Tudo o que o Grátis tem');
  return lista;
}

export function planosDoSite(flags: Set<string>): PlanosDoSite {
  const ligada = (f: string) => flags.has(f);
  const aVenda = planosAVenda(ligada);
  const teste = planoDoTeste(ligada);
  return {
    aVenda: aVenda.map((id) => {
      const { rotulo, precoMensalBrl, precoAnualBrl } = PLAN_MATRIX[id];
      const mensal = precoMensalBrl as number;
      return {
        id,
        rotulo,
        mensal,
        anual: precoAnualBrl,
        economiaAnual: precoAnualBrl === null ? null : Math.round((1 - precoAnualBrl / (mensal * 12)) * 100),
        beneficios: beneficios(id, flags),
      };
    }),
    emBreve: planosEmBreve(aVenda).map((id) => PLAN_MATRIX[id].rotulo),
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

/** O HTML dos cartões de plano. */
export function cartoesDosPlanos(p: PlanosDoSite): string {
  const gratis =
    `<article class="plano"><h2>Grátis</h2><p class="preco">R$ 0</p><p class="nota">Sem cartão e sem prazo.</p><ul>` +
    [
      'Legendas e tradução ao vivo, rodando no seu aparelho',
      'Revisão espaçada e jogos com as palavras que você salvou',
      'Importação de baralhos Anki, PDF, DOCX e legendas',
      'Modo intérprete com a voz do aparelho',
      `${p.armazenamentoGratis} para suas sessões com conta`,
    ]
      .map((b) => `<li>${escaparHtml(b)}</li>`)
      .join('') +
    `</ul><a class="botao contorno" href="/app">Começar grátis</a></article>`;
  const pagos = p.aVenda
    .map(
      (pl) =>
        `<article class="plano"><h2>${escaparHtml(pl.rotulo)}</h2>` +
        `<p class="preco">${brl(pl.mensal)} <small>por mês</small></p>` +
        (pl.anual !== null
          ? `<p class="nota">ou ${brl(pl.anual)} por ano` +
            (pl.economiaAnual && pl.economiaAnual > 0
              ? `, cerca de ${pl.economiaAnual}% a menos que 12 mensalidades`
              : '') +
            '</p>'
          : '') +
        `<ul>${pl.beneficios.map((b) => `<li>${escaparHtml(b)}</li>`).join('')}</ul>` +
        `<a class="botao" href="/app/plano">Ver no app</a></article>`,
    )
    .join('');
  return `<div class="planos">${gratis}${pagos}</div>`;
}
