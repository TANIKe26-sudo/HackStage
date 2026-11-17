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
  | 'data'
  | 'hidePeople'
  | 'chevron';

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
  data: 'shield-checkmark-outline',
  hidePeople: 'person-remove-outline',
  chevron: 'chevron-forward-outline',
} as const;

export function AppIcon({ name, size, color }: AppIconProps) {
  return <Ionicons name={iconNames[name]} size={size} color={color} />;
}
