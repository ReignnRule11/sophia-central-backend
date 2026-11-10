import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateAcademicCatalogueSubmissionDto } from './dto/create-academic-catalogue-submission.dto';
import { AcademicEntryStatus } from './entities/academic-catalogue-submission.entity';
import { InstitutionsService } from './institutions.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post('submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  submit(@Body() dto: CreateAcademicCatalogueSubmissionDto, @CurrentUser() user: User) {
    return this.institutionsService.submit(dto, user.id);
  }

  @Patch('submissions/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  reviewSubmission(@Param('id') id: string, @Body() body: { status: AcademicEntryStatus.APPROVED | AcademicEntryStatus.REJECTED; reviewNote?: string; sourceUrl?: string; verifiedAt?: string }, @CurrentUser() user: User) {
    if (![AcademicEntryStatus.APPROVED, AcademicEntryStatus.REJECTED].includes(body.status)) throw new BadRequestException('Invalid review status');
    return this.institutionsService.reviewSubmission(id, user.id, body.status, body.reviewNote, body.sourceUrl, body.verifiedAt);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateInstitutionDto) {
    return this.institutionsService.create(dto);
  }

  @Get()
  findAll() {
    return this.institutionsService.findAll();
  }

  @Get('submissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  listSubmissions() {
    return this.institutionsService.listSubmissions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.institutionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.institutionsService.remove(id);
  }
}
