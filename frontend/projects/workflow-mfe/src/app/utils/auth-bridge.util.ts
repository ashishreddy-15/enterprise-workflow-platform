export interface PersonaChangedDetail {
  persona: {
    id: string;
    name: string;
    roles: string[];
    description?: string;
  };
  token: string;
}

export function onPersonaChanged(callback: (detail?: PersonaChangedDetail) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = (event: Event) => {
    const custom = event as CustomEvent<PersonaChangedDetail>;
    callback(custom.detail);
  };
  window.addEventListener('ewp:persona-changed', handler);
  return () => window.removeEventListener('ewp:persona-changed', handler);
}
