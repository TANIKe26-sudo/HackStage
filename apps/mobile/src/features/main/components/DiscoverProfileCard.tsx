import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import type { DiscoverProfile } from '../data/demoProfiles';

export function DiscoverProfileCard({ profile }: { profile: DiscoverProfile }) {
  return (
    <View style={styles.cardContent}>
      <View style={styles.imagePlaceholder}>
        <Text style={styles.noImageLabel}>No image</Text>
      </View>

      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>
          {profile.name} ({profile.age})
        </Text>
        <View style={styles.profileMeta}>
          <View style={styles.locationInfo}>
            <LocationPin />
            <Text numberOfLines={1} style={styles.profileDetails}>
              {profile.goal}・{profile.area}
            </Text>
          </View>
          <View style={styles.classificationPill}>
            <Text style={styles.classificationText}>{profile.classification}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function LocationPin() {
  return (
    <View style={styles.locationPin}>
      <View style={styles.locationPinCenter} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    flex: 1,
  },
  imagePlaceholder: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E5D8',
  },
  noImageLabel: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  profileInfo: {
    minHeight: 88,
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  profileName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  locationPin: {
    width: 11,
    height: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: colors.mutedText,
    borderRadius: 7,
    transform: [{ rotate: '45deg' }],
  },
  locationPinCenter: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.mutedText,
  },
  profileDetails: {
    flexShrink: 1,
    color: colors.mutedText,
    fontSize: 11,
  },
  classificationPill: {
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
  },
  classificationText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
});
