/**
 * Os TEXTOS das ferramentas de IA do leitor (a regra é `src/core/leitura/ferramentasDeIa.ts`). Tom de ajuda
 * (`copy-br-etica`): diz o fato e o que continua funcionando; nenhum texto tem preço, urgência ou culpa.
 */
import type { EstadoDaFerramenta, FerramentaDeIa } from '../../../core/leitura/ferramentasDeIa';
import { diaQueACotaVolta } from '../../../lib/diaQueACotaVolta';
import { t } from '../../../lib/i18n';

export function nomeDaFerramenta(f: FerramentaDeIa): string {
  switch (f) {
    case 'traduzir-trecho':
      return t('Traduzir um trecho');
    case 'traduzir-capitulo':
      return t('Traduzir este capítulo');
    case 'explicar':
      return t('Explicar o trecho');
    case 'parceiro':
      return t('Parceiro de leitura');
  }
}

export function comoUsar(f: FerramentaDeIa): string {
  switch (f) {
    case 'traduzir-trecho':
      return t('Selecione um texto no livro e toque em Traduzir. Roda no seu aparelho.');
    case 'traduzir-capitulo':
      return t(
        'O capítulo lado a lado com a tradução, parágrafo por parágrafo. Roda no seu aparelho; se ele não der conta e você autorizou a IA de nuvem, usa a nuvem.',
      );
    case 'explicar':
      return t('Selecione um texto no livro e toque em Explicar: o que ele quer dizer, no seu nível.');
    case 'parceiro':
      return t('Pergunte sobre o trecho ou o capítulo, peça uma analogia, uma curiosidade ou o que observar.');
  }
}

/** A frase do motivo, ou `''` quando a ferramenta está disponível. */
export function fraseDoMotivo(estado: EstadoDaFerramenta): string {
  if (!('motivo' in estado)) return '';
  switch (estado.motivo) {
    case 'em-breve':
      return t('Em breve. Ainda não está liberada para todo mundo.');
    case 'plano':
      return t('Faz parte dos planos pagos. Traduzir e ouvir seguem grátis.');
    case 'entrar':
      return t('Entre na sua conta para usar.');
    case 'idade':
      return t('Fica disponível quando um responsável liberar a sua conta.');
    case 'cota':
      return estado.janela === 'mes'
        ? t('Você usou as deste mês; elas voltam no dia {data}.', { data: diaQueACotaVolta() })
        : t('Você usou as de hoje; volta amanhã.');
    case 'sem-conexao':
      return t('Precisa de internet. Quando voltar, é só tentar de novo.');
  }
}
