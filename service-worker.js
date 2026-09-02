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
            });
        });
    }
});

async function resolveArticleUrl(requestUrl, articleTitle, fallbackCafeId) {
    const cafeInfo = extractCafeInfo(requestUrl, fallbackCafeId);
    if (!cafeInfo) {
        return requestUrl;
    }

    console.log(`NCP Request: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${articleTitle}`);

    const finalUrl = await searchCafeArticle(cafeInfo.cafeId, cafeInfo.articleId, articleTitle);
    if (finalUrl) {
        return finalUrl;
    }

    console.log(`NCP Not Found: [${cafeInfo.cafeId}, ${cafeInfo.articleId}] ${articleTitle}`);
    return requestUrl;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === "openLink" && message.url) {
        resolveArticleUrl(message.url, message.title, message.cafeId)
            .then((url) => sendResponse({ url: url }))
            .catch((error) => {
                console.log(`NCP Error: ${error}`);
                sendResponse({ url: message.url });
            });
        return true;
    }
});

function updateContextMenu(isEnabled) {
    const title = isEnabled ? "네이버카페 플러스 비활성화" : "네이버카페 플러스 활성화";
    chrome.contextMenus.update(menuItemId, {
        title: title
    }, () => chrome.runtime.lastError);
}

function extractCafeInfo(url, fallbackCafeId) {
    const newFormatRegex = /cafes\/(\d+)\/articles\/(\d+)/;
    let matches = url.match(newFormatRegex);

    if (matches && matches.length >= 3) {
        return {
            cafeId: parseInt(matches[1]),
            articleId: parseInt(matches[2])
        };
    }

    let urlObject;
    try {
        urlObject = new URL(url);
    } catch (e) {
        return null;
    }

    const cafeId = urlObject.searchParams.get('clubid');
    const articleId = urlObject.searchParams.get('articleid');

    if (cafeId && articleId) {
        return { cafeId: parseInt(cafeId), articleId: parseInt(articleId) };
    }

    // /카페명/글번호 형식. cafeId는 콘텐츠 스크립트가 현재 페이지에서 찾아 넘겨줍니다.
    const oldPath = urlObject.pathname.match(/^\/[^/]+\/(\d+)\/?$/);
    if (oldPath && /^\d+$/.test(String(fallbackCafeId))) {
        return {
            cafeId: parseInt(fallbackCafeId),
            articleId: parseInt(oldPath[1])
        };
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
