export const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
