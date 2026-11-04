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

  it('asks Android for nothing beyond the network', () => {
    expect(expo.android).not.toHaveProperty('permissions');
    expect([...expo.android.blockedPermissions].sort()).toEqual(
      [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ].sort(),
    );
  });
});
