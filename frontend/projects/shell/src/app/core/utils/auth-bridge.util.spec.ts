import { dispatchPersonaChanged, onPersonaChanged, PersonaChangedDetail } from './auth-bridge.util';

describe('auth-bridge.util', () => {
  it('should dispatch and receive typed persona changed events', () => {
    let received: PersonaChangedDetail | undefined;

    const cleanup = onPersonaChanged((detail) => {
      received = detail;
    });

    const mockDetail: PersonaChangedDetail = {
      persona: {
        id: 'user-finance',
        name: 'Finance Approver',
        roles: ['ROLE_FINANCE_MANAGER']
      },
      token: 'jwt.mock.token'
    };

    dispatchPersonaChanged(mockDetail);

    expect(received).toBeDefined();
    expect(received?.persona.id).toBe('user-finance');
    expect(received?.token).toBe('jwt.mock.token');

    cleanup();

    // Verify cleanup removes event listener
    received = undefined;
    dispatchPersonaChanged(mockDetail);
    expect(received).toBeUndefined();
  });
});
