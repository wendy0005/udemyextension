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
    '[data-purpose="curriculum-section-container"] [data-purpose^="curriculum-item-"]',
    '[data-purpose="curriculum-section-container"] .curriculum-item-link--curriculum-item--OVP5S',
    '[data-purpose="curriculum-section-container"] .item-link--common--j8WLy',
    '[data-purpose^="curriculum-item-"]:not([data-purpose="curriculum-item-viewer-content"])',
    '.curriculum-item-link--curriculum-item--OVP5S',
    '.item-link--common--j8WLy:not([data-purpose^="go-to-"])'
  ];

  const CURRICULUM_ITEM_TITLE_SELECTORS = [
    '[data-purpose="item-title"]',
    '.curriculum-item-link--curriculum-item-title-content--S-urg',
    '.ud-focus-visible-target'
  ];

  const READY_EVENT = 'udemy-transcript-helper-ready';
  const AUTO_START_DELAY_MS = 7000;
  const COURSE_TITLE_SELECTORS = [
    'h1[data-purpose="lead-title"]',
    '.udlite-heading-xl',
    '.course-title',
    '[data-purpose="course-title"]'
  ];

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

  const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

  const getCourseTitle = () => {
    const el = COURSE_TITLE_SELECTORS.map((selector) => document.querySelector(selector)).find(Boolean);
    const text = cleanText(el?.textContent ?? document.title ?? '');
    if (text) return text;
    return 'Udemy Course';
  };

  const sanitizeFilename = (input, fallback = 'udemy-transcripts') => {
    const candidate = cleanText(input).replace(/[\\/:*?"<>|]+/g, '').trim();
    return candidate || fallback;
  };

  const triggerDownload = (filename, content, mime = 'text/plain') => {
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
    const iconUses = Array.from(element.querySelectorAll('svg use'));
    let hrefValue = '';
    for (const use of iconUses) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      if (href && href !== '#icon-tick' && href !== '#icon-checked') {
        hrefValue = href;
        break;
      }
    }
    const buttonLabelRaw = element.querySelector('button[aria-label]')?.getAttribute('aria-label') ?? '';
    const buttonLabel = buttonLabelRaw.toLowerCase();
    const titleEl = CURRICULUM_ITEM_TITLE_SELECTORS.map((sel) => element.querySelector(sel)).find(Boolean);
    const titleTextRaw = titleEl?.textContent ?? '';
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
    const sections = Array.from(document.querySelectorAll('[data-purpose^="section-panel-"]'));
    if (!sections.length) {
      const activeSelector = CURRICULUM_ITEM_SELECTORS.find((selector) => document.querySelector(selector));
      if (!activeSelector) return [];
      const elements = Array.from(document.querySelectorAll(activeSelector));
      return elements.map((element, index) => {
        const titleEl = CURRICULUM_ITEM_TITLE_SELECTORS.map((sel) => element.querySelector(sel)).find(Boolean);
        const title = cleanText(titleEl?.textContent ?? `Video ${index + 1}`);
        const typeInfo = getCurriculumItemType(element);
        const type = typeInfo.type;
        const isVideo = type === 'video';
        return {
          element,
          title,
          index,
          type,
          isVideo,
          sectionTitle: 'Course Content',
          sectionIndex: 0,
          meta: typeInfo
        };
      });
    }

    const allItems = [];
    let absoluteIndex = 0;

    sections.forEach((sec, secIdx) => {
      const sectionTitleEl = sec.querySelector('button[aria-expanded], [class*="section-title"]');
      const sectionTitle = sectionTitleEl ? cleanText(sectionTitleEl.textContent) : `Section ${secIdx + 1}`;
      
      const activeSelector = CURRICULUM_ITEM_SELECTORS.find((selector) => sec.querySelector(selector));
      const rawElements = activeSelector ? Array.from(sec.querySelectorAll(activeSelector)) : [];
      
      const uniqueElements = [];
      const seenKeys = new Set();
      
      rawElements.forEach(el => {
        const purpose = el.getAttribute('data-purpose') || '';
        const titleEl = CURRICULUM_ITEM_TITLE_SELECTORS.map((sel) => el.querySelector(sel)).find(Boolean);
        const title = cleanText(titleEl?.textContent ?? '');
        const key = purpose || title;
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueElements.push(el);
        }
      });

      uniqueElements.forEach((element) => {
        const titleEl = CURRICULUM_ITEM_TITLE_SELECTORS.map((sel) => element.querySelector(sel)).find(Boolean);
        const title = cleanText(titleEl?.textContent ?? `Video ${absoluteIndex + 1}`);
        const typeInfo = getCurriculumItemType(element);
        const type = typeInfo.type;
        const isVideo = type === 'video';

        allItems.push({
          element,
          title,
          index: absoluteIndex,
          type,
          isVideo,
          sectionTitle,
          sectionIndex: secIdx,
          meta: typeInfo
        });
        absoluteIndex += 1;
      });
    });

    return allItems;
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
      cursor: move;
      user-select: none;
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
    #${UI_CONTAINER_ID} .uth-progress {
      display: none;
      flex-direction: column;
      gap: 6px;
      margin: 12px 0;
    }
    #${UI_CONTAINER_ID} .uth-progress-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    }
    #${UI_CONTAINER_ID} .uth-progress-track {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.15);
      overflow: hidden;
    }
    #${UI_CONTAINER_ID} .uth-progress-fill {
      height: 100%;
      width: 0%;
      background: #22c55e;
      transition: width 0.2s ease;
    }
    #${UI_CONTAINER_ID} .uth-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 40vh;
      overflow-y: auto;
      padding-right: 6px;
    }
    #${UI_CONTAINER_ID} .uth-section-header {
      padding: 8px 4px 4px;
      margin-top: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    #${UI_CONTAINER_ID} .uth-section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      color: #38bdf8;
    }
    #${UI_CONTAINER_ID} .uth-section-checkbox {
      margin: 0;
      cursor: pointer;
    }
    #${UI_CONTAINER_ID} .uth-section-title {
      line-height: 1.4;
    }
    #${UI_CONTAINER_ID} .uth-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 6px 6px 6px 20px;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
    }
    #${UI_CONTAINER_ID} .uth-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    #${UI_CONTAINER_ID} .uth-item input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
    }
    #${UI_CONTAINER_ID} .uth-item-title {
      font-size: 13px;
      line-height: 1.4;
    }
  `;

  const STORAGE_KEY_SELECTION = 'uth.selection';

  const uiState = {
    container: null,
    items: [],
    selectedIndexes: new Set(),
    selectionCountEl: null,
    toggleAllBtn: null,
    exportBtn: null,
    progressContainer: null,
    progressFill: null,
    progressLabel: null,
    exporting: false,
    skippedList: null,
    drag: {
      active: false,
      offsetX: 0,
      offsetY: 0
    }
  };

  const storage = chrome?.storage?.local
    ? {
        get: (key) =>
          new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => resolve(result?.[key]));
          }),
        set: (obj) =>
          new Promise((resolve) => {
            chrome.storage.local.set(obj, resolve);
          })
      }
    : null;

  const persistSelection = () => {
    if (!storage) return;
    const indexes = Array.from(uiState.selectedIndexes);
    storage.set({ [STORAGE_KEY_SELECTION]: indexes });
  };

  const hydrateSelectionFromStorage = () => {
    if (!storage) {
      updateSelectionCount();
      updateSectionCheckboxes();
      return;
    }
    storage.get(STORAGE_KEY_SELECTION).then((stored) => {
      if (!Array.isArray(stored) || !stored.length) {
        updateSelectionCount();
        updateSectionCheckboxes();
        return;
      }
      const validIndexes = stored.filter((idx) => uiState.items.some((item) => item.index === idx));
      if (!validIndexes.length) {
        updateSelectionCount();
        updateSectionCheckboxes();
        return;
      }

      uiState.selectedIndexes = new Set(validIndexes);
      if (uiState.container) {
        uiState.container.querySelectorAll('input[data-item-index]').forEach((checkbox) => {
          const idx = Number.parseInt(checkbox.dataset.itemIndex ?? '', 10);
          // eslint-disable-next-line no-param-reassign
          checkbox.checked = uiState.selectedIndexes.has(idx);
        });
      }
      updateSelectionCount();
      updateSectionCheckboxes();
    });
  };

  const updateExportButtonState = () => {
    if (!uiState.exportBtn) return;
    if (uiState.exporting) {
      uiState.exportBtn.disabled = true;
      uiState.exportBtn.textContent = 'Exporting...';
      return;
    }

    const hasSelection = uiState.selectedIndexes.size > 0;
    uiState.exportBtn.disabled = !hasSelection;
    uiState.exportBtn.textContent = 'Export selected to TXT';
  };

  const updateProgressLabel = (currentIndex, total, title) => {
    if (!uiState.progressLabel) return;
    if (!total) {
      uiState.progressLabel.textContent = 'Preparing transcript export...';
      return;
    }
    const safeTitle = title || 'Untitled lecture';
    uiState.progressLabel.textContent = `Processing video ${currentIndex} of ${total}: ${safeTitle}`;
  };

  const updateProgressValue = (completed, total) => {
    if (!uiState.progressFill) return;
    const percent = total ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
    uiState.progressFill.style.width = `${percent}%`;
  };

  const beginExportUi = (totalVideos) => {
    uiState.exporting = true;
    updateExportButtonState();
    if (uiState.progressContainer) {
      uiState.progressContainer.style.display = 'flex';
      updateProgressValue(0, totalVideos);
      if (totalVideos > 0) {
        updateProgressLabel(1, totalVideos, 'Preparing...');
      } else {
        updateProgressLabel(0, 0, 'Preparing transcript export...');
      }
    }
  };

  const completeExportUi = () => {
    uiState.exporting = false;
    if (uiState.progressContainer) {
      uiState.progressContainer.style.display = 'none';
      updateProgressValue(0, 1);
    }
    updateExportButtonState();
  };

  const resetSkippedList = () => {
    if (!uiState.skippedList) return;
    uiState.skippedList.header.style.display = 'none';
    uiState.skippedList.list.style.display = 'none';
    uiState.skippedList.list.innerHTML = '';
  };

  const addSkippedLecture = ({ videoNumber, title, reason }) => {
    if (!uiState.skippedList) return;
    const item = document.createElement('li');
    item.textContent = `Video ${videoNumber}: ${title} (${reason})`;
    uiState.skippedList.list.appendChild(item);
    uiState.skippedList.header.style.display = '';
    uiState.skippedList.list.style.display = '';
  };

  const onDragMove = (event) => {
    if (!uiState.drag.active || !uiState.container) return;
    const { offsetX, offsetY } = uiState.drag;
    const width = uiState.container.offsetWidth;
    const height = uiState.container.offsetHeight;
    const left = clampValue(event.clientX - offsetX, 0, window.innerWidth - width);
    const top = clampValue(event.clientY - offsetY, 0, window.innerHeight - height);
    uiState.container.style.left = `${left}px`;
    uiState.container.style.top = `${top}px`;
  };

  const endDrag = () => {
    if (!uiState.drag.active) return;
    uiState.drag.active = false;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', endDrag);
  };

  const startDrag = (event) => {
    if (!uiState.container) return;
    event.preventDefault();
    const rect = uiState.container.getBoundingClientRect();
    uiState.drag.active = true;
    uiState.drag.offsetX = event.clientX - rect.left;
    uiState.drag.offsetY = event.clientY - rect.top;
    uiState.container.style.right = 'auto';
    uiState.container.style.bottom = 'auto';
    uiState.container.style.left = `${rect.left}px`;
    uiState.container.style.top = `${rect.top}px`;
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', endDrag);
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
    endDrag();
    uiState.container = null;
    uiState.selectionCountEl = null;
    uiState.toggleAllBtn = null;
    uiState.exportBtn = null;
    uiState.progressContainer = null;
    uiState.progressFill = null;
    uiState.progressLabel = null;
    uiState.skippedList = null;
  };

  const updateSectionCheckboxes = () => {
    if (!uiState.container) return;
    const sections = Array.from(uiState.container.querySelectorAll('.uth-section-header'));
    sections.forEach((secHeader) => {
      const sectionCheckbox = secHeader.querySelector('.uth-section-checkbox');
      if (!sectionCheckbox) return;
      
      const itemCheckboxes = [];
      let sibling = secHeader.nextElementSibling;
      while (sibling && !sibling.classList.contains('uth-section-header')) {
        const cb = sibling.querySelector('input[type="checkbox"]');
        if (cb) itemCheckboxes.push(cb);
        sibling = sibling.nextElementSibling;
      }
      
      if (itemCheckboxes.length) {
        const allChecked = itemCheckboxes.every(cb => cb.checked);
        const someChecked = itemCheckboxes.some(cb => cb.checked);
        sectionCheckbox.checked = allChecked;
        sectionCheckbox.indeterminate = someChecked && !allChecked;
      }
    });
  };

  const updateSelectionCount = () => {
    if (!uiState.selectionCountEl) return;
    const total = uiState.items.length;
    uiState.selectionCountEl.textContent = total
      ? `${uiState.selectedIndexes.size} of ${total} video lectures selected`
      : 'No video lectures detected';
    if (uiState.toggleAllBtn) {
      const allSelected = total > 0 && uiState.selectedIndexes.size === total;
      uiState.toggleAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
    }
    updateExportButtonState();
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
    persistSelection();
    updateSectionCheckboxes();
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
    persistSelection();
    updateSectionCheckboxes();
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
    beginExportUi(selection.items.length);
    resetSkippedList();
    const progressOptions = {
      onVideoStart: ({ index, total, item }) => {
        updateProgressLabel(index + 1, total, item.title);
        updateProgressValue(index, total);
      },
      onVideoComplete: ({ index, total }) => {
        updateProgressValue(index + 1, total);
      }
    };
    try {
      await exportSelectionToText(selection, progressOptions);
    } catch (error) {
      console.error('Udemy Transcript Helper: export failed', error);
    } finally {
      completeExportUi();
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
    header.addEventListener('mousedown', startDrag);

    const body = document.createElement('div');
    body.className = 'uth-body';

    const description = document.createElement('p');
    description.className = 'uth-description';
    description.textContent = 'Check the lectures you want transcripts for, then export as TXT.';

    const summary = document.createElement('p');
    summary.className = 'uth-description';
    summary.textContent = `Detected ${items.length} lectures (${videoItems.length} video, ${nonVideoItems.length} non-video).`;

    const selectionCount = document.createElement('div');
    selectionCount.className = 'uth-selection-count';
    uiState.selectionCountEl = selectionCount;

    const actions = document.createElement('div');
    actions.className = 'uth-actions';

    const toggleAllBtn = document.createElement('button');
    toggleAllBtn.type = 'button';
    toggleAllBtn.textContent = 'Select all';
    toggleAllBtn.addEventListener('click', () => {
      const allSelected = uiState.items.length > 0 && uiState.selectedIndexes.size === uiState.items.length;
      setAllSelected(!allSelected);
    });
    uiState.toggleAllBtn = toggleAllBtn;

    actions.appendChild(toggleAllBtn);

    const list = document.createElement('div');
    list.className = 'uth-list';

    if (videoItems.length) {
      const sectionsMap = new Map();
      videoItems.forEach((item) => {
        const secIdx = item.sectionIndex ?? 0;
        const secTitle = item.sectionTitle ?? 'Course Content';
        if (!sectionsMap.has(secIdx)) {
          sectionsMap.set(secIdx, { title: secTitle, items: [] });
        }
        sectionsMap.get(secIdx).items.push(item);
      });

      const sortedSections = Array.from(sectionsMap.entries()).sort((a, b) => a[0] - b[0]);
      sortedSections.forEach(([secIdx, secData]) => {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'uth-section-header';

        const sectionLabel = document.createElement('label');
        sectionLabel.className = 'uth-section-label';

        const sectionCheckbox = document.createElement('input');
        sectionCheckbox.type = 'checkbox';
        sectionCheckbox.className = 'uth-section-checkbox';

        const sectionItemIndexes = secData.items.map((i) => i.index);
        const allChecked = sectionItemIndexes.every((idx) => uiState.selectedIndexes.has(idx));
        const someChecked = sectionItemIndexes.some((idx) => uiState.selectedIndexes.has(idx));

        sectionCheckbox.checked = allChecked;
        sectionCheckbox.indeterminate = someChecked && !allChecked;

        sectionCheckbox.addEventListener('change', (e) => {
          const checked = e.currentTarget.checked;
          sectionItemIndexes.forEach((idx) => {
            if (checked) {
              uiState.selectedIndexes.add(idx);
            } else {
              uiState.selectedIndexes.delete(idx);
            }
            const itemCheckbox = panel.querySelector(`input[data-item-index="${idx}"]`);
            if (itemCheckbox) itemCheckbox.checked = checked;
          });
          updateSelectionCount();
          persistSelection();
          updateSectionCheckboxes();
        });

        const sectionTitleSpan = document.createElement('span');
        sectionTitleSpan.className = 'uth-section-title';
        sectionTitleSpan.textContent = secData.title;

        sectionLabel.appendChild(sectionCheckbox);
        sectionLabel.appendChild(sectionTitleSpan);
        sectionHeader.appendChild(sectionLabel);
        list.appendChild(sectionHeader);

        secData.items.forEach((item) => {
          list.appendChild(createListItem(item));
        });
      });
    } else {
      const emptyState = document.createElement('p');
      emptyState.className = 'uth-description';
      emptyState.textContent = 'No playable lectures detected.';
      list.appendChild(emptyState);
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'uth-progress';

    const progressLabel = document.createElement('div');
    progressLabel.className = 'uth-progress-label';
    progressLabel.textContent = 'Preparing transcript export...';

    const progressTrack = document.createElement('div');
    progressTrack.className = 'uth-progress-track';

    const progressFill = document.createElement('div');
    progressFill.className = 'uth-progress-fill';
    progressTrack.appendChild(progressFill);

    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressTrack);

    uiState.progressContainer = progressContainer;
    uiState.progressLabel = progressLabel;
    uiState.progressFill = progressFill;

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'uth-export-btn';
    exportBtn.textContent = 'Export selected to TXT';
    exportBtn.addEventListener('click', handleExportClick);
    uiState.exportBtn = exportBtn;

    const skippedHeader = document.createElement('p');
    skippedHeader.className = 'uth-description';
    skippedHeader.textContent = 'Skipped lectures:';
    skippedHeader.style.display = 'none';

    const skippedList = document.createElement('ul');
    skippedList.style.listStyle = 'disc';
    skippedList.style.paddingLeft = '18px';
    skippedList.style.fontSize = '12px';
    skippedList.style.color = 'rgba(255, 255, 255, 0.8)';
    skippedList.style.margin = '8px 0 0';
    skippedList.style.display = 'none';
    uiState.skippedList = { header: skippedHeader, list: skippedList };

    body.appendChild(description);
    body.appendChild(summary);
    body.appendChild(selectionCount);
    body.appendChild(actions);
    body.appendChild(list);
    body.appendChild(progressContainer);
    body.appendChild(skippedHeader);
    body.appendChild(skippedList);
    body.appendChild(exportBtn);

    panel.appendChild(header);
    panel.appendChild(body);

    document.body.appendChild(panel);
    uiState.container = panel;
    updateSelectionCount();
    hydrateSelectionFromStorage();

    console.info(`Udemy Transcript Helper: ${items.length} lectures detected.`);
  };

  const expandAllSections = async () => {
    const maxSections = 100;
    for (let i = 0; i < maxSections; i++) {
      const sec = document.querySelector(`[data-purpose="section-panel-${i}"]`);
      if (!sec) {
        break;
      }
      
      const toggle = sec.querySelector('button[aria-expanded]');
      if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
        toggle.scrollIntoView?.({ behavior: 'auto', block: 'center' });
        toggle.click();
        
        await waitForCondition(() => {
          const freshToggle = document.querySelector(`[data-purpose="section-panel-${i}"] button[aria-expanded]`);
          return freshToggle?.getAttribute('aria-expanded') === 'true';
        }, { timeout: 8000 });
        
        await waitMs(300);
      }
    }
  };

  const showSelectionPanel = async () => {
    await expandAllSections();

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

  const findSectionToggleForElement = (element) => {
    const section = element?.closest?.('[data-purpose^="section-panel-"]');
    if (!section) return null;
    return section.querySelector('button[aria-expanded]');
  };

  const ensureSectionExpanded = async (element) => {
    const toggle = findSectionToggleForElement(element);
    if (!toggle) return true;
    if (toggle.getAttribute('aria-expanded') === 'true') return true;
    toggle.click();
    const expanded = await waitForCondition(
      () => toggle.getAttribute('aria-expanded') === 'true',
      { timeout: 5000 }
    );
    return Boolean(expanded);
  };

  const ensureCurriculumElementClickable = async (item) => {
    let element = item?.element?.isConnected ? item.element : null;
    if (!element) {
      const refreshedItems = findCurriculumItems();
      const refreshed = refreshedItems.find((candidate) => candidate.index === item?.index && candidate.title === item?.title);
      element = refreshed?.element ?? null;
    }
    if (!element) return null;
    await ensureSectionExpanded(element);
    return element;
  };

  const collectTranscriptForItem = async (item, videoNumber) => {
    const element = await ensureCurriculumElementClickable(item);
    if (!element) {
      console.warn(`Udemy Transcript Helper: curriculum item ${videoNumber} missing from DOM.`);
      addSkippedLecture({ videoNumber, title: item.title, reason: 'Curriculum element missing' });
      return null;
    }

    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    element.click();
    await waitMs(2500);
    const panel = await ensureTranscriptPanelOpen();
    if (!panel) {
      console.warn(`Udemy Transcript Helper: transcript panel not available for video ${videoNumber}.`);
      addSkippedLecture({ videoNumber, title: item.title, reason: 'Transcript panel not found' });
      return null;
    }

    const lines = await waitForCondition(() => {
      const transcriptLines = findTranscriptLines(panel);
      return transcriptLines.length ? transcriptLines : null;
    }, { timeout: 15000, observeTarget: panel });

    if (!lines) {
      console.warn(`Udemy Transcript Helper: transcript lines not detected for video ${videoNumber}.`);
      addSkippedLecture({ videoNumber, title: item.title, reason: 'Transcript lines missing' });
      return null;
    }

    return extractTranscript();
  };

  const collectTranscriptsForSelection = async (selection, options = {}) => {
    const { onVideoStart, onVideoComplete } = options;
    const entries = [];
    for (let idx = 0; idx < selection.items.length; idx += 1) {
      const item = selection.items[idx];
      const videoNumber = (item.index ?? idx) + 1;
      onVideoStart?.({ index: idx, total: selection.items.length, item, videoNumber });
      const transcript = await collectTranscriptForItem(item, videoNumber);
      await closeTranscriptPanel();
      const success = Boolean(transcript?.items?.length);

      if (success) {
        transcript.items.forEach((line, lineIndex) => {
          entries.push({
            videoNumber,
            title: item.title,
            sectionIndex: item.sectionIndex ?? 0,
            sectionTitle: item.sectionTitle ?? 'Course Content',
            lineNumber: lineIndex + 1,
            timestampSeconds: line.timestampSeconds ?? '',
            timestampRaw: line.rawTimestamp ?? '',
            text: line.text
          });
        });
      }

      onVideoComplete?.({
        index: idx,
        total: selection.items.length,
        item,
        videoNumber,
        success
      });
    }
    return entries;
  };

  let exportInProgress = false;

  const buildTranscriptText = (entries) => {
    if (!entries.length) return '';

    const bySection = entries.reduce((acc, entry) => {
      const secKey = `${entry.sectionIndex}::${entry.sectionTitle}`;
      if (!acc[secKey]) acc[secKey] = {};
      
      const videoKey = `${entry.videoNumber}::${entry.title}`;
      if (!acc[secKey][videoKey]) acc[secKey][videoKey] = [];
      
      acc[secKey][videoKey].push(entry);
      return acc;
    }, {});

    const sortedSections = Object.entries(bySection)
      .sort((a, b) => {
        const [aIdx] = a[0].split('::');
        const [bIdx] = b[0].split('::');
        return Number(aIdx) - Number(bIdx);
      });

    const fileContentParts = [];

    sortedSections.forEach(([secKey, videosMap]) => {
      const [, sectionTitle] = secKey.split('::');
      const secHeader = `Section: ${sectionTitle}`;
      const secSeparator = '='.repeat(Math.max(secHeader.length, 40));
      fileContentParts.push(`${secSeparator}\n${secHeader}\n${secSeparator}`);

      const sortedVideos = Object.entries(videosMap)
        .sort((a, b) => {
          const [aNum] = a[0].split('::');
          const [bNum] = b[0].split('::');
          return Number(aNum) - Number(bNum);
        });

      sortedVideos.forEach(([videoKey, lines]) => {
        const [videoNumber, title] = videoKey.split('::');
        const videoHeader = `Video ${videoNumber}: ${title}`;
        const body = lines
          .sort((a, b) => a.lineNumber - b.lineNumber)
          .map((entry) => {
            const prefix = entry.timestampRaw ? `[${entry.timestampRaw}] ` : '';
            return `${prefix}${entry.text}`;
          })
          .join('\n');
        fileContentParts.push(`${videoHeader}\n${'-'.repeat(videoHeader.length)}\n${body}`);
      });
    });

    return fileContentParts.join('\n\n');
  };

  const exportSelectionToText = async (selectionOverride, options = {}) => {
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

      const entries = await collectTranscriptsForSelection(selection, options);
    if (!entries.length) {
      console.warn('Udemy Transcript Helper: no transcript entries collected.');
      addSkippedLecture({ videoNumber: '-', title: 'Export', reason: 'No transcripts captured' });
      return null;
    }

      const text = buildTranscriptText(entries);
      const courseTitle = getCourseTitle();
      const videoCount = selection.items.length;
      const filenameBase = `${courseTitle} (${videoCount} videos)`;
      const filename = `${sanitizeFilename(filenameBase)}.txt`;
      triggerDownload(filename, text, 'text/plain');
      console.info(`Udemy Transcript Helper: exported ${entries.length} transcript lines to ${filename}.`);
      return { filename, lineCount: entries.length, selection };
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
      exportSelectionToText,
      showSelectionPanel
    };

    window.udemyTranscriptHelper = helpers;
    document.dispatchEvent(new CustomEvent(READY_EVENT, { detail: helpers }));

    setTimeout(() => {
      startAutomationFlow();
    }, AUTO_START_DELAY_MS);
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'udemyTranscriptHelper.showPanel') {
        showSelectionPanel()
          .then((count) => sendResponse({ ok: true, count }))
          .catch((error) => sendResponse({ ok: false, error: error?.message ?? String(error) }));
        return true;
      }
      return undefined;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exposeHelpers, { once: true });
  } else {
    exposeHelpers();
  }
})();
