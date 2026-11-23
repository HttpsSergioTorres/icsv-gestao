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
