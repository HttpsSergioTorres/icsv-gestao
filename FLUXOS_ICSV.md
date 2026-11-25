# Como o ICSV Gestão funciona hoje

Este guia descreve a revisão de 24 de novembro de 2026. Ele reúne o comportamento encontrado no código e os fluxos exercitados com dados fictícios. As decisões que dependem da igreja ficam no fim do documento.

Uma sequência para experimentar o sistema é **entrar → localizar ou cadastrar uma congregação → cadastrar pessoas → organizar ministérios e equipes → criar uma atividade → registrar inscrições, presenças e escalas**. Financeiro e projetos também podem ser usados sem vínculo com uma atividade. O painel e os relatórios consolidam o que já foi registrado.

Os módulos de comunicação, Tutorial, Kids, Financeiro ampliado e Treinamentos estão detalhados no [guia da evolução](EVOLUCAO_ICSV.md).

## Regras comuns

As listas buscam da API os dados que o perfil pode consultar dentro do seu escopo. A pesquisa textual e os filtros das listas operam no navegador. Filtros e seletores de vínculos dependem da leitura do cadastro relacionado. A escrita precisa da permissão de gerenciamento. A API verifica a permissão e o escopo a cada operação.

O PostgreSQL persiste os registros, os vínculos e o histórico de mutações. A edição de um formulário envia somente os campos alterados. A desativação mantém o registro. Para cadastros com exclusão lógica, o registro sai da lista sem remoção física. Vínculos de outros registros podem bloquear a exclusão ou a mudança de congregação. A aplicação preserva vínculos antigos ao inativar um registro e exige destinos ativos para novos vínculos.

## 1. Acesso à aplicação e painel geral

O ICSV Gestão é a área administrativa da Igreja de Cristo no Brasil, Campo San Vale, e de suas congregações. As telas de gestão consultam a sessão. Após informar as credenciais, cada conta precisa escolher um dos perfis que lhe foram atribuídos, mesmo quando há um único perfil. A sessão permite trocar de perfil pelo menu da conta. O menu lateral tem versão móvel, apresenta as seções que a conta pode consultar e dá acesso ao menu de conta e à saída. O painel de entrada mantém a saudação e os atalhos autorizados mesmo sem permissão para os indicadores.

O **Painel geral** consulta `/api/dashboard` com a permissão de painel. Os cartões mostram congregações, membros ativos, ministérios, eventos, tarefas pendentes e saldo, conforme a permissão de leitura de cada recurso e o escopo da conta. Os totais vêm do PostgreSQL. Congregações e ministérios incluem registros ativos e inativos. Membros ativos são pessoas de tipo principal **Membro** com situação ativa. Tarefas pendentes incluem as pendentes e as em andamento. O saldo corresponde a receitas menos despesas. A seção **Próximos eventos** requer acesso à agenda e apresenta até seis ocorrências futuras de atividades agendadas, incluindo as recorrentes. A interface trata carregamento, falhas e listas vazias. O painel principal não oferece filtros manuais. Os filtros por congregação e período estão na tela **Relatórios**.

**Código-fonte** `src/components/gestao-shell.tsx`, `src/components/painel.tsx`, `src/app/api/dashboard/route.ts`, `src/lib/server/overview.ts`.

## 2. Usuários, perfis e recuperação de acesso

