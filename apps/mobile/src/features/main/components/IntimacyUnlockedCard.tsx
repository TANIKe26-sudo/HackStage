import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';

export function IntimacyUnlockedCard({ onViewProfile }: { onViewProfile: () => void }) {
  return (
    <View style={styles.card}>
      <Ionicons name="heart-outline" size={22} color={colors.primary} />
      <View style={styles.copy}>
        <Text style={styles.title}>親密度が上がりました！</Text>
        <Pressable
          accessibilityRole="link"
          onPress={onViewProfile}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.profileLink}>プロフィールを見る</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  profileLink: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.65,
  },
});
