const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ejs = require('ejs');
const Room = require('../models/ChatRoom');
const Message = require('../models/Message');
const Regular = require('../models/regularCrew');
const Instant = require('../models/instantCrew');
const service = require('../services/chatService');
const controller = require('../controllers/chatController');
const socketConfig = require('../config/socket');
const { chatSocket } = require('../config/chatSocket');
const userId = '111111111111111111111111';
const otherId = '222222222222222222222222';
const roomId = '333333333333333333333333';
const crewId = '444444444444444444444444';
const room = () => ({ _id: roomId, crewId, crewType: 'regular', type: 'group', members: [{ user: userId }] });

test('withdrawal removes only the departing member; deleting either kind of crew removes its chat', async t => {
    const regularService = require('../services/crew/regularService');
    const instantService = require('../services/crew/instantService');
    const removed = [], deleted = [];
    t.mock.method(service, 'removeMemberFromChatRoom', async (...args) => removed.push(args));
    t.mock.method(service, 'deleteCrewChatRooms', async id => deleted.push(id));
    t.mock.method(Regular, 'findByIdAndUpdate', async () => ({}));
    t.mock.method(Regular, 'findByIdAndDelete', async () => ({}));
    t.mock.method(Instant, 'findByIdAndDelete', async () => ({}));
    t.mock.method(Instant, 'findById', async () => ({ host: userId }));
    await regularService.withdrawMyCrew(crewId, otherId);
    assert.deepEqual(removed, [[crewId, otherId]]);
    await regularService.deleteMyCrew(crewId);
    assert.equal((await instantService.deleteInstantCrew(crewId, userId)).success, true);
    assert.deepEqual(deleted, [crewId, crewId]);
});

test('kicking a participant removes chat membership without deleting the shared room', async t => {
    const instantService = require('../services/crew/instantService');
    const removed = [];
    t.mock.method(Instant, 'findById', async () => ({ host: userId,
        member: { memberList: [{ user: otherId, role: 'member' }] }, save: async () => {} }));
    t.mock.method(service, 'removeMemberFromChatRoom', async (...args) => removed.push(args));
    assert.equal((await instantService.kickMember(crewId, userId, otherId)).success, true);
    assert.deepEqual(removed, [[crewId, otherId]]);
});

test('chat deletion removes stored messages and disconnects current room sockets', async t => {
    const operations = [], events = [];
    t.mock.method(Room, 'find', () => ({ select: async () => [room()] }));
    t.mock.method(Message, 'deleteMany', async query => { operations.push(['messages', query]); });
    t.mock.method(Room, 'deleteMany', async query => { operations.push(['rooms', query]); return { deletedCount: 1 }; });
    const client = { data: { userId }, emit: (...args) => events.push(args), disconnect: () => events.push(['disconnect']) };
    t.mock.method(socketConfig, 'getIO', () => ({ of: namespace => namespace === '/chat'
        ? { in: id => { assert.equal(id, roomId); return { fetchSockets: async () => [client] }; } }
        : { to: id => ({ emit: (...args) => events.push([id, ...args]) }) } }));
    assert.equal((await service.deleteCrewChatRooms(crewId)).deletedCount, 1);
    assert.deepEqual(operations.map(([kind]) => kind), ['messages', 'rooms']);
    assert.deepEqual(operations[0][1], { room: { $in: [roomId] } });
    assert.ok(events.some(event => event[0] === 'room unavailable'));
    assert.ok(events.some(event => event[0] === `user:${userId}`));
    assert.ok(events.some(event => event[0] === 'disconnect'));
});

test('withdrawal disconnects the departed participant and preserves other sockets', async t => {
    let update;
    t.mock.method(Room, 'find', () => ({ select: async () => [room()] }));
    t.mock.method(Room, 'updateMany', async (query, value) => { update = value; });
    const disconnected = [];
    const clients = [userId, otherId].map(id => ({ data: { userId: id }, emit() {}, disconnect: () => disconnected.push(id) }));
    t.mock.method(socketConfig, 'getIO', () => ({ of: namespace => namespace === '/chat'
        ? { in: () => ({ fetchSockets: async () => clients }) }
        : { to: () => ({ emit() {} }) } }));
    await service.removeMemberFromChatRoom(crewId, userId);
    assert.deepEqual(update.$pull.members, { user: userId });
    assert.deepEqual(disconnected, [userId]);
});

test('stale or deleted crew membership blocks reading and sending even if a room member remains', async t => {
    t.mock.method(Room, 'findById', async () => room());
    t.mock.method(Regular, 'exists', async () => null);
    await assert.rejects(service.getChatRoom(roomId, userId), { status: 404 });
    await assert.rejects(service.sendChat(roomId, userId, 'blocked'), { status: 404 });
    let read = false;
    t.mock.method(service, 'getChatRoomList', async () => []);
    t.mock.method(service, 'getMessage', async () => { read = true; });
    let error;
    await controller.openChatRoom({ user: { _id: userId }, query: { roomId } }, {}, value => { error = value; });
    assert.equal(error.status, 404);
    assert.equal(read, false);
});

test('outsiders are rejected while current crew members can open their room', async t => {
    t.mock.method(Room, 'findById', async () => room());
    t.mock.method(Regular, 'exists', async () => ({ _id: crewId }));
    assert.equal((await service.getChatRoom(roomId, userId))._id, roomId);
    await assert.rejects(service.getChatRoom(roomId, otherId), { status: 404 });
    await assert.rejects(service.getChatRoom('invalid', userId), { status: 404 });
});

