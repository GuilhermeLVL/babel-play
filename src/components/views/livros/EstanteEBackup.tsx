import { Archive, Download, Upload } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { colecaoW3C, nomeDeArquivo, paraCsvDePlanilha, paraHtml, paraMarkdown } from '../../../core/leitura/exportar';
import { t } from '../../../lib/i18n';
import { estante } from '../../../lib/livros/armazem';
import {
  criarBackup,
  ErroDeRestauracao,
  lerBackup,
  type PlanoDeRestauracao,
  restaurarBackup,
} from '../../../lib/livros/backup';
import { baixarBlob, baixarCopiaDoLivro } from '../../../lib/livros/copiaDoArquivo';
import { lerMeusLivros, useMeusLivros } from '../../../lib/livros/meusLivros';

interface LivroComNotas {
  livroId: string;
  titulo: string;
  autor?: string;
  n: number;
}

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

function mensagemDoErro(e: unknown): string {
  const motivo = e instanceof ErroDeRestauracao ? e.motivo : 'corrompido';
  switch (motivo) {
    case 'versao-desconhecida':
      return t('Esse backup é de uma versão que este Frasy não conhece. Atualize o Frasy e tente de novo.');
    case 'grande':
      return t('Esse backup é grande demais ou passa dos limites de segurança. Ele não foi restaurado.');
    case 'invalido':
      return t('Esse arquivo não é um backup do Frasy, ou está alterado. Nada foi restaurado.');
    default:
      return t('Não deu para ler esse backup: o arquivo pode estar incompleto ou danificado.');
  }
}

/**
 * "SUA ESTANTE": cópias dos arquivos que a pessoa trouxe, exportação das anotações (Markdown, HTML, CSV, W3C) e
 * backup/restauração da estante em um `.zip`. Tudo no navegador. Aparece embaixo de "Meus livros".
 */
