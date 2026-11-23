const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const mongoose = require('mongoose');
const express = require('express');
const images = require('../services/imageStore');

test('durable images survive missing local files and support replacement, HEAD and deletion', async t => {
    const descriptor = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
    const previousDb = mongoose.connection.db;
    const files = new Map();
    let nextId = 0;
    let rejectWrites = false;
    class Bucket {
        find(query) {
            let result = [...files.values()].filter(file => file.filename === query.filename);
            return { sort() { result.reverse(); return this; }, limit(n) { result = result.slice(0, n); return this; },
                async toArray() { return result; } };
        }
        openUploadStream(filename) {
            const _id = String(++nextId), chunks = [];
            const stream = new Writable({ write(chunk, encoding, cb) {
                if (rejectWrites) return cb(new Error('storage unavailable'));
                chunks.push(Buffer.from(chunk)); cb();
            },
                final(cb) { const data = Buffer.concat(chunks); files.set(_id, { _id, filename, length: data.length, data }); cb(); } });
            stream.id = _id;
            return stream;
        }
        openDownloadStream(id) { return Readable.from([files.get(String(id)).data]); }
        async delete(id) { files.delete(String(id)); }
    }
    Object.defineProperty(mongoose.mongo, 'GridFSBucket', { configurable: true, value: Bucket });
    mongoose.connection.db = {};
    t.after(() => {
        Object.defineProperty(mongoose.mongo, 'GridFSBucket', descriptor);
        mongoose.connection.db = previousDb;
    });
    const app = express();
    app.use(images.serveImage);
    app.use((req, res) => res.sendStatus(404));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = '/images/reg-crew/profile/test.png';
    await images.saveImage(url, Buffer.from('first-image'));
    assert.equal(await (await fetch(base + url)).text(), 'first-image');
    await images.saveImage(url, Buffer.from('replacement'));
    assert.equal(files.size, 1);
    const response = await fetch(base + url);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await response.text(), 'replacement');
    rejectWrites = true;
    await assert.rejects(images.saveImage(url, Buffer.from('failed replacement')), /storage unavailable/);
    rejectWrites = false;
    assert.equal(await (await fetch(base + url)).text(), 'replacement');
    // Exercise the Multer wrapper without creating temporary files in the repository.
    const fs = require('node:fs');
    const path = require('node:path');
    t.mock.method(fs, 'createReadStream', () => Readable.from([Buffer.from('new upload')]));
    const uploadPath = path.resolve(__dirname, '../public/images/board/durable-test.png');
    const storage = images.durableStorage({
        _handleFile(req, file, cb) { cb(null, { path: uploadPath, filename: 'durable-test.png' }); },
        _removeFile(req, file, cb) { cb(); }
    });
    const info = await new Promise((resolve, reject) => storage._handleFile({}, {}, (e, info) => e ? reject(e) : resolve(info)));
    assert.equal(await (await fetch(base + '/images/board/durable-test.png')).text(), 'new upload');
    await new Promise((resolve, reject) => storage._removeFile({}, info, e => e ? reject(e) : resolve()));
    assert.equal((await fetch(base + '/images/board/durable-test.png')).status, 404);
    const head = await fetch(base + url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength('replacement')));
    assert.equal((await fetch(base + '/images/board/missing.png')).status, 404);
    assert.equal(images.validUrl('/images/../secret.png'), false);
    assert.equal(images.validUrl('/images/board/script.html'), false);
    await assert.rejects(images.saveImage('/images/board/script.html', Buffer.from('bad')));
    await images.deleteImage(url);
    assert.equal((await fetch(base + url)).status, 404);
});
