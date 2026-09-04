import { useState } from 'react';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';
import { exportarConta, excluirConta, type ResultadoDaExclusao } from '../../../data/api';

/**
 * SEUS DADOS — portabilidade e exclusão (LGPD art. 18, incisos V e VI).
 *
 * Esta aba é a ponte que faltava. `GET /api/me/exportar` e `DELETE /api/me` existiam desde a
 * auditoria, completos, com rate-limit dedicado em `server.ts` — e NENHUMA tela os chamava. A
 * obrigação legal estava implementada e inalcançável pelo titular, que é o mesmo que não existir.
 *
 * A EXCLUSÃO PEDE A PALAVRA DIGITADA, não um "tem certeza?". Um segundo clique é reflexo; digitar
 * EXCLUIR é intenção. O botão é o único ponto do app que apaga tudo de uma vez e não tem desfazer.
 *
 * O RELATÓRIO DE FALHA É MOSTRADO, não engolido. O servidor foi escrito para dizer o que NÃO
 * aconteceu — arquivo de mídia que resistiu, vínculo de login que sobreviveu às linhas (o caso
 * sem `SUPABASE_SERVICE_ROLE_KEY`) — e essa honestidade só serve para alguma coisa se chegar à
 * tela. Uma exclusão parcial anunciada como sucesso é pior que um erro claro.
 */

type Estado = 'parado' | 'exportando' | 'excluindo';

const PALAVRA = 'EXCLUIR';

export default function AbaDados() {
  const [estado, setEstado] = useState<Estado>('parado');
  const [erroExport, setErroExport] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [resultado, setResultado] = useState<ResultadoDaExclusao | null>(null);

  async function baixar() {
    setEstado('exportando');
    setErroExport('');
    const blob = await exportarConta();
    setEstado('parado');
    if (!blob) {
      setErroExport('Não consegui gerar o arquivo agora. Tente de novo em instantes.');
      return;
    }
    /* A rota exige o header de autenticação, então não dá para apontar um link direto para ela:
       o blob é materializado aqui e o object URL é revogado logo depois de disparar o download. */
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meus-dados.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function excluir() {
    setEstado('excluindo');
    const r = await excluirConta();
    setResultado(r);
    setEstado('parado');
    setConfirmacao('');
  }

  const podeExcluir = confirmacao.trim().toUpperCase() === PALAVRA && estado === 'parado';

  return (
    <div className="flex flex-col gap-8">

      {/* ── PORTABILIDADE ─────────────────────────────────────────────────────────────── */}
      <section className="card-panel p-5">
        <div className="flex items-center gap-2 mb-2 text-ink">
          <Download className="w-5 h-5" aria-hidden />
          <h2 className="font-display font-bold text-lg">Baixar os seus dados</h2>
        </div>
        <p className="text-[13px] text-ink-muted leading-relaxed max-w-[62ch] mb-4">
          Um arquivo JSON com tudo o que guardamos sobre você: perfil, sessões, transcrições,
          vocabulário e histórico de revisão. Os áudios entram como <strong>nomes de arquivo</strong> —
          o som em si continua sendo baixado sessão a sessão. Chaves de API saem apenas como
          registro de que existem, <strong>nunca o valor</strong>.
        </p>
        <button
          type="button"
          onClick={baixar}
          disabled={estado !== 'parado'}
          className="btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {estado === 'exportando'
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Preparando…</>
            : <><Download className="w-4 h-4" aria-hidden /> Baixar meus dados</>}
        </button>
        {erroExport && (
          <p role="alert" className="mt-3 text-[12.5px] text-error-ink">{erroExport}</p>
        )}
      </section>

      {/* ── EXCLUSÃO ──────────────────────────────────────────────────────────────────── */}
      <section className="card-panel p-5 border-error-soft">
        <div className="flex items-center gap-2 mb-2 text-ink">
          <Trash2 className="w-5 h-5 text-error" aria-hidden />
          <h2 className="font-display font-bold text-lg">Excluir a conta</h2>
        </div>
        <p className="text-[13px] text-ink-muted leading-relaxed max-w-[62ch] mb-4">
          Apaga o perfil, as sessões, as transcrições, o vocabulário, o progresso e os arquivos de
          áudio. <strong className="text-ink">Não há como desfazer</strong> e não guardamos cópia.
          Se quiser ficar com o seu histórico, baixe os dados acima antes.
        </p>

        {!resultado && (
          <>
            <label className="block text-[12.5px] text-ink-muted mb-2" htmlFor="confirmar-exclusao">
              Para confirmar, digite <strong className="text-ink font-mono">{PALAVRA}</strong>:
            </label>
            <input
              id="confirmar-exclusao"
              type="text"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full max-w-[24ch] mb-4 font-mono"
              placeholder={PALAVRA}
            />
            <div>
              <button
                type="button"
                onClick={excluir}
                disabled={!podeExcluir}
                className="btn-outline border-error text-error-ink hover:border-error disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {estado === 'excluindo'
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Excluindo…</>
                  : <><Trash2 className="w-4 h-4" aria-hidden /> Excluir a minha conta</>}
              </button>
            </div>
          </>
        )}

        {resultado && <RelatorioDaExclusao resultado={resultado} />}
      </section>
    </div>
  );
}

/**
 * O QUE ACONTECEU DE VERDADE. O servidor responde 500 com o corpo cheio quando a exclusão sai
 * pela metade; repassar só "deu erro" jogaria fora justamente a informação que o titular precisa.
 */
function RelatorioDaExclusao({ resultado }: { resultado: ResultadoDaExclusao }) {
  const tabelas = Object.entries(resultado.linhasPorTabela ?? {}).filter(([, n]) => n > 0);
  const falhas = resultado.arquivos?.falhas ?? [];
  const parcial = !resultado.ok || falhas.length > 0 || resultado.login?.desvinculado === false;

  return (
    <div role="status" className="flex flex-col gap-3">
      <div className={`flex items-start gap-2 ${parcial ? 'text-warn-ink' : 'text-good-ink'}`}>
        {parcial && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[13px] font-bold">
          {parcial ? 'A conta foi excluída, mas nem tudo saiu' : 'Conta excluída.'}
        </p>
      </div>

      {resultado.error && (
        <p className="text-[12.5px] text-ink-muted">{resultado.error}</p>
      )}

      {resultado.login?.aviso && (
        <p className="text-[12.5px] text-warn-ink bg-warn-soft border border-warn-soft rounded-lg p-3">
          {resultado.login.aviso}
        </p>
      )}

      {tabelas.length > 0 && (
        <div>
          <div className="label-mono mb-1.5">O que foi apagado</div>
          <ul className="text-[12.5px] text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
            {tabelas.map(([nome, n]) => (
              <li key={nome}><span className="font-mono text-ink">{n}</span> em {nome}</li>
            ))}
          </ul>
        </div>
      )}

      {falhas.length > 0 && (
        <div>
          <div className="label-mono mb-1.5 text-warn-ink">Arquivos que resistiram</div>
          <ul className="text-[12px] text-ink-muted font-mono flex flex-col gap-1">
            {falhas.map((f) => <li key={f.arquivo}>{f.arquivo} — {f.erro}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
