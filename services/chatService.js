const mongoose = require('mongoose');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');

async function getChatRoomList(userId, crewType = null) {
    if (!userId) {
        const error = new Error('존재하지 않는 사용자입니다.');
        error.status = 400;
        throw error;
    }

    const query = { "members.user": userId };
    
    if (crewType === 'instant') {
        query.crewType = 'instant';
    } else if (crewType === 'regular') {
        query.$or = [
            { crewType: 'regular' },
            { crewType: null },
            { crewType: { $exists: false } }
        ];
    }

    const chatRoom = await ChatRoom.find(query)
        .populate('members.user', 'name')
        .populate('lastMessage', 'content')
        .sort({ lastMessageAt: -1 });

    // Hide stale rooms left behind by old withdrawal/deletion paths.
    const RegularCrew = require('../models/regularCrew');
    const InstantCrew = require('../models/instantCrew');
    const membership = { $or: [{ host: userId }, { 'member.memberList.user': userId }] };
    const [regular, instant] = await Promise.all([
        RegularCrew.find({ _id: { $in: chatRoom.filter(r => r.crewType !== 'instant').map(r => r.crewId).filter(Boolean) }, ...membership }).select('_id'),
        InstantCrew.find({ _id: { $in: chatRoom.filter(r => r.crewType === 'instant').map(r => r.crewId).filter(Boolean) }, ...membership }).select('_id')
    ]);
    const regularIds = new Set(regular.map(c => String(c._id)));
    const instantIds = new Set(instant.map(c => String(c._id)));
    return chatRoom.filter(room => room.type === 'direct' || (room.crewType === 'instant' ? instantIds : regularIds).has(String(room.crewId)));
}

async function getMessage (roomId) {
    if (!roomId) {
        const error = new Error ('존재하지 않는 방입니다.');
        error.status = 400;
        throw error;
    }

    const chatMessage = await Message.find({ room: new mongoose.Types.ObjectId(roomId) })
                                    .select('sender content isRead createdAt')
                                    .populate('sender', 'name')
                                    .sort({ createdAt : 1 });
    
    return chatMessage;
};

// 채팅을 치면 DB에 저장
async function sendChat (room, sender, content, isRead) {
    await getChatRoom(room, sender);
    const chat = new Message({room, sender, content, isRead});
    await chat.save();

    // lastMessage
    await ChatRoom.findByIdAndUpdate(room, {
        lastMessage: chat._id,
        lastMessageAt: new Date(),
    });

    return chat;
}

// 크루 생성 시 채팅방 생성
async function createChatRoom(crewId, crewName, hostId, crewType = 'regular') {
    const room = await ChatRoom.create({
        name: crewName,
        members: [{ user: hostId, isMuted: false }],
        type: 'group',
        crewId: crewId,
        crewType: crewType
    });
    return room;
}

// 가입 승인 시 채팅방에 멤버 추가
async function addMemberToChatRoom(crewId, userId) {
    await ChatRoom.findOneAndUpdate(
        { crewId: crewId, 'members.user': { $ne: userId } },
        { $push: { members: { user: userId, isMuted: false } } }
    );
}

async function notifyRoomRemoved(rooms, userId = null) {
    const io = require('../config/socket').getIO();
    if (!io) return;
    for (const room of rooms) {
        const roomId = String(room._id);
        const recipients = userId ? [userId] : room.members.map(member => member.user?._id || member.user).filter(Boolean);
        for (const recipient of recipients) {
            io.of('/noti').to(`user:${recipient}`).emit('chat room removed', { roomId });
        }
        const sockets = await io.of('/chat').in(roomId).fetchSockets();
        for (const socket of sockets) {
            if (userId && String(socket.data.userId) !== String(userId)) continue;
            socket.emit('room unavailable', { roomId });
            socket.disconnect();
        }
    }
}

async function removeMemberFromChatRoom(crewId, userId) {
    const rooms = await ChatRoom.find({ crewId, 'members.user': userId }).select('_id members');
    await ChatRoom.updateMany({ crewId }, { $pull: { members: { user: userId }, noticeOffMembers: userId } });
    await notifyRoomRemoved(rooms, userId);
}

async function deleteCrewChatRooms(crewIds) {
    const rooms = await ChatRoom.find({ crewId: { $in: Array.isArray(crewIds) ? crewIds : [crewIds] } }).select('_id members');
    if (!rooms.length) return { deletedCount: 0 };
    const roomIds = rooms.map(room => room._id);
    await Message.deleteMany({ room: { $in: roomIds } });
    const result = await ChatRoom.deleteMany({ _id: { $in: roomIds } });
    await notifyRoomRemoved(rooms);
    return result;
}

// 회원 탈퇴 시 채팅방 처리
async function handleUserDeleted(userId) {
    const objectId = new mongoose.Types.ObjectId(userId);
    
    await ChatRoom.updateMany(
        { "members.user": objectId },
        { $pull: { members: { user: objectId }, noticeOffMembers: objectId } }
    );

    await ChatRoom.deleteMany({ members: { $size: 0 } }); // members가 0명이 된 채팅방 삭제

    await Message.updateMany(
        { sender: objectId },
        { $set: { sender: null } } //알수없음 표시
    );
}

// roomId에 해당하는 채팅방 단건 조회
async function getChatRoom (roomId, userId) {
    // roomId 없으면 에러
    if (!mongoose.isObjectIdOrHexString(roomId) || !mongoose.isObjectIdOrHexString(userId)) {
        const error = new Error ('존재하지 않는 방입니다.');
        error.status = 404;
        throw error;
    }
    // roomId로 채팅방 조회 후 반환
    const room = await ChatRoom.findById(new mongoose.Types.ObjectId(roomId));
    if (!room || !room.members.some(member => String(member.user?._id || member.user) === String(userId))) {
        throw Object.assign(new Error('참여 중인 채팅방이 아닙니다.'), { status: 404 });
    }
    if (room.type !== 'direct') {
        const Crew = room.crewType === 'instant' ? require('../models/instantCrew') : require('../models/regularCrew');
        const exists = room.crewId && await Crew.exists({ _id: room.crewId,
            $or: [{ host: userId }, { 'member.memberList.user': userId }] });
        if (!exists) throw Object.assign(new Error('탈퇴하거나 삭제된 모임의 채팅방입니다.'), { status: 404 });
    }
    return room;
}

async function getCrewSport(crewId, crewType) {
    const InstantCrew = require('../models/instantCrew');
    const RegularCrew = require('../models/regularCrew');
    const crew = crewType === 'instant'
        ? await InstantCrew.findById(crewId).select('sport')
        : await RegularCrew.findById(crewId).select('sport');
    return crew?.sport || null;
}

module.exports = { getChatRoomList, getChatRoom, getMessage, sendChat, createChatRoom, addMemberToChatRoom, handleUserDeleted, getCrewSport, removeMemberFromChatRoom, deleteCrewChatRooms };


