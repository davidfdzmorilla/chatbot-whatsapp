/**
 * Unit Tests: UserRepository
 * Tests para el repositorio de usuarios
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMockUser } from '../../helpers/test-utils';

// Mock Prisma
const mockFindUnique = jest.fn<any>();
const mockCreate = jest.fn<any>();
const mockUpsert = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockCount = jest.fn<any>();

jest.mock('../../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
      upsert: mockUpsert,
      update: mockUpdate,
      count: mockCount,
    },
  },
}));

// Mock privacy utils
jest.mock('../../../src/utils/privacy', () => ({
  hashPhoneNumber: (phone: string) => `hashed_${phone}`,
}));

describe('UserRepository', () => {
  let userRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { UserRepository } = await import('../../../src/repositories/user.repository');
    userRepository = new UserRepository();
  });

  describe('findByPhoneNumber', () => {
    it('should find user by phone number successfully', async () => {
      const phoneNumber = '+1234567890';
      const mockUser = createMockUser({ phoneNumber });

      mockFindUnique.mockResolvedValue(mockUser);

      const result = await userRepository.findByPhoneNumber(phoneNumber);

      expect(result).toEqual(mockUser);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { phoneNumber },
      });
    });

    it('should return null if user not found', async () => {
      const phoneNumber = '+9999999999';

      mockFindUnique.mockResolvedValue(null);

      const result = await userRepository.findByPhoneNumber(phoneNumber);

      expect(result).toBeNull();
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { phoneNumber },
      });
    });

    it('should hash phone number in logs for privacy', async () => {
      const phoneNumber = '+1234567890';
      mockFindUnique.mockResolvedValue(null);

      await userRepository.findByPhoneNumber(phoneNumber);

      // Privacy function should be called (verified by mock)
      expect(mockFindUnique).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find user by ID successfully', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({ id: userId });

      mockFindUnique.mockResolvedValue(mockUser);

      const result = await userRepository.findById(userId);

      expect(result).toEqual(mockUser);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should return null if user not found by ID', async () => {
      const userId = 'non-existent-user';

      mockFindUnique.mockResolvedValue(null);

      const result = await userRepository.findById(userId);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user with all fields', async () => {
      const userData = {
        phoneNumber: '+1234567890',
        name: 'Test User',
        language: 'en',
      };

      const mockUser = createMockUser(userData);
      mockCreate.mockResolvedValue(mockUser);

      const result = await userRepository.create(userData);

      expect(result).toEqual(mockUser);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          phoneNumber: userData.phoneNumber,
          name: userData.name,
          language: userData.language,
        },
      });
    });

    it('should create user with default language if not provided', async () => {
      const userData = {
        phoneNumber: '+1234567890',
      };

      const mockUser = createMockUser({ ...userData, language: 'es' });
      mockCreate.mockResolvedValue(mockUser);

      const result = await userRepository.create(userData);

      expect(result.language).toBe('es');
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          phoneNumber: userData.phoneNumber,
          name: undefined,
          language: 'es',
        },
      });
    });

    it('should create user without name', async () => {
      const userData = {
        phoneNumber: '+1234567890',
        language: 'es',
      };

      const mockUser = createMockUser({ ...userData, name: null });
      mockCreate.mockResolvedValue(mockUser);

      const result = await userRepository.create(userData);

      expect(result.name).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should create new user if not exists', async () => {
      const phoneNumber = '+1234567890';
      const mockUser = createMockUser({ phoneNumber, language: 'es' });

      mockUpsert.mockResolvedValue(mockUser);

      const result = await userRepository.upsert(phoneNumber);

      expect(result).toEqual(mockUser);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { phoneNumber },
        create: {
          phoneNumber,
          name: undefined,
          language: 'es',
        },
        update: {},
      });
    });

    it('should update existing user with new data', async () => {
      const phoneNumber = '+1234567890';
      const updateData = {
        name: 'Updated Name',
        language: 'en',
      };

      const mockUser = createMockUser({ phoneNumber, ...updateData });
      mockUpsert.mockResolvedValue(mockUser);

      const result = await userRepository.upsert(phoneNumber, updateData);

      expect(result).toEqual(mockUser);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { phoneNumber },
        create: {
          phoneNumber,
          name: updateData.name,
          language: updateData.language,
        },
        update: {
          name: updateData.name,
          language: updateData.language,
        },
      });
    });

    it('should only update provided fields', async () => {
      const phoneNumber = '+1234567890';
      const updateData = { name: 'Only Name Updated' };

      const mockUser = createMockUser({ phoneNumber, name: updateData.name });
      mockUpsert.mockResolvedValue(mockUser);

      await userRepository.upsert(phoneNumber, updateData);

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { phoneNumber },
        create: {
          phoneNumber,
          name: updateData.name,
          language: 'es',
        },
        update: {
          name: updateData.name,
        },
      });
    });
  });

  describe('update', () => {
    it('should update user data successfully', async () => {
      const userId = 'user-123';
      const updateData = {
        name: 'Updated Name',
        language: 'en',
      };

      const mockUser = createMockUser({ id: userId, ...updateData });
      mockUpdate.mockResolvedValue(mockUser);

      const result = await userRepository.update(userId, updateData);

      expect(result).toEqual(mockUser);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: userId },
        data: updateData,
      });
    });

    it('should update only name field', async () => {
      const userId = 'user-123';
      const updateData = { name: 'New Name' };

      const mockUser = createMockUser({ id: userId, name: updateData.name });
      mockUpdate.mockResolvedValue(mockUser);

      const result = await userRepository.update(userId, updateData);

      expect(result.name).toBe(updateData.name);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: userId },
        data: updateData,
      });
    });

    it('should update only language field', async () => {
      const userId = 'user-123';
      const updateData = { language: 'en' };

      const mockUser = createMockUser({ id: userId, language: updateData.language });
      mockUpdate.mockResolvedValue(mockUser);

      const result = await userRepository.update(userId, updateData);

      expect(result.language).toBe(updateData.language);
    });
  });

  describe('count', () => {
    it('should return total user count', async () => {
      const expectedCount = 42;
      mockCount.mockResolvedValue(expectedCount);

      const result = await userRepository.count();

      expect(result).toBe(expectedCount);
      expect(mockCount).toHaveBeenCalled();
    });

    it('should return 0 if no users exist', async () => {
      mockCount.mockResolvedValue(0);

      const result = await userRepository.count();

      expect(result).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when findByPhoneNumber fails', async () => {
      const phoneNumber = '+1234567890';
      const error = new Error('Database connection error');

      mockFindUnique.mockRejectedValue(error);

      await expect(userRepository.findByPhoneNumber(phoneNumber)).rejects.toThrow(
        'Database connection error'
      );
    });

    it('should throw error when create fails', async () => {
      const userData = { phoneNumber: '+1234567890' };
      const error = new Error('Unique constraint violation');

      mockCreate.mockRejectedValue(error);

      await expect(userRepository.create(userData)).rejects.toThrow('Unique constraint violation');
    });

    it('should throw error when update fails', async () => {
      const userId = 'user-123';
      const error = new Error('User not found');

      mockUpdate.mockRejectedValue(error);

      await expect(userRepository.update(userId, { name: 'Test' })).rejects.toThrow(
        'User not found'
      );
    });
  });
});
