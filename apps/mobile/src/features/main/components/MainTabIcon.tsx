import { colors } from '../../../theme/tokens';
import { AppIcon, type AppIconName } from './AppIcon';

export type MainTabIconName = Extract<AppIconName, 'home' | 'search' | 'heart' | 'chat' | 'profile'>;

type MainTabIconProps = {
  name: MainTabIconName;
  selected: boolean;
};

export function MainTabIcon({ name, selected }: MainTabIconProps) {
  return (
    <AppIcon
      name={name}
      size={24}
      color={selected ? colors.primary : colors.mutedText}
    />
  );
}
