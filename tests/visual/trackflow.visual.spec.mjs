import fs from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

const OUT_DIR = path.join(process.cwd(), 'qa', 'visual');

const COACH_SEED_USER = {
  id: 'coach',
  name: 'JuanCarlos',
  role: 'coach',
  password: '151346',
};

function sanitize(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function clickNav(page, label) {
  const desktopNav = page.locator('.sidebar .nav-item', { hasText: label });
  if (await desktopNav.first().isVisible().catch(() => false)) {
    await desktopNav.first().click();
    return true;
  }

  const mobileTab = page.locator('.mobile-tab-btn', { hasText: label });
  if (await mobileTab.first().isVisible().catch(() => false)) {
    await mobileTab.first().click();
    return true;
  }

  const menuBtn = page.locator('.mobile-menu-btn');
  if (await menuBtn.isVisible().catch(() => false)) {
    await menuBtn.click();
    const mobileMenuItem = page.locator('.mobile-menu-item', { hasText: label });
    if (await mobileMenuItem.first().isVisible().catch(() => false)) {
      await mobileMenuItem.first().click();
      return true;
    }
  }

  return false;
}

async function logout(page) {
  const desktop = page.locator('.nav-item-danger');
  if (await desktop.first().isVisible().catch(() => false)) {
    await desktop.first().click();
    return;
  }
  const mobile = page.locator('.mobile-logout');
  if (await mobile.first().isVisible().catch(() => false)) {
    await mobile.first().click();
    return;
  }
}

async function loginAthlete(page, name = 'Nuria', password = '1234') {
  await page.getByPlaceholder('Nombre del atleta').fill(name);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await expect(page.locator('.app-wrap')).toBeVisible();
}

async function seedCoachSession(page) {
  await page.evaluate((payload) => {
    window.localStorage.setItem('tf_user', JSON.stringify(payload));
  }, COACH_SEED_USER);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app-wrap')).toBeVisible();
}

async function collectMetrics(page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const docWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0);
    const horizontalOverflow = Math.max(0, docWidth - window.innerWidth);
    const hasTopbar = !!document.querySelector('.mobile-topbar') && getComputedStyle(document.querySelector('.mobile-topbar')).display !== 'none';
    const hasTabbar = !!document.querySelector('.mobile-tabbar') && getComputedStyle(document.querySelector('.mobile-tabbar')).display !== 'none';

    const touchCandidates = Array.from(document.querySelectorAll('button, .btn, .mobile-tab-btn, .mobile-menu-btn, .mobile-logout'));
    const touchViolationsList = touchCandidates
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
          text: String(el.textContent || '').trim().slice(0, 40),
          className: String(el.className || '').trim(),
          tag: el.tagName.toLowerCase(),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0)
      .filter((item) => item.width < 44 || item.height < 44);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow,
      hasTopbar,
      hasTabbar,
      touchViolations: touchViolationsList.length,
      touchViolationsList: touchViolationsList.slice(0, 20),
    };
  });
}

async function capture(page, viewportName, screenName, metricsLog) {
  await page.waitForTimeout(450);
  const metrics = await collectMetrics(page);
  const key = `${viewportName}:${screenName}`;
  metricsLog[key] = metrics;

  const file = path.join(OUT_DIR, `${sanitize(viewportName)}-${sanitize(screenName)}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

test.beforeAll(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
});

for (const viewport of VIEWPORTS) {
  test(`QA visual ${viewport.name}`, async ({ page }) => {
    const metricsLog = {};
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.login-wrap')).toBeVisible();
    await capture(page, viewport.name, 'login', metricsLog);

    await loginAthlete(page);
    await capture(page, viewport.name, 'athlete-hoy', metricsLog);

    await clickNav(page, 'Semana');
    await capture(page, viewport.name, 'athlete-semana', metricsLog);

    await clickNav(page, 'Calendario');
    await capture(page, viewport.name, 'athlete-calendario', metricsLog);

    try {
      await seedCoachSession(page);
      await capture(page, viewport.name, 'coach-semana', metricsLog);

      await clickNav(page, 'Calendario');
      await capture(page, viewport.name, 'coach-calendario', metricsLog);
    } catch (error) {
      metricsLog[`${viewport.name}:coach-seed-error`] = {
        error: String(error?.message || error),
      };
    } finally {
      await logout(page);
    }

    const metricsFile = path.join(OUT_DIR, `${sanitize(viewport.name)}-metrics.json`);
    await fs.writeFile(metricsFile, JSON.stringify(metricsLog, null, 2), 'utf8');
  });
}

