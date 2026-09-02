const menuItemId = "NaverCafePlusToggle";

function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: menuItemId,
            title: "네이버카페 플러스 비활성화",
            contexts: ["page", "selection", "link"],
            documentUrlPatterns: ["*://cafe.naver.com/*"]
        }, () => {
            chrome.storage.local.get("isEnabled", (data) => {
                updateContextMenu(!!data.isEnabled);
            });
        });
    });
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get("isEnabled", (data) => {
        if (typeof data.isEnabled === "undefined") {
            chrome.storage.local.set({ isEnabled: true });
        }
    });
    createContextMenu();
});

chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === menuItemId) {
        chrome.storage.local.get("isEnabled", (data) => {
            const newState = !data.isEnabled;
            chrome.storage.local.set({ isEnabled: newState }, () => {
                updateContextMenu(newState);
                if (tab && typeof tab.id === "number") {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "stateChanged",
                        isEnabled: newState
                    }, () => chrome.runtime.lastError);
                }
            });
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "openLink" && message.url) {
        const tabId = sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
        if (tabId === null) {
            return;
        }

        const navigate = (url) => {
            chrome.tabs.update(tabId, { url: url }, () => chrome.runtime.lastError);
        };

        let cafeInfo = extractCafeInfo(message.url);
        if (!cafeInfo) {
            navigate(message.url);
            return;
        }

        console.log(`NCP Request: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${message.title}`);

        let url = searchCafeArticle(cafeInfo.cafeId, cafeInfo.articleId, message.title);
        url.then((finalUrl) => {
            if (finalUrl) {
                navigate(finalUrl);
            } else {
                console.log(`NCP Not Found: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${message.title}`);
                navigate(message.url);
            }
        }).catch((error) => {
            console.log(`NCP Error: ${error}`);
            navigate(message.url);
        });
    }
});

function updateContextMenu(isEnabled) {
    const title = isEnabled ? "네이버카페 플러스 비활성화" : "네이버카페 플러스 활성화";
    chrome.contextMenus.update(menuItemId, {
        title: title
    }, () => chrome.runtime.lastError);
}

function extractCafeInfo(url) {
    const newFormatRegex = /cafes\/(\d+)\/articles\/(\d+)/;
    let matches = url.match(newFormatRegex);

    if (matches && matches.length >= 3) {
        return {
            cafeId: parseInt(matches[1]),
            articleId: parseInt(matches[2])
        };
    }

    try {
        const urlObject = new URL(url);
        const cafeId = urlObject.searchParams.get('clubid');
        const articleId = urlObject.searchParams.get('articleid');

        if (cafeId && articleId) {
            return { cafeId: parseInt(cafeId), articleId: parseInt(articleId) };
        }
    } catch (e) {
        return null;
    }

    return null;
}

function buildCafeArticleSearchUrl(cafeId, articleTitle, page = 1) {
    const query = encodeURIComponent(articleTitle.replace(/[^\p{Script=Hangul}\p{Script=Latin}\p{Number}\s,.\-!?()\[\]{}#$%^&*+=_:'"`~\\/;<>@|]/gu, '').replace(/\s+/g, '+'));
    return `https://article.cafe.naver.com/gw/cafes/${cafeId}/articles/14/searches?limit=1000&page=${page}&searchType=IN_CAFE&searchBy=1&query=${query}`;
}

function buildCafeArticleArtUrl(cafeId, articleId, art) {
    return `https://cafe.naver.com/ArticleRead.nhn?clubid=${cafeId}&articleid=${articleId}&art=${encodeURIComponent(art)}`;
}

function searchCafeArticleHandler(articleId, data) {
    if (!data || !data.articles || !data.articles.items || data.articles.items.length === 0) {
        return null;
    }

    let result = null;
    for (const item of data.articles.items) {
        if (item.id < articleId) {
            break;
        }

        if (item.id === articleId) {
            result = item.art;
            console.log(`NCP Found: ${item.art}`);
            break;
        }
    }

    return result;
}

async function searchCafeArticle(cafeId, articleId, articleTitle) {
    let searchUrl = buildCafeArticleSearchUrl(cafeId, articleTitle);
    console.log(`NCP Search: ${searchUrl}`);

    const response = await fetch(searchUrl);
    const data = await response.json();

    var result = searchCafeArticleHandler(articleId, data);
    if (!result) {
        return null;
    }

    return buildCafeArticleArtUrl(cafeId, articleId, result);
}
