import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';

import { palavrasAMarcarAoPaginar, type ResumoDoCapitulo } from '../../../core/leitura/destaqueDeVocabulario';
import { CORES_DOS_TEMAS, type PerfilDeLeitura } from '../../../core/leitura/perfilDeLeitura';
import { chaveAtiva } from '../../../core/texto/chaveAtiva';
import { quandoOcioso } from '../../../hooks/useCoberturaDoConteudo';
import {
  desfazerLoteNoIndice,
  marcarLoteNoIndice,
  useSnapshotDasEtiquetas,
} from '../../../lib/etiquetas/indiceDeEtiquetas';
import {
  type AparenciaDoDestaque,
  DestaqueDoCapitulo,
  type ResultadoDoDestaque,
} from '../../../lib/leitor/destaqueNoDocumento';
import type { MotorDoLeitor } from '../../../lib/leitor/motor';

/** O que a camada conta ao leitor: a legenda, a densidade, as palavras da prática e o "Desfazer última página". */
export interface EstadoDoDestaque {
  resumo: ResumoDoCapitulo | null;
  /** As chaves novas e as aprendendo do capítulo, as mais frequentes primeiro. */
  candidatas: string[];
  grifadas: number;
  /** Quantas palavras a última página virada marcou como conhecidas (0 = nada a desfazer). */
  paginadas: number;
  desfazerPagina: (() => void) | null;
}

/** Cores do destaque (as mesmas das etiquetas: o acento para a nova, o verde para a que está aprendendo). */
export function aparenciaDoDestaque(esquema: 'light' | 'dark'): AparenciaDoDestaque {
  return esquema === 'dark' ? { nova: '#ff8c5a', aprendendo: '#6dbe6f' } : { nova: '#c63c14', aprendendo: '#3e6b44' };
}

interface PaginaVisivel {
  range?: Range;
  fracao: number;
}

/**
 * O DESTAQUE POR VOCABULÁRIO DO LEITOR (flag `leitor_destaque_vocab`; openspec `leitura-assistida`, Fatia C). Componente sem
 * tela, no molde do `GlosaDoLeitor`: montado SÓ com a flag e o interruptor ligados (desligado, nada daqui assina o índice
 * de etiquetas nem roda). A cada capítulo carregado e a cada mudança do que a pessoa sabe, reclassifica em tempo ocioso e
 * refaz os grifos (CSS Custom Highlight, sem mexer no DOM do livro).
 *
 * "Paginar marca como conhecida" (`marcarAoPaginar`): desligado por padrão e sempre desligado para o perfil protegido
 * (quem monta este componente decide). Ao virar a página PARA A FRENTE, as palavras novas e comuns da página que ficou
 * para trás, e que a pessoa não tocou, passam a "Já sei" (um lote, desfazível).
 */
