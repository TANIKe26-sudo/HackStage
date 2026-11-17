import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { DiscoverEmptyState } from '../components/DiscoverEmptyState';
import { DiscoverProfileCard } from '../components/DiscoverProfileCard';
import { DiscoverSwipeActions } from '../components/DiscoverSwipeActions';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { demoProfiles } from '../data/demoProfiles';

type SwipeDirection = 'like' | 'pass';

const swipeThreshold = 100;

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const [profileIndex, setProfileIndex] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const swipeInProgress = useRef(false);
  const profile = demoProfiles[profileIndex];

  const swipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (swipeInProgress.current || !profile) return;

      swipeInProgress.current = true;
      Animated.timing(pan, {
        toValue: { x: direction === 'like' ? width * 1.3 : -width * 1.3, y: 0 },
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        swipeInProgress.current = false;
        if (!finished) return;

        pan.setValue({ x: 0, y: 0 });
        setProfileIndex((currentIndex) => currentIndex + 1);
      });
    },
    [pan, profile, width],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !swipeInProgress.current &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          pan.setValue({ x: gesture.dx, y: gesture.dy * 0.12 });
        },
        onPanResponderRelease: (_event, gesture) => {
          const isFastSwipe = Math.abs(gesture.dx) > 35 && Math.abs(gesture.vx) > 0.7;
          if (gesture.dx > swipeThreshold || (isFastSwipe && gesture.dx > 0)) {
            swipeOut('like');
          } else if (gesture.dx < -swipeThreshold || (isFastSwipe && gesture.dx < 0)) {
            swipeOut('pass');
          } else {
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
    [pan, swipeOut],
  );

  const rotation = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-9deg', '0deg', '9deg'],
    extrapolate: 'clamp',
  });

  const restartDemo = () => {
    pan.setValue({ x: 0, y: 0 });
    setProfileIndex(0);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.brand}>のどじまん</Text>
        </View>

        <View style={styles.main}>
          {profile ? (
            <>
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
              <DiscoverSwipeActions
                onPass={() => swipeOut('pass')}
                onLike={() => swipeOut('like')}
              />
            </>
          ) : (
            <DiscoverEmptyState onRestart={restartDemo} />
          )}
        </View>

        <MainTabBar
          activeTab="search"
          onTabPress={(tab: MainTabId) => {
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
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  brand: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  main: {
    flex: 1,
    paddingHorizontal: spacing.lg,
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
