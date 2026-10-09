/**
 * O MODAL DA MIGRAÇÃO — visível, não silencioso: diz o que vai subir, pede confirmação, mostra o
 * progresso e o resultado (inclusive o que NÃO subiu e por quê).
 */
import '../../styles/questConta.css';

import { CloudUpload, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { InventarioLocal, ProgressoDaMigracao, RelatorioDeMigracao } from '../../data/migracao';
import { t, tp } from '../../lib/i18n';
import { T } from '../../lib/T';

interface ModalDeMigracaoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Chamado quando algo subiu — o App recarrega a lista de sessões. */
  onMigrou: () => void;
}

type Fase = 'inventario' | 'migrando' | 'resultado';

/* A migração (e o `idb` do modo sem conta que ela lê) só desce quando o modal ABRE — ele fica
   montado no App o tempo todo, fechado, e antes arrastava esse código para o chunk de entrada. */
const migracao = () => import('../../data/migracao');

export default function ModalDeMigracao({ aberto, onFechar, onMigrou }: ModalDeMigracaoProps) {
  const [fase, setFase] = useState<Fase>('inventario');
  const [inventario, setInventario] = useState<InventarioLocal | null>(null);
  const [progresso, setProgresso] = useState<ProgressoDaMigracao | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDeMigracao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setFase('inventario');
    setRelatorio(null);
    setErro(null);
    setProgresso(null);
    migracao()
      .then((m) => m.inventarioLocal())
      .then(setInventario)
      .catch(() => setInventario(null));
  }, [aberto]);

  if (!aberto) return null;

  const migrar = async () => {
    setFase('migrando');
    setErro(null);
    try {
      const r = await (await migracao()).migrarParaConta(setProgresso);
      setRelatorio(r);
      if (r.sessoes + r.jaExistiam + r.cartoes > 0) onMigrou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setFase('resultado');
    }
  };

  /* QUEST: o mesmo modal nas três fases (o que há, subindo, o que subiu e o que não subiu), no centro
     e com alvos de 60 px. Enquanto sobe não há como fechar, como na tela de sempre. */
  return (
    <div className="qc-fundo" data-testid="migracao-do-quest">
      <div role="dialog" aria-modal="true" aria-labelledby="migracao-titulo" className="qc-caixa">
        <div className="qc-caixa-cab">
          <span className="q-ic" aria-hidden>
            <CloudUpload />
          </span>
          <div>
            <h2 id="migracao-titulo">{t('Guardar na sua conta o que ficou neste navegador')}</h2>
          </div>
          {fase !== 'migrando' && (
            <button type="button" className="qc-fechar" aria-label={t('Fechar')} onClick={onFechar}>
              <X aria-hidden />
            </button>
          )}
        </div>

        {fase === 'inventario' && (
          <div className="qc-caixa-texto">
            {inventario ? (
              <>
                <p>
                  <T
                    txt="Encontrei <b>{n}</b> {sessoes} ({audio} com áudio) e <b>{m}</b> {cartoes}."
                    val={{
                      n: inventario.sessoes,
                      sessoes: tp(inventario.sessoes, 'sessão', 'sessões'),
                      audio: inventario.comAudio,
                      m: inventario.cartoes,
                      cartoes: tp(inventario.cartoes, 'cartão', 'cartões'),
                    }}
                  />
                </p>
                {inventario.rodadas > 0 && (
                  <p>
                    <T
                      txt="As {n} rodadas jogadas sem conta <b>não</b> sobem nesta versão."
                      val={{ n: inventario.rodadas }}
                    />
                  </p>
                )}
              </>
            ) : (
              <p role="status">{t('Conferindo o que há neste navegador…')}</p>
            )}
          </div>
        )}

        {fase === 'migrando' && (
          <div className="qc-espera" role="status" aria-live="polite">
            <LoaderCircle aria-hidden />
            <span>
              {progresso
                ? t('Subindo {n} de {total}', {
                    n: Math.min(progresso.feitas + 1, progresso.total),
                    total: progresso.total,
                  })
                : t('Subindo…')}
              {progresso?.atual ? `, ${progresso.atual}` : ''}
            </span>
          </div>
        )}

        {fase === 'resultado' && relatorio && (
          <div className="qc-caixa-texto" role="status">
            <p>
              <T
                txt="Subiram <b>{sessoes}</b> sessões novas, {audios} áudios e {cartoes} cartões."
                val={{ sessoes: relatorio.sessoes, audios: relatorio.audios, cartoes: relatorio.cartoes }}
              />
              {relatorio.jaExistiam > 0 && <> {t('({n} já estavam na conta)', { n: relatorio.jaExistiam })}</>}
            </p>
            {relatorio.audiosPendentes > 0 && (
              <p className="qc-atencao-texto">
                {t('{n} áudio(s) não couberam no seu plano e continuam só neste navegador.', {
                  n: relatorio.audiosPendentes,
                })}
              </p>
            )}
            {relatorio.falhas.length > 0 && (
              <p className="qc-erro-texto">
                {t('{n} sessão(ões) não subiram e continuam aqui; tentarei de novo na próxima vez que você entrar.', {
                  n: relatorio.falhas.length,
                })}
              </p>
            )}
          </div>
        )}
        {fase === 'resultado' && erro && (
          <p className="qc-erro" role="alert">
            <X aria-hidden />
            <span>{t('Não consegui migrar: {erro}', { erro })}</span>
          </p>
        )}

        <div className="qc-caixa-acoes">
          {fase === 'inventario' && (
            <>
              <button type="button" className="q-ctl pri" onClick={migrar} disabled={!inventario}>
                {t('Guardar na conta')}
              </button>
              <button type="button" className="q-ctl" onClick={onFechar}>
                {t('Agora não')}
              </button>
            </>
          )}
          {fase === 'resultado' && (
            <button type="button" className="q-ctl pri" onClick={onFechar}>
              {t('Fechar')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
