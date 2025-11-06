(() => {
  const PANEL_SELECTORS = [
    '[data-purpose="transcript-panel"]',
    '[data-purpose="transcript-container"]',
    '.transcript--body--',
    '.ud-transcript',
    '.transcript--transcript-panel--JLceZ'
  ];

  const LINE_SELECTORS = [
    '[data-purpose="transcript-line"]',
    '[data-purpose="transcript-cue"]',
    '.transcript--line--',
    '.transcript-line',
    '.transcript--cue-container--Vuwj6'
  ];

  const CAPTION_SELECTORS = [
    '[data-purpose="transcript-captions"]',
    '[data-purpose="cue-text"]',
    '.transcript--captions--',
    '.caption'
  ];

  const TIMESTAMP_SELECTORS = [
    '[data-purpose="transcript-timestamp"]',
    '.transcript--time--',
    '.timestamp'
  ];

  const TRANSCRIPT_TOGGLE_SELECTORS = [
    '[data-purpose="transcript-toggle"]',
    '#transcript-toggle',
    '.control-bar-dropdown--trigger--FnmP-'
  ];

  const CURRICULUM_ITEM_SELECTORS = [
    '[data-purpose^="curriculum-item-"]',
    '.curriculum-item-link--curriculum-item--OVP5S',
    '.item-link--common--j8WLy'
  ];

  const CURRICULUM_ITEM_TITLE_SELECTORS = [
    '[data-purpose="item-title"]',
    '.curriculum-item-link--curriculum-item-title-content--S-urg',
    '.ud-focus-visible-target'
  ];

  const READY_EVENT = 'udemy-transcript-helper-ready';
  const AUTO_START_DELAY_MS = 7000;

  const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

  const waitForCondition = (condition, { timeout = 10000, interval = 200, observeTarget = document.body } = {}) =>
    new Promise((resolve) => {
      let settled = false;
      let observer = null;
      const end = Date.now() + timeout;

      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        if (observer) observer.disconnect();
        clearInterval(pollTimer);
        resolve(result ?? null);
      };

      const check = () => {
        if (settled) return;
        const result = condition();
        if (result) {
          cleanup(result);
          return;
        }

        if (Date.now() >= end) {
          cleanup(null);
        }
      };

      const pollTimer = setInterval(check, interval);

      if (observeTarget) {
        observer = new MutationObserver(check);
        observer.observe(observeTarget, { childList: true, subtree: true });
      }

      check();
    });

  const waitMs = (duration) =>
    new Promise((resolve) => {
      setTimeout(resolve, duration);
    });

  const csvEscape = (value) => {
    const text = value ?? '';
    if (text === null || text === undefined) return '';
    const normalized = String(text).replace(/\r?\n|\r/g, ' ');
    return /[",]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
  };

  const buildCsv = (rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

  const triggerDownload = (filename, content, mime = 'text/csv') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const parseTimestamp = (raw) => {
    if (!raw) return null;
    const parts = raw.trim().split(':').map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, value) => acc * 60 + value, 0);
  };

  const findTranscriptPanel = (root = document) =>
    PANEL_SELECTORS.map((selector) => root.querySelector(selector)).find(Boolean);

  const findTranscriptLines = (panel) => {
    if (!panel) return [];
    const selector = LINE_SELECTORS.find((lineSelector) => panel.querySelector(lineSelector));
    if (!selector) return [];
    return Array.from(panel.querySelectorAll(selector));
  };

  const extractLineData = (lineEl) => {
    if (!lineEl) return null;
    const captionEl = CAPTION_SELECTORS.map((selector) => lineEl.querySelector(selector)).find(Boolean);
    const timestampEl = TIMESTAMP_SELECTORS.map((selector) => lineEl.querySelector(selector)).find(Boolean);

    const text = cleanText(captionEl?.textContent ?? '');
    if (!text) return null;

    return {
      text,
      timestampSeconds: parseTimestamp(timestampEl?.textContent ?? '') ?? undefined,
      rawTimestamp: cleanText(timestampEl?.textContent ?? '') || undefined
    };
  };

  const extractTranscript = () => {
    const panel = findTranscriptPanel();
    const lines = findTranscriptLines(panel);
    const items = lines
      .map(extractLineData)
      .filter(Boolean);

    return {
      panelFound: Boolean(panel),
      lineCount: items.length,
      items
    };
  };

  const findTranscriptToggle = (root = document) =>
    TRANSCRIPT_TOGGLE_SELECTORS.map((selector) => root.querySelector(selector)).find(Boolean);

  const getCurriculumItemType = (element) => {
    const iconUse = element.querySelector('svg use');
    const hrefValue = iconUse?.getAttribute?.('href') || iconUse?.getAttribute?.('xlink:href') || '';
    const buttonLabelRaw = element.querySelector('button[aria-label]')?.getAttribute('aria-label') ?? '';
    const buttonLabel = buttonLabelRaw.toLowerCase();
    const titleTextRaw = element.querySelector('[data-purpose="item-title"]')?.textContent ?? '';
    const titleText = cleanText(titleTextRaw).toLowerCase();

    const hasVideoIcon = /icon-(video|play|movie)/i.test(hrefValue);
    const isVideoByLabel = /(play|播放|lecture|video|視|動画)/i.test(buttonLabelRaw);

    const isQuizByLabel = /(quiz|測驗|测试|測試)/i.test(buttonLabelRaw);
    const isQuizByTitle = /(quiz|測驗|测试|測試)/i.test(titleText);

    const isArticleIcon = /icon-(article|file-text|document)/i.test(hrefValue);
    const isExerciseIcon = /icon-(coding-exercise|coding|code)/i.test(hrefValue);

    if (hasVideoIcon || isVideoByLabel) return { type: 'video', hrefValue, buttonLabelRaw, titleTextRaw };
    if (isQuizByLabel || isQuizByTitle) return { type: 'quiz', hrefValue, buttonLabelRaw, titleTextRaw };
    if (isArticleIcon) return { type: 'article', hrefValue, buttonLabelRaw, titleTextRaw };
    if (isExerciseIcon) return { type: 'exercise', hrefValue, buttonLabelRaw, titleTextRaw };
    if (/article|閱讀|閱讀/.test(buttonLabel) || /article|閱讀|阅读/.test(titleText)) {
      return { type: 'article', hrefValue, buttonLabelRaw, titleTextRaw };
    }
    return { type: 'unknown', hrefValue, buttonLabelRaw, titleTextRaw };
  };

  const findCurriculumItems = () => {
    const selector = CURRICULUM_ITEM_SELECTORS.join(',');
    const elements = selector ? Array.from(document.querySelectorAll(selector)) : [];
    const uniqueItems = [];

    elements.forEach((element) => {
      const container = element.matches(CURRICULUM_ITEM_SELECTORS[0]) ? element : element.closest(CURRICULUM_ITEM_SELECTORS[0]);
      if (container && !uniqueItems.includes(container)) {
        uniqueItems.push(container);
      }
    });

    return uniqueItems.map((element, index) => {
      const titleEl = CURRICULUM_ITEM_TITLE_SELECTORS.map((sel) => element.querySelector(sel)).find(Boolean);
      const title = cleanText(titleEl?.textContent ?? `Video ${index + 1}`);
      const typeInfo = getCurriculumItemType(element);
      const type = typeInfo.type;
      const isVideo = type === 'video';

      console.info('Udemy Transcript Helper: curriculum item detected', {
        index,
        title,
        type,
        iconHref: typeInfo.hrefValue,
        ariaLabel: typeInfo.buttonLabelRaw
      });

      return { element, title, index, type, isVideo, meta: typeInfo };
    });
  };

  const ensureTranscriptPanelOpen = async () => {
    const existing = findTranscriptPanel();
    if (existing) return existing;

    const toggle =
      findTranscriptToggle() ||
      (await waitForCondition(() => findTranscriptToggle(), { timeout: 15000 }));

    if (!toggle) return null;

    toggle.click();
    return waitForCondition(() => findTranscriptPanel(), { timeout: 15000 });
  };

  const closeTranscriptPanel = async () => {
    const panel = findTranscriptPanel();
    if (!panel) return true;

    const toggle =
      findTranscriptToggle() ||
      (await waitForCondition(() => findTranscriptToggle(), { timeout: 15000 }));

    if (!toggle) return false;

    toggle.click();
    await waitForCondition(() => !findTranscriptPanel(), { timeout: 10000 });
    return true;
  };

  const recordSelection = (selection) => {
    if (!selection) return;
    if (window.udemyTranscriptHelper) {
      window.udemyTranscriptHelper.lastSelection = selection;
    }
    console.info('Udemy Transcript Helper selection', selection);
  };

  const waitForCurriculumItems = () =>
    waitForCondition(() => {
      const items = findCurriculumItems();
      return items.length ? items : null;
    }, { timeout: 15000 });

  const UI_CONTAINER_ID = 'udemy-transcript-helper-panel';
  const UI_STYLE_ID = 'udemy-transcript-helper-style';
  const UI_STYLES = `
    #${UI_CONTAINER_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      max-height: 70vh;
      background: rgba(15, 23, 42, 0.95);
      color: #fff;
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #${UI_CONTAINER_ID} * {
      box-sizing: border-box;
    }
    #${UI_CONTAINER_ID} .uth-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      font-weight: 600;
      font-size: 15px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    #${UI_CONTAINER_ID} .uth-close-btn {
      background: transparent;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
    }
    #${UI_CONTAINER_ID} .uth-body {
      padding: 12px 16px 16px;
      overflow-y: auto;
      flex: 1;
    }
    #${UI_CONTAINER_ID} .uth-description {
      margin: 0 0 8px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
    }
    #${UI_CONTAINER_ID} .uth-selection-count {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
    }
    #${UI_CONTAINER_ID} .uth-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    #${UI_CONTAINER_ID} .uth-actions button,
    #${UI_CONTAINER_ID} .uth-export-btn {
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    #${UI_CONTAINER_ID} .uth-export-btn {
      width: 100%;
      margin-top: 12px;
      background: #22c55e;
      color: #0f172a;
      font-weight: 600;
      font-size: 14px;
      padding: 10px 12px;
    }
    #${UI_CONTAINER_ID} .uth-export-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #${UI_CONTAINER_ID} .uth-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 40vh;
      overflow-y: auto;
      padding-right: 6px;
    }
    #${UI_CONTAINER_ID} .uth-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 8px 6px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      cursor: pointer;
    }
    #${UI_CONTAINER_ID} .uth-item input[type="checkbox"] {
      margin-top: 4px;
    }
    #${UI_CONTAINER_ID} .uth-item-title {
      font-size: 13px;
      line-height: 1.4;
    }
  `;

  const uiState = {
    container: null,
    items: [],
    selectedIndexes: new Set(),
    selectionCountEl: null
  };

  const ensureUiStyles = () => {
    if (document.getElementById(UI_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = UI_STYLE_ID;
    style.textContent = UI_STYLES;
    document.head.appendChild(style);
  };

  const removeSelectionPanel = () => {
    const existing = document.getElementById(UI_CONTAINER_ID);
    if (existing) existing.remove();
    uiState.container = null;
  };

  const updateSelectionCount = () => {
    if (!uiState.selectionCountEl) return;
    const total = uiState.items.length;
    uiState.selectionCountEl.textContent = total
      ? `${uiState.selectedIndexes.size} of ${total} video lectures selected`
      : 'No video lectures detected';
  };

  const setAllSelected = (shouldSelect) => {
    if (shouldSelect) {
      uiState.selectedIndexes = new Set(uiState.items.map((item) => item.index));
    } else {
      uiState.selectedIndexes.clear();
    }

    if (uiState.container) {
      uiState.container.querySelectorAll('input[data-item-index]').forEach((checkbox) => {
        checkbox.checked = shouldSelect;
      });
    }

    updateSelectionCount();
  };

  const onCheckboxChange = (event) => {
    const checkbox = event.currentTarget;
    const idx = Number.parseInt(checkbox.dataset.itemIndex ?? '', 10);
    if (Number.isNaN(idx)) return;
    if (checkbox.checked) {
      uiState.selectedIndexes.add(idx);
    } else {
      uiState.selectedIndexes.delete(idx);
    }
    updateSelectionCount();
  };

  const createListItem = (item) => {
    const label = document.createElement('label');
    label.className = 'uth-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = uiState.selectedIndexes.has(item.index);
    checkbox.dataset.itemIndex = String(item.index);
    checkbox.addEventListener('change', onCheckboxChange);

    const title = document.createElement('span');
    title.className = 'uth-item-title';
    title.textContent = `${item.index + 1}. ${item.title}`;

    label.appendChild(checkbox);
    label.appendChild(title);
    return label;
  };

  const getSelectedItems = () =>
    uiState.items.filter((item) => uiState.selectedIndexes.has(item.index));

  const handleExportClick = async () => {
    const selectedItems = getSelectedItems();
    if (!selectedItems.length) {
      window.alert('Select at least one lecture before exporting transcripts.');
      return;
    }

    const selection = {
      totalAvailable: uiState.items.length,
      items: selectedItems
    };

    recordSelection(selection);
    try {
      await exportSelectionToCsv(selection);
    } catch (error) {
      console.error('Udemy Transcript Helper: export failed', error);
    }
  };

  const renderSelectionPanel = (items) => {
    ensureUiStyles();
    removeSelectionPanel();

    const videoItems = items.filter((item) => item.isVideo);
    const nonVideoItems = items.filter((item) => !item.isVideo);
    uiState.items = videoItems;
    uiState.selectedIndexes = new Set(videoItems.map((item) => item.index));

    console.info('Udemy Transcript Helper: panel summary', {
      totalItems: items.length,
      videoCount: videoItems.length,
      nonVideoCount: nonVideoItems.length
    });
    if (!videoItems.length) {
      console.warn('Udemy Transcript Helper: no video lectures recognised. Check debug logs for item metadata.');
    }

    const panel = document.createElement('div');
    panel.id = UI_CONTAINER_ID;

    const header = document.createElement('div');
    header.className = 'uth-header';

    const heading = document.createElement('span');
    heading.textContent = 'Transcript Helper';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'uth-close-btn';
    closeBtn.setAttribute('aria-label', 'Close Transcript Helper');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', removeSelectionPanel);

    header.appendChild(heading);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'uth-body';

    const description = document.createElement('p');
    description.className = 'uth-description';
    description.textContent = 'Check the lectures you want transcripts for, then export as CSV.';

    const summary = document.createElement('p');
    summary.className = 'uth-description';
    summary.textContent = `Detected ${items.length} lectures (${videoItems.length} video, ${nonVideoItems.length} non-video).`;

    const selectionCount = document.createElement('div');
    selectionCount.className = 'uth-selection-count';
    uiState.selectionCountEl = selectionCount;

    const actions = document.createElement('div');
    actions.className = 'uth-actions';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = 'Select all';
    selectAllBtn.addEventListener('click', () => setAllSelected(true));

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => setAllSelected(false));

    actions.appendChild(selectAllBtn);
    actions.appendChild(clearBtn);

    const list = document.createElement('div');
    list.className = 'uth-list';

    if (videoItems.length) {
      videoItems.forEach((item) => list.appendChild(createListItem(item)));
    } else {
      const emptyState = document.createElement('p');
      emptyState.className = 'uth-description';
      emptyState.textContent = 'No playable lectures detected in this section.';
      list.appendChild(emptyState);
    }

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'uth-export-btn';
    exportBtn.textContent = 'Export selected to CSV';
    exportBtn.disabled = videoItems.length === 0;
    exportBtn.addEventListener('click', handleExportClick);

    body.appendChild(description);
    body.appendChild(summary);
    body.appendChild(selectionCount);
    body.appendChild(actions);
    body.appendChild(list);
    body.appendChild(exportBtn);

    panel.appendChild(header);
    panel.appendChild(body);

    document.body.appendChild(panel);
    uiState.container = panel;
    updateSelectionCount();

    console.info(`Udemy Transcript Helper: ${items.length} lectures detected.`);
  };

  const showSelectionPanel = async () => {
    const existingItems = findCurriculumItems();
    if (existingItems.length) {
      renderSelectionPanel(existingItems);
      return existingItems.length;
    }

    const awaitedItems = await waitForCurriculumItems();
    if (awaitedItems?.length) {
      renderSelectionPanel(awaitedItems);
      return awaitedItems.length;
    }

    console.warn('Udemy Transcript Helper: curriculum list not detected.');
    return 0;
  };

  const startAutomationFlow = async () => {
    await showSelectionPanel();
  };

  const ensureCurriculumElementClickable = (item) => {
    if (!item?.element?.isConnected) {
      const refreshedItems = findCurriculumItems();
      const refreshed = refreshedItems.find((candidate) => candidate.index === item?.index && candidate.title === item?.title);
      return refreshed?.element ?? null;
    }
    return item.element;
  };

  const collectTranscriptForItem = async (item, videoNumber) => {
    const element = ensureCurriculumElementClickable(item);
    if (!element) {
      console.warn(`Udemy Transcript Helper: curriculum item ${videoNumber} missing from DOM.`);
      return null;
    }

    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    element.click();
    await waitMs(2500);
    const panel = await ensureTranscriptPanelOpen();
    if (!panel) {
      console.warn(`Udemy Transcript Helper: transcript panel not available for video ${videoNumber}.`);
      return null;
    }

    const lines = await waitForCondition(() => {
      const transcriptLines = findTranscriptLines(panel);
      return transcriptLines.length ? transcriptLines : null;
    }, { timeout: 15000, observeTarget: panel });

    if (!lines) {
      console.warn(`Udemy Transcript Helper: transcript lines not detected for video ${videoNumber}.`);
      return null;
    }

    return extractTranscript();
  };

  const collectTranscriptsForSelection = async (selection) => {
    const rows = [];
    for (let idx = 0; idx < selection.items.length; idx += 1) {
      const item = selection.items[idx];
      const videoNumber = (item.index ?? idx) + 1;
      const transcript = await collectTranscriptForItem(item, videoNumber);
      await closeTranscriptPanel();
      if (!transcript?.items?.length) continue;

      transcript.items.forEach((line, lineIndex) => {
        rows.push([
          videoNumber,
          item.title,
          lineIndex + 1,
          line.timestampSeconds ?? '',
          line.rawTimestamp ?? '',
          line.text
        ]);
      });
    }
    return rows;
  };

  let exportInProgress = false;

  const exportSelectionToCsv = async (selectionOverride) => {
    if (exportInProgress) {
      console.info('Udemy Transcript Helper: export already running.');
      return null;
    }

    exportInProgress = true;
    try {
      let selection = selectionOverride || window.udemyTranscriptHelper?.lastSelection;
      if (!selection) {
        console.warn('Udemy Transcript Helper: no selection available. Use the helper panel to pick lectures.');
        return null;
      }

      const rows = await collectTranscriptsForSelection(selection);
      if (!rows.length) {
        console.warn('Udemy Transcript Helper: no transcript rows collected.');
        return null;
      }

      const header = ['Video Number', 'Video Title', 'Line Number', 'Timestamp (s)', 'Timestamp Raw', 'Caption'];
      const csv = buildCsv([header, ...rows]);
      const filename = `udemy-transcripts-${Date.now()}.csv`;
      triggerDownload(filename, csv);
      console.info(`Udemy Transcript Helper: exported ${rows.length} transcript lines to ${filename}.`);
      return { filename, rowCount: rows.length, selection };
    } finally {
      exportInProgress = false;
    }
  };


  const exposeHelpers = () => {
    const helpers = {
      extractTranscript,
      findTranscriptPanel,
      findTranscriptLines,
      findTranscriptToggle,
      findCurriculumItems,
      ensureTranscriptPanelOpen,
      closeTranscriptPanel,
      exportSelectionToCsv,
      showSelectionPanel
    };

    window.udemyTranscriptHelper = helpers;
    document.dispatchEvent(new CustomEvent(READY_EVENT, { detail: helpers }));

    setTimeout(() => {
      startAutomationFlow();
    }, AUTO_START_DELAY_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exposeHelpers, { once: true });
  } else {
    exposeHelpers();
  }
})();
