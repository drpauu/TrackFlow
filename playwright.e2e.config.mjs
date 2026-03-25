/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4176',
    headless: true,
    viewport: { width: 1366, height: 768 },
  },
  webServer: [
    {
      command: 'npm run start --workspace server',
      url: 'http://127.0.0.1:8787/api/health',
      timeout: 180_000,
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev --workspace frontend -- --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      timeout: 180_000,
      reuseExistingServer: true,
    },
  ],
};

export default config;
