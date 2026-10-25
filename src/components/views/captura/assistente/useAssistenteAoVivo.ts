import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { palavrasAcimaDoNivel } from '../../../../core/assistente/palavrasAcimaDoNivel';
import {
  type FalaDoAssistente,
  glosaParaOVideo,
  type MarcaNaLinha,
  marcasDaLinha,
  planejarChamadas,
  type RecursosDoAssistente,
  recursosDoAssistente,
  temChamada,
  type TipoDeMarca,
} from '../../../../core/assistente/telaDoAssistente';
import { FLAG_ASSISTENTE_AO_VIVO, PLAN_MATRIX } from '../../../../core/planos';
import type {
  CorrecaoDaFala,
  ExpressaoDestacada,
  FalhaDoAssistente,
  SugestaoDeResposta,
  TermoExplicado,
} from '../../../../data/apiDoAssistente';
import { type AgendaDoAssistente, criarAgenda } from '../../../../lib/assistente/agendaDoAssistente';
import { useAjustesDoAssistente } from '../../../../lib/assistente/ajustesDoAssistente';
import { useConsentimentoDeNuvem } from '../../../../lib/consentimentoDeNuvem';
import { getEntitlements } from '../../../../lib/entitlements';
import { useFlag } from '../../../../lib/flags';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';

/* O cliente chega por `import()` UMA vez (como a explicação da frase): quem nunca abre a janela não o baixa. */
let apiDoAssistente: Promise<typeof import('../../../../data/apiDoAssistente')> | null = null;
const carregarApi = () => (apiDoAssistente ??= import('../../../../data/apiDoAssistente'));
let niveisDoIdioma: Promise<typeof import('../../../../data/trilha/carregar')> | null = null;
const carregarNiveis = () => (niveisDoIdioma ??= import('../../../../data/trilha/carregar'));

/** Depois disto sem resposta, a folha do "Como respondo?" diz que está demorando (o p95 medido é ~3,8 s). */
export const COMO_RESPONDO_LENTO_MS = 2500;
/** Quantos itens o glossário da sessão guarda (os mais novos primeiro). */
export const TETO_DO_GLOSSARIO = 40;

export type EstadoDoComoRespondo =
  | { estado: 'fechado' }
  | ({ estado: 'consentimento' } & AlvoDaResposta)
  | ({ estado: 'carregando'; lento: boolean } & AlvoDaResposta)
  | ({ estado: 'ok'; sugestoes: SugestaoDeResposta[] } & AlvoDaResposta)
  | ({ estado: 'erro'; motivo: FalhaDoAssistente } & AlvoDaResposta);

/** A fala a que se responde. */
interface AlvoDaResposta {
  falaId: string;
  frase: string;
  lang?: string;
}

export interface ItemDoGlossario {
  chave: string;
  tipo: TipoDeMarca;
  texto: string;
  sentido?: string;
  nivel?: MarcaNaLinha['nivel'];
  escala?: MarcaNaLinha['escala'];
  frase: string;
  lang?: string;
}

/** O que a janela (Document PiP) recebe do assistente: tudo pronto para pintar, nenhuma regra. */
export interface AssistenteDaJanela {
  recursos: RecursosDoAssistente;
  protegido: boolean;
  marcas: ReadonlyMap<string, MarcaNaLinha[]>;
  correcoes: ReadonlyMap<string, CorrecaoDaFala>;
  comoRespondo: EstadoDoComoRespondo;
  pedirComoRespondo: (falaId?: string) => void;
  fecharComoRespondo: () => void;
  /** A folha pediu o consentimento de nuvem: autoriza (com data, como Ajustes) e pede. */
  autorizarEPedir: () => void;
}

interface Glosas {
  expressoes: ExpressaoDestacada[];
  termos: TermoExplicado[];
}

const base = (lang: string | undefined) => (lang || '').toLowerCase().split('-')[0];

/** O teto do dia do plano que a tela conhece (`0` = sem assistente; `null` = sem teto, self-host). */
export function assistenteDiaDoPlano(plano: string): number | null {
  const def = (PLAN_MATRIX as Record<string, (typeof PLAN_MATRIX)['free'] | undefined>)[plano];
  return def ? def.quotas.assistenteDia : 0;
}

/** Os recursos de nuvem do assistente existem para esta conta (flag + plano)? Para os Ajustes, que não têm a janela. */
export function useNuvemDoAssistente(): boolean {
  const flagLigada = useFlag(FLAG_ASSISTENTE_AO_VIVO);
  return flagLigada && assistenteDiaDoPlano(getEntitlements().plan) !== 0;
}

