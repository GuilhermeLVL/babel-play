import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { abrirContextoDoClique } from '../../../../lib/captura/contextoDoClique';
import type { LadoDoInterprete } from '../../../../lib/captura/tiposDaFala';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import {
  aoMudarEstadoDaTela,
  estadoDaTela,
  mudarEstadoDaTela,
  pedirConversa,
  tremer,
} from '../../../../lib/polimento/interprete';
import {
  aoMudarIdiomasDaVozDoQuest,
  atualizarIdiomasDaVozDoQuest,
  idiomasDaVozDoQuest,
  vozDoQuestFala,
} from '../../../../lib/voz/vozDoQuest';
import ConversaDoPrototipo, { type MetadeDaConversa } from './ConversaDoPrototipo';
import FolhaDaConversaVirtual from './FolhaDaConversaVirtual';
import { guardarModo, type ModoDaConversa, modoGuardado } from './modoDaConversa';
import type { AutomaticoNoPlano } from './ModoInterprete';

interface PropsDaPagina {
  idiomas: { meu: string; outro: string };
  /** Dois idiomas diferentes: sem isso não há conversa a traduzir. */
  possivel: boolean;
  /**
   * Há uma sessão aberta na captura (gravando, ou com o Encerrar na tela): a folha da conversa virtual
   * pedida de dentro de uma conversa só abre depois de ela encerrar.
   */
  sessaoAberta?: boolean;
  /** O preparo dos dois lados (o tradutor do outro sentido baixando), uma linha. */
  aviso: string | null;
  /** O modo automático nesta conta: o padrão de quem o tem; com cadeado para quem não tem. */
  automatico?: AutomaticoNoPlano;
  /** O aparelho não tem voz de leitura: a tradução é só em texto, e a tela não promete voz. */
  semVoz?: boolean;
  /** A voz do site está ligada: no aparelho sem voz, ela lê a tradução nos idiomas que tem. */
  vozDoSite?: boolean;
  /** Abre os Planos (ausente no perfil protegido: nada de oferta). */
  aoConhecerOPremium?: (() => void) | undefined;
  aoComecar: () => void;
  /**
   * A CONVERSA VIRTUAL (Intérprete v3): traduz o áudio do computador (vídeo, Discord, jogo, chamada) e o
   * microfone, sem tocar em lado. Ausente = a opção não aparece (chave desligada, ou aparelho sem áudio do
   * computador). A folha que o botão "Virtual" abre pede o aceite e, opcionalmente, o microfone (de fone).
   */
  aoComecarVirtual?: (opcoes: { comMicrofone: boolean }) => void;
  aoEscolherIdiomas: () => void;
  /** O X da conversa volta para a tela de onde a pessoa veio (`direto.js:94`). */
  aoVoltar?: (() => void) | undefined;
}

/** O tempo de a captura encerrar uma sessão vazia antes de a tela seguir para a origem ou os Planos. */
const ESPERA_DA_VOLTA = 400;

const outroLado = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

/**
 * O INTÉRPRETE ABRE DIRETO NA CONVERSA (`direto.js:8-14`), em todo aparelho. Esta é A CONVERSA PRONTA:
 * a mesma tela da conversa em curso (`ConversaDoPrototipo`), parada. Nada é aberto ao chegar: o primeiro
 * toque em "Falar" começa a sessão (a folha do início, o teto, o microfone são os de sempre) e a conversa
 * em curso, que monta por cima, já começa ouvindo aquele lado.
 *
 * "Virtual" não sai daqui: abre a folha da conversa virtual (`FolhaDaConversaVirtual`) por cima da
 * conversa. A tela de entrada antiga (cartão "Conversa", "Começar conversa", os três passos) não existe mais.
 */
