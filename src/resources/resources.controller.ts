import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService, private readonly communityResources: CommunityResourcesService) {}

  @Get('public')
  @ApiOperation({ summary: 'Browse approved public academic resources without an account' })
  findPublic(@Query() query: Record<string, string>) { return this.communityResources.findPublic(query); }

  @Get('public/:id/file-url')
  @ApiOperation({ summary: 'Get a temporary file URL for an approved public resource' })
  getPublicFileUrl(@Param('id') id: string) { return this.communityResources.getPublicFileUrl(id); }

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

  @Get(':id/file-url')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a short-lived URL for an authorized resource file' })
  getFileUrl(@Param('id') id: string, @CurrentUser() user: User) { return this.resourcesService.getFileUrl(id, user, false); }

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
