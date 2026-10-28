import '../../styles/questLivros.css';

import { BookMarked, BookOpen, Upload } from 'lucide-react';
import React, { Suspense, useEffect, useMemo, useState } from 'react';

import { livrosVisiveis } from '../../core/livros/catalogo';
import { edicoesEmOutrosIdiomas } from '../../core/livros/obras';
import { type Catalogo, NIVEIS_DO_LIVRO, type NivelDoLivro } from '../../core/livros/tipos';
import { lerAjustesDoAssistente } from '../../lib/assistente/ajustesDoAssistente';
import { t } from '../../lib/i18n';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { abrirDetalheDoLivro, abrirLivroNoLeitor, voltarAoCatalogo } from '../../lib/livros/abrir';
import { carregarCatalogo } from '../../lib/livros/catalogo';
import { prepararDoCatalogo, prepararMeuLivro } from '../../lib/livros/doCatalogo';
import { filtrarMeusLivrosVisiveis, marcarAberto, useMeusLivros } from '../../lib/livros/meusLivros';
import { leitorMenor, tetoDoLeitor } from '../../lib/livros/quemLe';
import type { AgeProfileType } from '../../lib/profile';
import DetalheDoLivro from './livros/DetalheDoLivro';
import MeusLivros from './livros/MeusLivros';
import TrazerOSeu from './livros/TrazerOSeu';
import Vitrine from './livros/Vitrine';

type Aba = 'catalogo' | 'meus' | 'trazer';

/* O leitor (L2: foliate-js, PDF.js, DOMPurify) é um pedaço à parte: só desce quando a pessoa vai ler. */
const LeitorDoCatalogo = lazyComRecarga(() => import('./leitor/LeitorDoCatalogo'));

const Abrindo = () => (
  <div className="q-palco lv" data-testid="livros" aria-busy="true">
    <div className="q-esqueleto" style={{ minHeight: 320 }} />
  </div>
);

const CHAVE_DO_IDIOMA = 'frasy.livros.idioma';
const CHAVE_DO_NIVEL = 'frasy.livros.nivel';

const lerLocal = (chave: string): string | null => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravarLocal = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem disco: vale nesta aba */
  }
};

/**
 * LIVROS (L1 de `docs/specs/2026-10-26-livros-e-leitura.md`): o catálogo de domínio público, o detalhe de
 * cada livro, a leitura (o leitor da L2, `LeitorDoCatalogo`), "Meus livros" e "Trazer o seu".
 *
 * O catálogo é um JSON estático baixado quando esta tela abre. TUDO o que a tela mostra passa por
 * `livrosVisiveis` (o filtro legal de novo, e a faixa etária de quem lê): um livro que um menor não pode ver
 * não aparece na vitrine, na busca, nos filtros, nem quando o endereço `/livros/<id>` é digitado.
 */
