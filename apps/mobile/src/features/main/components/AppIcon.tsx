import { Ionicons } from '@react-native-vector-icons/ionicons';

export type AppIconName =
  | 'search'
  | 'heart'
  | 'chat'
  | 'profile'
  | 'profileEdit'
  | 'visibility'
  | 'calendar'
  | 'location'
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
  heart: 'heart-outline',
  chat: 'chatbubble-ellipses-outline',
  profile: 'person-outline',
  profileEdit: 'person-outline',
  visibility: 'lock-closed-outline',
  calendar: 'calendar-outline',
  location: 'location-outline',
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
