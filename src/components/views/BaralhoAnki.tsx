import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import { ArrowLeft, Upload, Download, Loader2, AlertTriangle, FileText, Info, CheckCircle2 } from 'lucide-react';
import { apiFetch, exportarApkg } from '../../data/api';
import { ativarNotasDoBaralho, type ResultadoAtivar } from '../../data/apiAnki';
import { motivoLegivel, ROTULO_MOTIVO, type MotivoDescarte } from '@core';
import type { VocabCard } from '../../types';
import type { AgeProfileType } from '../../lib/profile';
import { toast } from '../Toast';

/**
 * BARALHOS DO ANKI — trazer e levar.
 *
 * POR QUE IMPORTAR. Existe um acervo enorme de baralhos prontos de idiomas, e obrigar quem já tem
 * um a recomeçar do zero aqui seria pedir que jogue fora um trabalho que já fez. Trazer o baralho
 * é o caminho mais rápido de sair do vocabulário vazio sem depender de captura.
 *
 * POR QUE EXPORTAR, e isto importa tanto quanto: o vocabulário é da pessoa, não do aplicativo. Um
 * app que só aceita entrada prende; poder levar embora é o que torna a escolha de ficar uma
 * escolha de verdade.
 *
 * A IMPORTAÇÃO GRAVA O ACERVO DE UMA VEZ — a rota `/api/import/anki` já lê, aplica a régua de
 * qualidade e grava o baralho, as notas e o ledger de import no servidor; quando a resposta
 * chega, a importação JÁ aconteceu. O que esta tela decide depois é outra coisa: quantas dessas
 * notas viram cartão jogável AGORA. Um baralho de 3.600 notas não pode despejar 3.600 cartões
 * vencidos na fila de revisão de amanhã — por isso ativar é um passo separado, e explícito.
 */

interface BaralhoAnkiProps {
  deck: VocabCard[];
  /** Idiomas a atribuir ao que for importado — o Anki não guarda essa informação de forma confiável. */
  idioma: string;
  idiomaNativo: string;
  ageProfile: AgeProfileType;
  onVoltar: () => void;
  onImportou: () => void | Promise<void>;
}

/** Quantas notas oferecer para ativar de uma vez. Mais que isso de uma vez inundaria a fila de
 *  revisão — a pessoa abriria o app com milhares de cartões vencendo no mesmo dia. */
const TETO = 300;

/** O que a rota `POST /api/import/anki` devolve HOJE — o import já aconteceu quando isto chega. */
interface ResumoImportAnki {
  notas: number;
  novas: number;
  atualizadas: number;
  iguais: number;
  descartadas: number;
  porMotivo: Record<string, number>;
}

interface ImportAnkiResposta {
  importId: string;
  deckId: string;
  resumo: ResumoImportAnki;
  campos: string[];
  notetype: string | null;
  baralhos: string[];
  formato: string;
  truncado: boolean;
  totalNoArquivo: number;
  amostra: Array<{ frente: string; verso: string; exemplo: string | null }>;
}

/** Timeout folgado: o `.apkg` reempacotado ainda pode ter dezenas de milhares de notas. */
const IMPORT_TIMEOUT_MS = 600_000;

/**
 * GRAVA o acervo no servidor — não é mais "ler e depois confirmar". `bulkAddCards` saiu deste
 * fluxo porque a rota passou a gravar sozinha (baralho + notas + ledger); um segundo passo de
 * "gravar" aqui duplicaria o que o servidor já fez, e divergiria da régua de qualidade que roda
 * lá (perfil `'curado'`, ver `server/routes/import.ts`).
 */
/**
 * O IDIOMA VIAJA JUNTO, e sem ele o baralho entra e não chega a jogo nenhum: o cartão nasce com
 * `srcLang` vazio, a triagem o marca `idioma-incerto` e ele cai na pilha "de outro idioma" assim
 * que há um idioma selecionado no lobby. Medido importando 3.600 notas: acervo cheio, tela ainda
 * dizendo "3 palavras". O `.apkg` não declara idioma de forma confiável — quem sabe é esta tela.
 */
