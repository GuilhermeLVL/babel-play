import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { exportarConta, type ResultadoDaExclusao } from '../../../data/api';
import { t } from '../../../lib/i18n';
import { authRequired } from '../../../lib/supabase';

/**
 * SEUS DADOS — portabilidade (LGPD art. 18, V), na forma do protótipo aprovado: onde ficam e
 * "Baixar uma cópia" (`GET /api/me/exportar`).
 *
 * A EXCLUSÃO (art. 18, VI) mudou para Ajustes → Conta, onde o protótipo a desenha: a zona de perigo
 * abre o diálogo que pede a palavra digitada e chama `DELETE /api/me`. O relatório do que a exclusão
 * fez (e do que não conseguiu fazer) continua aqui, em `RelatorioDaExclusao`, e é o diálogo que o usa.
 */

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

export default function AbaDados() {
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState('');

  async function baixar() {
    setExportando(true);
    setErroExport('');
    const ok = await baixarMeusDados();
    setExportando(false);
    if (!ok) setErroExport(t('Não consegui gerar o arquivo agora. Tente de novo em instantes.'));
  }

  /* QUEST: as mesmas duas linhas (onde ficam, baixar uma cópia) e o mesmo erro, nas peças do headset. */
  return (
    <section className="q-secao">
      <header>
        <div>
          <h2>{t('Seus dados')}</h2>
          <p>{t('O que o app guarda sobre você, e como levar uma cópia.')}</p>
        </div>
      </header>
      <div className="qc-pilha">
        {!authRequired && (
          <div className="q-ajuste">
            <div>
              <b>{t('Onde ficam')}</b>
              <small>
                {t(
                  'Este app está rodando no seu computador, sem login. Não há senha nem sessão para gerenciar: seus dados ficam neste dispositivo.',
                )}
              </small>
            </div>
          </div>
        )}
        <div className="q-ajuste">
          <div>
            <b>{t('Baixar uma cópia')}</b>
            <small>{t('Tudo o que o app guarda sobre você.')}</small>
          </div>
          <button type="button" className="q-ctl" onClick={() => void baixar()} disabled={exportando}>
            {exportando ? <Loader2 className="qc-gira" aria-hidden /> : <Download aria-hidden />}{' '}
            {exportando ? t('Preparando…') : t('Baixar')}
          </button>
        </div>
      </div>
      {erroExport && (
        <p className="qc-erro" role="alert">
          <AlertTriangle aria-hidden />
          <span>{erroExport}</span>
        </p>
      )}
    </section>
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
