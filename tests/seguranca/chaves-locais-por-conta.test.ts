// @vitest-environment node
/**
 * REGRA ESTÁTICA: nenhuma chave de `localStorage`/`sessionStorage` nem banco IndexedDB nasce em `src/` sem decisão.
 *
 * Toda chave achada pela varredura (`varredura-de-armazenamento.ts`) tem de estar (a) nos CONJUNTOS por conta de
 * `armazensDoAparelhoDaConta.ts` (apagados ao sair, trocar de conta ou excluir), (b) num arquivo que usa a peça comum
 * por conta (`armazemLocalPorConta` / `bancoLocalPorConta`), ou (c) na lista de EXCEÇÕES abaixo, com o MOTIVO por que
 * a chave NÃO guarda dado da conta (preferência do aparelho, cache de modelo, efêmero de funil...).
 * Chave nova que guarda texto, progresso, identidade ou escolha da PESSOA vai para um conjunto, não para a lista.
 * Chave que chega por parâmetro de um helper não é vista na chamada: as constantes `CHAVE_*`/`KEY`/`LS_*`/`PREFIXO_*`
 * e os helpers `chaveX = (a) => \`pref${a}\`` do arquivo são varridos pelo nome; o arquivo entra em DINAMICOS.
 */
import { describe, expect, it } from 'vitest'

import { CONJUNTOS } from '../../src/lib/armazensDoAparelhoDaConta'
import { varrer } from './varredura-de-armazenamento'

const EXCECOES: Array<{ motivo: string; chaves: string[] }> = [
  {
    motivo:
      'Preferência do aparelho: aparência, idioma, som, vibração, layout, legendas, leitura, voz, avatar (exibição), jogos',
    chaves: [
      'app_fonte',
      'app_particulas',
      'app_theme',
      'babel.age_profile',
      'babel.analise.frasePorFrase',
      'babel.analise.modoDeEscuta',
      'babel.animations_enabled',
      'babel.aoVivo.ultima',
      'babel.assistente',
      'babel.assistente.avisoDoIdioma.dispensado',
      'babel.auditoriaDeIdioma.*',
      'babel.captura.telaAcesa',
      'babel.conteudo',
      'babel.desenho.preferencias',
      'babel.filtro_da_pratica',
      'babel.font_scale',
      'babel.fonte_da_pratica',
      'babel.frase.ignorarAcentos',
      'babel.interprete.*',
      'babel.interprete.detectarOutro',
      'babel.interprete.modo',
      'babel.interprete.virtualDetectar',
      'babel.jogos_ordem',
      'babel.legendasFlutuantes',
      'babel.legendasFlutuantes.abrirAoComecar',
      'babel.legendasFlutuantes.tamanhos',
      'babel.legendasMeuPerfil',
      'babel.menu_position',
      'babel.nivel',
      'babel.nivel.*',
      'babel.notificacoes',
      'babel.overlaySettings',
      'babel.play.detalhes',
      'babel.preferencias',
      'babel.pular_antessala',
      'babel.quest.fonte',
      'babel.quest.legenda',
      'babel.quest.vibracao',
      'babel.rastro',
      'babel.sound_enabled',
      'babel.vibracao',
      'babel_app_layout_config_v4',
      'babel_app_layout_edit_mode',
      'babel_tour_*',
      'babel_voice_prefs',
      'cartoes.cenaAvisoVisto',
      'custom_theme_colors',
      'frasy.avatar.interprete.*',
      'frasy.avatar.modo.*',
      'frasy.avatar.protegido',
      'frasy.leituraAtiva.avisoDoMicrofone',
      'frasy.leituraAtiva.modo',
      'frasy.livros.idioma',
      'frasy.livros.nivel',
      'frasy.vozNoAparelho.conviteRecusadoEm',
      'frasy.vozNoAparelho.modelo',
      'frasy.vozNoAparelho.narrador',
      'ichat_docked',
      'ichat_largura',
      'ichat_tamanho',
      'leitor:destaque-vocab',
      'leitor:dica-elenco',
      'leitor:glosa',
      'leitor:modo-traducao',
      'leitor:narracao:modo',
      'leitor:narracao:opcoes',
      'leitor:narracao:seguir',
      'leitor:paginar-marca-conhecidas',
      'leitor:narracao:velocidade',
      'leitor:perfil',
      'practice.activeProduction.stabilityThreshold',
      'reading_forced_lang',
      'reading_layout_width',
      'reading_narration_mode',
      'reading_narration_rate',
      'revisao.palpiteDoAparelho',
      'theme',
      'transcriptSettings',
    ],
  },
  {
    motivo:
      'Login e identidade do aparelho (intenção, e-mail lembrado de propósito, convite, credencial de nuvem do perfil, erro do link)',
    chaves: [
      'babel.activeProfileId',
      'babel.anonimo_aceito',
      'babel.auth.erroDoLink',
      'babel.credentialId',
      'babel.instalacao',
      'babel.intencaoDeLogin',
      'babel.liberado',
      'babel.login.email',
      'babel.providerMode',
    ],
  },
  {
    motivo: 'Funil, oferta, checkout, anúncio e aviso dispensado: efêmero de produto, sem conteúdo da conta',
    chaves: [
      'babel.alivio.aceito',
      'babel.anualForaDeVenda',
      'babel.anuncios.ancoraFechada',
      'babel.anuncios.ultimoIntersticial',
      'babel.aviso.pagamento-atrasado.dispensado',
      'babel.aviso.sem-rede.dispensado',
      'babel.aviso_reembolso_v2',
      'babel.card_planos_cota_nunca',
      'babel.card_planos_dispensado',
      'babel.card_planos_dispensado_em',
      'babel.checkout.forma',
      'babel.checkout.para',
      'babel.checkout.plano',
      'babel.convite.token',
      'babel.convite_visto',
      'babel.faixa_sem_conta',
      'babel.ofertas.atribuicao',
      'babel.ofertas.checkout_pendente',
      'babel.ofertas.cota',
      'babel.ofertas.historico',
      'babel.ofertas.sessao',
      'babel.ofertas.teste',
      'babel.planos.destaque',
      'babel.porta.cadastro_google',
      'babel.px.anunciosDeProva',
      'babel.px.aparelhoDeProva',
      'babel.px.planoDeProva',
      'babel.px.planosAVendaDeProva',
      'babel.px.seloDeProva',
      'babel.px.telasDeProva',
      'babel.px.testeDeProva',
      'babel.usoDoDia.avisadoEm',
      'babel.usoDoDia.checadoEm',
      'babel.usoJusto.avisadoEm',
      'chave_dedup_v2',
    ],
  },
  {
    motivo: 'Consentimento e conexão do aparelho com serviços locais (Anki Connect, sombra local)',
    chaves: ['babel.anki_connect_key', 'babel.anki_connect_prefs', 'babel.sombraLocal.aceitou.*'],
  },
  {
    motivo: 'Modelo, motor e desempenho do aparelho: cache, manifesto, sonda, vazão, falhas',
    chaves: [
      'babel.bergamot.falha',
      'babel.captura.audioDaTelaFalhou',
      'babel.captura.downloadConfirmado',
      'babel.captura.ultimaSuperficie',
      'babel.flags',
      'babel.lab.gravarHipoteses',
      'babel.lab.parciaisMascara',
      'babel.lab.parciaisModo',
      'babel.modelManifest.*',
      'babel.mymemory.cota',
      'babel.performance_mode',
      'babel.recarga-por-chunk',
      'babel.sentinela.*',
      'babel.sondaDoAparelho',
      'babel.stt.modeloFixo',
      'babel.stt.parakeet',
      'babel.sttQuality',
      'babel.ultimaCaptura',
      'babel.ultimoInterprete',
      'babel.vazao',
      'babel.whisperDevice',
      'babel.whisperDtype',
      'babel.whisperModel',
    ],
  },
]

