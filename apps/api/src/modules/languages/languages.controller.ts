import { Controller, Get, Inject } from '@nestjs/common';
import type { LanguagesResponse } from '@typing-trainer/contracts';

import { LanguagesService } from './languages.service';

@Controller('languages')
export class LanguagesController {
  constructor(@Inject(LanguagesService) private readonly languages: LanguagesService) {}

  @Get()
  list(): Promise<LanguagesResponse> {
    return this.languages.list();
  }
}
