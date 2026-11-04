import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Whether this screen is the one in front. A screen further back in the stack
 * stays mounted - the roost always sits under everything - so whatever it
 * animates would go on moving where nobody can see it, costing battery for
 * nothing. Screens pass this to what they animate.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return focused;
}
