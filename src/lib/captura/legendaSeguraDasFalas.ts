/**
 * A LEGENDA SEGURA NAS FALAS DA TELA (change `legenda-segura-para-menores`).
 *
 * UM PONTO SÓ DE APLICAÇÃO: o setter das falas (`setSpeechSegments` de `LiveCapture.tsx`) é envolvido por
 * `comLegendaSegura`, e só a versão envolvida sai da tela. Pipeline local, Web Speech, tradução, parciais e intérprete
 * escrevem por ele; lista, painel flutuante (PiP), intérprete, exportação, vocabulário, "Guardar palavra" e a sessão
 * salva leem do mesmo estado. Filtrar na renderização seriam vários pontos, e um esquecido vazaria.
 *
 * O marcador fica no texto (`•••`) e a contagem fica na fala (`ocultadas`). A palavra ocultada sai de `words` (não vira
 * cartão nem vocabulário).
 */
import { MARCADOR, ocultarTermos, type PoliticaDaLegenda, semMarcador } from '@core/moderacao/legendaSegura';

import type { SpeechSegment } from './tiposDaFala';
import type { TraducaoFinal } from './traducaoDaFala';

export { semMarcador };

type AcaoDasFalas = SpeechSegment[] | ((prev: SpeechSegment[]) => SpeechSegment[]);
type SetterDasFalas = (acao: AcaoDasFalas) => void;

/** Quantos marcadores há num texto. */
const contar = (texto: string | undefined): number => (texto ? texto.split(MARCADOR).length - 1 : 0);

/** As ocultações de uma fala, por campo (a tradução provisória é passageira e não conta). */
export function ocultasNaFala(s: Pick<SpeechSegment, 'originalText' | 'translatedText'>): {
  original: number;
  traducao: number;
} {
  return { original: contar(s.originalText), traducao: contar(s.translatedText) };
}

/**
 * A palavra não pode virar cartão nem vocabulário: é o marcador, ou é um termo da política. Serve ao "Guardar palavra"
 * e a quem monta o vocabulário.
 */
export function palavraOcultada(palavra: string, politica: PoliticaDaLegenda): boolean {
  return palavra.includes(MARCADOR) || ocultarTermos(palavra, politica).ocultadas > 0;
}

/**
 * Uma fala pela política. Devolve o MESMO objeto quando nada muda (a linha não é repintada a cada parcial).
 */
export function falaSegura(s: SpeechSegment, politica: PoliticaDaLegenda): SpeechSegment {
  if (!politica.ligada) return s;
  const o = ocultarTermos(s.originalText ?? '', politica);
  const t = ocultarTermos(s.translatedText ?? '', politica);
  const p = s.traducaoProvisoria ? ocultarTermos(s.traducaoProvisoria, politica) : null;
  const palavrasMudam = (s.words ?? []).some(
    (w) => palavraOcultada(String(w.word ?? ''), politica) || ocultarTermos(w.translation ?? '', politica).ocultadas,
  );
  if (!o.ocultadas && !t.ocultadas && !p?.ocultadas && !palavrasMudam) {
    /* A contagem veio de uma versão anterior da fala (`{ ...seg, originalText }`): acompanha o texto de agora. */
    if (s.ocultadas === undefined) return s;
    const agora = contar(s.originalText) + contar(s.translatedText);
    if (agora === s.ocultadas) return s;
    const { ocultadas: _antiga, ...resto } = s;
    return agora > 0 ? { ...resto, ocultadas: agora } : resto;
  }
  const nova: SpeechSegment = {
    ...s,
    originalText: o.texto,
    translatedText: t.texto,
    words: (s.words ?? [])
      .filter((w) => !palavraOcultada(String(w.word ?? ''), politica))
      .map((w) => {
        const tr = ocultarTermos(w.translation ?? '', politica);
        return tr.ocultadas ? { ...w, translation: tr.texto } : w;
      }),
  };
  if (p) nova.traducaoProvisoria = p.texto;
  const total = contar(nova.originalText) + contar(nova.translatedText);
  if (total > 0) nova.ocultadas = total;
  return nova;
}

/**
 * O setter das falas com a política aplicada a toda escrita. `lerPolitica` é lido a cada escrita (o perfil e a opção do
 * adulto podem mudar). `aoOcultar` avisa a PRIMEIRA ocultação da sessão (a lista zerada começa outra), fora do
 * atualizador do React (que tem de ser puro).
 */
export function comLegendaSegura(
  set: SetterDasFalas,
  lerPolitica: () => PoliticaDaLegenda,
  aoOcultar?: () => void,
): SetterDasFalas {
  /* A fala que já saiu daqui sob esta política não é refeita: as antigas não pagam a regex a cada quadro. */
  const conferidas = new WeakMap<SpeechSegment, PoliticaDaLegenda>();
  let avisou = false;
  const filtrar = (lista: SpeechSegment[]): SpeechSegment[] => {
    if (lista.length === 0) {
      avisou = false;
      return lista;
    }
    const politica = lerPolitica();
    if (!politica.ligada) return lista;
    let mudou = false;
    let ocultou = false;
    const saida = lista.map((s) => {
      if (conferidas.get(s) === politica) return s;
      const segura = falaSegura(s, politica);
      conferidas.set(segura, politica);
      if (segura !== s) mudou = true;
      if (segura.ocultadas) ocultou = true;
      return segura;
    });
    if (ocultou && !avisou && aoOcultar) {
      avisou = true;
      queueMicrotask(aoOcultar);
    }
    return mudou ? saida : lista;
  };
  return (acao) => set((prev) => filtrar(typeof acao === 'function' ? acao(prev) : acao));
}

/**
 * A tradução de um final a caminho da VOZ do intérprete: ela vem do tradutor, não do estado, então passa pela política
 * aqui, e a voz pula o termo (o marcador sai: a síntese não lê "ponto ponto ponto").
 */
export function finalParaAVoz(f: TraducaoFinal, politica: PoliticaDaLegenda): TraducaoFinal {
  if (!politica.ligada) return f;
  return {
    ...f,
    original: ocultarTermos(f.original, politica).texto,
    traducao: semMarcador(ocultarTermos(f.traducao, politica).texto),
  };
}
