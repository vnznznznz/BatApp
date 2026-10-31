import { Image, type ImageProps } from 'react-native';

export type BatMarkProps = Omit<ImageProps, 'source' | 'style'> & {
  size?: number;
  /**
   * Recolours the silhouette - the roost tints a bat by its state. The artwork
   * is a single flat colour on transparency, which is what makes this possible.
   */
  tint?: string;
};

/**
 * The app mark. The asset is generated from vector source — see
 * `scripts/generate-assets.mjs`.
 */
export function BatMark({ size = 160, tint, ...rest }: BatMarkProps) {
  return (
    <Image
      source={require('@/assets/images/splash-icon.png')}
      style={[{ width: size, height: size }, tint ? { tintColor: tint } : null]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="A bat in flight"
      {...rest}
    />
  );
}
