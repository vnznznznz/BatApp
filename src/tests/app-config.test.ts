import type { Href } from 'expo-router';
import withRouter from 'expo-router/plugin/build/withRouter';

import appJson from '../../app.json';

/**
 * The store declarations in docs/store rest on a few lines of app.json: Apple's
 * App Privacy answers and export compliance, Google's Data safety form and
 * permissions. Changing one of these lines makes those answers untrue, so the
 * change has to be deliberate - and come with the paperwork.
 */

const { expo } = appJson;

// Node built-ins, typed by hand, as in env.test.ts: the project's tsconfig
// deliberately leaves out Node's types.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

describe('what the store declarations rely on', () => {
  it('uses only standard encryption, so App Store Connect skips the export question', () => {
    expect(expo.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it('does not ask for Face ID, which the app never uses', () => {
    const secureStore = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
    );
    expect(secureStore).toEqual(['expo-secure-store', { faceIDPermission: false }]);
  });

  /**
   * What libraries bring along and the app never uses. The last two come from
   * androidx.biometric, which expo-secure-store pulls in: its manifest declares
   * them, and Gradle merges them into the app's after prebuild - too late for
   * the generated manifest to show. Only this list keeps them out.
   *
   * This pins the list. Whether it is complete shows only in a built app: the
   * check is in docs/store/google-play.md, section 3, "Advertising ID".
   */
  it('asks Android for nothing beyond the network', () => {
    expect(expo.android).not.toHaveProperty('permissions');
    expect([...expo.android.blockedPermissions].sort()).toEqual(
      [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.VIBRATE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ].sort(),
    );
  });
});

/**
 * `typedRoutes` makes a link to a screen that does not exist a type error - but
 * only where the route types are part of the typecheck. They are generated
 * (`npm run generate:routes`), not committed, and for a long time `tsconfig.json`
 * shut them out, so `npm run typecheck` passed whatever a link said.
 *
 * The line marked below is such a link. As long as the route types are in
 * force it is an error, which is what the mark expects. Take them away again -
 * drop the generation from `npm run typecheck`, exclude `.expo` - and the mark
 * itself becomes the error: "Unused '@ts-expect-error' directive".
 */
describe('what the typecheck relies on', () => {
  it('has typed routes switched on', () => {
    expect(expo.experiments.typedRoutes).toBe(true);
  });

  it('knows a screen that does not exist from one that does', () => {
    // @ts-expect-error -- there is no such screen; see the comment above before removing this.
    const nowhere: Href = '/no-such-screen';
    const somewhere: Href = '/sign-in';

    expect([nowhere, somewhere]).toHaveLength(2);
  });
});

describe('what a production build leaves out', () => {
  /**
   * Expo Router's sitemap lists every screen of the app, and its address
   * worked in a production build as well. The router's own plugin checks its
   * options against a list of the ones it knows, so a misspelt option fails
   * here instead of quietly doing nothing.
   */
  it('switches off the router’s sitemap', () => {
    const router = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-router',
    );
    expect(router).toEqual(['expo-router', { sitemap: false }]);

    const options = (Array.isArray(router) ? router[1] : undefined) as Parameters<
      typeof withRouter
    >[1];
    const config = withRouter({ name: expo.name, slug: expo.slug }, options);

    expect(config.extra?.router).toEqual({ sitemap: false });
  });
});

/**
 * Apple asks every app to give a reason, from a list it publishes, for each
 * kind of "required reason" API its code uses, in a privacy manifest; an
 * upload without one gets the ITMS-91053 mail. The native packages here that
 * use such APIs mostly declare them in privacy manifests of their own, which
 * React Native's pod install merges into the app's (privacy file aggregation,
 * on by default). What app.json declares is what is left: the uses of React
 * Native pods that carry no manifest of their own.
 */
describe('the iOS privacy manifest', () => {
  /**
   * Apple's reasons, by category ("Describing use of required reason API").
   * The fifth category, the active keyboards, is used by nothing in this app.
   */
  const APPLE_REASONS: Record<string, readonly string[]> = {
    NSPrivacyAccessedAPICategoryFileTimestamp: ['DDA9.1', 'C617.1', '3B52.1', '0A2A.1'],
    NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1', '8FFB.1', '3D61.1'],
    NSPrivacyAccessedAPICategoryDiskSpace: ['85F4.1', 'E174.1', '7D9E.1', 'B728.1'],
    NSPrivacyAccessedAPICategoryActiveKeyboards: ['3EC4.1', '54BD.1'],
    NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1', '1C8F.1', 'C56D.1', 'AC6B.1'],
  };

  const declared = () => expo.ios.privacyManifests.NSPrivacyAccessedAPITypes;

  /**
   * User defaults: React-RCTSettings (RCTSettingsManager) and
   * React-CoreModules (RCTDevSettings) read and write values only the app
   * itself reads - CA92.1. The boot clock: React Native's time stamps
   * (react/timing, HighResTimeStamp::now) read mach_absolute_time in pods
   * such as React-Fabric and React-RCTFabric, to measure time between events
   * in the app - 35F9.1. None of those pods ships a privacy manifest.
   */
  it('declares what React Native’s pods without a manifest of their own use', () => {
    expect(declared()).toEqual([
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
      },
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
        NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
      },
    ]);
  });

  it('gives only reasons Apple defines, each for its own category', () => {
    for (const {
      NSPrivacyAccessedAPIType: category,
      NSPrivacyAccessedAPITypeReasons,
    } of declared()) {
      expect(APPLE_REASONS[category]).toBeDefined();
      for (const reason of NSPrivacyAccessedAPITypeReasons) {
        expect(APPLE_REASONS[category]).toContain(reason);
      }
    }
  });

  /** The categories a package's own privacy manifest declares. */
  function declaredBy(manifest: string): string[] {
    const xml = readFileSync(join(__dirname, '..', '..', 'node_modules', manifest), 'utf8');
    return [
      ...xml.matchAll(/<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>/g),
    ].map(([, category]) => category ?? '');
  }

  /**
   * What app.json leaves out rests on these. The file timestamps: React
   * Native's bundle loader (React-Core) and React-cxxreact read the bundle
   * file's size, and expo-file-system offers its dates; the disk space only
   * expo-file-system asks for, in functions the app does not call. Should a
   * package stop declaring its use, app.json has to.
   */
  it.each([
    [
      'react-native/React/Resources/PrivacyInfo.xcprivacy',
      'NSPrivacyAccessedAPICategoryFileTimestamp',
    ],
    [
      'react-native/ReactCommon/cxxreact/PrivacyInfo.xcprivacy',
      'NSPrivacyAccessedAPICategoryFileTimestamp',
    ],
    ['expo-file-system/ios/PrivacyInfo.xcprivacy', 'NSPrivacyAccessedAPICategoryFileTimestamp'],
    ['expo-file-system/ios/PrivacyInfo.xcprivacy', 'NSPrivacyAccessedAPICategoryDiskSpace'],
    ['expo-constants/ios/PrivacyInfo.xcprivacy', 'NSPrivacyAccessedAPICategoryUserDefaults'],
    ['expo-system-ui/ios/PrivacyInfo.xcprivacy', 'NSPrivacyAccessedAPICategoryUserDefaults'],
  ])('finds %s declaring %s', (manifest, category) => {
    expect(declaredBy(manifest)).toContain(category);
  });
});
