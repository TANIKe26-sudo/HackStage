import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import type { MatchRow } from '../api/client';
import { ProtectedPhoto } from './ProtectedPhoto';

export function MatchSelectorRow({
  match,
  selected,
  onPress,
}: {
  match: MatchRow;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={match.display_name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.photo}>
        <ProtectedPhoto captureId={match.capture_id} />
      </View>
      <Text numberOfLines={1} style={styles.name}>
        {match.display_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 11,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  photo: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
