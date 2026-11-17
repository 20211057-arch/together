const router = require('express').Router({ mergeParams: true });
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Crew = require('../../models/regularCrew');
const Post = require('../../models/CrewPost');
const Photo = require('../../models/CrewPhoto');
const directory = path.join(__dirname, '../../public/images/crew-album');
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 2000 }, fileFilter(req, file, cb) {
    cb(extensions[file.mimetype] ? null : Object.assign(new Error('JPG, PNG, WebP 사진만 올릴 수 있습니다.'), { status: 400 }), Boolean(extensions[file.mimetype]));
} });
router.use(async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ message: '로그인이 필요합니다.' });
        if (!mongoose.isValidObjectId(req.params.crewId)) return res.status(404).json({ message: '모임을 찾을 수 없습니다.' });
        const crew = await Crew.findById(req.params.crewId);
        if (!crew) return res.status(404).json({ message: '모임을 찾을 수 없습니다.' });
        req.contentOwner = String(crew.host) === String(req.user._id);
        if (!req.contentOwner && !crew.member.memberList.some(m => String(m.user) === String(req.user._id))) return res.status(403).json({ message: '모임원만 이용할 수 있습니다.' });
        next();
    } catch (error) { next(error); }
});
const ownerOnly = (req, res, next) => req.contentOwner ? next() : res.status(403).json({ message: '모임장만 관리할 수 있습니다.' });
const validItem = (req, res, next) => mongoose.isValidObjectId(req.params.itemId) ? next() : res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
function text(body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!title || title.length > 100 || !content || content.length > 10000) throw Object.assign(new Error('제목(100자 이내)과 내용(10,000자 이내)을 입력해주세요.'), { status: 400 });
    return { title, content };
}
router.post('/posts', ownerOnly, async (req, res, next) => {
    try { await Post.create({ ...text(req.body), crew: req.params.crewId, author: req.user._id }); res.json({ success: true }); }
    catch (e) { next(e); }
});
router.post('/posts/:itemId/edit', ownerOnly, validItem, async (req, res, next) => {
    try { const item = await Post.findOneAndUpdate({ _id: req.params.itemId, crew: req.params.crewId }, text(req.body), { runValidators: true }); if (!item) return res.status(404).json({ message: '게시글이 없습니다.' }); res.json({ success: true }); } catch (e) { next(e); }
});
router.post('/posts/:itemId/delete', ownerOnly, validItem, async (req, res, next) => {
    try { const item = await Post.findOneAndDelete({ _id: req.params.itemId, crew: req.params.crewId }); if (!item) return res.status(404).json({ message: '게시글이 없습니다.' }); res.json({ success: true }); } catch (e) { next(e); }
});
router.post('/photos', (req, res, next) => upload.array('photos', 10)(req, res, error => error ? res.status(400).json({ message: error.message }) : next()), async (req, res, next) => {
    const written = [];
    try {
        if (!req.files?.length) return res.status(400).json({ message: '사진을 선택해주세요.' });
        const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
        if (caption.length > 300) return res.status(400).json({ message: '설명은 300자 이내로 입력해주세요.' });
        // Verify signatures before writing files; browser-provided MIME alone is insufficient.
        for (const f of req.files) {
            const b = f.buffer;
            const valid = f.mimetype === 'image/jpeg' ? b[0] === 255 && b[1] === 216 && b[2] === 255 : f.mimetype === 'image/png' ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP';
            if (!valid) return res.status(400).json({ message: '올바른 이미지 파일을 선택해주세요.' });
        }
        await fs.mkdir(directory, { recursive: true });
        const docs = [];
        for (const file of req.files) {
            const name = `${randomUUID()}.${extensions[file.mimetype]}`;
            const target = path.join(directory, name);
            await fs.writeFile(target, file.buffer); written.push(target);
            docs.push({ crew: req.params.crewId, author: req.user._id, src: `/images/crew-album/${name}`, caption });
        }
        try { await Photo.insertMany(docs); } catch (e) { await Photo.deleteMany({ src: { $in: docs.map(d => d.src) }, crew: req.params.crewId }); throw e; }
        res.json({ success: true });
    } catch (e) { await Promise.all(written.map(file => fs.unlink(file).catch(() => {}))); next(e); }
});
router.post('/photos/:itemId/delete', validItem, async (req, res, next) => {
    try {
        const query = { _id: req.params.itemId, crew: req.params.crewId };
        if (!req.contentOwner) query.author = req.user._id;
        const photo = await Photo.findOneAndDelete(query);
        if (!photo) return res.status(404).json({ message: '사진이 없거나 삭제 권한이 없습니다.' });
        if (/^\/images\/crew-album\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo.src)) await fs.unlink(path.join(directory, path.basename(photo.src))).catch(() => {});
        res.json({ success: true });
    } catch (e) { next(e); }
});
router.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.status ? error.message : '처리 중 오류가 발생했습니다. 다시 시도해주세요.' });
});
module.exports = router;
