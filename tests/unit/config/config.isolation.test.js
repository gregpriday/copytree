/**
 * Tests for ConfigManager instance isolation
 *
 * Verifies that multiple ConfigManager instances can be created and used
 * independently, enabling concurrent operations with different configurations.
 *
 * @see https://github.com/gregpriday/copytree/issues/62
 */

// Unmock fs-extra to use real filesystem for ConfigManager loading
jest.unmock('fs-extra');

// Use real imports since ConfigManager.create needs to actually work
import { ConfigManager, config } from '../../../src/config/ConfigManager.js';

describe('ConfigManager isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset deprecation warning flags
    if (config._deprecationWarned) {
      config._deprecationWarned = false;
    }
  });

  describe('ConfigManager.create() factory method', () => {
    test('should create independent instances', async () => {
      const instance1 = await ConfigManager.create();
      const instance2 = await ConfigManager.create();

      expect(instance1).not.toBe(instance2);
      expect(instance1).toBeInstanceOf(ConfigManager);
      expect(instance2).toBeInstanceOf(ConfigManager);
    });

    test('should allow different configurations per instance', async () => {
      const instance1 = await ConfigManager.create();
      const instance2 = await ConfigManager.create();

      // Set different values
      instance1.set('test.value', 'instance1');
      instance2.set('test.value', 'instance2');

      // Verify isolation
      expect(instance1.get('test.value')).toBe('instance1');
      expect(instance2.get('test.value')).toBe('instance2');
    });

    test('should not share state between instances', async () => {
      const instance1 = await ConfigManager.create();
      const instance2 = await ConfigManager.create();

      // Modify instance1 config
      instance1.set('shared.key', 'value1');
      instance1.set('nested.deep.value', 123);

      // Instance2 should not see the changes
      expect(instance2.get('shared.key')).toBeUndefined();
      expect(instance2.get('nested.deep.value')).toBeUndefined();
    });

    test('should initialize each instance independently', async () => {
      // Track initialization calls
      let initCount = 0;
      const originalLoadConfiguration = ConfigManager.prototype.loadConfiguration;
      ConfigManager.prototype.loadConfiguration = async function () {
        initCount++;
        await originalLoadConfiguration.call(this);
      };

      const instance1 = await ConfigManager.create();
      const instance2 = await ConfigManager.create();

      expect(initCount).toBe(2);

      // Restore original method
      ConfigManager.prototype.loadConfiguration = originalLoadConfiguration;
    });
  });

  describe('instance vs singleton isolation', () => {
    test('ConfigManager.create() instances should be isolated from singleton', async () => {
      // Get singleton
      const singleton = config();
      singleton.set('singleton.value', 'singleton');

      // Create new instance
      const instance = await ConfigManager.create();
      instance.set('instance.value', 'instance');

      // Verify isolation
      expect(singleton.get('instance.value')).toBeUndefined();
      expect(instance.get('singleton.value')).toBeUndefined();
    });
  });

  describe('concurrent operations simulation', () => {
    test('should support concurrent operations with different configs', async () => {
      // Simulate two concurrent operations
      const config1 = await ConfigManager.create();
      const config2 = await ConfigManager.create();

      // Set different configuration for each operation
      config1.set('operation.id', 'op1');
      config1.set('operation.profile', 'profile-a');

      config2.set('operation.id', 'op2');
      config2.set('operation.profile', 'profile-b');

      // Simulate concurrent access (as would happen in parallel operations)
      const results = await Promise.all([
        Promise.resolve({
          id: config1.get('operation.id'),
          profile: config1.get('operation.profile'),
        }),
        Promise.resolve({
          id: config2.get('operation.id'),
          profile: config2.get('operation.profile'),
        }),
      ]);

      expect(results[0]).toEqual({ id: 'op1', profile: 'profile-a' });
      expect(results[1]).toEqual({ id: 'op2', profile: 'profile-b' });
    });

    test('should allow many concurrent instances without interference', async () => {
      const instanceCount = 10;
      const instances = await Promise.all(
        Array(instanceCount)
          .fill(null)
          .map(() => ConfigManager.create()),
      );

      // Set unique value in each instance
      instances.forEach((instance, i) => {
        instance.set('unique.id', `instance-${i}`);
      });

      // Verify each instance has its own value
      instances.forEach((instance, i) => {
        expect(instance.get('unique.id')).toBe(`instance-${i}`);
      });
    });
  });

  describe('deprecation warnings', () => {
    test('config() should emit deprecation warning (in non-test env)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const originalEnv = process.env.NODE_ENV;

      // Reset the warning flag
      config._deprecationWarned = false;

      // Temporarily set non-test environment
      process.env.NODE_ENV = 'production';

      // Call config() - should emit warning
      config();

      // Verify warning was emitted
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('config() singleton is deprecated'),
      );

      // Restore
      process.env.NODE_ENV = originalEnv;
      warnSpy.mockRestore();
    });
  });
});
