import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';

type IntimacyStageRowProps = {
  stageNumber: number;
  label: string;
  intimacyStage: number;
  onUnlock: () => void;
};

export function IntimacyStageRow({
  stageNumber,
  label,
  intimacyStage,
  onUnlock,
}: IntimacyStageRowProps) {
  const isUnlocked = stageNumber <= intimacyStage;
  const isNextStage = stageNumber === intimacyStage + 1;
  const content = (
    <>
      <View style={[styles.numberCircle, isUnlocked ? styles.unlockedCircle : styles.lockedCircle]}>
        <Text style={[styles.number, isUnlocked ? styles.unlockedNumber : styles.lockedNumber]}>
          {String(stageNumber).padStart(2, '0')}
        </Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.status, isUnlocked ? styles.unlockedStatus : styles.lockedStatus]}>
        {isUnlocked ? '公開中' : 'ロック'}
      </Text>
    </>
  );

  if (isNextStage) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}の公開条件を確認`}
        onPress={onUnlock}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberCircle: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
  },
  unlockedCircle: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  lockedCircle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  number: {
    fontSize: 9,
  },
  unlockedNumber: {
    color: colors.primary,
  },
  lockedNumber: {
    color: colors.mutedText,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    marginLeft: 13,
  },
  status: {
    width: 88,
    fontSize: 10,
    textAlign: 'right',
    marginRight: 11,
  },
  unlockedStatus: {
    color: '#5C7D63',
  },
  lockedStatus: {
    color: colors.mutedText,
  },
  pressed: {
    opacity: 0.7,
  },
});
