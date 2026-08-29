import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('normalizes valid email and rejects short passwords', async () => {
    const dto = plainToInstance(RegisterDto, { email: ' Buyer@Example.TEST ', password: 'short' });
    const errors = await validate(dto);
    expect(dto.email).toBe('buyer@example.test');
    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
