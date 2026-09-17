import { Global, Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { ContentConsistency } from './content-consistency';
import { ContentLibrary, loadContentLibrary } from './content-library';

@Global()
@Module({
  providers: [
    {
      provide: ContentLibrary,
      useFactory: (env: Env) => loadContentLibrary(env.CONTENT_DIR),
      inject: [ENV],
    },
    ContentConsistency,
  ],
  exports: [ContentLibrary, ContentConsistency],
})
export class ContentModule {}
