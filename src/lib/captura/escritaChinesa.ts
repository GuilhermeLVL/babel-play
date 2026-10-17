/**
 * A ESCRITA DO CHINÊS QUE A PESSOA ESCOLHEU. O Whisper devolve caracteres simplificados ou tradicionais conforme o provedor e o
 * áudio, e NENHUMA dica muda isso (medido em 17/10/2026: o mesmo áudio saiu com `氣` no DeepInfra e tudo simplificado na Groq;
 * a dica `language: zh` não altera; um prompt em chinês simplificado fez o DeepInfra perder uma frase). Numa mesma sessão o texto
 * ora vinha em 简体, ora em 繁體: o vocabulário (que usa o caractere como chave) e os cartões ficavam divididos em dois.
 *
 * A correção é no app, e vale para qualquer provedor ou modelo local: depois da transcrição, o texto vai para a escrita da variante
 * escolhida (`zh`, `zh-CN`, `zh-SG` → simplificada; `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` → tradicional). Só chinês: japonês, coreano
 * e o resto passam intactos (e o chamador não converte se o motor detectou outro idioma).
 *
 * O conversor (`chinese-conv`, MIT, ~0,6 MB, sem dependências) carrega SOB DEMANDA, só quando o idioma é chinês, e fica na memória;
 * a captura o pede ao preparar os modelos (`prepararEscritaChinesa`). Antes de carregar, o texto passa como veio.
 */
import { baseLang } from '@core/texto/idioma';

export type EscritaChinesa = 'simplificada' | 'tradicional';

/** A escrita da variante pedida, ou `null` se o idioma não é chinês. `zh` puro é simplificada (o "中文 (简体)" da lista). */
export function escritaDoIdioma(lang: string | null | undefined): EscritaChinesa | null {
  const l = (lang ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (baseLang(l) !== 'zh') return null;
  return /^zh-(tw|hk|mo|hant)/.test(l) ? 'tradicional' : 'simplificada';
}

type Conversor = typeof import('chinese-conv');
let conversor: Conversor | null = null;
let carregando: Promise<void> | null = null;

/** Carrega o conversor (uma vez). Falha de carga não derruba nada: o texto segue como veio, e a próxima chamada tenta de novo. */
export function prepararEscritaChinesa(): Promise<void> {
  if (conversor) return Promise.resolve();
  carregando ??= import('chinese-conv')
    .then((m) => {
      conversor = m;
    })
    .catch(() => {
      carregando = null;
    });
  return carregando;
}

/** Só para os testes: esquece o conversor carregado. */
export function esquecerEscritaChinesa(): void {
  conversor = null;
  carregando = null;
}

/**
 * O texto na escrita da variante pedida. Síncrono de propósito (roda no meio do pipeline de fala): sem o conversor carregado, ou
 * com idioma que não é chinês, devolve o texto como veio.
 */
export function converterEscritaChinesa(texto: string, lang: string | null | undefined): string {
  const escrita = escritaDoIdioma(lang);
  if (!escrita || !texto || !conversor) return texto;
  return escrita === 'simplificada' ? conversor.sify(texto) : conversor.tify(texto);
}
