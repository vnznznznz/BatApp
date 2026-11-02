import { act, renderHook, waitFor } from '@testing-library/react-native';

import { RpcError } from '@/lib/rpc-error';
import { useRemote } from '@/lib/use-remote';

/** Being mounted stands in for being focused; there is no navigator here. */
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

describe('useRemote', () => {
  /**
   * A letter already on screen can be refused on a reload - hidden by a block
   * just made, or deleted with its sender's account. The data is kept through
   * a failed reload, so the screen has to be told why it failed to know that
   * what it is showing is gone. (Found in review.)
   */
  it('says why a reload was refused, and keeps the last data', async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('the letter')
      .mockRejectedValueOnce(new RpcError('That letter could not be found.', 'message_not_found'));
    const { result } = await renderHook(() => useRemote(load));
    await waitFor(() => expect(result.current.data).toBe('the letter'));

    await act(() => result.current.reload());

    expect(result.current.reason).toBe('message_not_found');
    expect(result.current.error).toBe('That letter could not be found.');
    expect(result.current.data).toBe('the letter');
  });

  it('has no reason for a failure that was not a refusal, nor after a success', async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce('the letter');
    const { result } = await renderHook(() => useRemote(load));
    await waitFor(() => expect(result.current.error).toBe('Network request failed'));
    expect(result.current.reason).toBeNull();

    await act(() => result.current.reload());

    expect(result.current.reason).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
