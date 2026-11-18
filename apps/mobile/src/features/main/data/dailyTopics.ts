export type DailyTopicTask = {
  id: string;
  label: string;
};

export const dailyTopicQuestion = '最近うれしかったことは？';

export const dailyTopicTasks: DailyTopicTask[] = [
  { id: 'answer-topic', label: '今日のお題に回答' },
  { id: 'receive-reply', label: '相手から返信が来る' },
  { id: 'ask-question', label: '相手へ質問を1つ送る' },
];
