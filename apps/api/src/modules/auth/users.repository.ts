import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { User } from '@typing-trainer/contracts';
import { QueryFailedError, type DataSource } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

export interface UserWithPassword extends User {
  readonly passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Case-insensitive, since the column is citext. */
  async findByUsername(username: string): Promise<UserWithPassword | undefined> {
    const rows = await this.dataSource.query<UserWithPassword[]>(
      `SELECT id, username::text AS username, timezone, locale, password_hash AS "passwordHash"
       FROM users WHERE username = $1::citext`,
      [username],
    );
    return rows[0];
  }

  /** The new user, or undefined when the username is taken (in any letter case). */
  async create(
    username: string,
    passwordHash: string,
    timezone: string,
  ): Promise<User | undefined> {
    try {
      const rows = await this.dataSource.query<User[]>(
        `INSERT INTO users (username, password_hash, timezone) VALUES ($1, $2, $3)
         RETURNING id, username::text AS username, timezone, locale`,
        [username, passwordHash, timezone],
      );
      return rows[0];
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.dataSource.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      userId,
    ]);
  }
}
