function parseCrewIntro(value) {
    let blocks;
    try { blocks = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { throw invalidIntro(); }
    if (!Array.isArray(blocks) || blocks.length > 40) throw invalidIntro();
    let images = 0;
    let length = 0;
    const cleaned = blocks.map(block => {
        if (block?.type === 'text' && typeof block.text === 'string') {
            length += block.text.length;
            return { type: 'text', text: block.text };
        }
        if (block?.type === 'image' && typeof block.src === 'string' &&
            /^\/images\/reg-crew\/intro\/[a-f0-9-]+\.(jpg|png|webp)$/.test(block.src)) {
            images++;
            return { type: 'image', src: block.src };
        }
        throw invalidIntro();
    });
    if (images > 10 || length > 20000) throw invalidIntro();
    return { introBlocks: cleaned, intro: cleaned.filter(b => b.type === 'text').map(b => b.text).join('\n\n') };
}
function invalidIntro() {
    const error = new Error('소개는 글 20,000자, 사진 10장, 전체 40개 항목까지 작성할 수 있습니다.');
    error.status = 400;
    return error;
}
module.exports = { parseCrewIntro };