- **Login e sessão.** O acesso ocorre por e-mail e senha. Conta e perfil precisam estar ativos. Contas de escopo congregacional também precisam estar vinculadas a uma congregação ativa. Senhas são armazenadas como hash scrypt com sal. A sessão dura até 12 horas, utiliza cookie HttpOnly e tem seu token persistido como hash. O servidor limita tentativas de senha. A opção **Sair** revoga a sessão corrente.
- **Minha conta.** A pessoa autenticada pode conferir nome, e-mail e perfil e trocar a senha após informar a atual. A nova senha deve ter entre 8 e 128 caracteres e ser diferente da atual. A confirmação fica no formulário. A troca revoga todas as sessões da conta e códigos de recuperação pendentes, e direciona para um novo login. A tela administrativa encaminha a troca da senha própria para **Minha conta**.
- **Usuários.** A área administrativa permite criar, consultar, editar e desativar contas, conforme a permissão. O cadastro exige nome, e-mail, senha no primeiro registro e perfil. O e-mail é único sem distinção de maiúsculas. A congregação é obrigatória para perfis de congregação. A conta não pode alterar o próprio perfil ou vínculo de congregação nem se desativar. Uma troca administrativa de senha de outra conta revoga as sessões e a recuperação pendente dessa conta.
- **Perfis.** Perfis configuráveis têm nome, descrição, situação, escopo de campo ou congregação e permissões independentes de consulta e gerenciamento por recurso. Painel e relatórios têm permissões próprias. O escopo congregacional limita os registros à congregação associada. Somente contas de campo com a permissão apropriada podem gerenciar perfis compartilhados. A API impede a administração de um perfil que concede direitos além dos concedidos ao operador. O perfil reservado de administração inicial e o perfil em uso pela própria conta têm proteção adicional contra edição.
- **Recuperar acesso.** Em **Usuários**, outra conta autorizada gera o código, que deve ser entregue por um canal seguro. A recuperação tem validade de 30 minutos e uso único. A geração de um novo código substitui o anterior. Em **Recuperar meu acesso**, a pessoa usa o código para definir a nova senha. A redefinição revoga as sessões existentes. A aplicação não envia e-mails de recuperação.
- **Primeira conta.** Após migrar uma base ainda sem usuários, `npm run db:criar-admin` recebe a senha por entrada padrão e cria o primeiro administrador de campo e o perfil reservado. O comando recusa uma base já provisionada. Os sete perfis incluídos no seed são exemplos de desenvolvimento: administrador geral, administrador de congregação, pastor ou liderança, líder de ministério, secretaria, financeiro e voluntário.

**Código-fonte** `src/lib/server/auth.ts`, `src/lib/server/records.ts`, `src/app/api/auth/`, `src/components/minha-conta.tsx`, `src/components/acesso.tsx`, `scripts/criar-admin.mjs`, `scripts/seed.mjs`.

## 3. Congregações

Em **Congregações**, o operador consulta e filtra por texto, pastor, responsável ou situação, conforme as referências disponíveis. Pode abrir os detalhes e seguir para **Pessoas** ou **Ministérios** já filtrados pela congregação, se tiver acesso ao destino. O cadastro exige nome. CNPJ, endereço, cidade, telefone, e-mail, pastor e responsável são opcionais. Para atribuir pastor ou responsável, primeiro cadastre a pessoa na congregação e depois vincule na edição. O servidor exige que a pessoa vinculada pertença à mesma congregação e esteja ativa na criação do vínculo.

A criação requer escopo de campo e permissão de escrita. A edição ou desativação de uma congregação existente respeita a permissão de escrita e o escopo da conta. Desativar preserva a congregação, seus dados e vínculos e revoga o acesso das contas com escopo daquela congregação. A reativação é feita pela edição da situação.

**Código-fonte** `src/lib/domain/resources.ts`, `src/components/recursos.tsx`, `src/lib/server/records.ts`.

## 4. Pessoas

Em **Pessoas**, cadastre a pessoa uma vez com nome, congregação e vínculo principal. Os tipos disponíveis são membro, visitante, pastor ou liderança e voluntário. O mesmo cadastro pode ser referenciado em equipes, inscrições, escalas e outras atividades. O formulário aceita data de nascimento, telefone, e-mail, responsável legal, autorizações de responsável e de imagem, observações e situação. Data de nascimento futura é recusada. Se a autorização do responsável estiver marcada, o nome do responsável é obrigatório. O cadastro guarda essas marcações, sem anexos de autorização ou bloqueio automático de todos os cadastros de menores.

A pesquisa textual ignora maiúsculas e acentos. Os filtros incluem vínculo principal, congregação e situação. Os operadores com escrita podem editar, desativar e reativar. O histórico mostra ação, momento, identificação visível do operador e nomes dos campos alterados. O CSV exporta as linhas filtradas com as colunas da listagem: nome, vínculo principal, congregação e situação. O link **Escalas da pessoa** consulta as participações quando o perfil pode ler escalas. A mudança de congregação pode ser bloqueada enquanto houver vínculos de referência em registros ainda não excluídos.

**Código-fonte** `src/lib/domain/resources.ts`, `src/components/recursos.tsx`, `src/lib/server/records.ts`, `src/app/api/[resource]/[id]/historico/route.ts`.

## 5. Ministérios, departamentos e equipes

Em **Ministérios**, registre nome, congregação, tipo **Ministério** ou **Departamento**, liderança opcional, descrição e situação. A listagem aceita pesquisa por texto e filtros por tipo, congregação, liderança e situação. O vínculo de liderança usa **Pessoas** da mesma congregação. A ação **Equipes** abre a listagem de vínculos já filtrada pelo ministério. A ação **Escalas** abre a listagem de escalas com o mesmo filtro, se o operador tiver leitura.

