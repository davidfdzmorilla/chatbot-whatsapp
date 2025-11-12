import { User } from '@prisma/client';
import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { hashPhoneNumber } from '../utils/privacy.js';

/**
 * User Repository
 * Handles all database operations related to users
 */
export class UserRepository {
  /**
   * Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    try {
      logger.debug('Finding user by phone number', {
        phoneNumberHash: hashPhoneNumber(phoneNumber)
      });

      const user = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (user) {
        logger.debug('User found', { userId: user.id, phoneNumber });
      } else {
        logger.debug('User not found', {
          phoneNumberHash: hashPhoneNumber(phoneNumber)
        });
      }

      return user;
    } catch (error) {
      logger.error('Error finding user by phone number', {
        phoneNumberHash: hashPhoneNumber(phoneNumber),
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    try {
      logger.debug('Finding user by ID', { userId: id });

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (user) {
        logger.debug('User found', { userId: id });
      } else {
        logger.debug('User not found', { userId: id });
      }

      return user;
    } catch (error) {
      logger.error('Error finding user by ID', {
        userId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Create a new user
   */
  async create(data: {
    phoneNumber: string;
    name?: string;
    language?: string;
  }): Promise<User> {
    try {
      logger.info('Creating new user', {
        phoneNumberHash: hashPhoneNumber(data.phoneNumber),
        hasName: !!data.name,
      });

      const user = await prisma.user.create({
        data: {
          phoneNumber: data.phoneNumber,
          name: data.name,
          language: data.language || 'es',
        },
      });

      logger.info('User created successfully', {
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });

      return user;
    } catch (error) {
      logger.error('Error creating user', {
        phoneNumberHash: hashPhoneNumber(data.phoneNumber),
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Upsert user (create if doesn't exist, update if exists)
   */
  async upsert(
    phoneNumber: string,
    data?: Partial<Pick<User, 'name' | 'language'>>
  ): Promise<User> {
    try {
      logger.debug('Upserting user', {
        phoneNumberHash: hashPhoneNumber(phoneNumber)
      });

      const user = await prisma.user.upsert({
        where: { phoneNumber },
        create: {
          phoneNumber,
          name: data?.name,
          language: data?.language || 'es',
        },
        update: {
          ...(data?.name !== undefined && { name: data.name }),
          ...(data?.language !== undefined && { language: data.language }),
        },
      });

      logger.debug('User upserted successfully', {
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });

      return user;
    } catch (error) {
      logger.error('Error upserting user', {
        phoneNumberHash: hashPhoneNumber(phoneNumber),
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update user data
   */
  async update(
    id: string,
    data: Partial<Pick<User, 'name' | 'language'>>
  ): Promise<User> {
    try {
      logger.debug('Updating user', { userId: id });

      const user = await prisma.user.update({
        where: { id },
        data,
      });

      logger.info('User updated successfully', {
        userId: user.id,
      });

      return user;
    } catch (error) {
      logger.error('Error updating user', {
        userId: id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    try {
      return await prisma.user.count();
    } catch (error) {
      logger.error('Error counting users', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
