import { INTERESSES, MAX_INTERESSES } from '@core';
import { Camera, Check, CircleDot, Heart, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchDeck } from '../../../data/api';
import { gravarFoto, reduzirFoto, useFotoDoPerfil } from '../../../lib/fotoDoPerfil';
import { t } from '../../../lib/i18n';
import { fetchLangConfig } from '../../../lib/langConfig';
import { baseLang, langLabelNaUI } from '../../../lib/languages';
import { type Cefr, NIVEIS_CEFR, NOME_DO_NIVEL, salvarPreferencias, usePreferencias } from '../../../lib/preferencias';
import { salvarPerfil, usePerfil } from '../../../lib/usePerfil';
import { LangFlag } from '../../LangFlag';
import { toast } from '../../Toast';

/**
 * QUEM É VOCÊ — o override de `T.perfil` do protótipo aprovado (4061-4084): foto, nome, objetivo e
 * bio; meta diária; nível em cada idioma; interesses; e a barra "Alterações não salvas".
 *
 * ONDE CADA COISA É GUARDADA:
 *  - nome, objetivo, bio, interesses → o perfil no servidor (`PATCH /api/me`);
 *  - meta diária e nível por idioma → preferências em `settings.ui` (`lib/preferencias`), que o
 *    lembrete (Ajustes → Notificações) e o resumo semanal leem;
 *  - foto → NESTE aparelho (`lib/fotoDoPerfil`): o servidor não tem rota de upload de imagem.
 *
 * Tudo, menos os interesses, entra na barra de salvar: o protótipo marca "sujo" ao mexer em qualquer
 * um deles e salva junto. Os interesses salvam ao clicar ("salvo assim que você marca").
 */

type Estado = 'parado' | 'salvando' | 'salvo' | 'erro';

const GRUPOS = [
  ['cultura', 'Cultura'],
  ['trabalho', 'Trabalho'],
  ['vida', 'Vida'],
  ['estudo', 'Estudo'],
] as const;

/** Os interesses que o protótipo mostra, na ordem dele. Os outros do catálogo só aparecem se já marcados. */
const DO_PROTOTIPO = new Set([
  'musica',
  'jogos',
  'filmes-series',
  'livros',
  'esportes',
  'humor',
  'tecnologia',
  'negocios',
  'reunioes',
  'entrevistas',
  'viagem',
  'culinaria',
  'familia',
  'noticias',
  'provas',
  'gramatica',
  'pronuncia',
]);
const ROTULO_DO_PROTOTIPO: Record<string, string> = { noticias: 'Notícias' };

const METAS: Array<[number, string]> = [
  [5, ' · leve'],
  [10, ''],
  [15, ' · recomendado'],
  [20, ''],
  [30, ' · intenso'],
];

const nomeDoIdioma = (code: string) => {
  const n = langLabelNaUI(code);
  return n.charAt(0).toUpperCase() + n.slice(1);
};

