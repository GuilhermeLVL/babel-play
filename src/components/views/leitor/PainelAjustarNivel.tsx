import '../../../styles/ajustarNivel.css';

import { ChevronDown, ChevronUp, Copy, Lightbulb, Loader2, ScrollText, Sparkles, Volume2, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  type AcaoDeUmaChamada,
  conhecidasParaOPedido,
  type EscopoDoAjuste,
  estimarCapitulo,
  MAX_CARACTERES_DO_AJUSTE,
  NIVEIS_DO_AJUSTE,
  type NivelDoAjuste,
  nivelVizinho,
  paragrafosDoCapitulo as separarParagrafos,
} from '../../../core/leitura/ajustarNivel';
import {
  type EstadoDaFerramenta,
  estadoDoAjustarNivel,
  type FatosDoAjustarNivel,
} from '../../../core/leitura/ferramentasDeIa';
import type { AjusteDeNivel, FalhaDoAjuste, PedidoDeAjusteNaRede } from '../../../data/rotas/ajustarNivel';
import { fetchPalavrasMarcadas } from '../../../data/rotas/palavrasMarcadas';
import { t } from '../../../lib/i18n';
import { ajustarCapitulo, ajustarComCache, type ResultadoDoCapitulo } from '../../../lib/leitor/ajustarNivelDoLeitor';
import { fraseDoMotivo } from './ferramentasDeIaTextos';
import { useFatosDoAjustarNivel } from './useFatosDoAjustarNivel';

/**
 * O "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D): reescreve uma palavra, um trecho, um parágrafo ou o capítulo
 * num nível de A1 a C2, com o ORIGINAL AO LADO (abas no celular). NUNCA altera o texto do livro: o painel só mostra.
 *
 * Quem abre é o balão (fatia B) por `abrirAjustarNivel(trecho, escopo, nivelInicial?)`. Com a flag `ia_ajustar_nivel`
 * desligada o painel não renderiza nada e nenhuma rota é chamada. Cada ação passa pelo MESMO estado de ferramenta
 * (flag, entrar, idade, plano, cota, conexão), o servidor decide de verdade, e o custo de cada resposta aparece na tela.
 */

/** O que o painel precisa saber do trecho (um `TrechoDoLeitor` do contrato da fatia 0 serve, é um superconjunto). */
export interface TrechoParaAjuste {
  texto: string;
  frase: string;
  paragrafo: string;
  idioma: string;
}

interface Aberto {
  id: number;
  trecho: TrechoParaAjuste;
  escopo: EscopoDoAjuste;
  nivelInicial?: NivelDoAjuste;
}

let aberto: Aberto | null = null;
let contador = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Abre o painel (a fatia B chama). Com a flag desligada o painel não monta e nada acontece. */
export function abrirAjustarNivel(
  trecho: TrechoParaAjuste,
  escopo: EscopoDoAjuste,
  nivelInicial?: NivelDoAjuste,
): void {
  aberto = { id: ++contador, trecho, escopo, nivelInicial };
  avisar();
}

export function fecharAjustarNivel(): void {
  if (!aberto) return;
  aberto = null;
  avisar();
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};
const ler = () => aberto;

const NOME_DO_NIVEL: Record<NivelDoAjuste, () => string> = {
  A1: () => t('A1 · iniciante'),
  A2: () => t('A2 · básico'),
  B1: () => t('B1 · intermediário'),
  B2: () => t('B2 · intermediário superior'),
  C1: () => t('C1 · avançado'),
  C2: () => t('C2 · proficiente'),
};

const NOME_DO_ESCOPO: Record<EscopoDoAjuste, () => string> = {
  palavra: () => t('Palavra'),
  trecho: () => t('Trecho'),
  paragrafo: () => t('Parágrafo'),
  capitulo: () => t('Capítulo'),
};

const TITULO_DA_ACAO: Record<AcaoDeUmaChamada, () => string> = {
  exemplo: () => t('Exemplo'),
  gramatica: () => t('Gramática'),
  resumo: () => t('Resumo até aqui'),
};