/** Arquivos que guardam por conta pela peça comum (dono em cada registro, guarda no boot, apagam ao sair/trocar/excluir). */
const COM_PECA_COMUM = [
  'src/lib/nuvemDoQuest.ts',
  'src/lib/entitlements.ts',
  'src/lib/ichat/conversas.ts',
  'src/lib/diario/historico.ts',
  'src/lib/captura/rascunhoDaCaptura.ts',
  'src/lib/voz/cacheDeVoz.ts',
  'src/lib/revisao/vozGuardada.ts',
  'src/lib/cartoes/',
  /* o modo SEM conta (`babel-local` e espelhos `babel.efemero.*`): `limparTudo` e o fim da migração o apagam */
  'src/data/efemero/',
  'src/lib/armazensDoAparelhoDaConta.ts',
]

/** Bancos fora dos conjuntos, com motivo. */
const BANCOS_EXCECAO: Record<string, string> = {
  'babel-local': 'modo sem conta: `limparTudo` e o fim da migração o apagam (src/data/efemero)',
}

/** Arquivos em que a chave chega por parâmetro de helper (sem literal na chamada). */
const DINAMICOS = [
  'src/lib/avatar/avatarDoModo.ts',
  'src/components/CardDePlanos.tsx',
  'src/components/IChat.tsx',
  'src/components/views/Diagnostico.tsx',
  'src/components/views/Livros.tsx',
  'src/components/views/Planos.tsx',
  'src/components/views/Reading.tsx',
  'src/components/views/Study.tsx',
  'src/components/views/ajustes/ModelosNoAparelho.tsx',
  'src/components/views/captura/LegendasFlutuantes.tsx',
  'src/components/views/leitor/LeitorDoLivro.tsx',
  'src/gateway/activeProfile.ts',
  'src/gateway/catalogoDeModelos.ts',
  'src/gateway/modelManifest.ts',
  'src/lib/armazensDoAparelhoDaConta.ts',
  'src/lib/authPorta.ts',
  'src/lib/avatar/descoberta.ts',
  'src/lib/avatar/meuAvatar.ts',
  'src/lib/avisoDoUsoDoDia.ts',
  'src/lib/captura/pipelineDeFala.ts',
  'src/lib/diario/historico.ts',
  'src/lib/escolhaDoProcessamento.ts',
  'src/lib/estado/useAparencia.ts',
  'src/lib/flags.ts',
  'src/lib/jogos/nivelDoJogo.ts',
  'src/lib/leitor/preferenciasDaNarracao.ts',
  'src/lib/leituraAtiva/preferencias.ts',
  'src/lib/livros/posicoesDoAparelho.ts',
  'src/lib/ofensiva.ts',
  'src/lib/ofertas/instrumentacao.ts',
  'src/lib/profile.ts',
  'src/lib/revisao/preferencias.ts',
  'src/lib/voz/cacheDeVoz.ts',
  'src/lib/voz/vozKitten.ts',
  'src/lib/voz/vozNoAparelho.ts',
]

