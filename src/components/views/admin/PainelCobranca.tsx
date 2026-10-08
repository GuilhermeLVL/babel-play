import { CircleCheck } from 'lucide-react';
import { useState } from 'react';

import { listarPendencias, reprocessar, type ResultadoDoReprocesso } from '../../../lib/admin';
import { t } from '../../../lib/i18n';
import { askConfirm, toast } from '../../Toast';
import { dataHora } from './formatar';
import { Botao, Estado, Etiqueta, Secao, Tabela, type Tom } from './pecas';
import { useCarga } from './useCarga';

interface Desfecho {
  tom: Tom;
  texto: string;
}

/** O que o servidor disse do reprocesso, em frase. HTTP 200 não basta: `ok:false` é "ainda não aplicado". */
function desfechoDe(r: ResultadoDoReprocesso): Desfecho {
  if (r.repetido) return { tom: 'neutro', texto: t('O evento já estava aplicado: nada mudou.') };
  if (r.ok) return { tom: 'bom', texto: t('Aplicado.') };
  return {
    tom: 'atencao',
    texto: r.motivo ? t('Continua sem efeito: {motivo}', { motivo: r.motivo }) : t('Continua sem efeito.'),
  };
}

/** Cobrança: a fila de eventos que o webhook recebeu e não conseguiu aplicar, com o botão de reprocessar. */
export default function PainelCobranca({ aoPedirCodigo }: { aoPedirCodigo: () => void }) {
  const fila = useCarga(listarPendencias, aoPedirCodigo);
  const [desfechos, setDesfechos] = useState<Record<string, Desfecho>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const reprocessarEste = async (id: string) => {
    const ok = await askConfirm({
      title: t('Reprocessar este evento de cobrança?'),
      detail: t(
        'O servidor aplica o evento de novo com a regra de hoje. Reaplicar um evento já aplicado não muda nada.',
      ),
      confirmLabel: t('Reprocessar'),
    });
    if (!ok) return;
    setOcupado(id);
    const r = await reprocessar(id);
    setOcupado(null);
    if (r.ok) {
      const d = desfechoDe(r.dados as ResultadoDoReprocesso);
      setDesfechos((atual) => ({ ...atual, [id]: d }));
      (d.tom === 'bom' ? toast.ok : toast.info)(d.texto);
      fila.recarregar();
    } else if (r.segundoFator) {
      aoPedirCodigo();
    } else {
      const erro = r.erro ?? '';
      setDesfechos((atual) => ({ ...atual, [id]: { tom: 'erro', texto: erro } }));
      toast.error(erro);
    }
  };

  return (
    <div className="ad-painel">
      <Secao
        titulo={t('Eventos de cobrança sem efeito')}
        sub={t(
          'O Asaas recebeu 200 e não reenvia: estes eventos ficaram guardados com o motivo. Reprocessar aplica de novo, com a regra de hoje.',
        )}
        acoes={<Botao aoClicar={fila.recarregar}>{t('Atualizar')}</Botao>}
      >
        <Estado
          carga={fila}
          estaVazio={(l) => l.length === 0}
          vazio={{
            icone: <CircleCheck aria-hidden />,
            titulo: t('Nenhuma pendência'),
            explicacao: t('Todo evento de cobrança recebido teve efeito. Quando um falhar, ele aparece aqui.'),
          }}
        >
          {(lista) => (
            <Tabela
              rotulo={t('Eventos de cobrança pendentes')}
              colunas={[t('Evento'), t('Motivo'), t('Conta'), t('Recebido em'), t('Resultado'), '']}
            >
              {lista.map((p) => (
                <tr key={p.id}>
                  <td data-rotulo={t('Evento')}>
                    <b>{p.event}</b>
                    <code className="ad-id">{p.id}</code>
                  </td>
                  <td data-rotulo={t('Motivo')}>{p.motivo || t('não informado')}</td>
                  <td data-rotulo={t('Conta')}>{p.userId ? <code className="ad-id">{p.userId}</code> : '—'}</td>
                  <td data-rotulo={t('Recebido em')}>{dataHora(p.createdAt)}</td>
                  <td data-rotulo={t('Resultado')} aria-live="polite">
                    {desfechos[p.id] ? <Etiqueta tom={desfechos[p.id].tom}>{desfechos[p.id].texto}</Etiqueta> : '—'}
                  </td>
                  <td className="ad-acao-da-linha">
                    <Botao tom="principal" desabilitado={ocupado !== null} aoClicar={() => void reprocessarEste(p.id)}>
                      {ocupado === p.id ? t('Reprocessando…') : t('Reprocessar')}
                    </Botao>
                  </td>
                </tr>
              ))}
            </Tabela>
          )}
        </Estado>
      </Secao>
    </div>
  );
}
