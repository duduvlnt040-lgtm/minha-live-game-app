import type { PlanTier } from '../src/types/platform';

export interface CheckoutPreparationResult {
  ready: boolean;
  provider: 'mercadopago';
  mode: 'not-configured';
  plan: PlanTier;
  message: string;
}

/**
 * Mercado Pago integration interface prepared for future commercialization stage.
 * Intentionally does NOT process fake payments or require billing credentials in v1.
 */
export function prepareMercadoPagoCheckout(plan: PlanTier): CheckoutPreparationResult {
  const hasToken = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
  if (!hasToken) {
    return {
      ready: false,
      provider: 'mercadopago',
      mode: 'not-configured',
      plan,
      message:
        'Integração com Mercado Pago preparada para a próxima etapa. Nenhuma cobrança está ativa nesta versão.',
    };
  }

  return {
    ready: true,
    provider: 'mercadopago',
    mode: 'not-configured',
    plan,
    message:
      'Credenciais detectadas em ambiente. Conecte o endpoint de preferência do SDK Mercado Pago quando autorizar cobrança em produção.',
  };
}
