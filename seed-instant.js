// seed-instant.js
const mongoose = require('mongoose');
const instantCrew = require('./models/instantCrew'); // 실제 경로에 맞게 수정
require('dotenv').config();

const MY_USER_ID = '6aa39e5408d9dfc897445374'; // MongoDB Compass에서 본인 계정 _id 복사

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI); // .env의 실제 변수명에 맞게 수정

    const now = new Date();
    const samples = [
        {
            title: '한강 야간 러닝 번개1',
            intro: '가볍게 5km 뛰고 치킨 먹을 사람 모집1',
            meetAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2일 후 (미래 → 목록에 표시됨)
            host: MY_USER_ID,
            member: {
                capacity: 6,
                memberList: [
                    { user: MY_USER_ID, role: 'host', status: 'confirmed' }
                ]
            },
            address: {
                state: '경기도', city: '포천시', detail: '반월아트홀 앞',
                lat: 37.8949, lng: 127.2003
            },
            sport: 'soccer', // enum(SPORTS_EN) 실제 값 확인 후 수정
            avgReputation: 4.2
        },
        {
            title: '주말 오전 배드민턴1',
            intro: '초보 환영, 라켓 있으신 분1',
            meetAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5일 후
            host: MY_USER_ID,
            member: {
                capacity: 4,
                memberList: [
                    { user: MY_USER_ID, role: 'host', status: 'confirmed' }
                ]
            },
            address: {
                state: '경기도', city: '포천시', detail: '실내체육관 2층',
                lat: 37.8955, lng: 127.2015
            },
            sport: 'badminton',
            avgReputation: 0
        },
        {
            title: '지난주 지난 번개 모임1',
            intro: '이미 끝난 모임 - 필터링 테스트용1',
            meetAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 과거 → upcomingInstantCrews에서 걸러져야 정상
            host: MY_USER_ID,
            member: {
                capacity: 4,
                memberList: [
                    { user: MY_USER_ID, role: 'host', status: 'confirmed' }
                ]
            },
            address: {
                state: '경기도', city: '포천시', detail: '',
                lat: 37.89, lng: 127.2
            },
            sport: 'basketball',
            avgReputation: 3.8
        }
    ];

    await instantCrew.insertMany(samples);
    console.log(`${samples.length}건 삽입 완료`);
    await mongoose.disconnect();
}

seed().catch(err => {
    console.error(err);
    mongoose.disconnect();
});