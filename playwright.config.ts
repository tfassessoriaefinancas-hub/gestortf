import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome .app/Contents/MacOS/Google Chrome',
    ].find(existsSync) },
  },
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LOCAL_AUTH_ENABLED: 'true',
      LOCAL_DATA_DIR: mkdtempSync(join(tmpdir(), 'tf-browser-test-')),
      LOCAL_USER_ID: 'local-test-owner',
      LOCAL_USER_EMAIL: 'admin@example.com',
      LOCAL_USER_NAME: 'Teste local',
    },
  },
});
