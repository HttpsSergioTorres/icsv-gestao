# Evolução do ICSV Gestão

A interface usa azul-escuro e o ícone oficial enviado pela ICSV na tela de entrada, na marca do menu e do cabeçalho móvel e na aba do navegador. O Tutorial usa um mascote de farol criado para acompanhar os guias.

## Acesso e perfis

1. O administrador abre **Usuários → Novo registro**, informa nome, e-mail e senha inicial e marca um ou mais perfis oferecidos na sede **ICSV San Vale**. Para o treinamento, vincula a conta à pessoa cadastrada na equipe do ministério.
2. Após o login, a pessoa vê apenas as opções atribuídas e vigentes. A escolha é explícita. Quando não há uma atribuição disponível, a tela orienta a procurar a administração.
3. Em **Trocar perfil**, a pessoa escolhe outro dos seus acessos. Os direitos em uso são os do perfil selecionado, no escopo atribuído. O servidor consulta a atribuição e as permissões vigentes em cada operação.

Novas atribuições no formulário usam a sede. Os registros e acessos de campo ou congregação já existentes foram preservados. Administração de usuários, administração financeira, moderação, voluntariado e Kids têm permissões próprias.

## Financeiro

O perfil financeiro vê **Cadastros**, **Prestação de contas**, **Extratos e saldos bancários**, **CAEB**, **Missões**, **Campo**, **Relatórios** e **Painel financeiro**. Os saldos simulados são derivados das contas e dos lançamentos vinculados. O usuário comum pode consultar o resumo, os totais por categoria e os resultados mensais dentro do seu escopo. A consulta não entrega dados de conta bancária, extratos, descrições de lançamentos ou comprovantes.

A classificação CAEB, Missões ou Campo é manual em **Prestação de contas**. O módulo usa movimentos reais do banco da aplicação e contas de demonstração. Critérios oficiais de classificação, repasses, aprovadores, período de fechamento e prestação de contas dependem da ICSV.

## Kids

1. Na área **Vínculos Kids**, a administração gera um convite de uso único para uma criança já cadastrada e entrega o código ao responsável por um canal controlado.
2. Um responsável que já tem conta inicia a solicitação em **Meus vínculos Kids**. Um responsável externo pode criar uma conta pela tela de login e usar o perfil **Responsável Kids**.
3. A administração confirma o vínculo em sua congregação. O responsável aceita o termo aplicável em sua própria conta. O sistema registra identidade, versão e data do aceite.
4. O perfil **Kids** fica disponível após a confirmação e o aceite vigente. Ele mostra histórias bíblicas ilustradas, referências às passagens e um jogo de perguntas. Se o vínculo for revogado ou o termo perder a vigência, o acesso é reavaliado.

A conta externa tem acesso aos próprios vínculos e ao Kids habilitado. O perfil de responsável, usado para gestão do vínculo, fica restrito a essa finalidade. Os murais infantis ficam no perfil Kids.

O texto oficial do termo não veio nos anexos. A demonstração exige `ICSV_KIDS_DEMO=true` e banco local. Para ativar o fluxo institucional, configure um termo aprovado em `ICSV_KIDS_TERMO_VERSAO` e `ICSV_KIDS_TERMO_TEXTO`. O aceite fictício usa versão própria e não libera o acesso após a troca para o termo oficial. A ICSV precisa validar o texto, o processo de comprovação de responsabilidade e as regras de retenção dos dados.

## Mural, oração e Tutorial

A administração publica avisos por público. Os perfis internos usam o mural e os pedidos na página inicial, incluindo Tutorial e Kids. O perfil Kids recebe conteúdo para a audiência infantil. Um pedido começa **Pendente**, visível para o autor e a moderação autorizada. A moderação aprova ou rejeita. O mural publica somente pedidos aprovados, com autoria suprimida na resposta pública quando o autor escolheu **Anônimo**. O formulário informa que a moderação autorizada pode consultar a autoria.

O **Tutorial do Sistema** explica como trocar de perfil, consultar avisos e fazer pedidos de oração. Os guias e atalhos seguem os acessos da conta.

## Treinamentos

Um responsável com permissão de gestão cria cursos para o ministério, configura aulas de texto ou com link de vídeo gravado, questionário e nota mínima. A pessoa vinculada à equipe ativa do ministério acompanha as aulas e entrega o questionário. O servidor persiste a entrega e calcula a nota. A mesma entrega reenviada não consome outra tentativa. Depois de três reprovações, o curso permanece não concluído. A aprovação encerra as tentativas. O certificado é emitido ao atingir a nota e completar as aulas obrigatórias e pode ser impresso.

As aulas, a nota e o certificado da carga são fictícios. Os materiais oficiais de treinamento, o responsável pela validação do conteúdo infantil e eventual assinatura institucional dos certificados ainda precisam ser definidos pela ICSV.

## Execução e resultados

Use o [README](README.md) para carregar a demonstração no computador e escolher as contas de teste. Consulte o [relatório de testes](RELATORIO_TESTES.md) para os resultados executados com PostgreSQL e Chromium.
