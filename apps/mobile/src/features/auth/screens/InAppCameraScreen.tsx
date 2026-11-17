import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CameraIcon } from '../components/CameraIcon';
import { useSignUpDraft } from '../context/SignUpDraftContext';
import { colors, spacing } from '../../../theme/tokens';

const cameraPreviewColor = '#30282A';

export default function InAppCameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const hasRequestedPermission = useRef(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setProfilePhotoUri, setProfilePhotoDataUrl } = useSignUpDraft();

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
        setIsCameraReady(false);
      };
    }, []),
  );

  useEffect(() => {
    if (
      !permission ||
      permission.granted ||
      !permission.canAskAgain ||
      hasRequestedPermission.current
    ) {
      return;
    }

    hasRequestedPermission.current = true;
    void requestPermission();
  }, [permission, requestPermission]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/sign-up');
  };

  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isTakingPicture) return;

    setIsTakingPicture(true);
    setErrorMessage(null);

    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: true });
      if (!picture.uri) throw new Error('撮影画像が取得できませんでした。');

      setProfilePhotoUri(picture.uri);
      setProfilePhotoDataUrl(
        picture.base64 ? `data:image/jpeg;base64,${picture.base64}` : null,
      );
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/sign-up');
      }
    } catch {
      setErrorMessage('撮影に失敗しました。もう一度お試しください。');
      setIsTakingPicture(false);
    }
  };

  const handleRequestPermission = async () => {
    setErrorMessage(null);
    try {
      await requestPermission();
    } catch {
      setErrorMessage('カメラを利用できません。端末の設定を確認してください。');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="新規登録へ戻る"
            accessibilityRole="button"
            onPress={handleBack}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>‹</Text>
          </Pressable>
          <Text style={styles.title}>撮影</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.preview}>
          {permission?.granted && isScreenFocused ? (
            <>
              <CameraView
                ref={cameraRef}
                facing="front"
                onCameraReady={() => setIsCameraReady(true)}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.previewOverlay}>
                <Text style={styles.previewLabel}>カメラプレビュー</Text>
                <View style={styles.faceGuide} />
                <View style={styles.neckGuide} />
                <Text style={styles.captureHint}>顔・首・喉が入るように</Text>
              </View>
              {!isCameraReady ? (
                <View style={styles.cameraLoading}>
                  <ActivityIndicator color={colors.surface} />
                  <Text style={styles.cameraLoadingText}>カメラを準備しています</Text>
                </View>
              ) : null}
            </>
          ) : permission?.granted ? (
            <View style={styles.permissionContent}>
              <ActivityIndicator color={colors.surface} />
              <Text style={styles.permissionText}>カメラを準備しています</Text>
            </View>
          ) : (
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>カメラの使用が必要です</Text>
              <Text style={styles.permissionText}>
                プロフィール写真を撮影するため、カメラへのアクセスを許可してください。
              </Text>
              {permission?.canAskAgain ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleRequestPermission}
                  style={styles.permissionButton}
                >
                  <Text style={styles.permissionButtonLabel}>カメラを許可</Text>
                </Pressable>
              ) : (
                <Text style={styles.permissionText}>端末の設定からカメラを許可してください。</Text>
              )}
            </View>
          )}
        </View>

        <Text style={styles.disclaimer}>撮影後の加工・AI補正はありません</Text>
        {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

        <Pressable
          accessibilityLabel="写真を撮影"
          accessibilityRole="button"
          accessibilityState={{ disabled: !isCameraReady || isTakingPicture }}
          disabled={!isCameraReady || isTakingPicture}
          onPress={handleTakePicture}
          style={({ pressed }) => [
            styles.shutterButton,
            (!isCameraReady || isTakingPicture) && styles.shutterButtonDisabled,
            pressed && isCameraReady && !isTakingPicture && styles.shutterButtonPressed,
          ]}
        >
          {isTakingPicture ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <CameraIcon size={30} color={colors.primary} />
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    color: colors.primary,
    fontSize: 32,
    lineHeight: 34,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  preview: {
    flex: 1,
    width: '100%',
    minHeight: 260,
    maxHeight: 520,
    marginTop: spacing.sm,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: cameraPreviewColor,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFill,
  },
  previewLabel: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    color: colors.surface,
    fontSize: 11,
  },
  faceGuide: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: '58%',
    height: '54%',
    borderWidth: 1,
    borderColor: colors.surface,
    borderRadius: 999,
  },
  neckGuide: {
    position: 'absolute',
    top: '67%',
    alignSelf: 'center',
    width: '58%',
    height: 1,
    backgroundColor: 'rgba(255, 253, 248, 0.75)',
  },
  captureHint: {
    position: 'absolute',
    bottom: '9%',
    alignSelf: 'center',
    color: colors.surface,
    fontSize: 11,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(48, 40, 42, 0.55)',
  },
  cameraLoadingText: {
    color: colors.surface,
    fontSize: 12,
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  permissionTitle: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  permissionButtonLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: spacing.sm,
    color: colors.primary,
    fontSize: 12,
    textAlign: 'center',
  },
  errorMessage: {
    marginTop: spacing.xs,
    color: colors.primary,
    fontSize: 12,
    textAlign: 'center',
  },
  shutterButton: {
    width: 70,
    height: 70,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  shutterButtonDisabled: {
    opacity: 0.55,
  },
  shutterButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
});
