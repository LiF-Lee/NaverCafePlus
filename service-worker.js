const menuItemId = "NaverCafePlus";

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: menuItemId,
        title: "네이버카페 플러스로 열기",
        contexts: ["link"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!info.linkUrl.startsWith('https://cafe.naver.com/ArticleRead.nhn')) {
        return;
    }
    if (info.menuItemId === menuItemId && info.linkUrl) {
        openLinkInActiveTab(info.linkUrl);
    }
});

function openLinkInActiveTab(linkUrl) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        let activeTab = tabs[0];
        chrome.tabs.sendMessage(activeTab.id, { type: "GetContents", linkUrl, tryCount: 0 });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GetContents" && message.title && message.date) {
        const query = encodeURIComponent(`"${message.title}"`);
        const searchUrl = `https://s.search.naver.com/p/cafe/47/search.naver?query=${query}&date_from=${message.date}&date_to=${message.date}&start=${1 + (30 * message.tryCount)}&display=30&ssc=tab.m_cafe.all&prmore=1&st=rel&date_option=8`;

        fetch(searchUrl)
            .then(response => response.json())
            .then(data => fetchResultsHandler(data, message.linkUrl, sender.tab.url, message.title, message.date, message.tryCount));
        return true;
    }
    return false;
});

function fetchResultsHandler(data, linkUrl, pageUrl, title, date, tryCount) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        let activeTab = tabs[0];
        chrome.tabs.sendMessage(activeTab.id, { type: "FetchData", linkUrl, pageUrl, data, title, date, tryCount });
    });
}
