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

Abra `http://localhost:3000`. Para uma base local de demonstração, use `admin@icsv.example` ou `secretaria@icsv.example` com a senha fictícia `ICSV-demo-2026!`. As duas contas têm permissões diferentes. Use o seed apenas com dados fictícios.

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
npm run dev -- --hostname 127.0.0.1 --port 3101
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

Para executar um build local: `npm run build`, seguido de `npm run start`. A sessão exige HTTPS por padrão no modo de produção. Para um teste isolado servido por HTTP, defina `SESSION_COOKIE_SECURE=false` exclusivamente nesse processo.

## Organização

- `src/lib/domain/` contém contratos de cadastro, validação e eventos recorrentes.
- `src/lib/server/` contém autenticação, autorização, persistência e indicadores.
- `src/app/` e `src/components/` contêm rotas, APIs e interface.
- `db/migrations/` e `scripts/` contêm migrações e dados de demonstração.
- `tests/` contém testes unitários Vitest e testes de ponta a ponta Playwright.
- `.codex/agents/` e `.agents/skills/` contêm orientações reutilizáveis para agentes do Codex.

Acompanhe o [roadmap](ROADMAP.md), o [estado dos módulos](STATUS_DESENVOLVIMENTO.md), as [decisões técnicas](DECISOES_TECNICAS.md) e as [pendências institucionais](PENDENCIAS_NEGOCIO.md).
