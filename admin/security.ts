// Admin Security - Security monitoring and audit logs
import { ComponentBuilder } from "../components/ui/server-components";
import { AdminNavigation, type AdminUser } from "./admin-nav";

export class AdminSecurity {
  static async renderAuditLog(user: AdminUser): Promise<string> {
    const content = `
      ${AdminNavigation.renderBreadcrumb('/admin/security/audit')}
      
      ${ComponentBuilder.sectionHeader({
        title: 'Security Audit Log',
        description: 'Monitor system security events and user activities',
        actions: `
          <div class="flex gap-2">
            ${ComponentBuilder.secondaryButton({
              children: 'Export Log',
              onClick: 'exportAuditLog()',
              size: 'sm'
            })}
            ${ComponentBuilder.secondaryButton({
              children: 'Refresh',
              onClick: 'loadAuditLog()',
              size: 'sm'
            })}
          </div>
        `
      })}
      
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-sm text-[var(--muted-foreground)]">Today's Events</div>
          <div class="text-2xl font-bold text-[var(--foreground)]" id="today-events">-</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-sm text-[var(--muted-foreground)]">Failed Logins</div>
          <div class="text-2xl font-bold text-[var(--destructive)]" id="failed-logins">-</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-sm text-[var(--muted-foreground)]">Successful Logins</div>
          <div class="text-2xl font-bold text-[var(--success)]" id="success-logins">-</div>
        </div>
        <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
          <div class="text-sm text-[var(--muted-foreground)]">Rate Limited</div>
          <div class="text-2xl font-bold text-[var(--warning)]" id="rate-limited">-</div>
        </div>
      </div>
      
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden">
        <div class="p-6 border-b border-[var(--border)]">
          <h3 class="text-lg font-semibold">Audit Log Entries</h3>
          <p class="text-sm text-[var(--muted-foreground)] mt-1">Real-time security events and user activities</p>
        </div>
        
        <div id="audit-log-container">
          <div class="text-center py-12">
            <div class="animate-spin w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p class="text-[var(--muted-foreground)]">Loading audit log...</p>
          </div>
        </div>
      </div>
    `;

    return AdminNavigation.renderLayout(
      'Security Audit',
      'Security Monitoring & Audit Log',
      user,
      '/admin/security/audit',
      content
    );
  }

  static async renderSecuritySettings(user: AdminUser): Promise<string> {
    const content = `
      ${AdminNavigation.renderBreadcrumb('/admin/security/settings')}
      
      ${ComponentBuilder.sectionHeader({
        title: 'Security Settings',
        description: 'Configure system security policies and parameters'
      })}
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold mb-4">Password Policy</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm">Minimum Length</span>
              <span class="text-sm font-mono">12 characters</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Password History</span>
              <span class="text-sm font-mono">12 passwords</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Max Age</span>
              <span class="text-sm font-mono">90 days</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Complexity Required</span>
              <span class="text-sm font-mono text-[var(--success)]">Yes</span>
            </div>
          </div>
        </div>
        
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold mb-4">Session Security</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm">Session Timeout</span>
              <span class="text-sm font-mono">30 minutes</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Max Session Duration</span>
              <span class="text-sm font-mono">8 hours</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Secure Cookies</span>
              <span class="text-sm font-mono text-[var(--success)]">Enabled</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">HTTPS Required</span>
              <span class="text-sm font-mono text-[var(--success)]">Yes</span>
            </div>
          </div>
        </div>
        
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold mb-4">Rate Limiting</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm">Max Login Attempts</span>
              <span class="text-sm font-mono">5 attempts</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Lockout Duration</span>
              <span class="text-sm font-mono">15 minutes</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Status</span>
              <span class="text-sm font-mono text-[var(--success)]">Active</span>
            </div>
          </div>
        </div>
        
        <div class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h3 class="text-lg font-semibold mb-4">Security Headers</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm">HSTS</span>
              <span class="text-sm font-mono text-[var(--success)]">Enabled</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">CSP</span>
              <span class="text-sm font-mono text-[var(--success)]">Enabled</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">X-Frame-Options</span>
              <span class="text-sm font-mono text-[var(--success)]">DENY</span>
            </div>
          </div>
        </div>
      </div>
    `;

    return AdminNavigation.renderLayout(
      'Security Settings',
      'Security Configuration & Policies',
      user,
      '/admin/security/settings',
      content
    );
  }

