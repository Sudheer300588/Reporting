import logger from '../../../utils/logger.js';
import SftpClient from 'ssh2-sftp-client';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../../../prisma/client.js';

class SftpService {
  constructor() {
    this.localDataDir = path.join(process.cwd(), 'data', 'campaigns');
  }

  createClient() {
    // Create a new SFTP client for each operation to avoid connection reuse issues
    return new SftpClient();
  }

  async getConfig() {
    // Fetch latest SFTP credentials from DB
    const cred = await prisma.sFTPCredential.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    if (!cred) {
      throw new Error('No SFTP credentials found in database.');
    }
    return {
      host: cred.host,
      port: cred.port,
      username: cred.username,
      password: cred.password,
      readyTimeout: 30000,
      retries: 3,
      retry_factor: 2,
      retry_minTimeout: 2000,
      remotePath: cred.remotePath
    };
  }

  async getRemotePath() {
    const cred = await prisma.sFTPCredential.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    return cred?.remotePath || '/';
  }

  async ensureLocalDirectory() {
    try {
      await fs.mkdir(this.localDataDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating local directory:', error);
    }
  }

  async connect(sftp) {
    const config = await this.getConfig();
    try {
      logger.debug(`Connecting to SFTP: ${config.host}:${config.port}`);
      logger.debug(`Username: ${config.username}`);
      logger.debug(`Password: ${config.password ? '***' + config.password.slice(-4) : 'NOT SET'}`);
      logger.debug(`Timeout: ${config.readyTimeout}ms, Retries: ${config.retries}`);
      // Validate required fields
      if (!config.host || !config.username || !config.password) {
        throw new Error('Missing required SFTP credentials in database.');
      }
      await sftp.connect(config);
      logger.debug('Connected to SFTP server');
      return true;
    } catch (error) {
      logger.error('SFTP connection failed:', error.message);
      logger.error('Config used:', {
        host: config.host,
        port: config.port,
        username: config.username,
        hasPassword: !!config.password
      });
      throw new Error(`SFTP connection failed: ${error.message}`);
    }
  }

  async disconnect(sftp) {
    try {
      await sftp.end();
      logger.debug('Disconnected from SFTP server');
    } catch (error) {
      logger.error('Error disconnecting from SFTP:', error);
    }
  }

  async listFiles(sftp) {
    try {
      const remotePath = await this.getRemotePath();
      if (!remotePath) {
        throw new Error('Remote path is missing or invalid');
      }
      const fileList = await sftp.list(remotePath);
      // Filter for JSON files only
      return fileList.filter(file => file.name.endsWith('.json'));
    } catch (error) {
      logger.error('Error listing files:', error);
      throw error;
    }
  }

  async downloadFile(sftp, remoteFilePath, localFilePath) {
    try {
      await sftp.get(remoteFilePath, localFilePath);
      logger.debug(`Downloaded: ${remoteFilePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to download ${remoteFilePath}:`, error.message);
      return false;
    }
  }

  async getImportedFilenames() {
    try {
      const importedFiles = await prisma.importedFile.findMany({
        select: { filename: true }
      });
      return importedFiles.map(f => f.filename);
    } catch (error) {
      logger.error('Error fetching imported filenames:', error);
      return [];
    }
  }

  async downloadAllFiles() {
    await this.ensureLocalDirectory();
    const sftp = this.createClient();
    
    try {
      // Get filenames already imported in database
      const importedFilenames = await this.getImportedFilenames();
      
      // Get filenames already downloaded locally
      let localFiles = [];
      try {
        localFiles = await fs.readdir(this.localDataDir);
        localFiles = localFiles.filter(f => f.endsWith('.json'));
      } catch (error) {
        logger.debug('Local directory empty or not readable, will download all new files');
      }
      
      await this.connect(sftp);
      const files = await this.listFiles(sftp);
      
      // Filter out files that are already imported OR already downloaded locally
      const newFiles = files.filter(f => 
        !importedFilenames.includes(f.name) && !localFiles.includes(f.name)
      );
      
      if (newFiles.length === 0) {
        const alreadyDownloaded = files.filter(f => localFiles.includes(f.name)).length;
        const alreadyImported = files.filter(f => importedFilenames.includes(f.name)).length;
        
        logger.debug(`ℹ️  All files already processed:`);
        logger.debug(`   - ${alreadyImported} files imported to database`);
        logger.debug(`   - ${alreadyDownloaded} files downloaded locally`);
        logger.debug(`   - ${files.length} total files on SFTP`);
        
        await this.disconnect(sftp);
        return {
          success: true,
          filesDownloaded: 0,
          totalFiles: files.length,
          warning: 'All files already downloaded or imported. No new files to process.',
          details: []
        };
      }
      
      const downloadResults = [];
      const remotePath = await this.getRemotePath();
      
      logger.debug(`📥 Downloading ${newFiles.length} new files from SFTP...`);
      logger.debug(`   (Skipping ${files.length - newFiles.length} already downloaded/imported files)`);
      
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const remoteFilePath = `${remotePath}/${file.name}`;
        const localPath = path.join(this.localDataDir, file.name);
        
        if (typeof remoteFilePath !== 'string') {
          logger.error(`Remote file path is not a string:`, remoteFilePath);
        }
        logger.debug(`   [${i + 1}/${newFiles.length}] Downloading ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
        const success = await this.downloadFile(sftp, remoteFilePath, localPath);
        if (!success) {
          logger.error(`Download failed for: ${remoteFilePath} -> ${localPath}`);
        }
        // Check if file is empty after download
        try {
          const stats = await fs.stat(localPath);
          if (stats.size === 0) {
            logger.error(`Downloaded file is empty: ${localPath}`);
          }
        } catch (statErr) {
          logger.error(`Error checking file size for ${localPath}:`, statErr.message);
        }
        downloadResults.push({
          filename: file.name,
          success,
          size: file.size,
          timestamp: new Date().toISOString()
        });
      }
      
      logger.debug(`✅ Downloaded ${downloadResults.filter(r => r.success).length}/${newFiles.length} files`);
      
      await this.disconnect(sftp);
      
      return {
        success: true,
        filesDownloaded: downloadResults.filter(r => r.success).length,
        totalFiles: newFiles.length,
        details: downloadResults
      };
    } catch (error) {
      await this.disconnect(sftp);
      // Provide detailed error info
      let errorMsg = error.message || 'Unknown error';
      if (error.code) errorMsg += ` (code: ${error.code})`;
      if (error.stack) errorMsg += `\nStack: ${error.stack}`;
      throw new Error(`SFTP fetch failed: ${errorMsg}`);
    }
  }

  parseJSON(jsonContent) {
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Handle the actual SFTP JSON structure: { fields: [...], data: [[...], [...]] }
      if (parsed.fields && parsed.data && Array.isArray(parsed.fields) && Array.isArray(parsed.data)) {
        // Map array indices to field names
        const fieldMapping = {};
        parsed.fields.forEach((fieldName, index) => {
          fieldMapping[fieldName] = index;
        });
        
        // Transform array-of-arrays to objects
        return parsed.data.map((row, index) => {
          const campaignId = row[fieldMapping['Campaign ID']] || '';
          const phoneNumber = row[fieldMapping['Phone Number']] || '';
          const date = row[fieldMapping['Date']] || '';
          const originalRecordId = row[fieldMapping['Record ID']] || '';
          
          return {
            campaignName: row[fieldMapping['Campaign Name']] || '',
            campaignId,
            phoneNumber,
            carrier: row[fieldMapping['Carrier']] || '',
            lineType: row[fieldMapping['Line Type']] || '',
            status: row[fieldMapping['Status']] || '',
            statusCode: parseInt(row[fieldMapping['Status Code']]) || 0,
            statusReason: row[fieldMapping['Status Reason']] || '',
            date,
            callbacks: parseInt(row[fieldMapping['Callbacks']]) || 0,
            smsCount: parseInt(row[fieldMapping['SMS Count']]) || 0,
            cost: parseFloat(row[fieldMapping['Cost']]) || 0,
            complianceFee: parseFloat(row[fieldMapping['Compliance Fee']]) || 0,
            ttsFee: parseFloat(row[fieldMapping['TTS Fee']]) || 0,
            firstName: row[fieldMapping['First Name']] || '',
            lastName: row[fieldMapping['Last Name']] || '',
            company: row[fieldMapping['Company']] || '',
            email: row[fieldMapping['Email']] || '',
            recordId: originalRecordId,
            _dedupeKey: `${campaignId}_${phoneNumber}_${date}_${index}`
          };
        });
      }
      
      // Fallback for legacy object-based format
      const records = Array.isArray(parsed) ? parsed : [parsed];
      
      return records.map(record => ({
        campaignName: record.campaignName || record.campaign_name || '',
        campaignId: record.campaignId || record.campaign_id || '',
        phoneNumber: record.phoneNumber || record.phone_number || '',
        carrier: record.carrier || '',
        lineType: record.lineType || record.line_type || '',
        status: record.status || '',
        statusCode: record.statusCode || record.status_code || 0,
        statusReason: record.statusReason || record.status_reason || '',
        date: record.date || '',
        callbacks: parseInt(record.callbacks || 0),
        smsCount: parseInt(record.smsCount || record.sms_count || 0),
        cost: parseFloat(record.cost || 0),
        complianceFee: parseFloat(record.complianceFee || record.compliance_fee || 0),
        ttsFee: parseFloat(record.ttsFee || record.tts_fee || 0),
        firstName: record.firstName || record.first_name || '',
        lastName: record.lastName || record.last_name || '',
        company: record.company || '',
        email: record.email || '',
        recordId: record.recordId || record.record_id || ''
      }));
    } catch (error) {
      logger.error('Error parsing JSON:', error);
      throw new Error(`JSON parsing failed: ${error.message}`);
    }
  }

  async parseLocalFiles() {
    try {
      const files = await fs.readdir(this.localDataDir);
      const dataFiles = files.filter(file => file.endsWith('.json'));
      
      logger.debug(`📄 Parsing ${dataFiles.length} JSON files...`);
      
      const parsedData = [];
      const errorFiles = [];
      
      for (let i = 0; i < dataFiles.length; i++) {
        const file = dataFiles[i];
        const filePath = path.join(this.localDataDir, file);
        
        try {
          logger.debug(`   [${i + 1}/${dataFiles.length}] Parsing ${file}`);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          
          const records = this.parseJSON(fileContent);
          logger.debug(`      → ${records.length} records found`);
          
          // Group records by actual campaign name from data
          const campaignGroups = {};
          
          for (const record of records) {
            // logger.debug(`        - Record: Campaign="${record.campaignName}", Phone="${record.phoneNumber}", Date="${record.date}"`);
            const campaignName = record.campaignName || 'Unknown Campaign';
            const campaignId = record.campaignId || 'unknown';
            
            if (!campaignGroups[campaignId]) {
              campaignGroups[campaignId] = {
                campaignName,
                campaignId,
                filename: file,
                records: []
              };
            }
            
            campaignGroups[campaignId].records.push(record);
          }
          
          // Add each campaign group to parsedData
          for (const campaignId in campaignGroups) {
            const group = campaignGroups[campaignId];
            group.recordCount = group.records.length;
            parsedData.push(group);
          }
        } catch (fileError) {
          // Log error but continue processing other files
          logger.error(`      ❌ Error parsing ${file}:`, fileError.message);
          logger.error(`      Skipping corrupted file. It may need to be re-downloaded.`);
          errorFiles.push({
            filename: file,
            error: fileError.message
          });
          
          // Optionally delete corrupted file so it can be re-downloaded
          try {
            await fs.unlink(filePath);
            logger.debug(`      🗑️  Deleted corrupted file: ${file}`);
          } catch (deleteError) {
            logger.error(`      Failed to delete corrupted file: ${deleteError.message}`);
          }
        }
      }
      
      if (errorFiles.length > 0) {
        console.warn(`⚠️  ${errorFiles.length} file(s) had parsing errors and were deleted for re-download`);
      }
      
      logger.debug(`✅ Parsed ${parsedData.length} campaigns from ${dataFiles.length - errorFiles.length} valid files`);
      
      return parsedData;
    } catch (error) {
      logger.error('Error parsing local files:', error);
      throw error;
    }
  }
}

export default SftpService;
