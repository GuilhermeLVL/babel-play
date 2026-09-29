/**
 * A AJUDA DO MICROFONE — o que a tela diz quando o microfone não abre, com o caminho de volta DAQUELE
 * aparelho (relato do dono, 2026-09-28: no celular, nem o microfone nem o "Rápido" funcionavam, e nada
 * dizia por quê).
 *
 * Antes: o `getUserMedia` negado virava um toast de 7 s sem dizer ONDE ficam as permissões no
 * Android e no iPhone; o "Rápido" (Web Speech) nem isso, o erro ia só ao console. Agora a falha é
 * CLASSIFICADA (o nome do DOMException ou o `codigo` do adaptador — nunca o texto) e a tela mostra o
 * título, o texto, os passos do aparelho e as saídas que existem: "Tentar de novo" (um toque é um
 * gesto novo, e o navegador pode perguntar outra vez) e, quando quem falhou foi o "Rápido", "Trocar
 * para Privado" — o microfone pelo nosso modelo, que não depende do serviço de voz do navegador.
 *
 * Puro: a plataforma vem do `userAgent`, e o iPad que se diz Mac é reconhecido pelos pontos de toque.
 */
import { t } from '../i18n';

export type Plataforma = 'android' | 'ios' | 'desktop';

export function plataformaDoNavegador(ua: string, pontosDeToque = 0): Plataforma {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ se apresenta como Mac; só o toque o denuncia.
  if (/Macintosh/i.test(ua) && pontosDeToque > 1) return 'ios';
  return 'desktop';
}

export type FalhaDoMic =
  | 'permissao'
  | 'servico'
  | 'sem-microfone'
  | 'ocupado'
  | 'rede'
  | 'nao-abriu'
  | 'idioma'
  | 'outro';

/** A causa, pelo nome do DOMException (ou o que a captura guardou dele) ou pelo `codigo` da Web Speech. */
export function classificarFalhaDoMic(erro: unknown): FalhaDoMic {
  if (!erro || typeof erro !== 'object') return 'outro';
  const e = erro as { name?: string; nomeDoErro?: string; codigo?: string };
  switch (e.codigo) {
    case 'not-allowed':
      return 'permissao';
    case 'service-not-allowed':
      return 'servico';
    case 'audio-capture':
      return 'ocupado';
    case 'network':
      return 'rede';
    case 'sem-audio':
      return 'nao-abriu';
    case 'language-not-supported':
      return 'idioma';
  }
  switch (e.nomeDoErro ?? e.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permissao';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'sem-microfone';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'ocupado';
    default:
      return 'outro';
  }
}

export interface AjudaDoMic {
  titulo: string;
  texto: string;
  /** Os passos DESTE aparelho, em ordem. Vazio = não há o que ensinar além do texto. */
  passos: string[];
  /** Mostrar "Tentar de novo" (um toque novo pode fazer o navegador perguntar outra vez). */
  tentarDeNovo: boolean;
  /** Mostrar "Trocar para Privado": quem falhou foi o "Rápido" e o nosso modelo não depende dele. */
  trocarParaPrivado: boolean;
}

function passosDaPermissao(p: Plataforma): string[] {
  if (p === 'android')
    return [
      t('Toque no ícone ao lado do endereço (ou no menu de três pontos) e abra Configurações do site.'),
      t('Em Microfone, escolha Permitir.'),
      t('Volte aqui e toque em Tentar de novo.'),
    ];
  if (p === 'ios')
    return [
      t('Toque em aA, na barra de endereços, e abra Configurações do site.'),
      t('Em Microfone, escolha Permitir.'),
      t('Não aparece? Abra Ajustes, depois Apps, Safari, Microfone, e escolha Perguntar ou Permitir.'),
      t('Volte aqui e toque em Tentar de novo.'),
    ];
  return [
    t('Clique no cadeado ao lado do endereço.'),
    t('Em Microfone, escolha Permitir.'),
    t('Clique em Tentar de novo.'),
  ];
}

export function ajudaDoMic(falha: FalhaDoMic, p: Plataforma, o: { motorRapido: boolean }): AjudaDoMic {
  const rapido = o.motorRapido;
  switch (falha) {
    case 'permissao':
      return {
        titulo: t('O microfone está bloqueado'),
        texto: t('O navegador não deu acesso ao microfone. Libere e tente de novo:'),
        passos: passosDaPermissao(p),
        tentarDeNovo: true,
        trocarParaPrivado: false,
      };
    case 'servico':
      return p === 'ios'
        ? {
            titulo: t('O reconhecimento de voz do iPhone está desligado'),
            texto: t('O modo Rápido usa o Ditado do aparelho. Ative-o, ou use o Privado, que não depende dele.'),
            passos: [t('Abra Ajustes, depois Geral, Teclado, e ative Ditado.'), t('Confira também Ajustes, Siri.')],
            tentarDeNovo: true,
            trocarParaPrivado: rapido,
          }
        : {
            titulo: t('O navegador recusou o reconhecimento de voz'),
            texto: t('Este navegador não deixou usar o reconhecimento de voz dele. O Privado não depende dele.'),
            passos: [],
            tentarDeNovo: true,
            trocarParaPrivado: rapido,
          };
    case 'sem-microfone':
      return {
        titulo: t('Nenhum microfone encontrado'),
        texto: t('Conecte um microfone (ou escolha outro em Dispositivos e modelos de IA) e tente de novo.'),
        passos: [],
        tentarDeNovo: true,
        trocarParaPrivado: false,
      };
    case 'ocupado':
      return {
        titulo: t('O microfone está ocupado'),
        texto: t('Outro app pode estar usando o microfone: uma chamada, um gravador ou o assistente de voz.'),
        passos: [t('Feche o outro app ou encerre a chamada.'), t('Volte aqui e toque em Tentar de novo.')],
        tentarDeNovo: true,
        trocarParaPrivado: rapido,
      };
    case 'rede':
      return {
        titulo: t('O modo Rápido precisa de internet'),
        texto: t('O reconhecimento de voz do navegador não alcançou o servidor. Verifique a conexão, ou use o Privado, que funciona sem internet depois do download.'),
        passos: [],
        tentarDeNovo: true,
        trocarParaPrivado: rapido,
      };
    case 'nao-abriu':
      return {
        titulo: t('O reconhecimento do navegador não começou'),
        texto: t('O navegador não abriu o microfone para o reconhecimento de voz dele. O Privado abre o microfone direto.'),
        passos: [],
        tentarDeNovo: true,
        trocarParaPrivado: rapido,
      };
    case 'idioma':
      return {
        titulo: t('O navegador não reconhece este idioma'),
        texto: t('O reconhecimento de voz do navegador não tem o seu idioma. O Privado transcreve com o nosso modelo.'),
        passos: [],
        tentarDeNovo: false,
        trocarParaPrivado: rapido,
      };
    default:
      return {
        titulo: t('Não foi possível abrir o microfone'),
        texto: t('Algo impediu o microfone de abrir. Tente de novo; se continuar, recarregue a página.'),
        passos: [],
        tentarDeNovo: true,
        trocarParaPrivado: rapido,
      };
  }
}
