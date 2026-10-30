// F3-04 — validação do upload de anexo pela UI com Playwright (Chromium próprio).
// Uso: node scripts/f3-04/upload-ui.playwright.mjs
// Requer servidor local em 127.0.0.1:8787 (wrangler.local.toml) e usuário sintético
// já criado e vinculado à empresa Alfa (ver docs/f3/F3-04-validacao-integrada.md).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = process.env.F3_BASE_URL ?? 'http://127.0.0.1:8787';
const email = process.env.F3_EMAIL ?? 'f3-04-navegador@alfa-viagens.test';
const password = process.env.F3_PASSWORD ?? 'F3navegador-2026!';
const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(here, 'f3-04-upload-navegador.pdf');
const pdfBytes = readFileSync(pdfPath);

const metrics = {};
const mark = (label, start) => {
  metrics[label] = Math.round(performance.now() - start);
};

const executablePath = process.env.CHROMIUM_PATH; // opcional: apontar para um headless shell já presente no cache
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

try {
  let t0 = performance.now();
  await page.goto(`${base}/reescrita/login`, { waitUntil: 'domcontentloaded' });
  mark('login_page_ms', t0);
  // Aguarda a hidratação do Svelte antes de interagir com o formulário
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.fill('#reescrita-login-email', email);
  await page.fill('#reescrita-login-password', password);
  t0 = performance.now();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/reescrita/clientes', { timeout: 30000 });
  mark('sign_in_ate_listagem_ms', t0);

  const row = page.getByText('Cliente F3 Navegador', { exact: true });
  await row.first().waitFor({ state: 'visible', timeout: 30000 });
  t0 = performance.now();
  await row.first().click();
  await page.locator('#detail-title').waitFor({ state: 'visible' });
  mark('abrir_detalhe_ms', t0);

  // Upload pelo input de arquivo do formulário (setInputFiles dispara o change handler)
  const input = page.locator('input[type="file"]');
  t0 = performance.now();
  await input.setInputFiles(pdfPath);
  const item = page.locator('.reescrita-attachments li', { hasText: 'f3-04-upload-navegador.pdf' });
  await item.waitFor({ state: 'visible', timeout: 30000 });
  mark('upload_ate_listar_ms', t0);

  const listaTexto = await item.innerText();
  console.log('Anexo exibido na UI:', listaTexto.replace(/\s+/g, ' ').trim());

  // Download pelo botão "Baixar" da própria UI
  t0 = performance.now();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    item.getByRole('button', { name: 'Baixar' }).click()
  ]);
  const baixadoPath = join(here, 'f3-04-upload-navegador.baixado.pdf');
  await download.saveAs(baixadoPath);
  mark('download_ms', t0);

  const baixado = readFileSync(baixadoPath);
  const iguais = baixado.equals(pdfBytes);
  console.log('Download:', download.suggestedFilename(), baixado.length, 'bytes; conteúdo idêntico ao enviado:', iguais);
  if (!iguais) {
    writeFileSync(join(here, 'f3-04-result.json'), JSON.stringify({ ok: false, metrics }, null, 2));
    process.exitCode = 1;
  } else {
    console.log('Métricas (ms):', JSON.stringify(metrics));
    writeFileSync(join(here, 'f3-04-result.json'), JSON.stringify({ ok: true, metrics, bytes: pdfBytes.length }, null, 2));
  }
} finally {
  await browser.close();
}