export default function EstanteEBackup() {
  const meus = useMeusLivros();
  const trazidos = meus.filter((l) => l.origem !== 'catalogo' && l.formato && l.formato !== 'web');
  const [comNotas, setComNotas] = useState<LivroComNotas[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [plano, setPlano] = useState<PlanoDeRestauracao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const lista: LivroComNotas[] = [];
      for (const l of await estante.livros().catch(() => [])) {
        const n = (await estante.anotacoes(l.livroId).catch(() => [])).filter((a) => a.apagadoEm == null).length;
        if (n) lista.push({ livroId: l.livroId, titulo: l.titulo, autor: l.autor, n });
      }
      if (vivo) {
        setComNotas(lista);
        setEscolhido((atual) => atual || lista[0]?.livroId || '');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [meus.length]);

  const exportar = async (formato: 'md' | 'html' | 'csv' | 'json') => {
    const livro = comNotas.find((l) => l.livroId === escolhido);
    if (!livro) return;
    const notas = await estante.anotacoes(livro.livroId);
    const info = { id: livro.livroId, titulo: livro.titulo, autor: livro.autor };
    const rotulos = {
      semCapitulo: t('Sem capítulo'),
      nota: t('Nota'),
      palavra: t('Palavra'),
      abrirNoFrasy: t('abrir no Frasy'),
      exportadoEm: (d: string) => t('Exportado em {data}', { data: d }),
    };
    const agora = Date.now();
    if (formato === 'md') {
      baixarBlob(
        new Blob([paraMarkdown(info, notas, { agora, rotulos })], { type: 'text/markdown' }),
        nomeDeArquivo(livro.titulo, 'md'),
      );
    } else if (formato === 'html') {
      baixarBlob(
        new Blob([paraHtml(info, notas, { agora, rotulos })], { type: 'text/html' }),
        nomeDeArquivo(livro.titulo, 'html'),
      );
    } else if (formato === 'csv') {
      baixarBlob(new Blob([paraCsvDePlanilha(info, notas)], { type: 'text/csv' }), nomeDeArquivo(livro.titulo, 'csv'));
    } else {
      baixarBlob(
        new Blob([JSON.stringify(colecaoW3C(info, notas), null, 2)], { type: 'application/json' }),
        nomeDeArquivo(livro.titulo, 'json'),
      );
    }
  };

  const baixarBackup = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      const b = await criarBackup();
      if (!b) {
        setAviso({ tom: 'erro', texto: t('Ainda não há livros trazidos por você para guardar no backup.') });
        return;
      }
      baixarBlob(b.blob, `frasy-estante-${new Date().toISOString().slice(0, 10)}.zip`);
      setAviso({
        tom: 'ok',
        texto:
          b.semArquivo > 0
            ? t('Backup pronto com {n} livros. {falta} não estavam mais neste aparelho e ficaram de fora.', {
                n: b.livros,
                falta: b.semArquivo,
              })
            : t('Backup pronto com {n} livros, as posições de leitura e as anotações.', { n: b.livros }),
      });
    } catch {
      setAviso({ tom: 'erro', texto: t('Não deu para criar o backup agora. Tente de novo.') });
    } finally {
      setOcupado(false);
    }
  };

  const aoEscolherBackup = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setOcupado(true);
    setAviso(null);
    setPlano(null);
    try {
      const p = await lerBackup(arquivo);
      if (p.conflitos.length === 0) await restaurar(p, 'manter');
      else setPlano(p);
    } catch (e) {
      setAviso({ tom: 'erro', texto: mensagemDoErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  const restaurar = async (p: PlanoDeRestauracao, conflito: 'manter' | 'substituir') => {
    setOcupado(true);
    try {
      const r = await restaurarBackup(p, conflito, (i) => t('Parte {n}', { n: i + 1 }));
      setPlano(null);
      setAviso({
        tom: r.falhas.length ? 'erro' : 'ok',
        texto:
          t('Restaurados: {n}. Mantidos como estavam: {m}.', { n: r.restaurados, m: r.mantidos }) +
          (r.falhas.length
            ? ' ' + t('Não deu para restaurar: {titulos}.', { titulos: r.falhas.map((f) => f.titulo).join(', ') })
            : ''),
      });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="q-cartao lv-estante" aria-labelledby="lv-estante-titulo" data-testid="estante-e-backup">
      <h3 id="lv-estante-titulo">
        <Archive aria-hidden /> {t('Sua estante: cópias, anotações e backup')}
      </h3>
      <p className="lv-nota">
        {t(
          'Tudo é feito neste aparelho: nenhum arquivo seu vai para a internet. Livros do catálogo não entram no backup (eles voltam do catálogo).',
        )}
      </p>

      {trazidos.length > 0 && (
        <details className="lv-ajuda">
          <summary>{t('Baixar a cópia de um livro que você trouxe')}</summary>
          <ul className="lv-fontes">
            {trazidos.map((l) => (
              <li key={l.id} className="lv-fonte">
                <span className="lv-fonte-texto">
                  <b>{l.titulo}</b>
                  <small>{(l.formato ?? '').toUpperCase()}</small>
                </span>
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() =>
                    void baixarCopiaDoLivro(l).then((ok) =>
                      setAviso(
                        ok
                          ? null
                          : {
                              tom: 'erro',
                              texto: t('Não achei o arquivo deste livro neste aparelho. Traga-o de novo.'),
                            },
                      ),
                    )
                  }
                >
                  <Download aria-hidden /> {t('Baixar cópia do arquivo')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {comNotas.length > 0 && (
        <div className="lv-exportar-notas">
          <label className="q-campo">
            <span>{t('Exportar as anotações de')}</span>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} data-testid="livro-das-anotacoes">
              {comNotas.map((l) => (
                <option key={l.livroId} value={l.livroId}>
                  {l.titulo} ({l.n})
                </option>
              ))}
            </select>
          </label>
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={() => void exportar('md')}>
              Markdown
            </button>
            <button type="button" className="q-ctl" onClick={() => void exportar('html')}>
              HTML
            </button>
            <button type="button" className="q-ctl" onClick={() => void exportar('csv')}>
              CSV
            </button>
            <button type="button" className="q-ctl" onClick={() => void exportar('json')}>
              JSON (W3C)
            </button>
          </div>
        </div>
      )}

      <div className="q-acoes">
        <button
          type="button"
          className="q-ctl pri"
          disabled={ocupado || lerMeusLivros().length === 0}
          onClick={() => void baixarBackup()}
          data-testid="baixar-backup"
        >
          <Download aria-hidden /> {t('Baixar backup da estante')}
        </button>
        <button type="button" className="q-ctl" disabled={ocupado} onClick={() => campo.current?.click()}>
          <Upload aria-hidden /> {t('Restaurar de um backup')}
        </button>
        <input
          ref={campo}
          hidden
          tabIndex={-1}
          aria-hidden
          type="file"
          accept=".zip,application/zip"
          data-testid="arquivo-do-backup"
          onChange={(e) => {
            void aoEscolherBackup(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {plano && (
        <div role="alertdialog" aria-labelledby="lv-conflito" className="lv-lembrete" data-testid="conflito-do-backup">
          <span id="lv-conflito">
            {t('{n} livros do backup já estão na sua estante: {titulos}. O que fazer com eles?', {
              n: plano.conflitos.length,
              titulos: plano.conflitos.map((c) => c.titulo).join(', '),
            })}
          </span>
          <span className="q-acoes">
            <button
              type="button"
              className="q-ctl pri"
              disabled={ocupado}
              onClick={() => void restaurar(plano, 'manter')}
            >
              {t('Manter os que já tenho')}
            </button>
            <button
              type="button"
              className="q-ctl"
              disabled={ocupado}
              onClick={() => void restaurar(plano, 'substituir')}
            >
              {t('Substituir pelos do backup')}
            </button>
          </span>
        </div>
      )}

      <div aria-live="polite" className="lv-estado-do-trazer">
        {aviso && (
          <p
            className={aviso.tom === 'erro' ? 'lv-erro' : 'lv-nota'}
            role={aviso.tom === 'erro' ? 'alert' : 'status'}
            data-testid="aviso-do-backup"
          >
            {aviso.texto}
          </p>
        )}
      </div>
    </section>
  );
}
