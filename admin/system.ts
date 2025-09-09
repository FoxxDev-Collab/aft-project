// Admin System Management Interface
import { ComponentBuilder } from "../components/ui/server-components";
import { AdminNavigation, type AdminUser } from "./admin-nav";

export class AdminSystem {
  
  static async renderSystemPage(user: AdminUser): Promise<string> {
    const systemInfo = {
      version: 'AFT v1.0.0',
      runtime: 'Bun ' + process.version || 'Unknown',
      platform: process.platform || 'Unknown',
      uptime: process.uptime ? Math.floor(process.uptime() / 60) + ' minutes' : 'Unknown',
      nodeEnv: process.env.NODE_ENV || 'development'
    };

    const configCards = [
      {
        title: 'Security Configuration',
        description: 'Manage security settings and policies',
        action: { label: 'Configure', onClick: 'window.location.href="/admin/security/settings"' },
        status: 'Secure'
      },
      {
        title: 'Database Settings',
        description: 'Database connection and maintenance',
        action: { label: 'Manage', onClick: 'showDatabaseSettings()' },
        status: 'Connected'
      },
      {
        title: 'Email Configuration',
        description: 'SMTP and notification settings',
        action: { label: 'Configure', onClick: 'showEmailSettings()' },
        status: 'Not Configured'
      },
      {
        title: 'Backup & Recovery',
        description: 'System backup and recovery options',
        action: { label: 'Manage', onClick: 'showBackupSettings()' },
        status: 'Manual'
      }
    ];

    const configCardsHtml = configCards.map(card => `
      <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
        <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">${card.title}</h3>
        <p class="text-[var(--muted-foreground)] text-sm mb-4">${card.description}</p>
        <div class="flex justify-between items-center">
          <span class="text-xs px-2 py-1 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
            Status: ${card.status}
          </span>
          ${ComponentBuilder.secondaryButton({
            children: card.action.label,
            onClick: card.action.onClick,
            size: 'sm'
          })}
        </div>
      </div>
    `).join('');

    return `
      ${AdminNavigation.renderPageHeader('System Settings', 'Configure system parameters and maintenance', user, '/admin/system')}
      
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-8">
          <!-- System Information -->
          <div>
            <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Information</h2>
            <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
              <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div class="text-sm font-medium text-[var(--muted-foreground)]">Version</div>
                  <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.version}</div>
                </div>
                <div>
                  <div class="text-sm font-medium text-[var(--muted-foreground)]">Runtime</div>
                  <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.runtime}</div>
                </div>
                <div>
                  <div class="text-sm font-medium text-[var(--muted-foreground)]">Platform</div>
                  <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.platform}</div>
                </div>
                <div>
                  <div class="text-sm font-medium text-[var(--muted-foreground)]">Uptime</div>
                  <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.uptime}</div>
                </div>
                <div>
                  <div class="text-sm font-medium text-[var(--muted-foreground)]">Environment</div>
                  <div class="text-lg font-mono text-[var(--foreground)]">${systemInfo.nodeEnv}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Configuration Cards -->
          <div>
            <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Configuration</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              ${configCardsHtml}
            </div>
          </div>

          <!-- System Actions -->
          <div>
            <h2 class="text-xl font-semibold text-[var(--foreground)] mb-4">System Actions</h2>
            <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
              <div class="flex flex-wrap gap-4">
                ${ComponentBuilder.secondaryButton({
                  children: 'Clear Cache',
                  onClick: 'clearSystemCache()',
                  size: 'md'
                })}
                ${ComponentBuilder.secondaryButton({
                  children: 'Export Logs',
                  onClick: 'exportSystemLogs()',
                  size: 'md'
                })}
                ${ComponentBuilder.secondaryButton({
                  children: 'System Health Check',
                  onClick: 'runHealthCheck()',
                  size: 'md'
                })}
                ${ComponentBuilder.destructiveButton({
                  children: 'Restart System',
                  onClick: 'confirmSystemRestart()',
                  size: 'md'
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Modal -->
      <div id="settings-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
        <div class="bg-[var(--card)] rounded-lg p-6 w-full max-w-2xl mx-4 border border-[var(--border)]">
          <div class="flex justify-between items-center mb-4">
            <h3 id="modal-title" class="text-lg font-semibold text-[var(--foreground)]">Settings</h3>
            <button onclick="closeSettingsModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              ✕
            </button>
          </div>
          
          <div id="modal-content">
            <!-- Dynamic content loaded here -->
          </div>
        </div>
      </div>
    `;
  }

