import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme/tokens';

export function RequestState({ loading, error, onRetry }: { loading: boolean; error?: string; onRetry: () => void }) {
  if (!loading && !error) return null;
  return <View style={{ padding: spacing.md, gap: spacing.sm, alignItems: 'center' }}>
    {loading ? <ActivityIndicator color={colors.primary} /> : null}
    {error ? <>
      <Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={{ padding: spacing.sm }}><Text style={{ color: colors.primary }}>再読み込み</Text></Pressable>
    </> : null}
  </View>;
}