Em **Equipes**, associe congregação, ministério e pessoa, e informe função opcional e situação. A pesquisa inclui os campos apresentados. Há filtros por congregação, ministério, pessoa e situação quando as referências podem ser consultadas. O banco impede a duplicação do par pessoa-ministério, inclusive quando o vínculo anterior está inativo. Para voltar à equipe, reative o vínculo existente pela edição. O servidor verifica o escopo e a integridade das referências e recusa novos vínculos a registros inativos ou de outra congregação.

**Código-fonte** `src/lib/domain/resources.ts`, `src/components/recursos.tsx`, `src/lib/server/records.ts`, `db/migrations/001_initial.sql`.

## 6. Agenda, cultos, eventos e chamada

- **Interface.** A tela `/agenda` exibe calendário mensal ou semanal no horário de Brasília, atividades do dia selecionado e filtros por congregação e ministério. A lista `/eventos` cadastra, consulta, edita e cancela cultos, reuniões e eventos com horário de início e fim, local, congregação, ministério e responsável. Atividades podem estar agendadas, realizadas ou canceladas. A edição iniciada pelo calendário abre o registro-base.
- **Persistência e regras.** `/api/eventos` e `/api/eventos/{id}` expõem as operações de cadastro. O fim precisa ser posterior ao início. Repetições semanal, quinzenal e mensal exigem uma data limite. Uma repetição mensal em dia indisponível usa o último dia do mês e volta ao dia original quando possível. O calendário calcula as ocorrências a partir da série. Ao cancelar a série, o calendário mostra o registro-base cancelado e deixa de expandir suas repetições.
- **Inscrição e chamada.** `/inscricoes` mantém vínculos entre pessoa e atividade, com estados inscrito, confirmado, presente, ausente ou cancelado. O banco impede duplicidade de inscrições por pessoa e atividade enquanto o registro não for excluído logicamente, inclusive quando a situação estiver cancelada. A chamada interna em `/eventos/{id}/presencas` lista nomes e situações, permite revisar mudanças antes de confirmar e usa `GET/PATCH /api/eventos/{id}/presencas`. A leitura exige autorização em eventos, inscrições e pessoas. A gravação exige permissão de escrita em inscrições e atualiza todo o lote em uma transação. Uma alteração em atividade ou inscrição cancelada, uma inscrição de outra atividade, IDs repetidos ou situação anterior desatualizada causam recusa no fluxo de chamada. A edição individual também bloqueia novas marcações de presença ou ausência para inscrições ou atividades canceladas. O cancelamento da atividade preserva os vínculos já existentes.
- **Limite.** Inscrições, chamada, status e escalas fazem referência à série. Ocorrências geradas pelo calendário não possuem inscrição, presença ou cancelamento próprios. A lista administrativa usa a data inicial do registro-base para filtrar atividades. A agenda e os relatórios por período também consideram ocorrências geradas. O processo de divulgação ou inscrição pública segue em aberto.

**Código-fonte** `src/components/calendario.tsx`, `src/components/chamada.tsx`, `src/lib/domain/resources.ts`, `src/lib/domain/occurrences.ts`, `src/lib/server/records.ts` e `db/migrations/001_initial.sql`.

## 7. Escalas de serviço

- **Interface.** `/servicos` administra tipos de serviço por congregação, com vínculo opcional a ministério. `/escalas` registra atividade, ministério, serviço e pessoa, com estados pendente, confirmada, recusada ou substituída. A escala pode ser filtrada por pessoa, ministério, atividade ou situação. O cadastro de pessoa também oferece acesso à lista filtrada.
- **Backend.** A aplicação verifica o escopo da congregação e exige que o ministério da escala corresponda ao do serviço quando o serviço estiver vinculado a um ministério. Para atribuições pendentes ou confirmadas, verifica sobreposições de horário do mesmo voluntário, inclusive em séries recorrentes. Escalas recusadas ou substituídas e atividades canceladas não entram como bloqueios no cálculo. Horários contíguos são aceitos. A edição de horários ou a reativação de uma atividade reavalia os conflitos usando os novos horários, inclusive entre as escalas da própria série. Atividades canceladas impedem novas alocações ou confirmações. O código revisado recusa novas alocações e confirmações para atividades canceladas.
- **Substituição e limite.** `POST /api/escalas/{id}/substituir` marca a escala anterior como substituída e cria outra pendente na mesma transação. A consulta histórica disponível ao usuário é a lista de atribuições, filtrável por pessoa e situação. O endpoint de histórico detalhado de registros atende pessoas e movimentações. A seleção sugere pessoas ativas da congregação. A disponibilidade é aferida pelo conflito com escalas já registradas, sem cadastro de disponibilidade individual. A confirmação é uma mudança de situação por conta com escrita no recurso, sem um fluxo de confirmação restrito à própria pessoa escalada.

