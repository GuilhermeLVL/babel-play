import type { FalaDoAssistente } from '../../core/assistente/telaDoAssistente';
import type { SpeechSegment } from '../captura/tiposDaFala';

/** Quantas falas da sessão o assistente ao vivo acompanha (mais que as 24 da janela flutuante: a página se relê). */
export const FALAS_DO_ASSISTENTE = 60;

type Lado = FalaDoAssistente['lado'];

/**
 * AS FALAS QUE O ASSISTENTE AO VIVO ACOMPANHA (Fase C3), a partir das falas da sessão: as últimas com texto (sem os
 * espaços das pontas: as posições das marcas são as do texto que a tela desenha), com o LADO de quem falou e o idioma.
 *
 * - Captura com as duas fontes: o som do computador (`system`) é "eles"; o microfone é "você".
 * - Captura SÓ COM O MICROFONE (`soMicrofone`: o celular, e o "Usar o microfone" do Safari e do Firefox): o microfone
 *   ouve a TV, o vídeo, a aula — de quem é a fala é `incerto`, e ela NUNCA vai à correção como "minha fala".
 * - No Intérprete as duas pessoas falam no mesmo microfone: é a METADE que diz. A da pessoa (`meu`, ou `outro` com os
 *   lados trocados — `direcaoDoLado`) é "você", e é só nela que a correção gentil (opt-in) cai. A fala sem idioma
 *   declarado leva o do lado: sem ele, a fala da pessoa no idioma dela contaria como estrangeira e iria à nuvem.
 *
 * `ladosVistos` guarda o lado de cada fala QUANDO ELA CHEGOU: trocar os lados depois não reescreve o passado.
 */
export function falasDoAssistente(
  falas: ReadonlyArray<Pick<SpeechSegment, 'id' | 'originalText' | 'source' | 'isPartial' | 'lado' | 'lang'>>,
  o: {
    trocados: boolean;
    idiomaDaPessoa: string;
    idiomaDoOutro: string;
    soMicrofone?: boolean;
    ladosVistos?: Map<string, Lado>;
    limite?: number;
  },
): FalaDoAssistente[] {
  const limite = o.limite ?? FALAS_DO_ASSISTENTE;
  const ultimas: Array<(typeof falas)[number]> = [];
  for (let i = falas.length - 1; i >= 0 && ultimas.length < limite; i--) {
    const s = falas[i];
    if (s.originalText && s.originalText.trim()) ultimas.unshift(s);
  }
  const vistos = o.ladosVistos;
  if (vistos) {
    /* As que saíram da janela saem do registro. */
    const vivas = new Set(ultimas.map((s) => s.id));
    for (const id of [...vistos.keys()]) if (!vivas.has(id)) vistos.delete(id);
  }
  return ultimas.map((s): FalaDoAssistente => {
    let lado = vistos?.get(s.id);
    if (!lado) {
      lado = s.lado
        ? (s.lado === 'meu') !== o.trocados
          ? 'voce'
          : 'eles'
        : s.source === 'system'
          ? 'eles'
          : o.soMicrofone
            ? 'incerto'
            : 'voce';
      vistos?.set(s.id, lado);
    }
    const doLado = s.lado ? (lado === 'voce' ? o.idiomaDaPessoa : o.idiomaDoOutro) : '';
    return {
      id: s.id,
      original: s.originalText.trim(),
      lado,
      lang: s.lang || doLado || undefined,
      parcial: !!s.isPartial,
    };
  });
}

/**
 * A PÁGINA MOSTRA O ASSISTENTE AGORA? A aba à vista E uma tela que desenha as marcas: a legenda da captura (gravando ou
 * com falas, fora do foco cheio) ou a conversa do Intérprete. Não: a conversa virtual (não tem o assistente), a tela
 * pronta do Intérprete e a captura sem legenda. Fora disso, nada automático sai pela página.
 */
export function paginaMostraOAssistente(t: {
  visivel: boolean;
  entrada: 'captura' | 'interprete';
  interpreteAberto: boolean;
  virtualAberta: boolean;
  focoCheio: boolean;
  comLegenda: boolean;
}): boolean {
  if (!t.visivel || t.virtualAberta) return false;
  if (t.interpreteAberto) return true;
  return t.entrada === 'captura' && t.comLegenda && !t.focoCheio;
}
