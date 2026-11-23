/**
 * O PARCIAL VIVO FORA DO ESTADO DAS FALAS (variante V6 de `parciais-incrementais`; só existe com a flag `parciais_vivos`).
 *
 * Cada atualização do parcial entrava no estado das falas de `LiveCapture`, e cada mudança desse estado re-renderiza a tela de captura
 * (barra de controles, ícones) e, via `useTextoDaConversa`, o App inteiro: medido na V5, ~23 componentes por atualização na tela de captura
 * e ~57 no App, para trocar o texto de UMA linha. Aqui o texto vivo de cada fala aberta mora num armazém pequeno: só a linha que o mostra
 * (`useParcialVivo`) assina e re-renderiza. O estado das falas recebe o PRIMEIRO texto de cada fala (a linha passa a existir nas listas
 * que ignoram fala vazia) e o FINAL, que substitui tudo; o que fica entre os dois é do armazém.
 *
 * A LEGENDA SEGURA vale aqui como em todo texto que vai à tela: a política de agora (`politicaDaLegendaAtual`) oculta os termos antes de
 * o texto entrar no armazém, igual ao envoltório `comLegendaSegura` faz no estado.
 *
 * Quem lê só olha enquanto a fala é parcial (`isPartial`): depois do final o estado manda, e o armazém é limpo em silêncio (sem avisar
 * quem assina, para a linha não piscar o texto velho do estado entre o limpar e o final chegar).
 */
import { ocultarTermos } from '@core/moderacao/legendaSegura';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { politicaDaLegendaAtual } from '../politicaDaLegenda';

export interface ParcialVivo {
  originalText: string;
  /** O prefixo confirmado (LocalAgreement-2); a cauda depois dele é provisória. */
  textoConfirmado?: string;
}

const valores = new Map<string, ParcialVivo>();
const ouvintes = new Map<string, Set<() => void>>();
/** Um contador por fala: quem olha várias falas de uma vez (`useFalasComParcialVivo`) compara versões, não textos. */
const versoes = new Map<string, number>();
/** Quem olha TODOS os parciais abertos de uma vez (`useTextoVivoAberto`, o iChat): avisado a cada escrita que muda algo. */
const ouvintesGerais = new Set<() => void>();

/** Grava o texto vivo da fala (já pela legenda segura) e avisa só quem assina esta fala. Texto igual ao de agora não avisa. */
export function escreverParcialVivo(id: string, v: ParcialVivo): void {
  const politica = politicaDaLegendaAtual();
  let originalText = v.originalText;
  let textoConfirmado = v.textoConfirmado;
  if (politica.ligada) {
    originalText = ocultarTermos(originalText, politica).texto;
    if (textoConfirmado !== undefined) {
      const c = ocultarTermos(textoConfirmado, politica).texto;
      /* O confirmado só vale como prefixo do que está na tela. */
      textoConfirmado = originalText.startsWith(c) ? c : undefined;
    }
  }
  const atual = valores.get(id);
  if (atual && atual.originalText === originalText && atual.textoConfirmado === textoConfirmado) return;
  valores.set(id, { originalText, textoConfirmado });
  versoes.set(id, (versoes.get(id) ?? 0) + 1);
  ouvintes.get(id)?.forEach((f) => f());
  ouvintesGerais.forEach((f) => f());
}

/** O texto vivo de agora (a MESMA identidade enquanto não muda), ou `undefined`. */
export function lerParcialVivo(id: string): ParcialVivo | undefined {
  return valores.get(id);
}

/** Esta fala tem parcial vivo no armazém agora? (Só as da rota do Parakeet têm; as outras seguem o estado das falas, como sempre.) */
export function temParcialVivo(id: string): boolean {
  return valores.has(id);
}

/** A fala fechou (final, erro, ruído): o armazém a esquece, sem avisar ninguém (o estado das falas traz o texto de agora). */
export function limparParcialVivo(id: string): void {
  valores.delete(id);
  versoes.delete(id);
}

function assinar(id: string, f: () => void): () => void {
  let s = ouvintes.get(id);
  if (!s) ouvintes.set(id, (s = new Set()));
  s.add(f);
  return () => {
    s.delete(f);
    if (s.size === 0) ouvintes.delete(id);
  };
}

const semAssinatura = (): (() => void) => () => {};
const nenhum = (): undefined => undefined;

/**
 * O texto vivo desta fala para a linha que a mostra. `id = null` (fala já final, ou sem a flag) não assina nada e devolve `undefined`:
 * a linha usa o texto do estado, como sempre.
 */
export function useParcialVivo(id: string | null): ParcialVivo | undefined {
  const assinarId = useCallback((f: () => void) => (id ? assinar(id, f) : semAssinatura()), [id]);
  const ler = useCallback(() => (id ? valores.get(id) : undefined), [id]);
  return useSyncExternalStore(assinarId, ler, nenhum);
}

