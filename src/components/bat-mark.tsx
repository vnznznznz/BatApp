import { Image, type ImageProps } from 'react-native';

export type BatMarkProps = Omit<ImageProps, 'source' | 'style'> & {
  size?: number;
};

/**
 * The app mark. The asset is generated from vector source — see
 * `scripts/generate-assets.mjs`.
 */
export function BatMark({ size = 160, ...rest }: BatMarkProps) {
  return (
    <Image
      source={require('@/assets/images/splash-icon.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="A bat in flight"
      {...rest}
    />
  );
}
