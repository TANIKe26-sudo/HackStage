import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import type { ReceivedLike } from '../data/demoReceivedLikes';

type ReceivedLikeCardProps = {
  profile: ReceivedLike;
  onMatch: () => void;
  onDecline: () => void;
};

export function ReceivedLikeCard({ profile, onMatch, onDecline }: ReceivedLikeCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.photoPlaceholder}>
        <Text style={styles.noImage}>No image</Text>
      </View>

      <View style={styles.profileInfo}>
        <Text numberOfLines={1} style={styles.name}>
          {profile.name} ({profile.age})
        </Text>
        <Text numberOfLines={1} style={styles.area}>
          {profile.goal}・{profile.area}
        </Text>
        <Text numberOfLines={1} style={styles.classification}>
          {profile.classification}
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.name}さんとマッチングする`}
            onPress={onMatch}
            style={({ pressed }) => [styles.matchButton, pressed && styles.pressed]}
          >
            <Text style={styles.matchButtonLabel}>マッチングする</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.name}さんを断る`}
            onPress={onDecline}
            style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}
          >
            <Text style={styles.declineButtonLabel}>断る</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 122,
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 8,
  },
  photoPlaceholder: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    backgroundColor: '#F2E5D8',
  },
  noImage: {
    color: colors.mutedText,
    fontSize: 11,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  area: {
    color: colors.mutedText,
    fontSize: 11,
  },
  classification: {
    color: colors.primary,
    fontSize: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 3,
  },
  matchButton: {
    minWidth: 100,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primary,
    paddingHorizontal: 9,
  },
  matchButtonLabel: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '600',
  },
  declineButton: {
    minWidth: 78,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
  },
  declineButtonLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
});
