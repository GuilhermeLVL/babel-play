import { CircleAlert, Search, UserRound } from 'lucide-react';
import { useState } from 'react';

import {
  alterarConta,
  concederPlano,
  type DetalheDaConta,
  lerConta,
  listarContas,
  type PapelDaConta,
} from '../../../lib/admin';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { usePerfil } from '../../../lib/usePerfil';
import { agir, type PedidoDeAcao } from './agir';
import { dataHora } from './formatar';
import { Aviso, Botao, Estado, Etiqueta, Secao, Tabela, type Tom } from './pecas';
import { useCarga } from './useCarga';

const PAPEIS: PapelDaConta[] = ['user', 'support', 'admin'];
const nomeDoPapel = (p: string) => (p === 'admin' ? t('admin') : p === 'support' ? t('suporte') : t('usuário'));
const tomDoEstado = (s: string): Tom => (s === 'active' ? 'bom' : 'atencao');
const nomeDoEstado = (s: string) => (s === 'active' ? t('ativa') : t('suspensa'));

/** Contas: lista com busca, e a conta escolhida com as ações (suspender, trocar o papel, conceder Premium). */
export default function PainelContas({ aoPedirCodigo }: { aoPedirCodigo: () => void }) {
  const questNovo = useQuestNovo();
  const contas = useCarga(listarContas, aoPedirCodigo);
  const [busca, setBusca] = useState('');
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const filtradas = (contas.dados ?? []).filter(
    (c) =>
      !termo ||
      c.id.toLowerCase().includes(termo) ||
      (c.displayName ?? '').toLowerCase().includes(termo) ||
      (c.email ?? '').toLowerCase().includes(termo),
  );

  return (
    <div className="ad-painel">
      {escolhida && (
        <ContaEscolhida
          key={escolhida}
          id={escolhida}
          aoFechar={() => setEscolhida(null)}
          aoMudar={contas.recarregar}
          aoPedirCodigo={aoPedirCodigo}
        />
      )}

      <Secao
        titulo={t('Contas')}
        sub={t(
          'As mais recentes primeiro (a rota devolve no máximo 200). O e-mail quase nunca está guardado: procure pelo id.',
        )}
      >
        <label className={questNovo ? 'q-campo ad-busca' : 'ad-busca'}>
          {questNovo ? (
            <span>{t('Buscar por id ou nome')}</span>
          ) : (
            <span className="ad-rotulo">{t('Buscar por id ou nome')}</span>
          )}
          <span className="ad-busca-caixa">
            <Search aria-hidden />
            <input
              type="search"
              className={questNovo ? '' : 'campo'}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t('Cole o id da conta')}
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </label>

        <Estado
          carga={contas}
          estaVazio={(c) => c.length === 0}
          vazio={{
            icone: <UserRound aria-hidden />,
            titulo: t('Nenhuma conta ainda'),
            explicacao: t('Quando alguém criar uma conta, ela aparece aqui.'),
          }}
        >
          {() =>
            filtradas.length === 0 ? (
              <Aviso
                icone={<Search aria-hidden />}
                titulo={t('Nenhuma conta com esse termo')}
                explicacao={t(
                  'A lista mostra só as contas mais recentes. Se você tem o id completo, abra a conta direto.',
                )}
                acao={
                  termo.length >= 8
                    ? { rotulo: t('Abrir a conta com este id'), aoClicar: () => setEscolhida(busca.trim()) }
                    : undefined
                }
              />
            ) : (
              <Tabela rotulo={t('Contas')} colunas={[t('Conta'), t('Papel'), t('Estado'), t('Criada em'), '']}>
                {filtradas.map((c) => (
                  <tr key={c.id} className={escolhida === c.id ? 'ad-linha-escolhida' : undefined}>
                    <td data-rotulo={t('Conta')}>
                      <code className="ad-id">{c.id}</code>
                      {c.displayName && <span className="ad-nota">{c.displayName}</span>}
                    </td>
                    <td data-rotulo={t('Papel')}>
                      <Etiqueta tom={c.role === 'admin' ? 'atencao' : 'neutro'}>{nomeDoPapel(c.role)}</Etiqueta>
                    </td>
                    <td data-rotulo={t('Estado')}>
                      <Etiqueta tom={tomDoEstado(c.status)}>{nomeDoEstado(c.status)}</Etiqueta>
                    </td>
                    <td data-rotulo={t('Criada em')}>{dataHora(c.createdAt)}</td>
                    <td className="ad-acao-da-linha">
                      <Botao aoClicar={() => setEscolhida(c.id)}>{t('Gerenciar')}</Botao>
                    </td>
                  </tr>
                ))}
              </Tabela>
            )
          }
        </Estado>
      </Secao>
    </div>
  );
}