**Código-fonte** `src/components/recursos.tsx`, `src/lib/domain/resources.ts`, `src/lib/server/records.ts` e `src/app/api/escalas/[id]/substituir/route.ts`.

## 8. Financeiro e prestação de contas

- **Interface.** `/categorias` mantém categorias de receita e despesa por congregação. A própria congregação organiza a separação financeira. O sistema ainda não tem um cadastro separado de centros de custo. `/movimentacoes` mantém receitas e despesas com categoria, valor, data, descrição, congregação e vínculo opcional a evento. Os filtros controlam a lista, seus totais de receitas, despesas e saldo e o CSV das linhas visíveis. A pessoa autorizada pode escolher as datas de início e fim de um mês para obter um resumo desse período. O relatório permite consolidar ou consultar por congregação no escopo do perfil.
- **Backend e rastreabilidade.** A API exige valor positivo com até duas casas decimais e valida a correspondência entre o tipo da categoria e o da movimentação. A categoria vinculada fica protegida contra mudança do tipo. Os totais são acumulados em centavos e exibidos em reais. O histórico expõe operação, hora, nomes de campos alterados e identificação administrativa conforme o escopo. A edição e a exclusão são controladas por permissão, e a exclusão genérica de movimentação é lógica.
- **Comprovantes.** O formulário aceita identificação textual e upload. `POST /api/comprovantes` aceita PDF, PNG ou JPEG validados pela assinatura inicial do arquivo e limita a 5 MiB. Os bytes ficam no PostgreSQL. A descarga autenticada exige leitura de movimentações no escopo da congregação. A vinculação a uma movimentação valida a congregação do anexo. O upload e a gravação da movimentação são requisições distintas, motivo pelo qual um upload bem-sucedido pode permanecer sem vínculo se o formulário não for concluído.
- **Limite institucional.** O módulo destina-se ao registro administrativo. Fechamento e aprovação, regras contábeis oficiais e retenção dos comprovantes aguardam definição. O código auditado não executa pagamentos, movimentações automáticas ou integração bancária.

**Código-fonte** `src/components/recursos.tsx`, `src/components/client-api.ts`, `src/lib/server/records.ts`, `src/lib/server/receipts.ts`, `db/migrations/002_receipts.sql` e `PENDENCIAS_NEGOCIO.md`.

## 9. Projetos e tarefas

- **Interface.** `/projetos` mantém projetos por congregação, com nome, descrição, situação, prazo, responsável e vínculos opcionais a ministério e evento. `/tarefas` mantém tarefas com projeto obrigatório, título, descrição, prazo, responsável e situação. A navegação permite consultar projetos de uma atividade e tarefas de um projeto. Os projetos podem estar planejados, em andamento, concluídos ou cancelados. As tarefas podem estar pendentes, em andamento, concluídas ou canceladas. As listas aceitam filtros de situação e vínculos.
- **Persistência e progresso.** Projetos e tarefas usam a mesma API de cadastros, com validação de escopo e de vínculos. Uma tarefa marcada como concluída conta no progresso mostrado no projeto. A métrica divide tarefas concluídas pelo total de tarefas não canceladas daquele projeto e aparece para perfis com leitura de tarefas. O status do projeto é selecionado independentemente do progresso calculado. O vínculo impede a exclusão de projeto com tarefas vigentes apontando para ele.

**Código-fonte** `src/components/recursos.tsx`, `src/lib/domain/resources.ts` e `src/lib/server/records.ts`.

## 10. Relatórios

