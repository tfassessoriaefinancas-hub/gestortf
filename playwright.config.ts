import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if(existsSync('.env.local'))process.loadEnvFile('.env.local');
process.env.TF_TEST_SCHEMA??=`tf_test_${randomBytes(8).toString('hex')}`;
process.env.DATABASE_SCHEMA=process.env.TF_TEST_SCHEMA;

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/setup.ts',
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
      DATABASE_URL: process.env.DATABASE_URL!,
      DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
      LOCAL_AUTH_ENABLED: 'false',
      LOCAL_USER_ID: 'local-test-owner',
      LOCAL_USER_EMAIL: 'admin@example.com',
      LOCAL_USER_NAME: 'Teste local',
    },
  },
});
