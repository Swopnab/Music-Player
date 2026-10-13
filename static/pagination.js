// Keep DOM work bounded without changing the complete playback queue.
export function collectionPage(items, requestedPage = 0, pageSize = 100) {
    const size = Math.max(1, Math.floor(pageSize));
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(pages - 1, Math.max(0, Math.floor(requestedPage) || 0));
    const start = page * size;
    return {items: items.slice(start, start + size), page, pages, start, end: Math.min(start + size, items.length)};
}
