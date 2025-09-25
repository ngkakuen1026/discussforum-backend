export function extractPublicId(url: string): string {
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/upload/');
    if (parts.length < 2) return '';
    const path = parts[1].replace(/^v\d+\//, '');
    const lastDot = path.lastIndexOf('.');
    return lastDot !== -1 ? path.substring(0, lastDot) : path;
}