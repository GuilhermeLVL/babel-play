import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  conferirEscrita,
  contarPalavrasDaEscrita,
  MAX_PALAVRAS_DA_ESCRITA,
  MIN_PALAVRAS_DA_ESCRITA,
} from '../../../core/leitura/conferenciaLocal';
import { dadosPessoaisNoTexto, type TrechoPessoal } from '../../../core/leitura/dadosPessoais';
import type { FichaDeTexto } from '../../../core/leitura/fichaDeTexto';
import { definicaoDoPlano } from '../../../core/planos';
import {
  type FalhaDaEscrita,
  pedirRetornoDaEscrita,
  type RetornoDaEscrita,
  type TipoDePonto,
} from '../../../data/apiDoEstudo';
import { getEntitlements } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { estadoDeIdentidade } from '../../../lib/identidade';
import { irPara } from '../../../lib/irPara';
import { gravarRascunho, lerRascunho } from '../../../lib/leituraAtiva/preferencias';
import { estadoDaProtecao } from '../../../lib/protecaoDoMenor';
import { IDIOMA_DOS_TEXTOS } from './useConhecimento';

/**
 * O QUE A PESSOA RECEBE NA ESCRITA: o retorno da IA (plano pago com conta), a conferência no aparelho com a linha
 * neutra sobre os planos (Grátis adulto), ou só a conferência, sem falar de plano (perfil protegido, conta restrita,
 * sem conta).
 */
export type AcessoDaEscrita = 'retorno' | 'conferir' | 'restrito';

export function acessoDaEscrita(protegido: boolean): AcessoDaEscrita {
  const e = getEntitlements();
  const identidade = estadoDeIdentidade();
  const temConta = identidade === 'conta' || identidade === 'selfhost';
  if (!temConta || estadoDaProtecao()?.restrita === true) return 'restrito';
  /* O teste de 3 dias não tem o retorno (o servidor recusa a reserva): nem oferece o pedido. */
  if (e.teste) return protegido ? 'restrito' : 'conferir';
  const escritas = definicaoDoPlano(e.plan === 'anonimo' ? 'convidado' : e.plan).quotas.escritasMes;
  if (escritas === null || escritas > 0) return 'retorno';
  return protegido ? 'restrito' : 'conferir';
}

type Tarefa = 'reescrever' | 'opinar';
type Estado =
  | { fase: 'escrevendo' }
  | { fase: 'enviando' }
  | { fase: 'conferido' }
  | { fase: 'retorno'; retorno: RetornoDaEscrita }
  | { fase: 'falhou'; falha: FalhaDaEscrita };

const ROTULO_DO_TIPO: Record<TipoDePonto, () => string> = {
  sentido: () => t('o sentido'),
  tempoVerbal: () => t('o tempo do verbo'),
  concordancia: () => t('a concordância'),
  ortografia: () => t('a escrita da palavra'),
  palavra: () => t('a escolha da palavra'),
  outro: () => t('um detalhe'),
};
const NUMEROS = ['①', '②', '③'];
/** Quanto esperar antes de "Está demorando". */
const DEMORA_MS = 15_000;

/**
 * T5 e T5b — ESCREVER DEPOIS DE LER (spec `leitura-ativa-escrita`; Newsela, Write & Improve). Duas tarefas da ficha,
 * de 20 a 120 palavras, o rascunho só no aparelho, as palavras do texto como atalhos e o filtro de dados pessoais
 * antes de qualquer envio. Nos pagos, "Pedir retorno" (1 elogio e até 3 pontos, um reenvio por texto); no resto,
 * "Conferir sozinho", no aparelho.
 */
