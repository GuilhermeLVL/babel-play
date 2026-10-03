import { CircleAlert, CircleCheck } from 'lucide-react';

import { lerErros } from '../../../lib/admin';
import { t } from '../../../lib/i18n';
import { dataHora, texto } from './formatar';
import { Aviso, Botao, Estado, Secao, Tabela } from './pecas';
import { useCarga } from './useCarga';

/** O servidor responde `diario: 'desligado (…)'` quando não há sink de erros. */
const desligado = (diario: string) => diario.startsWith('desligado');

/** Erros: o diário de erros recente, como o servidor o devolve (já sem dados pessoais). */
export default function PainelErros({ aoPedirCodigo }: { aoPedirCodigo: () => void }) {
  const diario = useCarga(() => lerErros(100), aoPedirCodigo);

  return (
    <div className="ad-painel">
      <Secao
        titulo={t('Erros recentes')}
        sub={t('De hoje e de ontem, os mais novos primeiro. Inclui os erros que o app do usuário reporta.')}
        acoes={<Botao aoClicar={diario.recarregar}>{t('Atualizar')}</Botao>}
      >
        <Estado
          carga={diario}
          estaVazio={(d) => d.erros.length === 0 && !desligado(d.diario)}
          vazio={{
            icone: <CircleCheck aria-hidden />,
            titulo: t('Nenhum erro registrado'),
            explicacao: t('Nada quebrou hoje nem ontem.'),
          }}
        >
          {(d) =>
            desligado(d.diario) ? (
              <Aviso
                icone={<CircleAlert aria-hidden />}
                titulo={t('O diário de erros está desligado')}
                explicacao={d.diario}
              />
            ) : (
              <>
                <p className="ad-nota">{t('Diário: {onde}', { onde: d.diario })}</p>
                <Tabela rotulo={t('Erros recentes')} colunas={[t('Quando'), t('Evento'), t('Erro'), t('Pedido')]}>
                  {d.erros.map((e, i) => (
                    <tr key={`${String(e.ts ?? i)}-${i}`}>
                      <td data-rotulo={t('Quando')}>{typeof e.ts === 'number' ? dataHora(e.ts) : '—'}</td>
                      <td data-rotulo={t('Evento')}>{texto(e.event ?? e.bruto, 80) || '—'}</td>
                      <td data-rotulo={t('Erro')}>
                        {texto(e.error, 200) || '—'}
                        {typeof e.stack === 'string' && (
                          <details className="ad-detalhes">
                            <summary>{t('Ver o rastro')}</summary>
                            <pre>{texto(e.stack, 2000)}</pre>
                          </details>
                        )}
                      </td>
                      <td data-rotulo={t('Pedido')}>
                        {e.requestId ? <code className="ad-id">{texto(e.requestId, 64)}</code> : '—'}
                      </td>
                    </tr>
                  ))}
                </Tabela>
              </>
            )
          }
        </Estado>
      </Secao>
    </div>
  );
}
