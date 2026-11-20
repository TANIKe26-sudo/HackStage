import { fail, input, limited, member, now, rate, stageProgress, text, type App, type Ctx, type Row } from './core.js';
import { publicProfile } from './profiles.js';
import { mayView } from './media.js';
import { today } from './communication.js';
import { HTTPException } from 'hono/http-exception';

async function latestSwipe(c: Ctx) {
    const me = c.get('userId');
    return c.env.DB.prepare(`WITH viewer AS (SELECT ? AS id), swipes AS (
      SELECT other_id AS candidate_id,'pass' AS action,created_at FROM mobile_profile_passes WHERE user_id=(SELECT id FROM viewer)
      UNION ALL
      SELECT to_user AS candidate_id,'like' AS action,created_at FROM likes WHERE from_user=(SELECT id FROM viewer)
    ) SELECT s.candidate_id,s.action FROM swipes s JOIN users u ON u.id=s.candidate_id CROSS JOIN viewer v
    WHERE u.status='active'
      AND NOT EXISTS(SELECT 1 FROM matches m WHERE (m.user_low=v.id AND m.user_high=s.candidate_id) OR (m.user_low=s.candidate_id AND m.user_high=v.id))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=v.id AND b.blocked_id=s.candidate_id) OR (b.blocker_id=s.candidate_id AND b.blocked_id=v.id))
      AND NOT EXISTS(SELECT 1 FROM user_contact_identifiers ci JOIN contact_hides ch ON ch.contact_hash=ci.contact_hash
        WHERE (ch.user_id=v.id AND ci.user_id=s.candidate_id) OR (ch.user_id=s.candidate_id AND ci.user_id=v.id))
      AND NOT EXISTS(SELECT 1 FROM user_limits l WHERE l.user_id=s.candidate_id AND l.revoked_at IS NULL AND l.expires_at>? AND l.scope IN ('all','discovery'))
    ORDER BY s.created_at DESC,s.candidate_id DESC LIMIT 1`).bind(me, now()).first<Row>();
}

// Additional mobile views use the same authentication, restrictions and media permissions as the main API.
export function registerMobileRoutes(app: App) {
    app.get('/api/swipes/last', async c => {
        await limited(c, 'discovery');
        c.header('Cache-Control', 'private, no-store');
        const latest = await latestSwipe(c);
        if (!latest) return c.json({ lastSwipe: null, profile: null });
        let undoable = true;
        let profile: Row | null = null;
        const hidden = await c.env.DB.prepare(`SELECT 1 FROM user_contact_identifiers ci JOIN contact_hides ch ON ch.contact_hash=ci.contact_hash
          WHERE (ch.user_id=? AND ci.user_id=?) OR (ch.user_id=? AND ci.user_id=?) LIMIT 1`)
            .bind(c.get('userId'), latest.candidate_id, latest.candidate_id, c.get('userId')).first();
        try { if (!hidden) profile = await publicProfile(c, latest.candidate_id); }
        catch (error) {
            if (!(error instanceof HTTPException && error.status === 404)) throw error;
        }
        if (!profile) undoable = false;
        if (undoable && latest.action === 'like') {
            const [low, high] = [c.get('userId'), latest.candidate_id].sort();
            undoable = !await c.env.DB.prepare('SELECT 1 FROM matches WHERE user_low=? AND user_high=?').bind(low, high).first();
        }
        if (!undoable) return c.json({ lastSwipe: null, profile: null });
        return c.json({ lastSwipe: { candidateId: latest.candidate_id, undoable: true }, profile });
    });
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

        const [low, high] = [me, other].sort();
        if (await c.env.DB.prepare('SELECT 1 FROM matches WHERE user_low=? AND user_high=?').bind(low, high).first()) fail(409, 'swipe_undo_matched');
        const latest = await latestSwipe(c);
        if (!latest) throw new HTTPException(409, { message: 'swipe_undo_not_last' });
        if (latest.candidate_id !== other) fail(409, 'swipe_undo_not_last');

        const profile = await publicProfile(c, other);
        if (latest.action === 'like') {
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
