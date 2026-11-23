const mongoose = require('mongoose');
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const bucketName = 'uploadedImages';
const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const publicRoot = path.resolve(__dirname, '../public');

function validUrl(url) {
    return typeof url === 'string' && /^\/images\/(?:user-profile|board|reg-crew\/(?:profile|intro)|crew-album)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(url);
}

function bucket() {
    if (!mongoose.connection.db) throw new Error('Image storage requires a database connection');
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
}

async function saveImage(url, source) {
    if (!validUrl(url)) throw new Error('Invalid image path');
    const store = bucket();
    const previous = await store.find({ filename: url }).toArray();
    const upload = store.openUploadStream(url, { metadata: { contentType: mimeTypes[path.extname(url).toLowerCase()] } });
    try {
        await pipeline(Buffer.isBuffer(source) ? Readable.from([source]) : fs.createReadStream(source), upload);
    } catch (error) {
        await store.delete(upload.id).catch(() => {});
        throw error;
    }
    // Replace only after the new copy is safely stored.
    await Promise.all(previous.map(file => store.delete(file._id)));
}

async function deleteImage(url) {
    if (!validUrl(url)) return;
    const store = bucket();
    const files = await store.find({ filename: url }).toArray();
    await Promise.all(files.map(file => store.delete(file._id)));
}

function imageUrl(filePath) {
    const relative = path.relative(publicRoot, path.resolve(filePath));
    return '/' + relative.split(path.sep).join('/');
}

// Keep Multer's local cache while waiting for durable storage before reporting success.
function durableStorage(storage) {
    return {
        _handleFile(req, file, cb) {
            storage._handleFile(req, file, (error, info) => {
                if (error) return cb(error);
                saveImage(imageUrl(info.path), info.path).then(() => cb(null, info), async error => {
                    await fs.promises.unlink(info.path).catch(() => {});
                    cb(error);
                });
            });
        },
        _removeFile(req, file, cb) {
            deleteImage(imageUrl(file.path)).then(() => storage._removeFile(req, file, cb), cb);
        }
    };
}

// Called after express.static: a redeploy may erase the local cache, but not GridFS.
async function serveImage(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let url;
    try { url = decodeURIComponent(req.path); } catch { return next(); }
    if (!validUrl(url)) return next();
    try {
        const store = bucket();
        const [file] = await store.find({ filename: url }).sort({ uploadDate: -1 }).limit(1).toArray();
        if (!file) return next();
        res.set({ 'Content-Type': mimeTypes[path.extname(url).toLowerCase()], 'Content-Length': String(file.length),
            'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600' });
        if (req.method === 'HEAD') return res.end();
        await pipeline(store.openDownloadStream(file._id), res);
    } catch (error) {
        if (!res.headersSent) next(error);
        else res.destroy(error);
    }
}

module.exports = { bucketName, validUrl, saveImage, deleteImage, durableStorage, serveImage };
