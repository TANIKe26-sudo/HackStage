import { fail, input, limited, member, now, rate, stageProgress, text, type App, type Row } from './core.js';
import { publicProfile } from './profiles.js';
import { mayView } from './media.js';
import { today } from './communication.js';
import { HTTPException } from 'hono/http-exception';

// Additional mobile views use the same authentication, restrictions and media permissions as the main API.
export function registerMobileRoutes(app: App) {
    app.post('/api/passes', async c => {
        await limited(c, 'discovery');
        await rate(c, 'passes', c.get('userId'), 120, 3600);
        const other = text((await input(c)).toUserId, 100, true), me = c.get('userId');
        if (other === me) fail(400, 'invalid_target');
        await publicProfile(c, other);
        await c.env.DB.prepare('INSERT OR IGNORE INTO mobile_profile_passes(user_id,other_id,created_at) VALUES(?,?,?)').bind(me, other, now()).run();
        return c.json({ ok: true });
    });
    app.get('/api/matches/:id', async c => {
        const match = await member(c, c.req.param('id')), me = c.get('userId');
        const profile = await publicProfile(c, match.other), progress = await stageProgress(c.env, match.id);
        const grants = await c.env.DB.prepare(`SELECT owner_id,MAX(stage) AS stage FROM stage_grants WHERE
          ((owner_id=? AND viewer_id=?) OR (owner_id=? AND viewer_id=?)) AND revoked_at IS NULL AND expires_at>? GROUP BY owner_id`).bind(me, match.other, match.other, me, now()).all<Row>();
        const received = grants.results.find(g => g.owner_id === match.other)?.stage ?? 0;
        const given = grants.results.find(g => g.owner_id === me)?.stage ?? 0;
        const rows = await c.env.DB.prepare('SELECT * FROM captures WHERE owner_id=? ORDER BY created_at DESC,stage').bind(match.other).all<Row>();
        const captures: { id: string; stage: number }[] = [];
        for (const row of rows.results) {
            try { await mayView(c, row); captures.push({ id: row.id, stage: row.stage }); }
            catch (error) {
                if (!(error instanceof HTTPException) || error.status >= 500) throw error;
            }
        }
        return c.json({ id: match.id, me, profile: { ...profile, capture_id: profile.initial_capture_id },
          progress: { ...progress, sharedAnswers: progress.sharedDaily }, visibleStage: Math.min(progress.stage, received), grantedStage: given, captures });
    });
    app.get('/api/matches/:id/daily', async c => {
        const match = await member(c, c.req.param('id')), me = c.get('userId');
        const topic = await c.env.DB.prepare('SELECT * FROM daily_topics WHERE topic_date=?').bind(today()).first<Row>();
        const answer = topic ? await c.env.DB.prepare('SELECT answer FROM daily_answers WHERE user_id=? AND topic_id=?').bind(me, topic.id).first() : null;
        const otherAnswer = topic ? await c.env.DB.prepare('SELECT 1 FROM daily_answers WHERE user_id=? AND topic_id=?').bind(match.other, topic.id).first() : null;
        const messages = await c.env.DB.prepare(`SELECT sender_id,body FROM messages WHERE match_id=? AND deleted_at IS NULL AND date(created_at,'+9 hours')=?`).bind(match.id, today()).all<Row>();
        const progress = await stageProgress(c.env, match.id);
        return c.json({ topic, answer, otherAnswered: !!otherAnswer, progress: { ...progress, sharedAnswers: progress.sharedDaily }, tasks: {
          'answer-topic': !!answer, 'receive-reply': messages.results.some(m => m.sender_id !== me),
          'ask-question': messages.results.some(m => m.sender_id === me && /[?？]/.test(m.body)),
        } });
    });
}
