const menuItemId = "NaverCafePlusToggle";

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ isEnabled: true });
    chrome.contextMenus.create({
        id: menuItemId,
        title: "네이버카페 플러스 비활성화",
        contexts: ["page", "selection", "link"],
        documentUrlPatterns: ["*://cafe.naver.com/*"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === menuItemId) {
        chrome.storage.local.get("isEnabled", (data) => {
            const newState = !data.isEnabled;
            chrome.storage.local.set({ isEnabled: newState }, () => {
                updateContextMenu(newState);
                chrome.tabs.sendMessage(tab.id, {
                    action: "stateChanged",
                    isEnabled: newState
                });
            });
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openLink" && message.url) {
        let cafeInfo = extractCafeInfo(message.url);
        if (!cafeInfo) {
            chrome.tabs.update({ url: message.url });
            return;
        }
        
        console.log(`NCP Request: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${message.title}`);

        let url = searchCafeArticle(cafeInfo.cafeId, cafeInfo.articleId, message.title);
        url.then((finalUrl) => {
            if (finalUrl) {
                chrome.tabs.update({ url: finalUrl });
            } else {
                console.log(`NCP Not Found: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${message.title}`);
                chrome.tabs.update({ url: message.url });
            }
        }).catch((error) => {
            chrome.tabs.update({ url: message.url });
        });
    }
});

function updateContextMenu(isEnabled) {
    const title = isEnabled ? "네이버카페 플러스 비활성화" : "네이버카페 플러스 활성화";
    chrome.contextMenus.update(menuItemId, {
        title: title
    });
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
    const query = encodeURIComponent(articleTitle.replace(/[^\p{Script=Hangul}\p{Script=Latin}\p{Number}\s,.\-!?()\[\]{}#$%^&*+=_:'"`~\\\/;<>@|]/gu, '').replace(/\s+/g, '+'));
    return `https://article.cafe.naver.com/gw/cafes/${cafeId}/articles/14/searches?limit=1000&page=${page}&searchType=IN_CAFE&searchBy=1&query=${query}`;
}

function buildCafeArticleArtUrl(cafeId, articleId, art) {
    return `http://cafe.naver.com/ArticleRead.nhn?clubid=${cafeId}&articleid=${articleId}&art=${art}`;
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
