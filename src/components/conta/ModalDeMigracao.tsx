/**
 * O MODAL DA MIGRAÇÃO — visível, não silencioso: diz o que vai subir, pede confirmação, mostra o
 * progresso e o resultado (inclusive o que NÃO subiu e por quê).
 */
import '../../styles/questConta.css';

import { CloudUpload, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { InventarioLocal, ProgressoDaMigracao, RelatorioDeMigracao } from '../../data/migracao';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
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
  const questNovo = useQuestNovo();

  useEffect(() => {
    if (!aberto) return;
    setFase('inventario'); setRelatorio(null); setErro(null); setProgresso(null);
    migracao().then((m) => m.inventarioLocal()).then(setInventario).catch(() => setInventario(null));
  }, [aberto]);

  if (!aberto) return null;

  const migrar = async () => {
    setFase('migrando'); setErro(null);
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
  if (questNovo)
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
                  {t(
                    '{n} sessão(ões) não subiram e continuam aqui; tentarei de novo na próxima vez que você entrar.',
                    { n: relatorio.falhas.length },
                  )}
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="migracao-titulo" className="card-panel bg-surface w-full max-w-md p-6 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-soft text-accent shrink-0">
            <CloudUpload className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="migracao-titulo" className="font-display font-bold text-lg text-ink">Guardar na sua conta o que ficou neste navegador</h2>
            {fase === 'inventario' && (
              <p className="mt-1 text-sm text-ink-muted">
                {inventario
                  ? <>
                      {/* DOIS plurais numa frase só: cada sintagma é resolvido por `tp` (que sabe
                          as formas do idioma) e entra como valor. A moldura continua uma string
                          inteira, então o tradutor move `{n}` e `{sessoes}` para onde o idioma
                          dele pede — que é o ponto de existir `<T>`. */}
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
                      {inventario.rodadas > 0 && (
                        <> <T
                          txt="As {n} rodadas jogadas sem conta <b>não</b> sobem nesta versão."
                          val={{ n: inventario.rodadas }}
                        /></>
                      )}
                    </>
                  : t('Conferindo o que há neste navegador…')}
              </p>
            )}
            {fase === 'migrando' && (
              <p className="mt-1 text-sm text-ink-muted" role="status" aria-live="polite">
                Subindo {progresso ? `${Math.min(progresso.feitas + 1, progresso.total)} de ${progresso.total}` : '…'}{progresso?.atual ? `, ${progresso.atual}` : ''}
              </p>
            )}
            {fase === 'resultado' && relatorio && (
              <div className="mt-1 text-sm text-ink-muted" role="status">
                <p>Subiram <strong>{relatorio.sessoes}</strong> sessões novas{relatorio.jaExistiam > 0 && <> ({relatorio.jaExistiam} já estavam na conta)</>}, {relatorio.audios} áudios e {relatorio.cartoes} cartões.</p>
                {relatorio.audiosPendentes > 0 && <p className="mt-1 text-warn-ink">{relatorio.audiosPendentes} áudio(s) não couberam no seu plano e continuam só neste navegador.</p>}
                {relatorio.falhas.length > 0 && (
                  <p className="mt-1 text-error-ink">{relatorio.falhas.length} sessão(ões) não subiram e continuam aqui; tentarei de novo na próxima vez que você entrar.</p>
                )}
              </div>
            )}
            {fase === 'resultado' && erro && <p className="mt-1 text-sm text-error-ink" role="alert">Não consegui migrar: {erro}</p>}
          </div>
          {fase !== 'migrando' && (
            <button type="button" onClick={onFechar} aria-label="Fechar" className="text-ink-muted hover:text-ink cursor-pointer"><X className="w-4 h-4" aria-hidden /></button>
          )}
        </div>
        <div className="mt-5 grid gap-2">
          {fase === 'inventario' && (
            <>
              <button type="button" onClick={migrar} disabled={!inventario} className="btn-ink w-full justify-center disabled:opacity-60">Guardar na conta</button>
              <button type="button" onClick={onFechar} className="btn-outline w-full justify-center">Agora não</button>
            </>
          )}
          {fase === 'resultado' && <button type="button" onClick={onFechar} className="btn-ink w-full justify-center">Fechar</button>}
        </div>
      </div>
    </div>
  );
}
