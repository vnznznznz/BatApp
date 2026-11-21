import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import NotFoundScreen from '@/app/+not-found';

/**
 * Expo Router reads its options at run time from the app config, under
 * `extra.router`, which its config plugin fills from the plugin's entry in
 * app.json. In tests there is no config at all, so it is built here the same
 * way: app.json's entry, through the router's own plugin.
 */
jest.mock('expo-constants', () => {
  const { expo } = jest.requireActual<typeof import('../../app.json')>('../../app.json');
  const withRouter = jest.requireActual<{
    default: (config: object, props: unknown) => { extra?: { router?: object } };
  }>('expo-router/plugin/build/withRouter').default;
  const entry = expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-router');
  const expoConfig = withRouter(
    { name: expo.name, slug: expo.slug },
    Array.isArray(entry) ? entry[1] : undefined,
  );
  return { __esModule: true, default: { expoConfig } };
});

// The sitemap itself reads the browser's address, which a test does not have;
// a stand-in shows where it would have been drawn.
jest.mock('expo-router/build/views/Sitemap', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sitemap: () => <Text testID="expo-router-sitemap">Sitemap</Text>,
    getNavOptions: () => ({}),
  };
});

function Welcome() {
  return <Text>Night Courier</Text>;
}

/** The app's routes, as far as these tests need them: the start, and the page for anything else. */
const routes = { index: Welcome, '+not-found': NotFoundScreen };

const NOWHERE = 'This link does not lead anywhere in Night Courier. It may be old, or mistyped.';

describe('a link that leads nowhere', () => {
  /**
   * There was no such page: a wrong or stale nightcourier:// link landed on
   * Expo Router's own, with a link to its sitemap - a developer's tool.
   */
  it('says so plainly, in the app’s own words', async () => {
    await renderRouter(routes, { initialUrl: '/letters/from-an-old-email' });

    expect(screen.getByText(NOWHERE)).toBeOnTheScreen();
    expect(screen.queryByText(/sitemap/i)).toBeNull();
  });

  it('leads back to the start', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const app = renderRouter(routes, { initialUrl: '/no-such-place' });
    await app;

    await user.press(screen.getByRole('button', { name: 'Back to the start' }));

    expect(screen.getByText('Night Courier')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    expect(screen.queryByText(NOWHERE)).toBeNull();
  });

  /**
   * The sitemap lists every screen of the app and is reachable by its address
   * in a production build, too. app.json switches it off.
   */
  it('is what the sitemap’s address leads to as well', async () => {
    await renderRouter(routes, { initialUrl: '/_sitemap' });

    expect(screen.queryByTestId('expo-router-sitemap')).toBeNull();
    expect(screen.getByText(NOWHERE)).toBeOnTheScreen();
  });
});
