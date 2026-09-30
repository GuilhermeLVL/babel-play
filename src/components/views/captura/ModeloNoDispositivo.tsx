import { Check, Cpu, Download, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { revisaoFixaDoModelo } from '../../../gateway/adapters/bergamotModelo';
import {
  apagarModelo,
  baixadoEm,
  type EstadoDoCache,
  modeloDisponivel,
  type SituacaoDaVersao,
  situacaoDaVersao,
} from '../../../gateway/modelManifest';
import { data } from '../../../lib/i18n';
import { toast } from '../../Toast';
import { Dialogo, fecharDialogoDe } from '../../ui';

/**
 * MODELO NO DISPOSITIVO — o `dialogoModelo()` do protótipo aprovado (C9), aberto pelo selo do
 * modelo no cabeçalho da Captura.
 *
 * Cada linha é um modelo que a captura vai usar com o par e a qualidade atuais, e o estado vem do
 * Cache Storage de verdade (`modeloDisponivel`, validado arquivo a arquivo): pronto, incompleto
 * (com quanto falta) ou "baixa na primeira captura". O tamanho é o medido no cache; sem cópia, o
 * estimado pelo roteador; a data é a do manifesto gravado quando o download terminou.
 * "Liberar espaço" apaga os arquivos do Cache Storage (com a confirmação do protótipo).
 * "Procurar atualização" pergunta ao Hugging Face qual é a versão publicada (o commit) e compara com
 * a que o download guardou no manifesto (`situacaoDaVersao`). Com versão nova, "Atualizar" apaga a
 * cópia antiga e a próxima captura baixa a nova.
 */
export interface ModeloDaCaptura {
  id: string;
  titulo: string;
  /** Tamanho estimado do download (MB), quando o roteador sabe. */
  mbEstimado?: number;
  /** O estimado foi medido (e não calculado por proporção)? */
  medido?: boolean;
}

const mb = (bytes: number) => Math.round(bytes / 1_048_576);

export default function ModeloNoDispositivo({
  modelos,
  rota,
  nuvem,
  aoFechar,
}: {
  modelos: ModeloDaCaptura[];
  /** A rota que o STT tomou nesta captura (ex.: "Whisper small · local"), quando já se sabe. */
  rota?: string;
  /** O provedor ativo é a nuvem (a chave da pessoa): o modelo local é só a reserva. */
  nuvem: boolean;
  aoFechar: () => void;
}) {
  const [estados, setEstados] = useState<Record<string, EstadoDoCache | undefined>>({});
  const [apagando, setApagando] = useState<'nao' | 'confirmar' | 'rodando'>('nao');
  const [versao, setVersao] = useState(0);
  /** O que "Procurar atualização" achou para cada modelo (nada antes de procurar). */
  const [versoes, setVersoes] = useState<Record<string, SituacaoDaVersao>>({});
  const [procurando, setProcurando] = useState(false);
  const chave = modelos.map((m) => m.id).join('|');

  useEffect(() => {
    let vivo = true;
    void Promise.all(modelos.map(async (m) => [m.id, await modeloDisponivel(m.id)] as const)).then((pares) => {
      if (vivo) setEstados(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
    // `chave` resume a lista: a identidade do array muda a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao]);

  const liberar = async () => {
    setApagando('rodando');
    let bytes = 0;
    for (const m of modelos) bytes += await apagarModelo(m.id).catch(() => 0);
    setApagando('nao');
    setEstados({});
    setVersao((v) => v + 1);
    toast.ok(`Modelos apagados: ${mb(bytes)} MB liberados`);
  };

  const procurarAtualizacao = async () => {
    const baixados = modelos.filter((m) => estados[m.id]?.completo);
    if (!baixados.length) return;
    setProcurando(true);
    // O Bergamot tem a versão fixada no código (não pergunta ao Hub); os outros, o commit publicado.
    const pares = await Promise.all(
      baixados.map(async (m) => [m.id, await situacaoDaVersao(m.id, fetch, revisaoFixaDoModelo(m.id))] as const),
    );
    setProcurando(false);
    setVersoes(Object.fromEntries(pares));
    const sit = pares.map(([, v]) => v);
    const velhos = sit.filter((v) => v === 'desatualizado').length;
    if (velhos) toast.info(velhos === 1 ? 'Há uma versão nova de um modelo' : `Há versão nova de ${velhos} modelos`);
    else if (sit.includes('sem-rede')) toast.info('Sem conexão com o Hugging Face: não deu para conferir agora');
    else
      toast.ok(
        baixados.length === 1
          ? 'O modelo está na versão mais nova'
          : `Os ${baixados.length === 2 ? 'dois' : baixados.length} modelos estão na versão mais nova`,
      );
  };

  /** Atualizar = apagar a cópia antiga; a próxima captura baixa a versão publicada. */
  const atualizar = async (m: ModeloDaCaptura) => {
    const bytes = await apagarModelo(m.id).catch(() => 0);
    setVersoes((v) => {
      const resto = { ...v };
      delete resto[m.id];
      return resto;
    });
    setEstados({});
    setVersao((n) => n + 1);
    toast.ok(`Versão antiga apagada (${mb(bytes)} MB): a nova baixa na próxima captura`);
  };

  const total = modelos.reduce((soma, m) => soma + (estados[m.id]?.completo ? estados[m.id]!.bytesTotais : 0), 0);
  const conferido = modelos.every((m) => estados[m.id]);

  if (apagando !== 'nao') {
    return (
      <Dialogo
        icone={Trash2}
        titulo="Apagar os modelos?"
        sub={`Libera ${mb(total)} MB. A próxima captura baixa tudo de novo e não funciona sem internet até terminar.`}
        largura=""
        aoFechar={aoFechar}
      >
        <div className="dlg-pe">
          <button type="button" className="btn btn-outline" data-autofocus onClick={() => setApagando('nao')}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-solid perigo-solid"
            disabled={apagando === 'rodando'}
            onClick={() => void liberar()}
          >
            <Trash2 aria-hidden /> Apagar
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      icone={Cpu}
      titulo="Modelo no dispositivo"
      sub={
        nuvem
          ? 'Com a sua chave, a transcrição vai pela nuvem; o modelo daqui é a reserva.'
          : 'Transcrição e tradução rodam aqui, sem mandar o áudio para fora.'
      }
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha">
        {modelos.map((m) => {
          const e = estados[m.id];
          const tamanho = e?.completo
            ? `${mb(e.bytesTotais)} MB`
            : m.mbEstimado
              ? `${m.medido ? '' : 'cerca de '}${m.mbEstimado} MB`
              : 'tamanho a medir';
          return (
            <div key={m.id} className="op-linha">
              <div>
                <b>{m.titulo}</b>
                <small>
                  {tamanho}
                  {e?.completo && baixadoEm(m.id)
                    ? ` · baixado em ${data(new Date(baixadoEm(m.id)!), { day: '2-digit', month: '2-digit' })}`
                    : ''}
                  {e && !e.completo && e.motivo !== 'sem-manifesto' && e.bytesFaltando > 0
                    ? ` · faltam ${mb(e.bytesFaltando)} MB`
                    : ''}
                  {versoes[m.id] === 'atual'
                    ? ' · versão atual'
                    : versoes[m.id] === 'desatualizado'
                      ? ' · versão nova disponível'
                      : ''}
                </small>
              </div>
              {versoes[m.id] === 'desatualizado' ? (
                <button type="button" className="btn btn-outline peq" onClick={() => void atualizar(m)}>
                  <Download aria-hidden /> Atualizar
                </button>
              ) : !e ? (
                <span className="badge neu">verificando…</span>
              ) : e.completo ? (
                <span className="badge ok">
                  <Check aria-hidden /> pronto
                </span>
              ) : e.motivo === 'sem-manifesto' ? (
                <span className="badge neu">
                  <Download aria-hidden /> na primeira captura
                </span>
              ) : (
                <span className="badge warn">
                  <TriangleAlert aria-hidden /> incompleto
                </span>
              )}
            </div>
          );
        })}
        {conferido && (
          <p className="mut" style={{ fontSize: 12.5 }}>
            Total no disco: <b style={{ color: 'var(--ink)' }}>{mb(total)} MB</b>.{' '}
            {total > 0 ? 'Funciona sem internet.' : 'Nada baixado ainda: o download acontece na primeira captura.'}
          </p>
        )}
        {rota && (
          <p className="mut" style={{ fontSize: 12.5 }}>
            Nesta captura: <b style={{ color: 'var(--ink)' }}>{rota}</b>
          </p>
        )}
      </div>
      <div className="dlg-pe">
        <button
          type="button"
          className="btn btn-outline perigo"
          style={{ marginRight: 'auto' }}
          disabled={!conferido || total === 0}
          onClick={() => setApagando('confirmar')}
        >
          <Trash2 aria-hidden /> Liberar espaço
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!conferido || total === 0 || procurando}
          onClick={() => void procurarAtualizacao()}
        >
          <RefreshCw aria-hidden /> {procurando ? 'Procurando…' : 'Procurar atualização'}
        </button>
        <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          Fechar
        </button>
      </div>
    </Dialogo>
  );
}
