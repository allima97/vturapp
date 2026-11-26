#!/usr/bin/env bash
# Publica a correção da IA dos roteiros + biblioteca de dias (migration 0037) em staging e produção.
# Rodar na pasta do projeto:  bash publicar-ia.sh
set -euo pipefail
cd "$(dirname "$0")"
pergunta() { read -r -p "$1 [s/N] " r; [[ "$r" =~ ^[sS]$ ]]; }

npx wrangler whoami
echo "== Staging: migrations + deploy =="
npm run d1:migrate:staging
npm run cf:deploy:staging
pergunta "Staging publicado. Gerou um roteiro de teste no staging e quer publicar em PRODUÇÃO?" || { echo "Produção não publicada."; exit 0; }
echo "== Produção: migrations + deploy =="
npm run d1:migrate:prod
npm run cf:deploy
echo "Pronto."
rm -- "$0"
