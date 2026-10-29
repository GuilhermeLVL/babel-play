import { useCallback, useEffect, useRef, useState } from 'react';

import { type ConfigDoElenco, type DistribuicaoDeVozes, montarDistribuicao } from '../../../core/avatar/elenco';
import { FLAG_AVATAR_ELENCO } from '../../../core/planos';
import { useFlag } from '../../../lib/flags';
import {
  type EscolhasDoElenco,
  gravarEscolhasDoElenco,
  lerEscolhasDoElenco,
} from '../../../lib/leitor/preferenciasDoElenco';
import { personagensDoLivro } from '../../../lib/livros/elenco';
import { getVoicePref, pickVoice, type VoiceInfo, voicesFor } from '../../../lib/tts';

export interface ElencoDoLivro {
  /** A flag `avatar_elenco` está ligada para esta pessoa? Desligada, nada do elenco aparece nem age. */
  disponivel: boolean;
  ligado: boolean;
  /** Mostrar o avatar-narrador (escolha da pessoa, padrão sim). */
  avatar: boolean;
  personagens: readonly string[];
  vozes: readonly VoiceInfo[];
  /** Quem lê o quê com as escolhas de agora (`null` sem voz nenhuma no aparelho). */
  distribuicao: DistribuicaoDeVozes | null;
  gostos: Readonly<Record<string, string>>;
  /** A configuração para o Narrador; `null` = voz única. */
  config: () => ConfigDoElenco | null;
  ligar: (v: boolean) => void;
  mostrarAvatar: (v: boolean) => void;
  escolherVoz: (personagem: string, voz: string) => void;
}

/**
 * O ELENCO DE UM LIVRO NO LEITOR: junta a flag, as escolhas guardadas no aparelho, as personagens da ficha e as vozes
 * instaladas. `aoMudar` avisa o Narrador (que refaz o plano e recomeça a frase). Nada é obrigatório: sem a flag, sem
 * ficha ou sem voz, o resultado é voz única.
 */
export function useElencoDoLivro({
  livroId,
  origem,
  idiomaDoLivro,
  aoMudar,
}: {
  livroId: string;
  origem: string | undefined;
  idiomaDoLivro: string;
  aoMudar: () => void;
}): ElencoDoLivro {
  const disponivel = useFlag(FLAG_AVATAR_ELENCO);
  const [escolhas, setEscolhas] = useState<EscolhasDoElenco>(() => lerEscolhasDoElenco(livroId));
  const [personagens, setPersonagens] = useState<readonly string[]>([]);

  useEffect(() => {
    setEscolhas(lerEscolhasDoElenco(livroId));
  }, [livroId]);

  useEffect(() => {
    if (!disponivel) {
      setPersonagens([]);
      return;
    }
    let vivo = true;
    void personagensDoLivro(livroId, origem).then((p) => vivo && setPersonagens(p));
    return () => {
      vivo = false;
    };
  }, [disponivel, livroId, origem]);

  /* A lista de vozes do navegador chega depois; ler a cada render é barato e sempre atual. */
  const vozes: readonly VoiceInfo[] = disponivel && idiomaDoLivro ? voicesFor(idiomaDoLivro) : [];

  const montar = useCallback(
    (e: EscolhasDoElenco, v: readonly VoiceInfo[], p: readonly string[]): ConfigDoElenco | null => {
      if (!disponivel || !e.ligado || !v.length) return null;
      const principal = getVoicePref(idiomaDoLivro) ?? pickVoice(idiomaDoLivro)?.name;
      return {
        idioma: idiomaDoLivro,
        personagens: p,
        vozes: v.map((x) => ({ id: x.name, idioma: x.lang })),
        ...(principal ? { vozPrincipal: principal } : {}),
        gostos: e.gostos,
      };
    },
    [disponivel, idiomaDoLivro],
  );

  /* O Narrador lê a configuração no momento de planejar: um ref evita recriá-lo a cada escolha. */
  const ref = useRef({ escolhas, personagens, vozes, montar });
  ref.current = { escolhas, personagens, vozes, montar };
  const config = useCallback(() => {
    const r = ref.current;
    return r.montar(r.escolhas, voicesFor(idiomaDoLivro), r.personagens);
  }, [idiomaDoLivro]);

  const cfgDeAmostra = montar({ ...escolhas, ligado: true }, vozes, personagens);
  const distribuicao = cfgDeAmostra ? montarDistribuicao(cfgDeAmostra) : null;

  const guardar = useCallback(
    (proximo: EscolhasDoElenco) => {
      setEscolhas(proximo);
      gravarEscolhasDoElenco(livroId, proximo);
      // O ref só atualiza na próxima renderização; o Narrador precisa já do valor novo.
      ref.current = { ...ref.current, escolhas: proximo };
      aoMudar();
    },
    [livroId, aoMudar],
  );

  return {
    disponivel,
    ligado: escolhas.ligado,
    avatar: escolhas.avatar,
    personagens,
    vozes,
    distribuicao,
    gostos: escolhas.gostos,
    config,
    ligar: (v) => guardar({ ...escolhas, ligado: v }),
    mostrarAvatar: (v) => guardar({ ...escolhas, avatar: v }),
    escolherVoz: (personagem, voz) => {
      const gostos = { ...escolhas.gostos };
      if (voz) gostos[personagem] = voz;
      else delete gostos[personagem];
      guardar({ ...escolhas, gostos });
    },
  };
}
