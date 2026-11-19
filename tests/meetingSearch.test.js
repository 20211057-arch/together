const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const { CONSTANTS } = require('../config/constants');
const { buildSearchQuery } = require('../utils/meetingSearch');

test('regular keyword search escapes regex characters and supports Korean sports', () => {
    const query = buildSearchQuery('강남 배드민턴 (초보)+.*');
    assert.equal(query.$and.length, 3);
    assert.deepEqual(query.$and[1].$or.at(-1), { sport: { $in: ['badminton'] } });
    const regex = new RegExp(query.$and[2].$or[0].title.$regex);
    assert.ok(regex.test('(초보)+.*'));
    assert.ok(!regex.test('초보oooo'));
    assert.deepEqual(buildSearchQuery({ $ne: '' }), {});
    assert.deepEqual(buildSearchQuery('   '), {});
});

test('regular keyword search combines existing filters before pagination', async () => {
    const Model = require('../models/regularCrew');
    const service = require('../services/crew/regularService');
    const originalCount = Model.countDocuments;
    const originalFind = Model.find;
    const queries = [];
    let skipped;
    Model.countDocuments = async query => { queries.push(query); return 20; };
    Model.find = query => {
        queries.push(query);
        return { sort() { return this; }, skip(value) { skipped = value; return this; }, limit: async () => [] };
    };
    try {
        const result = await service.getRegularAPICrews({ sport: ['badminton'], isRecruiting: true,
            keyword: '강남구 배드민턴' }, 2);
        assert.deepEqual(queries[0], queries[1]);
        assert.equal(queries[0].$and[0].$or[0].title.$regex, '강남구');
        assert.deepEqual(queries[0].sport, { $in: ['badminton'] });
        assert.ok(queries[0].$expr);
        assert.equal(skipped, 9);
        assert.equal(result.totalPages, 3);
    } finally { Model.countDocuments = originalCount; Model.find = originalFind; }
});

test('home keyword search keeps search conditions when loading the next page', async () => {
    const Model = require('../models/regularCrew');
    const service = require('../services/indexService');
    const originalFind = Model.find;
    let query;
    Model.find = input => {
        query = input;
        return { sort() { return this; }, limit: async () => [] };
    };
    try {
        await service.getLatestMeetingsPage('2026-11-20T00:00:00.000Z_111111111111111111111111', '강남 배드민턴');
        assert.equal(query.$and.length, 2);
        assert.equal(query.$or.length, 2);
        assert.deepEqual(query.$and[1].$or.at(-1), { sport: { $in: ['badminton'] } });
    } finally { Model.find = originalFind; }
});

test('instant search matches all keywords across region, title and sport literally', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/meetingSearch.js'), 'utf8');
    const context = { Intl };
    vm.runInNewContext(source.replaceAll('export ', '') + '\nthis.matches = matchesInstantSearch;', context);
    const crew = { sport: 'running', sportKr: '러닝', state: '서울', city: '성동구',
        title: '초보 러닝', intro: '함께 달려요', meetAt: '2026-11-20T16:00:00Z' };
    assert.equal(context.matches(crew, '성동구 러닝'), true);
    assert.equal(context.matches(crew, '서울 초보'), true);
    assert.equal(context.matches(crew, '강남구 러닝'), false);
    assert.equal(context.matches(crew, 'RUNNING'), true);
    assert.equal(context.matches(crew, '.*'), false);
    assert.equal(context.matches(crew, ''), true);
});

test('list templates expose accessible search forms without changing regular rows', async () => {
    const common = { user: null, CONSTANTS };
    const regular = await ejs.renderFile(path.join(__dirname, '../views/crew/regular.ejs'), {
        ...common, regularCrews: [], currentPage: 1, totalPages: 0
    });
    const instant = await ejs.renderFile(path.join(__dirname, '../views/crew/instantCrew.ejs'), {
        ...common, crews: [], pageData: { crews: [], isLoggedIn: false, myCrewIds: [] }
    });
    assert.match(regular, /id="regular-search" role="search"/);
    assert.match(regular, /regular-list-heading/);
    assert.match(regular, />검색<\/button>/);
    assert.ok(!regular.includes('AI 검색'));
    assert.match(instant, /id="instant-search" role="search"/);
    assert.equal((instant.match(/class="map-filter-bar"/g) || []).length, 1);
    assert.ok(instant.indexOf('instant-search-toolbar') < instant.indexOf('class="map-container"'));
});
