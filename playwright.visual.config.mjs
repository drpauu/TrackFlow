/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests/visual',
  timeout: 180_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npm run dev --workspace frontend -- --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177',
    timeout: 180_000,
    reuseExistingServer: true,
  },
};

export default config;
