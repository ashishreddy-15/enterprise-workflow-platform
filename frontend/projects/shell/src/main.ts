// Polyfill global ngDevMode if not defined by modern bundler
(window as unknown as { ngDevMode: boolean }).ngDevMode = typeof (window as unknown as { ngDevMode: boolean }).ngDevMode !== 'undefined'
  ? (window as unknown as { ngDevMode: boolean }).ngDevMode
  : true;

import { initFederation } from '@angular-architects/native-federation';

initFederation('federation.manifest.json', {
  hostRemoteEntry: { url: './remoteEntry.json' },
})
  .catch((err) => console.error(err))
  .then((_) => import('./bootstrap'))
  .catch((err) => console.error(err));