async function importarBaralhoAnki(arquivo: File, idioma: string, idiomaNativo: string): Promise<ImportAnkiResposta> {
  const res = await apiFetch('/api/import/anki', {
    timeoutMs: IMPORT_TIMEOUT_MS,
    method: 'POST',
    headers: {
      'X-Filename': encodeURIComponent(arquivo.name),
      ...(idioma ? { 'X-Src-Lang': idioma } : {}),
      ...(idiomaNativo ? { 'X-Tgt-Lang': idiomaNativo } : {}),
    },
    body: arquivo,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: 'falha ao importar o baralho' }));
    throw new Error(e.error ?? 'falha ao importar o baralho');
  }
  return (await res.json()) as ImportAnkiResposta;
}

export default function BaralhoAnki({
  deck, idioma, idiomaNativo, ageProfile, onVoltar, onImportou,
}: BaralhoAnkiProps) {
  const [enviando, setEnviando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ImportAnkiResposta | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [erroAtivar, setErroAtivar] = useState<string | null>(null);
  const [ativacao, setAtivacao] = useState<ResultadoAtivar | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * MANDA SÓ A COLEÇÃO — sem isto, baralhos reais nem chegam ao servidor.
   *
   * O DEFEITO, com o "4000 Essential English Words" do AnkiWeb: o `.apkg` tem **214 MB**, a rota
   * aceita 200, e o estouro acontece no middleware `raw()` — ANTES do `try/catch` do handler —,
   * então virava um 500 "erro interno" que não dizia nada. Do lado de quem usa: "tentei subir e
   * não deu".
   *
   * Mas o tamanho é quase todo MÍDIA que o importador joga fora: aquele arquivo tem 14.948
   * entradas, das quais 14.946 são áudio e imagem. O que o parser lê é uma só —
   * `collection.anki2x` — e ela tem 630 KB. Medido: **224.592.115 → 629.713 bytes, 356× menor.**
   *
   * Reempacotar em vez de mandar a coleção crua mantém o servidor intacto: ele continua
   * recebendo um `.apkg` legítimo, com o mesmo nome de entrada que já procura, e o caminho do
   * `.anki21b` (zstd dentro do zip) segue funcionando porque os bytes são copiados como estão.
   *
   * Em caso de dúvida, manda o arquivo original: um zip que não abre aqui pode abrir lá, e a
   * mensagem do servidor explica melhor do que um erro inventado no cliente.
   */
  const soAColecao = async (arquivo: File): Promise<File> => {
    if (!/\.apkg$/i.test(arquivo.name)) return arquivo;
    try {
      const zip = await JSZip.loadAsync(arquivo);
      const nome = ['collection.anki21b', 'collection.anki21', 'collection.anki2']
        .find((n) => zip.file(n));
      if (!nome) return arquivo;
      const dados = await zip.file(nome)!.async('uint8array');
      const enxuto = new JSZip();
      enxuto.file(nome, dados);
      const blob = await enxuto.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      // Só vale a pena se de fato encolheu; senão o original já era enxuto.
      if (blob.size >= arquivo.size) return arquivo;
      return new File([blob], arquivo.name, { type: 'application/octet-stream' });
    } catch {
      return arquivo;
    }
  };

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    setAtivacao(null);
    setErroAtivar(null);
    setNomeArquivo(arquivo.name);
    setEnviando(true);
    try {
      const resp = await importarBaralhoAnki(await soAColecao(arquivo), idioma, idiomaNativo);
      setResultado(resp);
      await onImportou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  /** O que dá para ativar: tudo que entrou no acervo, menos o que a régua já descartou. */
  const podeAtivar = resultado ? Math.max(0, resultado.resumo.notas - resultado.resumo.descartadas) : 0;
  const sugestaoAtivar = Math.min(TETO, podeAtivar);

  const ativar = async () => {
    if (!resultado || !sugestaoAtivar) return;
    setAtivando(true);
    setErroAtivar(null);
    try {
      const r = await ativarNotasDoBaralho(resultado.deckId, sugestaoAtivar);
      setAtivacao(r);
      await onImportou();
      if (r.ativadas) toast.ok(`${r.ativadas} ${r.ativadas === 1 ? 'palavra entrou' : 'palavras entraram'} na sua fila`);
    } catch (e) {
      setErroAtivar((e as Error).message);
    } finally {
      setAtivando(false);
    }
  };

  /** As palavras que dá para levar: só as que têm tradução — cartão de um lado só não é cartão. */
  const exportaveis = deck.filter(c => c.inDeck && (c.translation ?? '').trim());

  const baixar = (blob: Blob, nome: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** `.apkg`: abre no Anki com duplo clique e chega com nome de baralho. */
  const exportarBaralho = async () => {
    if (!exportaveis.length) { toast.warn('Não há palavras com tradução para exportar.'); return; }
    setEnviando(true);
    try {
      const blob = await exportarApkg(
        exportaveis.map(c => ({ frente: c.word, verso: c.translation, exemplo: c.sentence })),
        `Babel Play ${idioma || ''}`.trim(),
      );
      baixar(blob, `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.apkg`);
      toast.ok(`${exportaveis.length} palavras no arquivo`);
    } catch (e) {
      toast.error(`Não consegui gerar o .apkg: ${(e as Error).message}`);
    } finally { setEnviando(false); }
  };

  /**
   * EXPORTAR em texto separado por tabulação — o formato que o Anki importa NATIVAMENTE, sem
   * plugin nem conversão. Fica ao lado do `.apkg` de propósito: é o caminho que funciona mesmo
   * que a versão do Anki recuse o pacote, e o que serve para abrir numa planilha.
   */
  const exportar = () => {
    const linhas = exportaveis
      .map(c => [c.word, c.translation, c.sentence ?? '']
        .map(x => String(x).replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
        .join('\t'));
    if (!linhas.length) { toast.warn('Não há palavras com tradução para exportar.'); return; }

    // O cabeçalho `#separator:tab` é lido pelo Anki e evita a tela de escolher separador.
    const conteudo = ['#separator:tab', '#html:false', ...linhas].join('\n');
    baixar(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }),
      `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.txt`);
    toast.ok(`${linhas.length} palavras exportadas`);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <header className="mb-6">
        <button onClick={onVoltar} className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink mb-3 py-1 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Voltar aos jogos
        </button>
        <h1 className="font-display font-black text-2xl text-ink tracking-tight">
          {ageProfile === 'kids' ? 'Trazer palavras de fora' : 'Baralhos do Anki'}
        </h1>
        <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">
          Traga um baralho pronto que você já tenha, ou leve o seu vocabulário embora. As palavras
          importadas entram nos jogos como todas as outras.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ─── IMPORTAR ─── */}
        <section className="card-panel bg-surface p-5 flex flex-col gap-3">
          <span className="label-mono flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" aria-hidden /> Trazer um baralho
          </span>

          <input
            ref={inputRef}
            type="file"
            accept=".apkg,.txt,.csv,.tsv"
            className="hidden"
            onChange={e => void escolher(e.target.files?.[0])}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> importando…</> : <><Upload className="w-4 h-4" /> Escolher arquivo</>}
          </button>
          <p className="text-[11px] text-ink-faint">
            Aceita <b>.apkg</b> (o que se baixa do AnkiWeb, inclusive os novos, comprimidos) e
            texto <b>.txt</b>/<b>.csv</b>.
          </p>

          {erro && (
            <p className="flex items-start gap-2 text-[12px] text-error-ink bg-error-soft border border-error/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {erro}
            </p>
          )}

          {/* O SALDO DO ACERVO: a importação já aconteceu quando chega aqui. */}
          {resultado && (
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
              <div className="text-[12px] text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="text-ink">{resultado.resumo.notas}</b> notas lidas de {nomeArquivo}</span>
                <span className="font-mono text-[11px]">{resultado.formato}</span>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                <li><b className="text-good-ink">{resultado.resumo.novas}</b> novas</li>
                {resultado.resumo.atualizadas > 0 && <li><b className="text-ink">{resultado.resumo.atualizadas}</b> atualizadas</li>}
                {resultado.resumo.iguais > 0 && <li><b className="text-ink">{resultado.resumo.iguais}</b> iguais ao que já tinha</li>}
              </ul>

              {resultado.campos.length > 0 && (
                <p className="text-[11px] text-ink-faint">
                  Campos do baralho: {resultado.campos.join(' · ')} → viram <b>palavra</b>,{' '}
                  <b>tradução</b>{resultado.campos.length > 2 && <> e <b>frase</b></>}.
                </p>
              )}

              {/* Amostra real: a pessoa confere se os lados não vieram trocados. */}
              {resultado.amostra.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {resultado.amostra.map((n, i) => (
                    <li key={i} className="text-[12px] flex gap-2 items-baseline">
                      <span className="font-bold text-ink">{n.frente}</span>
                      <span className="text-ink-faint">=</span>
                      <span className="text-ink-muted truncate">{n.verso}</span>
                    </li>
                  ))}
                </ul>
              )}

              {resultado.resumo.descartadas > 0 && (
                <>
                  <p className="text-[12px] text-ink-muted">{resultado.resumo.descartadas} não entraram no acervo:</p>
                  <ul className="flex flex-col gap-0.5">
                    {Object.entries(resultado.resumo.porMotivo).map(([motivo, n]) => (
                      <li key={motivo} className="text-[12px] text-ink-muted">
                        <b className="text-ink">{n}</b>{' '}
                        {ROTULO_MOTIVO[motivo as MotivoDescarte]?.titulo.toLowerCase() ?? motivoLegivel(motivo)}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {resultado.truncado && (
                <p className="flex items-start gap-2 text-[11px] text-warn-ink">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                  Este arquivo tem <b>{resultado.totalNoArquivo}</b> notas, mais do que dá para ler
                  de uma vez; só as primeiras {resultado.resumo.notas} entraram agora. Importe o
                  mesmo arquivo de novo depois para trazer o resto.
                </p>
              )}

              {/* O PONTO DO PRODUTO, dito sem jargão: entrou no acervo, mas ninguém foi para a
                  fila de revisão ainda. Sem isto, quem importasse 3.600 notas abriria o app amanhã
                  com 3.600 cartões vencidos. */}
              <p className="flex items-start gap-2 text-[12px] text-ink-muted bg-canvas border border-border-subtle rounded-lg p-3">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden />
                Essas palavras já estão guardadas, mas nenhuma foi para a sua fila de estudo ainda.
                Escolha quantas começar agora — o resto espera, sem pressa.
              </p>

              {!ativacao && podeAtivar > 0 && (
                <button
                  onClick={() => void ativar()}
                  disabled={ativando}
                  className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {ativando ? <><Loader2 className="w-4 h-4 animate-spin" /> ativando…</> : `Começar com as primeiras ${sugestaoAtivar}`}
                </button>
              )}

              {/* Nada para ativar: a régua recusou tudo. Não mostra botão morto — diz o porquê e
                  aponta o caminho, em vez de deixar a pessoa clicar em algo que não faz nada. */}
              {!ativacao && podeAtivar === 0 && (
                <p className="flex items-start gap-2 text-[12px] text-warn-ink">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  Nenhuma nota deste baralho passou pela régua de qualidade — reveja o mapeamento
                  de campos no arquivo original e importe de novo.
                </p>
              )}

              {erroAtivar && (
                <p className="flex items-start gap-2 text-[12px] text-error-ink bg-error-soft border border-error/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {erroAtivar}
                </p>
              )}

              {ativacao && (
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-good-ink">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {ativacao.ativadas} entraram na sua fila
                  </p>
                  {ativacao.restantes > 0 && (
                    <p className="text-[11px] text-ink-faint">
                      Ainda há {ativacao.restantes} guardadas no baralho. Traga mais quando quiser,
                      na Biblioteca de Baralhos.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── EXPORTAR ─── */}
        <section className="card-panel bg-surface p-5 flex flex-col gap-3">
          <span className="label-mono flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" aria-hidden /> Levar o meu embora
          </span>
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Leva palavra, tradução e a frase de onde ela veio. São <b>{exportaveis.length}</b> palavras
            com tradução no seu baralho.
          </p>
          <button
            onClick={() => void exportarBaralho()}
            disabled={enviando || !exportaveis.length}
            className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> montando…</> : <><Download className="w-4 h-4" /> Baralho .apkg</>}
          </button>
          <button
            onClick={exportar}
            disabled={!exportaveis.length}
            className="py-2.5 px-4 bg-canvas border border-border-subtle hover:border-accent text-ink rounded-xl font-bold text-[13px] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Texto (.txt)
          </button>
          {/* Os DOIS, e a diferença dita: o `.apkg` é o mais confortável, o texto é o que nunca
              falha. Prometer um só seria escolher pela pessoa sem ela saber o custo. */}
          <p className="text-[11px] text-ink-faint leading-relaxed">
            O <b>.apkg</b> abre no Anki com duplo clique e já chega com nome de baralho. O
            <b> .txt</b> é separado por tabulação: o Anki importa sem plugin nenhum, e abre em
            planilha. Em nenhum dos dois vai o histórico de revisão, o agendamento daqui é outro,
            e as datas não corresponderiam a nada lá.
          </p>
        </section>
      </div>
    </div>
  );
}
