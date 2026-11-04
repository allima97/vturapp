#!/usr/bin/env node
/**
 * Confere variaveis locais de autenticacao e banco.
 * Execute: node check-env.cjs
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.dev.vars');
console.log('Verificando configuracao local...\n');

if (!fs.existsSync(envPath)) {
  console.error('Arquivo .dev.vars nao encontrado.');
  console.log('Copie .dev.vars.example para .dev.vars e preencha BETTER_AUTH_SECRET.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const secret = envContent.match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret || secret.includes('gere-com')) {
  console.log('BETTER_AUTH_SECRET: defina um segredo de pelo menos 32 caracteres.');
  process.exit(1);
}

console.log('BETTER_AUTH_SECRET: presente.');
console.log('Banco e arquivos usam os bindings D1 e R2 do wrangler.');
