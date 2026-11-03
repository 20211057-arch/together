const homeService = require('../services/indexService');
const aiSearchService = require('../services/aiSearchService');

exports.aiSearch = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ ok: true, meetings: [], filter: null });

        const filter = await aiSearchService.parseSearchQuery(q);
        const meetings = await homeService.searchCrewsByAI(filter);
        res.json({ ok: true, meetings, filter });
    } catch (err) {
        next(err);
    }
};

exports.getHome = async (req, res, next) => {
    try {
        const [aiMeetings, latestPage, leafletMatches, stats, sportChips, liveFeed] =
            await Promise.all([
                homeService.getAIRecommendedMeetings(req.user?._id),
                homeService.getLatestMeetingsPage(),
                homeService.getLeafletMatches(),
                homeService.getStats(),
                homeService.getSportChips(),
                homeService.getLiveFeed()
            ]);
        stats.activeCount = req.app.locals.activeUserCount || 0;

        const mySchedule = req.user
            ? await homeService.getMySchedule(req.user._id)
            : [];

        const myStats = req.user
            ? await homeService.getMyStats(req.user._id)
            : null;

        res.render('index', {
            featuredMeetings: aiMeetings.featured,
            latestMeetings: latestPage.meetings,
            latestNextCursor: latestPage.nextCursor,
            leafletMatches,
            stats,
            sportChips,
            mySchedule,
            myStats,
            liveFeed,
            isAIRecommended: !!req.user
        });

    } catch (err) {
        next(err);
    }
};

// 정기모임-api
exports.getLatestMeetingsApi = async (req, res, next) => {
    try {
        const cursor = req.query.cursor || '';
        if (typeof cursor !== 'string' || cursor.length > 100) {
            return res.status(400).json({ ok: false });
        }
        const page = await homeService.getLatestMeetingsPage(cursor);
        res.json({ ok: true, ...page });
    } catch (err) {
        next(err);
    }
};

exports.getRegularMeetingsApi = async (req, res, next) => {
    try {
        const sport = req.query.sport || '';
        const result = await homeService.getAIRecommendedMeetings(req.user?._id, 10, 40, sport);
        const meetings = [...result.featured, ...result.grid];
        res.json({ ok: true, meetings });
    } catch (err) {
        next(err);
    }
};
