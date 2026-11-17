import { View } from 'react-native';

import { colors } from '../../../theme/tokens';

type CameraIconProps = {
  size?: number;
  color?: string;
};

export function CameraIcon({ size = 32, color = colors.primary }: CameraIconProps) {
  const strokeWidth = Math.max(1.5, size * 0.052);
  const lensSize = size * 0.38;
  const bodyLeft = size * 0.08;
  const bodyRight = size * 0.92;
  const bodyTop = size * 0.27;
  const bodyBottom = size * 0.82;
  const humpLeft = size * 0.28;
  const humpRight = size * 0.72;
  const humpTop = size * 0.11;
  const diagonalLength = Math.hypot(size * 0.08, size * 0.16);
  const leftDiagonalMidX = size * 0.32;
  const rightDiagonalMidX = size * 0.68;
  const diagonalMidY = size * 0.19;
  const line = { position: 'absolute' as const, backgroundColor: color };

  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size * 0.82,
        transform: [{ translateY: -size * 0.055 }],
      }}
    >
      {/* The body top edge is split around the raised viewfinder hump. */}
      <View
        style={{
          ...line,
          left: bodyLeft,
          top: bodyTop,
          width: strokeWidth,
          height: bodyBottom - bodyTop,
        }}
      />
      <View
        style={{
          ...line,
          left: bodyRight - strokeWidth,
          top: bodyTop,
          width: strokeWidth,
          height: bodyBottom - bodyTop,
        }}
      />
      <View
        style={{
          ...line,
          left: bodyLeft,
          top: bodyBottom - strokeWidth,
          width: bodyRight - bodyLeft,
          height: strokeWidth,
        }}
      />
      <View
        style={{
          ...line,
          left: bodyLeft,
          top: bodyTop,
          width: humpLeft - bodyLeft + strokeWidth / 2,
          height: strokeWidth,
        }}
      />
      <View
        style={{
          ...line,
          left: humpRight - strokeWidth / 2,
          top: bodyTop,
          width: bodyRight - humpRight + strokeWidth / 2,
          height: strokeWidth,
        }}
      />
      <View
        style={{
          ...line,
          left: size * 0.36,
          top: humpTop,
          width: size * 0.28,
          height: strokeWidth,
        }}
      />
      <View
        style={{
          ...line,
          left: leftDiagonalMidX - diagonalLength / 2,
          top: diagonalMidY - strokeWidth / 2,
          width: diagonalLength,
          height: strokeWidth,
          transform: [{ rotate: '-63.435deg' }],
        }}
      />
      <View
        style={{
          ...line,
          left: rightDiagonalMidX - diagonalLength / 2,
          top: diagonalMidY - strokeWidth / 2,
          width: diagonalLength,
          height: strokeWidth,
          transform: [{ rotate: '63.435deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.355,
          left: (size - lensSize) / 2,
          width: lensSize,
          height: lensSize,
          borderWidth: strokeWidth,
          borderColor: color,
          borderRadius: lensSize / 2,
        }}
      />
    </View>
  );
}
