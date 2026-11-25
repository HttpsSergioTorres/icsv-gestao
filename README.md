# ICSV Gestão

Plataforma administrativa da Igreja de Cristo no Brasil, Campo San Vale, para gerir congregações, pessoas, ministérios, atividades, escalas, finanças e projetos.

## Executar localmente

Pré-requisitos: Node.js 24 LTS, npm e Docker com Compose V2. No diretório do repositório:

```bash
npm ci
cp .env.example .env.local
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000/login`, entre e selecione explicitamente o perfil.

### Demonstração no Windows

Se já tem a cópia em `C:\Projetos\icsv-gestao`, pare o servidor antigo e execute no PowerShell com o Docker Desktop aberto:

```powershell
cd C:\Projetos\icsv-gestao
git pull
docker compose up -d --wait
npm run db:migrate
npm run db:seed
$env:ICSV_KIDS_DEMO = 'true'
npm run dev -- --hostname 127.0.0.1 --port 3107
```

Abra `http://127.0.0.1:3107/login`. Use somente bases com dados fictícios para a carga e para o termo Kids de demonstração. No Bash use `ICSV_KIDS_DEMO=true npm run dev` para a mesma opção.

### Contas fictícias

A senha de demonstração é `ICSV-demo-2026!` para todas as contas desta lista. Escolha o perfil indicado depois de entrar.

| Conta | Perfis e caminhos |
| --- | --- |
| `admin@icsv.example` | Administração geral, gestão de usuários na sede, avisos, moderação e confirmação de vínculos Kids. |
| `secretaria@icsv.example` | Secretaria da ICSV San Vale, com os cadastros e a agenda previstos para a função. |
| `financeiro@icsv.example` | Financeiro com as oito seções, e Tutorial do Sistema. |
| `comum@icsv.example` | Usuário comum com consulta financeira, Tutorial e Kids com vínculo e aceite fictícios. |
| `voluntario@icsv.example` | Voluntário vinculado ao ministério de Recepção, com cursos e certificado de exemplo. Também tem Tutorial. |
| `moderador@icsv.example` | Moderação de avisos e pedidos de oração, e Tutorial. |
| `responsavel@icsv.example` | Responsável externo com gestão dos próprios vínculos e acesso Kids fictício. |

Consulte o [guia de demonstração e decisões pendentes](EVOLUCAO_ICSV.md).

Para encerrar, pare o servidor com Ctrl+C e execute `docker compose stop`. O volume local mantém os registros.

## Testes e build

```bash
npm run typecheck
npm test
npm run build
```

Execute os testes de ponta a ponta com um servidor e banco isolados. Os testes criam dados fictícios e exercitam alterações nos cadastros.

Em um terminal, prepare e execute a instância de teste:

```bash
ICSV_POSTGRES_PORT=55434 docker compose -p icsv-e2e up -d --wait
export DATABASE_URL=postgresql://icsv:icsv_local@127.0.0.1:55434/icsv
npm run db:migrate
npm run db:seed
ICSV_KIDS_DEMO=true npm run dev -- --hostname 127.0.0.1 --port 3101
```

Em outro terminal, no mesmo diretório:

```bash
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:e2e
```

Se o ambiente fornecer Chromium, passe o caminho no parâmetro `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Consulte o [relatório de testes](RELATORIO_TESTES.md) para os resultados executados e o workflow em `.github/workflows/ci.yml` para a configuração da CI.

## Ambientes e dados

O exemplo de ambiente usa a instância local de PostgreSQL 17. Para usar outro PostgreSQL, configure `DATABASE_URL` com as credenciais fornecidas pelo serviço e o TLS aplicável. Prefira uma conexão direta ou de pool em modo sessão ao executar migrações. Com Supabase, a integração prevista é pela conexão PostgreSQL. O fluxo atual usa autenticação e anexos próprios no banco.

A emissão de código de recuperação é feita por um administrador autorizado na tela de usuários. O administrador entrega o código por um canal seguro, e o usuário define a nova senha em **Recuperar meu acesso**. O código é de uso único e expira em 30 minutos.

Quem já está autenticado pode acessar **Minha conta** no menu do perfil e informar a senha atual para alterá-la. A troca encerra as sessões da conta em todos os dispositivos e invalida códigos de recuperação pendentes.

### Primeira conta em uma base sem dados de demonstração

Com Node.js 24, configure `DATABASE_URL` para a base autorizada e execute `npm run db:migrate`. Depois, no Bash, crie a primeira conta administrativa sem digitar a senha no comando:

```bash
if IFS= read -rsp 'Senha inicial: ' senha_icsv; then
  printf '\n'
  printf '%s\n' "$senha_icsv" | npm run db:criar-admin -- --nome "Nome do administrador" --email "administrador@exemplo.com"
fi
unset senha_icsv
```

O comando exige uma base que ainda não tenha usuários e grava a senha como hash. O seed é reservado a demonstração e testes.

Para executar um build local: `npm run build`, seguido de `npm run start`. A sessão exige HTTPS por padrão no modo de produção. Para um teste isolado servido por HTTP, defina `SESSION_COOKIE_SECURE=false` exclusivamente nesse processo.

## Chamada de atividades

Abra **Registrar presenças** na agenda ou na lista de atividades. Marque somente as pessoas que deseja atualizar, revise a seleção e confirme o lote. A chamada vale para a série inteira em atividades recorrentes. Inscrições canceladas são mantidas para consulta.

## Organização

- `src/lib/domain/` contém contratos de cadastro, validação e eventos recorrentes.
- `src/lib/server/` contém autenticação, autorização, persistência e indicadores.
- `src/app/` e `src/components/` contêm rotas, APIs e interface.
- `db/migrations/` e `scripts/` contêm migrações e dados de demonstração.
- `tests/` contém testes unitários Vitest e testes de ponta a ponta Playwright.
- `.codex/agents/` e `.agents/skills/` contêm orientações reutilizáveis para agentes do Codex.

Acompanhe o [roadmap](ROADMAP.md), o [estado dos módulos](STATUS_DESENVOLVIMENTO.md), as [decisões técnicas](DECISOES_TECNICAS.md) e as [pendências institucionais](PENDENCIAS_NEGOCIO.md).

O [guia dos fluxos atuais](FLUXOS_ICSV.md) descreve como usar cada módulo e quais decisões ainda precisam de validação pela igreja.
