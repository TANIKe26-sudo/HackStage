import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export function audit(actorId: string | null, role: string, action: string, targetType: string, targetId: string, metadata: unknown = {}): void {
  db.prepare(`INSERT INTO audit_logs(id,actor_id,actor_role,action,target_type,target_id,metadata_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(), actorId, role, action, targetType, targetId, JSON.stringify(metadata), new Date().toISOString());
}
