export interface PersonaChangedDetail {
  persona: {
    id: string;
    name: string;
    roles: string[];
    description?: string;
  };
  token: string;
}

export function dispatchPersonaChanged(detail: PersonaChangedDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PersonaChangedDetail>('ewp:persona-changed', { detail }));
  }
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
