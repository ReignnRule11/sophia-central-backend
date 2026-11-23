import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';
import { SupportService } from './support.service';

@ApiTags('Public Contact')
@Controller('contact')
export class PublicContactController {
  constructor(private readonly support: SupportService) {}

  @Post()
  async submit(@Body() dto: CreateContactEnquiryDto) {
    if (dto.website?.trim()) {
      return { success: true, message: 'Thank you for contacting Sophis Central. Your enquiry has been submitted.' };
    }
    return this.support.createGuestContact({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      category: dto.category,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
    });
  }
}
