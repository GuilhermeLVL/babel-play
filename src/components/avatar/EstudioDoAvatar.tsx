import '../../styles/avatar.css';
import '../../styles/avatar-estudio.css';

import {
  ArrowDown,
  ArrowUp,
  Check,
  Crown,
  Download,
  Glasses,
  Lock,
  RotateCcw,
  Sparkles,
  Undo2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { aplicar, desfazer, type Historico, iniciarHistorico, receitasIguais } from '../../core/avatar/edicao';
import { corDaPeca, desligarPeca, ligarPeca, limparPecas, moverPeca } from '../../core/avatar/estudio';
import {
  type CategoriaDaPeca,
  CATEGORIAS_DA_PECA,
  CORES_DE_PECA,
  ehPecaDeAcessibilidade,
  PECAS,
  pecasParaOTier,
  TOKEN_DE_COR_PADRAO,
} from '../../core/avatar/pecas';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { baixarReceita, lerArquivoDeReceita } from '../../lib/avatar/estudio';
import type { RelatorioDePecas } from '../../lib/avatar/pecas3d';
import { t } from '../../lib/i18n';
import { CATALOGO_DA_LOJA, estadoPorAlvo } from '../../lib/loja';
import AvatarCanvas from './AvatarCanvas';
import { fraseDaNegativa, frasesDeAviso, frasesDeErroDeImportacao } from './estudio/mensagens';
import { nomeDaPeca, NOMES_DAS_CATEGORIAS } from './estudio/nomesDasPecas';
import { nomeDaCor } from './meuAvatar/nomesDeCor';

export interface EstudioDoAvatarProps {
  /** A receita atual. O Estúdio edita uma cópia e devolve cada mudança por `aoMudar` (a pessoa grava no "Salvar"). */
  receita: ReceitaDeAvatar;
  aoMudar: (receita: ReceitaDeAvatar) => void;
  tier: TierDoAvatar;
  /** Substitui a fonte do modelo (coleção de teste e harness). */
  fonte?: string | Blob;
  usuarioId?: string | null;
  /** Lado da prévia viva, em pixels. */
  tamanho?: number;
  /** Nível e saldo de Seeds da conta, para a régua da loja (`estadoPorAlvo`). */
  nivel?: number;
  saldoSeeds?: number;
  /** Recebe a miniatura de 192 px (data URL) quando a pessoa pede; o M2 grava com `salvarMeuAvatar({ miniatura })`. */
  aoMiniatura?: (dataUrl: string) => void;
  /** Entrega a função que captura a miniatura da prévia do Estúdio (quando a prévia da tela está escondida). */
  aoCapturar?: (capturar: (() => string | null) | null) => void;
  /** Para teste e diagnóstico: o que foi montado e o que o tier cortou. */
  aoPecas?: (r: RelatorioDePecas) => void;
}

const ICONE: Record<CategoriaDaPeca, typeof Glasses> = { acessorio: Glasses, cabeca: Crown, adereco: Sparkles };

type Mensagem = { tom: 'ok' | 'erro' | 'aviso'; linhas: string[] } | null;

/**
 * O ESTÚDIO DO AVATAR (criador): peças do catálogo com prévia viva, ligar/desligar, ordem, cor de cada peça pela
 * paleta, exportar/importar a receita (`.json` local), miniatura de 192 px e Desfazer/Restaurar.
 *
 * Acessibilidade primeiro: tudo é botão nativo (teclado e leitor de tela), o estado nunca depende só de cor (o
 * escolhido leva borda grossa, visto e a palavra "Em uso"), mensagens em `role="status"`, sem animação com movimento
 * reduzido. Aparelho auditivo, implante coclear e óculos são livres para sempre (representação não é recompensa).
 * Peça da loja sem posse aparece trancada, com o preço em Seeds; a posse vem da régua da loja (`estadoPorAlvo`).
 */
export default function EstudioDoAvatar({
  receita,
  aoMudar,
  tier,
  fonte,
  usuarioId,
  tamanho = 280,
  nivel = 1,
  saldoSeeds = 0,
  aoMiniatura,
  aoCapturar,
  aoPecas,
}: EstudioDoAvatarProps) {
  const [hist, setHist] = useState<Historico>(() => iniciarHistorico(receita));
  const [msg, setMsg] = useState<Mensagem>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDePecas | null>(null);
  const capturar = useRef<(() => string | null) | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const atual = hist.atual;

  // Mudança vinda de fora (troca de modelo no M2): recomeça o histórico.
  useEffect(() => {
    setHist((h) => (receitasIguais(h.atual, receita) ? h : iniciarHistorico(receita)));
  }, [receita]);

  const mudar = useCallback(
    (proxima: ReceitaDeAvatar) => {
      setHist((h) => aplicar(h, proxima));
      aoMudar(proxima);
    },
    [aoMudar],
  );

  const liberada = useCallback(
    (id: string) => estadoPorAlvo('avatar', id, nivel, saldoSeeds).estado !== 'bloqueado',
    [nivel, saldoSeeds],
  );

  const alternar = (id: string) => {
    if (atual.pecas.includes(id)) {
      mudar(desligarPeca(atual, id));
      setMsg({ tom: 'ok', linhas: [t('{peca} saiu do avatar.', { peca: nomeDaPeca(id) })] });
      return;
    }
    const r = ligarPeca(atual, id, liberada);
    if (r.negado) {
      setMsg({ tom: 'aviso', linhas: [fraseDaNegativa(r.negado.motivo, id)] });
      return;
    }
    const saiu = atual.pecas.filter((p) => !r.receita.pecas.includes(p));
    mudar(r.receita);
    setMsg({
      tom: 'ok',
      linhas: [
        t('{peca} entrou no avatar.', { peca: nomeDaPeca(id) }),
        ...(saiu.length ? [t('Saiu para dar lugar: {pecas}.', { pecas: saiu.map(nomeDaPeca).join(', ') })] : []),
      ],
    });
  };

  const aoDesfazer = () => {
    const h = desfazer(hist);
    setHist(h);
    aoMudar(h.atual);
    setMsg({ tom: 'ok', linhas: [t('Desfeito.')] });
  };

  const restaurar = () => {
    mudar(limparPecas(atual));
    setMsg({ tom: 'ok', linhas: [t('Todas as peças foram tiradas.')] });
  };

  const exportar = () => {
    try {
      baixarReceita(atual);
      setMsg({
        tom: 'ok',
        linhas: [t('Receita salva no seu aparelho como arquivo .json. Ela não vai para a internet.')],
      });
    } catch {
      setMsg({ tom: 'erro', linhas: [t('Não deu para salvar a receita.')] });
    }
  };

  const importar = async (arq: File | undefined) => {
    if (!arq) return;
    const r = await lerArquivoDeReceita(arq);
    if (arquivo.current) arquivo.current.value = '';
    if ('erros' in r) {
      setMsg({ tom: 'erro', linhas: [t('Esta receita não foi aberta.'), ...frasesDeErroDeImportacao(r.erros)] });
      return;
    }
    // Item da loja que a pessoa ainda não tem não entra por arquivo.
    const bloqueadas = r.receita.pecas.filter((id) => !liberada(id));
    let recebida = r.receita;
    for (const id of bloqueadas) recebida = desligarPeca(recebida, id);
    mudar(recebida);
    const avisos = frasesDeAviso(r.avisos);
    if (bloqueadas.length)
      avisos.push(
        t('Itens da loja que você ainda não tem ficaram de fora: {pecas}.', {
          pecas: bloqueadas.map(nomeDaPeca).join(', '),
        }),
      );
    setMsg({ tom: avisos.length ? 'aviso' : 'ok', linhas: [t('Receita aberta.'), ...avisos] });
  };

  const tirarMiniatura = () => {
    const url = capturar.current?.() ?? null;
    if (!url) {
      setMsg({ tom: 'aviso', linhas: [t('A prévia ainda está carregando. Tente de novo em instantes.')] });
      return;
    }
    setMiniatura(url);
    aoMiniatura?.(url);
    setMsg({ tom: 'ok', linhas: [t('Miniatura atualizada.')] });
  };

  const porCategoria = useMemo(
    () => CATEGORIAS_DA_PECA.map((c) => ({ categoria: c, pecas: PECAS.filter((p) => p.categoria === c) })),
    [],
  );
  const precoDaLoja = (id: string) => CATALOGO_DA_LOJA.find((i) => i.tipo === 'avatar' && i.alvo === id)?.precoSeeds;
  const { cortadas } = useMemo(() => pecasParaOTier(atual.pecas, tier), [atual.pecas, tier]);

  const pecasDaCena = useMemo(
    () => ({ ids: atual.pecas.filter(liberada), cores: atual.coresDasPecas }),
    [atual.pecas, atual.coresDasPecas, liberada],
  );

  return (
    <section className="es-estudio" aria-labelledby="es-titulo" data-testid="estudio-do-avatar">
      <header>
        <h3 id="es-titulo">{t('Estúdio do avatar')}</h3>
        <p>{t('Escolha peças, mude a cor de cada uma e guarde a receita num arquivo seu.')}</p>
      </header>

      <div className="es-duas">
        <div className="es-previa">
          <div className="es-moldura">
            <AvatarCanvas
              receita={atual}
              estado="parado"
              emocao="neutro"
              tier={tier}
              tamanho={tamanho}
              fonte={fonte}
              usuarioId={usuarioId}
              pecas={pecasDaCena}
              aoPecas={(r) => {
                setRelatorio(r);
                aoPecas?.(r);
              }}
              aoPronto={(c) => {
                capturar.current = c;
                aoCapturar?.(c);
              }}
            />
          </div>
          <div className="es-miniatura">
            <button type="button" className="q-ctl" onClick={tirarMiniatura} data-testid="estudio-miniatura-botao">
              {t('Atualizar miniatura')}
            </button>
            {miniatura && (
              <img
                src={miniatura}
                width={96}
                height={96}
                alt={t('Miniatura do avatar, 192 por 192 pixels')}
                data-testid="estudio-miniatura"
              />
            )}
          </div>
          {tier === 'fraco' && (
            <p className="es-nota" data-testid="estudio-tier-fraco">
              {t(
                'Neste aparelho só aparecem as peças de ajuda (óculos, aparelho auditivo e implante coclear). Suas outras peças continuam salvas.',
              )}
            </p>
          )}
          {relatorio?.omitidas.some((o) => o.motivo === 'sem_osso' || o.motivo === 'sem_vrm') && (
            <p className="es-nota" data-testid="estudio-sem-osso">
              {t('Este modelo não tem onde prender algumas peças.')}
            </p>
          )}
        </div>

        <div className="es-controles">
          {porCategoria.map(({ categoria, pecas }) => {
            const Icone = ICONE[categoria];
            return (
              <div key={categoria} className="es-grupo">
                <h4>
                  <Icone aria-hidden /> {NOMES_DAS_CATEGORIAS[categoria]()}
                </h4>
                <ul className="es-grade">
                  {pecas.map((p) => {
                    const ligada = atual.pecas.includes(p.id);
                    const trancada = !liberada(p.id);
                    const preco = precoDaLoja(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="es-peca"
                          aria-pressed={ligada}
                          aria-disabled={trancada || undefined}
                          data-peca={p.id}
                          onClick={() => alternar(p.id)}
                        >
                          <span className="es-peca-nome">{nomeDaPeca(p.id)}</span>
                          {ligada && (
                            <span className="es-marca">
                              <Check aria-hidden /> {t('Em uso')}
                            </span>
                          )}
                          {trancada && (
                            <span className="es-trava">
                              <Lock aria-hidden /> {t('Na loja: {preco} Seeds', { preco: preco ?? 0 })}
                            </span>
                          )}
                          {ehPecaDeAcessibilidade(p.id) && !ligada && !trancada && (
                            <span className="es-livre">{t('Sempre livre')}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="es-grupo">
            <h4 id="es-ordem">{t('Em uso, por prioridade')}</h4>
            <p className="es-nota">{t('Em aparelhos mais simples, as peças do topo da lista aparecem primeiro.')}</p>
            {atual.pecas.length === 0 ? (
              <p className="es-nota" data-testid="estudio-vazio">
                {t('Nenhuma peça no momento.')}
              </p>
            ) : (
              <ol className="es-lista" aria-labelledby="es-ordem">
                {atual.pecas.map((id, i) => {
                  const cor = atual.coresDasPecas?.[id] ?? TOKEN_DE_COR_PADRAO;
                  const fora = cortadas.some((c) => c.id === id);
                  return (
                    <li key={id} className="es-item" data-em-uso={id}>
                      <div className="es-item-topo">
                        <span className="es-item-nome">
                          {nomeDaPeca(id)}
                          {fora && <small> {t('(não aparece neste aparelho)')}</small>}
                        </span>
                        <span className="es-ordem">
                          <button
                            type="button"
                            className="q-ctl"
                            disabled={i === 0}
                            aria-label={t('Subir {peca} na lista', { peca: nomeDaPeca(id) })}
                            onClick={() => mudar(moverPeca(atual, id, -1))}
                          >
                            <ArrowUp aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="q-ctl"
                            disabled={i === atual.pecas.length - 1}
                            aria-label={t('Descer {peca} na lista', { peca: nomeDaPeca(id) })}
                            onClick={() => mudar(moverPeca(atual, id, 1))}
                          >
                            <ArrowDown aria-hidden />
                          </button>
                        </span>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label={t('Cor de {peca}', { peca: nomeDaPeca(id) })}
                        className="av-paleta"
                      >
                        {CORES_DE_PECA.map((c) => {
                          const nome = c.id === TOKEN_DE_COR_PADRAO ? t('Cor de fábrica') : nomeDaCor('cabelo', c.id);
                          const escolhida = cor === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              role="radio"
                              aria-checked={escolhida}
                              aria-label={nome}
                              title={nome}
                              data-cor-da-peca={`${id}:${c.id}`}
                              className={`av-cor${c.hex ? '' : ' av-original'}`}
                              style={c.hex ? ({ '--av-cor': c.hex } as React.CSSProperties) : undefined}
                              onClick={() => mudar(corDaPeca(atual, id, c.id))}
                            >
                              {escolhida && <Check aria-hidden />}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="es-acoes">
            <button type="button" className="q-ctl" disabled={hist.passado.length === 0} onClick={aoDesfazer}>
              <Undo2 aria-hidden /> {t('Desfazer')}
            </button>
            <button type="button" className="q-ctl" disabled={atual.pecas.length === 0} onClick={restaurar}>
              <RotateCcw aria-hidden /> {t('Restaurar')}
            </button>
            <button type="button" className="q-ctl" onClick={exportar} data-testid="estudio-exportar">
              <Download aria-hidden /> {t('Exportar receita (.json)')}
            </button>
            <button
              type="button"
              className="q-ctl"
              onClick={() => arquivo.current?.click()}
              data-testid="estudio-importar"
            >
              <Upload aria-hidden /> {t('Importar receita')}
            </button>
            <input
              ref={arquivo}
              type="file"
              accept=".json,application/json"
              hidden
              data-testid="estudio-arquivo"
              aria-label={t('Escolher arquivo de receita')}
              onChange={(e) => void importar(e.target.files?.[0])}
            />
          </div>

          <div
            role="status"
            aria-live="polite"
            className="es-mensagem"
            data-testid="estudio-mensagem"
            data-tom={msg?.tom}
          >
            {msg && (
              <ul>
                {msg.linhas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
