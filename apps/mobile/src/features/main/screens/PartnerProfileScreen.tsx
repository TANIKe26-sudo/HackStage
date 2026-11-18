import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { IntimacyStageRow } from '../components/IntimacyStageRow';
import { ProgressiveProfilePhoto } from '../components/ProgressiveProfilePhoto';
import { demoConversations } from '../data/demoConversations';
import { demoProfiles } from '../data/demoProfiles';

const profileIdByConversationId: Record<string, string> = {
  'demo-conversation-yuka': 'demo-yuka',
  'demo-conversation-aya': 'demo-ayaka',
  'demo-conversation-saki': 'demo-saki',
};

const stages = [
  { number: 1, label: '首・喉仏' },
  { number: 2, label: 'あご' },
  { number: 3, label: '口元' },
  { number: 4, label: '顔全体' },
];

export default function PartnerProfileScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversation = demoConversations.find((item) => item.id === conversationId);
  const profileId = profileIdByConversationId[conversationId];
  const profile = demoProfiles.find((item) => item.id === profileId);
  const [intimacyStage, setIntimacyStage] = useState(1);
  const progress = `${(intimacyStage / stages.length) * 100}%` as `${number}%`;
  const profileDetails = [profile?.goal, profile?.area].filter(Boolean).join('・');

  const unlockNextStage = () => {
    setIntimacyStage((current) => Math.min(stages.length, current + 1));
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="チャットに戻る"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={colors.primary} />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {conversation?.name ?? profile?.name ?? 'プロフィール'}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ProgressiveProfilePhoto
            intimacyStage={intimacyStage}
            onUnlock={unlockNextStage}
          />

          <View style={styles.details}>
            <Text style={styles.age}>{profile ? `${profile.age}歳` : '年齢未登録'}</Text>
            <Text style={styles.goalAndArea}>
              {profileDetails || 'プロフィール情報を登録してください'}
            </Text>
          </View>

          <View style={styles.intimacySection}>
            <Text style={styles.intimacyTitle}>
              親密度 {intimacyStage} / {stages.length}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: stages.length, now: intimacyStage }}
              style={styles.progressTrack}
            >
              <View style={[styles.progressFill, { width: progress }]} />
            </View>
            <View style={styles.stageList}>
              {stages.map((stage) => (
                <IntimacyStageRow
                  key={stage.number}
                  stageNumber={stage.number}
                  label={stage.label}
                  intimacyStage={intimacyStage}
                  onUnlock={unlockNextStage}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 26,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  content: {
    gap: 0,
    paddingTop: spacing.md,
    paddingHorizontal: 20,
    paddingBottom: spacing.xl,
  },
  details: {
    gap: 4,
    marginHorizontal: 4,
    marginTop: spacing.xs,
  },
  age: {
    color: colors.mutedText,
    fontSize: 13,
  },
  goalAndArea: {
    color: colors.mutedText,
    fontSize: 13,
  },
  intimacySection: {
    marginTop: spacing.lg,
  },
  intimacyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: colors.primarySoft,
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  stageList: {
    gap: 20,
    marginTop: 23,
  },
  pressed: {
    opacity: 0.7,
  },
});
