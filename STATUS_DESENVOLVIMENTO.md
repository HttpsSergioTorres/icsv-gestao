# Estado de desenvolvimento

A primeira versão local foi implementada a partir do briefing do ICSV Gestão. A base usa exclusivamente dados fictícios nos testes e na demonstração. As evidências de execução estão no [relatório de testes](RELATORIO_TESTES.md).

| Módulo | Implementação disponível |
| --- | --- |
| 1. Estrutura e dashboard | Navegação responsiva, estados da interface, indicadores obtidos do PostgreSQL e próximos eventos a partir da agenda. |
| 2. Usuários e perfis | Login, logout, código de recuperação, cadastro administrativo, perfis configuráveis, permissões e escopo de congregação. |
| 3. Congregações | Cadastro, edição, ativação e desativação, CNPJ opcional, associação de lideranças e acesso às listas de membros e ministérios. |
| 4. Pessoas | Cadastro central para membros, visitantes, lideranças e voluntários, busca, situação, vínculos, autorizações, histórico e CSV. |
| 5. Ministérios | Ministérios e departamentos editáveis, líderes, equipes e situação. |
| 6. Agenda e eventos | Calendário mensal e semanal, filtros, recorrência, situação das atividades, inscrições e presença. |
| 7. Escalas | Tipos de serviço, escala por evento e ministério, consulta por pessoa, confirmação, conflito, substituição e histórico dos registros. |
| 8. Financeiro | Receitas e despesas por congregação, categorias, eventos, comprovantes, resumo por período, consolidação e CSV. |
| 9. Projetos e tarefas | Projetos e tarefas associados, responsáveis, prazos, vínculos com atividades, situação e progresso. |
| 10. Relatórios | Indicadores administrativos consolidados, filtros por congregação e período e exportação CSV. |

## Limites da primeira versão

- A recuperação de acesso depende de uma conta administrativa autorizada para emitir e entregar o código.
- O escopo local de uma conta corresponde a uma congregação. As permissões iniciais são propostas configuráveis.
- As inscrições, confirmações e escalas de uma série referenciam a atividade-base. A edição por ocorrência pode ser avaliada após a definição do processo institucional.
- A integração Supabase ainda depende de configuração e validação. A execução verificada usa PostgreSQL local.
- O ambiente de produção e o workflow remoto do GitHub Actions ainda não foram exercitados.
