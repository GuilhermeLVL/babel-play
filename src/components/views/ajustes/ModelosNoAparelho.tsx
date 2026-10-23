import '../../../styles/modelosNoAparelho.css';

import { Download, Feather, Gauge, Trash2, Weight, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { CHAVE_DO_PARAKEET, ID_DO_PARAKEET } from '../../../gateway/adapters/parakeetModelo';
import { baixarModelo } from '../../../gateway/baixarModelo';
import {
  alcanceDoModelo,
  catalogoDeTranscricao,
  escolhaDoAutomatico,
  type ItemDoCatalogo,
  tradutoresGuardados,
} from '../../../gateway/catalogoDeModelos';
import { apagarModelo, baixadoEm, type EstadoDoCache, modeloDisponivel } from '../../../gateway/modelManifest';
import { gravarModeloFixo, lerModeloFixo, type ModeloFixo } from '../../../gateway/modeloFixo';
import { parakeetCabeNoAparelho } from '../../../gateway/sttRouter';
import { algumaAbaGravando } from '../../../lib/captura/travaDaGravacao';
import { type NivelDoAparelho, nivelDoAparelho } from '../../../lib/dispositivo/benchmark';
import { dispositivoDaRota, perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import type { SondaDoAparelho } from '../../../lib/dispositivo/sonda';
import { useSondaGuardada } from '../../../lib/dispositivo/useSondaGuardada';
import { data, numeroCom, t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import { Dialogo } from '../../ui';

/**
 * MODELOS NO APARELHO (Ajustes → Processamento): o que está guardado neste navegador, quanto ocupa, e
 * a escolha do modelo de transcrição.
 *
 * - "Automático (recomendado)" ligado = o roteador escolhe (`modeloFixo 'auto'`). Desligar fixa o que
 *   o automático usaria aqui; "Usar este" fixa um modelo e desliga o automático. O roteador só honra o
 *   fixado onde ele serve (idiomas, aparelho), então o que não serve aparece desabilitado com o motivo.
 * - O estado de cada modelo vem do Cache Storage de verdade (`modeloDisponivel`, arquivo a arquivo).
 * - "Baixar" existe só para o Parakeet (o único com caminho de só-baixar, `baixarModelo`); o Whisper e
 *   o Moonshine baixam na primeira captura. Com uma captura gravando em qualquer aba, não baixa.
 * - "Testar a velocidade do aparelho" refaz o microbenchmark (≤ 3 s) e grava na sonda.
 * Nada daqui sai do aparelho.
 */

const MB = 1_048_576;
const PRAZO_DA_TRAVA_MS = 2000;

function tamanho(bytes: number): string {
  if (bytes >= 1024 * MB) return t('{n} GB', { n: numeroCom(bytes / (1024 * MB), { maximumFractionDigits: 1 }) });
  return t('{n} MB', { n: numeroCom(Math.round(bytes / MB), { maximumFractionDigits: 0 }) });
}

const maiuscula = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

function idiomasDoItem(item: ItemDoCatalogo): string {
  if (item.idiomas === 'todos') return t('Todos os idiomas');
  return item.idiomas.map((l) => maiuscula(langLabelNaUI(l))).join(', ');
}

const SELO_DO_PESO = {
  leve: { icone: Feather, texto: 'Leve' },
  medio: { icone: Gauge, texto: 'Médio' },
  pesado: { icone: Weight, texto: 'Pesado' },
} as const;

const NIVEL: Record<NivelDoAparelho, { nome: string; frase: string }> = {
  leve: { nome: 'leve', frase: 'Os modelos leves são os que rodam bem aqui.' },
  bom: { nome: 'bom', frase: 'O equilibrado roda bem aqui.' },
  forte: { nome: 'forte', frase: 'Este aparelho aguenta os modelos maiores.' },
};

/** "Bergamot pt → en" / "opus-mt en → ROMANCE" com os nomes dos idiomas no lugar dos códigos. */
function nomeDoTradutor(titulo: string): { par: string; motor: string } {
  const m = /^(Bergamot|opus-mt) (\S+) → (\S+)$/.exec(titulo);
  if (!m) return { par: titulo, motor: '' };
  const nome = (c: string) => (/^[a-z]{2,3}$/.test(c) ? maiuscula(langLabelNaUI(c)) : c);
  return { par: `${nome(m[2])} → ${nome(m[3])}`, motor: m[1] };
}

/** Uma captura gravando em alguma aba (Web Locks), conferido de tempos em tempos enquanto a tela está aberta. */
function useAlgumaAbaGravando(): boolean {
  const [gravando, setGravando] = useState(false);
  useEffect(() => {
    let vivo = true;
    const conferir = () => void algumaAbaGravando().then((g) => vivo && setGravando(g));
    conferir();
    const id = setInterval(conferir, PRAZO_DA_TRAVA_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);
  return gravando;
}

/** `estudando` = o idioma do conteúdo; `meu` = o da pessoa (o do microfone). O roteador decide pelas fontes da captura. */
export default function ModelosNoAparelho({ estudando, meu }: { estudando: string; meu: string }) {
  const catalogo = useMemo(() => catalogoDeTranscricao(), []);
  const sondaGuardada = useSondaGuardada();
  const [sondaMedida, setSondaMedida] = useState<SondaDoAparelho | null>(null);
  const sonda = sondaMedida ?? sondaGuardada;
  const dispositivo = useMemo(() => dispositivoDaRota(perfilDoDispositivo(), sonda), [sonda]);
  const cabe = parakeetCabeNoAparelho(dispositivo);
  const gravando = useAlgumaAbaGravando();

  const [fixo, setFixo] = useState<ModeloFixo>(lerModeloFixo);
  const [vetado, setVetado] = useState(false);
  const [estados, setEstados] = useState<Record<string, EstadoDoCache | undefined>>({});
  const [versao, setVersao] = useState(0);
  const [espaco, setEspaco] = useState<{ usado: number; total: number } | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [falhouODownload, setFalhouODownload] = useState(false);
  const [confirmarTudo, setConfirmarTudo] = useState<'nao' | 'confirmar' | 'rodando'>('nao');
  const [medindo, setMedindo] = useState(false);
  const [nivel, setNivel] = useState<NivelDoAparelho | 'sem-medida' | null>(null);
  const download = useRef<AbortController | null>(null);
  const idDoAuto = useId();

  /* O veto da sentinela: o Parakeet derrubou a página aqui e a sonda o proibiu neste aparelho. */
  useEffect(() => {
    let vivo = true;
    void import('../../../lib/dispositivo/sonda')
      .then((m) => m.modeloProibido(ID_DO_PARAKEET))
      .then(
        (v) => vivo && setVetado(v),
        () => undefined,
      );
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    void Promise.all(catalogo.map(async (i) => [i.id, await modeloDisponivel(i.id)] as const)).then((pares) => {
      if (vivo) setEstados(Object.fromEntries(pares));
    });
    void (async () => {
      try {
        const e = await navigator.storage?.estimate?.();
        if (vivo && e && typeof e.usage === 'number' && typeof e.quota === 'number' && e.quota > 0)
          setEspaco({ usado: e.usage, total: e.quota });
      } catch {
        /* sem estimativa: a linha do espaço some */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [catalogo, versao]);

  /* Sair da tela no meio do download cancela (a carga do Parakeet ocupa memória enquanto verifica). */
  useEffect(() => () => download.current?.abort(), []);

  // `versao` relê os manifestos depois de apagar ou baixar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tradutores = useMemo(() => tradutoresGuardados(), [versao]);

  /** Por que este modelo não pode ser fixado aqui (`null` = pode). Idioma só bloqueia quando não serve a NENHUM dos dois. */
  const motivo = (item: ItemDoCatalogo): string | null => {
    if (item.fixo === 'parakeet') {
      if (vetado) return t('Este aparelho fechou a página com este modelo carregado; voltamos ao equilibrado.');
      if (!cabe) return t('Precisa de 8 GB de memória');
    }
    if (item.fixo === 'whisper-small' && !dispositivo.permiteSmall) return t('Precisa de placa de vídeo');
    if (alcanceDoModelo(item, estudando, meu).alcance === 'nada')
      return item.fixo === 'parakeet' ? t('Só para português e espanhol') : t('Só para inglês');
    return null;
  };

  /** Serve a um dos idiomas só: fixar vale nas capturas daquele idioma; nas outras, o roteador usa o automático. */
  const nota = (item: ItemDoCatalogo): string | null => {
    const a = alcanceDoModelo(item, estudando, meu);
    if (a.alcance !== 'parte') return null;
    const nomes = (ls: string[]) => ls.map((l) => langLabelNaUI(l)).join(', ');
    return t('Vale para {serve}; em {nao}, o app escolhe sozinho.', { serve: nomes(a.serve), nao: nomes(a.naoServe) });
  };

  const escolha = escolhaDoAutomatico(cabe, vetado, estudando, meu);

  const fixar = (m: ModeloFixo) => {
    if (m === 'parakeet') {
      /* Com a chave em '0' o adaptador recusaria o Parakeet fixado: escolher aqui é ligá-lo. */
      try {
        localStorage.setItem(CHAVE_DO_PARAKEET, '1');
      } catch {
        /* sem armazenamento: vale o padrão (ligado) */
      }
    }
    gravarModeloFixo(m);
    setFixo(m);
  };

  /** Desligar o automático fixa o que ele usaria aqui: o Preciso, se cabe e já está no aparelho; senão o Equilibrado. */
  const alternarAutomatico = () => {
    if (fixo !== 'auto') return fixar('auto');
    const preciso = catalogo[0];
    fixar(!motivo(preciso) && estados[preciso.id]?.completo ? 'parakeet' : 'whisper-base');
  };

  const baixar = async (item: ItemDoCatalogo) => {
    if (gravando || (await algumaAbaGravando())) return;
    const ctl = new AbortController();
    download.current = ctl;
    setFalhouODownload(false);
    setProgresso(0);
    const r = await baixarModelo(item.id, (f) => setProgresso(Math.round(f * 100)), ctl.signal);
    if (download.current === ctl) download.current = null;
    setProgresso(null);
    if (r === 'falhou') setFalhouODownload(true);
    setVersao((v) => v + 1);
  };

  /** Sem a cópia, o modelo fixado faria a próxima captura baixar tudo ao começar: apagar devolve o automático. */
  const soltarSeFixado = (ids: string[]) => {
    const atual = catalogo.find((i) => i.fixo === fixo);
    if (atual && ids.includes(atual.id)) fixar('auto');
  };

  const apagar = async (id: string) => {
    if (gravando || (await algumaAbaGravando())) return;
    await apagarModelo(id).catch(() => 0);
    soltarSeFixado([id]);
    setEstados((e) => ({ ...e, [id]: undefined }));
    setVersao((v) => v + 1);
  };

  const apagarTudo = async () => {
    if (gravando || (await algumaAbaGravando())) return setConfirmarTudo('nao');
    setConfirmarTudo('rodando');
    const ids = [...catalogo.map((i) => i.id), ...tradutores.map((tr) => tr.id)];
    for (const id of ids) await apagarModelo(id).catch(() => 0);
    soltarSeFixado(ids);
    setConfirmarTudo('nao');
    setEstados({});
    setVersao((v) => v + 1);
  };

  const testarVelocidade = async () => {
    setMedindo(true);
    setNivel(null);
    try {
      const m = await import('../../../lib/dispositivo/sonda');
      const s = await m.sondarEMedir({}, undefined, { forcarBenchmark: true });
      setSondaMedida(s);
      setNivel(nivelDoAparelho(s.benchmark) ?? 'sem-medida');
    } catch {
      setNivel('sem-medida');
    } finally {
      setMedindo(false);
    }
  };

  const guardadoAlgo =
    catalogo.some((i) => estados[i.id] && estados[i.id]!.motivo !== 'sem-manifesto') || tradutores.length > 0;
  const pctDoEspaco = espaco ? Math.min(100, Math.round((espaco.usado / espaco.total) * 100)) : 0;

  return (
    <section className="q-secao mna" data-testid="modelos-no-aparelho">
      <header>
        <div>
          <h2>{t('Modelos no aparelho')}</h2>
          <p>{t('Os modelos rodam no seu aparelho: nada do que você ouve sai daqui.')}</p>
        </div>
      </header>

      <div className="q-ajustes">
        <div className="q-ajuste">
          <div>
            <b id={idDoAuto}>{t('Automático (recomendado)')}</b>
            <small>
              {escolha === 'preciso'
                ? t('Seu computador aguenta o modelo preciso de português e espanhol.')
                : escolha === 'equilibrado-pelos-idiomas'
                  ? t('Para os seus idiomas, o equilibrado é o que roda melhor neste aparelho.')
                  : t('Para este aparelho, o equilibrado é o que roda sem esquentar.')}
            </small>
          </div>
          <button
            type="button"
            className="q-interruptor"
            role="switch"
            aria-checked={fixo === 'auto'}
            aria-labelledby={idDoAuto}
            onClick={alternarAutomatico}
          />
        </div>

        <div className="q-ajuste mna-espaco">
          <div>
            <b>
              {espaco
                ? t('Espaço usado: {usado} de {total}', { usado: tamanho(espaco.usado), total: tamanho(espaco.total) })
                : t('Espaço usado')}
            </b>
            {espaco && (
              <div
                className="mna-barra"
                role="meter"
                aria-label={t('Espaço usado')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pctDoEspaco}
                aria-valuetext={t('{pct}% do espaço deste navegador', { pct: pctDoEspaco })}
              >
                <span style={{ width: `${Math.max(pctDoEspaco, 1)}%` }} />
              </div>
            )}
          </div>
          <button
            type="button"
            className="q-ctl mna-perigo"
            disabled={!guardadoAlgo || confirmarTudo !== 'nao' || gravando}
            onClick={() => setConfirmarTudo('confirmar')}
          >
            <Trash2 aria-hidden /> {t('Apagar todos os modelos')}
          </button>
        </div>
      </div>

      <h3 className="mna-titulo">{t('Transcrição')}</h3>
      <ul className="mna-lista">
        {catalogo.map((item) => (
          <ItemDeTranscricao
            key={item.id}
            item={item}
            estado={estados[item.id]}
            fixado={fixo === item.fixo}
            motivo={motivo(item)}
            nota={nota(item)}
            gravando={gravando}
            progresso={item.fixo === 'parakeet' ? progresso : null}
            falhou={item.fixo === 'parakeet' && falhouODownload}
            aoBaixar={() => void baixar(item)}
            aoCancelar={() => download.current?.abort()}
            aoUsar={() => fixar(item.fixo)}
            aoApagar={() => void apagar(item.id)}
          />
        ))}
      </ul>

      <h3 className="mna-titulo">{t('Tradução')}</h3>
      {tradutores.length === 0 ? (
        <p className="mna-vazio">{t('Os tradutores baixam quando você traduz um par de idiomas pela primeira vez.')}</p>
      ) : (
        <ul className="mna-lista">
          {tradutores.map((tr) => {
            const { par, motor } = nomeDoTradutor(tr.titulo);
            return (
              <li key={tr.id} className="q-ajuste mna-item" aria-label={par}>
                <div>
                  <b>{par}</b>
                  <small>{[motor, tamanho(tr.bytes)].filter(Boolean).join(' · ')}</small>
                </div>
                <div className="mna-acoes">
                  <button type="button" className="q-ctl" disabled={gravando} onClick={() => void apagar(tr.id)}>
                    <Trash2 aria-hidden /> {t('Apagar')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="q-ajustes">
        <div className="q-ajuste">
          <div>
            <b>{t('Testar a velocidade do aparelho')}</b>
            <small aria-live="polite">
              {medindo
                ? t('Medindo… leva até 3 segundos.')
                : nivel === 'sem-medida'
                  ? t('Não deu para medir agora.')
                  : nivel
                    ? `${t('Medido agora: {nivel}', { nivel: t(NIVEL[nivel].nome) })}. ${t(NIVEL[nivel].frase)}`
                    : t('Uma conta rápida no processador e na placa de vídeo, aqui mesmo.')}
            </small>
          </div>
          <button
            type="button"
            className="q-ctl"
            disabled={medindo || gravando}
            onClick={() => void testarVelocidade()}
          >
            <Gauge aria-hidden /> {t('Testar')}
          </button>
        </div>
      </div>

      <p className="mna-creditos">
        {t(
          'Parakeet TDT v3 · NVIDIA · CC-BY-4.0. Whisper · OpenAI · MIT. Moonshine · Useful Sensors · MIT. Bergamot · Mozilla · MPL-2.0.',
        )}
      </p>

      {confirmarTudo !== 'nao' && (
        <Dialogo
          icone={Trash2}
          titulo={t('Apagar todos os modelos?')}
          sub={t('A próxima captura baixa de novo o que precisar e não funciona sem internet até terminar.')}
          largura=""
          aoFechar={() => setConfirmarTudo('nao')}
        >
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" data-autofocus onClick={() => setConfirmarTudo('nao')}>
              {t('Voltar')}
            </button>
            <button
              type="button"
              className="btn btn-solid perigo-solid"
              disabled={confirmarTudo === 'rodando'}
              onClick={() => void apagarTudo()}
            >
              <Trash2 aria-hidden /> {t('Apagar')}
            </button>
          </div>
        </Dialogo>
      )}
    </section>
  );
}

function ItemDeTranscricao({
  item,
  estado,
  fixado,
  motivo,
  nota,
  gravando,
  progresso,
  falhou,
  aoBaixar,
  aoCancelar,
  aoUsar,
  aoApagar,
}: {
  item: ItemDoCatalogo;
  estado: EstadoDoCache | undefined;
  fixado: boolean;
  motivo: string | null;
  nota: string | null;
  gravando: boolean;
  progresso: number | null;
  falhou: boolean;
  aoBaixar: () => void;
  aoCancelar: () => void;
  aoUsar: () => void;
  aoApagar: () => void;
}) {
  const idDoNome = useId();
  const Peso = SELO_DO_PESO[item.peso];
  const noAparelho = !!estado?.completo;
  const quando = noAparelho ? baixadoEm(item.id) : null;
  const temArquivos = !!estado && estado.motivo !== 'sem-manifesto';
  const situacao = !estado
    ? t('Verificando…')
    : noAparelho
      ? quando
        ? t('No aparelho · baixado em {data}', { data: data(new Date(quando), { day: '2-digit', month: '2-digit' }) })
        : t('No aparelho')
      : t('Não baixado');
  const detalhes = [
    idiomasDoItem(item),
    item.erroPtPorCem != null ? t('Erra cerca de {n} em 100 palavras', { n: item.erroPtPorCem }) : null,
    noAparelho ? tamanho(estado!.bytesTotais) : t('{n} MB', { n: item.mb }),
  ].filter(Boolean);

  return (
    <li className="q-ajuste mna-item" aria-labelledby={idDoNome} data-modelo={item.fixo}>
      <div>
        <div className="mna-cabeca">
          <b id={idDoNome}>{t(item.nome)}</b>
          <span className="q-tag mna-peso" data-peso={item.peso}>
            <Peso.icone aria-hidden /> {t(Peso.texto)}
          </span>
        </div>
        <small>{detalhes.join(' · ')}</small>
        <small className="mna-situacao">{situacao}</small>
        {motivo && <small className="mna-motivo">{motivo}</small>}
        {!motivo && nota && <small className="mna-nota">{nota}</small>}
        {falhou && <small className="mna-motivo">{t('Não deu para baixar agora. Tente de novo.')}</small>}
        {progresso != null && (
          <div
            className="mna-barra"
            role="progressbar"
            aria-label={t('Baixando {nome}', { nome: t(item.nome) })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progresso}
          >
            <span style={{ width: `${progresso}%` }} />
          </div>
        )}
      </div>
      <div className="mna-acoes">
        {!noAparelho &&
          (item.fixo === 'parakeet' ? (
            progresso != null ? (
              <button type="button" className="q-ctl" onClick={aoCancelar}>
                <X aria-hidden /> {t('Cancelar')}
              </button>
            ) : (
              <button
                type="button"
                className="q-ctl"
                disabled={!!motivo || gravando}
                title={gravando ? t('Termine a captura para baixar.') : undefined}
                onClick={aoBaixar}
              >
                <Download aria-hidden /> {t('Baixar')}
              </button>
            )
          ) : (
            <span className="mna-nota">{t('Baixa na primeira captura')}</span>
          ))}
        <button type="button" className="q-ctl" aria-pressed={fixado} disabled={!!motivo} onClick={aoUsar}>
          {fixado ? t('Em uso') : t('Usar este')}
        </button>
        {temArquivos && progresso == null && (
          <button
            type="button"
            className="q-ctl"
            disabled={gravando}
            title={gravando ? t('Termine a captura para apagar.') : undefined}
            onClick={aoApagar}
          >
            <Trash2 aria-hidden /> {t('Apagar')}
          </button>
        )}
      </div>
    </li>
  );
}
