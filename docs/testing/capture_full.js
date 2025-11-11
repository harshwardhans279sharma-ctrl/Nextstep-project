// Enhanced automated screenshot capture for NextStep using Playwright
// node docs/testing/capture_full.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const IMGS = path.resolve(__dirname, 'images');

const EMAIL = 'harshwardhans279sharma@gmail.com';
const PASSWORD = 'Har@20050927';

async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }

async function screenshot(page, file, opts={}) {
  const p = path.join(IMGS, file);
  await page.screenshot({ path: p, fullPage: true, ...opts });
  console.log('Saved', p);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.race([
    page.click('button:has-text("Sign In")').catch(()=>{}),
    page.click('button:has-text("Login")').catch(()=>{}),
    page.click('button:has-text("Log In")').catch(()=>{}),
    page.click('button[type="submit"]').catch(()=>{}),
  ]);
  // Wait until a dashboard-specific selector appears
  await Promise.race([
    page.waitForSelector('text=Aptitude Test', { timeout: 20000 }),
    page.waitForURL('**/dashboard', { timeout: 20000 })
  ]).catch(()=>{});
}

async function logout(page) {
  const btn = await page.$('text=Logout');
  if (btn) { await btn.click().catch(()=>{}); await page.waitForLoadState('networkidle').catch(()=>{}); return; }
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

async function fetchJSONInApp(page, url, method='GET', body=null) {
  return await page.evaluate(async ({ url, method, body }) => {
    const token = localStorage.getItem('id_token') || '';
    const demo_uid = localStorage.getItem('demo_uid') || '';
    const demo_email = localStorage.getItem('demo_email') || '';
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(demo_uid ? { 'X-Demo-UID': demo_uid } : {}),
        ...(demo_email ? { 'X-Demo-Email': demo_email } : {}),
      },
      body: body ? JSON.stringify(body) : null,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
  }, { url, method, body });
}

async function renderJSONOnNewPage(context, title, payload, filename) {
  const p = await context.newPage();
  await p.setContent(`<!doctype html><meta charset=utf-8><title>${title}</title>
  <style>body{font-family:Arial;margin:24px;} pre{background:#f7f7f7;border:1px solid #eee;padding:12px;white-space:pre-wrap;}</style>
  <h2>${title}</h2><pre>${payload}</pre>`);
  await screenshot(p, filename);
  await p.close();
}

async function answerSomeQuestions(page, count = 10) {
  const radios = await page.$$('input[type="radio"]');
  for (let i = 0; i < radios.length && i < count; i++) {
    await radios[i].check().catch(()=>{});
  }
}

(async () => {
  await ensureDir(IMGS);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await screenshot(page, 'test_fig_01_registration.png');

  await login(page);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Dashboard', { timeout: 15000 }).catch(()=>{});
  await screenshot(page, 'test_fig_03_dashboard_requires_test.png');

  // Profile to decide class
  const profile = await fetchJSONInApp(page, '/api/profile');
  const cls = String(profile?.json?.student_class || '10');
  const questions = await fetchJSONInApp(page, `/api/questions?class=${cls}`);
  await renderJSONOnNewPage(context, `GET /api/questions?class=${cls} (${questions.status})`, JSON.stringify(questions.json, null, 2), 'test_fig_04_questions_api.png');

  await page.goto(`${BASE}/aptitude`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Aptitude Test', { timeout: 15000 }).catch(()=>{});
  await answerSomeQuestions(page, 12);
  await screenshot(page, 'test_fig_05_aptitude_ui.png');

  const submitBtn = await page.$('button:has-text("Submit")')
                  || await page.$('button:has-text("Finish")')
                  || await page.$('button:has-text("Submit Test")');
  if (submitBtn) {
    await submitBtn.click().catch(()=>{});
    await page.waitForLoadState('networkidle').catch(()=>{});
    await page.waitForTimeout(800);
  }

  const dashJSON = await fetchJSONInApp(page, '/api/dashboard');
  await renderJSONOnNewPage(context, `GET /api/dashboard (${dashJSON.status}) – after submit`, JSON.stringify(dashJSON.json, null, 2), 'test_fig_06_submit_response.png');

  await page.evaluate(() => {
    const id = 'e_app_data_updated_banner';
    window.addEventListener('app:data:updated', () => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; document.body.prepend(el); }
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e6ffed;border-bottom:1px solid #b7eb8f;color:#135200;padding:8px;text-align:center;font:14px Arial;z-index:9999;';
      el.textContent = 'app:data:updated event received';
    }, { once: true });
  });
  await screenshot(page, 'test_fig_11_app_data_updated_event.png');

  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('text=Aptitude Test', { timeout: 15000 }).catch(()=>{});
  await screenshot(page, 'test_fig_07_dashboard_after_test.png');

  await page.goto(`${BASE}/skill-gap`);
  await page.waitForSelector('text=Skill Gap', { timeout: 15000 }).catch(()=>{});
  await screenshot(page, 'test_fig_08_skill_gap_humanities.png');

  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('text=Explore Careers', { timeout: 15000 }).catch(()=>{});
  await screenshot(page, 'test_fig_09_career_paths_cta.png');

  await page.goto(`${BASE}/simulations`);
  await page.waitForSelector('text=Simulations', { timeout: 15000 }).catch(()=>{});
  await screenshot(page, 'test_fig_10_simulations_score.png');

  await logout(page);
  await page.goto(`${BASE}/aptitude`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Registration Required', { timeout: 8000 }).catch(()=>{});
  await screenshot(page, 'test_fig_02_redirect_register.png');

  await login(page);
  const clear = await fetchJSONInApp(page, '/api/admin/clear-all-data', 'POST');
  await renderJSONOnNewPage(context, `POST /api/admin/clear-all-data (${clear.status})`, JSON.stringify(clear.json, null, 2), 'test_fig_12_clear_all_data.png');

  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle').catch(()=>{});
  await screenshot(page, 'test_fig_13_dashboard_fresh.png');

  await browser.close();
})();