export function frasePeloMotivoDaFalha(motivo: FalhaDoAjuste, capitulo = false): string {
  switch (motivo) {
    case 'filtrada':
      return t('Não foi possível mostrar este texto. O original continua aqui.');
    case 'cota':
      return capitulo
        ? t('Você usou os ajustes de capítulo deste mês. Ler e ouvir continuam grátis.')
        : t('Você usou os ajustes deste mês. Ler e ouvir continuam grátis.');
    case 'uso_justo':
      return t('Você usou os de hoje; volta amanhã.');
    case 'plano':
      return t('Faz parte dos planos pagos. Ler e ouvir seguem grátis.');
    case 'sem_conta':
      return t('Entre na sua conta para usar.');
    case 'idade':
      return t('Fica disponível quando um responsável liberar a sua conta.');
    case 'nuvem_ocupada':
      return t('A IA está ocupada agora. Tente de novo em instantes.');
    case 'fora':
      return t('Em breve. Ainda não está liberada para todo mundo.');
    case 'invalido':
      return t('Este trecho não pôde ser ajustado. Tente selecionar um pedaço menor.');
    case 'indisponivel':
      return t('Não deu para ajustar agora. O original continua aqui; tente de novo.');
  }
}

/** Uma moeda curta para o custo (US$ com 4 casas abaixo de 1 centavo; o app não converte câmbio). */
function dinheiro(usd: number): string {
  if (usd <= 0) return 'US$ 0';
  return `US$ ${usd < 0.01 ? usd.toFixed(5) : usd.toFixed(3)}`;
}

function LinhaDeCusto({ valor, doCache }: { valor: AjusteDeNivel['custo']; doCache?: boolean }) {
  if (doCache) return <p className="ajn-custo">{t('Guardado neste aparelho: sem custo e sem gastar seus ajustes.')}</p>;
  return (
    <p className="ajn-custo" data-testid="ajn-custo">
      {t('Uso deste ajuste: {tokens} tokens · {usd} · {n} chamada(s)', {
        tokens: valor.tokensEntrada + valor.tokensSaida,
        usd: dinheiro(valor.usd),
        n: valor.chamadas,
      })}
    </p>
  );
}

function Medida({ ajuste, alvo }: { ajuste: AjusteDeNivel; alvo: NivelDoAjuste }) {
  /* O nível MEDIDO, nunca o prometido: é uma estimativa feita no aparelho. */
  const medido =
    ajuste.nivelMedido && ajuste.confianciaDaMedida !== 'baixa'
      ? t('Nível medido: cerca de {nivel} (estimativa)', { nivel: ajuste.nivelMedido })
      : t('Nível não medido neste idioma. Confira se o texto ficou do jeito que você queria.');
  return (
    <>
      <p className="ajn-medida" data-testid="ajn-medida">
        {medido}
      </p>
      {ajuste.foraDoNivel ? (
        <p className="ajn-aviso" role="status">
          {t('Pode ter ficado fora do nível {nivel}. Você pode tentar de novo ou escolher outro nível.', {
            nivel: alvo,
          })}
        </p>
      ) : null}
      {ajuste.conhecidasTrocadas.length > 0 ? (
        <p className="ajn-aviso" role="status" data-testid="ajn-trocadas">
          {t('Algumas palavras que você já conhece foram trocadas: {lista}.', {
            lista: ajuste.conhecidasTrocadas.slice(0, 8).join(', '),
          })}
        </p>
      ) : null}
    </>
  );
}

/** O que a pessoa já conhece (as marcadas "Já sei"), lido uma vez por idioma. Nada disso sai do aparelho além das formas do texto. */
function useConhecidas(idioma: string, extras?: () => Iterable<string>): () => string[] {
  const ref = useRef<string[]>([]);
  useEffect(() => {
    let vivo = true;
    void fetchPalavrasMarcadas(idioma.split('-')[0]).then((m) => {
      if (vivo && m) ref.current = m.filter((x) => x.estado === 'conhecida').map((x) => x.chave);
    });
    return () => {
      vivo = false;
    };
  }, [idioma]);
  return useCallback(() => [...ref.current, ...(extras ? [...extras()] : [])], [extras]);
}

export interface PropsDoPainelAjustarNivel {
  /** O idioma de quem estuda (a gramática é explicada nele). */
  idiomaDaPessoa: string;
  /** O nível de partida quando quem abre não diz (o da pessoa, no perfil). Padrão B1. */
  nivelDaPessoa?: NivelDoAjuste;
  /** Os parágrafos do capítulo em exibição (o painel só LÊ). Sem isto, o escopo capítulo não se oferece. */
  paragrafosDoCapitulo?: () => readonly string[];
  /** O texto lido até aqui (para "Resumo até aqui"); sem isto, usa o parágrafo. */
  textoAteAqui?: () => string;
  /** Outras formas conhecidas (o índice de vocabulário da fatia C), somadas às marcadas "Já sei". */
  conhecidasExtras?: () => Iterable<string>;
  /** "Ouvir" (a fatia B publica `lerEmVozAlta`). Sem isto, o botão não aparece. */
  aoOuvir?: (texto: string, idioma: string) => void;
}

