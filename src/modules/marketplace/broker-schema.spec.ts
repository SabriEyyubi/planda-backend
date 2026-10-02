import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SchemaProperty {
  type?: string;
  nullable?: boolean;
}

describe('Generated broker response contract', () => {
  const document = JSON.parse(readFileSync(resolve('openapi/openapi.json'), 'utf8')) as {
    components: { schemas: Record<string, { properties: Record<string, SchemaProperty> }> };
  };

  it.each([
    ['BrokerUnitResponseDto', 'floor', 'number'],
    ['BrokerUnitResponseDto', 'block', 'string'],
    ['BrokerUnitResponseDto', 'grossArea', 'string'],
    ['BrokerUnitResponseDto', 'orientation', 'string'],
    ['BrokerUnitResponseDto', 'floorPlanImageUrl', 'string'],
    ['BrokerUnitResponseDto', 'brokerPrice', 'string'],
    ['BrokerUnitResponseDto', 'commissionPercent', 'string'],
    ['BrokerUnitResponseDto', 'brokerTermsUpdatedAt', 'string'],
    ['BrokerProjectResponseDto', 'brokerPrice', 'string'],
    ['BrokerProjectResponseDto', 'commissionPercent', 'string'],
    ['BrokerProjectResponseDto', 'reservationHours', 'number'],
    ['BrokerProjectResponseDto', 'salesContact', 'string'],
  ])('exposes %s.%s as nullable %s rather than object', (schema, field, type) => {
    expect(document.components.schemas[schema]?.properties[field]).toMatchObject({
      type,
      nullable: true,
    });
  });
});