export default function Livros({
  livroAberto,
  ageProfile,
}: {
  livroAberto: { id: string; lendo: boolean } | null;
  ageProfile: AgeProfileType;
}) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('catalogo');
  const meus = useMeusLivros();
  const { studying } = useLangConfig();

  useEffect(() => {
    let vivo = true;
    carregarCatalogo()
      .then((c) => vivo && setCatalogo(c))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, []);

  const teto = tetoDoLeitor(ageProfile);
  const menor = leitorMenor(teto);
  const visiveis = useMemo(
    () => (catalogo ? livrosVisiveis(catalogo.livros, teto, catalogo.anoLimite) : []),
    [catalogo, teto],
  );

  /* Sem o catálogo ainda, nenhum livro DO CATÁLOGO conta como visível (os trazidos, sim). */
  const idsVisiveis = useMemo(() => new Set(visiveis.map((l) => l.id)), [visiveis]);
  const visivel = (id: string) => idsVisiveis.has(id);
  const meusVisiveis = filtrarMeusLivrosVisiveis(meus, visivel);

  const idiomasComLivro = useMemo(() => new Set(visiveis.map((l) => l.idioma)), [visiveis]);
  const [idiomaEscolhido, setIdiomaEscolhido] = useState<string | null>(() => lerLocal(CHAVE_DO_IDIOMA));
  const idioma =
    [idiomaEscolhido, baseLang(studying), 'en'].find((i): i is string => !!i && idiomasComLivro.has(i)) ??
    [...idiomasComLivro][0] ??
    'en';
  const [nivel, setNivel] = useState<NivelDoLivro>(() => {
    const guardado = lerLocal(CHAVE_DO_NIVEL);
    return (NIVEIS_DO_LIVRO as readonly string[]).includes(guardado ?? '')
      ? (guardado as NivelDoLivro)
      : lerAjustesDoAssistente().nivel;
  });

  /* A troca de livro (ou do detalhe para a leitura) começa do alto da tela. */
  useEffect(() => {
    document.querySelector('.lv')?.scrollTo?.({ top: 0 });
  }, [livroAberto?.id, livroAberto?.lendo]);

  if (erro) {
    return (
      <div className="q-palco lv" data-testid="livros">
        <div className="q-vazio" role="alert">
          <h2>{t('O catálogo não carregou')}</h2>
          <p>{t('Confira a conexão e tente de novo. Os seus livros trazidos continuam neste aparelho.')}</p>
          <div className="q-acoes">
            <button type="button" className="q-ctl pri" onClick={() => window.location.reload()}>
              {t('Tentar de novo')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Um livro aberto: o detalhe, ou a leitura ─────────────────────────────────────────────── */
  if (livroAberto) {
    const meu = meusVisiveis.find((m) => m.id === livroAberto.id && m.origem !== 'catalogo');
    if (meu && livroAberto.lendo) {
      return (
        <Suspense fallback={<Abrindo />}>
          <LeitorDoCatalogo
            key={meu.id}
            preparar={() => prepararMeuLivro(meu)}
            aoAbrir={() => marcarAberto(meu.id)}
            aoVoltar={() => {
              setAba('meus');
              voltarAoCatalogo();
            }}
          />
        </Suspense>
      );
    }
    if (!catalogo)
      return (
        <div className="q-palco lv" data-testid="livros" aria-busy="true">
          <div className="q-esqueleto" style={{ minHeight: 320 }} />
        </div>
      );
    const livro = visiveis.find((l) => l.id === livroAberto.id);
    if (!livro) {
      return (
        <div className="q-palco lv" data-testid="livro-nao-encontrado">
          <div className="q-vazio">
            <span className="q-ic">
              <BookOpen aria-hidden />
            </span>
            <h2>{t('Este livro não está no catálogo')}</h2>
            <p>{t('O endereço pode estar errado, ou o livro saiu do catálogo. Os outros continuam aqui.')}</p>
            <div className="q-acoes">
              <button type="button" className="q-ctl pri" onClick={voltarAoCatalogo}>
                {t('Ver o catálogo')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (livroAberto.lendo) {
      return (
        <Suspense fallback={<Abrindo />}>
          <LeitorDoCatalogo
            key={livro.id}
            preparar={() => prepararDoCatalogo(livro, (i) => t('Parte {n}', { n: i + 1 }))}
            aoAbrir={() => marcarAberto(livro.id)}
            aoVoltar={() => abrirDetalheDoLivro(livro)}
          />
        </Suspense>
      );
    }
    return (
      <DetalheDoLivro
        livro={livro}
        aoVoltar={voltarAoCatalogo}
        aoLer={() => abrirLivroNoLeitor(livro)}
        /* Filtro legal e faixa etária valem edição por edição: irmã que este leitor não pode ver não entra. */
        outrasEdicoes={edicoesEmOutrosIdiomas(livro, catalogo.livros, teto, catalogo.anoLimite)}
        aoAbrirEdicao={abrirDetalheDoLivro}
        aoLerEdicao={(e) => void abrirLivroNoLeitor(e)}
      />
    );
  }

  /* ── O catálogo ───────────────────────────────────────────────────────────────────────────── */
  const abas: Array<{ id: Aba; rotulo: string; icone: React.ReactNode; n?: number }> = [
    { id: 'catalogo', rotulo: t('Catálogo'), icone: <BookOpen aria-hidden /> },
    { id: 'meus', rotulo: t('Meus livros'), icone: <BookMarked aria-hidden />, n: meusVisiveis.length },
    { id: 'trazer', rotulo: t('Trazer o seu'), icone: <Upload aria-hidden /> },
  ];

  return (
    <div className="q-palco lv" data-testid="livros">
      <header className="q-cab">
        <div>
          <p className="q-sobre">
            {catalogo ? t('{n} livros em domínio público', { n: visiveis.length }) : t('Domínio público')}
          </p>
          <h1>{t('Livros')}</h1>
        </div>
        <button
          type="button"
          className="q-ctl pri lv-chamada-trazer"
          data-testid="trazer-um-livro-seu"
          onClick={() => setAba('trazer')}
        >
          <Upload aria-hidden /> {t('Trazer um livro seu')}
        </button>
      </header>
      <div className="q-abas" role="tablist" aria-label={t('Seções de Livros')}>
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`lv-aba-${a.id}`}
            aria-controls={`lv-painel-${a.id}`}
            aria-selected={aba === a.id}
            tabIndex={aba === a.id ? 0 : -1}
            className="q-aba"
            onClick={() => setAba(a.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = abas.findIndex((x) => x.id === aba);
              const proxima = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
              setAba(proxima.id);
              document.getElementById(`lv-aba-${proxima.id}`)?.focus();
            }}
          >
            {a.icone} {a.rotulo}
            {a.n ? <span className="n">{a.n}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`lv-painel-${aba}`} aria-labelledby={`lv-aba-${aba}`} className="lv-painel">
        {aba === 'catalogo' && catalogo && visiveis.length === 0 && (
          <div className="q-vazio" data-testid="catalogo-vazio-para-o-perfil">
            <span className="q-ic">
              <BookOpen aria-hidden />
            </span>
            <h2>{t('Os livros para a sua idade ainda estão em revisão')}</h2>
            <p>
              {t(
                'Cada livro só aparece aqui depois que uma pessoa confere a faixa etária dele. Enquanto isso, você pode ler um arquivo seu.',
              )}
            </p>
            <div className="q-acoes">
              <button type="button" className="q-ctl pri" onClick={() => setAba('trazer')}>
                <Upload aria-hidden /> {t('Trazer o seu')}
              </button>
            </div>
          </div>
        )}
        {aba === 'catalogo' &&
          !(catalogo && visiveis.length === 0) &&
          (catalogo ? (
            <Vitrine
              livros={visiveis}
              exclusoes={catalogo.exclusoes}
              ano={catalogo.ano}
              anoLimite={catalogo.anoLimite}
              idioma={idioma}
              aoTrocarIdioma={(i) => {
                setIdiomaEscolhido(i);
                gravarLocal(CHAVE_DO_IDIOMA, i);
              }}
              nivel={nivel}
              aoTrocarNivel={(n) => {
                setNivel(n);
                gravarLocal(CHAVE_DO_NIVEL, n);
              }}
              menor={menor}
              aoAbrir={(l) => abrirDetalheDoLivro(l)}
              aoTrazer={() => setAba('trazer')}
            />
          ) : (
            <div className="lv-esperando" aria-busy="true" role="status" aria-label={t('Carregando o catálogo')}>
              <div className="q-esqueleto" style={{ minHeight: 64 }} />
              <div className="q-esqueleto" style={{ minHeight: 260 }} />
            </div>
          ))}
        {aba === 'meus' && (
          <MeusLivros
            catalogo={visiveis}
            visivel={visivel}
            aoAbrir={(l) => abrirLivroNoLeitor(l)}
            aoTrazer={() => setAba('trazer')}
            aoCatalogo={() => setAba('catalogo')}
          />
        )}
        {aba === 'trazer' && (
          <TrazerOSeu aoAbrir={(l) => abrirLivroNoLeitor(l)} aoVerMeusLivros={() => setAba('meus')} />
        )}
      </div>
    </div>
  );
}
