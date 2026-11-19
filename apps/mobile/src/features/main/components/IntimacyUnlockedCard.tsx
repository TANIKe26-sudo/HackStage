import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';

export function IntimacyUnlockedCard({ intimacyIncreased, onViewProfile }: { intimacyIncreased: boolean; onViewProfile: () => void }) {
  const iconColor = intimacyIncreased ? colors.primary : '#5C7D63';
  return (
    <View style={[styles.card, intimacyIncreased ? styles.intimacyCard : styles.completedCard]}>
      <Ionicons name={intimacyIncreased ? 'heart-outline' : 'checkmark-circle-outline'} size={22} color={iconColor} />
      <View style={styles.copy}>
        <Text style={[styles.title, !intimacyIncreased && styles.completedTitle]}>
          {intimacyIncreased ? '親密度が上がりました！' : '今日のお題を達成しました！'}
        </Text>
        {intimacyIncreased ? (
          <Pressable
            accessibilityRole="link"
            onPress={onViewProfile}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.profileLink}>プロフィールを見る</Text>
          </Pressable>
        ) : null}
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
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  intimacyCard: {
    backgroundColor: colors.primarySoft,
  },
  completedCard: {
    backgroundColor: '#E8F0E8',
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
  completedTitle: {
    color: '#5C7D63',
  },
  profileLink: {
    alignSelf: 'flex-start',
    color: colors.primary,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.65,
  },
});
