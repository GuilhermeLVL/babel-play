import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';

import { CORES_DOS_TEMAS, type PerfilDeLeitura } from '../../../core/leitura/perfilDeLeitura';
import { chavesConhecidas } from '../../../core/vocabulario/marcadas';
import { quandoOcioso } from '../../../hooks/useCoberturaDoConteudo';
import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { GlosaDoCapitulo, type OverlayerDaGlosa } from '../../../lib/leitor/glosaNoCapitulo';
import type { MotorDoLeitor } from '../../../lib/leitor/motor';

/**
 * "MOSTRAR TRADUÇÃO DAS PALAVRAS NOVAS" (spec `glosa-no-leitor`). Componente sem tela, montado SÓ com o ajuste ligado:
 * desligado, nada daqui assina o índice de etiquetas nem roda (custo zero). Ligado, a cada capítulo carregado (e a
 * cada mudança do que a pessoa sabe) recalcula em tempo ocioso e desenha a glosa no overlayer do capítulo.
 *
 * `aoSecaoCarregada` é o gancho que o leitor chama quando um capítulo abre; ele fica registrado aqui enquanto o
 * componente existe.
 */
export default function GlosaDoLeitor({
  motorRef,
  aoSecaoCarregada,
  idioma,
  nativo,
  perfil,
}: {
  motorRef: MutableRefObject<MotorDoLeitor | null>;
  aoSecaoCarregada: MutableRefObject<(() => void) | null>;
  idioma: string;
  nativo: string;
  perfil: PerfilDeLeitura;
}) {
  const s = useSnapshotDasEtiquetas();
  const pronto = !!idioma && !!nativo && idioma !== nativo && s.caderno !== null;
  const estado = useMemo(() => {
    if (!pronto) return null;
    const ignoradas = new Set<string>();
    for (const [chave, e] of s.marcadas?.get(idioma) ?? []) if (e === 'ignorada') ignoradas.add(chave);
    const cores = CORES_DOS_TEMAS[perfil.tema];
    return {
      conhecidas: chavesConhecidas(s.caderno, s.marcadas, idioma, { incluirSemIdioma: true }),
      ignoradas,
      aparencia: { cor: cores.suave, fundo: cores.fundo, tamanho: perfil.tamanho },
    };
  }, [pronto, s.caderno, s.marcadas, idioma, perfil.tema, perfil.tamanho]);

  const capitulos = useRef(new WeakMap<Document, GlosaDoCapitulo>());
  const vivos = useRef(new Set<GlosaDoCapitulo>());
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const cancelar = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!pronto) return;
    let ativo = true;
    const aplicar = (tentativa = 0) => {
      if (!ativo) return;
      cancelar.current?.();
      cancelar.current = quandoOcioso(() => {
        const e = estadoRef.current;
        const motor = motorRef.current;
        if (!ativo || !e || !motor) return;
        let faltouOverlayer = false;
        for (const { doc, overlayer } of motor.documentos() as Array<{ doc: Document; overlayer?: OverlayerDaGlosa }>) {
          if (!overlayer) {
            faltouOverlayer = true;
            continue;
          }
          let c = capitulos.current.get(doc);
          if (!c) {
            c = new GlosaDoCapitulo(doc, overlayer, idioma, nativo);
            capitulos.current.set(doc, c);
            vivos.current.add(c);
          }
          void c.atualizar(e).catch((erro: unknown) => console.warn('[glosa] não foi possível glosar', erro));
        }
        // O overlayer nasce um instante depois do capítulo: tenta de novo, poucas vezes.
        if (faltouOverlayer && tentativa < 4) window.setTimeout(() => aplicar(tentativa + 1), 300);
      });
    };
    aoSecaoCarregada.current = () => aplicar();
    aplicar();
    return () => {
      ativo = false;
      aoSecaoCarregada.current = null;
      cancelar.current?.();
    };
  }, [pronto, estado, idioma, nativo, motorRef, aoSecaoCarregada]);

  /* Desligar (ou trocar de idioma) tira toda a glosa da tela. */
  useEffect(() => {
    const dos = vivos.current;
    return () => {
      for (const c of dos) c.limpar();
      dos.clear();
      capitulos.current = new WeakMap();
    };
  }, [idioma, nativo]);

  return null;
}
