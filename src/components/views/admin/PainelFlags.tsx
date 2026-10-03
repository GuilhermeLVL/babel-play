import { Flag as IconeDeFlag } from 'lucide-react';
import { useState } from 'react';

import { alterarFlag, type Flag, listarFlags } from '../../../lib/admin';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { toast } from '../../Toast';
import { Interruptor } from '../ajustes/Linha';
import { agir } from './agir';
import { dataHora } from './formatar';
import { Estado, Etiqueta, Secao } from './pecas';
import { useCarga } from './useCarga';

/**
 * As flags que mexem com DINHEIRO ou com IA de nuvem (a que gasta com custo, a que abre a venda). Ligar
 * ou desligar uma delas pede confirmação; as demais viram na hora, e voltam do mesmo jeito.
 */
const FLAGS_SENSIVEIS = new Set([
  'vender_planos',
  'oferta_planos',
  'modo_convidado',
  'nuvem_convidado',
  'nuvem_gratuita_alivio',
  'voz_natural',
]);

/** As regras da flag em palavras curtas, para ver de relance quem ela alcança. */
function regrasEmFrases(f: Flag): string[] {
  const r = f.regras ?? {};
  const frases: string[] = [];
  if (r.planos?.length) frases.push(t('planos: {lista}', { lista: r.planos.join(', ') }));
  if (typeof r.percentual === 'number') frases.push(t('{n}% das pessoas', { n: r.percentual }));
  if (r.ids?.length) frases.push(t('{n} contas na lista', { n: r.ids.length }));
  if (r.idiomas?.length) frases.push(t('idiomas: {lista}', { lista: r.idiomas.join(', ') }));
  if (r.versaoMinima) frases.push(t('versão {v} ou mais nova', { v: r.versaoMinima }));
  return frases;
}

/** Flags: liga e desliga cada recurso remoto. Só o interruptor `habilitada` muda; as regras ficam como estão. */
export default function PainelFlags({ aoPedirCodigo }: { aoPedirCodigo: () => void }) {
  const questNovo = useQuestNovo();
  const flags = useCarga(listarFlags, aoPedirCodigo);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const trocar = async (f: Flag, ligar: boolean) => {
    const sensivel = FLAGS_SENSIVEIS.has(f.chave);
    setOcupada(f.chave);
    try {
      const pedido = {
        sucesso: ligar ? t('{chave} ligada.', { chave: f.chave }) : t('{chave} desligada.', { chave: f.chave }),
        fazer: () => alterarFlag(f.chave, ligar),
        aoPedirCodigo,
        depois: flags.recarregar,
      };
      if (sensivel) {
        await agir({
          ...pedido,
          confirmacao: {
            title: ligar ? t('Ligar {chave}?', { chave: f.chave }) : t('Desligar {chave}?', { chave: f.chave }),
            detail: `${f.descricao} ${t('Mexe com dinheiro ou com o gasto de IA, e vale para todo mundo em poucos minutos.')}`,
            confirmLabel: ligar ? t('Ligar') : t('Desligar'),
            danger: !ligar,
          },
        });
      } else {
        const r = await pedido.fazer();
        if (r.ok) {
          pedido.depois();
        } else if (r.segundoFator) {
          aoPedirCodigo();
        } else {
          toast.error(r.erro);
        }
      }
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="ad-painel">
      <Secao
        titulo={t('Flags')}
        sub={t(
          'Ligam e desligam recursos sem publicar uma versão nova. O interruptor muda só o "ligada"; as regras de quem recebe ficam como estão.',
        )}
      >
        <Estado
          carga={flags}
          estaVazio={(l) => l.length === 0}
          vazio={{
            icone: <IconeDeFlag aria-hidden />,
            titulo: t('Nenhuma flag cadastrada'),
            explicacao: t('As flags nascem na migração do banco. Sem elas, os recursos seguem o padrão do código.'),
          }}
        >
          {(lista) => (
            <ul className="ad-flags">
              {lista.map((f) => {
                const regras = regrasEmFrases(f);
                const interruptor = questNovo ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f.habilitada}
                    aria-label={f.chave}
                    className="q-interruptor"
                    disabled={ocupada !== null}
                    onClick={() => void trocar(f, !f.habilitada)}
                  />
                ) : (
                  <Interruptor
                    ligado={f.habilitada}
                    rotulo={f.chave}
                    desabilitado={ocupada !== null}
                    aoTrocar={(ligar) => void trocar(f, ligar)}
                  />
                );
                return (
                  <li key={f.chave} className={questNovo ? 'q-ajuste ad-flag' : 'ad-flag'}>
                    <div>
                      <b>
                        <code>{f.chave}</code>{' '}
                        {FLAGS_SENSIVEIS.has(f.chave) && <Etiqueta tom="atencao">{t('dinheiro ou IA')}</Etiqueta>}
                      </b>
                      <small>{f.descricao}</small>
                      <small className="ad-nota">
                        {regras.length ? regras.join(' · ') : t('sem regras: vale para todos')} ·{' '}
                        {t('mexida em {quando}', { quando: dataHora(f.atualizadoEm) })}
                      </small>
                    </div>
                    {interruptor}
                  </li>
                );
              })}
            </ul>
          )}
        </Estado>
      </Secao>
    </div>
  );
}
