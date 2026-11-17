import { Ionicons } from '@react-native-vector-icons/ionicons';

import { colors } from '../../../theme/tokens';

export type MainTabIconName = 'search' | 'heart' | 'chat' | 'profile';

type MainTabIconProps = {
  name: MainTabIconName;
  selected: boolean;
};

const iconNames = {
  search: 'search-outline',
  heart: 'heart-outline',
  chat: 'chatbubble-ellipses-outline',
  profile: 'person-outline',
} as const;

export function MainTabIcon({ name, selected }: MainTabIconProps) {
  return (
    <Ionicons
      name={iconNames[name]}
      size={24}
      color={selected ? colors.primary : colors.mutedText}
    />
  );
}