export default function EscritaDoTexto(props: {
  ficha: FichaDeTexto;
  acesso: AcessoDaEscrita;
  /** Perfil protegido (menor): nunca se fala de plano, nem quando o servidor recusa. */
  protegido: boolean;
  aoTerminar: () => void;
}) {
  const { ficha, protegido } = props;
  const [acesso, setAcesso] = useState(props.acesso);
  const [tarefa, setTarefa] = useState<Tarefa>('reescrever');
  const [texto, setTexto] = useState(() => lerRascunho(ficha.id, 'reescrever'));
  const [estado, setEstado] = useState<Estado>({ fase: 'escrevendo' });
  /** Os trechos da primeira versão: com eles o segundo envio diz o que foi resolvido. `null` = ainda não houve reenvio. */
  const [anteriores, setAnteriores] = useState<string[] | null>(null);
  const [demorando, setDemorando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  /* O rascunho fica no aparelho (1 s depois da última tecla). */
  useEffect(() => {
    const id = window.setTimeout(() => gravarRascunho(ficha.id, tarefa, texto), 1000);
    return () => window.clearTimeout(id);
  }, [ficha.id, tarefa, texto]);
  useEffect(() => {
    if (estado.fase !== 'enviando') return;
    setDemorando(false);
    const id = window.setTimeout(() => setDemorando(true), DEMORA_MS);
    return () => window.clearTimeout(id);
  }, [estado.fase]);

  const palavras = contarPalavrasDaEscrita(texto);
  const pessoais = useMemo(() => dadosPessoaisNoTexto(texto), [texto]);
  const conferencia = useMemo(
    () => conferirEscrita({ texto, palavrasAlvo: ficha.palavrasAlvo, lang: IDIOMA_DOS_TEXTOS }),
    [texto, ficha.palavrasAlvo],
  );
  const tamanhoOk = palavras >= MIN_PALAVRAS_DA_ESCRITA && palavras <= MAX_PALAVRAS_DA_ESCRITA;

  const trocarTarefa = (t2: Tarefa) => {
    if (t2 === tarefa) return;
    gravarRascunho(ficha.id, tarefa, texto);
    setTarefa(t2);
    setTexto(lerRascunho(ficha.id, t2));
    setAnteriores(null);
    setEstado({ fase: 'escrevendo' });
  };
  const inserir = (w: string) => {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const antes = texto.slice(0, ini);
    const depois = texto.slice(fim);
    const sep = antes && !/\s$/.test(antes) ? ' ' : '';
    setTexto(`${antes}${sep}${w}${depois && !/^\s/.test(depois) ? ' ' : ''}${depois}`);
    el?.focus();
  };

  /* A conferência é no aparelho: nada sai, então o dado pessoal só fica sublinhado. */
  const conferir = () => setEstado({ fase: 'conferido' });
  const pedir = async () => {
    if (pessoais.length || !tamanhoOk) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setEstado({ fase: 'falhou', falha: { motivo: 'indisponivel' } });
      return;
    }
    setEstado({ fase: 'enviando' });
    const r = await pedirRetornoDaEscrita({
      textoId: ficha.id,
      tarefa,
      escrita: texto,
      ...(anteriores ? { anteriores } : {}),
    });
    if ('valor' in r) {
      setEstado({ fase: 'retorno', retorno: r.valor });
      return;
    }
    const falha: FalhaDaEscrita = r;
    if (falha.motivo === 'sem_plano' || falha.motivo === 'sem_conta' || falha.motivo === 'fora') {
      /* O servidor sabe melhor (teste de 3 dias, plano mudou): fica a conferência no aparelho; o protegido não vê plano. */
      setAcesso((a) => (a === 'retorno' ? (protegido ? 'restrito' : 'conferir') : a));
      setEstado({ fase: 'escrevendo' });
      return;
    }
    setEstado({ fase: 'falhou', falha });
  };

  const tarefas: { id: Tarefa; nome: string }[] = [
    { id: 'reescrever', nome: t('Reescrever com suas palavras') },
    { id: 'opinar', nome: t('Dar sua opinião') },
  ];

  if (estado.fase === 'retorno') {
    return (
      <RetornoDaIa
        texto={texto}
        retorno={estado.retorno}
        anteriores={anteriores}
        aoCorrigir={() => {
          setAnteriores(estado.retorno.pontos.map((p) => p.trecho));
          setEstado({ fase: 'escrevendo' });
        }}
        aoSeguir={props.aoTerminar}
        aoOutraTarefa={() => trocarTarefa(tarefa === 'reescrever' ? 'opinar' : 'reescrever')}
      />
    );
  }

  if (estado.fase === 'conferido') {
    return (
      <section className="q-cartao la-escrita" aria-labelledby="la-conferido" data-testid="leitura-ativa-conferido">
        <h2 id="la-conferido">{t('Sua conferência')}</h2>
        <p>{t('{n} palavras', { n: conferencia.palavras })}</p>
        {conferencia.alvoUsadas.length > 0 && (
          <p>
            {t('Palavras do texto que você usou:')}{' '}
            {conferencia.alvoUsadas.map((w) => (
              <span key={w} className="q-chip" lang="en" data-usada="true">
                {w} ✓
              </span>
            ))}
          </p>
        )}
        {conferencia.alvoFaltando.length > 0 && (
          <p>
            {t('Ainda dá para usar:')} <span lang="en">{conferencia.alvoFaltando.join(', ')}</span>
          </p>
        )}
        {conferencia.frasesSemPonto.length > 0 ? (
          <>
            <p>{t('Estas frases ficaram sem ponto final:')}</p>
            <ul>
              {conferencia.frasesSemPonto.map((f) => (
                <li key={f} lang="en">
                  {f}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{t('Todas as frases terminam com ponto.')}</p>
        )}
        <LinhaDosPlanos acesso={acesso} />
        <div className="q-acoes">
          <button type="button" className="q-ctl" onClick={() => setEstado({ fase: 'escrevendo' })}>
            {t('Voltar ao texto')}
          </button>
          <button type="button" className="q-ctl pri" onClick={props.aoTerminar}>
            {t('Seguir para o resumo')}
          </button>
        </div>
      </section>
    );
  }

  const falha = estado.fase === 'falhou' ? estado.falha : null;
  const cotaEsgotada = falha?.motivo === 'cota_esgotada';
  const offline = falha?.motivo === 'indisponivel' && typeof navigator !== 'undefined' && navigator.onLine === false;
  const podeRetorno = acesso === 'retorno' && !cotaEsgotada;
  const enviando = estado.fase === 'enviando';

  return (
    <section className="q-cartao la-escrita" aria-labelledby="la-escrever" data-testid="leitura-ativa-escrita">
      <h2 id="la-escrever">{t('Agora é sua vez de escrever')}</h2>
      <div className="la-filtros" role="radiogroup" aria-label={t('Escolha a tarefa')}>
        {tarefas.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            className="q-chip"
            aria-checked={tarefa === x.id}
            onClick={() => trocarTarefa(x.id)}
          >
            {x.nome}
          </button>
        ))}
      </div>
      <p className="la-enunciado" lang={tarefa === 'opinar' ? 'en' : undefined}>
        {ficha.tarefaDeEscrita[tarefa]}
      </p>
      <details className="la-original">
        <summary>{t('Ver o texto')}</summary>
        <p lang="en">{ficha.texto}</p>
      </details>
      <label className="sr-only" htmlFor="la-campo">
        {t('Seu texto, em inglês')}
      </label>
      <textarea
        id="la-campo"
        ref={campo}
        className="la-campo"
        lang="en"
        rows={6}
        value={texto}
        disabled={enviando}
        placeholder={t('Comece com uma frase do texto, do seu jeito.')}
        aria-describedby="la-contador la-limite"
        aria-invalid={pessoais.length > 0 || undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          if (estado.fase === 'falhou' && estado.falha.motivo !== 'cota_esgotada') setEstado({ fase: 'escrevendo' });
        }}
      />
      <p className="la-meta" id="la-contador" aria-live="polite">
        {t('{n} palavras', { n: palavras })}
      </p>
      {podeRetorno && !tamanhoOk && (
        <p className="la-meta" id="la-limite" data-testid="limite-da-escrita">
          {palavras > MAX_PALAVRAS_DA_ESCRITA
            ? t('Máximo de 120 palavras')
            : t('20 palavras ou mais para pedir retorno')}
        </p>
      )}
      {ficha.palavrasAlvo.length > 0 && (
        <div className="la-chips">
          <span className="la-meta">{t('Use palavras do texto:')}</span>
          {ficha.palavrasAlvo.slice(0, 6).map((w) => {
            const usada = conferencia.alvoUsadas.includes(w);
            return (
              <button
                key={w}
                type="button"
                className="q-chip"
                lang="en"
                data-usada={usada || undefined}
                disabled={enviando}
                onClick={() => inserir(w)}
              >
                {w}
                {usada ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      )}
      {pessoais.length > 0 && (
        <div className="la-pessoal" role="alert" data-testid="dado-pessoal" id="la-aviso-pessoal">
          <p>{t('Tire esta parte antes de enviar: o Frasy não precisa de dados pessoais.')}</p>
          <p lang="en" className="la-trechos">
            {sublinhar(texto, pessoais)}
          </p>
        </div>
      )}
      {cotaEsgotada && falha?.motivo === 'cota_esgotada' && (
        <p className="la-aviso" role="status" data-testid="cota-da-escrita">
          {falha.limite && falha.voltam
            ? t('Você usou os {n} retornos deste mês. Eles voltam {quando}.', { n: falha.limite, quando: falha.voltam })
            : t('Você usou os retornos deste mês.')}
        </p>
      )}
      {falha && offline && (
        <p className="la-aviso" role="status">
          {t('Sem internet agora. Seu texto fica salvo aqui e você pede o retorno depois.')}
        </p>
      )}
      {falha && !offline && !cotaEsgotada && falha.motivo !== 'dado_pessoal' && (
        <p className="la-aviso" role="alert" data-testid="erro-da-escrita">
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
      {!podeRetorno && !cotaEsgotada && <LinhaDosPlanos acesso={acesso} />}
      <div className="q-acoes">
        {podeRetorno ? (
          <button
            type="button"
            className="q-ctl pri"
            disabled={!tamanhoOk || enviando}
            aria-describedby={pessoais.length > 0 ? 'la-aviso-pessoal' : undefined}
            onClick={() => void pedir()}
            data-testid="pedir-retorno"
          >
            {falha && !offline ? t('Tentar de novo') : anteriores ? t('Mandar de novo') : t('Pedir retorno')}
          </button>
        ) : (
          <button
            type="button"
            className="q-ctl pri"
            disabled={palavras === 0}
            onClick={conferir}
            data-testid="conferir-sozinho"
          >
            {t('Conferir sozinho')}
          </button>
        )}
        {offline ? (
          <button type="button" className="q-ctl" onClick={props.aoTerminar}>
            {t('Guardar e ir ao resumo')}
          </button>
        ) : (
          <button type="button" className="q-ctl" onClick={props.aoTerminar} disabled={enviando}>
            {t('Pular')}
          </button>
        )}
      </div>
    </section>
  );
}

/** A linha neutra sobre os planos (copy ética: fato, sem pressão), só fora do perfil protegido e da conta restrita. */
function LinhaDosPlanos({ acesso }: { acesso: AcessoDaEscrita }) {
  if (acesso !== 'conferir') return null;
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

function RetornoDaIa(props: {
  texto: string;
  retorno: RetornoDaEscrita;
  /** Os trechos da primeira versão, quando esta é a segunda. */
  anteriores: string[] | null;
  aoCorrigir: () => void;
  aoSeguir: () => void;
  aoOutraTarefa: () => void;
}) {
  const { retorno, anteriores } = props;
  const [exemplo, setExemplo] = useState<number | null>(null);
  const segunda = anteriores !== null;
  return (
    <section className="q-cartao la-escrita" aria-labelledby="la-retorno" data-testid="leitura-ativa-retorno">
      <h2 id="la-retorno">{t('Seu retorno')}</h2>
      <p className="la-elogio">★ {retorno.elogio}</p>
      <p className="la-texto-da-pessoa" lang="en">
        {marcarPontos(props.texto, retorno.pontos)}
      </p>
      {segunda && anteriores.length > 0 && (
        <>
          <ul className="la-resolvidos">
            {anteriores.map((a) => (
              <li key={a} data-resolvido={retorno.resolvidos.includes(a) || undefined}>
                <span lang="en">“{a}”</span>{' '}
                {retorno.resolvidos.includes(a) ? `✓ ${t('Resolvido')}` : t('Ainda dá para melhorar')}
              </li>
            ))}
          </ul>
          {retorno.resolvidos.length > 0 && (
            <p>
              {t('Você resolveu {n} de {total}. Ótimo trabalho.', {
                n: retorno.resolvidos.length,
                total: anteriores.length,
              })}
            </p>
          )}
        </>
      )}
      {retorno.pontos.length === 0 && !segunda && (
        <p>{t('Não achamos nada para corrigir. Que tal tentar a outra tarefa?')}</p>
      )}
      {retorno.pontos.length > 0 && (
        <ol className="la-pontos">
          {retorno.pontos.map((p, n) => (
            <li key={p.trecho} data-testid="ponto-da-escrita">
              <span aria-hidden>{NUMEROS[n]}</span> <q lang="en">{p.trecho}</q> —{' '}
              {t('Olhe {tipo}.', { tipo: ROTULO_DO_TIPO[p.tipo]() })} {p.dica}{' '}
              {p.exemplo &&
                (exemplo === n ? (
                  <span className="la-exemplo" lang="en">
                    {t('Exemplo:')} {p.exemplo}
                  </span>
                ) : (
                  <button type="button" className="la-link" onClick={() => setExemplo(n)}>
                    {t('Ver um exemplo')}
                  </button>
                ))}
            </li>
          ))}
        </ol>
      )}
      {retorno.pontos.length > 0 && (
        <p className="la-meta">
          {t('Os outros detalhes ficam para a próxima. Três de cada vez é o melhor jeito de aprender.')}
        </p>
      )}
      <div className="q-acoes">
        {!segunda && retorno.pontos.length > 0 && (
          <button type="button" className="q-ctl" onClick={props.aoCorrigir} data-testid="corrigir-e-mandar">
            {t('Corrigir e mandar de novo')}
          </button>
        )}
        {!segunda && retorno.pontos.length === 0 && (
          <button type="button" className="q-ctl" onClick={props.aoOutraTarefa}>
            {t('Tentar a outra tarefa')}
          </button>
        )}
        <button type="button" className="q-ctl pri" onClick={props.aoSeguir}>
          {t('Seguir para o resumo')}
        </button>
      </div>
      <p className="la-selo">{t('Retorno feito por IA. Ela pode errar.')}</p>
    </section>
  );
}
