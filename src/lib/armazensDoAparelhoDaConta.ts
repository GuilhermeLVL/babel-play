/**
 * OS ARMAZÉNS DO APARELHO QUE SÃO DA CONTA, num registro só (auditoria `docs/auditoria/2026-11-25-dados-locais-por-conta.md`).
 *
 * Cobre o que a auditoria deixou pendente: "Meus livros" (lista, conteúdo, estante, capas, posições, elenco),
 * memória de tradução, desenhos por sessão, cosméticos da galeria, marcadores de gamificação e foto/avatar.
 * Esses módulos são carregados sob demanda (teto de JS inicial), então a guarda NÃO os importa: ela conhece só os NOMES
 * das chaves do `localStorage` e dos bancos IndexedDB, e apaga por eles. Nada aqui importa um dos módulos dos armazéns.
 *
 * COMO TEM DONO sem mexer no formato de cada armazém: um MARCADOR (`CHAVE_DO_DONO`) diz de quem é o conjunto inteiro.
 *  - marcador igual ao dono de agora: nada a fazer;
 *  - sem marcador (dado de antes desta regra): é ADOTADO por quem está agora (decisão assumida, 25/11: apagar tudo na
 *    primeira abertura destruiria a lista de livros de todo mundo; o risco é só o aparelho que já era compartilhado);
 *  - marcador de OUTRA conta (recarga com outra conta, conta -> conta, sair): o conjunto inteiro sai;
 *  - marcador `anonimo` e o dono agora é uma conta (o visitante entrou): NÃO sai nem é adotado sozinho. Fica PENDENTE
 *    até a pessoa escolher, no aviso de entrada, "trazer para esta conta" ou "apagar" (`ModalDeMigracao`). Se a conta
    SAI ou TROCA com a escolha pendente, o conjunto INTEIRO sai (fail-closed: a conta grava nas mesmas chaves e não há
    como separar o dela do do visitante).
 * Bancos IndexedDB são ESVAZIADOS (não apagados): outra aba ou módulo pode estar com o banco aberto e `deleteDatabase`
 * ficaria bloqueado. E só se abre o que existe (`bancoExiste`): a guarda não cria banco onde ninguém gravou.
 *
 * Sem dono conhecido (identidade carregando) não faz nada. Os módulos com memória própria (cache da lista de livros,
 * memória de tradução da aba, avatar do shell) ouvem `EVENTO_DE_ARMAZENS_LIMPOS` e se esquecem.
 */
import { bancoExiste, registrarArmazemPorConta } from './armazemLocalPorConta';
import { donoDaIdentidade } from './identidade';

/** O marcador: de quem é o conjunto (id da conta, `anonimo` ou `selfhost`). Não é dado pessoal. */
export const CHAVE_DO_DONO = 'babel.dono-dos-armazens-locais';
/** Disparado em `window` depois que o conjunto foi apagado (os módulos com cache na memória se esquecem). */
export const EVENTO_DE_ARMAZENS_LIMPOS = 'frasy:armazens-do-aparelho-limpos';

interface Conjunto {
  /** Para diagnóstico e teste. */
  nome: string;
  chaves: string[];
  prefixos: string[];
  bancos: string[];
}

export const CONJUNTOS: readonly Conjunto[] = [
  {
    nome: 'meus-livros',
    /* `leitor:recentes` é a lista "continuar lendo" (ids e títulos do que a pessoa abriu). */
    chaves: ['frasy.livros.meus.v1', 'leitor:recentes'],
    /* posição, elenco e posição da narração POR LIVRO (`meu-…`, `cat:…` e `sessao:…`) e a marca de migração das
       anotações por sessão; as opções, o perfil e o "Meu estilo" de narração são do aparelho (preferência, sem conteúdo). */
    prefixos: [
      'leitor:posicao:',
      'leitor:elenco:',
      'leitor:narracao:meu-',
      'leitor:narracao:cat:',
      'leitor:narracao:sessao:',
      'leitor:migrou:',
    ],
    bancos: ['frasy-livros', 'frasy-leitor', 'frasy-capas'],
  },
  { nome: 'memoria-de-traducao', chaves: [], prefixos: [], bancos: ['babel-memoria-de-traducao'] },
  { nome: 'desenhos', chaves: [], prefixos: ['babel.desenho.sessao:'], bancos: ['babel-desenhos'] },
  {
    nome: 'cosmeticos-da-galeria',
    chaves: [
      'babel.perfis',
      'babel.cromas',
      'babel.croma_equipado',
      'babel.paleta_ativa',
      'babel.perfil_equipado',
      'babel.efeitos_equipados',
      'babel.pele_cartao',
    ],
    prefixos: [],
    bancos: [],
  },
  {
    nome: 'marcadores-de-gamificacao',
    chaves: [
      'babel.conquistas',
      'babel.conquistas_datas',
      'babel.estudo_dia',
      'babel.ofensiva_avisada',
      'babel.missao_avisada',
      'babel.recompensas_vistas',
      'babel.eventos_vistos',
      'babel.nivel_visto',
      'babel.marcos_vistos',
      'babel.maestria_creditada',
      'babel.temporada_creditada',
      'babel.presenca_dia',
      'babel.loja_possuidos',
      'babel.premium_possuidos',
    ],
    prefixos: [],
    bancos: [],
  },
  {
    /* A receita (`frasy.avatar.receita.<id>`), a miniatura e o crédito do modelo são POR USUÁRIO, e as marcações de pose
       são texto da própria pessoa. `frasy.avatar.protegido` (trava do perfil protegido, sessionStorage), as dicas e as
       preferências de exibição (`frasy.avatar.modo.*`, `frasy.avatar.interprete.*`: ligado, tamanho, economia...)
       NÃO entram: a trava só restringe e o resto é do aparelho, sem conteúdo nem identidade. */
    nome: 'foto-e-avatar',
    chaves: ['frasy.avatar.sinais.marcacoes'],
    prefixos: ['babel.fotoDoPerfil.', 'frasy.avatar.receita.', 'frasy.avatar.miniatura.', 'frasy.avatar.credito.'],
    bancos: ['frasy-avatar'],
  },
];

