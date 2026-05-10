const { execSync } = require('child_process');
const config = require('../config');

function getStorageStats() {
  try {
    const output = execSync(`df -B1 ${config.photoDir} 2>/dev/null || df -B1 /`).toString().trim();
    const lines = output.split('\n');
    const parts = lines[lines.length - 1].split(/\s+/);
    return {
      total_bytes: parseInt(parts[1]),
      available_bytes: parseInt(parts[3]),
    };
  } catch {
    return { total_bytes: 0, available_bytes: 0 };
  }
}

module.exports = { getStorageStats };
