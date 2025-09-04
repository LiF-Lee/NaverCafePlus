function applyFeatures() {
    document.addEventListener('click', (event) => {
        const linkElement = event.target.closest('a');
        if (linkElement && linkElement.href) {
            const url = linkElement.href;
            const title = linkElement.textContent.trim();
            const naverCafePattern = /^https:\/\/cafe\.naver\.com\/.*\/\d+(\?.*)?$/;
            if (naverCafePattern.test(url)) {
                event.preventDefault();
                chrome.runtime.sendMessage({
                    action: "openLink",
                    url: url,
                    title: title
                });
            }
        }
    }, true);
}

chrome.storage.local.get("isEnabled", (data) => {
    if (data.isEnabled) {
        applyFeatures();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "stateChanged") {
        window.location.reload();
    }
});
