import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  UIManager,
  type ScrollViewProps,
  type ScrollViewInstance,
  type TextInputProps,
} from 'react-native';

const KeyboardAwareInputContext = createContext<((target: number) => void) | null>(null);

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  keyboardVerticalOffset?: number;
};

export function KeyboardAwareScrollView({ keyboardVerticalOffset = 0, onScroll, scrollEventThrottle, ...scrollViewProps }: KeyboardAwareScrollViewProps) {
  const scrollViewRef = useRef<ScrollViewInstance | null>(null);
  const focusedInputTag = useRef<number | null>(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  const revealFocusedInput = useCallback(() => {
    const target = focusedInputTag.current;
    const activeKeyboardTop = keyboardTop.current;
    const scrollView = scrollViewRef.current;
    if (target === null || activeKeyboardTop === null || !scrollView) return;

    UIManager.measureInWindow(target, (_inputX, inputY, _inputWidth, inputHeight) => {
      scrollView.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
        const margin = 16;
        const visibleTop = scrollY + margin;
        const visibleBottom = Math.min(scrollY + scrollHeight, activeKeyboardTop) - margin;
        const availableHeight = Math.max(0, visibleBottom - visibleTop);
        const preferredTop = visibleTop + Math.min(100, availableHeight * 0.28);
        const desiredTop = Math.min(preferredTop, Math.max(visibleTop, visibleBottom - inputHeight));
        const delta = inputY < visibleTop
          ? inputY - visibleTop
          : inputY > desiredTop
            ? inputY - desiredTop
            : 0;

        if (delta !== 0) {
          scrollView.scrollTo({ y: Math.max(0, scrollOffset.current + delta), animated: true });
        }
      });
    });
  }, []);

  const scheduleReveal = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(revealFocusedInput));
  }, [revealFocusedInput]);

  const scrollToFocusedInput = useCallback((target: number) => {
    focusedInputTag.current = target;
    if (keyboardTop.current !== null) scheduleReveal();
  }, [scheduleReveal]);

  const handleScroll: NonNullable<ScrollViewProps['onScroll']> = useCallback((event) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }, [onScroll]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      if (focusedInputTag.current !== null) scheduleReveal();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      focusedInputTag.current = null;
      keyboardTop.current = null;
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scheduleReveal]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.container}
    >
      <KeyboardAwareInputContext.Provider value={scrollToFocusedInput}>
        <ScrollView
          ref={scrollViewRef}
          {...scrollViewProps}
          onScroll={handleScroll}
          scrollEventThrottle={scrollEventThrottle ?? 16}
        />
      </KeyboardAwareInputContext.Provider>
    </KeyboardAvoidingView>
  );
}

export function KeyboardAwareTextInput(props: TextInputProps) {
  const scrollToFocusedInput = useContext(KeyboardAwareInputContext);
  const { onFocus, ...inputProps } = props;
  const handleFocus: NonNullable<TextInputProps['onFocus']> = useCallback((event) => {
    onFocus?.(event);
    scrollToFocusedInput?.(event.nativeEvent.target);
  }, [onFocus, scrollToFocusedInput]);

  return <TextInput {...inputProps} onFocus={handleFocus} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
