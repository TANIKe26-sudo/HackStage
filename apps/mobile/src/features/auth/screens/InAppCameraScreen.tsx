import { apiRequest } from '../api/client';
import { classificationLabels, classificationReason, type ClassificationResult } from '../api/classification';
import { useAuth } from '../context/AuthContext';
import { captureRegions } from '../captureRegions';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CameraIcon } from '../components/CameraIcon';
import { useSignUpDraft } from '../context/SignUpDraftContext';
import { colors, spacing } from '../../../theme/tokens';

const cameraPreviewColor = '#30282A';

export default function InAppCameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [captured, setCaptured] = useState<{ uri: string; dataUrl: string; preview: string; previewDataUrl: string } | null>(null);
  const { token } = useAuth();
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const classificationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => classificationRequest.current?.abort(), []);
  const cameraRef = useRef<CameraView | null>(null);
  const hasRequestedPermission = useRef(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setProfilePhotoUri, setProfilePhotoDataUrl, setProfilePhotoClassification } = useSignUpDraft();

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
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!picture.uri) throw new Error('撮影画像が取得できませんでした。');

      const context = ImageManipulator.manipulate(picture.uri);
      if (Math.max(picture.width, picture.height) > 1280) {
        context.resize(picture.width >= picture.height ? { width: 1280 } : { height: 1280 });
      }
      const rendered = await context.renderAsync();
      const full = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!full.base64) throw new Error('撮影画像を読み込めませんでした。');
      const crop = ImageManipulator.manipulate(full.uri);
      const region = captureRegions[0];
      crop.crop({ originX: Math.floor(full.width * region.x), originY: Math.floor(full.height * region.y), width: Math.max(1, Math.floor(full.width * region.width)), height: Math.max(1, Math.floor(full.height * region.height)) });
      const preview = await (await crop.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!preview.base64) throw new Error('公開画像を読み込めませんでした。');
      setClassification(null);
      setCaptured({ uri: full.uri, dataUrl: `data:image/jpeg;base64,${full.base64}`, preview: preview.uri, previewDataUrl: `data:image/jpeg;base64,${preview.base64}` });
      setIsTakingPicture(false);
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

  const classify = async () => {
    if (!captured || !token || classificationRequest.current) return;
    const controller = new AbortController(); classificationRequest.current = controller;
    setClassifying(true); setErrorMessage(null); setClassification(null);
    try {
      const result = await apiRequest<ClassificationResult>('/api/classifications/throat', token, { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ dataUrl: captured.previewDataUrl, consent: true }) });
      if (!controller.signal.aborted) setClassification(result);
    } catch (error) {
      if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : '推定できませんでした。');
    } finally { classificationRequest.current = null; if (!controller.signal.aborted) setClassifying(false); }
  };

  if (captured) return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14 }}>
      <Text style={styles.title}>初期公開する画像の確認</Text>
      <Text>この切り出し画像が相手に表示されます。首周りが写り、顔が含まれていないことを確認してください。自動検出ではありません。</Text>
      <Image source={{ uri: captured.preview }} resizeMode="contain" style={{ width: '100%', height: 180 }} />
      <Pressable accessibilityRole="button" disabled={classifying || !token} onPress={() => Alert.alert('AI推定への同意', '表示中の首周りの画像をCloudflareの画像認識AIへ送って推定します。結果は画像上の見え方の候補で、性別・本人確認には使いません。', [
        { text: 'キャンセル', style: 'cancel' }, { text: '同意して推定する', onPress: () => void classify() },
      ])} style={{ padding: 12 }}><Text style={{ color: colors.primary }}>{classifying ? '推定中…' : 'AIで喉仏の写り方を推定'}</Text></Pressable>
      {classifying ? <ActivityIndicator color={colors.primary} /> : null}
      {classification ? <View style={{ gap: 8 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>推定：{classificationLabels[classification.classification]}</Text><Text>{classificationReason(classification.reason)}</Text></View> : null}
      {errorMessage ? <Text accessibilityRole="alert">{errorMessage}</Text> : null}
      <Pressable accessibilityRole="button" disabled={classifying} onPress={() => {
        setCaptured(null); setClassification(null); setErrorMessage(null); setIsCameraReady(false);
      }} style={{ padding: 16 }}><Text>撮り直す</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={classifying} onPress={() => {
        setProfilePhotoUri(captured.uri); setProfilePhotoDataUrl(captured.dataUrl); setProfilePhotoClassification(classification?.classification ?? 'pending');
        if (router.canGoBack()) router.back(); else router.replace('/sign-up');
      }} style={{ padding: 16 }}><Text style={{ color: colors.primary }}>{classification ? '推定結果を確認してこの写真を使う' : '判定保留でこの写真を使う'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;

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
