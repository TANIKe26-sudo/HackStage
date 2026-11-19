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
    app.post('/api/swipes/undo', async c => {
        await limited(c, 'discovery');
        const me = c.get('userId'), other = text((await input(c)).toUserId, 100, true);
        await rate(c, 'swipe-undo', me, 60, 3600);
        if (other === me) fail(400, 'invalid_target');

        const latest = await c.env.DB.prepare(`SELECT candidate_id,action FROM (
          SELECT other_id AS candidate_id,'pass' AS action,created_at FROM mobile_profile_passes WHERE user_id=?
          UNION ALL
          SELECT to_user AS candidate_id,'like' AS action,created_at FROM likes WHERE from_user=?
        ) ORDER BY created_at DESC LIMIT 1`).bind(me, me).first<Row>();
        if (!latest) throw new HTTPException(409, { message: 'swipe_undo_not_last' });
        if (latest.candidate_id !== other) fail(409, 'swipe_undo_not_last');

        const profile = await publicProfile(c, other);
        if (latest.action === 'like') {
            const [low, high] = [me, other].sort();
            const match = await c.env.DB.prepare('SELECT 1 FROM matches WHERE user_low=? AND user_high=?').bind(low, high).first();
            if (match) fail(409, 'swipe_undo_matched');
            await c.env.DB.batch([
                c.env.DB.prepare('DELETE FROM likes WHERE from_user=? AND to_user=?').bind(me, other),
                c.env.DB.prepare("DELETE FROM notifications WHERE user_id=? AND kind='like' AND json_extract(payload,'$.fromUserId')=?").bind(other, me),
                c.env.DB.prepare("DELETE FROM push_jobs WHERE user_id=? AND kind='like' AND status='queued' AND json_extract(payload,'$.fromUserId')=?").bind(other, me),
            ]);
        } else {
            await c.env.DB.prepare('DELETE FROM mobile_profile_passes WHERE user_id=? AND other_id=?').bind(me, other).run();
        }
        return c.json({ undone: true, candidateId: other, profile });
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
