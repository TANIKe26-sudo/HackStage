import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { IntimacyStageRow } from '../components/IntimacyStageRow';
import { ProgressiveProfilePhoto } from '../components/ProgressiveProfilePhoto';
import { useMainApi, profileCard } from '../api/client';
import { useResource } from '../api/useResource';
import { RequestState } from '../components/RequestState';

const stages = [
  { number: 1, label: '首・喉仏' },
  { number: 2, label: 'あご' },
  { number: 3, label: '口元' },
  { number: 4, label: '顔全体' },
  { number: 5, label: '頭部まで含めた全体' },
];

export default function PartnerProfileScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ConnectedPartner key={conversationId} conversationId={conversationId} />;
}

function ConnectedPartner({ conversationId }: { conversationId: string }) {
  const api = useMainApi();
  const load = useCallback((signal: AbortSignal) => api.match(conversationId, signal), [api, conversationId]);
  const resource = useResource(load, 5000);
  const detail = resource.data;
  const profile = detail ? profileCard(detail.profile) : undefined;
  const intimacyStage = detail ? detail.visibleStage + 1 : 0;
  const progress = `${(intimacyStage / stages.length) * 100}%` as `${number}%`;
  const profileDetails = [profile?.goal, profile?.area].filter(Boolean).join('・');
  const busy = useRef(false);
  const explainStage = () => Alert.alert('段階公開について', '双方が会話した日数・デイリー回答と、写真の所有者の同意に応じて公開されます。タップだけでは解放されません。');
  const changeConsent = async (stage: number, consent: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try { await api.grant(conversationId, stage, consent); void resource.refresh(); }
    catch (error) { Alert.alert('変更できませんでした', error instanceof Error ? error.message : '再度お試しください。'); }
    finally { busy.current = false; }
  };
  const openConsent = () => {
    if (!detail) return;
    const next = Math.min(detail.progress.stage, detail.grantedStage + 1);
    Alert.alert('自分の写真の公開', 'この相手に見せる自分の写真を管理します。同意は30日で期限切れになります。', [
      { text: 'キャンセル', style: 'cancel' },
      ...(detail.grantedStage > 0 ? [{ text: '追加公開を取り消す', style: 'destructive' as const, onPress: () => void changeConsent(1, false) }] : []),
      ...(next > detail.grantedStage ? [{ text: `${stages[next].label}まで公開に同意`, onPress: () => void changeConsent(next, true) }] : []),
    ]);
  };
  const capture = detail?.captures.find(c => c.stage === detail.visibleStage);

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
            <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {profile?.name ?? 'プロフィール'}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <RequestState loading={resource.loading && !detail} error={resource.error} onRetry={() => void resource.refresh()} />
          <ProgressiveProfilePhoto
            captureId={capture?.id}
            intimacyStage={intimacyStage}
            onUnlock={explainStage}
          />

          <View style={styles.details}>
            <Text style={styles.age}>{profile?.age ? `${profile.age}歳` : '年齢未登録'}</Text>
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
            <Text style={styles.goalAndArea}>双方の会話 {detail?.progress.mutualDays ?? 0}日・共同回答 {detail?.progress.sharedAnswers ?? 0}件</Text>
            <Pressable accessibilityRole="button" disabled={!detail} onPress={openConsent} style={{ paddingVertical: 16 }}><Text style={{ color: colors.primary }}>自分の写真の公開同意を管理</Text></Pressable>
            <View style={styles.stageList}>
              {stages.map((stage) => (
                <IntimacyStageRow
                  key={stage.number}
                  stageNumber={stage.number}
                  label={stage.label}
                  intimacyStage={intimacyStage}
                  onUnlock={explainStage}
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
