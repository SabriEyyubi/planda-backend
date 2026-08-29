import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMediaDto } from './growth.dto';

describe('UpdateMediaDto', () => {
  it('accepts an empty alt text as an explicit clear operation', async () => {
    const dto = plainToInstance(UpdateMediaDto, { version: 1, altText: '   ' });

    expect(dto.altText).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });
});
