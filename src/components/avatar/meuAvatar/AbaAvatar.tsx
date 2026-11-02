import '../../../styles/avatar.css';

import { AlertTriangle, BookOpen, Check, RotateCcw, Save, Trash2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SEM_SUPORTE, type SuporteDaPaleta } from '../../../core/avatar/aparencia';
import {
  aplicar,
  comAjuste,
  comBase,
  comNome,
  comPaleta,
  desfazer,
  estaNoPadrao,
  type Historico,
  iniciarHistorico,
  receitaNova,
  receitasIguais,
  restaurarPadrao,
} from '../../../core/avatar/edicao';
import type { ModoDeCamera } from '../../../core/avatar/enquadramento';
import type { CreditoDoModelo } from '../../../core/avatar/importador/validar';
import type { ReceitaDeAvatar } from '../../../core/avatar/receita';
import { sugerirModelo } from '../../../core/avatar/sugestao';
import { permissoesDoAvatar } from '../../../core/avatar/sugestao';
import { FLAG_AVATAR_SINAIS } from '../../../core/planos';
import { COLECAO_SUGERIVEL, type ModeloDaColecao, modeloDaColecao } from '../../../data/avatar/colecao';
import { lerModeloImportado } from '../../../lib/avatar/armazem';
import { detectarTier } from '../../../lib/avatar/detectarTier';
import type { MotivoDoFallback } from '../../../lib/avatar/fallback2d';
import {
  apagarMeuAvatar,
  lerCreditoGuardado,
  lerMeuAvatar,
  lerMeuAvatarLocal,
  salvarMeuAvatar,
} from '../../../lib/avatar/meuAvatar';
import { useProtegidoParaAvatar } from '../../../lib/avatar/protegido';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import { usePerfil } from '../../../lib/usePerfil';
import { PainelDeAba } from '../../ui';
import AbasDoQuest from '../../views/ajustes/quest/AbasDoQuest';
import AvatarCanvas from '../AvatarCanvas';
import EstudioDoAvatar from '../EstudioDoAvatar';
import Escolher from './Escolher';
import Personalizar from './Personalizar';
import TragaOSeu, { type ModeloPreparado } from './TragaOSeu';

const GuiaDoAlfabeto = lazy(() => import('../GuiaDoAlfabeto'));

type Visao = 'escolher' | 'personalizar' | 'estudio' | 'traga';

/** Abaixo disto a prévia fica fixa no topo e compacta (celular); acima, é o cartão da coluna da esquerda. */
const CONSULTA_DO_CELULAR = '(max-width: 879px)';
const TAMANHO_NO_DESKTOP = 280;
const TAMANHO_NO_CELULAR = 112;

function useCelular(): boolean {
  const [celular, setCelular] = useState(
    () => typeof matchMedia === 'function' && matchMedia(CONSULTA_DO_CELULAR).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(CONSULTA_DO_CELULAR);
    const ouvir = () => setCelular(mq.matches);
    ouvir();
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, []);
  return celular;
}

/** O arquivo que a pessoa trouxe e passou na conferência, mostrado na prévia ANTES de ser usado ou salvo. */
interface PreviaImportada {
  blob: Blob;
  titulo: string;
}

interface Trazido {
  id: string;
  titulo: string;
  credito: CreditoDoModelo | null;
  /** O arquivo ainda não foi salvo: só vai para o IndexedDB no "Salvar". */
  blob: Blob;
  salvo: boolean;
}

function linhaDeCredito(c: CreditoDoModelo | null, modelo?: ModeloDaColecao): string | null {
  if (modelo) return t('{nome}, de {autor}. Uso livre.', { nome: modelo.nome, autor: modelo.autor });
  if (!c || (!c.titulo && c.autores.length === 0)) return null;
  return t('Crédito: {titulo} · {autor}', {
    titulo: c.titulo || t('sem título'),
    autor: c.autores.join(', ') || t('autor não informado'),
  });
}

/**
 * PERFIL > AVATAR ("Meu avatar"): a pessoa escolhe, personaliza e guarda o avatar que a representa. Tudo atrás da
 * flag `avatar_3d` (quem monta a aba é o `Perfil`). Sempre OPCIONAL: "Continuar sem avatar" e "Apagar meu avatar"
 * voltam à foto e às iniciais. Receita, miniatura e o arquivo trazido ficam SÓ neste aparelho.
 *
 * Só a prévia desta tela é viva (um contexto WebGL); o resto do app mostra a miniatura estática.
 */
