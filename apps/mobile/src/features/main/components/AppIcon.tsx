import { Ionicons } from '@react-native-vector-icons/ionicons';

export type AppIconName =
  | 'search'
  | 'home'
  | 'heart'
  | 'chat'
  | 'profile'
  | 'visibility'
  | 'calendar'
  | 'location'
  | 'hobbies'
  | 'report'
  | 'accountDelete'
  | 'hidePeople'
  | 'chevron'
  | 'undo'
  | 'filter';

type AppIconProps = {
  name: AppIconName;
  size: number;
  color: string;
};

const iconNames = {
  search: 'search-outline',
  home: 'home-outline',
  heart: 'heart-outline',
  chat: 'chatbubble-ellipses-outline',
  profile: 'person-outline',
  visibility: 'lock-closed-outline',
  calendar: 'calendar-outline',
  location: 'location-outline',
  hobbies: 'color-palette-outline',
  report: 'checkmark-outline',
  accountDelete: 'trash-outline',
  hidePeople: 'person-remove-outline',
  chevron: 'chevron-forward-outline',
  undo: 'arrow-undo-outline',
  filter: 'options-outline',
} as const;

export function AppIcon({ name, size, color }: AppIconProps) {
  return <Ionicons name={iconNames[name]} size={size} color={color} />;
}
