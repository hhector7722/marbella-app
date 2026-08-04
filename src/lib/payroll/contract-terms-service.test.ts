import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContractTermsService } from './contract-terms-service.ts';

describe('FASE 3: ContractTermsService (hours_contract_terms SSOT)', () => {
  it('calcula correctamente días naturales de meses de 28, 29, 30 y 31 días', () => {
    assert.equal(ContractTermsService.listMonthDays('2026-02').length, 28);
    assert.equal(ContractTermsService.listMonthDays('2024-02').length, 29); // Bisiesto
    assert.equal(ContractTermsService.listMonthDays('2026-06').length, 30);
    assert.equal(ContractTermsService.listMonthDays('2026-07').length, 31);
  });

  it('calcula D_vigentes = 17 para una alta a mitad de mes (día 15 de julio)', async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          in: () => ({
            lte: () => Promise.resolve({
              data: [
                {
                  user_id: 'usr_alta_15',
                  effective_from: '2026-07-15',
                  effective_to: null,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const service = new ContractTermsService(mockSupabase);
    const activeDays = await service.getActiveContractDays('usr_alta_15', '2026-07');
    assert.equal(activeDays, 17); // Del 15 al 31 de julio = 17 días
  });

  it('calcula D_vigentes = 10 para una baja a mitad de mes (día 10 de julio)', async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          in: () => ({
            lte: () => Promise.resolve({
              data: [
                {
                  user_id: 'usr_baja_10',
                  effective_from: '2026-01-01',
                  effective_to: '2026-07-10',
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const service = new ContractTermsService(mockSupabase);
    const activeDays = await service.getActiveContractDays('usr_baja_10', '2026-07');
    assert.equal(activeDays, 10); // Del 1 al 10 de julio = 10 días
  });

  it('calcula D_vigentes = 31 cuando existen dos contract_terms dentro del mismo mes', async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          in: () => ({
            lte: () => Promise.resolve({
              data: [
                {
                  user_id: 'usr_multi_terms',
                  effective_from: '2026-07-01',
                  effective_to: '2026-07-15', // 20h
                },
                {
                  user_id: 'usr_multi_terms',
                  effective_from: '2026-07-16',
                  effective_to: null, // 40h
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const service = new ContractTermsService(mockSupabase);
    const activeDays = await service.getActiveContractDays('usr_multi_terms', '2026-07');
    assert.equal(activeDays, 31); // Cubre todo el mes
  });

  it('devuelve D_vigentes = 0 para un trabajador eventual sin tramos permanentes', async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          in: () => ({
            lte: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };

    const service = new ContractTermsService(mockSupabase);
    const activeDays = await service.getActiveContractDays('usr_eventual', '2026-07');
    assert.equal(activeDays, 0);
  });
});