/**
 * O texto de TODOS os parciais abertos, na ordem em que as falas abriram, separados por espaço ('' sem nenhum). É o que o texto da conversa
 * que sobe ao App deixou de levar com a flag (`useTextoDaConversa(…, semParcial)`): quem precisa do texto em curso (o iChat) soma isto ao
 * que o App entrega, sem que o App re-renderize a cada atualização.
 */
export function textoVivoAberto(): string {
  const partes: string[] = [];
  for (const v of valores.values()) {
    const t = v.originalText.trim();
    if (t) partes.push(t);
  }
  return partes.join(' ');
}

/** O `textoVivoAberto` como estado de quem o mostra. `ativo = false` não assina nada (devolve ''): só paga quem está olhando. */
export function useTextoVivoAberto(ativo: boolean): string {
  const assinarGeral = useCallback(
    (f: () => void) => {
      if (!ativo) return semAssinatura();
      ouvintesGerais.add(f);
      return () => void ouvintesGerais.delete(f);
    },
    [ativo],
  );
  return useSyncExternalStore(
    assinarGeral,
    () => (ativo ? textoVivoAberto() : ''),
    () => '',
  );
}

/** Soma o texto em curso ao texto fechado da conversa (sem a flag o armazém está vazio e volta o texto de sempre). */
export function conversaComTextoVivo(fechado: string, vivo: string): string {
  return vivo ? (fechado ? `${fechado} ${vivo}` : vivo) : fechado;
}

/** O núcleo comum das janelas de legenda e das telas do Intérprete: quem assina os parciais da lista e sobrepõe o texto vivo. */
function useListaComParcialVivo<T extends { id: string }>(
  falas: T[],
  ehParcial: (f: T) => boolean,
  sobrepor: (f: T, v: ParcialVivo) => T,
): T[] {
  const ids = useMemo(() => falas.filter(ehParcial).map((f) => f.id), [falas]); // eslint-disable-line react-hooks/exhaustive-deps -- `ehParcial` é estável por chamada
  const chave = ids.join('|');
  const assinarIds = useCallback(
    (f: () => void) => {
      const desfazer = ids.map((id) => assinar(id, f));
      return () => desfazer.forEach((d) => d());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume `ids`
    [chave],
  );
  const versao = useSyncExternalStore(
    assinarIds,
    () => ids.map((id) => versoes.get(id) ?? 0).join(','),
    () => '',
  );
  return useMemo(() => {
    if (!ids.length) return falas;
    let mudou = false;
    const saida = falas.map((f) => {
      const v = ehParcial(f) ? valores.get(f.id) : undefined;
      if (!v) return f;
      mudou = true;
      return sobrepor(f, v);
    });
    return mudou ? saida : falas;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` é o que muda quando o armazém muda
  }, [falas, ids, versao]);
}

/** A forma mínima de uma fala de legenda (`LegendaAoVivo`) que o armazém sabe cobrir. */
interface FalaDaJanela {
  id: string;
  original: string;
  parcial?: boolean;
  confirmado?: string;
}

/**
 * As falas de uma JANELA de legenda (flutuante, em vídeo, painel) com o texto vivo por cima do parcial. A janela é quem assina (e re-renderiza
 * a cada atualização); a tela de captura que a monta, não. Só as falas parciais entram; as outras voltam com a MESMA identidade, e a lista
 * é a mesma enquanto nenhum parcial muda (o `memo` das linhas segura o resto).
 */
export function useFalasComParcialVivo<T extends FalaDaJanela>(falas: T[]): T[] {
  return useListaComParcialVivo(
    falas,
    (f) => !!f.parcial,
    (f, v) => ({ ...f, original: v.originalText.trim(), confirmado: v.textoConfirmado }),
  );
}

/** A forma mínima de uma fala do ESTADO (`SpeechSegment`): é o que as telas do Intérprete e da Conversa virtual recebem. */
interface FalaDoEstado {
  id: string;
  originalText: string;
  isPartial?: boolean;
}

/**
 * As falas do estado com o texto vivo por cima de cada parcial (Intérprete e Conversa virtual). Com a flag o estado guarda só o 1º texto da
 * fala em curso; a tela que lê `originalText` assina aqui e vê o texto de agora. A tela re-renderiza a cada atualização (como antes da V6),
 * mas a tela de captura e o App, que a montam, não.
 */
export function useFalasDoEstadoComParcialVivo<T extends FalaDoEstado>(falas: ReadonlyArray<T>): ReadonlyArray<T> {
  return useListaComParcialVivo(
    falas as T[],
    (f) => !!f.isPartial,
    (f, v) => ({ ...f, originalText: v.originalText.trim() }),
  );
}
