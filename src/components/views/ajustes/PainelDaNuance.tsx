import { Lock, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { EntradaDoGlossario, FalhaDaNuance } from '../../../data/apiDaNuance';
import { getEntitlements } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { type PreferenciasDaNuance, salvarPreferencias, usePreferencias } from '../../../lib/preferencias';
import { toast } from '../../Toast';

type Lista =
  | { estado: 'carregando' }
  | { estado: 'ok'; entradas: EntradaDoGlossario[]; limite: number }
  | { estado: 'erro'; motivo: FalhaDaNuance };

/**
 * O PAINEL "TRADUÇÃO NUANCE" (D6 da Fase D) — Ajustes → Idiomas, carregado por `lazy()`.
 *
 * Três coisas, todas da Tradução Nuance: o REGISTRO padrão (o que a tradução usa quando a pessoa não
 * escolhe Formal/Informal na hora), a VARIANTE do português e do espanhol, e o GLOSSÁRIO pessoal
 * (listar e apagar — gravar é na folha da palavra e nas "Outras formas").
 *
 * SEM A CAPACIDADE: as escolhas aparecem desligadas, com cadeado e o texto positivo, e o convite fora
 * do perfil protegido. O glossário continua listado e apagável: é dado da pessoa (LGPD), e quem deixou
 * de pagar tem de poder ver e apagar o que guardou.
 */
export default function PainelDaNuance({ aoConhecer }: { aoConhecer?: () => void }) {
  const disponivel = getEntitlements().traducaoNuance;
  const { nuance } = usePreferencias();
  const [lista, setLista] = useState<Lista>({ estado: 'carregando' });

  useEffect(() => {
    let vivo = true;
    void import('../../../data/apiDaNuance')
      .then(({ listarGlossario }) => listarGlossario())
      .then((r) => {
        if (!vivo) return;
        setLista(r.ok === false ? { estado: 'erro', motivo: r.motivo } : { estado: 'ok', ...r.valor });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const mudar = (fn: (n: PreferenciasDaNuance) => PreferenciasDaNuance) => {
    void salvarPreferencias((p) => ({ ...p, nuance: fn(p.nuance) })).then(
      (ok) => ok || toast.warn(t('Não deu para salvar agora.')),
    );
  };

  const apagar = async (e: EntradaDoGlossario) => {
    const { apagarDoGlossario } = await import('../../../data/apiDaNuance');
    const r = await apagarDoGlossario(e.id);
    if (r.ok === false && r.status !== 404) {
      toast.warn(t('Não deu para apagar agora. Tente de novo em instantes.'));
      return;
    }
    setLista((l) => (l.estado === 'ok' ? { ...l, entradas: l.entradas.filter((x) => x.id !== e.id) } : l));
  };

  /* QUEST: as mesmas três escolhas e o mesmo glossário, em linhas de um controle só. */
  const escolha = <T extends string>(
    rotulo: string,
    atual: T,
    opcoes: Array<[T, string]>,
    aoEscolher: (v: T) => void,
  ) => (
    <div className="q-abas q-seg" role="group" aria-label={rotulo}>
      {opcoes.map(([id, nome]) => (
        <button
          key={id}
          type="button"
          className="q-aba"
          disabled={!disponivel}
          aria-pressed={atual === id}
          onClick={() => aoEscolher(id)}
        >
          {nome}
        </button>
      ))}
    </div>
  );
  return (
    <section className="q-secao" data-testid="painel-da-nuance">
      <header>
        <div>
          <h2>{t('Tradução Nuance')}</h2>
        </div>
      </header>
      {!disponivel && (
        <div className="q-aviso" role="note" data-testid="convite-da-nuance">
          <span>
            <Lock aria-hidden />{' '}
            {t(
              'Registro, variantes e glossário são da Tradução Nuance do Premium. Sua legenda já usa a Tradução rápida ao vivo.',
            )}
          </span>
          {aoConhecer && (
            <button type="button" className="q-ctl" onClick={aoConhecer}>
              {t('Conhecer o Premium')}
            </button>
          )}
        </div>
      )}
      <div className="q-ajustes">
        <div className="q-ajuste">
          <div>
            <b>{t('Registro padrão')}</b>
            <small>{t('Como a Tradução Nuance trata as pessoas quando você não escolhe na hora.')}</small>
          </div>
          {escolha(
            t('Registro padrão'),
            nuance.registro,
            [
              ['automatico', t('Automático')],
              ['formal', t('Formal')],
              ['informal', t('Informal')],
            ],
            (registro) => mudar((n) => ({ ...n, registro })),
          )}
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Português')}</b>
            <small>{t('A variante das traduções para o português.')}</small>
          </div>
          {escolha(
            t('Variante do português'),
            nuance.variantes.pt,
            [
              ['pt-BR', t('Brasil')],
              ['pt-PT', t('Portugal')],
            ],
            (pt) => mudar((n) => ({ ...n, variantes: { ...n.variantes, pt } })),
          )}
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Espanhol')}</b>
            <small>{t('A variante das traduções para o espanhol.')}</small>
          </div>
          {escolha(
            t('Variante do espanhol'),
            nuance.variantes.es,
            [
              ['es-419', t('América Latina')],
              ['es-ES', t('Espanha')],
            ],
            (es) => mudar((n) => ({ ...n, variantes: { ...n.variantes, es } })),
          )}
        </div>
      </div>

      <div className="q-cartao" data-testid="glossario-pessoal">
        <h3>{t('Glossário pessoal')}</h3>
        {lista.estado === 'carregando' && (
          <div role="status" aria-label={t('Carregando o glossário…')}>
            <div className="q-aju-espera" />
          </div>
        )}
        {lista.estado === 'erro' && (
          <p className="q-aju-nota" role="status">
            {lista.motivo === 'sem_conta'
              ? t('Entre na sua conta para ver o seu glossário.')
              : t('Não deu para carregar o glossário agora.')}
          </p>
        )}
        {lista.estado === 'ok' && (
          <>
            <p className="q-aju-nota">
              {t('As traduções que você fixou com "Sempre traduzir assim": {n} de {limite}.', {
                n: lista.entradas.length,
                limite: lista.limite,
              })}
            </p>
            {lista.entradas.length === 0 ? (
              <p className="q-aju-nota">
                {t('Nenhuma tradução fixada ainda. Toque numa palavra da legenda e escolha "Sempre traduzir assim".')}
              </p>
            ) : (
              <ul className="q-aju-itens">
                {lista.entradas.map((e) => (
                  <li key={e.id}>
                    <span>
                      <b>{e.termo}</b> → {e.traducao}{' '}
                      <small>
                        ({e.origem} → {e.destino})
                      </small>
                    </span>
                    <button
                      type="button"
                      className="q-ctl perigo"
                      aria-label={t('Apagar "{termo}" do glossário', { termo: e.termo })}
                      onClick={() => void apagar(e)}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