test('chat lists hide legacy orphan rooms and departed crews', async t => {
    const staleRoomId = '555555555555555555555555';
    const rooms = [room(), { ...room(), crewId: staleRoomId }, { ...room(), crewType: 'instant', crewId: staleRoomId }];
    t.mock.method(Room, 'find', () => {
        const chain = { populate: () => chain, sort: async () => rooms }; return chain;
    });
    t.mock.method(Regular, 'find', query => {
        assert.deepEqual(query.$or, [{ host: userId }, { 'member.memberList.user': userId }]);
        return { select: async () => [{ _id: crewId }] };
    });
    t.mock.method(Instant, 'find', () => ({ select: async () => [] }));
    assert.deepEqual(await service.getChatRoomList(userId), [rooms[0]]);
});

test('chat sockets use the logged-in session rather than the claimed user', async t => {
    let middleware;
    const namespace = { use: fn => { middleware = fn; }, on() {} };
    chatSocket(namespace, {});
    t.mock.method(service, 'getChatRoom', async (id, user) => { assert.equal(id, roomId); assert.equal(user, userId); });
    const socket = { request: { user: { _id: userId, name: 'member' } },
        handshake: { auth: { roomId, userId: otherId } }, data: {} };
    await middleware(socket, error => assert.equal(error, undefined));
    assert.equal(socket.data.userId, userId);
    await middleware({ ...socket, request: {} }, error => assert.ok(error));
});

test('opening and disconnecting a chat does not announce membership changes', () => {
    let connect;
    const broadcasts = [], handlers = {};
    chatSocket({ use() {}, on(event, handler) { if (event === 'connection') connect = handler; } }, {});
    const socket = {
        handshake: { auth: { roomId } }, data: { userId, userName: 'member' },
        join() {}, disconnect() {},
        to() { return { emit: (...args) => broadcasts.push(args) }; },
        on(event, handler) { handlers[event] = handler; }
    };
    connect(socket);
    handlers.disconnect?.();
    assert.deepEqual(broadcasts, []);
    assert.equal(typeof handlers['chat message'], 'function');
});

test('real Socket.io handshake shares Passport login and rejects an anonymous claimed member', { timeout: 6000 }, async t => {
    const express = require('express');
    const session = require('express-session');
    const { Passport } = require('passport');
    const { createServer } = require('node:http');
    const { Server } = require('socket.io');
    const app = express();
    const passport = new Passport();
    passport.serializeUser((user, done) => done(null, user._id));
    passport.deserializeUser((id, done) => done(null, { _id: id, name: 'member' }));
    const sessions = session({ secret: 'chat-lifecycle-test', resave: false, saveUninitialized: false });
    app.use(sessions); app.use(passport.initialize()); app.use(passport.session());
    app.get('/login', (req, res, next) => req.login({ _id: userId }, error => error ? next(error) : res.send('ok')));
    const server = createServer(app);
    const io = new Server(server);
    io.engine.use(sessions); io.engine.use(passport.initialize()); io.engine.use(passport.session());
    chatSocket(io.of('/chat'), io);
    t.mock.method(service, 'getChatRoom', async (id, user) => {
        assert.equal(id, roomId); assert.equal(user, userId); return room();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => io.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login`);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    async function connect(headers) {
        const handshake = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers });
        const { sid } = JSON.parse((await handshake.text()).slice(1));
        const url = `${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`;
        await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' },
            body: `40/chat,${JSON.stringify({ roomId, userId: otherId })}` });
        return (await fetch(url, { headers })).text();
    }
    assert.match(await connect({ Cookie: cookie }), /40\/chat,/);
    assert.match(await connect({}), /44\/chat,.*로그인이 필요합니다/);
});

test('mobile room list controls toggle accessibly and hide after a room is selected', async () => {
    const html = await ejs.renderFile(path.join(__dirname, '../views/chat/chatRoom.ejs'), {
        user: { _id: userId, name: 'member' }, currentUserId: userId, room: room(), chatRoomList: [], messages: [], crewType: 'regular'
    });
    assert.match(html, /aria-controls="chatRoomsPanel" aria-expanded="false"/);
    assert.ok(!html.includes('height:calc(100vh - 120px)'));
    let collapsed = false;
    const attributes = {}, handlers = {};
    const label = {};
    const layout = { classList: { toggle: (name, value) => { collapsed = value; }, contains: () => collapsed } };
    const toggle = { setAttribute: (key, value) => { attributes[key] = value; }, querySelector: () => label,
        addEventListener: (name, callback) => { handlers[name] = callback; } };
    const source = fs.readFileSync(path.join(__dirname, '../public/js/handlers/chatHandler.js'), 'utf8').split('// 날짜 포맷')[0];
    vm.runInNewContext(source, { window: { CHAT_DATA: { user: { _id: userId }, roomId: '' } }, document: {
        getElementById: id => id === 'chatRoomsToggle' ? toggle : {}, querySelector: () => layout, addEventListener() {}
    } });
    handlers.click();
    assert.equal(collapsed, true); assert.equal(attributes['aria-expanded'], 'false');
    assert.equal(label.textContent, '목록 펼치기');
    handlers.click();
    assert.equal(collapsed, false); assert.equal(attributes['aria-expanded'], 'true');
});
