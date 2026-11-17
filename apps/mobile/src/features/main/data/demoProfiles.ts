export type DiscoverProfile = {
  id: string;
  name: string;
  age: number;
  area: string;
  goal: string;
  classification: string;
};

// Local fixtures for checking the Discover UI before authentication and API wiring are ready.
export const demoProfiles: DiscoverProfile[] = [
  {
    id: 'demo-yuka',
    name: 'ゆうか',
    age: 28,
    area: '東京都内',
    goal: '真剣交際',
    classification: '喉仏なし',
  },
  {
    id: 'demo-ayaka',
    name: 'あやか',
    age: 27,
    area: '東京都内',
    goal: 'ゆっくり交際',
    classification: '喉仏なし',
  },
  {
    id: 'demo-saki',
    name: 'さき',
    age: 30,
    area: '埼玉県内',
    goal: '将来を考えた交際',
    classification: '喉仏なし',
  },
];