const fabrica = (): IDBFactory | null => (typeof indexedDB === 'undefined' ? null : indexedDB);

const lerMarcador = (): string | null => {
  try {
    return localStorage.getItem(CHAVE_DO_DONO);
  } catch {
    return null;
  }
};
const gravarMarcador = (dono: string | null): void => {
  try {
    if (dono) localStorage.setItem(CHAVE_DO_DONO, dono);
    else localStorage.removeItem(CHAVE_DO_DONO);
  } catch {
    /* sem armazenamento: sem o que guardar */
  }
};

/** As chaves do `localStorage` que pertencem aos conjuntos (exatas e por prefixo). */
function chavesPresentes(): string[] {
  try {
    const exatas = new Set(CONJUNTOS.flatMap((c) => c.chaves));
    const prefixos = CONJUNTOS.flatMap((c) => c.prefixos);
    const achadas: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (exatas.has(k) || prefixos.some((p) => k.startsWith(p)))) achadas.push(k);
    }
    return achadas;
  } catch {
    return [];
  }
}

/** Esvazia todas as lojas de um banco que EXISTE (sem criá-lo, sem mudar a versão e sem esperar por conexões abertas). */
async function esvaziarBanco(nome: string): Promise<void> {
  const f = fabrica();
  try {
    if (!f || !(await bancoExiste(f, nome))) return;
    const db = await new Promise<IDBDatabase | null>((ok) => {
      const r = f.open(nome);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    });
    if (!db) return;
    try {
      const lojas = [...db.objectStoreNames];
      if (lojas.length) {
        await new Promise<void>((ok) => {
          const tx = db.transaction(lojas, 'readwrite');
          for (const l of lojas) tx.objectStore(l).clear();
          tx.oncomplete = () => ok();
          tx.onerror = () => ok();
          tx.onabort = () => ok();
        });
      }
    } finally {
      db.close();
    }
  } catch {
    /* nada guardado, nada a apagar */
  }
}

/** Apaga o banco inteiro (esquecer o navegador, excluir a conta). Esvazia antes: com outra aba conectada, a remoção espera. */
async function destruirBanco(nome: string): Promise<void> {
  await esvaziarBanco(nome);
  const f = fabrica();
  if (!f) return;
  try {
    if (!(await bancoExiste(f, nome))) return;
    await new Promise<void>((ok) => {
      const r = f.deleteDatabase(nome);
      r.onsuccess = () => ok();
      r.onerror = () => ok();
      r.onblocked = () => ok();
    });
  } catch {
    /* idem */
  }
}

async function apagarConjuntos(soNomes?: string[], destruir = false): Promise<void> {
  const alvo = CONJUNTOS.filter((c) => !soNomes || soNomes.includes(c.nome));
  const exatas = new Set(alvo.flatMap((c) => c.chaves));
  const prefixos = alvo.flatMap((c) => c.prefixos);
  for (const k of chavesPresentes()) {
    if (!exatas.has(k) && !prefixos.some((p) => k.startsWith(p))) continue;
    try {
      localStorage.removeItem(k);
    } catch {
      /* idem */
    }
  }
  await Promise.all(alvo.flatMap((c) => c.bancos).map(destruir ? destruirBanco : esvaziarBanco));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_DE_ARMAZENS_LIMPOS));
}

const ehConta = (dono: string | null): dono is string => !!dono && dono !== 'anonimo' && dono !== 'selfhost';

/** Apaga o conjunto e passa o marcador para o dono de agora (ou o remove, se ainda não se sabe). */
async function apagarEReconhecer(): Promise<void> {
  gravarMarcador(null);
  await apagarConjuntos();
  gravarMarcador(donoDaIdentidade());
}

