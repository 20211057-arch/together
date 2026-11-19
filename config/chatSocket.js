const messageService = require('../services/chatService');
const ChatRoom = require('../models/ChatRoom');

function chatSocket(chat, io) {
    chat.use(async (socket, next) => {
        try {
            const user = socket.request.user;
            if (!user) return next(new Error('로그인이 필요합니다.'));
            await messageService.getChatRoom(socket.handshake.auth.roomId, user._id);
            socket.data.userId = String(user._id);
            socket.data.userName = user.name;
            next();
        } catch (error) {
            const denied = new Error('참여 중인 채팅방이 아닙니다.');
            denied.data = { status: error.status, roomId: socket.handshake.auth.roomId };
            next(denied);
        }
    });
    chat.on('connection', (socket) => {
        const roomId = socket.handshake.auth.roomId;
        const userId = socket.data.userId;
        const userName = socket.data.userName;

        if (!roomId || roomId === "" || !userId) {
            return socket.disconnect();
        }

        socket.join(roomId);

        socket.to(roomId).emit("join", {
            user: "system",
            chat: `${userName}님이 접속하였습니다.`
        });

        socket.on('chat message', async (msg) => {
            try {
                if (typeof msg !== 'string' || !msg.trim()) return;

                const saveChat = await messageService.sendChat(roomId, userId, msg.trim());

                // 같은 방 전체에게 메시지 전송
                chat.in(roomId).emit('chat message', {
                    _id: saveChat._id,
                    userId: userId,
                    userName: userName,
                    chat: saveChat.content,
                    createdAt: saveChat.createdAt,
                    roomId: roomId
                });

                // isMuted false인 멤버들에게 알림 emit
                const room = await ChatRoom.findById(roomId).populate('members.user', 'name');
                if (room) {
                    room.members.forEach(member => {
                        if (!member.user || String(member.user._id) === String(userId)) return; // 본인 제외
                        if (member.isMuted) return; // 뮤트된 멤버 제외

                        //네임스페이스로 알림 쏘기
                        const notiNamespace = io.of('/noti');
                        notiNamespace.to(`user:${member.user._id.toString()}`).emit('chat noti', {
                            roomId: roomId,
                            roomName: room.name,
                            senderName: userName,
                            content: saveChat.content
                        });
                    });
                }

            } catch (error) {
                if (error.status === 404) {
                    socket.emit('room unavailable', { roomId });
                    return socket.disconnect();
                }
                console.error('메시지 처리 오류:', error);
            }
        });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('exit', {
                user: 'system',
                chat: `${userName}님이 퇴장하셨습니다`,
            });
        });
    });
}

module.exports = { chatSocket };
