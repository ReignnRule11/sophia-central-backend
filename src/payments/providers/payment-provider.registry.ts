import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from './payment-provider.interface';
import { PaystackProvider } from './paystack.provider';
import { FlutterwaveProvider } from './flutterwave.provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    private readonly config: ConfigService,
    paystack: PaystackProvider,
    flutterwave: FlutterwaveProvider,
  ) {
    this.providers = new Map<string, PaymentProvider>();
    this.providers.set(paystack.name, paystack);
    this.providers.set(flutterwave.name, flutterwave);
  }

  defaultProvider(): PaymentProvider {
    return this.get(this.config.get<string>('PAYMENT_PROVIDER') || 'paystack');
  }

  get(name: string): PaymentProvider {
    const provider = this.providers.get(String(name || '').toLowerCase());
    if (!provider) throw new ServiceUnavailableException(`Payment provider "${name}" is not enabled.`);
    return provider;
  }
}