/**
 * O ASSISTENTE AO VIVO DA JANELA FLUTUANTE (Fase C2): decide o que aparece (flag, plano, recusa do servidor,
 * consentimento), agenda as chamadas automáticas pelo orçamento (`criarAgenda` + `planejarChamadas`), guarda as
 * glosas, as correções, o glossário da sessão e o "Como respondo?".
 *
 * Nada aqui avisa por cima da legenda: o automático é SILENCIOSO (marca na palavra, sentido ao tocar). Falha de
 * chamada automática não vira aviso; a cota esgotada só para as chamadas e deixa uma nota na aba.
 */
export function useAssistenteAoVivo(o: {
  /** A janela que mostra o assistente está aberta (Document PiP ou PiP de vídeo). Fechada, nada sai. */
  aberta: boolean;
  /** Pausada, escondida ou recolhida: nada automático sai. */
  pausado: boolean;
  falas: ReadonlyArray<FalaDoAssistente>;
  /** O idioma da pessoa (explicações e traduções vêm nele). */
  langDaPessoa: string;
  /** A janela é SÓ LEITURA (PiP de vídeo): nada que precise de toque — sem "Como respondo?" e sem correção. */
  soLeitura?: boolean;
}) {
  const ajustes = useAjustesDoAssistente();
  const flagLigada = useFlag(FLAG_ASSISTENTE_AO_VIVO);
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const [recusado, setRecusado] = useState(false);
  /** As glosas automáticas pararam nesta sessão por cota (a aba conta por quê). */
  const [paradoPorCota, setParadoPorCota] = useState<FalhaDoAssistente | null>(null);
  const protegido = perfilProtegido();
  const soLeitura = !!o.soLeitura;
  const recursos = useMemo(() => {
    const r = recursosDoAssistente(ajustes, {
      flagLigada,
      assistenteDiaDoPlano: assistenteDiaDoPlano(getEntitlements().plan),
      recusadoNaSessao: recusado,
      consentiuNuvem: consentiu,
    });
    return soLeitura ? { ...r, comoRespondo: false, correcao: false } : r;
  }, [ajustes, flagLigada, recusado, consentiu, soLeitura]);

  const [glosas, setGlosas] = useState<Record<string, Glosas>>({});
  const [correcoes, setCorrecoes] = useState<ReadonlyMap<string, CorrecaoDaFala>>(new Map());

  /* As listas de nível dos idiomas fora do inglês chegam por `import()`; quando chegam, as marcas são refeitas. */
  const [versaoDosNiveis, setVersaoDosNiveis] = useState(0);
  const idiomas = useMemo(
    () => [...new Set(o.falas.map((f) => base(f.lang)).filter((l) => l && l !== 'en'))].join(','),
    [o.falas],
  );
  useEffect(() => {
    if (!recursos.niveis || !idiomas) return;
    let vivo = true;
    void carregarNiveis()
      .then((m) => Promise.all(idiomas.split(',').map((l) => m.precarregarNiveis(l))))
      .then(() => vivo && setVersaoDosNiveis((n) => n + 1))
      .catch(() => {
        /* sem a lista, o honesto é não marcar */
      });
    return () => {
      vivo = false;
    };
  }, [idiomas, recursos.niveis]);

  /* ── A AGENDA: uma chamada por linha final, com espera, nunca pausada ──────────────────────────── */
  const estado = useRef({ recursos, langDaPessoa: o.langDaPessoa });
  estado.current = { recursos, langDaPessoa: o.langDaPessoa };
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const falhou = useCallback((m: FalhaDoAssistente) => {
    if (m === 'sem_plano' || m === 'fora') setRecusado(true);
    else if (m === 'uso_justo' || m === 'cota_do_mes') setParadoPorCota(m);
  }, []);

  const executar = useCallback(
    async (f: FalaDoAssistente) => {
      const { recursos: r, langDaPessoa } = estado.current;
      const plano = planejarChamadas(f, r, langDaPessoa);
      if (!temChamada(plano)) return;
      const api = await carregarApi();
      const idiomas = { lang: f.lang || 'en', langDaPessoa };
      const frase = f.original.trim().slice(0, 300);
      const [ex, te, co] = await Promise.all([
        plano.expressoes ? api.destacarExpressoes({ ...idiomas, frase }) : null,
        plano.termos.length ? api.explicarTermos({ ...idiomas, frase, termos: plano.termos }) : null,
        plano.correcao ? api.corrigirMinhaFala({ ...idiomas, minhaFala: f.original.trim().slice(0, 400) }) : null,
      ]);
      if (!vivo.current) return;
      for (const res of [ex, te, co]) if (res && res.ok === false) falhou(res.motivo);
      const expressoes = ex?.ok ? ex.valor.expressoes : [];
      const termos = te?.ok ? te.valor.termos : [];
      if (expressoes.length || termos.length) setGlosas((g) => ({ ...g, [f.id]: { expressoes, termos } }));
      if (co?.ok) setCorrecoes((m) => new Map(m).set(f.id, co.valor.correcao));
    },
    [falhou],
  );

  /* A agenda nasce e morre com o EFEITO (não num `useMemo`): no StrictMode o efeito monta, desmonta e monta de novo, e
     uma agenda destruída na primeira desmontagem ficaria morta para sempre. */
  const [agenda, setAgenda] = useState<AgendaDoAssistente<FalaDoAssistente> | null>(null);
  useEffect(() => {
    const a = criarAgenda<FalaDoAssistente>({ executar: (f) => void executar(f), pausado: true });
    setAgenda(a);
    return () => a.destruir();
  }, [executar]);

  const automatico = (recursos.expressoes || recursos.termos || recursos.correcao) && !paradoPorCota;
  const parado = !o.aberta || o.pausado || !automatico;
  useEffect(() => agenda?.pausar(parado), [agenda, parado]);

  /* A linha final mais nova ainda não pedida vai para a agenda (a anterior, atropelada, sai da fila). */
  const ultimaFinal = useMemo(() => {
    for (let i = o.falas.length - 1; i >= 0; i--)
      if (!o.falas[i].parcial && o.falas[i].original.trim()) return o.falas[i];
    return undefined;
  }, [o.falas]);
  useEffect(() => {
    if (!agenda || !ultimaFinal || !automatico) return;
    if (temChamada(planejarChamadas(ultimaFinal, recursos, o.langDaPessoa))) agenda.oferecer(ultimaFinal);
  }, [ultimaFinal, agenda, automatico, recursos, o.langDaPessoa]);

  /* ── AS MARCAS de cada linha (nível local + glosas da nuvem) ───────────────────────────────── */
  const marcas = useMemo(() => {
    void versaoDosNiveis;
    const m = new Map<string, MarcaNaLinha[]>();
    /* Janela fechada: nada a pintar, e nenhum trabalho a cada fala (a captura segue sem a janela). */
    if (!o.aberta) return m;
    for (const f of o.falas) {
      if (f.parcial || !f.original.trim()) continue;
      const g = glosas[f.id];
      const doIdiomaDaPessoa = !!f.lang && base(f.lang) === base(o.langDaPessoa);
      const niveis =
        recursos.niveis && f.lang && !doIdiomaDaPessoa ? palavrasAcimaDoNivel(f.original, f.lang, ajustes.nivel) : [];
      const lista = marcasDaLinha(f.original, {
        expressoes: recursos.expressoes ? g?.expressoes : undefined,
        termos: recursos.termos ? g?.termos : undefined,
        niveis,
      });
      if (lista.length) m.set(f.id, lista);
    }
    return m;
  }, [o.aberta, o.falas, glosas, recursos, ajustes.nivel, o.langDaPessoa, versaoDosNiveis]);

  /* ── O GLOSSÁRIO da sessão (a aba): os destaques mais novos primeiro, sem repetir ───────────── */
  const historico = useRef(new Map<string, ItemDoGlossario>());
  const glossario = useMemo(() => {
    const porFala = new Map(o.falas.map((f) => [f.id, f]));
    for (const [id, lista] of marcas) {
      const f = porFala.get(id);
      if (!f) continue;
      for (const mk of lista) {
        const chave = `${mk.tipo}|${mk.texto.toLowerCase()}`;
        historico.current.delete(chave);
        historico.current.set(chave, {
          chave,
          tipo: mk.tipo,
          texto: mk.texto,
          sentido: mk.sentido,
          nivel: mk.nivel,
          escala: mk.escala,
          frase: f.original,
          lang: f.lang,
        });
      }
    }
    while (historico.current.size > TETO_DO_GLOSSARIO)
      historico.current.delete(historico.current.keys().next().value as string);
    /* Expressões e termos primeiro (dizem mais), depois as palavras; dentro de cada grupo, a mais nova primeiro. */
    const todos = [...historico.current.values()].reverse();
    return [...todos.filter((i) => i.tipo !== 'nivel'), ...todos.filter((i) => i.tipo === 'nivel')];
  }, [marcas, o.falas]);

  /* A glosa do PiP de vídeo, por linha (uma só, curta). */
  const glosasDoVideo = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, lista] of marcas) {
      const g = glosaParaOVideo(lista);
      if (g) m.set(id, g);
    }
    return m;
  }, [marcas]);

  /* ── "COMO RESPONDO?" ─────────────────────────────────────────────────────────────────────── */
  const [comoRespondo, setComoRespondo] = useState<EstadoDoComoRespondo>({ estado: 'fechado' });
  const pedido = useRef(0);
  const falasRef = useRef(o.falas);
  falasRef.current = o.falas;
  const contextoPendente = useRef<string[]>([]);

  const pedirAgora = useCallback(async (alvo: AlvoDaResposta, contexto: string[]) => {
    const { frase, lang } = alvo;
    const id = ++pedido.current;
    setComoRespondo({ estado: 'carregando', ...alvo, lento: false });
    const relogio = setTimeout(() => {
      if (pedido.current === id) setComoRespondo((c) => (c.estado === 'carregando' ? { ...c, lento: true } : c));
    }, COMO_RESPONDO_LENTO_MS);
    const api = await carregarApi();
    const res = await api.comoRespondo({
      frase: frase.slice(0, 400),
      /* O servidor já descarta o contexto do perfil protegido; aqui ele nem sai. */
      contexto: perfilProtegido() ? undefined : contexto,
      lang: lang || 'en',
      langDaPessoa: estado.current.langDaPessoa,
    });
    clearTimeout(relogio);
    if (!vivo.current || pedido.current !== id) return;
    if (res.ok === true) setComoRespondo({ estado: 'ok', ...alvo, sugestoes: res.valor.sugestoes.slice(0, 3) });
    else {
      if (res.motivo === 'sem_plano' || res.motivo === 'fora') setRecusado(true);
      setComoRespondo({ estado: 'erro', ...alvo, motivo: res.motivo });
    }
  }, []);

  const pedirComoRespondo = useCallback(
    (falaId?: string) => {
      const falas = falasRef.current.filter((f) => !f.parcial && f.original.trim());
      /* A fala pedida; sem ela, a última de quem está do outro lado (a quem se responde); sem ela, a última. */
      const alvo =
        (falaId ? falas.find((f) => f.id === falaId) : undefined) ??
        [...falas].reverse().find((f) => f.lado === 'eles') ??
        falas[falas.length - 1];
      if (!alvo) return;
      const i = falas.indexOf(alvo);
      const contexto = falas.slice(Math.max(0, i - 2), i).map((f) => f.original);
      const resposta = { falaId: alvo.id, frase: alvo.original, lang: alvo.lang };
      if (!consentiu) {
        setComoRespondo({ estado: 'consentimento', ...resposta });
        contextoPendente.current = contexto;
        return;
      }
      void pedirAgora(resposta, contexto);
    },
    [consentiu, pedirAgora],
  );

  const autorizarEPedir = useCallback(async () => {
    const c = comoRespondo;
    if (c.estado !== 'consentimento') return;
    if (await autorizar())
      void pedirAgora({ falaId: c.falaId, frase: c.frase, lang: c.lang }, contextoPendente.current);
  }, [comoRespondo, autorizar, pedirAgora]);

  const fecharComoRespondo = useCallback(() => {
    pedido.current++;
    setComoRespondo({ estado: 'fechado' });
  }, []);

  /* A janela fechou: a folha fecha junto (e a resposta atrasada é descartada). */
  useEffect(() => {
    if (!o.aberta) fecharComoRespondo();
  }, [o.aberta, fecharComoRespondo]);

  const janela: AssistenteDaJanela = useMemo(
    () => ({
      recursos,
      protegido,
      marcas,
      correcoes,
      comoRespondo,
      pedirComoRespondo,
      fecharComoRespondo,
      autorizarEPedir: () => void autorizarEPedir(),
    }),
    [recursos, protegido, marcas, correcoes, comoRespondo, pedirComoRespondo, fecharComoRespondo, autorizarEPedir],
  );

  return {
    recursos,
    ajustes,
    janela,
    glossario,
    glosasDoVideo,
    paradoPorCota,
  };
}
