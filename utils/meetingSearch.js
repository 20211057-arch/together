const { CONSTANTS } = require('../config/constants');

function buildSearchQuery(input) {
    if (typeof input !== 'string' || !input.trim()) return {};
    const words = input.slice(0, 200).trim().toLowerCase().split(/\s+/);
    return { $and: words.map(word => {
        const keyword = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const alternatives = ['title', 'intro', 'address.state', 'address.city', 'address.detail', 'sport']
            .map(field => ({ [field]: { $regex: keyword, $options: 'i' } }));
        const sports = Object.entries(CONSTANTS.SPORTS)
            .filter(([, sport]) => sport.kr.includes(word)).map(([key]) => key);
        if (sports.length) alternatives.push({ sport: { $in: sports } });
        return { $or: alternatives };
    }) };
}

module.exports = { buildSearchQuery };
