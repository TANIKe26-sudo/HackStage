export const prefectureNames: Record<string, string> = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県', '06': '山形県', '07': '福島県',
  '08': '茨城県', '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県',
  '15': '新潟県', '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県', '21': '岐阜県',
  '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県',
  '29': '奈良県', '30': '和歌山県', '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
  '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県', '41': '佐賀県', '42': '長崎県',
  '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
};

export const locationRanges = ['same_prefecture', 'same_region', 'anywhere'] as const;
export type LocationRange = typeof locationRanges[number];

export function isLocationRange(value: unknown): value is LocationRange {
  return typeof value === 'string' && locationRanges.includes(value as LocationRange);
}

export function prefectureRegionSql(alias: 'p' | 'own') {
  return `CASE
    WHEN ${alias}.prefecture_code = '01' THEN 'hokkaido'
    WHEN ${alias}.prefecture_code IN ('02','03','04','05','06','07') THEN 'tohoku'
    WHEN ${alias}.prefecture_code IN ('08','09','10','11','12','13','14') THEN 'kanto'
    WHEN ${alias}.prefecture_code IN ('15','16','17','18','19','20','21','22','23') THEN 'chubu'
    WHEN ${alias}.prefecture_code IN ('24','25','26','27','28','29','30') THEN 'kansai'
    WHEN ${alias}.prefecture_code IN ('31','32','33','34','35') THEN 'chugoku'
    WHEN ${alias}.prefecture_code IN ('36','37','38','39') THEN 'shikoku'
    WHEN ${alias}.prefecture_code IN ('40','41','42','43','44','45','46','47') THEN 'kyushu_okinawa'
  END`;
}
