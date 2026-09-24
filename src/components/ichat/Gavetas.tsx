import {
  BookOpen,
  Download,
  Headphones,
  type LucideIcon,
  MessageCircle,
  Monitor,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import React from 'react';

import { t } from '../../lib/i18n';
import {
  achadoEm,
  type Conversa,
  filtrarConversas,
  quandoLegivel,
  semMarcacao,
  type TipoDoRastro,
} from '../../lib/ichat/conversas';

/* ─────────────────────────────── Conversas ─────────────────────────────── */

interface GavetaDeConversasProps {
  conversas: Conversa[];
  atual: string;
  busca: string;
  renomeando: string | null;
  naSessao: boolean;
  onBusca: (v: string) => void;
  onNova: () => void;
  onAbrir: (id: string) => void;
  onFixar: (id: string) => void;
  onRenomear: (id: string | null) => void;
  onSalvarNome: (id: string, nome: string) => void;
  onApagar: (id: string) => void;
}

/** A gaveta "Suas conversas": busca com "achado em", fixar, renomear, apagar e nova. */
export function GavetaDeConversas(p: GavetaDeConversasProps) {
  const lista = filtrarConversas(p.conversas, p.busca);
  return (
    <div className="ch-gaveta">
      <div className="entre">
        <span className="label-mono">{p.naSessao ? t('Conversas sobre esta sessão') : t('Suas conversas')}</span>
        <button type="button" className="btn btn-outline peq" onClick={p.onNova}>
          <Plus aria-hidden /> {t('Nova')}
        </button>
      </div>
      <label className="busca" style={{ marginTop: 8 }}>
        <Search aria-hidden />
        <span className="sr">{t('Buscar conversa')}</span>
        <input
          className="campo"
          id="ch-busca"
          autoComplete="off"
          placeholder={t('Buscar por conversa, palavra ou trecho…')}
          value={p.busca}
          onChange={(e) => p.onBusca(e.target.value)}
        />
      </label>
      <div className="ch-lista">
        {lista.length ? (
          lista.map((x) => {
            const achado = achadoEm(x, p.busca);
            const ultima = x.msgs[x.msgs.length - 1];
            const perguntas = x.msgs.filter((m) => m.de === 'eu').length;
            return (
              <div
                key={x.id}
                className={`ch-item ${x.id === p.atual ? 'atual' : ''}`}
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button,input')) return;
                  p.onAbrir(x.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) p.onAbrir(x.id);
                }}
              >
                <button
                  type="button"
                  className={`ch-pino ${x.fixada ? 'on' : ''}`}
                  aria-label={x.fixada ? t('Desafixar conversa') : t('Fixar conversa')}
                  aria-pressed={x.fixada}
                  onClick={() => p.onFixar(x.id)}
                >
                  <Pin aria-hidden />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {p.renomeando === x.id ? (
                    <input
                      className="campo ch-renome"
                      id="ch-renome"
                      defaultValue={x.titulo}
                      aria-label={t('Novo nome')}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') p.onSalvarNome(x.id, e.currentTarget.value);
                        if (e.key === 'Escape') p.onRenomear(null);
                      }}
                    />
                  ) : (
                    <b>{x.titulo}</b>
                  )}
                  {achado ? (
                    <small className="ch-achado">
                      {t('achado em:')} {achado}
                    </small>
                  ) : (
                    <small>{ultima ? semMarcacao(ultima.txt).slice(0, 52) : t('sem mensagens')}</small>
                  )}
                  <small className="ch-meta">
                    {quandoLegivel(x.quando)} · {perguntas} {t('perguntas')}
                    {x.palavras.length ? ` · ${x.palavras.join(', ')}` : ''}
                  </small>
                </div>
                <div className="ch-acoes-item">
                  <button
                    type="button"
                    className="btn btn-outline peq icone"
                    aria-label={t('Renomear')}
                    onClick={() => p.onRenomear(x.id)}
                  >
                    <Pencil aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline peq icone"
                    aria-label={t('Apagar conversa')}
                    onClick={() => p.onApagar(x.id)}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="mut" style={{ textAlign: 'center', padding: 14, fontSize: 12.5 }}>
            {t('Nenhuma conversa encontrada.')}
          </p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Rastro ──────────────────────────────── */

const TIPO_RASTRO: Record<TipoDoRastro, [string, LucideIcon, string]> = {
  tela: ['Tela', Monitor, 'rare'],
  palavra: ['Palavra', BookOpen, ''],
  sessao: ['Sessão', Headphones, 'good'],
  pergunta: ['Pergunta', MessageCircle, ''],
  acao: ['Ação', Zap, 'warn'],
};

const CONTAGENS: [TipoDoRastro, string][] = [
  ['tela', 'telas'],
  ['palavra', 'palavras'],
  ['sessao', 'sessões'],
  ['pergunta', 'perguntas'],
  ['acao', 'ações'],
];

/** A gaveta "Rastro desta conversa": contagens, linha do tempo e cópia em JSON. */
export function GavetaDoRastro({ conversa, onJson }: { conversa: Conversa; onJson: () => void }) {
  const cont: Record<TipoDoRastro, number> = { tela: 0, palavra: 0, sessao: 0, pergunta: 0, acao: 0 };
  conversa.rastro.forEach((r) => cont[r.tipo]++);
  return (
    <div className="ch-gaveta">
      <div className="entre">
        <span className="label-mono">{t('Rastro desta conversa')}</span>
        <button type="button" className="btn btn-outline peq" onClick={onJson}>
          <Download aria-hidden /> JSON
        </button>
      </div>
      <div className="ch-stats">
        {CONTAGENS.map(([k, r]) => (
          <div key={k}>
            <b className="tn">{cont[k]}</b>
            <small>{t(r)}</small>
          </div>
        ))}
      </div>
      <div className="ch-linha" tabIndex={0} role="list" aria-label={t('Linha do tempo do rastro')}>
        {conversa.rastro.length ? (
          conversa.rastro
            .slice()
            .reverse()
            .map((r, i) => {
              const [nome, Icone, tom] = TIPO_RASTRO[r.tipo];
              return (
                <div className="ch-evento" key={`${i}-${r.em}-${r.rot}`} role="listitem">
                  <span className={`ib ${tom}`} style={{ width: 26, height: 26, borderRadius: 8 }}>
                    <Icone aria-hidden style={{ width: 13, height: 13 }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span className="label-mono">
                      {t(nome)} · {r.em}
                    </span>
                    <p>{r.rot}</p>
                    {r.meta && <small>{r.meta}</small>}
                  </div>
                </div>
              );
            })
        ) : (
          <p className="mut" style={{ textAlign: 'center', padding: 12, fontSize: 12.5 }}>
            {t('Navegue pelo app e o rastro aparece aqui.')}
          </p>
        )}
      </div>
    </div>
  );
}
