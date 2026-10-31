import { render, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';

/**
 * The reader's text size. React Native's test environment reports a font scale
 * of 2 unless told otherwise - large text - so ordinary size has to be asked for.
 */
function withTextScale(fontScale: number) {
  jest
    .spyOn(ReactNative.Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

afterEach(() => {
  jest.restoreAllMocks();
});

const actions = (
  <>
    <Button label="Accept" size="compact" onPress={jest.fn()} />
    <Button label="Decline" size="compact" variant="ghost" onPress={jest.fn()} />
  </>
);

type HostNode = {
  parent: HostNode | null;
  children: (HostNode | string)[];
  props: { style?: ReactNative.StyleProp<ReactNative.ViewStyle> };
};

const contains = (node: HostNode, target: HostNode): boolean =>
  node === target ||
  node.children.some((child) => typeof child !== 'string' && contains(child, target));

/** Whether the row's text and its actions share one horizontal line. */
function sideBySide() {
  const name = screen.getByText('Carla Brandt') as unknown as HostNode;
  const accept = screen.getByRole('button', { name: 'Accept' }) as unknown as HostNode;
  // The nearest container holding both is a row exactly when they sit side by side.
  let node = accept.parent;
  while (node && !contains(node, name)) node = node.parent;
  return ReactNative.StyleSheet.flatten(node?.props.style ?? {}).flexDirection === 'row';
}

describe('ListRow', () => {
  it('puts a row’s actions beside its text at ordinary text sizes', async () => {
    withTextScale(1);
    await render(<ListRow title="Carla Brandt" subtitle="@carla" actions={actions} />);

    expect(sideBySide()).toBe(true);
  });

  /**
   * Beside the text, two buttons scaled up for large Dynamic Type leave the
   * text no room at all, and the requester's name becomes an ellipsis.
   */
  it('moves the actions below the text when the reader’s text is large', async () => {
    withTextScale(1.8);
    await render(<ListRow title="Carla Brandt" subtitle="@carla" actions={actions} />);

    expect(sideBySide()).toBe(false);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeOnTheScreen();
  });

  /** Android sends its 130% setting as a widened float, just under 1.3. */
  it('moves them below at Android’s 130% text size, which arrives as 1.2999…', async () => {
    withTextScale(Math.fround(1.3));
    await render(<ListRow title="Carla Brandt" subtitle="@carla" actions={actions} />);

    expect(sideBySide()).toBe(false);
  });

  it('is never itself a button when it has actions', async () => {
    withTextScale(1);
    await render(
      <ListRow title="Carla Brandt" subtitle="@carla" actions={actions} onPress={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /Carla Brandt/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