type Fase = 'pronto' | 'pedindo' | 'feito' | 'erro';

export default function PainelAjustarNivel(props: PropsDoPainelAjustarNivel) {
  const atual = useSyncExternalStore(assinar, ler, ler);
  const [cotaEsgotada, setCotaEsgotada] = useState<FatosDoAjustarNivel['cotaEsgotada']>();
  const fatos = useFatosDoAjustarNivel(cotaEsgotada);
  /* Flag desligada ou nada aberto: o painel não existe (nenhuma entrada, nenhuma rota). */
  if (!fatos.flagLigada || !atual) return null;
  return (
    <Corpo
      key={atual.id}
      aberto={atual}
      fatos={fatos}
      props={props}
      aoEsgotar={(capitulo, janela) => setCotaEsgotada((c) => ({ ...c, [capitulo ? 'capitulo' : 'nivel']: janela }))}
    />
  );
}

function Corpo({
  aberto: a,
  fatos,
  props,
  aoEsgotar,
}: {
  aberto: Aberto;
  fatos: FatosDoAjustarNivel;
  props: PropsDoPainelAjustarNivel;
  aoEsgotar: (capitulo: boolean, janela: 'dia' | 'mes') => void;
}) {
  const { trecho, escopo } = a;
  const [nivel, setNivel] = useState<NivelDoAjuste>(a.nivelInicial ?? props.nivelDaPessoa ?? 'B1');
  const [fase, setFase] = useState<Fase>('pronto');
  const [ajuste, setAjuste] = useState<AjusteDeNivel | null>(null);
  const [doCache, setDoCache] = useState(false);
  const [falha, setFalha] = useState<FalhaDoAjuste | null>(null);
  const [extra, setExtra] = useState<{ acao: AcaoDeUmaChamada; valor: AjusteDeNivel; doCache: boolean } | null>(null);
  const [aba, setAba] = useState<'original' | 'ajustado'>('ajustado');
  const [capitulo, setCapitulo] = useState<ResultadoDoCapitulo | null>(null);
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const conhecidasDaPessoa = useConhecidas(trecho.idioma, props.conhecidasExtras);

  const estado: EstadoDaFerramenta = estadoDoAjustarNivel(fatos, escopo === 'capitulo');
  const disponivel = estado.disponivel;

  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && fecharAjustarNivel();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, []);

  /* O texto de cada escopo, sempre dentro do teto do servidor. */
  const original = useMemo(() => {
    const bruto =
      escopo === 'palavra' ? trecho.texto : escopo === 'paragrafo' ? trecho.paragrafo || trecho.texto : trecho.texto;
    return bruto.slice(0, MAX_CARACTERES_DO_AJUSTE);
  }, [escopo, trecho]);

  const paragrafosDoLivro = useMemo(
    () => (escopo === 'capitulo' ? separarParagrafos((props.paragrafosDoCapitulo?.() ?? []).join('\n\n')) : []),
    [escopo, props],
  );
  const estimativa = useMemo(
    () => (escopo === 'capitulo' ? estimarCapitulo(paragrafosDoLivro) : null),
    [escopo, paragrafosDoLivro],
  );

  const tratarFalha = useCallback(
    (motivo: FalhaDoAjuste, capituloDaCota?: boolean) => {
      setFalha(motivo);
      setFase('erro');
      if (motivo === 'cota') aoEsgotar(capituloDaCota ?? escopo === 'capitulo', 'mes');
      if (motivo === 'uso_justo') aoEsgotar(false, 'dia');
    },
    [aoEsgotar, escopo],
  );

  const ajustar = useCallback(
    async (alvo: NivelDoAjuste) => {
      ctrl.current?.abort();
      const c = (ctrl.current = new AbortController());
      setNivel(alvo);
      setFase('pedindo');
      setFalha(null);
      setExtra(null);
      const pedido: PedidoDeAjusteNaRede = {
        texto: original,
        ...(escopo === 'palavra' ? { frase: trecho.frase.slice(0, 400) } : {}),
        idioma: trecho.idioma,
        escopo,
        nivelAlvo: alvo,
        idiomaDaPessoa: props.idiomaDaPessoa,
        conhecidas: conhecidasParaOPedido(original, conhecidasDaPessoa()),
      };
      const r = await ajustarComCache(pedido, c.signal);
      if (c.signal.aborted) return;
      if (r.ok === false) return tratarFalha(r.motivo, r.capitulo);
      setAjuste(r.valor);
      setDoCache(r.doCache);
      setFase('feito');
      setAba('ajustado');
    },
    [conhecidasDaPessoa, escopo, original, props.idiomaDaPessoa, tratarFalha, trecho],
  );

  const acaoSimples = useCallback(
    async (acao: AcaoDeUmaChamada) => {
      ctrl.current?.abort();
      const c = (ctrl.current = new AbortController());
      setFase('pedindo');
      setFalha(null);
      const aoLado = escopo === 'palavra';
      const texto =
        acao === 'resumo'
          ? (props.textoAteAqui?.() ?? trecho.paragrafo ?? original).slice(-MAX_CARACTERES_DO_AJUSTE)
          : acao === 'gramatica'
            ? (trecho.frase || original).slice(0, MAX_CARACTERES_DO_AJUSTE)
            : original;
      const r = await ajustarComCache(
        {
          texto,
          idioma: trecho.idioma,
          escopo: acao === 'exemplo' && aoLado ? 'palavra' : acao === 'resumo' ? 'paragrafo' : 'trecho',
          nivelAlvo: nivel,
          acao,
          idiomaDaPessoa: props.idiomaDaPessoa,
          conhecidas: conhecidasParaOPedido(texto, conhecidasDaPessoa()),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      if (r.ok === false) return tratarFalha(r.motivo);
      setExtra({ acao, valor: r.valor, doCache: r.doCache });
      setFase('feito');
    },
    [conhecidasDaPessoa, escopo, nivel, original, props, tratarFalha, trecho],
  );

  const ajustarOCapitulo = useCallback(async () => {
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setFase('pedindo');
    setFalha(null);
    setCapitulo(null);
    setAndamento({ feitos: 0, total: paragrafosDoLivro.length });
    const r = await ajustarCapitulo({
      paragrafos: paragrafosDoLivro,
      idioma: trecho.idioma,
      alvo: nivel,
      conhecidasDaPessoa: conhecidasDaPessoa(),
      sinal: c.signal,
      aoProgresso: (pr, parcial) => {
        setAndamento(pr);
        setCapitulo({
          ajustados: [...parcial],
          situacao: 'cancelado',
          custo: { tokensEntrada: 0, tokensSaida: 0, usd: 0, chamadas: 0 },
          doCache: 0,
        });
      },
    });
    setCapitulo(r);
    setAndamento(null);
    if (r.situacao === 'erro' && r.motivo) tratarFalha(r.motivo, true);
    else setFase('feito');
  }, [conhecidasDaPessoa, nivel, paragrafosDoLivro, tratarFalha, trecho.idioma]);

  /* Escopos que não são o capítulo pedem sozinhos ao abrir: o toque no balão JÁ É o pedido (e repetir vem do aparelho). */
  const jaPediu = useRef(false);
  useEffect(() => {
    if (jaPediu.current || escopo === 'capitulo' || !disponivel) return;
    jaPediu.current = true;
    void ajustar(nivel);
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponivel]);

  const acoes: Array<{ chave: string; rotulo: string; icone: ReactNode; ativo: boolean; ao: () => void }> = [
    {
      chave: 'simplificar',
      rotulo: t('Simplificar'),
      icone: <ChevronDown aria-hidden />,
      ativo: nivelVizinho(nivel, 'baixo') !== null,
      ao: () => void ajustar(nivelVizinho(nivel, 'baixo') ?? nivel),
    },
    {
      chave: 'elevar',
      rotulo: t('Elevar'),
      icone: <ChevronUp aria-hidden />,
      ativo: nivelVizinho(nivel, 'cima') !== null,
      ao: () => void ajustar(nivelVizinho(nivel, 'cima') ?? nivel),
    },
    {
      chave: 'exemplo',
      rotulo: t('Dar um exemplo'),
      icone: <Lightbulb aria-hidden />,
      ativo: true,
      ao: () => void acaoSimples('exemplo'),
    },
    {
      chave: 'gramatica',
      rotulo: t('Explicar a gramática'),
      icone: <ScrollText aria-hidden />,
      ativo: true,
      ao: () => void acaoSimples('gramatica'),
    },
    {
      chave: 'resumo',
      rotulo: t('Resumo até aqui'),
      icone: <Sparkles aria-hidden />,
      ativo: true,
      ao: () => void acaoSimples('resumo'),
    },
  ];
  const ocupado = fase === 'pedindo';
  const motivo = fraseDoMotivo(estado);

  return (
    <aside
      className="ajn"
      role="dialog"
      aria-modal="false"
      aria-label={t('Ajustar nível')}
      data-testid="painel-ajustar-nivel"
    >
      <header className="ajn-topo">
        <h2>
          {t('Ajustar nível')} <span className="ajn-escopo">· {NOME_DO_ESCOPO[escopo]()}</span>
        </h2>
        <button
          type="button"
          className="btn btn-outline leitor-alvo"
          onClick={fecharAjustarNivel}
          aria-label={t('Fechar')}
        >
          <X aria-hidden />
        </button>
      </header>

      <div className="ajn-niveis" role="radiogroup" aria-label={t('Nível')}>
        {NIVEIS_DO_AJUSTE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === nivel}
            title={NOME_DO_NIVEL[n]()}
            className={`ajn-nivel leitor-alvo${n === nivel ? ' ajn-nivel--ativo' : ''}`}
            disabled={!disponivel || ocupado || (escopo === 'capitulo' && fase !== 'pronto')}
            onClick={() => (escopo === 'capitulo' ? setNivel(n) : void ajustar(n))}
          >
            {n}
          </button>
        ))}
      </div>

      {!disponivel ? (
        <p className="ajn-motivo" role="status" data-testid="ajn-motivo">
          {motivo}
        </p>
      ) : null}

      {escopo === 'capitulo' ? (
        <>
          <Capitulo
            estimativa={estimativa}
            paragrafos={paragrafosDoLivro}
            fase={fase}
            andamento={andamento}
            resultado={capitulo}
            nivel={nivel}
            disponivel={disponivel}
            aoConfirmar={() => void ajustarOCapitulo()}
            aoCancelar={() => ctrl.current?.abort()}
          />
          {fase === 'erro' && falha ? (
            <p className="ajn-erro" role="alert" data-testid="ajn-erro">
              {frasePeloMotivoDaFalha(falha, true)}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="ajn-abas" role="tablist" aria-label={t('Original e ajustado')}>
            {(['original', 'ajustado'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={aba === k}
                className={`ajn-aba${aba === k ? ' ajn-aba--ativa' : ''}`}
                onClick={() => setAba(k)}
              >
                {k === 'original' ? t('Original') : t('Ajustado')}
              </button>
            ))}
          </div>
          <div className="ajn-colunas" data-aba={aba}>
            <section className="ajn-coluna ajn-coluna--original" aria-label={t('Original')}>
              <h3>{t('Original')}</h3>
              <p lang={trecho.idioma} data-testid="ajn-original">
                {original}
              </p>
            </section>
            <section className="ajn-coluna ajn-coluna--ajustado" aria-label={t('Ajustado')} aria-live="polite">
              <h3>
                {t('Ajustado')} · {nivel}
              </h3>
              {ocupado ? (
                <p className="ajn-espera">
                  <Loader2 className="ajn-giro" aria-hidden /> {t('Ajustando o texto…')}
                </p>
              ) : fase === 'erro' && falha ? (
                <p className="ajn-erro" role="alert" data-testid="ajn-erro">
                  {frasePeloMotivoDaFalha(falha)}
                </p>
              ) : ajuste ? (
                <p lang={trecho.idioma} data-testid="ajn-ajustado">
                  {ajuste.ajustado}
                </p>
              ) : (
                <p className="ajn-espera">{t('Escolha o nível para ajustar.')}</p>
              )}
            </section>
          </div>
          {ajuste && fase !== 'erro' ? (
            <>
              <Medida ajuste={ajuste} alvo={nivel} />
              <LinhaDeCusto valor={ajuste.custo} doCache={doCache} />
              <div className="ajn-acoes-curtas">
                <button
                  type="button"
                  className="btn btn-outline leitor-alvo"
                  onClick={() => void navigator.clipboard?.writeText(ajuste.ajustado)}
                >
                  <Copy aria-hidden /> {t('Copiar')}
                </button>
                {props.aoOuvir ? (
                  <button
                    type="button"
                    className="btn btn-outline leitor-alvo"
                    onClick={() => props.aoOuvir?.(ajuste.ajustado, trecho.idioma)}
                  >
                    <Volume2 aria-hidden /> {t('Ouvir')}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="ajn-acoes" aria-label={t('Ações de 1 toque')}>
            {acoes.map((x) => (
              <button
                key={x.chave}
                type="button"
                className="btn btn-outline leitor-alvo"
                disabled={!disponivel || ocupado || !x.ativo}
                onClick={x.ao}
                data-testid={`ajn-acao-${x.chave}`}
              >
                {x.icone} {x.rotulo}
              </button>
            ))}
          </div>
          {extra ? (
            <section className="ajn-extra" aria-live="polite" data-testid="ajn-extra">
              <h3>{TITULO_DA_ACAO[extra.acao]()}</h3>
              <p>{extra.valor.ajustado}</p>
              <LinhaDeCusto valor={extra.valor.custo} doCache={extra.doCache} />
            </section>
          ) : null}
        </>
      )}
    </aside>
  );
}

function Capitulo({
  estimativa,
  paragrafos,
  fase,
  andamento,
  resultado,
  nivel,
  disponivel,
  aoConfirmar,
  aoCancelar,
}: {
  estimativa: ReturnType<typeof estimarCapitulo> | null;
  paragrafos: readonly string[];
  fase: Fase;
  andamento: { feitos: number; total: number } | null;
  resultado: ResultadoDoCapitulo | null;
  nivel: NivelDoAjuste;
  disponivel: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  if (paragrafos.length === 0 || !estimativa)
    return <p className="ajn-espera">{t('Abra um capítulo para ajustar o nível dele.')}</p>;
  if (fase === 'pronto')
    return (
      <div className="ajn-confirma" data-testid="ajn-confirma">
        <p>
          {t('Vamos ajustar {n} parágrafos para o nível {nivel}, um de cada vez. Você pode cancelar quando quiser.', {
            n: estimativa.paragrafos,
            nivel,
          })}
        </p>
        <p className="ajn-custo" data-testid="ajn-estimativa">
          {t('Estimativa: de {min} a {max} (cerca de {tokens} tokens). Conta como 1 ajuste de capítulo do mês.', {
            min: dinheiro(estimativa.usdMinimo),
            max: dinheiro(estimativa.usdMaximo),
            tokens: estimativa.tokensEntrada + estimativa.tokensSaida,
          })}
        </p>
        <button type="button" className="btn btn-primary leitor-alvo" disabled={!disponivel} onClick={aoConfirmar}>
          {t('Ajustar o capítulo')}
        </button>
      </div>
    );
  const feitos = resultado?.ajustados.filter(Boolean).length ?? 0;
  return (
    <div className="ajn-capitulo" data-testid="ajn-capitulo">
      {fase === 'pedindo' && andamento ? (
        <div className="ajn-progresso">
          <progress max={andamento.total} value={andamento.feitos} aria-label={t('Progresso do capítulo')} />
          <span>{t('{feitos} de {total} parágrafos', { feitos: andamento.feitos, total: andamento.total })}</span>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={aoCancelar}>
            {t('Cancelar')}
          </button>
        </div>
      ) : (
        <p className="ajn-medida" role="status">
          {resultado?.situacao === 'completo'
            ? t('Pronto: {n} parágrafos ajustados.', { n: feitos })
            : resultado?.situacao === 'cancelado'
              ? t('Cancelado. Os {n} parágrafos já feitos ficam aqui.', { n: feitos })
              : t('Parou em {n} parágrafos. Os já feitos ficam aqui.', { n: feitos })}
        </p>
      )}
      {resultado ? <LinhaDeCusto valor={resultado.custo} /> : null}
      <ol className="ajn-lista">
        {paragrafos.map((p, i) => {
          const feito = resultado?.ajustados[i];
          return feito ? (
            <li key={i} className="ajn-par">
              <p className="ajn-par-original" lang="und">
                {p}
              </p>
              <p className="ajn-par-ajustado">{feito.ajustado}</p>
            </li>
          ) : null;
        })}
      </ol>
    </div>
  );
}