  static getAuditLogScript(): string {
    return `
      document.addEventListener('DOMContentLoaded', function() {
        loadAuditLog();
        loadSecurityStats();
        
        // Auto-refresh every 30 seconds
        setInterval(loadAuditLog, 30000);
        setInterval(loadSecurityStats, 30000);
      });

      function loadSecurityStats() {
        const today = Math.floor(Date.now() / 1000) - 86400; // 24 hours ago
        
        fetch('/api/security/audit')
          .then(response => response.json())
          .then(logs => {
            const todayLogs = logs.filter(log => log.timestamp > today);
            const failedLogins = todayLogs.filter(log => log.action.includes('LOGIN_FAILED')).length;
            const successLogins = todayLogs.filter(log => log.action.includes('LOGIN_SUCCESS')).length;
            const rateLimited = todayLogs.filter(log => log.action.includes('RATE_LIMITED')).length;
            
            document.getElementById('today-events').textContent = todayLogs.length;
            document.getElementById('failed-logins').textContent = failedLogins;
            document.getElementById('success-logins').textContent = successLogins;
            document.getElementById('rate-limited').textContent = rateLimited;
          })
          .catch(error => {
            console.error('Error loading security stats:', error);
          });
      }

      function loadAuditLog() {
        fetch('/api/security/audit')
          .then(response => response.json())
          .then(logs => {
            displayAuditLog(logs);
          })
          .catch(error => {
            document.getElementById('audit-log-container').innerHTML = 
              '<div class="text-center py-8 text-[var(--destructive)]">Error loading audit log</div>';
          });
      }

      function displayAuditLog(logs) {
        const tableHtml = \`
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Time</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">User</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Action</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Description</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">IP Address</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--border)]">
                \${logs.map(log => {
                  const date = new Date(log.timestamp * 1000);
                  const statusClass = log.action.includes('SUCCESS') ? 'bg-green-100 text-green-800' :
                                     log.action.includes('FAILED') || log.action.includes('RATE_LIMITED') ? 'bg-red-100 text-red-800' :
                                     'bg-yellow-100 text-yellow-800';
                  const status = log.action.includes('SUCCESS') ? 'SUCCESS' :
                                log.action.includes('FAILED') ? 'FAILED' :
                                log.action.includes('RATE_LIMITED') ? 'BLOCKED' : 'INFO';
                  
                  return \`
                    <tr class="hover:bg-[var(--muted)]">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-mono">\${date.toLocaleString()}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">\${log.user_email || 'System'}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">\${log.action}</td>
                      <td class="px-6 py-4 text-sm text-[var(--muted-foreground)]">\${log.description}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-mono">\${log.ip_address || '-'}</td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium \${statusClass}">
                          \${status}
                        </span>
                      </td>
                    </tr>
                  \`;
                }).join('')}
              </tbody>
            </table>
          </div>
        \`;

        document.getElementById('audit-log-container').innerHTML = tableHtml;
      }

      function exportAuditLog() {
        fetch('/api/security/audit')
          .then(response => response.json())
          .then(logs => {
            const csv = [
              'Timestamp,User,Action,Description,IP Address,Status',
              ...logs.map(log => {
                const date = new Date(log.timestamp * 1000);
                const status = log.action.includes('SUCCESS') ? 'SUCCESS' :
                              log.action.includes('FAILED') ? 'FAILED' : 'INFO';
                return [
                  date.toISOString(),
                  log.user_email || 'System',
                  log.action,
                  log.description.replace(/,/g, ';'),
                  log.ip_address || '-',
                  status
                ].join(',');
              })
            ].join('\\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`audit-log-\${new Date().toISOString().split('T')[0]}.csv\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          })
          .catch(error => {
            alert('Error exporting audit log');
          });
      }
    `;
  }
}