export default function AbaAvatar({ nivel = 1, saldoSeeds = 0 }: { nivel?: number; saldoSeeds?: number }) {
  const { perfil } = usePerfil();
  const usuario = perfil?.id;
  const protegido = useProtegidoParaAvatar();
  const politica = permissoesDoAvatar(protegido);
  const tier = useMemo(() => detectarTier(), []);

  const [visao, setVisao] = useState<Visao>('escolher');
  const [carregado, setCarregado] = useState(false);
  const [salvo, setSalvo] = useState<ReceitaDeAvatar | null>(() => lerMeuAvatarLocal(usuario));
  const [hist, setHist] = useState<Historico | null>(null);
  const [trazido, setTrazido] = useState<Trazido | null>(null);
  // O que a prévia contou vale só para o modelo que a contou (guardado com o id da base, sem efeito de reset).
  const [suporteDe, setSuporteDe] = useState<{ base: string; suporte: SuporteDaPaleta } | null>(null);
  const [erroDe, setErroDe] = useState<{ base: string; motivo: MotivoDoFallback } | null>(null);
  const [modo, setModo] = useState<ModoDeCamera>('corpo');
  const [previaImportada, setPreviaImportada] = useState<PreviaImportada | null>(null);
  const celular = useCelular();
  const sinais = useFlag(FLAG_AVATAR_SINAIS);
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const [apagando, setApagando] = useState(false);
  const capturar = useRef<(() => string | null) | null>(null);
  const erroNaBase = useRef(false);
  const miniaturaDoEstudio = useRef<string | null>(null);
  const capturarDoEstudio = useRef<(() => string | null) | null>(null);

  // A sugestão: um modelo da coleção, sorteado uma vez. Só vira avatar se a pessoa aceitar.
  const sugerida = useMemo<ReceitaDeAvatar | null>(() => {
    const m = sugerirModelo(COLECAO_SUGERIVEL, protegido, Math.random);
    return m ? receitaNova({ origem: 'colecao', id: m.id }, '', Date.now()) : null;
  }, [protegido]);

  // O que está guardado vem do IndexedDB (o espelho do localStorage já pintou de primeira).
  useEffect(() => {
    let vivo = true;
    void lerMeuAvatar(usuario).then(async (r) => {
      if (!vivo) return;
      setSalvo(r);
      setHist((h) => h ?? (r ? iniciarHistorico(r) : null));
      if (r?.base.origem === 'importado') {
        const blob = await lerModeloImportado(r.base.id);
        if (vivo && blob)
          setTrazido({ id: r.base.id, titulo: r.meta.nome, credito: lerCreditoGuardado(usuario), blob, salvo: true });
      }
      setCarregado(true);
    });
    return () => {
      vivo = false;
    };
  }, [usuario]);

  const atual = hist?.atual ?? sugerida;
  const ehSugestao = !hist;
  const modelo = atual?.base.origem === 'colecao' ? modeloDaColecao(atual.base.id) : undefined;
  const blobDoTrazido = atual?.base.origem === 'importado' && trazido?.id === atual.base.id ? trazido.blob : undefined;
  // Um arquivo recém-aceito aparece na prévia na hora (sem salvar nada), até a pessoa usar ou voltar.
  const fonteDaPrevia = previaImportada?.blob ?? blobDoTrazido;
  const sujo = hist ? !salvo || !receitasIguais(hist.atual, salvo) : false;
  const baseId = atual?.base.id;
  const suporte = suporteDe && suporteDe.base === baseId ? suporteDe.suporte : null;
  const erroDaPrevia = erroDe && erroDe.base === baseId ? erroDe.motivo : null;
  erroNaBase.current = erroDaPrevia !== null;
  const suporteEfetivo = suporte ?? modelo?.suporta ?? SEM_SUPORTE;

  // No Estúdio a única prévia viva é a dele (dois contextos WebGL pesam no celular): a desta tela some e deixa o
  // texto, o "Salvar" e o crédito. A miniatura salva vem da prévia do Estúdio.
  const previaViva = visao !== 'estudio';
  useEffect(() => {
    if (!previaViva) capturar.current = null;
  }, [previaViva]);

  const editar = useCallback((fn: (r: ReceitaDeAvatar) => ReceitaDeAvatar) => {
    setApagando(false);
    setAviso(null);
    setHist((h) => (h ? aplicar(h, fn(h.atual)) : h));
  }, []);

  const comecarDe = (base: { origem: 'colecao' | 'importado'; id: string }, nome = '') => {
    setPreviaImportada(null);
    setApagando(false);
    setAviso(null);
    setHist((h) => (h ? aplicar(h, comBase(h.atual, base)) : iniciarHistorico(receitaNova(base, nome, Date.now()))));
  };

  const escolher = (m: ModeloDaColecao) => comecarDe({ origem: 'colecao', id: m.id });
  const sortear = () => {
    const m = sugerirModelo(COLECAO_SUGERIVEL, protegido, Math.random, atual?.base.id);
    if (m) escolher(m);
  };

  const dispensar = () => {
    setHist(null);
    setAviso({
      tom: 'ok',
      texto: t('Tudo bem: você continua com a foto ou as iniciais. Dá para criar um avatar quando quiser.'),
    });
  };

  const usarTrazido = (m: ModeloPreparado) => {
    setPreviaImportada(null);
    setTrazido({
      id: m.id,
      titulo: m.titulo,
      credito: m.credito,
      blob: new Blob([m.bytes.slice().buffer as ArrayBuffer], { type: 'model/gltf-binary' }),
      salvo: false,
    });
    setApagando(false);
    setAviso(null);
    setHist((h) => {
      const base = { origem: 'importado' as const, id: m.id };
      return h ? aplicar(h, comBase(h.atual, base)) : iniciarHistorico(receitaNova(base, m.titulo, Date.now()));
    });
    setVisao('personalizar');
  };

  async function salvar() {
    const r = hist?.atual ?? sugerida;
    if (!r) return;
    const importado = r.base.origem === 'importado';
    const arquivo = importado && trazido?.id === r.base.id && !trazido.salvo ? trazido.blob : undefined;
    setSalvando(true);
    // Se a prévia ainda está carregando, espera um pouco para guardar a miniatura junto (sem WebGL, não espera).
    for (let i = 0; i < 80 && previaViva && !capturar.current && !erroNaBase.current; i++)
      await new Promise((ok) => setTimeout(ok, 100));
    const ok = await salvarMeuAvatar(usuario, r, {
      miniatura: capturar.current?.() ?? capturarDoEstudio.current?.() ?? miniaturaDoEstudio.current,
      credito: importado ? (trazido?.credito ?? undefined) : null,
      modelo: arquivo,
    });
    setSalvando(false);
    if (!ok) {
      setAviso({
        tom: 'erro',
        texto: t(
          'Não deu para guardar o avatar neste aparelho. O armazenamento do navegador pode estar cheio ou bloqueado.',
        ),
      });
      return;
    }
    setSalvo(r);
    setHist((h) => h ?? iniciarHistorico(r));
    if (importado && trazido) setTrazido({ ...trazido, salvo: true });
    setAviso({ tom: 'ok', texto: t('Avatar salvo neste aparelho.') });
  }

  async function apagar() {
    await apagarMeuAvatar(usuario);
    setSalvo(null);
    setHist(null);
    setTrazido(null);
    setApagando(false);
    setAviso({ tom: 'ok', texto: t('Avatar apagado. Você voltou à foto ou às iniciais.') });
  }

  const credito = atual
    ? linhaDeCredito(atual.base.origem === 'importado' ? (trazido?.credito ?? null) : null, modelo)
    : null;
  const itens = [
    { id: 'escolher', rotulo: t('Escolher') },
    { id: 'personalizar', rotulo: t('Personalizar') },
    { id: 'estudio', rotulo: t('Estúdio') },
    ...(politica.podeImportar ? [{ id: 'traga', rotulo: t('Traga o seu') }] : []),
  ];

  return (
    <div className="av-tela" data-testid="aba-avatar">
      {guiaAberto && sinais && (
        <Suspense fallback={null}>
          <GuiaDoAlfabeto aoFechar={() => setGuiaAberto(false)} />
        </Suspense>
      )}
      <p className="qc-nota">
        {t('O avatar é opcional e fica só neste aparelho. Nada dele é enviado para o servidor.')}
      </p>

      <div className="av-duas">
        <section
          className={previaViva ? 'av-previa' : 'av-previa av-previa-sem-canvas'}
          data-previa-viva={previaViva ? 'true' : 'false'}
          aria-label={t('Prévia do avatar')}
          data-testid="avatar-previa"
          data-importada={previaImportada ? 'true' : undefined}
        >
          <div className="av-previa-moldura">
            {atual && !previaViva ? null : atual ? (
              <AvatarCanvas
                receita={atual}
                estado="parado"
                emocao="neutro"
                tier={tier}
                tamanho={celular ? TAMANHO_NO_CELULAR : TAMANHO_NO_DESKTOP}
                modo={modo}
                {...(atual.pecas.length > 0 ? { pecas: { ids: atual.pecas, cores: atual.coresDasPecas } } : {})}
                usuarioId={usuario}
                fonte={fonteDaPrevia}
                aoAparencia={(sup) => {
                  if (!previaImportada) setSuporteDe({ base: atual.base.id, suporte: sup });
                }}
                aoPronto={(c) => {
                  capturar.current = c;
                }}
                aoErro={(motivo) => setErroDe({ base: atual.base.id, motivo })}
              />
            ) : (
              <p className="av-vazio">{t('Ainda não há modelos disponíveis.')}</p>
            )}
          </div>
          <div className="av-previa-texto">
            {atual && (
              <p className="av-credito" data-testid="avatar-credito">
                {previaImportada
                  ? `${t('Prévia, ainda não usada nem salva')} · ${previaImportada.titulo || t('Meu modelo')}`
                  : ehSugestao
                    ? t('Sugerido para você')
                    : sujo
                      ? t('Alterações não salvas')
                      : t('Salvo neste aparelho')}
                {!previaImportada &&
                  (modelo
                    ? ` · ${modelo.nome}`
                    : atual.base.origem === 'importado'
                      ? ` · ${trazido?.titulo || t('Meu modelo')}`
                      : '')}
              </p>
            )}
            {previaImportada && (
              <button
                type="button"
                className="q-ctl"
                onClick={() => setPreviaImportada(null)}
                data-testid="avatar-previa-voltar"
              >
                <RotateCcw aria-hidden /> {t('Voltar ao anterior')}
              </button>
            )}
            {atual && previaViva && (
              <div className="av-modo" role="group" aria-label={t('Enquadramento da prévia')}>
                {(['corpo', 'rosto'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="av-modo-botao"
                    aria-pressed={modo === m}
                    onClick={() => setModo(m)}
                    data-modo-da-previa={m}
                  >
                    {m === 'corpo' ? t('Corpo inteiro') : t('Rosto')}
                  </button>
                ))}
              </div>
            )}
            <div className="av-acoes av-acoes-previa">
              <button
                type="button"
                className="q-ctl pri"
                onClick={() => void salvar()}
                disabled={!atual || salvando || !!previaImportada || (!ehSugestao && !sujo)}
                data-testid="avatar-salvar"
              >
                <Save aria-hidden />{' '}
                {!ehSugestao && !sujo && !previaImportada ? t('Avatar já salvo') : t('Salvar este avatar')}
              </button>
            </div>
            <div role="status" aria-live="polite" data-testid="avatar-status" className="av-status">
              {aviso && (
                <span className="qc-nota" data-tom={aviso.tom}>
                  {aviso.tom === 'ok' && <Check aria-hidden />}
                  {aviso.texto}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="av-extra">
          {sinais && (
            <div className="av-credito" data-testid="avatar-guia-linha">
              <p style={{ margin: '0 0 8px' }}>
                {t(
                  'Alfabeto manual de Libras e ASL: veja cada letra e número e soletre uma palavra. É soletração, não tradução; as poses são de demonstração e ainda não foram revisadas por pessoas surdas.',
                )}
              </p>
              <button
                type="button"
                className="q-ctl"
                aria-haspopup="dialog"
                onClick={() => setGuiaAberto(true)}
                data-testid="avatar-abrir-guia"
              >
                <BookOpen aria-hidden /> {t('Alfabeto manual')}
              </button>
            </div>
          )}
          {credito && (
            <div className="av-credito" data-testid="avatar-credito-linha">
              <p style={{ margin: 0 }}>{credito}</p>
              {modelo && (
                <details>
                  <summary>{t('Ver crédito completo')}</summary>
                  <p style={{ margin: '6px 0 0' }}>{t('Crédito: {credito}', { credito: modelo.credito })}</p>
                </details>
              )}
            </div>
          )}
          {erroDaPrevia && (
            <p className="av-credito" role="status" data-testid="avatar-sem-3d">
              {t('Não deu para mostrar o avatar em 3D neste aparelho. Você pode escolher e salvar mesmo assim.')}
            </p>
          )}
          {salvo && !apagando && (
            <button type="button" className="q-ctl" onClick={() => setApagando(true)} data-testid="avatar-apagar">
              <Trash2 aria-hidden /> {t('Apagar meu avatar')}
            </button>
          )}
          {apagando && (
            <div className="av-aviso" role="alertdialog" aria-label={t('Apagar meu avatar')} data-tom="erro">
              <AlertTriangle aria-hidden />
              <div>
                <p style={{ margin: 0 }}>
                  {t(
                    'Apagar seu avatar e o arquivo que você trouxe? Isso não dá para desfazer. A foto ou as iniciais voltam.',
                  )}
                </p>
                <div className="av-acoes" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="q-ctl"
                    onClick={() => void apagar()}
                    data-testid="avatar-apagar-confirma"
                    autoFocus
                  >
                    {t('Sim, apagar')}
                  </button>
                  <button type="button" className="q-ctl" onClick={() => setApagando(false)}>
                    {t('Cancelar')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="av-tela av-controles">
          <AbasDoQuest
            rotuloDoGrupo={t('Seções do avatar')}
            grade
            ativo={visao}
            aoTrocar={(v) => setVisao(v as Visao)}
            itens={itens}
          />
          <PainelDeAba id="escolher" ativo={visao} className="av-tela">
            <Escolher
              escolhido={atual && !ehSugestao ? atual.base.id : null}
              trazido={trazido ? { id: trazido.id, titulo: trazido.titulo } : null}
              podeImportar={politica.podeImportar}
              aoEscolher={escolher}
              aoEscolherTrazido={() => trazido && comecarDe({ origem: 'importado', id: trazido.id }, trazido.titulo)}
              aoSortear={sortear}
              aoDispensar={dispensar}
            />
          </PainelDeAba>
          <PainelDeAba id="personalizar" ativo={visao} className="av-tela">
            {hist ? (
              <Personalizar
                receita={hist.atual}
                suporte={suporteEfetivo}
                podeDesfazer={hist.passado.length > 0}
                noPadrao={estaNoPadrao(hist.atual)}
                aoPaleta={(c, id) => editar((r) => comPaleta(r, c, id))}
                aoAjuste={(k, v) => editar((r) => comAjuste(r, k, v))}
                aoNome={(n) => editar((r) => comNome(r, n))}
                aoDesfazer={() => setHist((h) => (h ? desfazer(h) : h))}
                aoRestaurar={() => editar(restaurarPadrao)}
              />
            ) : (
              <p className="qc-nota" data-testid="avatar-personalizar-vazio">
                {carregado || !salvo ? t('Escolha um modelo primeiro; depois dá para personalizar.') : t('Carregando…')}
              </p>
            )}
          </PainelDeAba>
          <PainelDeAba id="estudio" ativo={visao} className="av-tela">
            {hist ? (
              <EstudioDoAvatar
                receita={hist.atual}
                aoMudar={(r) => editar(() => r)}
                tier={tier}
                fonte={fonteDaPrevia}
                usuarioId={usuario}
                nivel={nivel}
                saldoSeeds={saldoSeeds}
                tamanho={celular ? TAMANHO_NO_CELULAR : 220}
                aoMiniatura={(url) => {
                  miniaturaDoEstudio.current = url;
                }}
                aoCapturar={(c) => {
                  capturarDoEstudio.current = c;
                }}
              />
            ) : (
              <p className="qc-nota" data-testid="avatar-estudio-vazio">
                {carregado || !salvo ? t('Escolha um modelo primeiro; depois dá para montar peças.') : t('Carregando…')}
              </p>
            )}
          </PainelDeAba>
          {politica.podeImportar && (
            <PainelDeAba id="traga" ativo={visao} className="av-tela">
              <TragaOSeu
                tier={tier}
                aoUsar={usarTrazido}
                aoPrevisualizar={(m) =>
                  setPreviaImportada(
                    m
                      ? {
                          blob: new Blob([m.bytes.slice().buffer as ArrayBuffer], { type: 'model/gltf-binary' }),
                          titulo: m.titulo,
                        }
                      : null,
                  )
                }
              />
            </PainelDeAba>
          )}
        </div>
      </div>
    </div>
  );
}
