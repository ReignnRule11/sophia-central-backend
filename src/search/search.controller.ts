import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') q?: string,
    @Query('course') course?: string,
    @Query('institution') institution?: string,
    @Query('level') level?: string,
    @Query('type') type?: string,
  ) {
    return this.searchService.search({ q, course, institution, level, type });
  }
}
