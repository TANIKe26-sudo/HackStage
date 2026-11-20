import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { DiscoverEmptyState } from '../components/DiscoverEmptyState';
import { DiscoverProfileCard } from '../components/DiscoverProfileCard';
import { DiscoverSwipeActions } from '../components/DiscoverSwipeActions';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { AppIcon } from '../components/AppIcon';
import { profileCard, useMainApi, type PublicProfile } from '../api/client';
import { useResource } from '../api/useResource';
import { RequestState } from '../components/RequestState';
import { hobbyGenres, type HobbyGenreId } from '../data/hobbyGenres';
import { candidateSwipeAction } from '../candidateSwipeAction';

type SwipeDirection = 'like' | 'pass';

// Event-only lock keyed by the stable animation value; it is never read during render.
const activeSwipes = new WeakSet<Animated.ValueXY>();

export default function CandidateFeedScreen({
  activeTab,
  hobbyId,
  onExitHobby,
}: {
  activeTab: 'home' | 'search';
  hobbyId?: HobbyGenreId;
  onExitHobby?: () => void;
}) {
  const { width } = useWindowDimensions();
  const api = useMainApi();
  const loadCandidates = useCallback((signal: AbortSignal) => api.discover(signal, hobbyId), [api, hobbyId]);
  const resource = useResource(loadCandidates);
  const loadLastSwipe = useCallback((signal: AbortSignal) => api.lastSwipe(signal), [api]);
  const swipeHistory = useResource(loadLastSwipe);
  const refreshLastSwipe = swipeHistory.refresh;
  const lastSwipe = swipeHistory.data?.lastSwipe;
  const previousProfile = swipeHistory.data?.profile;
  const [decided, setDecided] = useState<string[]>([]);
  const [restoredCandidate, setRestoredCandidate] = useState<PublicProfile | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [pan] = useState(() => new Animated.ValueXY());
  const candidate = restoredCandidate ?? resource.data?.candidates.find(p => !decided.includes(p.user_id));
  const profile = candidate ? profileCard(candidate) : undefined;

  const swipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (activeSwipes.has(pan) || !profile) return;

      activeSwipes.add(pan);
      setIsSwiping(true);
      void (async () => {
        try {
          let matched = false;
          if (direction === 'like') {
            const result = await api.like(profile.id);
            matched = result.matched;
            if (matched) Alert.alert('マッチしました！', 'トーク一覧から会話を始められます。');
          } else await api.pass(profile.id);
          Animated.timing(pan, {
            toValue: { x: direction === 'like' ? width * 1.3 : -width * 1.3, y: 0 },
            duration: 220, useNativeDriver: true,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            setDecided(current => current.includes(profile.id) ? current : [...current, profile.id]);
            setRestoredCandidate(null);
            void refreshLastSwipe();
            setIsSwiping(false);
            activeSwipes.delete(pan);
          });
        } catch (error) {
          pan.setValue({ x: 0, y: 0 });
          setIsSwiping(false);
          activeSwipes.delete(pan);
          Alert.alert('送信できませんでした', error instanceof Error ? error.message : '再度お試しください。');
        }
      })();
    },
    [api, pan, profile, width, refreshLastSwipe],
  );

  const undoLastSwipe = useCallback(() => {
    if (activeSwipes.has(pan) || swipeHistory.loading || !lastSwipe?.undoable) return;

    activeSwipes.add(pan);
    setIsUndoing(true);
    void (async () => {
      try {
        const result = await api.undoSwipe(lastSwipe.candidateId);
        setDecided(current => current.filter(id => id !== result.candidateId));
        setRestoredCandidate(result.profile);
        pan.setValue({ x: 0, y: 0 });
      } catch (error) {
        Alert.alert('戻せませんでした', error instanceof Error ? error.message : '再度お試しください。');
      } finally {
        void refreshLastSwipe();
        setIsUndoing(false);
        activeSwipes.delete(pan);
      }
    })();
  }, [api, lastSwipe, pan, refreshLastSwipe, swipeHistory.loading]);

  const returnToPreviousCandidate = useCallback(() => {
    if (activeSwipes.has(pan) || swipeHistory.loading || !previousProfile) return;
    if (previousProfile.user_id === profile?.id) return;
    if (lastSwipe?.undoable) undoLastSwipe();
  }, [lastSwipe, pan, previousProfile, profile?.id, swipeHistory.loading, undoLastSwipe]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !activeSwipes.has(pan) &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          if (activeSwipes.has(pan)) return;
          pan.setValue({ x: gesture.dx, y: gesture.dy * 0.12 });
        },
        onPanResponderRelease: (_event, gesture) => {
          const canGoBack = !swipeHistory.loading && Boolean(lastSwipe?.undoable && previousProfile && previousProfile.user_id !== profile?.id);
          const action = candidateSwipeAction(gesture, canGoBack);
          if (action === 'pass') {
            swipeOut('pass');
          } else {
            if (action === 'back') returnToPreviousCandidate();
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        },
      }),
    [lastSwipe?.undoable, pan, previousProfile, profile?.id, returnToPreviousCandidate, swipeHistory.loading, swipeOut],
  );

  const rotation = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-9deg', '0deg', '9deg'],
    extrapolate: 'clamp',
  });

  const refreshCandidates = () => {
    pan.setValue({ x: 0, y: 0 });
    void resource.refresh();
    void refreshLastSwipe();
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            {onExitHobby ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="趣味一覧に戻る"
                onPress={onExitHobby}
                style={({ pressed }) => [styles.categoryBack, pressed && styles.filterPressed]}
              >
                <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
              </Pressable>
            ) : null}
            <Text style={hobbyId ? styles.categoryTitle : styles.brand}>
              {hobbyId ? hobbyGenres.find(genre => genre.id === hobbyId)?.label : 'のどじまん'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {resource.loading || swipeHistory.loading ? (
              <View style={styles.loadingSlot}>
                <ActivityIndicator size="small" color={colors.mutedText} accessibilityLabel="更新中" />
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="マッチング範囲を設定"
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/profile-settings/[kind]', params: { kind: 'location' } })}
              style={({ pressed }) => [styles.filterButton, pressed && styles.filterPressed]}
            >
              <AppIcon name="filter" size={24} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.main}>
          <RequestState loading={false} error={resource.error ?? (!profile ? swipeHistory.error : undefined)} onRetry={refreshCandidates} />
          {profile ? (
            <View style={styles.cardSlot}>
              <Animated.View
                {...panResponder.panHandlers}
                style={[
                  styles.profileCard,
                  {
                    transform: [
                      { translateX: pan.x },
                      { translateY: pan.y },
                      { rotate: rotation },
                    ],
                  },
                ]}
              >
                <DiscoverProfileCard profile={profile} />
              </Animated.View>
            </View>
          ) : (
            !resource.loading && !resource.error ? (
              <DiscoverEmptyState
                onRestart={refreshCandidates}
                onGoBack={lastSwipe?.undoable && previousProfile ? returnToPreviousCandidate : undefined}
                backDisabled={isUndoing || isSwiping || swipeHistory.loading}
              />
            ) : null
          )}
          <DiscoverSwipeActions
            onPass={() => swipeOut('pass')}
            onLike={() => swipeOut('like')}
            onUndo={undoLastSwipe}
            canUndo={Boolean(profile && lastSwipe?.undoable)}
            undoDisabled={isUndoing || isSwiping || swipeHistory.loading}
            showSwipeButtons={Boolean(profile)}
          />
        </View>

        <MainTabBar
          activeTab={activeTab}
          onTabPress={(tab: MainTabId) => {
            if (tab === 'home') router.replace('/home');
            if (tab === 'search') {
              if (onExitHobby) onExitHobby();
              else router.replace('/discover');
            }
            if (tab === 'likes') router.replace('/likes');
            if (tab === 'chat') router.replace('/matches');
            if (tab === 'profile') router.replace('/profile');
          }}
        />
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
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBack: {
    width: 38,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  loadingSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPressed: {
    opacity: 0.65,
  },
  brand: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  cardSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    width: '100%',
    flex: 1,
    minHeight: 320,
    maxHeight: 520,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    shadowColor: '#382A2C',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
});