- **Interface e API.** `/relatorios` lê `GET /api/reports?congregacaoId=…&de=…&ate=…`. A tela apresenta um resumo, tabela por congregação e distribuição de pessoas nas equipes por ministério. O CSV é gerado no navegador com os indicadores filtrados. `GET /api/dashboard` usa a mesma apuração com autorização própria e fornece os próximos eventos agendados.
- **Apuração.** O servidor calcula os indicadores a partir dos registros vigentes visíveis ao perfil. Para cada congregação e no total, exibe membros e membros ativos, ministérios, eventos e eventos realizados, inscrições, escalas e escalas confirmadas, receitas, despesas, saldo, projetos e tarefas pendentes. Membros são as pessoas classificadas como `membro`. A distribuição por ministério conta os vínculos de equipe ativos. As inscrições canceladas ficam fora da contagem de inscrições. O total de escalas inclui as situações registradas, com as confirmadas em métrica separada. Tarefas pendentes somam as situações pendente e em andamento.
- **Limites dos filtros.** As datas filtram as movimentações pela data informada e os eventos pela sobreposição do horário ou ocorrência com o período. Cada série correspondente entra uma vez na contagem. A inscrição e a escala acompanham o filtro da atividade à qual estão vinculadas. Os cadastros e suas situações refletem o momento da consulta, sem reconstituição histórica. O CSV reproduz os indicadores retornados, e a tela omite métricas para as quais o perfil não possui acesso ao recurso de origem.

**Código-fonte** `src/components/painel.tsx`, `src/components/client-api.ts`, `src/lib/server/overview.ts`, `src/app/api/reports/route.ts` e `src/app/api/dashboard/route.ts`.

## O que foi corrigido nesta revisão

| Situação encontrada | Comportamento após a correção |
| --- | --- |
| O botão **Fechar menu** podia aparecer no desktop e ganhar fundo ao passar o mouse. | O botão só aparece no menu móvel aberto. O fundo fica inerte, o teclado permanece dentro do menu, e **Esc**, o botão ou o clique fora fecham o menu. |
| Um formulário reenviava campos intocados e podia apagar uma edição feita em outra sessão. | São enviados somente os campos editados e os ajustes de vínculos decorrentes dessas mudanças. |
| Ao cadastrar a partir do filtro **Ativos**, a pessoa podia começar como inativa. | O formulário interpreta corretamente o filtro e começa com **Ativo** marcado. |
| Formulários ofereciam pessoas de outra congregação, atividades canceladas ou serviços de outro ministério para vínculos que o servidor rejeitava. | Os seletores restringem essas opções. Vínculos já registrados continuam visíveis. A liderança de uma congregação é indicada após a criação, na edição. |
| A própria conta e perfis protegidos exibiam ações indisponíveis. | Recuperação e desativação da própria conta saíram da lista de ações. A edição do perfil protegido ou do perfil em uso pela conta fica indisponível. |
| A exibição e a edição na lista podiam interpretar um horário sem offset no fuso do navegador. | A lista, o formulário e o filtro de datas usam a mesma interpretação de horários da agenda. |
| A edição individual permitia contornar parte dos bloqueios de cancelamento e o reagendamento podia comparar escalas legadas com o horário antigo. | A API protege a chamada e as alocações em cancelamentos. O reagendamento verifica o horário proposto e conserva o registro anterior quando detecta conflito. |

## Pontos para avaliação da igreja

| Tema | Comportamento atual a avaliar |
| --- | --- |
| Congregações, ministérios e lideranças | Os vínculos são limitados à congregação. Os nomes e cargos oficiais, a hierarquia e as autoridades de cada cadastro estão em aberto. |
| Perfis e permissões | As permissões de leitura e gerenciamento são independentes. Na interface, um operador precisa de leitura para abrir o módulo e consultar as referências usadas no formulário. A matriz institucional está em aberto. |
| Recuperação administrativa | O operador gera código para outra conta. O procedimento excepcional para recuperar acesso quando só existe um administrador autorizado está em aberto. |
| Pessoas e menores | O sistema armazena marcações de autorização e o nome do responsável. Critérios obrigatórios, política de retenção e comprovação das autorizações estão em aberto. |
| Atividades e escalas | Presença, confirmação e escala são por série. Disponibilidade do voluntário, confirmação pela própria pessoa, participação por ocorrência e eventual inscrição pública estão em aberto. |
| Financeiro | Os registros são administrativos. Categorias oficiais, aprovações, fechamento, retenção e eventual necessidade de centros de custo separados estão em aberto. |
| Volume de uso | As listas e a apuração carregam os registros acessíveis ao perfil. A capacidade com volumes reais ainda precisa ser medida. |
| Operação e identidade | Regras de operação e backup, contas responsáveis e adoção do material visual oficial estão em aberto. |

## Evidência de execução

O [relatório de testes](RELATORIO_TESTES.md) registra o resultado da checagem de tipos, do build, dos testes unitários e dos cenários Playwright desta revisão. A verificação de navegação cobriu as áreas administrativas no Chromium, e os testes de alguns fluxos também conferiram os dados que permaneceram no PostgreSQL após recarregar. As regras sem um cenário funcional dedicado foram conferidas no código indicado em cada módulo.
