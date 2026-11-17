export type ReceivedLike = {
  id: string;
  name: string;
  age: number;
  goal: string;
  area: string;
  classification: string;
};

// Figma 05 Likes received: temporary profiles for screen layout verification.
export const demoReceivedLikes: ReceivedLike[] = [
  {
    id: 'demo-like-ayaka',
    name: 'あやか',
    age: 27,
    goal: '真剣交際',
    area: '東京都内',
    classification: '喉仏なし',
  },
  {
    id: 'demo-like-saki',
    name: 'さき',
    age: 30,
    goal: 'ゆっくり交際',
    area: '埼玉県内',
    classification: '喉仏なし',
  },
  {
    id: 'demo-like-emi',
    name: 'えみ',
    age: 28,
    goal: '将来を考えた交際',
    area: '千葉県内',
    classification: '喉仏なし',
  },
];