function ContaEscolhida({
  id,
  aoFechar,
  aoMudar,
  aoPedirCodigo,
}: {
  id: string;
  aoFechar: () => void;
  aoMudar: () => void;
  aoPedirCodigo: () => void;
}) {
  const { perfil } = usePerfil();
  const detalhe = useCarga(() => lerConta(id), aoPedirCodigo);
  const [ocupado, setOcupado] = useState(false);
  const euMesmo = perfil?.id === id;

  const depois = () => {
    detalhe.recarregar();
    aoMudar();
  };
  const executar = async <T,>(p: Omit<PedidoDeAcao<T>, 'aoPedirCodigo' | 'depois'>) => {
    setOcupado(true);
    try {
      await agir({ ...p, aoPedirCodigo, depois });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Secao titulo={t('Conta escolhida')} acoes={<Botao aoClicar={aoFechar}>{t('Fechar')}</Botao>}>
      <Estado carga={detalhe}>
        {({ user, subscription }: DetalheDaConta) => {
          const suspensa = user.status === 'suspended';
          return (
            <div className="ad-detalhe">
              <dl className="ad-dados">
                <div>
                  <dt>{t('Id')}</dt>
                  <dd>
                    <code className="ad-id">{user.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t('Nome')}</dt>
                  <dd>{user.displayName || '—'}</dd>
                </div>
                <div>
                  <dt>{t('E-mail')}</dt>
                  <dd>{user.email || t('não guardado')}</dd>
                </div>
                <div>
                  <dt>{t('Papel')}</dt>
                  <dd>{nomeDoPapel(user.role)}</dd>
                </div>
                <div>
                  <dt>{t('Estado')}</dt>
                  <dd>
                    <Etiqueta tom={tomDoEstado(user.status)}>{nomeDoEstado(user.status)}</Etiqueta>
                  </dd>
                </div>
                <div>
                  <dt>{t('Criada em')}</dt>
                  <dd>{dataHora(user.createdAt)}</dd>
                </div>
                <div>
                  <dt>{t('Plano')}</dt>
                  <dd>
                    {subscription ? (
                      <>
                        {subscription.plan} · {subscription.status}
                        {subscription.provider ? ` · ${subscription.provider}` : ` · ${t('concedido sem cobrança')}`}
                        {subscription.currentPeriodEnd
                          ? ` · ${t('até {quando}', { quando: dataHora(subscription.currentPeriodEnd) })}`
                          : ''}
                        {subscription.cancelAtPeriodEnd ? ` · ${t('cancela no fim do período')}` : ''}
                      </>
                    ) : (
                      t('nenhuma assinatura (Grátis)')
                    )}
                  </dd>
                </div>
              </dl>

              {euMesmo && (
                <p className="ad-nota ad-aviso-proprio">
                  <CircleAlert aria-hidden />{' '}
                  {t('Esta é a sua conta: você não pode suspendê-la nem tirar o próprio papel de admin.')}
                </p>
              )}

              <div className="ad-acoes">
                {suspensa ? (
                  <Botao
                    desabilitado={ocupado}
                    aoClicar={() =>
                      void executar({
                        confirmacao: {
                          title: t('Reativar esta conta?'),
                          detail: t('A pessoa volta a entrar e a usar o app.'),
                          confirmLabel: t('Reativar'),
                        },
                        fazer: () => alterarConta(id, { status: 'active' }),
                        sucesso: t('Conta reativada.'),
                      })
                    }
                  >
                    {t('Reativar conta')}
                  </Botao>
                ) : (
                  <Botao
                    tom="perigo"
                    desabilitado={ocupado || euMesmo}
                    titulo={euMesmo ? t('Você não pode suspender a própria conta.') : undefined}
                    aoClicar={() =>
                      void executar({
                        confirmacao: {
                          title: t('Suspender esta conta?'),
                          detail: t('A pessoa deixa de conseguir usar o app até você reativar.'),
                          confirmLabel: t('Suspender'),
                          danger: true,
                        },
                        fazer: () => alterarConta(id, { status: 'suspended' }),
                        sucesso: t('Conta suspensa.'),
                      })
                    }
                  >
                    {t('Suspender conta')}
                  </Botao>
                )}

                {PAPEIS.filter((p) => p !== user.role).map((p) => (
                  <Botao
                    key={p}
                    desabilitado={ocupado || (euMesmo && p !== 'admin')}
                    titulo={euMesmo ? t('Você não pode tirar o próprio papel de admin.') : undefined}
                    tom={p === 'admin' ? 'perigo' : undefined}
                    aoClicar={() =>
                      void executar({
                        confirmacao: {
                          title: t('Mudar o papel para {papel}?', { papel: nomeDoPapel(p) }),
                          detail:
                            p === 'admin'
                              ? t('Quem é admin enxerga e altera todas as contas e a cobrança.')
                              : t('O acesso de administração desta conta muda na hora.'),
                          confirmLabel: t('Mudar o papel'),
                          danger: p === 'admin',
                        },
                        fazer: () => alterarConta(id, { role: p }),
                        sucesso: t('Papel alterado.'),
                      })
                    }
                  >
                    {t('Tornar {papel}', { papel: nomeDoPapel(p) })}
                  </Botao>
                ))}

                <Botao
                  tom="principal"
                  desabilitado={ocupado || subscription?.plan === 'premium'}
                  titulo={subscription?.plan === 'premium' ? t('Esta conta já tem o Premium.') : undefined}
                  aoClicar={() =>
                    void executar({
                      confirmacao: {
                        title: t('Conceder o Premium?'),
                        detail: t('Concede o Premium sem cobrança. Não há renovação: para tirá-lo, só à mão, depois.'),
                        confirmLabel: t('Conceder Premium'),
                      },
                      fazer: () => concederPlano(id, 'premium'),
                      sucesso: t('Premium concedido.'),
                    })
                  }
                >
                  {t('Conceder Premium')}
                </Botao>
              </div>
            </div>
          );
        }}
      </Estado>
    </Secao>
  );
}
