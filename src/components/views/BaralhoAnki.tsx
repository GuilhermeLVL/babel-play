import { type MotivoDescarte, motivoLegivel, ROTULO_MOTIVO } from '@core';
import JSZip from 'jszip';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileArchive,
  FileText,
  Info,
  Layers,
  Loader2,
  Play,
  Upload,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

import { apiFetch, exportarApkg } from '../../data/api';
import { ativarNotasDoBaralho, type ResultadoAtivar } from '../../data/apiAnki';
import { numero, t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import type { VocabCard } from '../../types';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, type ItemDeAba, PainelDeAba, Tela } from '../ui';

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
  /**
   * O rótulo do "voltar" é o nome da tela de ORIGEM: "Jogar" quando vem dos jogos (o padrão, como
   * no protótipo), "Vocabulário" quando vem de lá. Antes dizia sempre "Voltar aos jogos", e quem
   * tinha vindo do Vocabulário lia que ia para outro lugar.
   */
  rotuloVoltar?: string;
  /** A aba "Gerenciar" leva à tela de baralhos (`BaralhosAnki`); sem isto a aba não aparece. */
  onGerenciar?: () => void;
  /** Quantos baralhos já foram trazidos — a contagem da aba "Gerenciar". */
  nBaralhos?: number;
  /** "Jogar com este baralho" depois de ativar: recorta os jogos pelo baralho recém-trazido. */
  onJogarCom?: (deckId: string, nome: string) => void;
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
  deck,
  idioma,
  idiomaNativo,
  ageProfile,
  onVoltar,
  onImportou,
  rotuloVoltar = 'Jogar',
  onGerenciar,
  nBaralhos,
  onJogarCom,
}: BaralhoAnkiProps) {
  const [aba, setAba] = useState<'trazer' | 'levar'>('trazer');
  const [enviando, setEnviando] = useState(false);
  /** Gerando o `.apkg` para levar — separado de `enviando` (importar), que muda a aba "Trazer". */
  const [gerando, setGerando] = useState(false);
  // "Babel Play inglês" (protótipo): o nome do idioma, não o código.
  const nomePadrao = `Babel Play ${idioma ? langLabelNaUI(idioma).toLowerCase() : ''}`.trim();
  const [nomeExp, setNomeExp] = useState(nomePadrao);
  const [incluirFrase, setIncluirFrase] = useState(true);
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
      const nome = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((n) => zip.file(n));
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
      if (r.ativadas)
        toast.ok(`${r.ativadas} ${r.ativadas === 1 ? 'palavra entrou' : 'palavras entraram'} na sua fila`);
    } catch (e) {
      setErroAtivar((e as Error).message);
    } finally {
      setAtivando(false);
    }
  };

  /** As palavras que dá para levar: só as que têm tradução — cartão de um lado só não é cartão. */
  const exportaveis = deck.filter((c) => c.inDeck && (c.translation ?? '').trim());

  const baixar = (blob: Blob, nome: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** `.apkg`: abre no Anki com duplo clique e chega com nome de baralho. */
  const exportarBaralho = async () => {
    if (!exportaveis.length) {
      toast.warn('Não há palavras com tradução para exportar.');
      return;
    }
    setGerando(true);
    try {
      /* O nome do baralho e a frase de exemplo são escolhas da pessoa (a aba "Levar embora"): sem
         a frase, o verso leva só a tradução. */
      const blob = await exportarApkg(
        exportaveis.map((c) => ({
          frente: c.word,
          verso: c.translation,
          exemplo: incluirFrase ? c.sentence : undefined,
        })),
        nomeExp.trim() || nomePadrao,
      );
      baixar(blob, `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.apkg`);
      toast.ok(`Baixando “${nomeExp.trim() || nomePadrao}” (.apkg, ${exportaveis.length} cartões)`);
    } catch (e) {
      toast.error(`Não consegui gerar o .apkg: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  /**
   * EXPORTAR em texto separado por tabulação — o formato que o Anki importa NATIVAMENTE, sem
   * plugin nem conversão. Fica ao lado do `.apkg` de propósito: é o caminho que funciona mesmo
   * que a versão do Anki recuse o pacote, e o que serve para abrir numa planilha.
   */
  const exportar = () => {
    const linhas = exportaveis.map((c) =>
      [c.word, c.translation, c.sentence ?? '']
        .map((x) => String(x).replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
        .join('\t'),
    );
    if (!linhas.length) {
      toast.warn('Não há palavras com tradução para exportar.');
      return;
    }

    // O cabeçalho `#separator:tab` é lido pelo Anki e evita a tela de escolher separador.
    const conteudo = ['#separator:tab', '#html:false', ...linhas].join('\n');
    baixar(
      new Blob([conteudo], { type: 'text/plain;charset=utf-8' }),
      `babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.txt`,
    );
    toast.ok(`Baixando babel-${idioma || 'deck'}-${new Date().toISOString().slice(0, 10)}.txt`);
  };

  /** O dia de hoje no nome do arquivo (`babel-en-2026-09-23.apkg`), como no protótipo. */
  const hoje = new Date().toISOString().slice(0, 10);
  const nomeApkg = `babel-${idioma || 'deck'}-${hoje}.apkg`;

  /* A PRÉVIA DO .TXT é o começo do arquivo DE VERDADE: o cabeçalho que o Anki lê e as duas primeiras
     palavras que vão nele (a frase encurtada, só para caber). */
  const curta = (s: string) => (s.length > 18 ? `${s.slice(0, 16).trimEnd()}…` : s);
  const previaTxt = [
    '#separator:tab',
    '#html:false',
    ...exportaveis.slice(0, 2).map((c) => [c.word, c.translation, curta(c.sentence ?? '')].join('\t')),
  ].join('\n');

  const etapa: 'escolher' | 'lendo' | 'lido' = resultado ? 'lido' : enviando ? 'lendo' : 'escolher';
  const idInput = 'anki-arquivo';

  /* ─── TRAZER ─── a marcação do protótipo aprovado (`T.anki`, aba "Trazer"): a área de soltar
     `.soltar.grande`, a leitura com `.ondas`, e o resultado em `.cartao.p6.pilha` com os ladrilhos
     do saldo, o mapeamento dos campos, a amostra e o porquê das descartadas. Tudo com o que a rota
     devolveu de verdade. */
  const trazer = (
    <>
      {/* Um input só, sempre montado: é ele que a área de soltar e o "Escolher outro arquivo" abrem. */}
      <input
        ref={inputRef}
        id={idInput}
        type="file"
        className="sr"
        accept=".apkg,.txt,.csv,.tsv"
        onChange={(e) => {
          void escolher(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {etapa === 'escolher' && (
        <section className="cartao p6">
          <label
            className="soltar grande"
            htmlFor={idInput}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void escolher(e.dataTransfer.files?.[0]);
            }}
          >
            <IconeEmBloco icone={Upload} />
            <span>
              <b>Solte o arquivo aqui</b> ou clique para escolher
            </span>
            <small className="mut">
              .apkg (Anki, inclusive os novos, comprimidos), .txt, .csv ou .tsv · até 200 MB
            </small>
          </label>
          <div className="aviso-info" style={{ marginTop: 14 }}>
            <Info aria-hidden />
            <span>
              No Anki: <b style={{ color: 'var(--ink)' }}>Arquivo → Exportar → Pacote de baralho (.apkg)</b>. O
              histórico de revisão do Anki não vem junto; a revisão recomeça aqui.
            </span>
          </div>
          {erro && (
            <div className="aviso-info warn" role="alert" style={{ marginTop: 10 }}>
              <AlertTriangle aria-hidden />
              <span>{erro}</span>
            </div>
          )}
        </section>
      )}

      {etapa === 'lendo' && (
        <section className="cartao p6">
          <div className="linha" style={{ gap: 12 }}>
            <span className="ondas" aria-hidden="true">
              <i />
              <i style={{ animationDelay: '.2s' }} />
              <i style={{ animationDelay: '.4s' }} />
            </span>
            <span role="status">
              Lendo <b>{nomeArquivo}</b>…
            </span>
          </div>
          <div className="barra" style={{ marginTop: 14 }}>
            <span className="enche" />
          </div>
        </section>
      )}

      {etapa === 'lido' && resultado && (
        <section className="cartao p6 pilha">
          <div className="entre">
            <div className="linha" style={{ gap: 12 }}>
              <IconeEmBloco icone={FileArchive} />
              <div>
                <b>{nomeArquivo}</b>
                <p className="mut" style={{ fontSize: 12.5 }}>
                  {resultado.formato === 'apkg'
                    ? 'Pacote do Anki'
                    : resultado.formato.charAt(0).toLocaleUpperCase() + resultado.formato.slice(1)}{' '}
                  · {numero(resultado.resumo.notas)} notas lidas
                </p>
              </div>
            </div>
            {ativacao && (
              <span className="badge ok">
                <Check aria-hidden /> {ativacao.ativadas} entraram na sua fila
              </span>
            )}
          </div>

          {/* O SALDO DO ACERVO: a importação já aconteceu quando chega aqui. */}
          <div className="ladrilhos" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
            <div className="cartao ladrilho">
              <span className="label-mono">Novas</span>
              <span className="v good">{numero(resultado.resumo.novas)}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Atualizadas</span>
              <span className="v acc">{numero(resultado.resumo.atualizadas)}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Iguais</span>
              <span className="v">{numero(resultado.resumo.iguais)}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Descartadas</span>
              <span className="v warn">{numero(resultado.resumo.descartadas)}</span>
            </div>
          </div>

          {resultado.campos.length > 0 && (
            <div>
              <span className="label-mono">Como os campos foram lidos</span>
              <div className="mapear">
                {resultado.campos.slice(0, 3).map((de, i) => (
                  <span key={de}>
                    <code>{de}</code>
                    <ArrowRight aria-hidden />
                    <b>{['palavra', 'tradução', 'frase'][i]}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Amostra real: a pessoa confere se os lados não vieram trocados. */}
          {resultado.amostra.length > 0 && (
            <div>
              <span className="label-mono">Amostra</span>
              <ul className="amostra">
                {resultado.amostra.map((n, i) => (
                  <li key={i}>
                    <b>{n.frente}</b> = <span className="mut">{n.verso}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultado.resumo.descartadas > 0 && (
            <details className="det">
              <summary>
                Por que {resultado.resumo.descartadas} {resultado.resumo.descartadas === 1 ? 'ficou' : 'ficaram'} de
                fora
              </summary>
              <ul className="mut" style={{ fontSize: 13, marginTop: 8, paddingLeft: 18 }}>
                {Object.entries(resultado.resumo.porMotivo).map(([motivo, n]) => (
                  <li key={motivo}>
                    {n} {t(ROTULO_MOTIVO[motivo as MotivoDescarte]?.titulo ?? motivoLegivel(motivo)).toLowerCase()}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {resultado.truncado && (
            <div className="aviso-info warn">
              <Info aria-hidden />
              <span>
                Este arquivo tem <b>{resultado.totalNoArquivo}</b> notas, mais do que dá para ler de uma vez; só as
                primeiras {resultado.resumo.notas} entraram agora. Importe o mesmo arquivo de novo depois para trazer o
                resto.
              </span>
            </div>
          )}

          {/* Nada para ativar: a régua recusou tudo. Não mostra botão morto — diz o porquê. */}
          {!ativacao && podeAtivar === 0 && (
            <div className="aviso-info warn">
              <AlertTriangle aria-hidden />
              <span>
                Nenhuma nota deste baralho passou pela régua de qualidade — reveja o mapeamento de campos no arquivo
                original e importe de novo.
              </span>
            </div>
          )}

          {erroAtivar && (
            <div className="aviso-info warn" role="alert">
              <AlertTriangle aria-hidden />
              <span>{erroAtivar}</span>
            </div>
          )}

          {ativacao ? (
            <>
              {ativacao.restantes > 0 && (
                <p className="mut" style={{ fontSize: 12.5 }}>
                  Ainda há {ativacao.restantes} guardadas no baralho. Traga mais quando quiser, em Gerenciar.
                </p>
              )}
              <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                {onJogarCom && (
                  <button
                    type="button"
                    className="btn btn-solid"
                    onClick={() => onJogarCom(resultado.deckId, resultado.baralhos[0] || nomeArquivo)}
                  >
                    <Play aria-hidden /> Jogar com este baralho
                  </button>
                )}
                {onGerenciar && (
                  <button type="button" className="btn btn-outline" onClick={onGerenciar}>
                    <Layers aria-hidden /> Ver em Gerenciar
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => inputRef.current?.click()}>
                  Trazer outro arquivo
                </button>
              </div>
            </>
          ) : (
            /* O PONTO DO PRODUTO, dito sem jargão: entrou no acervo, mas ninguém foi para a fila de
               revisão ainda. Sem isto, quem importasse 3.600 notas abriria o app amanhã com 3.600
               cartões vencidos. */
            <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
              {podeAtivar > 0 && (
                <button type="button" className="btn btn-solid" onClick={() => void ativar()} disabled={ativando}>
                  {ativando ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden /> Ativando…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden /> Começar com as primeiras {sugestaoAtivar}
                    </>
                  )}
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => inputRef.current?.click()}>
                Escolher outro arquivo
              </button>
              <span className="mut" style={{ fontSize: 12.5 }}>
                Essas palavras já estão guardadas, mas nenhuma foi para a sua fila de estudo ainda. As outras entram
                quando você quiser, em lotes de {TETO}, para a revisão não virar uma avalanche.
              </span>
            </div>
          )}
        </section>
      )}
    </>
  );

  /* ─── LEVAR EMBORA ─── os dois formatos lado a lado (`.g2`), como no protótipo: o `.apkg` é o
     mais confortável, o texto é o que nunca falha. Em nenhum vai o histórico de revisão. */
  const levar = (
    <>
      <div className="g2">
        <section className="cartao p6 pilha">
          <IconeEmBloco icone={Layers} />
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>Baralho do Anki (.apkg)</h3>
          <p className="mut" style={{ fontSize: 13 }}>
            Abre direto no Anki, no AnkiDroid e no AnkiMobile. Frente: palavra; verso: tradução e frase.
          </p>
          <label className="rot" htmlFor="anki-nome">
            Nome do baralho
          </label>
          <input className="campo" id="anki-nome" value={nomeExp} onChange={(e) => setNomeExp(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={incluirFrase} onChange={(e) => setIncluirFrase(e.target.checked)} /> Incluir
            a frase de exemplo
          </label>
          <button
            type="button"
            className="btn btn-solid"
            onClick={() => void exportarBaralho()}
            disabled={gerando || !exportaveis.length}
          >
            {gerando ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Montando…
              </>
            ) : (
              <>
                <Download aria-hidden /> Baixar {nomeApkg}
              </>
            )}
          </button>
        </section>
        <section className="cartao p6 pilha">
          <IconeEmBloco icone={FileText} />
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>Texto separado por tabulação (.txt)</h3>
          <p className="mut" style={{ fontSize: 13 }}>
            Para o Quizlet, uma planilha ou o importador de texto do Anki. Colunas: palavra, tradução, frase.
          </p>
          <pre className="previa-txt" aria-label="Prévia do arquivo">
            {previaTxt}
          </pre>
          <button type="button" className="btn btn-outline" onClick={exportar} disabled={!exportaveis.length}>
            <Download aria-hidden /> Baixar .txt
          </button>
        </section>
      </div>
      <p className="mut" style={{ fontSize: 12.5, marginTop: 12 }}>
        <Info style={{ width: 13, height: 13, verticalAlign: -2, display: 'inline' }} aria-hidden /> Vão só as palavras
        que têm tradução ({exportaveis.length} agora). O histórico de revisão não vai junto.
      </p>
    </>
  );

  const abas: ItemDeAba[] = [
    { id: 'trazer', rotulo: 'Trazer', icone: <Upload aria-hidden /> },
    { id: 'levar', rotulo: 'Levar embora', icone: <Download aria-hidden /> },
    ...(onGerenciar
      ? [{ id: 'baralhos', rotulo: 'Gerenciar', icone: <Layers aria-hidden />, contagem: nBaralhos }]
      : []),
  ];

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: rotuloVoltar, aoClicar: onVoltar }}
        sobrancelha="Baralhos"
        icone={Layers}
        titulo={ageProfile === 'kids' ? 'Trazer palavras de fora' : 'Baralhos do Anki'}
        sub="Traga o que você já estuda no Anki, leve o seu caderno embora, e escolha o que entra nos jogos."
        abas={
          <Abas
            itens={abas}
            ativo={aba}
            rotuloDoGrupo="Baralhos do Anki"
            aoTrocar={(id) => {
              // "Gerenciar" é a tela de baralhos que já existe (`BaralhosAnki`): a aba leva até ela.
              if (id === 'baralhos') onGerenciar?.();
              else setAba(id as 'trazer' | 'levar');
            }}
          />
        }
      />
      <PainelDeAba id="trazer" ativo={aba}>
        {trazer}
      </PainelDeAba>
      <PainelDeAba id="levar" ativo={aba}>
        {levar}
      </PainelDeAba>
    </Tela>
  );
}
