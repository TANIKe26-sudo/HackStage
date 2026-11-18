export type ThroatClassification = 'present' | 'absent' | 'pending';
export type ClassificationResult = {
  classification: ThroatClassification;
  reason: string;
  requiresUserConfirmation: true;
  referenceVersion: string;
};
export const classificationLabels: Record<ThroatClassification, string> = {
  present: '喉仏の突出が見える', absent: '喉仏の突出が目立たない', pending: '判定保留',
};
export function classificationReason(reason: string) {
  const labels: Record<string, string> = {
    visible_prominence: '首の前側に局所的な突出が見えるという推定です。',
    no_distinct_prominence: '画像では明確な突出が目立たないという推定です。実際に存在しないことを示すものではありません。',
    neck_not_visible: '首の前側が十分に写っていません。位置を調整して撮り直してください。',
    blurred: '画像が不鮮明です。ピントと明るさを確認してください。',
    occluded: '衣服などで首周りが隠れています。',
    ambiguous: 'この画像では十分に判断できません。角度や明るさを調整して撮り直してください。',
    invalid_model_response: 'AIから有効な判定を取得できませんでした。',
  };
  return labels[reason] ?? labels.ambiguous;
}
