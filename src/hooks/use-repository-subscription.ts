import { useEffect, useState } from 'react';

import type { Unsubscribe } from '../repository/notes-repository';

export function useRepositorySubscription<T>(
  subscribe: (listener: (value: T) => void) => Unsubscribe
): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => subscribe(setValue), [subscribe]);
  return value;
}
