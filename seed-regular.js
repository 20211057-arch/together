// seed-regular.js
const mongoose = require('mongoose');
const regularCrew = require('./models/regularCrew'); // 실제 경로에 맞게 수정
require('dotenv').config();

const MY_USER_ID = '6aa39e5408d9dfc897445374';

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);

    const samples = [
        {
            title: '월요일 야간 축구 정기 모임',
            intro: '매주 월요일 저녁 8시, 초중급 환영',
            host: MY_USER_ID,
            member: {
                capacity: 12,
                memberList: [
                    { user: MY_USER_ID, joinedAt: new Date() }
                ]
            },
            isAutoAccept: true,
            period: 'week',
            day: ['mon'],
            ageRange: ['20s', '30s'],
            address: { state: '경기도', city: '수원시', detail: '수원종합운동장 보조구장' },
            sport: 'soccer', // CONSTANTS.SPORTS 실제 키 확인 후 수정
            fee: 5000,
            level: 'mid'
        },
        {
            title: '주 2회 배드민턴 클럽',
            intro: '화/목 저녁, 레벨 상관없이 모집',
            host: MY_USER_ID,
            member: {
                capacity: 8,
                memberList: [
                    { user: MY_USER_ID, joinedAt: new Date() }
                ]
            },
            isAutoAccept: false,
            period: 'week',
            day: ['tue', 'thu'],
            ageRange: ['all'],
            address: { state: '경기도', city: '포천시', detail: '실내체육관 2층' },
            sport: 'badminton',
            fee: 0,
            level: 'low'
        },
        {
            title: '격주 주말 농구 모임',
            intro: '토요일 오전, 격주로 진행',
            host: MY_USER_ID,
            member: {
                capacity: 10,
                memberList: [
                    { user: MY_USER_ID, joinedAt: new Date() }
                ]
            },
            isAutoAccept: true,
            period: '2week',
            day: ['sat'],
            ageRange: ['20s'],
            address: { state: '경기도', city: '포천시', detail: '' },
            sport: 'basketball',
            fee: 3000,
            level: 'high'
        }
    ];

    await regularCrew.insertMany(samples);
    console.log(`${samples.length}건 삽입 완료`);
    await mongoose.disconnect();
}

seed().catch(err => {
    console.error(err);
    mongoose.disconnect();
});