#!/bin/bash
# Deploy da implementação LGPD para vturapp
# Executa do terminal Mac

set -e
cd "$(dirname "$0")/.."
echo "📋 Aplicando migration LGPD no Supabase..."
npx supabase db push 2>/dev/null || \
  npx supabase migration up 2>/dev/null || \
  echo "ℹ️  Aplique manualmente: supabase/migrations/20261023000000_lgpd_infrastructure.sql"

echo "🚀 Push do vturapp..."
git push origin main

echo "✅ Deploy LGPD concluído!"
echo ""
echo "Próximos passos manuais:"
echo "  1. Acesse /privacidade no app para verificar a página pública"
echo "  2. Acesse /admin/lgpd para verificar o painel admin"
echo "  3. Atualize o Turnstile SITE_KEY no +page.svelte se necessário"
echo "  4. Configure o email do DPO (dpo@vtur.com.br) no DNS/email"
