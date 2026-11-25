import '../../../styles/leituraAtiva.css';

import { motivoLegivel } from '@core';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { ETIQUETA_DO_DIARIO, pontoParaCartao } from '../../../core/diario/pontoParaCartao';
import { type CategoriaDeRisco, sinalDeRisco } from '../../../core/diario/sinaisDeRisco';
import { conferirEscrita, contarPalavrasDaEscrita } from '../../../core/leitura/conferenciaLocal';
import { dadosPessoaisNoTexto, type TrechoPessoal } from '../../../core/leitura/dadosPessoais';
import { chavesConhecidas } from '../../../core/vocabulario/marcadas';
import { bulkAddCards } from '../../../data/api';
import {
  type FalhaDoDiario,
  pedirRetornoDoDiario,
  type RetornoDaEscrita,
  type TipoDePonto,
} from '../../../data/apiDoEstudo';
import { salvarEtiquetasDoCartao } from '../../../data/rotas/historicoDaPalavra';
import { acessoDoDiario } from '../../../lib/diario/acesso';
import {
  apagarODiario,
  apagarRascunhoDoDiario,
  diarioEmTxt,
  type EntradaDoDiario,
  gravarNivelDoDiario,
  gravarRascunhoDoDiario,
  historicoDoDiario,
  lerNivelDoDiario,
  lerRascunhoDoDiario,
  type NivelDoDiario,
} from '../../../lib/diario/historico';
import {
  type IdiomaDoDiario,
  IDIOMAS_DO_DIARIO,
  MAX_PALAVRAS_DO_DIARIO,
  MIN_PALAVRAS_DO_DIARIO,
} from '../../../lib/estudo/promptDoDiario';
import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { t } from '../../../lib/i18n';
import { irPara } from '../../../lib/irPara';
import { useLangConfig } from '../../../lib/langConfig';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';

type Fase =
  | { fase: 'escrevendo' }
  | { fase: 'enviando' }
  | { fase: 'conferido' }
  | { fase: 'risco'; categoria: CategoriaDeRisco }
  | { fase: 'retorno'; retorno: RetornoDaEscrita; entradaId: string }
  | { fase: 'falhou'; falha: FalhaDoDiario };

/** O destino de cada ponto na tela de retorno. */
type Destino = { tipo: 'guardado' } | { tipo: 'recusado'; motivo: string } | { tipo: 'descartado' };

const ROTULO_DO_TIPO: Record<TipoDePonto, () => string> = {
  sentido: () => t('o sentido'),
  tempoVerbal: () => t('o tempo do verbo'),
  concordancia: () => t('a concordância'),
  ortografia: () => t('a escrita da palavra'),
  palavra: () => t('a escolha da palavra'),
  outro: () => t('um detalhe'),
};
const NUMEROS = ['①', '②', '③'];
const DEMORA_MS = 15_000;

/** Uma pergunta por dia (o prompt do dia é opcional: a pessoa escreve o que quiser). */
const PROMPTS_DO_DIA: ReadonlyArray<() => string> = [
  () => t('Conte uma coisa que você viu hoje.'),
  () => t('O que você comeu hoje e o que achou?'),
  () => t('Com quem você conversou hoje?'),
  () => t('Qual foi a melhor parte do seu dia?'),
  () => t('O que você quer fazer amanhã?'),
  () => t('Descreva um lugar por onde você passou hoje.'),
  () => t('Conte algo que te surpreendeu esta semana.'),
];
const promptDeHoje = (): string => {
  const dia = Math.floor(Date.now() / 86_400_000);
  return PROMPTS_DO_DIA[dia % PROMPTS_DO_DIA.length]();
};

const idiomaInicial = (studying: string): IdiomaDoDiario => {
  const base = studying.slice(0, 2).toLowerCase();
  return (IDIOMAS_DO_DIARIO as readonly string[]).includes(base) ? (base as IdiomaDoDiario) : 'en';
};