export default function PaginaDoInterprete({
  idiomas,
  possivel,
  sessaoAberta = false,
  aviso,
  automatico = 'oculto',
  semVoz = false,
  vozDoSite = false,
  aoConhecerOPremium,
  aoComecar,
  aoComecarVirtual,
  aoEscolherIdiomas,
  aoVoltar,
}: PropsDaPagina) {
  const tela = useSyncExternalStore(aoMudarEstadoDaTela, estadoDaTela, estadoDaTela);
  /* Sair da tela esquece os lados trocados e a folha pedida: a próxima visita começa do desenho. */
  useEffect(() => () => mudarEstadoDaTela({ trocados: false, folhaVirtual: false, depois: null }), []);
  /* O X (ou "Conhecer o Premium") de uma conversa em que ninguém falou: a sessão encerra e a tela
     segue para onde foi pedido. A captura segura a navegação enquanto ainda fecha o microfone; o
     intervalo deixa isso terminar. */
  const saidas = useRef({ voltar: aoVoltar, planos: aoConhecerOPremium });
  saidas.current = { voltar: aoVoltar, planos: aoConhecerOPremium };
  const comVirtual = !!aoComecarVirtual;
  useEffect(() => {
    const destino = tela.depois;
    if (tela.emCurso || !destino) return;
    /* "Virtual" tocado de dentro de uma conversa: ela encerra primeiro (com falas, o Encerrar decide
       entre salvar e descartar) e só então a folha abre. "Continuar gravando" devolve a conversa, que
       esquece o pedido ao voltar (`ModoInterprete`). */
    if (destino === 'virtual') {
      if (!sessaoAberta) mudarEstadoDaTela({ depois: null, folhaVirtual: comVirtual });
      return;
    }
    const relogio = setTimeout(() => {
      mudarEstadoDaTela({ depois: null });
      saidas.current[destino]?.();
    }, ESPERA_DA_VOLTA);
    return () => clearTimeout(relogio);
  }, [tela.emCurso, tela.depois, sessaoAberta, comVirtual]);
  const comVozDoSite = semVoz && vozDoSite;
  useSyncExternalStore(
    aoMudarIdiomasDaVozDoQuest,
    () => idiomasDaVozDoQuest().join(),
    () => '',
  );
  useEffect(() => {
    if (comVozDoSite) void atualizarIdiomasDaVozDoQuest();
  }, [comVozDoSite]);
  const mudo = (idioma: string) => semVoz && !(comVozDoSite && vozDoQuestFala(idioma));

  const [lista, setLista] = useState(false);
  const [cadeado, setCadeado] = useState(false);
  const [modo, setModo] = useState<ModoDaConversa>(() =>
    automatico === 'disponivel' ? (modoGuardado() ?? 'automatico') : 'toque',
  );
  useEffect(() => {
    if (automatico !== 'disponivel') setModo('toque');
  }, [automatico]);
  const noAutomatico = modo === 'automatico';

  const idiomaDe = (dono: LadoDoInterprete) => (dono === 'meu' ? idiomas.meu : idiomas.outro);
  const mudos = (['meu', 'outro'] as const).filter((l) => mudo(idiomaDe(l)));
  const rotuloDaVoz =
    mudos.length === 2
      ? t('Tradução em texto neste aparelho')
      : mudos.length === 1
        ? t('Voz em {comVoz} · {semVoz} em texto', {
            comVoz: langLabel(idiomaDe(outroLado(mudos[0]))),
            semVoz: langLabel(idiomaDe(mudos[0])),
          })
        : comVozDoSite
          ? t('Voz do site')
          : t('Voz do aparelho');

  const metade = (lado: LadoDoInterprete): MetadeDaConversa => {
    const dono = tela.trocados ? outroLado(lado) : lado;
    const lang = idiomaDe(dono);
    const nome = langLabel(lang);
    const semVozParaOOutro = mudo(idiomaDe(outroLado(dono)));
    return {
      lado,
      dono,
      lang,
      nome,
      frase: {
        tipo: 'dica',
        texto: semVozParaOOutro
          ? noAutomatico
            ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e mostra a tradução.')
            : t('Toque em Falar e fale. A tradução aparece do outro lado, em texto.')
          : noAutomatico
            ? t('Toque em Ouvir e conversem. O app reconhece quem fala qual idioma e lê a tradução em voz alta.')
            : t('Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.'),
      },
      status: '',
      rotulo: noAutomatico ? t('Ouvir') : t('Falar'),
      rotuloParaLeitor: noAutomatico ? t('Ouvir a conversa') : t('Falar em {idioma}', { idioma: nome }),
      ouvindo: false,
      aoFalar: () => {
        /* Dentro do toque, antes de qualquer espera: no iPhone, o áudio criado depois fica mudo. */
        abrirContextoDoClique();
        pedirConversa(noAutomatico ? 'ouvir' : lado);
        aoComecar();
      },
      semVoz: mudo(lang),
    };
  };
  const avisoDoCadeado = cadeado && automatico === 'premium';

  return (
    <>
      <div style={{ display: tela.emCurso ? 'none' : 'contents' }} data-testid="pagina-do-interprete">
        <ConversaDoPrototipo
          cima={metade('outro')}
          baixo={metade('meu')}
          {...(automatico !== 'oculto'
            ? {
                automatico: {
                  ligado: noAutomatico,
                  comCadeado: automatico === 'premium',
                  aoTocar: (botao: HTMLElement) => {
                    if (automatico !== 'disponivel') {
                      setCadeado(true);
                      tremer(botao);
                      return;
                    }
                    const novoModo: ModoDaConversa = noAutomatico ? 'toque' : 'automatico';
                    setModo(novoModo);
                    guardarModo(novoModo);
                  },
                },
              }
            : {})}
          lista={{ aberta: lista, bolhas: [], aoAlternar: () => setLista((v) => !v), aoExportar: () => undefined }}
          voz={{ rotulo: rotuloDaVoz, natural: false, muda: mudos.length === 2 }}
          aviso={
            !possivel
              ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
              : (aviso ??
                (avisoDoCadeado
                  ? t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.')
                  : noAutomatico
                    ? t('Automático ligado: é só conversar. O app reconhece quem fala qual idioma.')
                    : ''))
          }
          aoConhecerOPremium={avisoDoCadeado && possivel && !aviso ? aoConhecerOPremium : undefined}
          aoTrocarLados={() => mudarEstadoDaTela({ trocados: !tela.trocados })}
          aoVirtual={aoComecarVirtual ? () => mudarEstadoDaTela({ folhaVirtual: true }) : undefined}
          aoEscolherIdioma={aoEscolherIdiomas}
          aoSair={() => aoVoltar?.()}
          comEntrada
          testid="conversa-pronta"
        />
      </div>
      {/* Fora da caixa que some com a conversa em curso: a folha abre por cima de qualquer das duas. */}
      {tela.folhaVirtual && aoComecarVirtual && (
        <FolhaDaConversaVirtual
          aoComecar={aoComecarVirtual}
          aoFechar={() => mudarEstadoDaTela({ folhaVirtual: false })}
        />
      )}
    </>
  );
}
