/**
 * "LEGENDA SEM BAIXAR NADA: ESCOLHA O IDIOMA DO VÍDEO" — nativo primeiro no desktop fraco (plano
 * "Grátis sem travar", A9a).
 *
 * POR QUE EXISTE. No Chrome/Edge do computador com o pacote do idioma, o próprio navegador transcreve
 * o áudio da aba NO aparelho (`webSpeechDoSistema.ts`: Web Speech com `processLocally` sobre a
 * trilha) — zero bytes de Whisper e quase nada da nossa CPU, o melhor caminho para o computador que
 * trava com o Whisper no WASM. Mas a Web Speech precisa de UM idioma, e a detecção automática vem
 * ligada de fábrica (`autoDetectLang`): quem não mexia caía no Whisper local, centenas de MB e a CPU
 * no talo. A oferta diz isso antes de começar e escolhe o idioma num toque.
 *
 * SÓ OFERECE O QUE VAI ACONTECER. A condição final é a MESMA decisão que a captura toma no clique
 * (`decidirMotorDoSistema({ multiIdioma: false })`, perguntada ao navegador com o idioma do vídeo):
 * reconhecimento local no navegador, o pacote do idioma no aparelho ('available'), nenhum teste em
 * execução que já falhou aqui, nenhum modelo escolhido à mão e a rota fora da nuvem — quem paga vai
 * à nuvem, e lá a reserva local baixaria, então "sem baixar nada" seria mentira.
 *
 * QUEM VÊ. O desktop fraco (`desktopFraco`), com SÓ o som do computador (cenário `media`): na conversa
 * o microfone também decide o motor, e o idioma do vídeo sozinho não garante nada. Celular e Quest
 * nunca — não têm o áudio do sistema, e o bipe da Web Speech no Android continua mandando o celular
 * ao Whisper (`webSpeechBipaAoReligar`).
 */
import { useEffect, useRef, useState } from 'react';

import { smallComGpuProvada, type SttQuality } from '../../gateway/sttRouter';
import { dispositivoDaRota, type PerfilDoDispositivo } from '../dispositivo/perfil';
import type { SondaDoAparelho } from '../dispositivo/sonda';
import type { DecisaoDoMotorDoSistema } from './webSpeechDoSistema';

/**
 * O computador em que o Whisper pesa: sem a GPU PROVADA pela sonda (`smallComGpuProvada` — adaptador
 * real, sem queda, benchmark com folga), a rota fica no Whisper base no WASM, que disputa a CPU com
 * tudo. O desktop do modo leve automático (`perfil.leve`: sem GPU e ≤ 2 núcleos ou ≤ 2 GB) é sempre
 * sem GPU, então já está aqui. Sem sonda guardada conta como fraco — é também o que a rota faz
 * (o base, até a sonda provar a GPU). Pura.
 */
export function desktopFraco(perfil: PerfilDoDispositivo, sonda: SondaDoAparelho | null, temGpu: boolean): boolean {
  return perfil.tipo.startsWith('desktop') && !smallComGpuProvada(dispositivoDaRota(perfil, sonda), temGpu);
}

export interface EntradaDaOfertaSemBaixar {
  desktopFraco: boolean;
  /** Só o som do computador (cenário `media` com o sistema ligado): o idioma do VÍDEO decide o motor. */
  soOSomDoComputador: boolean;
  /** A detecção automática do idioma do conteúdo está ligada. */
  detectarIdioma: boolean;
  gravando: boolean;
  /** A pessoa fechou a oferta nesta tela. */
  dispensada: boolean;
  /** A decisão do motor do sistema COM o idioma escolhido; `null` = ainda não respondeu. */
  comIdiomaEscolhido: DecisaoDoMotorDoSistema | null;
}

/** As condições que a tela já sabe, sem perguntar nada ao navegador (o `ativo` do hook). */
export function podePerguntarLegendaSemBaixar(e: Omit<EntradaDaOfertaSemBaixar, 'comIdiomaEscolhido'>): boolean {
  return e.desktopFraco && e.soOSomDoComputador && e.detectarIdioma && !e.gravando && !e.dispensada;
}

export function oferecerLegendaSemBaixar(e: EntradaDaOfertaSemBaixar): boolean {
  return podePerguntarLegendaSemBaixar(e) && e.comIdiomaEscolhido?.motor === 'web-speech-local';
}

/**
 * A decisão do motor do sistema com o idioma do vídeo escolhido, perguntada só quando a oferta pode
 * aparecer (`ativo`) e de novo quando o idioma ou a qualidade mudam — ou quando a gravação acaba (o
 * `ativo` volta: o teste em execução pode ter gravado 'falhou'). Enquanto a resposta não chega, e se
 * ela falhar, `null`: nenhuma oferta velha para o idioma novo. Nunca lança.
 */
export function useMotorComIdiomaEscolhido(o: {
  ativo: boolean;
  idioma: string;
  qualidade: SttQuality;
  decidir: () => Promise<DecisaoDoMotorDoSistema>;
}): DecisaoDoMotorDoSistema | null {
  const [decisao, setDecisao] = useState<DecisaoDoMotorDoSistema | null>(null);
  const decidirRef = useRef(o.decidir);
  decidirRef.current = o.decidir;
  useEffect(() => {
    setDecisao(null);
    if (!o.ativo) return;
    let vivo = true;
    void decidirRef
      .current()
      .then((d) => {
        if (vivo) setDecisao(d);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [o.ativo, o.idioma, o.qualidade]);
  return decisao;
}
