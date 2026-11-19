export function imageSql(key, bytes, contentType = 'image/jpeg') {
  if (!bytes.length || bytes.length > 1800000) throw new Error('Image must be between 1 and 1,800,000 bytes');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const object = quote(key);
  const statements = [`INSERT INTO image_objects(object_key,content_type,byte_length,updated_at) VALUES(${object},${quote(contentType)},${bytes.length},datetime('now')) ON CONFLICT(object_key) DO UPDATE SET content_type=excluded.content_type,byte_length=excluded.byte_length,updated_at=excluded.updated_at;`, `DELETE FROM image_chunks WHERE object_key=${object};`];
  for (let offset = 0; offset < bytes.length; offset += 32768) statements.push(`INSERT INTO image_chunks(object_key,chunk_index,data) VALUES(${object},${offset / 32768},X'${bytes.subarray(offset,offset+32768).toString('hex')}');`);
  return statements.join('\n');
}
