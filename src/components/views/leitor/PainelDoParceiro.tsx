import { BookmarkPlus, Cloud, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { type JanelaDaCota, janelaDaFalha } from '../../../core/leitura/ferramentasDeIa';
import {
  type FalhaDoParceiro,
  type LivroDoPedido,
  type ModoDoParceiro,
  montarTrechos,
  type PedidoAoParceiro,
  pedirAoParceiro,
  type ResultadoDoParceiro,
} from '../../../data/rotas/parceiroDeLeitura';
import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { diaQueACotaVolta } from '../../../lib/diaQueACotaVolta';
import { MODOS_COM_SELECAO, MODOS_DO_PARCEIRO, TETOS_DO_PARCEIRO } from '../../../lib/estudo/promptDoParceiro';
import { t } from '../../../lib/i18n';
import { indiceDoParagrafoComTexto } from '../../../lib/leitor/paragrafos';

/** O que o leitor sabe do capítulo no momento do pedido (lido na hora, nunca guardado). */
export interface SecaoParaOParceiro {
  paragrafos: string[];
  primeiroVisivel: number;
}

const NOME_DO_MODO: Record<ModoDoParceiro, () => string> = {
  explicar: () => t('Explicar'),
  analogia: () => t('Analogia'),
  pergunta: () => t('Perguntar'),
  curiosidade: () => t('Curiosidade'),
  ideia: () => t('Para discutir'),
  observar: () => t('O que observar'),
};

const AJUDA_DO_MODO: Record<ModoDoParceiro, () => string> = {
  explicar: () => t('O que o trecho quer dizer, no seu nível.'),
  analogia: () => t('O mesmo trecho, explicado por uma comparação do dia a dia.'),
  pergunta: () => t('Uma pergunta sua, respondida só com o texto do livro.'),
  curiosidade: () => t('Uma curiosidade ligada ao trecho.'),
  ideia: () => t('Uma ideia ou pergunta para conversar sobre o capítulo.'),
  observar: () => t('O que vale reparar neste capítulo, sem contar o que vem depois.'),
};

/** A frase de cada recusa: o fato e o que segue funcionando, sem oferta (`copy-br-etica`). */
export function fraseDaFalhaDoParceiro(m: FalhaDoParceiro): string {
  switch (m) {
    case 'sem_plano':
      return t('O parceiro de leitura faz parte dos planos pagos. Traduzir e ouvir o livro seguem grátis.');
    case 'sem_conta':
      return t('Entre na sua conta para usar o parceiro de leitura.');
    case 'fora_da_faixa':
      return t('O parceiro não responde sobre este livro para o seu perfil.');
    case 'cota_do_mes':
      return t('Você usou as do parceiro neste mês; elas voltam no dia {data}.', { data: diaQueACotaVolta() });
    case 'uso_justo':
      return t('Você usou as de hoje; volta amanhã.');
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'fora':
      return t('O parceiro de leitura ainda não está liberado. Em breve.');
    case 'grande_demais':
      return t('O trecho ficou grande demais. Selecione um pedaço menor e tente de novo.');
    case 'invalido':
      return t('Não deu para montar o pedido com este trecho. Tente selecionar outro.');
    default:
      return t('Não deu para responder agora.');
  }
}

/** Recusas em que tentar de novo agora não adianta (o botão "Tentar de novo" não aparece). */
const SEM_NOVA_TENTATIVA: ReadonlySet<FalhaDoParceiro> = new Set([
  'sem_plano',
  'sem_conta',
  'fora_da_faixa',
  'cota_do_mes',
  'uso_justo',
  'fora',
]);

type Estado =
  | { fase: 'parado' }
  | { fase: 'carregando' }
  | { fase: 'ok'; r: Extract<ResultadoDoParceiro, { ok: true }> }
  | { fase: 'erro'; motivo: FalhaDoParceiro };

/**
 * O PARCEIRO DE LEITURA: os 6 modos sobre o trecho selecionado ou o capítulo em volta. O servidor decide tudo
 * (flag, plano, cota, idade, retenção zero); aqui só se monta o pedido (`montarTrechos` corta nos tetos), pede, e
 * mostra o resultado ou a recusa em português. Nada é guardado: a resposta vive na tela até outro pedido.
 */
export default function PainelDoParceiro({
  livro,
  tituloDoCapitulo,
  selecao,
  fraseDaSelecao,
  idiomaDoLivro,
  idiomaDaPessoa,
  nivel = 'B1',
  lerSecao,
  modoInicial,
  aoEsgotarCota,
  aoGuardar,
  pedir = pedirAoParceiro,
}: {
  livro: LivroDoPedido;
  tituloDoCapitulo: string;
  /** O texto selecionado no livro agora (pode estar vazio). */
  selecao: string;
  /** A frase onde a seleção está (o contexto do cartão). */
  fraseDaSelecao?: string;
  idiomaDoLivro: string;
  idiomaDaPessoa: string;
  nivel?: PedidoAoParceiro['nivel'];
  lerSecao: () => SecaoParaOParceiro | null;
  modoInicial?: ModoDoParceiro;
  aoEsgotarCota?: (janela: JanelaDaCota) => void;
  /** Guarda a seleção como cartão (só quando há seleção). */
  aoGuardar?: (texto: string, frase: string) => Promise<boolean>;
  /** Injetável só para os testes. */
  pedir?: typeof pedirAoParceiro;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const temSelecao = selecao.trim().length > 0;
  const [modo, setModo] = useState<ModoDoParceiro>(modoInicial ?? (temSelecao ? 'explicar' : 'observar'));
  const [pergunta, setPergunta] = useState('');
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' });
  const [guardado, setGuardado] = useState<'nao' | 'sim' | 'falhou'>('nao');
  const idDaPergunta = useId();
  const idDoStatus = useId();
  const pedidoAtual = useRef(0);

  /* A seleção mudou ou o modo veio de fora: a resposta anterior era de outro trecho. */
  useEffect(() => {
    pedidoAtual.current++;
    setEstado({ fase: 'parado' });
    setGuardado('nao');
  }, [selecao, modo]);
  useEffect(() => {
    if (modoInicial) setModo(modoInicial);
  }, [modoInicial]);

  const precisaDeSelecao = MODOS_COM_SELECAO.includes(modo) && !temSelecao;
  const faltaPergunta = modo === 'pergunta' && pergunta.trim().length < 3;

  const perguntar = async () => {
    const numero = ++pedidoAtual.current;
    const secao = lerSecao();
    const paragrafos = (secao?.paragrafos ?? []).map((texto, i) => ({ id: String(i), texto }));
    const achado = temSelecao ? indiceDoParagrafoComTexto(secao?.paragrafos ?? [], selecao) : -1;
    const centro = achado >= 0 ? achado : (secao?.primeiroVisivel ?? 0);
    const sel = selecao.trim().slice(0, TETOS_DO_PARCEIRO.selecao);
    const trechos = montarTrechos(paragrafos, centro, livro.origem, sel);
    /* Sem texto no capítulo (PDF escaneado, livro ainda abrindo) e sem seleção, não há o que enviar. */
    if (trechos.length === 0 && !sel) {
      setEstado({ fase: 'erro', motivo: 'invalido' });
      return;
    }
    setEstado({ fase: 'carregando' });
    setGuardado('nao');
    const pedido: PedidoAoParceiro = {
      modo,
      livro,
      ...(tituloDoCapitulo ? { tituloDoCapitulo: tituloDoCapitulo.slice(0, TETOS_DO_PARCEIRO.tituloDoCapitulo) } : {}),
      ...(sel ? { selecao: sel } : {}),
      trechos: trechos.length ? trechos : [{ id: '0', texto: sel }],
      ...(modo === 'pergunta' ? { pergunta: pergunta.trim().slice(0, TETOS_DO_PARCEIRO.pergunta) } : {}),
      nivel,
      idiomaDoLivro,
      idiomaDaPessoa,
    };
    const r = await pedir(pedido);
    if (numero !== pedidoAtual.current) return; // outro pedido (ou outra seleção) tomou a vez
    if (r.ok === false) {
      setEstado({ fase: 'erro', motivo: r.motivo });
      const janela = janelaDaFalha(r.motivo);
      if (janela) aoEsgotarCota?.(janela);
      return;
    }
    setEstado({ fase: 'ok', r });
  };

  if (!consentiu) {
    return (
      <section className="leitor-ia-bloco" aria-label={t('Parceiro de leitura')}>
        <p>{t('O parceiro usa a IA de nuvem, que você ainda não autorizou.')}</p>
        <p className="leitor-apoio">{t('Só o trecho que você escolher sai do aparelho, e nada fica guardado.')}</p>
        <button type="button" className="btn btn-solid leitor-alvo" onClick={() => void autorizar()}>
          <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
        </button>
      </section>
    );
  }

  const resposta = estado.fase === 'ok' ? estado.r : null;
  const textoDaFalha = estado.fase === 'erro' ? fraseDaFalhaDoParceiro(estado.motivo) : '';

  return (
    <section className="leitor-ia-bloco" aria-label={t('Parceiro de leitura')} data-testid="painel-do-parceiro">
      <div className="leitor-ia-modos" role="group" aria-label={t('O que você quer do parceiro')}>
        {MODOS_DO_PARCEIRO.map((m) => (
          <button
            key={m}
            type="button"
            className="btn btn-outline leitor-alvo"
            aria-pressed={modo === m}
            data-modo={m}
            onClick={() => setModo(m)}
          >
            {NOME_DO_MODO[m]()}
          </button>
        ))}
      </div>
      <p className="leitor-apoio">{AJUDA_DO_MODO[modo]()}</p>

      {temSelecao ? (
        <blockquote className="leitor-ia-trecho" lang={idiomaDoLivro || undefined}>
          {selecao.length > 240 ? `${selecao.slice(0, 240)}…` : selecao}
        </blockquote>
      ) : (
        <p className="leitor-apoio">
          {MODOS_COM_SELECAO.includes(modo)
            ? t('Selecione um trecho no livro para usar este modo.')
            : t('Sem trecho selecionado, o parceiro olha o capítulo em volta de onde você está.')}
        </p>
      )}

      {modo === 'pergunta' && (
        <div className="leitor-nota-form">
          <label htmlFor={idDaPergunta} className="leitor-legenda">
            {t('Sua pergunta')}
          </label>
          <textarea
            id={idDaPergunta}
            className="campo"
            rows={2}
            maxLength={TETOS_DO_PARCEIRO.pergunta}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
          />
        </div>
      )}

      <div className="leitor-acoes">
        <button
          type="button"
          className="btn btn-solid leitor-alvo"
          data-testid="parceiro-pedir"
          disabled={estado.fase === 'carregando' || precisaDeSelecao || faltaPergunta}
          aria-describedby={idDoStatus}
          onClick={() => void perguntar()}
        >
          <Sparkles aria-hidden /> {NOME_DO_MODO[modo]()}
        </button>
      </div>

      <p id={idDoStatus} className="leitor-apoio" role="status" data-testid="parceiro-status">
        {estado.fase === 'carregando' ? t('Pensando…') : textoDaFalha}
      </p>
      {estado.fase === 'erro' && !SEM_NOVA_TENTATIVA.has(estado.motivo) && (
        <button type="button" className="btn btn-outline leitor-alvo" onClick={() => void perguntar()}>
          <RefreshCw aria-hidden /> {t('Tentar de novo')}
        </button>
      )}

      {resposta && (
        <article className="leitor-ia-resposta" data-testid="parceiro-resposta">
          <p>{resposta.resposta.texto}</p>
          {resposta.resposta.pontos.length > 0 && (
            <ul>
              {resposta.resposta.pontos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {resposta.resposta.citacoes.length > 0 && (
            <div className="leitor-ia-citacoes">
              <p className="leitor-legenda">{t('No texto')}</p>
              {resposta.resposta.citacoes.map((c) => (
                <blockquote key={`${c.trechoId}:${c.exato}`} lang={idiomaDoLivro || undefined}>
                  “{c.exato}”
                </blockquote>
              ))}
            </div>
          )}
          {!resposta.textoConferido && livro.origem === 'catalogo' && (
            <p className="leitor-apoio">{t('Respondi só com o trecho que você escolheu e os vizinhos dele.')}</p>
          )}
          <p className="leitor-apoio">
            {resposta.aviso || t('Gerado por IA a partir do texto do livro.')} {t('Pode errar.')}
            {typeof resposta.restanteHoje === 'number' && ' ' + t('Restam {n} hoje.', { n: resposta.restanteHoje })}
          </p>
          {aoGuardar && temSelecao && (
            <button
              type="button"
              className="btn btn-outline leitor-alvo"
              disabled={guardado === 'sim'}
              onClick={() =>
                void aoGuardar(selecao.trim(), fraseDaSelecao || selecao.trim()).then((ok) =>
                  setGuardado(ok ? 'sim' : 'falhou'),
                )
              }
            >
              <BookmarkPlus aria-hidden />{' '}
              {guardado === 'sim'
                ? t('Guardado no deck')
                : guardado === 'falhou'
                  ? t('Não deu para guardar. Tentar de novo')
                  : t('Guardar o trecho como cartão')}
            </button>
          )}
        </article>
      )}
    </section>
  );
}
