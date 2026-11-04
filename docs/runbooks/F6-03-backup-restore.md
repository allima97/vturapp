# F6-03 Runbook: Backup e Restauração (D1 + R2)

**Status:** APROVADO — F6  
**Última revisão:** 2024-11-01  
**Responsável:** Operador ou Admin  

---

## Visão Geral

| Armazenamento | Tecnologia | Mecanismo de backup |
|---|---|---|
| Banco de dados relacional | Cloudflare D1 | Time Travel (point-in-time) |
| Arquivos (anexos, logos) | Cloudflare R2 | Exportação via rclone |

---

## 1. D1 — Time Travel (Point-in-Time Recovery)

Cloudflare D1 mantém snapshots automáticos com retenção de **30 dias**.

### 1.1 Identificar ponto de restauração

```bash
wrangler d1 time-travel info <NOME_DO_BANCO> --account-id <CF_ACCOUNT_ID>
```

### 1.2 Exportar estado atual ANTES de restaurar

```bash
wrangler d1 export <NOME_DO_BANCO> \
  --output backup-$(date +%Y%m%d-%H%M%S).sql \
  --account-id <CF_ACCOUNT_ID>
```

### 1.3 Restaurar para ponto no tempo

```bash
# Por timestamp
wrangler d1 time-travel restore <NOME_DO_BANCO> \
  --timestamp 2024-10-30T12:00:00Z --account-id <CF_ACCOUNT_ID>

# Por bookmark
wrangler d1 time-travel restore <NOME_DO_BANCO> \
  --bookmark <BOOKMARK> --account-id <CF_ACCOUNT_ID>
```

> **ATENÇÃO:** Restauração é destrutiva. Sempre exporte antes (passo 1.2).

### 1.4 Verificar consistência após restauração

```bash
wrangler d1 execute <NOME_DO_BANCO> \
  --command "SELECT 'empresas' AS t, COUNT(*) n FROM empresas
             UNION ALL SELECT 'vendas', COUNT(*) FROM vendas
             UNION ALL SELECT 'clientes', COUNT(*) FROM clientes;" \
  --account-id <CF_ACCOUNT_ID>

# Verificar órfãos de tenant
wrangler d1 execute <NOME_DO_BANCO> \
  --command "SELECT COUNT(*) orfaos FROM vendas
             WHERE empresa_id NOT IN (SELECT id FROM empresas);" \
  --account-id <CF_ACCOUNT_ID>
```

---

## 2. R2 — Exportação e Restauração de Arquivos

### 2.1 Configurar rclone (uma vez)

```bash
rclone config
# Tipo: S3 → Cloudflare R2
# Endpoint: https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com
# Access Key / Secret: Manage R2 API Tokens
```

### 2.2 Exportar bucket

```bash
rclone sync r2:<NOME_DO_BUCKET> ./backup-r2-$(date +%Y%m%d) \
  --progress --transfers 20
```

### 2.3 Restaurar arquivo específico

```bash
rclone copy r2:<NOME_DO_BUCKET>-backup/<chave> r2:<NOME_DO_BUCKET> \
  --include "<chave>"
```

### 2.4 Verificar consistência D1 ↔ R2

```bash
# Exportar chaves R2
rclone lsf r2:<NOME_DO_BUCKET> --recursive > r2-keys.txt

# Exportar refs do D1
wrangler d1 execute <NOME_DO_BANCO> \
  --command "SELECT chave_r2 FROM anexos_clientes
             UNION ALL SELECT logo_r2 FROM empresas WHERE logo_r2 IS NOT NULL;" \
  --json > d1-refs.json

# Comparar
python3 -I - << 'PYEOF'
import json
r2 = set(l.strip() for l in open('r2-keys.txt') if l.strip())
refs = [r['chave_r2'] or r.get('logo_r2')
        for r in json.load(open('d1-refs.json')).get('results', [])]
d1 = set(r for r in refs if r)
orphans = d1 - r2
print(f"D1 refs: {len(d1)}  R2 objects: {len(r2)}  Orphans: {len(orphans)}")
for k in sorted(orphans): print(f"  MISSING: {k}")
PYEOF
```

---

## 3. Cenários de Incidente

### 3.1 Corrupção por bug de aplicação
1. Identificar janela do incidente via logs do Workers.
2. Exportar estado atual (passo 1.2).
3. Restaurar D1 ao snapshot anterior ao incidente.
4. Verificar consistência D1 ↔ R2 (passo 2.4).

### 3.2 Deleção acidental de tenant
1. Exportar estado atual.
2. Restaurar D1 para ponto anterior.
3. Extrair SQL do tenant afetado e aplicar cirurgicamente se preferir restauração parcial.

### 3.3 Indisponibilidade D1 (SLA 99.9%)
- App já retorna 503 automaticamente.
- Nenhuma ação de DBA — aguardar Cloudflare.

---

## 4. Verificação Mensal

- [ ] Exportação D1 para storage externo
- [ ] `rclone sync` R2 → backup
- [ ] Verificar consistência D1 ↔ R2
- [ ] Testar restauração em banco de dev
- [ ] Atualizar este runbook

---

## 5. Variáveis

| Variável | Onde obter |
|---|---|
| `CF_ACCOUNT_ID` | Dashboard Cloudflare → Account ID |
| `NOME_DO_BANCO` | `wrangler.toml` → `[[d1_databases]] database_name` |
| `NOME_DO_BUCKET` | `wrangler.toml` → `[[r2_buckets]] bucket_name` |
| `CF_R2_ACCESS_KEY_ID` | R2 → Manage R2 API Tokens |
| `CF_R2_SECRET_ACCESS_KEY` | R2 → Manage R2 API Tokens |
