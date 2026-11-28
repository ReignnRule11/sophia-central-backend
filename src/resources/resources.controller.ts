import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService } from './resources.service';
import { CommunityResourcesService } from './community-resources.service';
import { OpenSourceResearchService } from './open-source-research.service';
import { ImportOpenSourceResearchDto } from './dto/import-open-source-research.dto';
import { BulkImportOpenSourceResearchDto } from './dto/bulk-import-open-source-research.dto';

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly communityResources: CommunityResourcesService,
    private readonly openSourceResearch: OpenSourceResearchService,
  ) {}


  @Get('open-source-library')
  @ApiOperation({ summary: 'Browse only centrally imported open-source research materials' })
  listOpenSourceLibrary(@Query() query: Record<string, string>) { return this.openSourceResearch.listPublic(query); }

  @Get('open-source-library/:id/file-url')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a temporary file URL only for licensed open-source research full text' })
  getOpenSourceFileUrl(@Param('id') id: string, @CurrentUser() user: User) { return this.openSourceResearch.getPublicFileUrl(id, user); }

  @Get('open-source-library/:id')
  @ApiOperation({ summary: 'Read metadata for one imported open-source research item' })
  findOpenSourceOne(@Param('id') id: string) { return this.openSourceResearch.findPublicOne(id); }

  @Get('open-source/search')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Search external open-access research and matching imported records for every authenticated role' })
  searchOpenSourceResearch(
    @Query('q') query: string,
    @Query('author') author = '',
    @Query('course') course = '',
    @Query('topic') topic = '',
    @Query('page') page = '1',
    @Query('perPage') perPage = '12',
  ) { return this.openSourceResearch.search(query, page, perPage, { author, course, topic }); }

  @Post('open-source/import/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.MODERATOR) @ApiBearerAuth()
  @ApiOperation({ summary: 'Import a controlled batch of up to 20 research works with per-item licence checks and a result report' })
  bulkImportOpenSourceResearch(@Body() dto: BulkImportOpenSourceResearchDto) {
    return this.openSourceResearch.importMany(dto.identifiers);
  }

  @Post('open-source/import')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.MODERATOR) @ApiBearerAuth()
  @ApiOperation({ summary: 'Import research metadata and legally redistributable full text into the General Library' })
  importOpenSourceResearch(@Body() dto: ImportOpenSourceResearchDto) { return this.openSourceResearch.import(dto.identifier); }

  @Get('public')
  @ApiOperation({ summary: 'Browse approved public academic resources without an account' })
  findPublic(@Query() query: Record<string, string>) { return this.communityResources.findPublic(query); }

  @Get('public/:id/file-url')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a temporary file URL for an approved public resource using an authenticated catalogue-linked account' })
  getPublicFileUrl(@Param('id') id: string, @CurrentUser() user: User) { return this.communityResources.getPublicFileUrl(id, user); }

  @Get('public/:id')
  @ApiOperation({ summary: 'Read approved public resource metadata without an account' })
  findPublicOne(@Param('id') id: string) { return this.communityResources.findPublicOne(id); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.STUDENT, UserRole.LECTURER) @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a resource for moderation as a student or lecturer' })
  create(@Body() dto: CreateResourceDto, @CurrentUser() user: User) { return this.communityResources.create(dto, user.id); }

  @Get()
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get resources visible to the authenticated user' })
  findAll(@CurrentUser() user: User) { return this.resourcesService.findVisibleTo(user); }

  @Get('saved')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'List resources saved to the authenticated account' })
  findSaved(@CurrentUser() user: User) { return this.resourcesService.findSavedForUser(user); }

  @Get('downloaded')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'List resources downloaded in-app for the authenticated account' })
  findDownloaded(@CurrentUser() user: User) { return this.resourcesService.findDownloadedForUser(user); }

  @Post(':id/download')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Record an in-app download in the authenticated account' })
  downloadInApp(@Param('id') id: string, @CurrentUser() user: User) { return this.resourcesService.downloadForUser(id, user); }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Save an approved resource to the authenticated account' })
  save(@Param('id') id: string, @CurrentUser() user: User) { return this.resourcesService.saveForUser(id, user); }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a resource from saved resources' })
  unsave(@Param('id') id: string, @CurrentUser() user: User) { return this.resourcesService.removeSavedForUser(id, user); }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.STUDENT, UserRole.LECTURER) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated contributor’s own submissions and review statuses' })
  findMine(@CurrentUser() user: User) { return this.resourcesService.findMine(user.id); }

  @Get(':id/reader')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream an authorized PDF, Word, PowerPoint, or text resource into the protected in-app reader without exposing a storage URL' })
  async getReaderFile(@Param('id') id: string, @CurrentUser() user: User, @Res() response: Response) {
    const file = await this.resourcesService.getReaderFile(id, user);
    response.status(200).set({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...(file.contentLength ? { 'Content-Length': String(file.contentLength) } : {}),
    });
    file.body.on('error', () => response.destroy());
    file.body.pipe(response);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a resource the authenticated user is allowed to view' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) { return this.resourcesService.findOneForViewer(id, user); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.MODERATOR) @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a resource' })
  update(@Param('id') id: string, @Body() dto: UpdateResourceDto) { return this.resourcesService.update(id, dto); }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.MODERATOR) @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a resource' })
  remove(@Param('id') id: string) { return this.resourcesService.remove(id); }
}
