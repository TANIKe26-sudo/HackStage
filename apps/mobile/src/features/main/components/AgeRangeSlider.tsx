import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';

import { colors } from '../../../theme/tokens';

export const MAX_SELECTABLE_AGE = 50;
const MIN_SELECTABLE_AGE = 18;
const thumbSize = 28;
const thumbTouchSize = 48;
const thumbRadius = thumbSize / 2;
export const AGE_RANGE_THUMB_RADIUS = thumbRadius;

type AgeRange = { minAge: number; maxAge: number };

export function AgeRangeSlider({
  minAge,
  maxAge,
  onChange,
  onDragStateChange,
  disabled = false,
}: {
  minAge: number;
  maxAge: number;
  onChange: (range: AgeRange) => void;
  onDragStateChange: (isDragging: boolean) => void;
  disabled?: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const values = useRef({ minAge, maxAge });
  const minDragStartX = useRef(0);
  const maxDragStartX = useRef(0);

  useEffect(() => {
    values.current = { minAge, maxAge };
  }, [minAge, maxAge]);

  const usableWidth = Math.max(0, trackWidth - thumbSize);
  const ageToX = useCallback((age: number) => {
    const progress = (age - MIN_SELECTABLE_AGE) / (MAX_SELECTABLE_AGE - MIN_SELECTABLE_AGE);
    return thumbRadius + Math.max(0, Math.min(1, progress)) * usableWidth;
  }, [usableWidth]);
  const xToAge = useCallback((x: number) => {
    if (usableWidth <= 0) return MIN_SELECTABLE_AGE;
    const progress = Math.max(0, Math.min(1, (x - thumbRadius) / usableWidth));
    return Math.round(MIN_SELECTABLE_AGE + progress * (MAX_SELECTABLE_AGE - MIN_SELECTABLE_AGE));
  }, [usableWidth]);

  const updateMinAge = useCallback((age: number) => {
    const nextMinAge = Math.max(MIN_SELECTABLE_AGE, Math.min(age, values.current.maxAge));
    values.current = { ...values.current, minAge: nextMinAge };
    onChange(values.current);
  }, [onChange]);
  const updateMaxAge = useCallback((age: number) => {
    const nextMaxAge = Math.min(MAX_SELECTABLE_AGE, Math.max(age, values.current.minAge));
    values.current = { ...values.current, maxAge: nextMaxAge };
    onChange(values.current);
  }, [onChange]);

  const startMinDrag = useCallback(() => {
    minDragStartX.current = ageToX(values.current.minAge);
  }, [ageToX]);
  const moveMinThumb = useCallback((_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    updateMinAge(xToAge(minDragStartX.current + gesture.dx));
  }, [updateMinAge, xToAge]);
  const startMaxDrag = useCallback(() => {
    maxDragStartX.current = ageToX(values.current.maxAge);
  }, [ageToX]);
  const grantMinDrag = useCallback(() => {
    startMinDrag();
    onDragStateChange(true);
  }, [onDragStateChange, startMinDrag]);
  const grantMaxDrag = useCallback(() => {
    startMaxDrag();
    onDragStateChange(true);
  }, [onDragStateChange, startMaxDrag]);
  const endDrag = useCallback(() => onDragStateChange(false), [onDragStateChange]);
  const moveMaxThumb = useCallback((_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    updateMaxAge(xToAge(maxDragStartX.current + gesture.dx));
  }, [updateMaxAge, xToAge]);

  // PanResponder stores these callbacks and invokes them only during gestures; the refs are not read by the render itself.
  // eslint-disable-next-line react-hooks/refs
  const minPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => !disabled,
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponderCapture: () => !disabled,
    onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dx) > 2,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: grantMinDrag,
    onPanResponderMove: moveMinThumb,
    onPanResponderRelease: endDrag,
    onPanResponderTerminate: endDrag,
  }), [disabled, endDrag, grantMinDrag, moveMinThumb]);
  // eslint-disable-next-line react-hooks/refs
  const maxPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => !disabled,
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponderCapture: () => !disabled,
    onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dx) > 2,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: grantMaxDrag,
    onPanResponderMove: moveMaxThumb,
    onPanResponderRelease: endDrag,
    onPanResponderTerminate: endDrag,
  }), [disabled, endDrag, grantMaxDrag, moveMaxThumb]);

  const minX = ageToX(minAge);
  const maxX = ageToX(maxAge);
  const moveNearestThumb = (x: number) => {
    const age = xToAge(x);
    if (Math.abs(age - minAge) <= Math.abs(age - maxAge)) updateMinAge(age);
    else updateMaxAge(age);
  };

  return (
    <View
      accessibilityLabel="年齢の範囲"
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.slider}
    >
      <View pointerEvents="none" style={styles.track} />
      <View pointerEvents="none" style={[styles.selectedTrack, { left: minX, right: Math.max(0, trackWidth - maxX) }]} />
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no"
        disabled={disabled}
        onPress={event => moveNearestThumb(event.nativeEvent.locationX)}
        style={styles.trackHitArea}
      />
      <View
        {...minPanResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="最低年齢"
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: MIN_SELECTABLE_AGE, max: MAX_SELECTABLE_AGE, now: minAge, text: `${minAge}歳` }}
        accessibilityActions={[{ name: 'increment', label: '1歳上げる' }, { name: 'decrement', label: '1歳下げる' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') updateMinAge(minAge + 1);
          if (event.nativeEvent.actionName === 'decrement') updateMinAge(minAge - 1);
        }}
        style={[styles.thumbTouch, { left: minX - thumbTouchSize / 2 }, disabled && styles.disabledThumb]}
      >
        <View pointerEvents="none" style={styles.thumb} />
      </View>
      <View
        {...maxPanResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="最高年齢"
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: MIN_SELECTABLE_AGE, max: MAX_SELECTABLE_AGE, now: maxAge, text: maxAge === MAX_SELECTABLE_AGE ? '50歳以上' : `${maxAge}歳` }}
        accessibilityActions={[{ name: 'increment', label: '1歳上げる' }, { name: 'decrement', label: '1歳下げる' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') updateMaxAge(maxAge + 1);
          if (event.nativeEvent.actionName === 'decrement') updateMaxAge(maxAge - 1);
        }}
        style={[styles.thumbTouch, { left: maxX - thumbTouchSize / 2 }, disabled && styles.disabledThumb]}
      >
        <View pointerEvents="none" style={styles.thumb} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: {
    height: thumbTouchSize,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: thumbRadius,
    right: thumbRadius,
    top: (thumbTouchSize - 3) / 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  selectedTrack: {
    position: 'absolute',
    top: (thumbTouchSize - 3) / 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  trackHitArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  thumbTouch: {
    position: 'absolute',
    top: 0,
    width: thumbTouchSize,
    height: thumbTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  thumb: {
    width: thumbSize,
    height: thumbSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: thumbRadius,
    backgroundColor: colors.surface,
    shadowColor: '#382A2C',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  disabledThumb: {
    opacity: 0.5,
  },
});
