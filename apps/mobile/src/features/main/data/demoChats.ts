export type ChatMessage = {
  id: string;
  sender: 'them' | 'me';
  text: string;
  time: string;
};

// Temporary sample messages until the chat API is connected.
export const demoChats: Record<string, ChatMessage[]> = {
  'demo-conversation-yuka': [
    { id: 'yuka-1', sender: 'them', text: 'マッチングありがとう！よろしくね☺️', time: '10:32' },
    { id: 'yuka-2', sender: 'me', text: 'こちらこそ、よろしくお願いします！', time: '10:36' },
    { id: 'yuka-3', sender: 'them', text: '今日はどんな一日だった？', time: '10:40' },
  ],
  'demo-conversation-aya': [
    { id: 'aya-1', sender: 'them', text: 'はじめまして！マッチングありがとう☺️', time: '昨日' },
    { id: 'aya-2', sender: 'me', text: 'こちらこそ、よろしくね！', time: '昨日' },
  ],
  'demo-conversation-saki': [
    { id: 'saki-1', sender: 'me', text: 'プロフィールの趣味、気になりました！', time: '日曜' },
    { id: 'saki-2', sender: 'them', text: '喉仏の話、面白いね', time: '日曜' },
  ],
};
