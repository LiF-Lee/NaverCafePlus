const ARTICLE_PATH_NEW = /^\/(?:f-e|ca-fe)\/cafes\/(\d+)\/articles\/(\d+)\/?$/;
const ARTICLE_PATH_OLD = /^\/([^/]+)\/(\d+)\/?$/;
const RESERVED_FIRST_SEGMENT = /^(?:f-e|ca-fe)$/i;
const CAFE_ID_PATH = /^\/(?:f-e|ca-fe)\/cafes\/(\d+)(?:\/|$)/;
const CAFE_ID_SCRIPT = /g_sClubId\s*=\s*["'](\d+)["']/;

let isEnabled = false;

function stripHash(url) {
    const index = url.indexOf('#');
    return index === -1 ? url : url.slice(0, index);
}

function parseArticleUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl, location.href);
    } catch (e) {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
    }
    if (url.hostname !== 'cafe.naver.com' && url.hostname !== 'm.cafe.naver.com') {
        return null;
    }

    const hasArt = url.searchParams.has('art');

    const newFormat = url.pathname.match(ARTICLE_PATH_NEW);
    if (newFormat) {
        return { cafeId: newFormat[1], articleId: newFormat[2], hasArt: hasArt };
    }

    const clubId = url.searchParams.get('clubid');
    const articleId = url.searchParams.get('articleid');
    if (clubId && articleId) {
        return { cafeId: clubId, articleId: articleId, hasArt: hasArt };
    }

    const oldFormat = url.pathname.match(ARTICLE_PATH_OLD);
    if (oldFormat && !RESERVED_FIRST_SEGMENT.test(oldFormat[1])) {
        return {
            cafeId: null,
            cafeName: oldFormat[1].toLowerCase(),
            articleId: oldFormat[2],
            hasArt: hasArt
        };
    }

    return null;
}

function collectContextUrls() {
    const candidates = [location.href];

    try {
        if (window.top !== window && window.top.location.href) {
            candidates.push(window.top.location.href);
        }
    } catch (e) {}

    for (const raw of candidates.slice()) {
        let url;
        try {
            url = new URL(raw);
        } catch (e) {
            continue;
        }

        for (const key of ['iframe_url_utf8', 'iframe_url']) {
            const value = url.searchParams.get(key);
            if (!value) {
                continue;
            }

            try {
                candidates.push(new URL(value, 'https://cafe.naver.com/').href);
            } catch (e) {}

            try {
                candidates.push(new URL(decodeURIComponent(value), 'https://cafe.naver.com/').href);
            } catch (e) {}
        }
    }

    return candidates;
}

function collectCurrentArticleIds() {
    const ids = new Set();

    for (const raw of collectContextUrls()) {
        const info = parseArticleUrl(raw);
        if (info) {
            ids.add(String(info.articleId));
        }
    }

    return ids;
}

function findCurrentCafeId() {
    for (const raw of collectContextUrls()) {
        let url;
        try {
            url = new URL(raw);
        } catch (e) {
            continue;
        }

        const fromPath = url.pathname.match(CAFE_ID_PATH);
        if (fromPath) {
            return fromPath[1];
        }

        for (const key of ['clubid', 'search.clubid', 'cafeId', 'clubId']) {
            const value = url.searchParams.get(key);
            if (value && /^\d+$/.test(value)) {
                return value;
            }
        }
    }

    const hidden = document.querySelector('input[name="clubid"], input[name="search.clubid"]');
    if (hidden && /^\d+$/.test(hidden.value || '')) {
        return hidden.value;
    }

    for (const script of document.querySelectorAll('script:not([src])')) {
        const found = (script.textContent || '').match(CAFE_ID_SCRIPT);
        if (found) {
            return found[1];
        }
    }

    return null;
}

function findCurrentCafeName() {
    for (const raw of collectContextUrls()) {
        let url;
        try {
            url = new URL(raw);
        } catch (e) {
            continue;
        }

        const segment = (url.pathname.split('/')[1] || '');
        if (!segment || RESERVED_FIRST_SEGMENT.test(segment)) {
            continue;
        }
        if (/^\d+$/.test(segment) || /\.nhn$/i.test(segment)) {
            continue;
        }

        return segment.toLowerCase();
    }

    return null;
}

function resolveTargetWindow(linkElement) {
    const target = (linkElement.getAttribute('target') || '').trim().toLowerCase();

    if (target === '' || target === '_self') {
        return window;
    }
    if (target === '_top') {
        return window.top;
    }
    if (target === '_parent') {
        return window.parent;
    }
    if (target === '_blank') {
        return null;
    }

    try {
        const named = window.frames[target];
        if (named && named.location) {
            return named;
        }
    } catch (e) {}

    return null;
}

function shouldBypass(event, linkElement) {
    if (!isEnabled || event.defaultPrevented) {
        return null;
    }

    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return null;
    }

    const rawHref = (linkElement.getAttribute('href') || '').trim();
    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) {
        return null;
    }

    const info = parseArticleUrl(linkElement.href);
    if (!info || info.hasArt) {
        return null;
    }

    if (stripHash(linkElement.href) === stripHash(location.href)) {
        return null;
    }

    if (collectCurrentArticleIds().has(String(info.articleId))) {
        return null;
    }

    const title = (linkElement.textContent || '').trim();
    if (!title) {
        return null;
    }

    const targetWindow = resolveTargetWindow(linkElement);
    if (!targetWindow) {
        return null;
    }

    // /카페명/글번호 형식에는 숫자 cafeId가 없습니다. 현재 페이지에서 찾아 채웁니다.
    let cafeId = info.cafeId;
    if (!cafeId) {
        const currentName = findCurrentCafeName();
        if (currentName && info.cafeName && currentName !== info.cafeName) {
            return null;
        }

        cafeId = findCurrentCafeId();
        if (!cafeId) {
            return null;
        }
    }

    return {
        url: linkElement.href,
        title: title,
        cafeId: cafeId,
        targetWindow: targetWindow
    };
}

document.addEventListener('click', (event) => {
    const linkElement = event.target.closest ? event.target.closest('a') : null;
    if (!linkElement || !linkElement.href) {
        return;
    }

    const request = shouldBypass(event, linkElement);
    if (!request) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    chrome.runtime.sendMessage({
        action: "openLink",
        url: request.url,
        title: request.title,
        cafeId: request.cafeId
    }, (response) => {
        const url = !chrome.runtime.lastError && response && response.url
            ? response.url
            : request.url;

        try {
            request.targetWindow.location.assign(url);
        } catch (e) {
            window.location.assign(url);
        }
    });
}, true);

chrome.storage.local.get("isEnabled", (data) => {
    isEnabled = !!data.isEnabled;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.isEnabled) {
        isEnabled = !!changes.isEnabled.newValue;
    }
});
