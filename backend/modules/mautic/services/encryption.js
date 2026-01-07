import logger from '../../../utils/logger.js';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (!envKey) {
    logger.error('ENCRYPTION_KEY environment variable is required but not set');
    throw new Error('ENCRYPTION_KEY must be set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  
  if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  
  if (envKey.length < 16) {
    logger.error('ENCRYPTION_KEY is too short (minimum 16 characters)');
    throw new Error('ENCRYPTION_KEY must be at least 16 characters');
  }
  
  const hash = crypto.createHash('sha256').update(envKey).digest();
  return hash;
}

const ENCRYPTION_KEY_BUFFER = getEncryptionKey();

class EncryptionService {
  encrypt(text) {
    if (!text) return '';
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return IV + encrypted data (IV is needed for decryption)
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a string
   * @param {string} encryptedText - Encrypted text with IV prepended
   * @returns {string} Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText) return '';
    
    try {
      const parts = encryptedText.split(':');
      
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate a random encryption key for .env file
   * @returns {string} 64-character hex string
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }
}

export default new EncryptionService();
