---
name: validar-modulo
description: Validar alterações do ICSV Gestão com banco de teste, testes automatizados e execução real dos fluxos.
---

1. Identifique o módulo afetado, as relações e os perfis que podem acessá-lo.
2. Use o banco isolado com dados fictícios e siga os comandos do README.
3. Execute verificações de tipos, testes unitários e o build. Execute os testes Playwright relacionados ao fluxo.
4. Confirme persistência após recarregar, erros de validação e limites de acesso pertinentes. Para fluxos alterados na interface, verifique a navegação em viewport desktop e móvel.
5. Corrija os defeitos reproduzíveis e reexecute as verificações afetadas. Registre as verificações aprovadas, falhas e lacunas no RELATORIO_TESTES.md.
