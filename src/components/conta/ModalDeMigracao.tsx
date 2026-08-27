/**
 * O MODAL DA MIGRAÇÃO — visível, não silencioso: diz o que vai subir, pede confirmação, mostra o
 * progresso e o resultado (inclusive o que NÃO subiu e por quê).
 */
import { useEffect, useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { inventarioLocal, migrarParaConta, type InventarioLocal, type ProgressoDaMigracao, type RelatorioDeMigracao } from '../../data/migracao';

interface ModalDeMigracaoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Chamado quando algo subiu — o App recarrega a lista de sessões. */
  onMigrou: () => void;
}

type Fase = 'inventario' | 'migrando' | 'resultado';

export default function ModalDeMigracao({ aberto, onFechar, onMigrou }: ModalDeMigracaoProps) {
  const [fase, setFase] = useState<Fase>('inventario');
  const [inventario, setInventario] = useState<InventarioLocal | null>(null);
  const [progresso, setProgresso] = useState<ProgressoDaMigracao | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDeMigracao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setFase('inventario'); setRelatorio(null); setErro(null); setProgresso(null);
    inventarioLocal().then(setInventario).catch(() => setInventario(null));
  }, [aberto]);

  if (!aberto) return null;

  const migrar = async () => {
    setFase('migrando'); setErro(null);
    try {
      const r = await migrarParaConta(setProgresso);
      setRelatorio(r);
      if (r.sessoes + r.jaExistiam + r.cartoes > 0) onMigrou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setFase('resultado');
    }
  };

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
                  ? <>Encontrei <strong>{inventario.sessoes}</strong> {inventario.sessoes === 1 ? 'sessão' : 'sessões'} ({inventario.comAudio} com áudio) e <strong>{inventario.cartoes}</strong> {inventario.cartoes === 1 ? 'cartão' : 'cartões'}.{inventario.rodadas > 0 && <> As {inventario.rodadas} rodadas jogadas sem conta <strong>não</strong> sobem nesta versão.</>}</>
                  : 'Conferindo o que há neste navegador…'}
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