async function purgarDeOutros(): Promise<void> {
  const dono = donoDaIdentidade();
  if (!dono) return;
  const marcador = lerMarcador();
  if (marcador === dono) return;
  if (marcador === null) {
    /* Dado de antes desta regra: adotado por quem está aqui agora (ver o cabeçalho). */
    gravarMarcador(dono);
    return;
  }
  if (marcador === 'anonimo' && ehConta(dono)) {
    /* O visitante só abriu o app (nada além dos marcadores passivos): não há o que escolher, a conta adota. Sem isto
       o que a própria conta grava logo depois (conquistas, cromas) faria o aviso aparecer a quem não deixou nada. */
    if (!(await haAlgoDoVisitante())) gravarMarcador(dono);
    return; // senão, pendente: a pessoa escolhe no aviso de entrada
  }
  await apagarEReconhecer();
}

registrarArmazemPorConta({
  nome: 'dados-do-aparelho-da-conta',
  async apagarTudo(o) {
    /* O visitante que só abriu o app e agora entra: não há o que escolher, a conta adota (ver `purgarDeOutros`). */
    if (
      o?.preservarVisitante &&
      lerMarcador() === 'anonimo' &&
      ehConta(donoDaIdentidade()) &&
      !(await haAlgoDoVisitante())
    ) {
      gravarMarcador(donoDaIdentidade());
    }
    /* FAIL-CLOSED. A conta que entra grava nas MESMAS chaves e bancos do visitante, sem marcador que separe o que é de
       quem, e não há como provar depois que ela não gravou (contar linhas ou tirar "impressão" deixa passar sobrescrita e
       corrida). Então:
        - ENTRADA do visitante (visitante -> conta): nada do visitante sai (a pessoa ainda vai escolher no aviso); só o
          que é da conta por chave de usuário (foto e avatar);
        - SAÍDA ou TROCA de conta com a escolha ainda pendente: o conjunto INTEIRO sai, inclusive o do visitante.
          Perder o que ninguém reivindicou é aceitável; deixar dado de conta para a próxima pessoa não é. */
    if (lerMarcador() === 'anonimo' && o?.preservarVisitante) {
      await apagarConjuntos(['foto-e-avatar']);
      return;
    }
    await apagarEReconhecer();
  },
  purgarDeOutros,
  async destruir() {
    gravarMarcador(null);
    await apagarConjuntos(undefined, true);
  },
});

/* ─────────────── O aviso de entrada: o que o visitante deixou, "trazer" ou "apagar" ─────────────── */

/** O visitante (sem conta) deixou algo marcado e agora há uma conta: falta a escolha da pessoa. */
export const visitantePendente = (): boolean => lerMarcador() === 'anonimo' && ehConta(donoDaIdentidade());

/** Marcadores que o app grava sozinho ao abrir (sem a pessoa ter feito nada): não justificam o aviso. */
const CHAVES_PASSIVAS = new Set(['babel.presenca_dia', 'babel.nivel_visto']);

/** Há mesmo algo do visitante no aparelho (chave ou banco com conteúdo)? É o que decide se o aviso aparece. */
export async function temDadosDoVisitante(): Promise<boolean> {
  if (!visitantePendente()) return false;
  return haAlgoDoVisitante();
}

async function haAlgoDoVisitante(): Promise<boolean> {
  if (chavesPresentes().some((k) => k !== CHAVE_DO_DONO && !CHAVES_PASSIVAS.has(k))) return true;
  const f = fabrica();
  if (!f) return false;
  for (const nome of CONJUNTOS.flatMap((c) => c.bancos)) {
    if (!(await bancoExiste(f, nome))) continue;
    if (await bancoTemLinhas(f, nome)) return true;
  }
  return false;
}

async function bancoTemLinhas(f: IDBFactory, nome: string): Promise<boolean> {
  return new Promise<boolean>((ok) => {
    try {
      const r = f.open(nome);
      r.onerror = () => ok(false);
      r.onblocked = () => ok(false);
      r.onsuccess = () => {
        const db = r.result;
        const lojas = [...db.objectStoreNames];
        if (!lojas.length) {
          db.close();
          return ok(false);
        }
        const tx = db.transaction(lojas, 'readonly');
        let achou = false;
        for (const l of lojas)
          tx.objectStore(l).count().onsuccess = (e) => {
            if (((e.target as IDBRequest<number>).result ?? 0) > 0) achou = true;
          };
        const fim = () => {
          db.close();
          ok(achou);
        };
        tx.oncomplete = fim;
        tx.onerror = fim;
        tx.onabort = fim;
      };
    } catch {
      ok(false);
    }
  });
}

/** "Trazer para esta conta": o que o visitante deixou passa a ser da conta de agora. */
export function trazerDadosDoVisitante(): void {
  const dono = donoDaIdentidade();
  if (ehConta(dono)) gravarMarcador(dono);
}

/** "Apagar": o que o visitante deixou sai do aparelho (e o que a conta gravou enquanto o aviso esperava, que é espelho). */
export async function apagarDadosDoVisitante(): Promise<void> {
  await apagarEReconhecer();
}

/** Só para testes. */
export const _lerMarcador = lerMarcador;
