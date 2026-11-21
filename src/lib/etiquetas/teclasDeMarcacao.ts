/**
 * OS ATALHOS DO CARTÃO DA PALAVRA, como no LingQ: `k` = "Já sei" (conhecida), `x` = "Ignorar". Só valem com o cartão
 * aberto, sem modificador (Ctrl/⌘+K é a paleta de comandos) e fora de campo de texto (a nota da palavra, a busca).
 * Apertar de novo a tecla da marcação atual DESFAZ (alterna), que é o "Desfazer" do teclado.
 *
 * QUEM OUVE é o próprio cartão (`MarcarPalavra`, montado só com o cartão aberto), na janela. O leitor de livros
 * recebe as teclas de DENTRO do capítulo (outro documento, que a janela não ouve) e as repassa com
 * `pedirMarcacaoPorTecla`.
 */
import { baseLang } from '../../core/texto/idioma';
import { chaveDaPalavra } from '../../core/texto/palavra';
import { estadoNoCaderno } from '../../core/vocabulario/etiquetas';
import { type EstadoDaMarcacao, estadoMarcado } from '../../core/vocabulario/marcadas';
import { desmarcarNoIndice, lerSnapshotDasEtiquetas, marcarNoIndice } from './indiceDeEtiquetas';

export const TECLA_CONHECIDA = 'k';
export const TECLA_IGNORADA = 'x';

function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** A marcação pedida por esta tecla, ou `null` (outra tecla, com modificador ou dentro de um campo). */
export function teclaDeMarcacao(e: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** Tecla presa: a repetição automática alternaria a marcação sem parar. */
  repeat?: boolean;
  target?: EventTarget | null;
}): EstadoDaMarcacao | null {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || ehCampoDeTexto(e.target ?? null)) return null;
  const k = e.key.toLowerCase();
  if (k === TECLA_CONHECIDA) return 'conhecida';
  if (k === TECLA_IGNORADA) return 'ignorada';
  return null;
}

/**
 * Marca, ou desmarca se a palavra já tem ESSA marcação. Palavra com cartão no caderno não é marcada (o cartão
 * manda): devolve `'no-caderno'`. Senão, `true`/`false` conforme a gravação.
 */
export async function alternarMarcacao(
  palavra: string,
  lang: string | undefined,
  estado: EstadoDaMarcacao,
): Promise<boolean | 'no-caderno'> {
  const s = lerSnapshotDasEtiquetas();
  const chave = chaveDaPalavra(palavra);
  if (!chave || !baseLang(lang)) return false;
  if (estadoNoCaderno(s.caderno, chave, lang)) return 'no-caderno';
  if (estadoMarcado(s.marcadas, chave, lang) === estado) return desmarcarNoIndice(chave, lang);
  return marcarNoIndice(palavra, lang, estado);
}

type Ouvinte = (estado: EstadoDaMarcacao) => void;
const ouvintes = new Set<Ouvinte>();

/** O cartão aberto se inscreve; devolve o cancelamento. */
export function ouvirTeclaDeMarcacao(f: Ouvinte): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

/** Repassa a tecla ao cartão aberto. `true` se havia cartão para ouvir. */
export function pedirMarcacaoPorTecla(estado: EstadoDaMarcacao): boolean {
  for (const f of ouvintes) f(estado);
  return ouvintes.size > 0;
}
