function extractContentDetails(linkUrl) {
    const iframe = document.querySelector('iframe#cafe_main');
    if (!iframe) return {};

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const linkElement = doc.querySelector(`a[href="${linkUrl.replace('https://cafe.naver.com', '')}"]`);
    if (!linkElement) return {};

    const title = linkElement.textContent.trim();
    const dateElement = linkElement.closest('tr').querySelector('.td_date');
    if (!title || !dateElement) return {};

    const date = dateElement.textContent.trim().replace(/[\.\s]/g, '');
    return { title, date };
}

function extractLinksFromResponse(linkUrl, pageUrl, data) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, "text/html");
    const targetCafeName = new URL(pageUrl).pathname.split('/')[1];
    const targetArticleId = new URL(linkUrl).searchParams.get("articleid");

    const links = Array.from(doc.querySelectorAll('li.bx[data-cr-area="caf*g"]')).map(li => {
        const titleLink = li.querySelector('.title_link');
        const dscLink = li.querySelector('.dsc_link');
        if (!titleLink || !dscLink) return;

        const url = new URL(titleLink.href);
        const [cafeName, articleId] = url.pathname.split('/').slice(1);
        if (cafeName !== targetCafeName || articleId !== targetArticleId) return;

        const artValue = url.searchParams.get('art');
        return {
            cafe: cafeName,
            id: articleId,
            title: titleLink.textContent.trim(),
            desc: dscLink.textContent.trim(),
            url: `https://cafe.naver.com/${cafeName}/${articleId}?art=${artValue}`
        };
    });

    return links.filter(link => link !== undefined);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GetContents") {
        const contentDetails = extractContentDetails(message.linkUrl);
        chrome.runtime.sendMessage({...message, ...contentDetails});
    } else if (message.type === "FetchData") {
        const responseLinks = extractLinksFromResponse(message.linkUrl, message.pageUrl, message.data);

        if (responseLinks.length === 0) {
            alert("페이지를 열 수 없습니다.");
        } else {
            window.open(responseLinks[0].url, '_blank');
        }
    }
});