export default function CamadaDeDestaque({
  motorRef,
  aoSecaoCarregada,
  idioma,
  perfil,
  pagina,
  palavraAberta,
  marcarAoPaginar,
  aoEstado,
}: {
  motorRef: MutableRefObject<MotorDoLeitor | null>;
  aoSecaoCarregada: MutableRefObject<(() => void) | null>;
  idioma: string;
  perfil: PerfilDeLeitura;
  pagina: PaginaVisivel | null;
  /** A palavra com o cartão aberto agora (conta como "tocada"). */
  palavraAberta?: string;
  marcarAoPaginar: boolean;
  aoEstado: (e: EstadoDoDestaque) => void;
}) {
  const s = useSnapshotDasEtiquetas();
  const pronto = !!idioma && s.caderno !== null;
  const aparencia = useMemo(() => aparenciaDoDestaque(CORES_DOS_TEMAS[perfil.tema].esquema), [perfil.tema]);

  const capitulos = useRef(new WeakMap<Document, DestaqueDoCapitulo>());
  const vivos = useRef(new Set<DestaqueDoCapitulo>());
  const fonteRef = useRef({ caderno: s.caderno, forcas: s.forcas, marcadas: s.marcadas });
  fonteRef.current = { caderno: s.caderno, forcas: s.forcas, marcadas: s.marcadas };
  const aparenciaRef = useRef(aparencia);
  aparenciaRef.current = aparencia;
  const estadoRef = useRef<EstadoDoDestaque>({
    resumo: null,
    candidatas: [],
    grifadas: 0,
    paginadas: 0,
    desfazerPagina: null,
  });
  const aoEstadoRef = useRef(aoEstado);
  aoEstadoRef.current = aoEstado;
  const cancelar = useRef<(() => void) | null>(null);
  const clicadas = useRef(new Set<string>());

  const publicar = useCallback((parte: Partial<EstadoDoDestaque>) => {
    estadoRef.current = { ...estadoRef.current, ...parte };
    aoEstadoRef.current(estadoRef.current);
  }, []);

  /* A palavra tocada nunca é marcada ao paginar. */
  useEffect(() => {
    const c = palavraAberta ? chaveAtiva(palavraAberta, idioma) : '';
    if (c) clicadas.current.add(c);
  }, [palavraAberta, idioma]);

  useEffect(() => {
    if (!pronto) return;
    let ativo = true;
    const aplicar = () => {
      if (!ativo) return;
      cancelar.current?.();
      cancelar.current = quandoOcioso(() => {
        const motor = motorRef.current;
        if (!ativo || !motor) return;
        const atual = motor.posicao?.section?.current;
        for (const { doc, index } of motor.documentos()) {
          let c = capitulos.current.get(doc);
          if (!c) {
            c = new DestaqueDoCapitulo(doc, idioma);
            capitulos.current.set(doc, c);
            vivos.current.add(c);
          }
          void c
            .atualizar(fonteRef.current, aparenciaRef.current)
            .then((r: ResultadoDoDestaque | null) => {
              /* O resumo é o do capítulo EM EXIBIÇÃO (com dois documentos carregados, o outro não manda na legenda). */
              if (!ativo || !r || (atual !== undefined && index !== atual)) return;
              publicar({ resumo: r.resumo, candidatas: r.candidatas, grifadas: r.grifadas });
            })
            .catch((erro: unknown) => console.warn('[destaque] não foi possível grifar', erro));
        }
      });
    };
    aoSecaoCarregada.current = () => aplicar();
    aplicar();
    return () => {
      ativo = false;
      aoSecaoCarregada.current = null;
      cancelar.current?.();
    };
    // `s` muda a cada escrita no índice (Já sei, força): é isso que refaz os grifos.
  }, [pronto, s.caderno, s.forcas, s.marcadas, aparencia, idioma, motorRef, aoSecaoCarregada, publicar]);

  /* Desligar (ou trocar de idioma) tira todo o grifo da tela. */
  useEffect(() => {
    const dos = vivos.current;
    return () => {
      for (const c of dos) c.limpar();
      dos.clear();
      capitulos.current = new WeakMap();
      clicadas.current = new Set();
      aoEstadoRef.current({ resumo: null, candidatas: [], grifadas: 0, paginadas: 0, desfazerPagina: null });
    };
  }, [idioma]);

  /* PAGINAR MARCA COMO CONHECIDA (opção, desligada por padrão): a página que ficou para trás, ao virar para a frente. */
  const anterior = useRef<PaginaVisivel | null>(null);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = pagina;
    if (!marcarAoPaginar || !pronto || !antes?.range || !pagina || pagina.fracao <= antes.fracao) return;
    const doc = antes.range.startContainer.ownerDocument;
    const c = doc ? capitulos.current.get(doc) : undefined;
    if (!c) return;
    const chaves = palavrasAMarcarAoPaginar(c.palavrasNoRange(antes.range), clicadas.current);
    if (!chaves.length) return;
    void marcarLoteNoIndice(idioma, chaves).then((r) => {
      if (!r?.criadas.length) return;
      const criadas = r.criadas;
      publicar({
        paginadas: criadas.length,
        desfazerPagina: () => {
          void desfazerLoteNoIndice(idioma, criadas).then((ok) => {
            if (ok) publicar({ paginadas: 0, desfazerPagina: null });
          });
        },
      });
    });
  }, [pagina, marcarAoPaginar, pronto, idioma, publicar]);

  return null;
}
