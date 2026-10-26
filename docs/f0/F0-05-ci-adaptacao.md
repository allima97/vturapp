# F0-05 — Verificação do CI e adaptação para modo run

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**Dependência:** F0-01  

---

## Situação antes

### Scripts npm relevantes (antes)

```json
"test":         "vitest --dir src"           ← sem --run → não termina em CI
"check":        "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
```

**Problema P-CI-01:** `npm test` sem `--run` abre o modo watch do Vitest e nunca termina. Em qualquer pipeline CI (GitHub Actions, Cloudflare Pages CI, scripts locais automatizados), o processo ficaria preso indefinidamente.

### CI / pipeline externo

Nenhum arquivo de CI encontrado:
- Sem `.github/workflows/`
- Sem `.gitlab-ci.yml`
- Sem `Makefile`

O deploy atual é manual: `npm run cf:deploy` (build local + wrangler deploy).

---

## Mudanças aplicadas

### `package.json`

```diff
- "test":       "vitest --dir src"
+ "test":       "vitest --dir src --run"
+ "test:watch": "vitest --dir src"
```

- `npm test` agora termina (modo run)
- `npm run test:watch` preserva o modo interativo para desenvolvimento local

---

## Baseline de testes (estado atual)

| Grupo | Critério | Quantidade |
|---|---|---|
| `unit` | `*.test.ts` excluindo `*.dom.test.ts` | 94 arquivos |
| `dom` | `*.dom.test.ts` | 8 arquivos |
| **Total** | | **102 arquivos** |

### Dependências de Supabase em testes

Dois arquivos de teste importam diretamente tipos/clientes Supabase:

| Arquivo | Estratégia |
|---|---|
| `src/lib/server/vendasSave.test.ts` | Mock inline manual (`QueryMock`); não usa cliente real — portável |
| `src/lib/server/api/routes/crm/branding.contract.test.ts` | Usa `createFakeSupabase` + `vi.mock('$lib/server/v1', ...)` — precisa atualizar quando `v1.ts` for reescrito |

### Testes de conciliação (X02 — serão excluídos)

6 arquivos de teste pertencem ao módulo de conciliação:

```
src/lib/conciliacao/receiptNumber.test.ts
src/lib/conciliacao/importParser.test.ts
src/lib/conciliacao/facialRexturExtractor.test.ts
src/lib/conciliacao/business.test.ts
src/lib/server/api/routes/conciliacao/routing.test.ts
src/routes/(app)/financeiro/conciliacao/_components/formatters.test.ts
```

Esses arquivos serão **excluídos** junto com o módulo X02. Não representam dívida na reescrita.

---

## Workers test group (pendente — F1-05)

### Situação

`@cloudflare/vitest-pool-workers` **não está instalado**. O grupo `workers` no `vitest.workspace.ts` não foi adicionado ainda — seria inerte e quebraria a execução de testes.

### Quando adicionar

No início da fase F1, junto com a instalação de Drizzle + D1 bindings:

```bash
npm install --save-dev @cloudflare/vitest-pool-workers
```

### Configuração prevista para `vitest.workspace.ts`

```ts
// Terceiro grupo — adicionar em F1-05
{
  test: {
    name: 'workers',
    include: ['**/*.workers.test.ts'],
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' }
      }
    }
  }
}
```

Convenção de sufixo: `*.workers.test.ts` — exclusivo para testes que precisam de D1 binding real no Miniflare.

---

## Comandos de baseline

Para registrar o baseline de check/test/build antes de iniciar a reescrita, executar:

```bash
# 1. Type-check
npm run check

# 2. Testes (agora termina)
npm test

# 3. Build de produção
npm run cf:build
```

> Esses três comandos devem passar em verde antes de iniciar F1. Se algum falhar, registrar como pré-existente em F0-01 (problema P-xx).

---

## Aceite verificado

- [x] `npm test` adicionado `--run` — termina em CI
- [x] `test:watch` adicionado — modo interativo preservado
- [x] Baseline de 102 testes documentado (94 unit + 8 dom)
- [x] Sem CI externo — deploy ainda é manual via wrangler
- [x] Testes X02 identificados (6 arquivos — serão excluídos com o módulo)
- [x] Workers group documentado como pendente (F1-05) com configuração prevista
- [x] Dependências de Supabase em testes identificadas (2 arquivos, sem acesso a banco real)
