chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'udemyTranscriptHelper.showPanel' }, () => {
    if (chrome.runtime.lastError) {
      // Content script might not be loaded yet (e.g., non-Udemy page)
      console.debug('Udemy Transcript Helper: unable to show panel', chrome.runtime.lastError.message);
    }
  });
});
