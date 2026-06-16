---
name: chrome-extension-dom-debugging
description: Debugging DOM selector issues and host permission matches in Chrome Extensions. Use when a content script fails to load on subdomains (e.g., segi.udemy.com), when selectors conflict with player/navigation controls, or when icons are misidentified.
---

# Chrome Extension DOM & Selector Debugging

A systematic workflow to debug Chrome Extensions when content scripts fail to load, selectors mismatch, or UI/DOM data extraction goes wrong.

## 1. Trigger Conditions
Use this skill when:
- A Chrome Extension's content script does not run or inject on a corporate subdomain (e.g., `segi.udemy.com`).
- Selected UI elements or checklists return the wrong element count (e.g., matching player panels or pagination controls instead of curriculum lists).
- Script queries retrieve tick or checkmark icons instead of format/media icons.
- You need to test extension script logic using Playwright/DevTools on live or mock pages.

---

## 2. Check Host Permissions & Matches
If the extension is not injecting on a page:
1. Open the [manifest.json](file:///path/to/manifest.json) of the extension.
2. Verify if the `host_permissions` and `content_scripts.matches` cover the exact subdomain the user is browsing.
3. **Best Practice**: Prefer wildcard subdomains (e.g., `https://*.udemy.com/*` instead of `https://www.udemy.com/*`) to automatically support corporate domains and prevent login or regional redirects from breaking injection.
4. **Activation Step**: Instruct the user that Chrome requires manual reloading:
   - Go to `chrome://extensions`.
   - Click the circular **Reload** icon on the extension card.
   - **Refresh** the target web tab.

---

## 3. Troubleshoot DOM Selector Collisions
If elements are mismatched or counted incorrectly, use these strategies:

### A. Exclude Non-Target Prefix Matches
Attribute prefix matching (e.g., `[data-purpose^="curriculum-item-"]`) is greedy. It can match wrapper panels (like `curriculum-item-viewer-content`) that are not actual list items.
- **Fix**: Apply a `:not()` selector to exclude non-targets:
  ```css
  [data-purpose^="curriculum-item-"]:not([data-purpose="curriculum-item-viewer-content"])
  ```

### B. Scope Under Container Wrappers
Avoid page-wide class queries which can match global header/footer links or player navigation buttons (e.g., `.item-link--common--j8WLy` matching previous/next buttons).
- **Fix**: Scope the selectors under the unique section container wrapper (e.g., `[data-purpose="curriculum-section-container"]`):
  ```css
  [data-purpose="curriculum-section-container"] .item-link--common--j8WLy
  ```

### C. Bypass Tick/Progress Icons
When extracting item media formats, `querySelector('svg use')` returns the first `<use>` element inside the item. This is often the progress toggle checkbox checkmark (`#icon-tick` / `#icon-checked`) rather than the format icon (e.g., `#icon-video` / `#icon-article`).
- **Fix**: Iterate through all `use` elements and bypass progress checkmarks:
  ```js
  const iconUses = Array.from(element.querySelectorAll('svg use'));
  let hrefValue = '';
  for (const use of iconUses) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    if (href && href !== '#icon-tick' && href !== '#icon-checked') {
      hrefValue = href;
      break;
    }
  }
  ```

---

## 4. Live Verification Workflow
When checking selectors and logic on a live authenticated site:
1. Run Playwright scripts via `browser_run_code_unsafe` to inspect the page.
2. Always wrap navigation, waiting, and evaluation in the same execution context to maintain the login session:
   ```js
   async (page) => {
     await page.goto('https://target-domain.com/...');
     await page.waitForTimeout(5000); // Allow dynamic contents to load
     return await page.evaluate(() => {
       // Test your DOM selector logic here
     });
   }
   ```
3. Take a screenshot `page.screenshot({ path: './screenshot_live.png' })` to visually verify element states (e.g., checking if sidebars are open or if error prompts are shown).
