# Relatório de testes

A suíte unitária usa Vitest. A suíte funcional usa Playwright com Chromium e um servidor local conectado a um PostgreSQL exclusivo de teste, migrado e populado com dados fictícios. Os testes criam registros próprios com identificadores aleatórios.

## Resultados

| Verificação | Resultado observado |
| --- | --- |
| `npm run typecheck` | Aprovada. |
| `npm ci` em diretório limpo | Dependências instaladas a partir do lockfile. |
| `npm test` | 15 testes aprovados em 3 arquivos. |
| `npm run test:e2e` com `next dev` | 10 cenários aprovados em 16,8 s. |
| `npm run build` | Build de produção aprovado. |
| `npm run test:e2e` com `next start` | 10 cenários aprovados em 13,0 s, com PostgreSQL 17 isolado. |
| Navegação autenticada no build final | 17 rotas administrativas abertas no Chromium sem erros de carregamento. |
| Migrações e dados fictícios | Aplicados e reexecutados sem duplicação de registros. |
| Demonstração local | Login, consulta de indicadores com dados persistidos e logout verificados. |

A primeira execução funcional encontrou uma importação CSS pendente e ficou bloqueada pela compilação. Após a integração do CSS, oito cenários passaram. Os dois testes restantes esperavam um seletor de formulário incompatível com a marcação. Após trocar o seletor pelo papel acessível de caixa de seleção, os dez cenários passaram na mesma execução.

## Cenários verificados

| Área | Comportamento verificado |
| --- | --- |
| Contas e permissões | Login válido e inválido, logout, recuperação por código de uso único, revogação da sessão anterior, acesso somente leitura, escopo por congregação e bloqueio do financeiro para a Secretaria. |
| Cadastros centrais | Congregação sem CNPJ, vínculo de pessoas e ministérios, edição persistida, histórico, desativação e cadastro pela interface com recuperação após recarregar. |
| Agenda e equipes | Vínculo de equipe, inscrição sem duplicação, presença registrada, recorrência semanal exibida no calendário mensal e semanal e filtro por congregação. |
| Escalas | Atribuição, confirmação, rejeição de conflito em atividade recorrente e persistência da substituição de voluntário. |
| Financeiro e projetos | Despesa vinculada a evento, upload e download de comprovante, acesso ao comprovante protegido, projeto vinculado a evento e conclusão de tarefa. |
| Dashboard e relatórios | Indicadores consolidados a partir dos registros, filtro por congregação e download de CSV filtrado. |
| Interface móvel | Menu responsivo e tela de acesso restrito, em viewport de 390 × 844 px. |
| Regras isoladas | Validação de datas, recorrência, valores monetários, cadastro, JSON e origem das operações HTTP. |

As suítes usam dados fictícios. No Codex, os testes utilizaram o Chromium disponível no sistema. Os resultados cobrem os cenários listados. O percentual de cobertura, o funcionamento em outros navegadores e a execução do workflow remoto não foram medidos.

## Chamada em lote, alteração de senha e primeiro administrador

| Verificação | Resultado observado |
| --- | --- |
| `npm run typecheck` | Aprovada após integrar os fluxos. |
| `npm test` | 15 testes aprovados em 3 arquivos. |
| `npm run test:e2e` com `next dev` | 13 cenários aprovados em 20,6 s, com Chromium e PostgreSQL isolado. |
| `npm run build` | Aprovada. |
| `npm run test:e2e` com `next start` | 13 cenários aprovados em 10,2 s no build final, com Chromium e PostgreSQL 17 isolado. |
| `npm run db:criar-admin` | Conta criada em base migrada sem seed e autenticada no navegador com os acessos de campo. Uma nova tentativa recusou a base já provisionada. Em teste concorrente, apenas uma conta foi criada. |

- **Chamada em lote.** A Secretaria consultou nomes e situações na sua congregação. O servidor recusou acesso a outra congregação, inscrições de outras atividades, alterações em inscrições ou atividades canceladas, IDs duplicados e situação anterior desatualizada. Os lotes recusados preservaram os registros e um lote válido gravou presença e ausência na mesma operação.
- **Chamada no navegador.** A navegação partiu da lista de atividades em desktop. Em viewport de 390 × 844 px, a revisão mostrou duas alterações sem gravação antecipada. Uma edição concorrente causou conflito e preservou o restante do lote. Após recarregar a chamada, foi possível confirmar as alterações e recuperar os resultados ao recarregar a página.
- **Minha conta.** A troca de senha própria pelo formulário exigiu a senha atual, enquanto o cadastro administrativo recusou a alteração direta da própria senha. A troca encerrou duas sessões, invalidou um código de recuperação emitido antes da troca, rejeitou o login com a senha antiga e aceitou a senha nova. O teste usou uma conta temporária e verificou a navegação em desktop e o formulário em viewport de 390 × 844 px.

