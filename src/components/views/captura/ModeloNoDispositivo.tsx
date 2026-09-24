import { Check, Cpu, Download, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type EstadoDoCache, modeloDisponivel } from '../../../gateway/modelManifest';
import { Dialogo, fecharDialogoDe } from '../../ui';

/**
 * MODELO NO DISPOSITIVO — o `dialogoModelo()` do protótipo aprovado (C9), aberto pelo selo do
 * modelo no cabeçalho da Captura.
 *
 * Cada linha é um modelo que a captura vai usar com o par e a qualidade atuais, e o estado vem do
 * Cache Storage de verdade (`modeloDisponivel`, validado arquivo a arquivo): pronto, incompleto
 * (com quanto falta) ou "baixa na primeira captura". O tamanho é o medido no cache; sem cópia, o
 * estimado pelo roteador. O protótipo mostra ainda a data do download e os botões "Liberar espaço"
 * e "Procurar atualização" — o app não guarda a data nem tem essas duas ações, então ficam de fora.
 */
export interface ModeloDaCaptura {
  id: string;
  titulo: string;
  /** Tamanho estimado do download (MB), quando o roteador sabe. */
  mbEstimado?: number;
  /** O estimado foi medido (e não calculado por proporção)? */
  medido?: boolean;
}

const mb = (bytes: number) => Math.round(bytes / 1_048_576);

export default function ModeloNoDispositivo({
  modelos,
  nuvem,
  aoFechar,
}: {
  modelos: ModeloDaCaptura[];
  /** O provedor ativo é a nuvem (a chave da pessoa): o modelo local é só a reserva. */
  nuvem: boolean;
  aoFechar: () => void;
}) {
  const [estados, setEstados] = useState<Record<string, EstadoDoCache | undefined>>({});
  const chave = modelos.map((m) => m.id).join('|');

  useEffect(() => {
    let vivo = true;
    void Promise.all(modelos.map(async (m) => [m.id, await modeloDisponivel(m.id)] as const)).then((pares) => {
      if (vivo) setEstados(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
    // `chave` resume a lista: a identidade do array muda a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const total = modelos.reduce((soma, m) => soma + (estados[m.id]?.completo ? estados[m.id]!.bytesTotais : 0), 0);
  const conferido = modelos.every((m) => estados[m.id]);

  return (
    <Dialogo
      icone={Cpu}
      titulo="Modelo no dispositivo"
      sub={
        nuvem
          ? 'Com a sua chave, a transcrição vai pela nuvem; o modelo daqui é a reserva.'
          : 'Transcrição e tradução rodam aqui, sem mandar o áudio para fora.'
      }
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        {modelos.map((m) => {
          const e = estados[m.id];
          const tamanho = e?.completo
            ? `${mb(e.bytesTotais)} MB`
            : m.mbEstimado
              ? `${m.medido ? '' : 'cerca de '}${m.mbEstimado} MB`
              : 'tamanho a medir';
          return (
            <div key={m.id} className="op-linha">
              <div>
                <b>{m.titulo}</b>
                <small>
                  {tamanho}
                  {e && !e.completo && e.motivo !== 'sem-manifesto' && e.bytesFaltando > 0
                    ? ` · faltam ${mb(e.bytesFaltando)} MB`
                    : ''}
                </small>
              </div>
              {!e ? (
                <span className="badge neu">verificando…</span>
              ) : e.completo ? (
                <span className="badge ok">
                  <Check aria-hidden /> pronto
                </span>
              ) : e.motivo === 'sem-manifesto' ? (
                <span className="badge neu">
                  <Download aria-hidden /> na primeira captura
                </span>
              ) : (
                <span className="badge warn">
                  <TriangleAlert aria-hidden /> incompleto
                </span>
              )}
            </div>
          );
        })}
        {conferido && (
          <p className="mut" style={{ fontSize: 12.5 }}>
            Total no disco: <b style={{ color: 'var(--ink)' }}>{mb(total)} MB</b>.{' '}
            {total > 0 ? 'Funciona sem internet.' : 'Nada baixado ainda: o download acontece na primeira captura.'}
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          Fechar
        </button>
      </div>
    </Dialogo>
  );
}
