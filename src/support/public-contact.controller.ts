import { Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';
import { SupportEmailService } from './support-email.service';

@ApiTags('Public Contact')
@Controller('contact')
export class PublicContactController {
  constructor(private readonly email: SupportEmailService) {}

  @Post()
  async submit(@Body() dto: CreateContactEnquiryDto) {
    if (dto.website?.trim()) {
      return { success: true, message: 'Thank you for contacting Sophis Central. Your enquiry has been sent.' };
    }
    try {
      await this.email.sendContactEnquiry({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      category: dto.category,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      });
    } catch {
      throw new ServiceUnavailableException('Contact enquiries are temporarily unavailable. Please try again later.');
    }
    return {
      success: true,
      message: 'Thank you for contacting Sophis Central. Your enquiry has been sent.',
    };
  }
}
