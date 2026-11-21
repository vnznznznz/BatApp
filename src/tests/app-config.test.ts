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
