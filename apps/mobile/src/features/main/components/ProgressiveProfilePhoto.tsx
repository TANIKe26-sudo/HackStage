import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';

const photoHeight = 338;
const revealedHeightByStage = [0, 38, 88, 198, photoHeight];

export function ProgressiveProfilePhoto({
  intimacyStage,
  onUnlock,
}: {
  intimacyStage: number;
  onUnlock: () => void;
}) {
  const revealedHeight = revealedHeightByStage[intimacyStage] ?? photoHeight;
  const lockedHeight = photoHeight - revealedHeight;

  return (
    <View style={styles.frame}>
      <View style={[styles.noImageArea, { height: revealedHeight }]}>
        {revealedHeight > 0 ? <Text style={styles.noImageLabel}>No image</Text> : null}
      </View>

      {lockedHeight > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="タップして次の公開段階をデモで解放"
          onPress={onUnlock}
          style={({ pressed }) => [styles.lockedArea, { height: lockedHeight }, pressed && styles.pressed]}
        >
          <View style={styles.lockedContent}>
            <Ionicons name="lock-closed-outline" size={26} color={colors.primary} />
            <Text style={styles.lockedMessage}>会話を続けると顔の公開が進みます</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: photoHeight,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: '#F2E5D8',
  },
  noImageArea: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E5D8',
  },
  noImageLabel: {
    color: colors.mutedText,
    fontSize: 13,
  },
  lockedArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  lockedContent: {
    alignItems: 'center',
    gap: 8,
  },
  lockedMessage: {
    color: colors.primary,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
