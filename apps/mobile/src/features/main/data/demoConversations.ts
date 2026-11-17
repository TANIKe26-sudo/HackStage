export type Conversation = {
  id: string;
  name: string;
  lastMessage: string;
  updatedAt: string;
  hasUnread: boolean;
};

// Figma 06 Matches: temporary rows while the conversation API is not connected.
export const demoConversations: Conversation[] = [
  {
    id: 'demo-conversation-yuka',
    name: 'ゆうか',
    lastMessage: '今日はどんな一日だった？',
    updatedAt: '10:40',
    hasUnread: true,
  },
  {
    id: 'demo-conversation-aya',
    name: 'あや',
    lastMessage: 'はじめまして、よろしくね',
    updatedAt: '昨日',
    hasUnread: false,
  },
  {
    id: 'demo-conversation-saki',
    name: 'さき',
    lastMessage: '喉仏の話、面白いね',
    updatedAt: '日曜',
    hasUnread: false,
  },
];
