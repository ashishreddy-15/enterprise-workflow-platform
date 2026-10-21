import { withNativeFederation, fromPackageJson } from '@angular-architects/native-federation/config';

export default withNativeFederation({
  name: 'template-mfe',

  exposes: {
    './TemplateRoutes': './projects/template-mfe/src/app/template.routes.ts',
  },

  shared: fromPackageJson({ singleton: true, strictVersion: true, requiredVersion: 'auto', build: 'package' })
    .patch(['@angular/*'], { includeSecondaries: { keepAll: true } })
    .get(),

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
  ],

  features: {
    denseChunking: true,
    denseExternals: true,
    strictImports: false
  },
});