export default function AbaVoce() {
  const { perfil, carregando } = usePerfil();
  const prefs = usePreferencias();
  const fotoSalva = useFotoDoPerfil(perfil?.id);

  const [nome, setNome] = useState('');
  const [bio, setBio] = useState('');
  const [goal, setGoal] = useState('');
  const [metaMin, setMetaMin] = useState(prefs.metaMin);
  const [niveis, setNiveis] = useState<Record<string, Cefr>>(prefs.niveis);
  const [foto, setFoto] = useState<string | null>(fotoSalva);
  const [idiomas, setIdiomas] = useState<string[]>([]);
  const [estado, setEstado] = useState<Estado>('parado');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  /* O formulário parte do servidor quando o perfil chega — uma vez por usuário, para não apagar o
     que está sendo digitado quando o perfil muda de identidade a cada gravação. */
  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.displayName ?? '');
    setBio(perfil.bio ?? '');
    setGoal(perfil.goal ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);
  useEffect(() => setFoto(fotoSalva), [fotoSalva]);
  useEffect(() => {
    setMetaMin(prefs.metaMin);
    setNiveis(prefs.niveis);
  }, [prefs.metaMin, prefs.niveis]);

  /* OS IDIOMAS DA PESSOA: o que ela estuda (Ajustes) e os que já estão no caderno. */
  useEffect(() => {
    let vivo = true;
    void Promise.all([fetchLangConfig().catch(() => null), fetchDeck().catch(() => [])]).then(([cfg, deck]) => {
      if (!vivo) return;
      const mine = cfg ? baseLang(cfg.mine) : 'pt';
      const lista = [
        ...(cfg ? [baseLang(cfg.studying)] : []),
        ...deck.map((c) => baseLang(c.srcLang ?? '')).filter(Boolean),
      ].filter((l, i, a) => l && l !== mine && a.indexOf(l) === i);
      setIdiomas(lista.length ? lista : ['en']);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const nivelDe = (l: string): Cefr => niveis[l] ?? 'A1';
  const marcados = perfil?.interests ?? [];
  const sujo =
    !!perfil &&
    (nome !== (perfil.displayName ?? '') ||
      bio !== (perfil.bio ?? '') ||
      goal !== (perfil.goal ?? '') ||
      metaMin !== prefs.metaMin ||
      idiomas.some((l) => nivelDe(l) !== (prefs.niveis[l] ?? 'A1')) ||
      foto !== fotoSalva);

  async function salvar() {
    setEstado('salvando');
    const [okPerfil, okPrefs] = await Promise.all([
      salvarPerfil({ displayName: nome, bio, goal }),
      salvarPreferencias((p) => ({
        ...p,
        metaMin,
        niveis: { ...p.niveis, ...Object.fromEntries(idiomas.map((l) => [l, nivelDe(l)])) },
      })),
    ]);
    const okFoto = foto === fotoSalva || gravarFoto(perfil?.id, foto);
    const ok = okPerfil && okPrefs && okFoto;
    setEstado(ok ? 'salvo' : 'erro');
    if (ok) {
      setSalvoEm('agora');
      toast.ok('Perfil salvo');
    }
  }

  /** Volta tudo ao que está guardado. */
  function descartar() {
    if (!perfil) return;
    setNome(perfil.displayName ?? '');
    setBio(perfil.bio ?? '');
    setGoal(perfil.goal ?? '');
    setMetaMin(prefs.metaMin);
    setNiveis(prefs.niveis);
    setFoto(fotoSalva);
    setEstado('parado');
  }

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      setFoto(await reduzirFoto(arquivo));
      setEstado('parado');
    } catch {
      toast.warn('Não deu para usar esse arquivo. Escolha uma imagem (JPG, PNG ou WebP).');
    }
  }

  async function alternarInteresse(slug: string) {
    const jaTem = marcados.includes(slug);
    if (!jaTem && marcados.length >= MAX_INTERESSES) return;
    const proximos = jaTem ? marcados.filter((s) => s !== slug) : [...marcados, slug];
    await salvarPerfil({ interests: proximos });
  }

  if (carregando) {
    return (
      <div className="q-carregando" role="status">
        <Loader2 className="qc-gira" aria-hidden />
        {t('Carregando o seu perfil…')}
      </div>
    );
  }

  const inicial = ((nome || perfil?.displayName || '?').trim()[0] ?? '?').toUpperCase();

  /* QUEST: os mesmos campos, na mesma ordem, um por linha e com 60 px. A meta e o nível são escolhas
     entre poucos; os interesses, pílulas que ligam e desligam; e a barra de salvar fica à vista
     enquanto a aba rola. O estado e a gravação são os de cima. */
  const noTeto = marcados.length >= MAX_INTERESSES;
  return (
    <>
      <section className="q-cartao qc-identidade" aria-label={t('Quem é você')}>
        <div className="qc-foto">
          {foto ? (
            <img src={foto} alt={t('Sua foto de perfil')} />
          ) : (
            <span className="qc-inicial" aria-hidden>
              {inicial}
            </span>
          )}
          <label className="q-ctl qc-arquivo">
            <Camera aria-hidden /> {foto ? t('Trocar') : t('Enviar foto')}
            <input
              type="file"
              accept="image/*"
              className="sr"
              onChange={(e) => {
                void escolherFoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {foto && (
            <button type="button" className="q-ctl" onClick={() => setFoto(null)}>
              <Trash2 aria-hidden /> {t('Remover')}
            </button>
          )}
        </div>
        <div className="qc-campos">
          <div className="q-campo">
            <label htmlFor="pf-nome">{t('Como você quer ser chamado')}</label>
            <input
              id="pf-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              placeholder={t('Seu nome')}
              autoComplete="nickname"
            />
          </div>
          <div className="q-campo">
            <label htmlFor="pf-meta">{t('O que você quer alcançar')}</label>
            <input
              id="pf-meta"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={120}
              placeholder={t('Ex.: acompanhar reuniões em inglês')}
            />
          </div>
          <div className="q-campo">
            <label htmlFor="pf-bio">{t('Sobre você')}</label>
            <textarea id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
            <small>{t('{n} de {max} caracteres', { n: bio.length, max: 280 })}</small>
          </div>
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Meta diária')}</h2>
            <p>{t('Quanto tempo por dia você quer estudar. Guia o lembrete e as estatísticas.')}</p>
          </div>
        </header>
        <div className="q-abas q-seg qc-quebra" role="group" aria-label={t('Meta diária')}>
          {METAS.map(([m, rot]) => (
            <button key={m} type="button" className="q-aba" aria-pressed={metaMin === m} onClick={() => setMetaMin(m)}>
              {m} min{rot}
            </button>
          ))}
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Seu nível em cada idioma')}</h2>
            <p>{t('Autoavaliação. Calibra o conteúdo da trilha e dos jogos; o app também ajusta sozinho.')}</p>
          </div>
        </header>
        <div className="qc-pilha">
          {idiomas.map((l) => {
            const r = nomeDoIdioma(l);
            return (
              /* `minWidth: 0`: no celular a camada de polimento põe as escolhas numa faixa que rola
                 (`celular.css:229`), e sem isto a linha crescia até caber os seis níveis e vazava
                 34 px para fora da tela (a coluna da grade tem mínimo automático). */
              <div key={l} className="q-ajuste" style={{ minWidth: 0 }}>
                <div>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LangFlag code={l} className="w-6 h-4" />
                    {r}
                  </b>
                  <small>{NOME_DO_NIVEL[nivelDe(l)]}</small>
                </div>
                <div
                  className="q-abas q-seg qc-quebra"
                  role="radiogroup"
                  aria-label={t('Nível em {idioma}', { idioma: r })}
                >
                  {NIVEIS_CEFR.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="q-aba"
                      role="radio"
                      aria-checked={nivelDe(l) === n}
                      onClick={() => setNiveis((x) => ({ ...x, [l]: n }))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Do que você gosta')}</h2>
            <p>
              {t('Guia o que vale importar e que exemplos aparecem nos jogos. Escolha até {n}.', {
                n: MAX_INTERESSES,
              })}
            </p>
          </div>
          <span className="q-chip" role="status">
            <Heart aria-hidden />
            {t('{n} de {max} escolhidos', { n: marcados.length, max: MAX_INTERESSES })}
          </span>
        </header>
        <div className="q-cartao">
          {GRUPOS.map(([grupo, rotulo]) => (
            <div key={grupo} className="qc-grupo">
              <span className="q-rotulo">{t(rotulo)}</span>
              <div className="qc-chips" role="group" aria-label={t(rotulo)}>
                {INTERESSES.filter(
                  (i) => i.grupo === grupo && (DO_PROTOTIPO.has(i.slug) || marcados.includes(i.slug)),
                ).map((i) => {
                  const ativo = marcados.includes(i.slug);
                  return (
                    <button
                      key={i.slug}
                      type="button"
                      className="q-aba"
                      onClick={() => void alternarInteresse(i.slug)}
                      disabled={!ativo && noTeto}
                      aria-pressed={ativo}
                    >
                      {ROTULO_DO_PROTOTIPO[i.slug] ?? i.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* O motivo do bloqueio vai escrito, não num `title`: no headset não há hover, e no computador
              o texto à vista serve também a quem usa teclado. */}
          <p className="qc-nota">
            {noTeto
              ? t('Você já escolheu {n}. Desmarque um para trocar.', { n: MAX_INTERESSES })
              : t('Salvo assim que você marca.')}
          </p>
        </div>
      </section>

      <div className="qc-salvar-pe" role="status" aria-live="polite">
        {sujo || estado === 'erro' ? (
          <div className={`q-faixa qc-salvar${estado === 'erro' ? ' qc-falhou' : ''}`}>
            <span>
              <CircleDot aria-hidden />
              {estado === 'erro'
                ? t('Não consegui salvar. Verifique a conexão e tente de novo.')
                : t('Alterações não salvas')}
            </span>
            <button type="button" className="q-ctl" onClick={descartar}>
              {t('Descartar')}
            </button>
            <button type="button" className="q-ctl pri" onClick={() => void salvar()} disabled={estado === 'salvando'}>
              {estado === 'salvando' ? <Loader2 className="qc-gira" aria-hidden /> : <Check aria-hidden />}{' '}
              {t('Salvar')}
            </button>
          </div>
        ) : salvoEm ? (
          <p className="qc-ok">
            <Check aria-hidden />
            <span>{t('Salvo agora')}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}