const novoId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * O DIÁRIO (`/diario`; openspec `diario-com-correcao-que-vira-cartao`). Escrever livremente (20 a 200 palavras) no idioma
 * que a pessoa aprende; o rascunho e o histórico ficam SÓ NO APARELHO. Nos planos pagos (adulto declarado), "Pedir
 * retorno" devolve 1 elogio e até 3 correções, e cada correção vira um cartão com um toque. No resto (Grátis, perfil
 * protegido, sem conta), "Conferir sozinho", no aparelho, sem chamada de IA. Atrás da flag `diario` (portão no App).
 */
export default function Diario() {
  const protegido = perfilProtegido();
  const acesso = acessoDoDiario(protegido);
  const { studying, mine } = useLangConfig();
  const [idioma, setIdioma] = useState<IdiomaDoDiario>(() => idiomaInicial(studying));
  const [nivel, setNivel] = useState<NivelDoDiario>(() => lerNivelDoDiario());
  const [texto, setTexto] = useState(() => lerRascunhoDoDiario());
  const [estado, setEstado] = useState<Fase>({ fase: 'escrevendo' });
  const [demorando, setDemorando] = useState(false);
  const [historico, setHistorico] = useState<EntradaDoDiario[]>([]);
  const [semHistorico, setSemHistorico] = useState(false);
  const [confirmaApagar, setConfirmaApagar] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const snapshot = useSnapshotDasEtiquetas();

  useEffect(() => {
    let vivo = true;
    void historicoDoDiario()
      .listar()
      .then((l) => vivo && setHistorico(l));
    return () => {
      vivo = false;
    };
  }, []);
  /* O idioma só segue "Estudando" até a pessoa escolher à mão. */
  useEffect(() => setIdioma(idiomaInicial(studying)), [studying]);
  useEffect(() => {
    /* Com o retorno na tela a entrada já está no histórico: o rascunho não volta. */
    if (estado.fase === 'retorno' || estado.fase === 'risco') return;
    const id = window.setTimeout(() => gravarRascunhoDoDiario(texto), 1000);
    return () => window.clearTimeout(id);
  }, [texto, estado.fase]);
  useEffect(() => {
    if (estado.fase !== 'enviando') return;
    setDemorando(false);
    const id = window.setTimeout(() => setDemorando(true), DEMORA_MS);
    return () => window.clearTimeout(id);
  }, [estado.fase]);

  const palavras = contarPalavrasDaEscrita(texto);
  const pessoais = useMemo(() => dadosPessoaisNoTexto(texto), [texto]);
  const tamanhoOk = palavras >= MIN_PALAVRAS_DO_DIARIO && palavras <= MAX_PALAVRAS_DO_DIARIO;
  const conferencia = useMemo(
    () =>
      conferirEscrita({
        texto,
        palavrasAlvo: [...chavesConhecidas(snapshot.caderno, snapshot.marcadas, idioma)].slice(0, 500),
        lang: idioma,
      }),
    [texto, snapshot, idioma],
  );
  const dia = useMemo(() => promptDeHoje(), []);

  /** Guarda a entrada no histórico local (e no estado da tela). */
  const guardarEntrada = async (e: EntradaDoDiario) => {
    const ok = await historicoDoDiario().gravar(e);
    setSemHistorico(!ok);
    if (ok) setHistorico((antes) => [e, ...antes.filter((x) => x.id !== e.id)]);
  };

  const pedir = async () => {
    if (pessoais.length || !tamanhoOk) return;
    /* Os sinais de risco ANTES de qualquer envio: o texto não vai à IA e nada é registrado. */
    const risco = sinalDeRisco(texto);
    if (risco) {
      setEstado({ fase: 'risco', categoria: risco.categoria });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setEstado({ fase: 'falhou', falha: { motivo: 'indisponivel' } });
      return;
    }
    setEstado({ fase: 'enviando' });
    const r = await pedirRetornoDoDiario({ idioma, nivel, escrita: texto });
    if ('valor' in r) {
      const entrada: EntradaDoDiario = {
        id: novoId(),
        em: Date.now(),
        idioma,
        texto,
        retorno: r.valor,
        cartoes: [],
        descartados: [],
      };
      await guardarEntrada(entrada);
      apagarRascunhoDoDiario();
      setEstado({ fase: 'retorno', retorno: r.valor, entradaId: entrada.id });
      return;
    }
    if (r.motivo === 'sinal_de_risco') {
      setEstado({ fase: 'risco', categoria: 'automutilacao' });
      return;
    }
    if (r.motivo === 'sem_plano' || r.motivo === 'sem_conta' || r.motivo === 'fora') {
      /* O servidor sabe melhor (teste de 3 dias, plano mudou, flag): fica a conferência no aparelho. */
      setEstado({ fase: 'conferido' });
      return;
    }
    setEstado({ fase: 'falhou', falha: r });
  };

  const guardarSemRetorno = async () => {
    await guardarEntrada({
      id: novoId(),
      em: Date.now(),
      idioma,
      texto,
      retorno: null,
      cartoes: [],
      descartados: [],
    });
    apagarRascunhoDoDiario();
    setTexto('');
    setEstado({ fase: 'escrevendo' });
  };

  const novaEntrada = () => {
    setTexto('');
    apagarRascunhoDoDiario();
    setEstado({ fase: 'escrevendo' });
    campo.current?.focus();
  };

  const trocarNivel = (n: NivelDoDiario) => {
    setNivel(n);
    gravarNivelDoDiario(n);
  };

  const exportar = () => {
    const txt = diarioEmTxt(historico, (ms) => new Date(ms).toLocaleDateString());
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diario.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const apagar = async () => {
    await apagarODiario();
    setHistorico([]);
    setTexto('');
    setConfirmaApagar(false);
    setEstado({ fase: 'escrevendo' });
  };

  const rodape = (
    <section className="la-escrita" aria-labelledby="dia-historico">
      <h2 id="dia-historico" className="la-meta">
        {t('Suas entradas')} ({historico.length})
      </h2>
      <p className="la-meta">{t('O diário mora neste aparelho. Se você limpar os dados do navegador, ele some.')}</p>
      {semHistorico && (
        <p className="la-aviso" role="status">
          {t('Este navegador não deixa guardar o diário. Seu texto não ficou salvo.')}
        </p>
      )}
      {historico.length > 0 && (
        <>
          <ul className="la-resolvidos" data-testid="historico-do-diario">
            {historico.slice(0, 10).map((e) => (
              <li key={e.id}>
                {new Date(e.em).toLocaleDateString()} · <span lang={e.idioma}>{e.texto.slice(0, 80)}…</span>
              </li>
            ))}
          </ul>
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={exportar} data-testid="exportar-diario">
              {t('Exportar o diário (.txt)')}
            </button>
            {confirmaApagar ? (
              <>
                <button
                  type="button"
                  className="q-ctl pri"
                  onClick={() => void apagar()}
                  data-testid="confirmar-apagar"
                >
                  {t('Apagar mesmo')}
                </button>
                <button type="button" className="q-ctl" onClick={() => setConfirmaApagar(false)}>
                  {t('Cancelar')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="q-ctl"
                onClick={() => setConfirmaApagar(true)}
                data-testid="apagar-diario"
              >
                {t('Apagar o diário')}
              </button>
            )}
          </div>
          {confirmaApagar && <p className="la-meta">{t('Os cartões que você já guardou continuam no seu baralho.')}</p>}
        </>
      )}
    </section>
  );

  if (estado.fase === 'retorno') {
    return (
      <div className="la-pagina" data-testid="diario">
        <RetornoDoDiario
          texto={texto}
          idioma={idioma}
          idiomaDaPessoa={mine.slice(0, 2) || 'pt'}
          retorno={estado.retorno}
          entradaId={estado.entradaId}
          historico={historico}
          aoAtualizar={guardarEntrada}
          aoSeguir={novaEntrada}
        />
        {rodape}
      </div>
    );
  }

  if (estado.fase === 'risco') {
    return (
      <div className="la-pagina" data-testid="diario">
        <section className="q-cartao la-escrita" aria-labelledby="dia-apoio" data-testid="apoio-do-diario">
          <h2 id="dia-apoio">{t('Estamos aqui com você')}</h2>
          <p role="status">
            {t(
              'Parece que você está passando por algo difícil. Converse com um adulto de confiança. No Brasil, o CVV atende no 188, 24 horas.',
            )}
          </p>
          <p className="la-meta">{t('Seu texto não foi enviado para a IA e não foi guardado.')}</p>
          <div className="q-acoes">
            <button
              type="button"
              className="q-ctl pri"
              onClick={() => {
                setTexto('');
                apagarRascunhoDoDiario();
                setEstado({ fase: 'escrevendo' });
              }}
            >
              {t('Voltar ao diário')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (estado.fase === 'conferido') {
    return (
      <div className="la-pagina" data-testid="diario">
        <section className="q-cartao la-escrita" aria-labelledby="dia-conferido" data-testid="diario-conferido">
          <h2 id="dia-conferido">{t('Sua conferência')}</h2>
          <p>{t('{n} palavras', { n: conferencia.palavras })}</p>
          {conferencia.alvoUsadas.length > 0 && (
            <p>
              {t('Palavras que você está aprendendo e usou:')}{' '}
              {conferencia.alvoUsadas.map((w) => (
                <span key={w} className="q-chip" lang={idioma} data-usada="true">
                  {w} ✓
                </span>
              ))}
            </p>
          )}
          {conferencia.frasesSemPonto.length > 0 ? (
            <>
              <p>{t('Estas frases ficaram sem ponto final:')}</p>
              <ul>
                {conferencia.frasesSemPonto.map((f) => (
                  <li key={f} lang={idioma}>
                    {f}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t('Todas as frases terminam com ponto.')}</p>
          )}
          {acesso === 'conferir' && <LinhaDosPlanos />}
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={() => setEstado({ fase: 'escrevendo' })}>
              {t('Voltar ao texto')}
            </button>
            <button type="button" className="q-ctl pri" onClick={() => void guardarSemRetorno()}>
              {t('Guardar no diário')}
            </button>
          </div>
        </section>
        {rodape}
      </div>
    );
  }

  const falha = estado.fase === 'falhou' ? estado.falha : null;
  const cotaEsgotada = falha?.motivo === 'cota_esgotada';
  const offline = falha?.motivo === 'indisponivel' && typeof navigator !== 'undefined' && navigator.onLine === false;
  const podeRetorno = acesso === 'retorno' && !cotaEsgotada;
  const enviando = estado.fase === 'enviando';

  return (
    <div className="la-pagina" data-testid="diario">
      <section className="q-cartao la-escrita" aria-labelledby="dia-escrever" data-testid="diario-escrita">
        <h2 id="dia-escrever">{t('Escreva sobre o seu dia')}</h2>
        <p className="la-enunciado">{dia}</p>
        <div className="la-filtros" role="radiogroup" aria-label={t('Idioma do diário')}>
          {IDIOMAS_DO_DIARIO.map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              className="q-chip"
              aria-checked={idioma === i}
              disabled={enviando}
              onClick={() => setIdioma(i)}
            >
              {i === 'en' ? t('Inglês') : t('Espanhol')}
            </button>
          ))}
        </div>
        {podeRetorno && (
          <div className="la-filtros" role="radiogroup" aria-label={t('Seu nível')}>
            {(['A1', 'A2', 'B1'] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                className="q-chip"
                aria-checked={nivel === n}
                disabled={enviando}
                onClick={() => trocarNivel(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <label className="sr-only" htmlFor="dia-campo">
          {t('Seu diário')}
        </label>
        <textarea
          id="dia-campo"
          ref={campo}
          className="la-campo"
          lang={idioma}
          rows={8}
          value={texto}
          disabled={enviando}
          aria-describedby="dia-contador dia-limite"
          aria-invalid={pessoais.length > 0 || undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            if (estado.fase === 'falhou' && estado.falha.motivo !== 'cota_esgotada') setEstado({ fase: 'escrevendo' });
          }}
        />
        <p className="la-meta" id="dia-contador" aria-live="polite">
          {t('{n} palavras', { n: palavras })}
        </p>
        {!tamanhoOk && (
          <p className="la-meta" id="dia-limite" data-testid="limite-do-diario">
            {palavras > MAX_PALAVRAS_DO_DIARIO
              ? t('Máximo de 200 palavras')
              : t('20 palavras ou mais para pedir retorno')}
          </p>
        )}
        {pessoais.length > 0 && (
          <div className="la-pessoal" role="alert" data-testid="dado-pessoal" id="dia-aviso-pessoal">
            <p>{t('Tire esta parte antes de enviar: o Frasy não precisa de dados pessoais.')}</p>
            <p lang={idioma} className="la-trechos">
              {sublinhar(texto, pessoais)}
            </p>
          </div>
        )}
        {cotaEsgotada && falha?.motivo === 'cota_esgotada' && (
          <p className="la-aviso" role="status" data-testid="cota-do-diario">
            {falha.limite && falha.voltam
              ? t('Você usou os {n} retornos deste mês. Eles voltam {quando}.', {
                  n: falha.limite,
                  quando: falha.voltam,
                })
              : t('Você usou os retornos deste mês.')}
          </p>
        )}
        {falha && offline && (
          <p className="la-aviso" role="status">
            {t('Sem internet agora. Seu texto fica salvo aqui e você pede o retorno depois.')}
          </p>
        )}
        {falha && !offline && !cotaEsgotada && falha.motivo !== 'dado_pessoal' && (
          <p className="la-aviso" role="alert" data-testid="erro-do-diario">
            {t('Não deu para ler seu texto agora.')}
          </p>
        )}
        {falha?.motivo === 'dado_pessoal' && (
          <p className="la-aviso" role="alert">
            {t('Tire esta parte antes de enviar: o Frasy não precisa de dados pessoais.')}
          </p>
        )}
        {enviando && (
          <p className="la-meta" role="status">
            {demorando ? t('Está demorando. Seu texto continua salvo.') : t('Lendo o seu texto…')}
          </p>
        )}
        {podeRetorno && <p className="la-meta">{t('O texto vai para a IA só para o retorno e não fica guardado.')}</p>}
        {acesso === 'conferir' && <LinhaDosPlanos />}
        <div className="q-acoes">
          {podeRetorno ? (
            <button
              type="button"
              className="q-ctl pri"
              disabled={!tamanhoOk || enviando || pessoais.length > 0}
              aria-describedby={pessoais.length > 0 ? 'dia-aviso-pessoal' : undefined}
              onClick={() => void pedir()}
              data-testid="pedir-retorno-do-diario"
            >
              {falha && !offline ? t('Tentar de novo') : t('Pedir retorno')}
            </button>
          ) : (
            <button
              type="button"
              className="q-ctl pri"
              disabled={palavras === 0}
              onClick={() => setEstado({ fase: 'conferido' })}
              data-testid="conferir-sozinho-do-diario"
            >
              {t('Conferir sozinho')}
            </button>
          )}
          {texto && (
            <button type="button" className="q-ctl" onClick={novaEntrada} disabled={enviando}>
              {t('Limpar')}
            </button>
          )}
        </div>
      </section>
      {rodape}
    </div>
  );
}

/** A linha neutra sobre os planos (copy ética: fato, sem pressão), só fora do perfil protegido e da conta restrita. */
function LinhaDosPlanos() {
  return (
    <p className="la-meta" data-testid="linha-dos-planos">
      {t('O retorno com IA faz parte dos planos pagos.')}{' '}
      <button type="button" className="la-link" onClick={() => irPara({ view: 'planos' })}>
        {t('Ver planos')}
      </button>
    </p>
  );
}

/** O texto com os trechos pessoais sublinhados. */
function sublinhar(texto: string, trechos: readonly TrechoPessoal[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  trechos.forEach((p, k) => {
    if (p.inicio > i) out.push(texto.slice(i, p.inicio));
    out.push(
      <mark key={k} className="la-sublinhado" data-tipo={p.tipo}>
        {texto.slice(p.inicio, p.fim)}
      </mark>,
    );
    i = p.fim;
  });
  if (i < texto.length) out.push(texto.slice(i));
  return out;
}

/** Os trechos dos pontos, marcados no texto da pessoa com o número (a primeira ocorrência de cada um). */
function marcarPontos(texto: string, pontos: RetornoDaEscrita['pontos']): ReactNode[] {
  const baixo = texto.toLocaleLowerCase();
  const achados = pontos
    .map((p, n) => ({ n, inicio: baixo.indexOf(p.trecho.toLocaleLowerCase()), tamanho: p.trecho.length }))
    .filter((a) => a.inicio >= 0)
    .sort((a, b) => a.inicio - b.inicio);
  const out: ReactNode[] = [];
  let i = 0;
  for (const a of achados) {
    if (a.inicio < i) continue;
    if (a.inicio > i) out.push(texto.slice(i, a.inicio));
    out.push(
      <mark key={a.n} className="la-ponto-marcado" data-ponto={a.n + 1}>
        {texto.slice(a.inicio, a.inicio + a.tamanho)}
        <sup aria-hidden>{NUMEROS[a.n]}</sup>
      </mark>,
    );
    i = a.inicio + a.tamanho;
  }
  if (i < texto.length) out.push(texto.slice(i));
  return out;
}

function RetornoDoDiario(props: {
  texto: string;
  idioma: IdiomaDoDiario;
  idiomaDaPessoa: string;
  retorno: RetornoDaEscrita;
  entradaId: string;
  historico: readonly EntradaDoDiario[];
  aoAtualizar: (e: EntradaDoDiario) => Promise<void>;
  aoSeguir: () => void;
}) {
  const { retorno, texto, idioma } = props;
  const [destinos, setDestinos] = useState<Record<string, Destino>>({});
  const [guardando, setGuardando] = useState(false);
  const [semRede, setSemRede] = useState(false);
  const entrada = props.historico.find((e) => e.id === props.entradaId);

  const pendentes = retorno.pontos.filter((p) => destinos[p.trecho] === undefined);

  const atualizarEntrada = (mudanca: Partial<Pick<EntradaDoDiario, 'cartoes' | 'descartados'>>) => {
    if (entrada) void props.aoAtualizar({ ...entrada, ...mudanca });
  };

  /** Um toque: cada ponto vira um cartão (sem nova chamada de IA), pelo `bulk-add` com régua e deduplicação. */
  const guardar = async (pontos: RetornoDaEscrita['pontos']) => {
    if (!pontos.length || guardando) return;
    setGuardando(true);
    setSemRede(false);
    const proximos: Record<string, Destino> = {};
    const cartoes = pontos.flatMap((p) => {
      const r = pontoParaCartao(p, texto, idioma, props.idiomaDaPessoa);
      if (r.ok) return [{ ponto: p, cartao: r.cartao }];
      proximos[p.trecho] = { tipo: 'recusado', motivo: t('Este ponto não dá um bom cartão.') };
      return [];
    });
    if (cartoes.length) {
      try {
        const { cards, skipped } = await bulkAddCards(
          cartoes.map(({ cartao }) => ({
            word: cartao.word,
            back: cartao.back,
            sentence: cartao.sentence,
            srcLang: cartao.srcLang,
            tgtLang: cartao.tgtLang,
            clozePrompt: cartao.clozePrompt,
            clozeAnswer: cartao.clozeAnswer,
          })),
        );
        const fora = new Map(skipped.map((s) => [s.word.trim().toLowerCase(), s.motivo]));
        const entraram: string[] = [];
        for (const { ponto, cartao } of cartoes) {
          const motivo = fora.get(cartao.word.trim().toLowerCase());
          if (motivo === undefined) {
            proximos[ponto.trecho] = { tipo: 'guardado' };
            entraram.push(ponto.trecho);
          } else proximos[ponto.trecho] = { tipo: 'recusado', motivo: motivoLegivel(motivo) };
        }
        /* A etiqueta "do diário" (sem campo novo no cartão), em cada cartão novo. */
        for (const c of cards) void salvarEtiquetasDoCartao(c.id, [ETIQUETA_DO_DIARIO]);
        if (entraram.length) atualizarEntrada({ cartoes: [...(entrada?.cartoes ?? []), ...entraram] });
      } catch {
        /* Falha de rede: os pontos ficam sem destino e o botão volta. */
        setSemRede(true);
      }
    }
    setDestinos((antes) => ({ ...antes, ...proximos }));
    setGuardando(false);
  };

  const certo = (trecho: string) => {
    setDestinos((antes) => ({ ...antes, [trecho]: { tipo: 'descartado' } }));
    atualizarEntrada({ descartados: [...(entrada?.descartados ?? []), trecho] });
  };

  return (
    <section className="q-cartao la-escrita" aria-labelledby="dia-retorno" data-testid="diario-retorno">
      <h2 id="dia-retorno">{t('Seu retorno')}</h2>
      <p className="la-elogio">★ {retorno.elogio}</p>
      <p className="la-texto-da-pessoa" lang={idioma}>
        {marcarPontos(texto, retorno.pontos)}
      </p>
      {retorno.pontos.length === 0 && <p>{t('Não achamos nada para corrigir. Bom texto!')}</p>}
      {retorno.pontos.length > 0 && (
        <ol className="la-pontos">
          {retorno.pontos.map((p, n) => {
            const d = destinos[p.trecho];
            return (
              <li key={p.trecho} data-testid="ponto-do-diario">
                <span aria-hidden>{NUMEROS[n]}</span> <q lang={idioma}>{p.trecho}</q> —{' '}
                {t('Olhe {tipo}.', { tipo: ROTULO_DO_TIPO[p.tipo]() })} {p.dica}{' '}
                {d?.tipo === 'descartado' ? (
                  <span className="la-meta">{t('Descartado.')}</span>
                ) : d?.tipo === 'guardado' ? (
                  <span className="la-meta" data-testid="ponto-guardado">
                    ✓ {t('Guardado como cartão')}
                  </span>
                ) : d?.tipo === 'recusado' ? (
                  <span className="la-meta" role="status" data-testid="ponto-recusado">
                    {d.motivo}
                  </span>
                ) : (
                  <>
                    {p.exemplo && (
                      <span className="la-exemplo" lang={idioma}>
                        {t('Exemplo:')} {p.exemplo}{' '}
                      </span>
                    )}
                    <button
                      type="button"
                      className="la-link"
                      disabled={guardando}
                      onClick={() => void guardar([p])}
                      data-testid="guardar-como-cartao"
                    >
                      {t('Guardar como cartão')}
                    </button>{' '}
                    <button
                      type="button"
                      className="la-link"
                      onClick={() => certo(p.trecho)}
                      data-testid="estava-certo"
                    >
                      {t('Isto estava certo')}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {semRede && (
        <p className="la-aviso" role="alert">
          {t('Não deu para guardar agora. Tente de novo.')}
        </p>
      )}
      <div className="q-acoes">
        {pendentes.length > 1 && (
          <button
            type="button"
            className="q-ctl"
            disabled={guardando}
            onClick={() => void guardar(pendentes)}
            data-testid="guardar-todos"
          >
            {pendentes.length === 3 ? t('Guardar os três') : t('Guardar todos')}
          </button>
        )}
        <button type="button" className="q-ctl pri" onClick={props.aoSeguir}>
          {t('Escrever outra entrada')}
        </button>
      </div>
      <p className="la-selo">{t('Retorno feito por IA. Ela pode errar.')}</p>
    </section>
  );
}
