import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';
import { AppIcon, type AppIconName } from './AppIcon';

type ProfileSettingRowProps = {
  icon: Extract<
    AppIconName,
    'profileEdit' | 'visibility' | 'calendar' | 'location' | 'report' | 'data' | 'hidePeople'
  >;
  label: string;
};

export function ProfileSettingRow({ icon, label }: ProfileSettingRowProps) {
  return (
    <View accessible accessibilityLabel={label} style={styles.row}>
      <AppIcon name={icon} size={20} color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
      <AppIcon name="chevron" size={18} color={colors.mutedText} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