const conjuntos = CONJUNTOS
const exatas = new Set(conjuntos.flatMap((c) => c.chaves))
const prefixosDosConjuntos = conjuntos.flatMap((c) => c.prefixos)
const bancosDosConjuntos = new Set(conjuntos.flatMap((c) => c.bancos))
const excecoes = new Map(EXCECOES.flatMap((e) => e.chaves.map((k) => [k, e.motivo] as const)))
const rotulo = (chave: string, prefixo: boolean) => (prefixo ? `${chave}*` : chave)

const coberta = (chave: string, prefixo: boolean, arquivo: string): boolean =>
  exatas.has(chave) ||
  prefixosDosConjuntos.some((p) => chave.startsWith(p)) ||
  (prefixo &&
    (prefixosDosConjuntos.some((p) => p.startsWith(chave)) || [...exatas].some((k) => k.startsWith(chave)))) ||
  excecoes.has(rotulo(chave, prefixo)) ||
  COM_PECA_COMUM.some((a) => arquivo.startsWith(a))

describe('armazenamento do aparelho: toda chave e todo banco têm dono ou exceção com motivo', () => {
  const achados = varrer()

  it('a varredura enxerga o armazenamento (não passa por falta de ver)', () => {
    expect(achados.length).toBeGreaterThan(300)
    expect(achados.some((a) => a.tipo === 'banco' && a.chave === 'frasy-livros')).toBe(true)
    expect(achados.some((a) => a.tipo === 'storage' && a.chave === 'frasy.livros.meus.v1')).toBe(true)
  })

  it('nenhuma chave do localStorage/sessionStorage fica sem conjunto por conta nem exceção', () => {
    const soltas = achados
      .filter((a) => a.tipo === 'storage' && a.chave !== null && !coberta(a.chave, a.prefixo, a.arquivo))
      .map((a) => `${rotulo(a.chave as string, a.prefixo)}  <-  ${a.arquivo}`)
    expect([...new Set(soltas)].sort()).toEqual([])
  })

  it('nenhum banco IndexedDB fica sem conjunto por conta nem exceção', () => {
    const soltos = achados
      .filter((a) => a.tipo === 'banco' && !(a.chave && (bancosDosConjuntos.has(a.chave) || a.chave in BANCOS_EXCECAO)))
      .map((a) => `${a.chave ?? '(nome dinâmico)'}  <-  ${a.arquivo}`)
    expect([...new Set(soltos)].sort()).toEqual([])
  })

  it('chave por parâmetro só nos arquivos listados (ou a lista envelheceu)', () => {
    const dinamicos = new Set(achados.filter((a) => a.chave === null).map((a) => a.arquivo))
    const novos = [...dinamicos].filter((f) => !DINAMICOS.includes(f) && !COM_PECA_COMUM.some((a) => f.startsWith(a)))
    expect(novos.sort()).toEqual([])
    const velhos = DINAMICOS.filter((f) => !dinamicos.has(f))
    expect(velhos).toEqual([])
  })

  it('as exceções não envelhecem: cada uma ainda existe no código e nenhuma é de conjunto', () => {
    const vistas = new Set(
      achados.filter((a) => a.tipo === 'storage' && a.chave !== null).map((a) => rotulo(a.chave as string, a.prefixo)),
    )
    expect([...excecoes.keys()].filter((k) => !vistas.has(k)).sort()).toEqual([])
    expect(
      [...excecoes.keys()].filter((k) => exatas.has(k) || prefixosDosConjuntos.some((p) => k.startsWith(p))).sort(),
    ).toEqual([])
  })
})