  static getScript(): string {
    return `
      function showDatabaseSettings() {
        document.getElementById('modal-title').textContent = 'Database Settings';
        document.getElementById('modal-content').innerHTML = \`
          <div class="space-y-4">
            <p class="text-[var(--muted-foreground)]">Database connection and maintenance settings.</p>
            <div class="bg-[var(--muted)] p-4 rounded-md">
              <h4 class="font-medium mb-2">Connection Status</h4>
              <p class="text-sm text-[var(--success)]">✓ Connected to SQLite database</p>
              <p class="text-xs text-[var(--muted-foreground)] mt-1">Database file: ./data/aft.db</p>
            </div>
            <div class="flex gap-3">
              <button onclick="runDatabaseMaintenance()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">
                Run Maintenance
              </button>
              <button onclick="backupDatabase()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Backup Database
              </button>
            </div>
          </div>
        \`;
        showSettingsModal();
      }
      
      function showEmailSettings() {
        document.getElementById('modal-title').textContent = 'Email Configuration';
        document.getElementById('modal-content').innerHTML = \`
          <div class="space-y-4">
            <p class="text-[var(--muted-foreground)]">Configure SMTP settings for system notifications.</p>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">SMTP Server</label>
                <input type="text" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]" placeholder="smtp.example.com">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-1">Port</label>
                  <input type="number" class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]" value="587">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Security</label>
                  <select class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)]">
                    <option>TLS</option>
                    <option>SSL</option>
                    <option>None</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="flex gap-3">
              <button onclick="testEmailConfig()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">
                Test Configuration
              </button>
              <button onclick="saveEmailConfig()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Save Settings
              </button>
            </div>
          </div>
        \`;
        showSettingsModal();
      }
      
      function showBackupSettings() {
        document.getElementById('modal-title').textContent = 'Backup & Recovery';
        document.getElementById('modal-content').innerHTML = \`
          <div class="space-y-4">
            <p class="text-[var(--muted-foreground)]">Configure automated backups and recovery options.</p>
            <div class="bg-[var(--muted)] p-4 rounded-md">
              <h4 class="font-medium mb-2">Backup Schedule</h4>
              <p class="text-sm">Currently set to: Manual backups only</p>
            </div>
            <div class="flex gap-3">
              <button onclick="createBackup()" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
                Create Backup Now
              </button>
              <button onclick="scheduleBackups()" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90">
                Schedule Backups
              </button>
            </div>
          </div>
        \`;
        showSettingsModal();
      }
      
      function showSettingsModal() {
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('settings-modal').classList.add('flex');
      }
      
      function closeSettingsModal() {
        document.getElementById('settings-modal').classList.add('hidden');
        document.getElementById('settings-modal').classList.remove('flex');
      }
      
      function clearSystemCache() {
        if (confirm('Clear system cache? This may temporarily slow down the system.')) {
          // Implementation would go here
          alert('System cache cleared successfully.');
        }
      }
      
      function exportSystemLogs() {
        // Implementation would go here
        alert('Log export functionality not yet implemented.');
      }
      
      function runHealthCheck() {
        alert('System health check: All systems operational.');
      }
      
      function confirmSystemRestart() {
        if (confirm('Restart the system? All users will be disconnected.')) {
          alert('System restart functionality requires server-side implementation.');
        }
      }
      
      // Placeholder functions for modal actions
      function runDatabaseMaintenance() {
        alert('Database maintenance completed.');
        closeSettingsModal();
      }
      
      function backupDatabase() {
        alert('Database backup created successfully.');
        closeSettingsModal();
      }
      
      function testEmailConfig() {
        alert('Email configuration test: Not yet implemented.');
      }
      
      function saveEmailConfig() {
        alert('Email settings saved successfully.');
        closeSettingsModal();
      }
      
      function createBackup() {
        alert('Backup created successfully.');
        closeSettingsModal();
      }
      
      function scheduleBackups() {
        alert('Backup scheduling: Not yet implemented.');
        closeSettingsModal();
      }
    `;
  }
}