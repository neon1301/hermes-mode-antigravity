# 🎭 Playwright E2E Testing Patterns & Hardening

*Adapted from `testdino-hq/playwright-skill` under the MIT License.*

---

## 1. Page Object Model (POM) Architecture

Organize tests by pages and components to isolate locator changes:

```typescript
import { type Page, type Locator, expect } from '@playwright/test';

export class DeviceControlPage {
  readonly page: Page;
  readonly deviceTable: Locator;
  readonly connectButton: Locator;
  readonly statusBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.deviceTable = page.locator('[data-testid="device-table"]');
    this.connectButton = page.getByRole('button', { name: 'Подключиться' });
    this.statusBadge = page.locator('[data-testid="connection-status"]');
  }

  async goto() {
    await this.page.goto('/devices');
  }

  async connectToDevice(deviceId: string) {
    const row = this.deviceTable.locator(`tr[data-id="${deviceId}"]`);
    await row.getByRole('button', { name: 'Выбрать' }).click();
    await this.connectButton.click();
    await expect(this.statusBadge).toHaveText('Подключено', { timeout: 5000 });
  }
}
```

---

## 2. Resilient Locators & Auto-Waiting

### Locator Hierarchy Priority
1. **User-Facing Roles**: `page.getByRole('button', { name: '...' })`, `page.getByLabel('...')`
2. **Semantic Test IDs**: `page.getByTestId('machine-telemetry-stream')`
3. **Text Selectors**: `page.getByText('...')`
4. ❌ **Banned**: Fragile XPath (`//div[2]/table/tbody/tr[3]/td[1]`) or CSS class chains (`.MuiButton-root.css-123`).

### Auto-Waiting Invariant
Never use arbitrary timeouts like `page.waitForTimeout(1000)`. Always rely on Playwright's web-first assertions:

```typescript
// ❌ WRONG: Flaky race condition
await page.waitForTimeout(2000);
expect(await page.locator('.status').textContent()).toBe('OK');

// ✅ CORRECT: Auto-retrying assertion with built-in poll
await expect(page.locator('.status')).toHaveText('OK', { timeout: 5000 });
```

---

## 3. Network Idle & Request Interception

```typescript
// Wait for specific backend telemetry or API response before asserting UI state
const responsePromise = page.waitForResponse(
  (response) => response.url().includes('/api/v1/telemetry') && response.status() === 200
);
await page.getByRole('button', { name: 'Обновить данные' }).click();
await responsePromise;
```

---

## 4. Flaky Test Elimination & Trace Inspection

- **Isolated State**: Every test must run in a clean browser context; never share mutable state across tests.
- **Trace Viewer**: Enable traces on first retry:
  ```typescript
  // playwright.config.ts
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  }
  ```
