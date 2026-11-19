import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import { hobbyGenres, type HobbyGenreId } from '../data/hobbyGenres';

export function HobbyGenreGrid({
  selectedIds = [],
  onToggle,
  onSelect,
  disabled = false,
}: {
  selectedIds?: readonly string[];
  onToggle?: (id: HobbyGenreId) => void;
  onSelect?: (id: HobbyGenreId) => void;
  disabled?: boolean;
}) {
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

  return (
    <View style={styles.grid}>
      {hobbyGenres.map(genre => {
        const selected = selectedIds.includes(genre.id);
        return (
          <Pressable
            key={genre.id}
            accessibilityRole={onSelect ? 'button' : 'checkbox'}
            accessibilityLabel={genre.label}
            accessibilityState={onSelect ? { disabled } : { checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onSelect ? onSelect(genre.id) : onToggle?.(genre.id)}
            style={({ pressed }) => [
              styles.genreTile,
              { width: tileWidth },
              selected && styles.genreTileSelected,
              pressed && styles.tilePressed,
            ]}
          >
            {selected ? (
              <View style={styles.selectedMark}>
                <Ionicons name="checkmark" size={15} color={colors.primary} />
              </View>
            ) : null}
            <Ionicons name={genre.icon} size={36} color={selected ? colors.white : colors.primary} />
            <Text numberOfLines={2} style={[styles.genreLabel, selected && styles.genreLabelSelected]}>
              {genre.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  genreTile: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  genreTileSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tilePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  selectedMark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  genreLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  genreLabelSelected: {
    color: colors.white,
  },
});
