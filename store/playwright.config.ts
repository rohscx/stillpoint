import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.spec.ts',
  outputDir: '../test-results/store-screenshots',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'python3 -m http.server 4173',
    // webServer defaults its cwd to the config's directory; the fixtures and dist/ live
    // at the repo root, so serve from there.
    cwd: '..',
    port: 4173,
    reuseExistingServer: true,
  },
});