## Navegação responsiva e revisão dos cadastros

| Verificação | Resultado observado |
| --- | --- |
| `npm run typecheck` | Aprovada. |
| `npm test` | 15 testes aprovados em 3 arquivos. |
| `npm run test:e2e` com `next dev` | 18 cenários aprovados em 46,9 s, com Chromium e PostgreSQL isolado. |
| `npm run build` | Aprovado. |
| `npm run test:e2e` com `next start` | Os 18 cenários passaram em 18,5 s no build final com PostgreSQL 17 isolado. |

- **Menu no desktop.** Em 1.440 × 900 px, a navegação ficou visível e os controles do menu móvel permaneceram ocultos ao passar o ponteiro pela marca e pelo link ativo.
- **Menu móvel.** Em 390 × 844 px, o menu começa fechado. A abertura leva o foco ao botão de fechar e mantém o foco no menu ao navegar com Tab. Escape, o botão de fechar e o clique no fundo devolvem foco ao controle de abertura. A escolha de um módulo fecha o menu e foca o conteúdo. A alternância entre desktop e móvel preserva a navegação e retorna ao menu móvel fechado.
- **Navegação dos módulos.** O Chromium abriu 17 telas e aguardou a agenda, os relatórios, os indicadores ou os filtros de cada cadastro após o carregamento dos dados.
- **Cadastros.** A criação de pessoa com filtro de ativos manteve a situação ativa no formulário e no banco. Uma edição de nome pelo formulário preservou um telefone atualizado em paralelo. Uma verificação adicional constatou a ausência de ações incompatíveis na própria conta e no perfil protegido.
- **Atividades e escalas.** A API rejeitou alterações de presença e confirmação de escala em registros cancelados. A reativação em horário conflitante preservou a atividade cancelada, e a reativação em outro horário foi aceita. A lista e a edição foram verificadas com um horário local sem offset e um horário UTC que corresponde ao dia anterior em Brasília.

## Evolução da sede ICSV San Vale

| Verificação | Resultado observado |
| --- | --- |
| Checagem de tipos e build de produção | Aprovados. |
| Vitest | 15/15 testes aprovados. |
| Playwright no build final | 27/27 cenários aprovados em 35,2 s, com Chromium e PostgreSQL 17 isolado. |
| Instalação da base | Migrações aprovadas em uma base vazia e em uma base preparada pelo código anterior. O acesso administrativo, a sede e o lançamento legado conferido foram preservados na atualização. |
| Carga fictícia idempotente | Após duas execuções em base nova, as contagens verificadas se mantiveram. A base tem uma sede, sete usuários, sete movimentações, duas aceitações Kids e um certificado de demonstração. |
| Configuração Kids sem termo | Com a demonstração desativada e sem termo oficial, o aceite fictício não disponibilizou o perfil Kids. |

### Cenários conferidos

- **Perfis e marca.** A administração criou uma conta na sede e atribuiu dois perfis pelo formulário. A conta viu somente essas opções, trocou o perfil em uso e recebeu bloqueio nas rotas fora dos seus direitos. Uma conta sem atribuição vigente recebeu orientação para procurar a administração. O ícone oficial da entrada e da aba, o fundo azul-escuro e o mascote do Tutorial foram verificados no navegador.
- **Financeiro.** O financeiro viu as oito seções e conciliou a entrada e a saída com o saldo do extrato. O perfil comum viu somente Relatórios no menu financeiro. As rotas administrativas e a consulta de outra congregação retornaram bloqueio.
- **Kids.** Um responsável externo fez cadastro e solicitou vínculo. O Kids ficou indisponível enquanto o vínculo estava pendente ou o termo não tinha sido aceito. Após a confirmação e o aceite, a conta abriu as histórias e concluiu o jogo. Revogar o vínculo removeu o acesso.
- **Mural e pedidos.** O pendente ficou restrito ao autor e à moderação autorizada. O rejeitado não apareceu no mural. Um aprovado como anônimo ficou sem identificação na resposta pública. O público Kids e a presença do mural no Tutorial foram exercitados.
- **Treinamentos.** O vínculo ativo na equipe liberou os cursos pertinentes, e o gabarito ficou no servidor. Envios inválidos e reenvio da mesma entrega não consumiram tentativa adicional. A quarta tentativa foi recusada. Uma conta aprovada recebeu o certificado após a aula obrigatória e recuperou o certificado ao recarregar a tela.

A execução foi local. Produção e o workflow remoto permanecem fora desta verificação.
