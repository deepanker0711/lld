import { Injectable } from '@nestjs/common';
import { ALL_CHANNELS } from './domain/notification-channel';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { ChannelPreferences, User } from './entities/user.entity';
import { UserRepository } from './user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  create(dto: CreateUserDto): User {
    return this.users.create({
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      deviceToken: dto.deviceToken ?? null,
      // Opt-out model: everything on until the user turns it off.
      preferences: Object.fromEntries(
        ALL_CHANNELS.map((c) => [c, true]),
      ) as ChannelPreferences,
    });
  }

  get(id: string): User {
    return this.users.findByIdOrThrow(id);
  }

  list(): User[] {
    return this.users.findAll();
  }

  /** Merge, don't replace: { SMS: false } leaves EMAIL and PUSH as they were. */
  updatePreferences(id: string, dto: UpdatePreferencesDto): User {
    const user = this.get(id);
    const changes = Object.fromEntries(
      Object.entries(dto.channels).filter(([, v]) => v !== undefined),
    );
    return this.users.update(id, {
      preferences: { ...user.preferences, ...changes },
    });
  }
}
