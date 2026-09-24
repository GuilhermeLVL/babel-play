import { AlertTriangle, Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { excluirConta, exportarConta, type ResultadoDaExclusao } from '../../../data/api';
import { authRequired } from '../../../lib/supabase';
import { TituloDeSecao } from '../../ui';

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

/**
 * Baixa a cópia dos dados (`GET /api/me/exportar`) como `meus-dados.json`. Devolve `false` se o
 * servidor não gerou o arquivo. Usada aqui e em Ajustes → Privacidade — a mesma rota, um caminho só.
 */
export async function baixarMeusDados(): Promise<boolean> {
  const copia = await prepararCopia('json');
  if (!copia) return false;
  baixarArquivo(copia.blob, 'meus-dados.json');
  return true;
}

/** Dispara o download de um blob já materializado. */
export function baixarArquivo(blob: Blob, nome: string): void {
  /* A rota exige o header de autenticação, então não dá para apontar um link direto para ela:
     o blob é materializado e o object URL é revogado logo depois de disparar o download. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const celulaCsv = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A MESMA exportação (`GET /api/me/exportar`) em CSV. As tabelas têm colunas diferentes, então o
 * CSV vai no formato longo — `tabela,linha,campo,valor`, uma linha por campo — que qualquer planilha
 * abre e filtra sem perder nada do JSON.
 */
export function exportacaoEmCsv(json: unknown): string {
  const linhas: string[] = ['tabela,linha,campo,valor'];
  const exp = (json ?? {}) as { usuario?: unknown; dados?: Record<string, unknown> };
  const empilhar = (tabela: string, i: number, obj: unknown) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>))
        linhas.push([tabela, i, k, v].map(celulaCsv).join(','));
    } else linhas.push([tabela, i, 'valor', obj].map(celulaCsv).join(','));
  };
  if (exp.usuario) empilhar('usuario', 0, exp.usuario);
  for (const [tabela, itens] of Object.entries(exp.dados ?? {})) {
    if (Array.isArray(itens)) itens.forEach((it, i) => empilhar(tabela, i, it));
  }
  return linhas.join('\n');
}

/** Pede a cópia ao servidor e a devolve no formato escolhido. `null` = o servidor não gerou. */
export async function prepararCopia(formato: 'json' | 'csv'): Promise<{ blob: Blob; nome: string } | null> {
  const blob = await exportarConta();
  if (!blob) return null;
  if (formato === 'json') return { blob, nome: 'babel-play-dados.json' };
  try {
    const csv = exportacaoEmCsv(JSON.parse(await blob.text()));
    return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), nome: 'babel-play-dados.csv' };
  } catch {
    return null;
  }
}

const PALAVRA = 'EXCLUIR';

export default function AbaDados() {
  const [estado, setEstado] = useState<Estado>('parado');
  const [erroExport, setErroExport] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [resultado, setResultado] = useState<ResultadoDaExclusao | null>(null);

  async function baixar() {
    setEstado('exportando');
    setErroExport('');
    const ok = await baixarMeusDados();
    setEstado('parado');
    if (!ok) setErroExport('Não consegui gerar o arquivo agora. Tente de novo em instantes.');
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
    <>
      {/* ── ONDE FICAM E PORTABILIDADE ── marcação do protótipo (`.cartao` com linhas `.ajuste`). */}
      <section>
        <TituloDeSecao icone={ShieldCheck} titulo="Seus dados" />
        <div className="cartao">
          {/* Sem login, é isto que responde "e a minha conta?": não há senha nem sessão. */}
          {!authRequired && (
            <div className="ajuste">
              <h3>Onde ficam</h3>
              <p className="mut" style={{ margin: 0 }}>
                Este app está rodando no seu computador, sem login. Não há senha nem sessão para gerenciar: seus dados
                ficam neste dispositivo.
              </p>
            </div>
          )}
          <div className="ajuste ajuste-l">
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3>Baixar uma cópia</h3>
              <p className="mut">
                Tudo o que o app guarda sobre você, num arquivo JSON. Chaves de API saem só como registro de que
                existem, nunca o valor.
              </p>
            </div>
            <button type="button" onClick={baixar} disabled={estado !== 'parado'} className="btn btn-outline">
              {estado === 'exportando' ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> Preparando…
                </>
              ) : (
                <>
                  <Download aria-hidden /> Baixar
                </>
              )}
            </button>
          </div>
        </div>
        {erroExport && (
          <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--error-ink)' }}>
            {erroExport}
          </p>
        )}
      </section>

      {/* ── EXCLUSÃO ── na `.zona-perigo` do protótipo; a confirmação continua sendo a palavra digitada. */}
      <section className="secao zona-perigo">
        <div style={{ flex: 1, minWidth: 240 }}>
          <b>Excluir a conta</b>
          <p className="mut">
            Apaga o perfil, as sessões, as transcrições, o vocabulário, o progresso e os arquivos de áudio. Não há como
            desfazer e não guardamos cópia. Se quiser ficar com o seu histórico, baixe os dados acima antes.
          </p>
          {!resultado && (
            <div className="form-l" style={{ marginTop: 12, marginBottom: 0, maxWidth: '24ch' }}>
              <label htmlFor="confirmar-exclusao" style={{ fontWeight: 500, fontSize: 12.5 }}>
                Para confirmar, digite <b style={{ fontFamily: 'var(--font-mono)' }}>{PALAVRA}</b>:
              </label>
              <input
                id="confirmar-exclusao"
                type="text"
                className="campo"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{ fontFamily: 'var(--font-mono)' }}
                placeholder={PALAVRA}
              />
            </div>
          )}
          {resultado && (
            <div style={{ marginTop: 12 }}>
              <RelatorioDaExclusao resultado={resultado} />
            </div>
          )}
        </div>
        {!resultado && (
          <button type="button" onClick={excluir} disabled={!podeExcluir} className="btn btn-outline perigo">
            {estado === 'excluindo' ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Excluindo…
              </>
            ) : (
              <>
                <Trash2 aria-hidden /> Excluir a conta
              </>
            )}
          </button>
        )}
      </section>
    </>
  );
}

/**
 * O QUE ACONTECEU DE VERDADE. O servidor responde 500 com o corpo cheio quando a exclusão sai
 * pela metade; repassar só "deu erro" jogaria fora justamente a informação que o titular precisa.
 */
export function RelatorioDaExclusao({ resultado }: { resultado: ResultadoDaExclusao }) {
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

      {resultado.error && <p className="text-[12.5px] text-ink-muted">{resultado.error}</p>}

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
              <li key={nome}>
                <span className="font-mono text-ink">{n}</span> em {nome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {falhas.length > 0 && (
        <div>
          <div className="label-mono mb-1.5 text-warn-ink">Arquivos que resistiram</div>
          <ul className="text-[12px] text-ink-muted font-mono flex flex-col gap-1">
            {falhas.map((f) => (
              <li key={f.arquivo}>
                {f.arquivo} — {f.erro}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
